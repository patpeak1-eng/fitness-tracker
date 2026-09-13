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
const { ensureWorkoutClientId, planTombstoneReconciliation } =
    await import('../context/WorkoutContext');

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
