/**
 * S32 Fix 1b — client-side deletion invariants.
 *
 * A live browser run covers the happy path but cannot deterministically hit
 * the schedules that actually lose data: a create already captured by flush,
 * a restored row with no identifier, a queued op resolving after a profile
 * switch. Those are here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vitest runs in node here (the other suites are pure functions), so provide
// the storage these modules read at import time. A stub beats pulling in jsdom
// for a key/value map.
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
if (!globalThis.crypto?.randomUUID) {
    globalThis.crypto = { ...(globalThis.crypto || {}), randomUUID: () => `uuid-${Math.random()}` };
}

const StorageService = (await import('./StorageService')).default;
const SyncQueue = (await import('./SyncQueue')).default;
const {
    ensureWorkoutClientId, planTombstoneReconciliation, chooseDeletionTarget,
    mapServerWorkout, deletionOpFor, wasDeletedOnServer,
} = await import('../context/WorkoutContext');

const UID_A = 'user_aaa';
const UID_B = 'user_bbb';

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('ensureWorkoutClientId', () => {
    it('stamps an identifier on a legacy row that has none', () => {
        const stamped = ensureWorkoutClientId({ id: 'local-1', name: 'Legacy' });
        expect(stamped.client_id).toBeTruthy();
        expect(stamped.id).toBe('local-1');
    });

    it('leaves an existing identifier alone, and returns the same object', () => {
        const row = { id: 'local-1', client_id: 'cid-1' };
        expect(ensureWorkoutClientId(row)).toBe(row);
    });

    it('gives different rows different identifiers', () => {
        const a = ensureWorkoutClientId({ id: '1' });
        const b = ensureWorkoutClientId({ id: '2' });
        expect(a.client_id).not.toBe(b.client_id);
    });

    it('gives a restored row an identity so its own future re-uploads collide', () => {
        // Scope, stated honestly: this makes THIS device's later uploads of
        // the same row recognisable. It cannot retroactively match a server
        // row that was itself stored with client_id = NULL — a freshly minted
        // id will not collide with that. Production had zero such rows.
        const restored = { id: 'restored-1', name: 'From Backup' };
        const stamped = ensureWorkoutClientId(restored);
        expect(stamped.client_id).toBeTruthy();
        expect(ensureWorkoutClientId(stamped)).toBe(stamped);   // stable thereafter
    });
});

describe('chooseDeletionTarget', () => {
    it('uses the client id when the row has one', () => {
        expect(chooseDeletionTarget({ id: 'l1', client_id: 'cid-1', backendId: 'srv-1' }))
            .toEqual({ clientId: 'cid-1', backendId: null });
    });

    it('uses the SERVER id for an uploaded row that predates client ids', () => {
        // Minting one here would record the deletion against an identifier
        // nothing refers to: the server row carries client_id NULL, so the
        // placeholder could never collide with it and the row would survive.
        expect(chooseDeletionTarget({ id: 'l1', backendId: 'srv-1' }))
            .toEqual({ clientId: null, backendId: 'srv-1' });
    });

    it('mints a client id for a row that was never uploaded', () => {
        const { clientId, backendId } = chooseDeletionTarget({ id: 'l1' });
        expect(clientId).toBeTruthy();
        expect(backendId).toBeNull();
    });

    it('always returns exactly one identifier', () => {
        for (const row of [{ id: 'a', client_id: 'c' }, { id: 'b', backendId: 's' }, { id: 'c' }]) {
            const { clientId, backendId } = chooseDeletionTarget(row);
            expect(Boolean(clientId) !== Boolean(backendId)).toBe(true);
        }
    });
});

describe('a PULLED row can actually be deleted (regression, found in review)', () => {
    // These chain the REAL functions the app uses. Hand-building a row here
    // instead of running the real mapper is what let the original bug through:
    // the mapper dropped backendId, so a pulled legacy row looked exactly like
    // a never-uploaded local one and deletion minted an id naming nothing.
    const SERVER_ROW_LEGACY = { id: 'srv-legacy', client_id: null, name: 'Old', start_time: 'T' };
    const SERVER_ROW_MODERN = { id: 'srv-modern', client_id: 'cid-modern', name: 'New', start_time: 'T' };

    it('the mapper records that the row came from the server', () => {
        expect(mapServerWorkout(SERVER_ROW_LEGACY).backendId).toBe('srv-legacy');
    });

    it('deleting a pulled LEGACY row targets its server id, not a minted one', () => {
        const local = mapServerWorkout(SERVER_ROW_LEGACY);
        expect(chooseDeletionTarget(local)).toEqual({ clientId: null, backendId: 'srv-legacy' });
    });

    it('deleting a pulled MODERN row targets its client id', () => {
        const local = mapServerWorkout(SERVER_ROW_MODERN);
        expect(chooseDeletionTarget(local)).toEqual({ clientId: 'cid-modern', backendId: null });
    });

    it('reissue never sends a locally minted id for a row the server says has none', () => {
        // The tombstone carries a minted clientId from an older client. The
        // server row positively reports client_id NULL, so that minted id
        // names nothing — sending it would repeat a no-op delete for ever.
        const op = deletionOpFor(SERVER_ROW_LEGACY, UID_A);
        expect(op.payload).toEqual({ backendId: 'srv-legacy' });
        expect(op.key).toBe('srv-legacy');
    });

    it('reissue prefers the server-reported client id when there is one', () => {
        const op = deletionOpFor(SERVER_ROW_MODERN, UID_A);
        expect(op.payload).toEqual({ client_id: 'cid-modern' });
    });

    it('the tombstone for a pulled legacy row matches it again on the next pull', () => {
        const local = mapServerWorkout(SERVER_ROW_LEGACY);
        const { backendId } = chooseDeletionTarget(local);
        const tombstone = { id: local.backendId || local.id, clientId: null };
        expect(backendId).toBe(tombstone.id);

        const { reissue, retire } = planTombstoneReconciliation(
            [SERVER_ROW_LEGACY], [tombstone], () => false,
        );
        expect(reissue).toHaveLength(1);
        expect(retire).toHaveLength(0);
        expect(deletionOpFor(reissue[0].serverRow, UID_A).payload).toEqual({ backendId: 'srv-legacy' });
    });
});

describe('the backfill must not resurrect what another device deleted', () => {
    // Codex found this one: device A deletes a legacy row; device B still holds
    // its pulled copy, has no tombstone for it, and the backfill re-uploads
    // anything local-and-absent. For a legacy row the upload carries no
    // identifier, so it lands as a BRAND-NEW workout no deletion can catch.
    it('treats a pulled row missing from the cloud as deleted on the server', () => {
        const pulled = mapServerWorkout({ id: 'srv-1', client_id: null, name: 'Old' });
        expect(wasDeletedOnServer(pulled)).toBe(true);
    });

    it('leaves a never-uploaded local row alone', () => {
        // No backendId means no evidence either way, and guessing here is the
        // absence-as-proof mistake the redesign exists to remove.
        expect(wasDeletedOnServer({ id: 'local-1', client_id: 'cid-1' })).toBe(false);
        expect(wasDeletedOnServer({ id: 'local-2' })).toBe(false);
    });

    it('is safe on junk input', () => {
        expect(wasDeletedOnServer(null)).toBe(false);
        expect(wasDeletedOnServer(undefined)).toBe(false);
    });
});

describe('deletion tombstones', () => {
    it('records and matches on either identifier', () => {
        StorageService.addDeletedWorkout(UID_A, { id: 'srv-1', clientId: 'cid-1' });
        const [entry] = StorageService.loadDeletedWorkouts(UID_A);
        expect(entry.id).toBe('srv-1');
        expect(entry.clientId).toBe('cid-1');
    });

    it('does not duplicate an entry for the same workout', () => {
        StorageService.addDeletedWorkout(UID_A, { id: 'srv-1', clientId: 'cid-1' });
        StorageService.addDeletedWorkout(UID_A, { id: 'srv-1', clientId: 'cid-1' });
        StorageService.addDeletedWorkout(UID_A, { id: null, clientId: 'cid-1' });
        expect(StorageService.loadDeletedWorkouts(UID_A)).toHaveLength(1);
    });

    it('keeps profiles separate', () => {
        StorageService.addDeletedWorkout(UID_A, { id: 'srv-1', clientId: 'cid-1' });
        expect(StorageService.loadDeletedWorkouts(UID_B)).toEqual([]);
    });

    it('never evicts an unconfirmed deletion, however many there are', () => {
        // Evicting the oldest would silently let that workout come back —
        // the exact bug the store exists to prevent.
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        for (let i = 0; i < 250; i++) {
            StorageService.addDeletedWorkout(UID_A, { id: `srv-${i}`, clientId: `cid-${i}` });
        }
        const entries = StorageService.loadDeletedWorkouts(UID_A);
        expect(entries).toHaveLength(250);
        expect(entries[0].id).toBe('srv-0');   // the oldest is still guarded
    });

    it('retires only the entry it is told to', () => {
        StorageService.addDeletedWorkout(UID_A, { id: 'srv-1', clientId: 'cid-1' });
        StorageService.addDeletedWorkout(UID_A, { id: 'srv-2', clientId: 'cid-2' });
        StorageService.removeDeletedWorkout(UID_A, { id: 'srv-1', clientId: 'cid-1' });
        const left = StorageService.loadDeletedWorkouts(UID_A);
        expect(left).toHaveLength(1);
        expect(left[0].id).toBe('srv-2');
    });
});

describe('a 404 from the by-client-id route is retryable, not fatal', () => {
    // The frontend and backend deploy from the same push but land
    // independently, so a call to a brand-new route can 404 purely because the
    // backend has not rolled over. Dead-lettering that would discard the
    // deletion for good, and the next pull would bring the workout back.
    // SyncQueue writes dead letters straight to localStorage under this key.
    const deadLetters = () =>
        JSON.parse(localStorage.getItem('fitness_sync_deadletter') || '[]');
    const failWith = (status, retryable) => {
        const err = new Error(`HTTP ${status}`);
        err.status = status;
        if (retryable) err.retryable = true;
        return err;
    };

    it('keeps the op queued when the error is marked retryable', async () => {
        SyncQueue.enqueue({ type: 'workout_delete', key: 'cid-1', payload: { client_id: 'cid-1' }, uid: UID_A });
        SyncQueue.registerExecutor('workout_delete', async () => { throw failWith(404, true); });

        await SyncQueue.flush();

        expect(SyncQueue.hasPending('workout_delete', 'cid-1')).toBe(true);
        // Read the REAL dead-letter store. This previously asserted
        // getState().deadLetterCount, which SyncQueue does not expose, so the
        // check passed no matter what happened.
        expect(deadLetters()).toEqual([]);
    });

    it('still dead-letters an ordinary 4xx, so the escape hatch is narrow', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        SyncQueue.enqueue({ type: 'workout_delete', key: 'cid-2', payload: { client_id: 'cid-2' }, uid: UID_A });
        SyncQueue.registerExecutor('workout_delete', async () => { throw failWith(400, false); });

        await SyncQueue.flush();

        expect(SyncQueue.hasPending('workout_delete', 'cid-2')).toBe(false);
        expect(deadLetters().map(d => d.key)).toContain('cid-2');
    });
});

describe('SyncQueue.remove / hasPending', () => {
    beforeEach(() => {
        SyncQueue.enqueue({ type: 'workout', key: 'cid-1', payload: { client_id: 'cid-1' }, uid: UID_A });
        SyncQueue.enqueue({ type: 'workout', key: 'cid-2', payload: { client_id: 'cid-2' }, uid: UID_A });
    });

    it('cancels a create that has not been sent', () => {
        expect(SyncQueue.hasPending('workout', 'cid-1')).toBe(true);
        expect(SyncQueue.remove('workout', 'cid-1')).toBe(1);
        expect(SyncQueue.hasPending('workout', 'cid-1')).toBe(false);
        expect(SyncQueue.hasPending('workout', 'cid-2')).toBe(true);
    });

    it('is a no-op when there is nothing queued', () => {
        expect(SyncQueue.remove('workout', 'nope')).toBe(0);
        expect(SyncQueue.getState().pendingCount).toBe(2);
    });

    it('does not touch a different op type with the same key', () => {
        SyncQueue.enqueue({ type: 'workout_delete', key: 'cid-1', payload: {}, uid: UID_A });
        SyncQueue.remove('workout', 'cid-1');
        expect(SyncQueue.hasPending('workout_delete', 'cid-1')).toBe(true);
    });

    it('cannot cancel a create already captured by a running flush, and says so', async () => {
        // flush() snapshots the queue then executes it, so a delete arriving
        // mid-flight cannot recall the create. Asserting the executor STILL
        // RAN is the point — an earlier version of this test ended with
        // expect(true).toBe(true), which would have passed even if nothing
        // ran at all.
        const ran = [];
        let release;
        const gate = new Promise(r => { release = r; });
        SyncQueue.registerExecutor('workout', async (op) => {
            ran.push(op.key);
            await gate;
        });

        const flushing = SyncQueue.flush();
        await Promise.resolve();                 // let flush capture its snapshot
        SyncQueue.remove('workout', 'cid-1');    // user deletes mid-flight

        // While captured, the create's outcome is UNKNOWN. This is the signal
        // that stops a pull from retiring the tombstone on an absent row.
        expect(SyncQueue.hasPending('workout', 'cid-1')).toBe(true);

        release();
        await flushing;

        expect(ran).toContain('cid-1');          // cancellation was too late
        expect(SyncQueue.hasPending('workout', 'cid-1')).toBe(false);   // settled
    });

    it('reports an in-flight op as pending even after remove() clears storage', async () => {
        // The exact interleaving that resurrected workouts: create in flight,
        // delete finds no server row, pull finds no server row. Without this
        // signal the guard retires and the create commits behind it.
        let release;
        const gate = new Promise(r => { release = r; });
        SyncQueue.registerExecutor('workout', async () => { await gate; });

        const flushing = SyncQueue.flush();
        await Promise.resolve();
        SyncQueue.remove('workout', 'cid-2');

        expect(SyncQueue.hasPending('workout', 'cid-2')).toBe(true);
        release();
        await flushing;
        expect(SyncQueue.hasPending('workout', 'cid-2')).toBe(false);
    });
});

describe('planTombstoneReconciliation — what a pull proves', () => {
    const NONE = () => false;
    const ALL = () => true;

    it('retires a deletion the server has honoured and nothing is outstanding', () => {
        const { retire, reissue } = planTombstoneReconciliation(
            [{ id: 'srv-other', client_id: 'cid-other' }],
            [{ id: 'srv-1', clientId: 'cid-1' }],
            NONE,
        );
        expect(retire).toHaveLength(1);
        expect(reissue).toHaveLength(0);
    });

    it('does NOT retire while an upload is still outstanding', () => {
        // The schedule that resurrected workouts: create captured by a running
        // flush, delete finds nothing, pull finds nothing. Retiring here lets
        // the create commit behind the guard.
        const { retire } = planTombstoneReconciliation(
            [],
            [{ id: 'srv-1', clientId: 'cid-1' }],
            (key) => key === 'cid-1',
        );
        expect(retire).toHaveLength(0);
    });

    it('re-issues the delete when the row is still on the server', () => {
        const { retire, reissue } = planTombstoneReconciliation(
            [{ id: 'srv-1', client_id: 'cid-1' }],
            [{ id: 'srv-1', clientId: 'cid-1' }],
            NONE,
        );
        expect(retire).toHaveLength(0);
        expect(reissue).toHaveLength(1);
        expect(reissue[0].serverRow.id).toBe('srv-1');
    });

    it('re-issues even while outstanding — presence beats uncertainty', () => {
        const { reissue } = planTombstoneReconciliation(
            [{ id: 'srv-1', client_id: 'cid-1' }],
            [{ id: 'srv-1', clientId: 'cid-1' }],
            ALL,
        );
        expect(reissue).toHaveLength(1);
    });

    it('matches a legacy row by server id when it has no client_id', () => {
        const { reissue } = planTombstoneReconciliation(
            [{ id: 'srv-legacy', client_id: null }],
            [{ id: 'srv-legacy', clientId: null }],
            NONE,
        );
        expect(reissue).toHaveLength(1);
    });

    it('matches a local tombstone to its server row by client_id alone', () => {
        // The real shape: a locally-created workout has a LOCAL id, the server
        // row has a different one, and only client_id links them. Indexing by
        // id alone would miss this and wrongly retire the guard.
        const { retire, reissue } = planTombstoneReconciliation(
            [{ id: 'srv-999', client_id: 'cid-1' }],
            [{ id: 'local-1', clientId: 'cid-1' }],
            NONE,
        );
        expect(reissue).toHaveLength(1);
        expect(reissue[0].serverRow.id).toBe('srv-999');
        expect(retire).toHaveLength(0);
    });

    it('does not let a client_id collide with another row’s server id', () => {
        // client_id is client-generated, so it can be any string — including
        // one that happens to equal a different workout's server UUID. Matching
        // the two namespaces separately keeps them from crossing.
        const { retire, reissue } = planTombstoneReconciliation(
            [{ id: 'collide', client_id: 'cid-other' }],
            [{ id: 'srv-1', clientId: 'collide' }],
            NONE,
        );
        expect(reissue).toHaveLength(0);
        expect(retire).toHaveLength(1);
    });

    it('partitions a mixed set of tombstones correctly', () => {
        const { retire, reissue } = planTombstoneReconciliation(
            [{ id: 'srv-present', client_id: 'cid-present' }],
            [
                { id: 'srv-present', clientId: 'cid-present' },   // still there
                { id: 'srv-gone', clientId: 'cid-gone' },         // settled
                { id: 'srv-busy', clientId: 'cid-busy' },         // outstanding
            ],
            (key) => key === 'cid-busy',
        );
        expect(reissue.map(r => r.tombstone.clientId)).toEqual(['cid-present']);
        expect(retire.map(t => t.clientId)).toEqual(['cid-gone']);
    });

    it('handles an empty pull and no tombstones without inventing work', () => {
        const { retire, reissue } = planTombstoneReconciliation([], [], NONE);
        expect(retire).toEqual([]);
        expect(reissue).toEqual([]);
    });
});

describe('ensureWorkoutClientId covers every upload path', () => {
    it('stamps a restored active workout that finished without an identifier', () => {
        // finishWorkout spreads ensureWorkoutClientId(activeWorkout), so a
        // session restored from an old backup gains one before any upload.
        const restoredActive = { id: 'act-1', name: 'Restored Session', exercises: [] };
        const completed = { ...ensureWorkoutClientId(restoredActive), status: 'completed' };
        expect(completed.client_id).toBeTruthy();
        expect(completed.status).toBe('completed');
    });
});
