/**
 * SyncQueue — the acknowledgement contract every op type depends on.
 *
 * Written BEFORE S32 Fix 3b step 2 changes `flush()`'s removal to a
 * conditional acknowledgement. That change touches the queue for ALL eleven op
 * types (workout, weight, assessment, profile_settings, template,
 * template_update, exercise, food_log, food_log_update, food_log_delete,
 * workout_delete), none of which carries a revision today.
 *
 * So these characterise the behaviour that must NOT change, using a
 * revision-less `profile_settings` op — plan-review correction E asked for
 * exactly this, on both the success and the dead-letter path, rather than
 * testing only the feature being added. They must pass before the change and
 * after it. If step 2 breaks one of these, it has broken settings sync, or
 * weights, or the food log, for a bug that only ever affected the active
 * workout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vitest runs these in node, so provide the storage the module reads at import.
const memoryStorage = () => {
    let store = new Map();
    return {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: k => { store.delete(k); },
        clear: () => { store = new Map(); },
        key: i => [...store.keys()][i] ?? null,
        get length() { return store.size; },
    };
};
globalThis.localStorage = memoryStorage();

const SyncQueue = (await import('./SyncQueue')).default;

const QUEUE_KEY = 'fitness_sync_queue';
const DEADLETTER_KEY = 'fitness_sync_deadletter';

const queue = () => JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
const deadLetters = () => JSON.parse(localStorage.getItem(DEADLETTER_KEY) || '[]');

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

const settingsOp = (payload = { theme: 'dark' }) => ({
    type: 'profile_settings', key: 'settings', payload, uid: 'user-1',
});

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    SyncQueue.clearAuthExpired();
});

describe('a revision-less op keeps exactly the behaviour it has today', () => {
    it('is removed from the queue when its executor succeeds', async () => {
        const exec = vi.fn(async () => undefined);
        SyncQueue.registerExecutor('profile_settings', exec);
        SyncQueue.enqueue(settingsOp());
        expect(queue()).toHaveLength(1);

        await SyncQueue.flush();

        expect(exec).toHaveBeenCalledTimes(1);
        expect(queue(), 'a successful revision-less op must still be removed')
            .toHaveLength(0);
    });

    it('is dead-lettered and removed on a non-auth 4xx', async () => {
        // The payload itself is rejected, so retrying cannot succeed. It is
        // parked rather than discarded, and loudly.
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        SyncQueue.registerExecutor('profile_settings', async () => { throw httpError(400); });
        SyncQueue.enqueue(settingsOp());

        await SyncQueue.flush();

        expect(queue(), 'a rejected revision-less op must still be removed').toHaveLength(0);
        expect(deadLetters(), 'it must be parked, not discarded').toHaveLength(1);
        expect(deadLetters()[0].type).toBe('profile_settings');
    });

    it('is KEPT on a 401, with every other op, and raises the re-login flag', async () => {
        SyncQueue.registerExecutor('profile_settings', async () => { throw httpError(401); });
        SyncQueue.enqueue(settingsOp());

        await SyncQueue.flush();

        expect(queue(), 'an expired session must not lose the op').toHaveLength(1);
        expect(SyncQueue.isAuthExpired?.() ?? true).toBeTruthy();
    });

    it('is KEPT and its attempts bumped on a 5xx', async () => {
        SyncQueue.registerExecutor('profile_settings', async () => { throw httpError(503); });
        SyncQueue.enqueue(settingsOp());

        await SyncQueue.flush();

        expect(queue()).toHaveLength(1);
        expect(queue()[0].attempts, 'a transient failure must count as an attempt').toBe(1);
    });

    it('is KEPT on an explicitly retryable 4xx rather than dead-lettered', async () => {
        // Set by ApiService for the deletion route's rolling-deploy 404. This
        // branch must survive step 2 untouched.
        SyncQueue.registerExecutor('profile_settings', async () => {
            throw Object.assign(httpError(404), { retryable: true });
        });
        SyncQueue.enqueue(settingsOp());

        await SyncQueue.flush();

        expect(queue(), 'a retryable 4xx must not be dead-lettered').toHaveLength(1);
        expect(deadLetters()).toHaveLength(0);
    });

    it('leaves an op alone when its type has no executor registered yet', async () => {
        // Executors register during boot; a flush before that must not discard.
        SyncQueue.enqueue({ type: 'not_registered_yet', key: 'k', payload: {}, uid: 'user-1' });

        await SyncQueue.flush();

        expect(queue()).toHaveLength(1);
    });
});

describe('enqueue dedupe, the behaviour step 2 has to work around', () => {
    it('replaces an existing op with the same (type, key)', () => {
        SyncQueue.enqueue(settingsOp({ theme: 'dark' }));
        SyncQueue.enqueue(settingsOp({ theme: 'light' }));

        expect(queue()).toHaveLength(1);
        expect(queue()[0].payload.theme).toBe('light');
    });

    it('gives the replacement the SAME id as the op it replaced', () => {
        // The root of the acknowledgement bug: `id` is `${type}:${key}`, so
        // `flush()`'s "remove exactly this op" cannot distinguish a completed
        // op from the newer one that took its place. Pinned here because step 2
        // is built on top of this fact rather than changing it — if ids ever
        // become unique, the conditional acknowledgement needs revisiting.
        SyncQueue.enqueue(settingsOp({ theme: 'dark' }));
        const first = queue()[0].id;
        SyncQueue.enqueue(settingsOp({ theme: 'light' }));

        expect(queue()[0].id).toBe(first);
    });
});

describe('conditional acknowledgement for ops that carry an identity', () => {
    // The bug: `id` is `${type}:${key}`, so a replacement shares it. Removing
    // "exactly this op" after success removed the REPLACEMENT, which had never
    // been sent — the server kept the older state and the newer edit was lost.
    const identified = (revision, seq, payload) => ({
        type: 'active_workout', key: 'active_workout:user-1',
        payload, uid: 'user-1', revision, seq,
    });

    it('does NOT remove a replacement that arrived while the request was out', async () => {
        SyncQueue.enqueue(identified('rev-A', 6, { name: 'A' }));

        // The executor stands in for the request being in flight: the user
        // edits, so revision B replaces A under the same id.
        SyncQueue.registerExecutor('active_workout', async () => {
            SyncQueue.enqueue(identified('rev-B', 7, { name: 'B' }));
        });

        await SyncQueue.flush();

        expect(queue(), 'the newer desired state was deleted without being sent')
            .toHaveLength(1);
        expect(queue()[0].revision).toBe('rev-B');
        expect(queue()[0].payload.name).toBe('B');
    });

    it('removes the op when the queue still holds that same revision', async () => {
        SyncQueue.enqueue(identified('rev-A', 6, { name: 'A' }));
        SyncQueue.registerExecutor('active_workout', async () => undefined);

        await SyncQueue.flush();

        expect(queue(), 'an unreplaced op must still be acknowledged').toHaveLength(0);
    });

    it('does not let a dead-lettered revision take its replacement with it', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        SyncQueue.enqueue(identified('rev-A', 6, { name: 'A' }));
        SyncQueue.registerExecutor('active_workout', async () => {
            SyncQueue.enqueue(identified('rev-B', 7, { name: 'B' }));
            throw httpError(400);
        });

        await SyncQueue.flush();

        expect(deadLetters(), 'the rejected revision must still be parked').toHaveLength(1);
        expect(queue(), 'the replacement must survive the dead-letter').toHaveLength(1);
        expect(queue()[0].revision).toBe('rev-B');
    });

    it('a seq difference alone is enough to withhold acknowledgement', async () => {
        // Same desired content re-dispatched at a higher sequence after a 409
        // rebase. The identity is the pair, not the revision alone.
        SyncQueue.enqueue(identified('rev-A', 6, { name: 'A' }));
        SyncQueue.registerExecutor('active_workout', async () => {
            SyncQueue.enqueue(identified('rev-A', 9, { name: 'A' }));
        });

        await SyncQueue.flush();

        expect(queue()).toHaveLength(1);
        expect(queue()[0].seq).toBe(9);
    });

    it('a REVISION-LESS op is still removed even when replaced mid-flight', async () => {
        // The behaviour that must not change. Settings dedupe by replacement
        // and have always acknowledged unconditionally; making them
        // conditional would leave a settings op queued for ever.
        SyncQueue.enqueue(settingsOp({ theme: 'dark' }));
        SyncQueue.registerExecutor('profile_settings', async () => {
            SyncQueue.enqueue(settingsOp({ theme: 'light' }));
        });

        await SyncQueue.flush();

        expect(queue(), 'revision-less acknowledgement must stay unconditional')
            .toHaveLength(0);
    });
});

describe('the unconditional default is decided by the DISPATCHED op', () => {
    it('a revision-less op is acknowledged even if its replacement carries one', async () => {
        // This is what makes the `identified` check load-bearing rather than
        // decorative. Every other revision-less case compares null to null and
        // matches whichever way the flag goes — so those tests pass even if the
        // conditional is applied to everything, which would strand settings,
        // weights and food-log ops in the queue for ever.
        //
        // Correction E is explicit that acknowledgement is unconditional when
        // both identity fields are absent ON THE DISPATCHED OP. A replacement
        // that happens to carry an identity must not change that.
        SyncQueue.enqueue(settingsOp({ theme: 'dark' }));
        SyncQueue.registerExecutor('profile_settings', async () => {
            SyncQueue.enqueue({ ...settingsOp({ theme: 'light' }), revision: 'rev-X', seq: 3 });
        });

        await SyncQueue.flush();

        expect(queue(), 'a revision-less dispatch must acknowledge unconditionally')
            .toHaveLength(0);
    });
});
