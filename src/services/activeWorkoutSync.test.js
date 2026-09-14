/**
 * S32 Fix 3b — the desired-state rules for the active-workout slot.
 *
 * The server fences by sequence (3a): a write applies only when its client_seq
 * is strictly higher than the stored one. These functions decide what this
 * device wants the slot to be and at what sequence it asks, so getting them
 * wrong means either losing the user's in-progress workout or resurrecting one
 * they finished.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const {
    activeSyncKey, nextClientSeq, planActiveSync, isPushableActiveWorkout,
} = await import('../context/WorkoutContext');

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('activeSyncKey', () => {
    it('is injective per profile', () => {
        // SyncQueue dedupes on (type, key) and its id is `${type}:${key}` —
        // uid is in NEITHER. A constant key would let one profile's active
        // workout replace another's on the same browser.
        expect(activeSyncKey('user-1')).not.toBe(activeSyncKey('user-2'));
    });
});

describe('nextClientSeq', () => {
    it('starts at 1 when this profile has never synced', () => {
        expect(nextClientSeq(null)).toBe(1);
        expect(nextClientSeq({})).toBe(1);
    });

    it('rises above what this device last sent', () => {
        expect(nextClientSeq({ clientSeq: 4, lastServerSeq: 0 })).toBe(5);
    });

    it('rises above what the SERVER last reported, not just our own counter', () => {
        // The rebase case: another device pushed us to 9. Asking at 5 again
        // would 409 for ever.
        expect(nextClientSeq({ clientSeq: 4, lastServerSeq: 9 })).toBe(10);
    });

    it('is never lowered by a smaller server value', () => {
        expect(nextClientSeq({ clientSeq: 12, lastServerSeq: 3 })).toBe(13);
    });
});

describe('planActiveSync', () => {
    it('treats a CLEAR as a first-class desired state, not an absence', () => {
        // The whole reason this record exists apart from the active-workout
        // key: clearing REMOVES that key, so without a durable "I cleared it"
        // the next pull brings the finished workout back.
        const plan = planActiveSync({ clientSeq: 3, lastServerSeq: 3 }, null, 'rev-1');
        expect(plan.desiredWorkout).toBeNull();
        expect(plan.desiredRevision).toBe('rev-1');
        expect(plan.status).toBe('pending');
    });

    it('carries the learned sequences forward', () => {
        const plan = planActiveSync({ clientSeq: 6, lastServerSeq: 9 }, { id: 'w' }, 'rev-2');
        expect(plan.clientSeq).toBe(6);
        expect(plan.lastServerSeq).toBe(9);
    });

    it('starts from zero when there is no prior record', () => {
        const plan = planActiveSync(null, { id: 'w' }, 'rev-3');
        expect(plan.clientSeq).toBe(0);
        expect(plan.lastServerSeq).toBe(0);
        expect(nextClientSeq(plan)).toBe(1);
    });
});

describe('isPushableActiveWorkout', () => {
    it('rejects the empty preparing workout startWorkout creates', () => {
        // Created the moment the user opens the screen. Pushing it would
        // occupy another device's slot with nothing in it.
        expect(isPushableActiveWorkout({ id: 'w', status: 'preparing', exercises: [] })).toBe(false);
    });

    it('accepts one that has an exercise', () => {
        expect(isPushableActiveWorkout({ id: 'w', exercises: [{ id: 'squat' }] })).toBe(true);
    });

    it('rejects null', () => {
        expect(isPushableActiveWorkout(null)).toBe(false);
    });
});

describe('saveActiveSync reports whether the record actually landed', () => {
    it('returns false when storage refuses the write', () => {
        // Callers MUST check this. Clearing the local active workout after a
        // failed record write loses the clear entirely — the defect class that
        // has now appeared three times (saveHistory, dropOwned, and here).
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        expect(StorageService.saveActiveSync('user-1', { desiredWorkout: null })).toBe(false);
    });

    it('round-trips the record when it succeeds', () => {
        const record = planActiveSync(null, { id: 'w' }, 'rev-1');
        expect(StorageService.saveActiveSync('user-1', record)).toBe(true);
        expect(StorageService.loadActiveSync('user-1')).toEqual(record);
    });

    it('keeps records separate per profile', () => {
        StorageService.saveActiveSync('user-1', planActiveSync(null, { id: 'a' }, 'rev-a'));
        StorageService.saveActiveSync('user-2', planActiveSync(null, { id: 'b' }, 'rev-b'));

        expect(StorageService.loadActiveSync('user-1').desiredWorkout.id).toBe('a');
        expect(StorageService.loadActiveSync('user-2').desiredWorkout.id).toBe('b');
    });
});
