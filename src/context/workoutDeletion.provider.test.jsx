// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000" }
/**
 * S32 Fix 1b — deletion through the REAL provider.
 *
 * Why this file exists, stated plainly: every other deletion test passed while
 * `deleteWorkout` did nothing at all. Review proved it by stubbing the handler
 * body — all 54 helper tests stayed green. Testing `chooseDeletionTarget` and
 * `mapServerWorkout` in isolation only shows the helpers agree with the
 * assumptions of the test that calls them; it never shows the button is wired
 * to them.
 *
 * So these mount `WorkoutProvider`, take `deleteWorkout` off the context the UI
 * consumes, and call it. Removing the call from the provider must fail these.
 *
 * No @testing-library/react — react-dom/client plus React.act is enough, and a
 * new dependency for one file is not worth the supply-chain surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useContext } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not hand us a usable localStorage here: Node's own experimental
// global shadows it ("--localstorage-file was not provided"). It is a key/value
// map, so a shim costs nothing in fidelity — everything under test (the
// provider, StorageService, SyncQueue) is still the real thing.
const memoryStorage = () => {
    let s = new Map();
    return {
        getItem: k => (s.has(k) ? s.get(k) : null),
        setItem: (k, v) => { s.set(k, String(v)); },
        removeItem: k => { s.delete(k); },
        clear: () => { s = new Map(); },
        key: i => [...s.keys()][i] ?? null,
        get length() { return s.size; },
    };
};
globalThis.localStorage = memoryStorage();
if (typeof window !== 'undefined') window.localStorage = globalThis.localStorage;
if (!globalThis.crypto?.randomUUID) {
    globalThis.crypto = {
        ...(globalThis.crypto || {}),
        randomUUID: () => `uuid-${Math.random().toString(16).slice(2)}`,
    };
}

// ApiService is the trust boundary; everything below it is real code.
//
// Derive the mock from the real module's exports rather than listing them.
// A hand-written list silently goes stale as ApiService grows, and the
// resulting "no export is defined on the mock" failure looks like a bug in the
// code under test. Every call answers with a promise so `.catch(...)` chains
// behave; the tests then set the specific results they care about.
vi.mock('../services/ApiService', async (importOriginal) => {
    const actual = await importOriginal();
    const mocked = {};
    for (const name of Object.keys(actual)) {
        mocked[name] = vi.fn(async () => undefined);
    }
    mocked.isAvailable = vi.fn(() => true);
    return mocked;
});

const ApiService = await import('../services/ApiService');
const StorageService = (await import('../services/StorageService')).default;
const SyncQueue = (await import('../services/SyncQueue')).default;
const { WorkoutContext, WorkoutProvider } = await import('./WorkoutContext');

const USER = { id: 'user-1', name: 'Tester', email: 'tester@example.com' };

const serverRow = (over = {}) => ({
    id: 'srv-1',
    client_id: 'cid-1',
    name: 'Push Day',
    start_time: '2026-09-01T10:00:00.000Z',
    end_time: '2026-09-01T11:00:00.000Z',
    status: 'completed',
    exercises: [],
    recommendations: [],
    ...over,
});

const emptyPulls = () => {
    ApiService.isAvailable.mockReturnValue(true);
    ApiService.getMe.mockResolvedValue(USER);
    ApiService.getProfile.mockResolvedValue({ user: USER, stats: {} });
    ApiService.getWeightHistory.mockResolvedValue([]);
    ApiService.getCustomTemplates.mockResolvedValue([]);
    ApiService.getCustomExercises.mockResolvedValue([]);
    ApiService.getAssessments.mockResolvedValue([]);
    ApiService.getFoodLog.mockResolvedValue([]);
    ApiService.getHistory.mockResolvedValue({ total: 0, items: [] });
    ApiService.deleteWorkoutByClientId.mockResolvedValue(undefined);
    ApiService.deleteWorkout.mockResolvedValue(undefined);
    ApiService.getActiveWorkout.mockResolvedValue(null);
    ApiService.saveActiveWorkout.mockResolvedValue({});
    ApiService.clearActiveWorkout.mockResolvedValue(undefined);
};

// The provider hands `deleteWorkout` to the UI through context; take it from
// exactly there, so a change that stops exporting it fails these tests too.
let ctx = null;
const Probe = () => {
    ctx = useContext(WorkoutContext);
    return null;
};

let container, root;

const mount = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const timerApiRef = { current: {} };
    await act(async () => {
        root = createRoot(container);
        root.render(
            <WorkoutProvider timerApiRef={timerApiRef}>
                <Probe />
            </WorkoutProvider>
        );
    });
    // Let the mount-time auth check and profile pull settle.
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};

const unmount = async () => {
    if (root) await act(async () => { root.unmount(); });
    container?.remove();
    root = null;
    ctx = null;
};

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    emptyPulls();
});

afterEach(async () => {
    await unmount();
});

const pendingDeletes = () =>
    JSON.parse(localStorage.getItem('fitness_sync_queue') || '[]')
        .filter(o => o.type === 'workout_delete');

describe('deleteWorkout, through the provider the UI actually uses', () => {
    it('mounts with a syncable cloud profile and the pulled workout visible', async () => {
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        await mount();

        expect(ctx, 'provider did not publish a context value').toBeTruthy();
        expect(typeof ctx.deleteWorkout).toBe('function');
        expect(ctx.history.map(w => w.id)).toContain('srv-1');
    });

    it('calls the by-client-id endpoint for a workout that has a client id', async () => {
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        await mount();

        await act(async () => { ctx.deleteWorkout('srv-1'); });

        expect(ApiService.deleteWorkoutByClientId).toHaveBeenCalledWith('cid-1');
        expect(ApiService.deleteWorkout).not.toHaveBeenCalled();
    });

    it('removes it from the history the UI renders', async () => {
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        await mount();

        await act(async () => { ctx.deleteWorkout('srv-1'); });

        expect(ctx.history.map(w => w.id)).not.toContain('srv-1');
    });

    it('uses the SERVER id for a pulled legacy row with no client id', async () => {
        // The whole point of mapServerWorkout stamping backendId. Minting an id
        // here would name nothing, and the real row would live on.
        ApiService.getHistory.mockResolvedValue({
            total: 1, items: [serverRow({ client_id: null })],
        });
        await mount();

        await act(async () => { ctx.deleteWorkout('srv-1'); });

        expect(ApiService.deleteWorkout).toHaveBeenCalledWith('srv-1');
        expect(ApiService.deleteWorkoutByClientId).not.toHaveBeenCalled();
    });

    it('records a durable intent BEFORE the request, and clears it on success', async () => {
        // The failure this guards: a delete that only exists in flight. If the
        // request is still outstanding there must already be something on disk.
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        let release;
        ApiService.deleteWorkoutByClientId.mockReturnValue(
            new Promise(r => { release = r; })
        );
        await mount();

        await act(async () => { ctx.deleteWorkout('srv-1'); });

        expect(pendingDeletes().map(o => o.key)).toEqual(['cid-1']);

        await act(async () => { release(); await Promise.resolve(); });
        expect(pendingDeletes()).toEqual([]);
    });

    it('keeps the intent queued when the request fails, and survives a remount', async () => {
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        ApiService.deleteWorkoutByClientId.mockRejectedValue(
            Object.assign(new Error('offline'), { status: undefined })
        );
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await mount();

        await act(async () => { ctx.deleteWorkout('srv-1'); });
        expect(pendingDeletes().map(o => o.key)).toEqual(['cid-1']);

        // Restart. The server never heard about this deletion, so the intent
        // has to outlive the process or the workout comes back.
        await unmount();
        expect(pendingDeletes().map(o => o.key)).toEqual(['cid-1']);

        ApiService.deleteWorkoutByClientId.mockResolvedValue(undefined);
        ApiService.getHistory.mockResolvedValue({ total: 0, items: [] });
        await mount();
        await act(async () => { await SyncQueue.flush(); });

        expect(ApiService.deleteWorkoutByClientId).toHaveBeenCalledWith('cid-1');
        expect(pendingDeletes()).toEqual([]);
    });

    it('writes a tombstone scoped to the profile', async () => {
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        await mount();

        await act(async () => { ctx.deleteWorkout('srv-1'); });

        const tombstones = StorageService.loadDeletedWorkouts(USER.id);
        expect(tombstones.map(t => t.clientId)).toContain('cid-1');
    });
});

describe('the three P1s review left open', () => {
    it('P1-A: a row cached by the OLD mapper gains server provenance on the next pull', async () => {
        // The merge filters already-known rows by fingerprint BEFORE mapping, so
        // a row cached before mapServerWorkout existed keeps backendId
        // undefined for ever. The backfill then reads it as never-uploaded and
        // re-uploads it — cross-device resurrection with no race involved.
        const cached = {
            id: 'srv-1', client_id: null, name: 'Push Day',
            startTime: '2026-09-01T10:00:00.000Z', endTime: '2026-09-01T11:00:00.000Z',
            status: 'completed', completed: true, notes: '', exercises: [], recommendations: [],
        };                                    // note: no backendId
        StorageService.saveHistory(USER.id, [cached]);
        ApiService.getHistory.mockResolvedValue({
            total: 1, items: [serverRow({ client_id: null })],
        });

        await mount();

        const row = ctx.history.find(w => w.id === 'srv-1');
        expect(row, 'the cached row vanished').toBeTruthy();
        expect(row.backendId, 'pull did not adopt server provenance').toBe('srv-1');
    });

    it('P1-A: and deleting it then targets the server row, not a minted id', async () => {
        const cached = {
            id: 'srv-1', client_id: null, name: 'Push Day',
            startTime: '2026-09-01T10:00:00.000Z', endTime: '2026-09-01T11:00:00.000Z',
            status: 'completed', completed: true, notes: '', exercises: [], recommendations: [],
        };
        StorageService.saveHistory(USER.id, [cached]);
        ApiService.getHistory.mockResolvedValue({
            total: 1, items: [serverRow({ client_id: null })],
        });
        await mount();

        await act(async () => { ctx.deleteWorkout('srv-1'); });

        expect(ApiService.deleteWorkout).toHaveBeenCalledWith('srv-1');
        expect(ApiService.deleteWorkoutByClientId).not.toHaveBeenCalled();
    });

    it('P1-B: a minted identifier is persisted to stored history before the intent', async () => {
        // Otherwise a crash after the enqueue leaves a surviving history row
        // that does not carry the id the deletion was recorded against, and the
        // backfill mints a DIFFERENT one whose upload cannot collide with it.
        //
        // Two things are needed to reach the mint at all, and getting them
        // wrong the first time made this test pass vacuously:
        //   - the pull must FAIL, or the login backfill stamps the row itself;
        //   - the request must HANG, or it succeeds and clears the very queue
        //     entry the test is trying to inspect.
        const local = {
            id: 'local-1', name: 'Legacy Session',
            startTime: '2026-09-02T10:00:00.000Z', endTime: '2026-09-02T11:00:00.000Z',
            status: 'completed', completed: true, notes: '', exercises: [], recommendations: [],
        };                                    // no client_id, no backendId
        StorageService.saveHistory(USER.id, [local]);
        ApiService.getHistory.mockRejectedValue(new Error('offline'));
        ApiService.deleteWorkoutByClientId.mockReturnValue(new Promise(() => {}));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await mount();

        expect(ctx.history.find(w => w.id === 'local-1')?.client_id,
            'precondition: the row must still be unidentified here').toBeFalsy();

        const saved = vi.spyOn(StorageService, 'saveHistory');
        await act(async () => { ctx.deleteWorkout('local-1'); });

        const op = JSON.parse(localStorage.getItem('fitness_sync_queue') || '[]')
            .find(o => o.type === 'workout_delete');
        const mintedId = op?.payload?.client_id;
        expect(mintedId, 'no deletion intent was queued at all').toBeTruthy();

        const stampedWrite = saved.mock.calls.find(([, rows]) =>
            (rows || []).some(w => w.id === 'local-1' && w.client_id === mintedId)
        );
        expect(stampedWrite,
            'the minted id was never written to stored history, so a crash here ' +
            'leaves the surviving row unable to collide with its own deletion'
        ).toBeTruthy();
    });

    it('P1-C: a deletion is not completed locally when the intent cannot be stored', async () => {
        // SyncQueue swallows localStorage failures, so deleteWorkout could
        // remove the row and report success with nothing durable recorded.
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        let release;
        ApiService.deleteWorkoutByClientId.mockReturnValue(new Promise(r => { release = r; }));
        await mount();

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const realSet = localStorage.setItem.bind(localStorage);
        vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
            if (k === 'fitness_sync_queue') throw new Error('QuotaExceededError');
            return realSet(k, v);
        });

        await act(async () => { ctx.deleteWorkout('srv-1'); });

        expect(pendingDeletes(), 'precondition: the queue write really did fail').toEqual([]);
        expect(ctx.history.map(w => w.id),
            'the row was removed although no durable intent was recorded'
        ).toContain('srv-1');

        // Once the request actually succeeds the deletion is real, so the row
        // may go — the outcome is known at that point rather than assumed.
        await act(async () => { release(); await Promise.resolve(); });
        expect(ctx.history.map(w => w.id)).not.toContain('srv-1');
    });
});

// Pulls are driven by the effect on `currentProfile`, so a new profile OBJECT
// starts a real one — the same path the app takes when getMe refreshes the
// profile. `refreshProfileData` is NOT on the context: an earlier version of
// the stale-pull test called `ctx.refreshProfileData?.(...)`, and the optional
// chaining turned the whole test into a no-op that asserted nothing.
const startPull = async (n) => {
    await act(async () => { ctx.updateProfile({ name: `Tester ${n}` }); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};

describe('overlapping pulls', () => {
    it('a pull carrying a deleted row cannot re-add it while the guard stands', async () => {
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        await mount();
        await act(async () => { ctx.deleteWorkout('srv-1'); });
        expect(ctx.history.map(w => w.id)).not.toContain('srv-1');

        // A pull that still reports the row. The tombstone keeps it out.
        await startPull(1);

        expect(ctx.history.map(w => w.id)).not.toContain('srv-1');
    });

    it('a pull that started BEFORE the delete cannot re-add the row when it lands late', async () => {
        // P1 starts holding a live row and stalls. The user deletes; the server
        // agrees. P2 returns empty and retires the guard. P1 then resolves,
        // still carrying the row, and re-adds it to state and storage.
        // latestProfileIdRef guards profile identity, not request ORDER.
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        await mount();
        expect(ctx.history.map(w => w.id)).toContain('srv-1');

        // P1: in flight, will answer with the row still present.
        let landP1;
        ApiService.getHistory.mockReturnValue(new Promise(r => { landP1 = r; }));
        await startPull(1);

        // The delete happens while P1 is outstanding, and succeeds.
        await act(async () => { ctx.deleteWorkout('srv-1'); });
        expect(ApiService.deleteWorkoutByClientId).toHaveBeenCalledWith('cid-1');

        // P2: newer, authoritative, sees the row gone and retires the guard.
        ApiService.getHistory.mockResolvedValue({ total: 0, items: [] });
        await startPull(2);
        expect(StorageService.loadDeletedWorkouts(USER.id),
            'precondition: P2 should have retired the tombstone').toEqual([]);

        // P1 finally lands, carrying the workout the user deleted.
        await act(async () => {
            landP1({ total: 1, items: [serverRow()] });
            await new Promise(r => setTimeout(r, 0));
        });

        expect(ctx.history.map(w => w.id),
            'a stale pull resurrected the workout in the UI'
        ).not.toContain('srv-1');
        const stored = StorageService.loadProfileState(USER.id).history || [];
        expect(stored.map(w => w.id),
            'a stale pull resurrected the workout on disk'
        ).not.toContain('srv-1');
    });

    it('the newest pull still applies normally', async () => {
        // Guard against "fixing" ordering by ignoring results altogether.
        ApiService.getHistory.mockResolvedValue({ total: 0, items: [] });
        await mount();

        ApiService.getHistory.mockResolvedValue({
            total: 1,
            items: [serverRow({ id: 'srv-new', client_id: 'cid-new', name: 'Leg Day' })],
        });
        await startPull(1);

        expect(ctx.history.map(w => w.id)).toContain('srv-new');
    });
});
