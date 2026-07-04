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

const executors = {};   // type -> async (op) => void
const listeners = new Set();
let authExpired = false; // in-memory only: re-derived on each flush attempt
let flushing = false;
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
        try {
            for (const op of ops) {
                const exec = executors[op.type];
                if (!exec) continue; // keep — executor registers later in boot

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
                        // retrying forever can't succeed. Drop it, loudly.
                        console.warn(`[SyncQueue] dropping rejected op ${op.id}:`, err);
                        persistQueue(loadQueue().filter(o => o.id !== op.id));
                    } else {
                        // Network / 5xx / 429: keep for the next flush.
                        const kept = loadQueue().map(o =>
                            o.id === op.id ? { ...o, attempts: (o.attempts || 0) + 1 } : o
                        );
                        persistQueue(kept);
                    }
                }
            }
        } finally {
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
