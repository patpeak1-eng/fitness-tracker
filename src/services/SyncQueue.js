// Persistent retry queue for failed cloud pushes.
//
// Any push that fails (network drop, server error) is enqueued here instead of
// being lost to a console.warn. The queue lives in localStorage, survives
// reloads, and is replayed when the app comes back online, returns to the
// foreground, or boots. A 401 during replay means the token/cookie expired:
// flushing stops and `authExpired` is raised so the UI can prompt a re-login
// (replaying would just 401 again for every op).
//
// Executors are registered at runtime (from WorkoutContext, which has access
// to ApiService + StorageService) so this module stays dependency-free and
// can't form import cycles. Ops whose type has no registered executor are
// skipped and kept for a later flush.

const QUEUE_KEY = 'fitness_sync_queue';
// Ops the server rejected with a non-auth 4xx. Retrying can't succeed, but
// discarding a finished workout outright is permanent data loss — park the
// payload here instead so it stays recoverable. Never replayed automatically.
const DEADLETTER_KEY = 'fitness_sync_deadletter';
const DEADLETTER_MAX = 20; // oldest dropped beyond this — bounded growth

const safeParse = (raw, fallback) => {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const loadQueue = () => safeParse(localStorage.getItem(QUEUE_KEY), []);
const persistQueue = (ops) => {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
    } catch (e) {
        console.warn('[SyncQueue] could not persist queue (quota?):', e);
    }
};

const deadLetter = (op, err) => {
    const list = safeParse(localStorage.getItem(DEADLETTER_KEY), []);
    list.push({
        ...op,
        deadLetteredAt: new Date().toISOString(),
        error: String(err?.message || err)
    });
    while (list.length > DEADLETTER_MAX) list.shift();
    try {
        localStorage.setItem(DEADLETTER_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('[SyncQueue] could not persist dead-letter (quota?):', e);
    }
};

const executors = {};   // type -> async (op) => void
const listeners = new Set();
let authExpired = false; // in-memory only: re-derived on each flush attempt
let flushing = false;
// Op ids captured by the running flush. Not persisted: a reload means nothing
// is in flight any more. See hasPending — an in-flight create's outcome is
// unknown, and treating that as "never uploaded" resurrects deleted rows.
const inFlightIds = new Set();
let initialized = false;

const notify = () => {
    const state = SyncQueue.getState();
    listeners.forEach(l => {
        try { l(state); } catch { /* listener errors must not break the queue */ }
    });
};

const SyncQueue = {
    registerExecutor(type, fn) {
        executors[type] = fn;
    },

    // Enqueue a failed push. Ops carry a dedupe key: re-enqueueing the same
    // (type, key) replaces the older payload, so the queue holds only the
    // latest value per item (settings) and never holds the same workout /
    // template / weight entry twice even if two push paths both failed.
    enqueue({ type, key, payload, uid = null }) {
        const ops = loadQueue().filter(op => !(op.type === type && op.key === key));
        ops.push({
            id: `${type}:${key}`,
            type,
            key,
            payload,
            uid,
            attempts: 0
        });
        persistQueue(ops);
        notify();
    },

    // Drop a queued op that is no longer wanted. Deleting a workout whose
    // upload is still pending must CANCEL that upload — otherwise the create
    // flushes later, the server row appears, and the next pull resurrects the
    // workout the user deleted.
    remove(type, key) {
        const id = `${type}:${key}`;
        const before = loadQueue();
        const after = before.filter(op => op.id !== id);
        if (after.length !== before.length) {
            persistQueue(after);
            notify();
        }
        return before.length - after.length;
    },

    // Is there an op for this type/key whose outcome is not yet known —
    // either still queued, or captured by a running flush and in flight?
    //
    // A server lookup cannot distinguish "never uploaded" from "upload sent,
    // result unknown", and treating the second as the first is how a deleted
    // workout comes back: the delete finds nothing, a pull finds nothing, the
    // guard is retired, and then the create commits.
    hasPending(type, key) {
        const id = `${type}:${key}`;
        return inFlightIds.has(id) || loadQueue().some(op => op.id === id);
    },

    getState() {
        return { pendingCount: loadQueue().length, authExpired };
    },

    subscribe(listener) {
        listeners.add(listener);
        listener(SyncQueue.getState());
        return () => listeners.delete(listener);
    },

    clearAuthExpired() {
        authExpired = false;
        notify();
    },

    async flush() {
        if (flushing) return;
        const ops = loadQueue();
        if (ops.length === 0) return;

        flushing = true;
        // Ops captured by this snapshot are no longer cancellable via
        // remove(), but their outcome is still unknown. Track them so callers
        // can tell "not queued" from "queued, sent, result unknown" — an
        // absent server row is NOT confirmation while a create is in flight.
        ops.forEach(op => inFlightIds.add(op.id));
        try {
            for (const op of ops) {
                const exec = executors[op.type];
                if (!exec) { inFlightIds.delete(op.id); continue; } // registers later in boot

                try {
                    await exec(op);
                    // Success: remove exactly this op (queue may have gained
                    // new ops while we were awaiting).
                    persistQueue(loadQueue().filter(o => o.id !== op.id));
                    if (authExpired) {
                        authExpired = false; // a push succeeded — auth is back
                    }
                } catch (err) {
                    if (err?.status === 401) {
                        // Token/cookie expired — every remaining op would 401
                        // too. Keep them all and surface the re-login prompt.
                        authExpired = true;
                        break;
                    }
                    if (err?.status >= 400 && err.status < 500 && err.status !== 429) {
                        // Non-auth 4xx: the payload itself is rejected —
                        // retrying forever can't succeed. Park it in the
                        // dead-letter store instead of discarding, loudly.
                        console.warn(`[SyncQueue] dead-lettering rejected op ${op.id}:`, err);
                        deadLetter(op, err);
                        persistQueue(loadQueue().filter(o => o.id !== op.id));
                    } else {
                        // Network / 5xx / 429: keep for the next flush.
                        const kept = loadQueue().map(o =>
                            o.id === op.id ? { ...o, attempts: (o.attempts || 0) + 1 } : o
                        );
                        persistQueue(kept);
                    }
                } finally {
                    // Outcome known (applied, dead-lettered, or kept for
                    // retry): no longer ambiguous.
                    inFlightIds.delete(op.id);
                }
            }
        } finally {
            ops.forEach(op => inFlightIds.delete(op.id));   // 401 break, etc.
            flushing = false;
            notify();
        }
    },

    // Install flush triggers once per app boot.
    init() {
        if (initialized) return;
        initialized = true;
        window.addEventListener('online', () => SyncQueue.flush());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') SyncQueue.flush();
        });
        SyncQueue.flush(); // replay anything left over from the last session
    }
};

export default SyncQueue;
