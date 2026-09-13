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

const topApiService = await import('../services/ApiService');
const ApiService = topApiService;
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

const emptyPulls = (ApiService = topApiService) => {
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
    // restoreAllMocks, not clearAllMocks: clear keeps spy IMPLEMENTATIONS, so a
    // localStorage.setItem spy that throws leaks into every later test.
    vi.restoreAllMocks();
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

    it('an unidentified UUID row is deleted locally and names nothing remotely', async () => {
        // Two heuristics have been tried and removed here, both destructive.
        // Minting a client id created a placeholder naming nothing, so the
        // placeholder delete succeeded while the real row stayed live. Then
        // treating the UUID local id AS the server id was false at the root:
        // generateId already returned crypto.randomUUID() before 8b88b49, the
        // commit that first recorded client_id/backendId at all. So this row's
        // id L is unrelated to its server row's id S — DELETE /L 404s, the
        // client reads 404 as success, and S returns on the next pull.
        //
        // The contract now: no identifier, no remote claim.
        const LOCAL_UUID = '11111111-2222-3333-4444-555555555555';
        StorageService.saveHistory(USER.id, [{
            id: LOCAL_UUID, name: 'Legacy Session',
            startTime: '2026-09-02T10:00:00.000Z', status: 'completed',
            completed: true, notes: '', exercises: [], recommendations: [],
        }]);
        await mount();

        await act(async () => { ctx.deleteWorkout(LOCAL_UUID); });

        expect(ApiService.deleteWorkout,
            'a UUID local id is not a server id; deleting by it targets nothing ' +
            'and its 404 is misread as success'
        ).not.toHaveBeenCalled();
        expect(ApiService.deleteWorkoutByClientId,
            'minted a client id for a row the server has never named'
        ).not.toHaveBeenCalled();
        expect(ctx.history.map(w => w.id)).not.toContain(LOCAL_UUID);
    });

    it('does not call the server for a pre-UUID local row', async () => {
        StorageService.saveHistory(USER.id, [{
            id: 'lx8f2a9q1z', name: 'Ancient Local',
            startTime: '2026-09-02T10:00:00.000Z', status: 'completed',
            completed: true, notes: '', exercises: [], recommendations: [],
        }]);
        await mount();

        await act(async () => { ctx.deleteWorkout('lx8f2a9q1z'); });

        expect(ApiService.deleteWorkout).not.toHaveBeenCalled();
        expect(ApiService.deleteWorkoutByClientId).not.toHaveBeenCalled();
        expect(ctx.history.map(w => w.id)).not.toContain('lx8f2a9q1z');
    });

    it('a legacy queued upload adopts the identity the server stamped, and is then deletable', async () => {
        // Review round 5. The executor discarded the response, so a legacy row
        // that uploaded successfully stayed identifierless FOREVER: the ids
        // differ so matchFor cannot join it to the server row, the new-item
        // fingerprint filter hides that row while this one exists, and every
        // later Delete took the local-only branch and reported success while
        // the cloud row lived on. Not a race — the ordinary successful path.
        const L = 'lx8f2a9q1z';
        const S = '11111111-2222-3333-4444-555555555555';
        StorageService.saveHistory(USER.id, [{
            id: L, name: 'Ancient Local',
            startTime: '2026-09-02T10:00:00.000Z', status: 'completed',
            completed: true, notes: '', exercises: [], recommendations: [],
        }]);
        // The server stamps client_id = its own id for an identifierless upload.
        ApiService.saveWorkout.mockResolvedValue({ id: S, client_id: S });
        SyncQueue.enqueue({ type: 'workout', key: L, payload: { id: L }, uid: USER.id });

        await mount();
        await act(async () => { await SyncQueue.flush(); });

        const row = ctx.history.find(w => w.id === L);
        expect(row?.client_id, 'the stamped identity was discarded').toBe(S);
        expect(row?.backendId).toBe(S);

        // The point of adopting it: the workout can now actually be deleted.
        await act(async () => { ctx.deleteWorkout(L); });
        expect(ApiService.deleteWorkoutByClientId).toHaveBeenCalledWith(S);
    });

    it('adopting an identity does not drop a workout finished while the request was open', async () => {
        // The write-back used to assign the STORAGE SNAPSHOT read before the
        // request resolved. Anything added in between was replaced by stale
        // data — the whole visible list, not just the adopted row. It is now a
        // functional update re-planned against current state.
        const L = 'lx8f2a9q1z';
        const S = '11111111-2222-3333-4444-555555555555';
        StorageService.saveHistory(USER.id, [{
            id: L, name: 'Ancient Local',
            startTime: '2026-09-02T10:00:00.000Z', status: 'completed',
            completed: true, notes: '', exercises: [], recommendations: [],
        }]);
        let release;
        ApiService.saveWorkout.mockReturnValue(new Promise(r => { release = r; }));
        SyncQueue.enqueue({ type: 'workout', key: L, payload: { id: L }, uid: USER.id });

        await mount();
        // Held OUTSIDE act: an act scope left open across the rest of the
        // test wedges later mounts.
        const flushing = SyncQueue.flush();

        // Make storage diverge from React while the request is open. Assigning
        // the snapshot would import this unrelated row into the visible list;
        // a functional update adopts the identity and nothing else.
        StorageService.saveHistory(USER.id, [
            ...StorageService.loadProfileState(USER.id).history,
            { id: 'unrelated-1', client_id: 'cid-unrelated', name: 'Not Ours' },
        ]);

        release({ id: S, client_id: S });
        await act(async () => { await flushing; });

        expect(ctx.history.find(w => w.id === L)?.client_id,
            'the identity was not adopted at all'
        ).toBe(S);
        expect(ctx.history.map(w => w.id),
            'assigned a stale storage snapshot over React state instead of ' +
            'adopting the identity within it'
        ).not.toContain('unrelated-1');
    });

    it('LIMITATION: deleting during a captured legacy upload still resurrects it', async () => {
        // Deliberately pins a KNOWN, ACCEPTED limitation so it cannot be
        // silently relabelled as fixed. Review round 6 caught the docs claiming
        // only the lost-response interval was unresolved; this case has a
        // perfectly normal response and still resurrects.
        //
        // Sequence: flush captures the legacy upload, so cancellation cannot
        // reach it. Delete removes the row locally — it has no identifier, so
        // there is nothing to tell the server. The response then arrives, and
        // adoption correctly fail-closes because no local row remains (it must
        // NOT resurrect the row the user just deleted). Nothing holds a
        // deletion intent for the stamped id, so the next pull brings it back.
        //
        // Closing this needs a stable key in the request BEFORE its first send.
        // It cannot be done from the response path. If that is ever built, this
        // test should fail — and that failure is the signal to rewrite it, not
        // to delete it.
        const L = 'lx8f2a9q1z';
        const S = '11111111-2222-3333-4444-555555555555';
        StorageService.saveHistory(USER.id, [{
            id: L, name: 'Ancient Local',
            startTime: '2026-09-02T10:00:00.000Z', status: 'completed',
            completed: true, notes: '', exercises: [], recommendations: [],
        }]);
        let release;
        ApiService.saveWorkout.mockReturnValue(new Promise(r => { release = r; }));
        SyncQueue.enqueue({ type: 'workout', key: L, payload: { id: L }, uid: USER.id });

        await mount();
        // Held OUTSIDE act: an act scope left open across the rest of the
        // test wedges later mounts.
        const flushing = SyncQueue.flush();

        await act(async () => { ctx.deleteWorkout(L); });
        expect(ctx.history.map(w => w.id)).not.toContain(L);

        release({ id: S, client_id: S });
        await act(async () => { await flushing; });

        expect(ApiService.deleteWorkoutByClientId,
            'if this now fires, the limitation is CLOSED — update the docs and ' +
            'rewrite this test rather than deleting it'
        ).not.toHaveBeenCalled();
    });

    it('a stamped identity is never adopted onto an ambiguous duplicate', async () => {
        // Imported storage can duplicate an id. Choosing one would stamp
        // identity onto the wrong workout, and the next delete would remove
        // that one instead. Zero-or-many must do nothing.
        const L = 'lx8f2a9q1z';
        const S = '11111111-2222-3333-4444-555555555555';
        const row = () => ({
            id: L, name: 'Ancient Local',
            startTime: '2026-09-02T10:00:00.000Z', status: 'completed',
            completed: true, notes: '', exercises: [], recommendations: [],
        });
        StorageService.saveHistory(USER.id, [row(), row()]);
        ApiService.saveWorkout.mockResolvedValue({ id: S, client_id: S });
        SyncQueue.enqueue({ type: 'workout', key: L, payload: { id: L }, uid: USER.id });

        await mount();
        await act(async () => { await SyncQueue.flush(); });

        expect(ctx.history.filter(w => w.client_id === S),
            'guessed which of two identical rows the upload meant'
        ).toHaveLength(0);
    });

    it('cancels a queued upload for an unidentified row before returning', async () => {
        // The cancellation used to sit BELOW the local-only return, so it never
        // ran for exactly the rows that need it most: a pre-redesign client
        // could queue a create with no client_id in its payload, the server
        // inserts it with client_id NULL (colliding with nothing), and no
        // later deletion can name it. Cancelling while it is still cancellable
        // is the only fence available for that row.
        const ID = 'lx8f2a9q1z';
        StorageService.saveHistory(USER.id, [{
            id: ID, name: 'Ancient Local',
            startTime: '2026-09-02T10:00:00.000Z', status: 'completed',
            completed: true, notes: '', exercises: [], recommendations: [],
        }]);
        await mount();
        SyncQueue.enqueue({ type: 'workout', key: ID, payload: { id: ID }, uid: USER.id });
        expect(SyncQueue.hasPending('workout', ID),
            'precondition: the upload must be queued before the delete'
        ).toBe(true);

        await act(async () => { ctx.deleteWorkout(ID); });

        expect(SyncQueue.hasPending('workout', ID),
            'the queued upload survived the delete and will resurrect the workout'
        ).toBe(false);
    });

    it('keeps a local-only row visible when its history write fails', async () => {
        // dropOwned discarded saveHistory's boolean, so a full quota removed
        // the row from React state with nothing written to disk — the user saw
        // a successful delete that reload silently undid.
        const ID = 'lx8f2a9q1z';
        StorageService.saveHistory(USER.id, [{
            id: ID, name: 'Ancient Local',
            startTime: '2026-09-02T10:00:00.000Z', status: 'completed',
            completed: true, notes: '', exercises: [], recommendations: [],
        }]);
        await mount();
        expect(ctx.history.map(w => w.id),
            'precondition: the row must be on screen before the write is broken'
        ).toContain(ID);

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const realSet = localStorage.setItem.bind(localStorage);
        vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
            if (k.includes('history')) throw new Error('QuotaExceededError');
            return realSet(k, v);
        });

        await act(async () => { ctx.deleteWorkout(ID); });

        expect(ctx.history.map(w => w.id),
            'reported a deletion that was never written to disk'
        ).toContain(ID);
    });

    it('R3-1: a lone same-name/time server row must not lend its identity', async () => {
        // The narrower fingerprint case. Cached A has no identifiers. A was
        // deleted elsewhere, so the pull returns only B — a DIFFERENT workout
        // that happens to share A's name and start time. One candidate, so
        // nothing looks ambiguous, and A adopted B's client_id. Deleting A then
        // deleted B.
        const NAME = 'Push Day';
        const START = '2026-09-01T10:00:00.000Z';
        StorageService.saveHistory(USER.id, [{
            id: '99999999-8888-7777-6666-555555555555', name: NAME,
            startTime: START, endTime: '2026-09-01T11:00:00.000Z',
            status: 'completed', completed: true, notes: '',
            exercises: [], recommendations: [],
        }]);
        ApiService.getHistory.mockResolvedValue({
            total: 1,
            items: [serverRow({ id: 'srv-B', client_id: 'cid-B', name: NAME, start_time: START })],
        });
        await mount();

        const a = ctx.history.find(w => w.id === '99999999-8888-7777-6666-555555555555');
        expect(a, 'the cached row vanished').toBeTruthy();
        expect(a.client_id, 'adopted an unrelated workout client id').toBeFalsy();
        expect(a.backendId, 'adopted an unrelated workout server id').toBeFalsy();

        await act(async () => { ctx.deleteWorkout('99999999-8888-7777-6666-555555555555'); });

        expect(ApiService.deleteWorkoutByClientId,
            'deleting the cached row issued a delete for a different workout'
        ).not.toHaveBeenCalledWith('cid-B');
        // And it must not fall back to deleting by its own id either: that id
        // is local, so the request would target nothing while B stays live.
        expect(ApiService.deleteWorkout).not.toHaveBeenCalled();
        expect(ApiService.deleteWorkoutByClientId).not.toHaveBeenCalled();
    });

    it('R3-1: a positive id match still enriches', async () => {
        // Replaces the mislabelled "unambiguous fingerprint still enriches",
        // which used the same id on both sides and so never reached the
        // fallback it claimed to cover. This is the real legitimate path: the
        // local id IS the server id, matched positively, not by content.
        StorageService.saveHistory(USER.id, [{
            id: 'srv-A', name: 'Push Day', startTime: '2026-09-01T10:00:00.000Z',
            status: 'completed', completed: true, notes: '',
            exercises: [], recommendations: [],
        }]);
        ApiService.getHistory.mockResolvedValue({
            total: 1, items: [serverRow({ id: 'srv-A', client_id: 'cid-A' })],
        });
        await mount();

        const row = ctx.history.find(w => w.id === 'srv-A');
        expect(row.backendId).toBe('srv-A');
        expect(row.client_id).toBe('cid-A');
    });

    it('R3-3: a second Delete press while the first is unresolved', async () => {
        // The old version had working queue persistence, so the first press
        // removed the row and the second found no target - it passed with ZERO
        // requests. Forcing the queue write to fail keeps the row visible, so
        // the second press genuinely runs.
        // The row must carry a real identifier, or there is no request to
        // retry: an unidentified row is now deleted locally and never named
        // remotely. Pull it so it arrives with the server's client_id.
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        let release;
        ApiService.deleteWorkoutByClientId.mockReturnValue(new Promise(r => { release = r; }));
        await mount();

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const realSet = localStorage.setItem.bind(localStorage);
        vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
            if (k.startsWith('fitness_sync_queue')) throw new Error('QuotaExceededError');
            return realSet(k, v);
        });

        await act(async () => { ctx.deleteWorkout('srv-1'); });
        expect(ctx.history.map(w => w.id),
            'precondition: an unqueued delete must keep the row visible'
        ).toContain('srv-1');

        await act(async () => { ctx.deleteWorkout('srv-1'); });

        const calls = ApiService.deleteWorkoutByClientId.mock.calls.map(([id]) => id);
        expect(calls.length, 'the second press did not reach the API').toBe(2);
        expect(calls.every(Boolean), 'an attempt sent an empty identifier').toBe(true);
        expect(new Set(calls).size, 'the two attempts used different targets').toBe(1);
        release?.();
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

describe('review round 2 — the four blockers', () => {
    const SAME_NAME = 'Push Day';
    const SAME_START = '2026-09-01T10:00:00.000Z';

    const cached = (over = {}) => ({
        id: 'srv-A', name: SAME_NAME,
        startTime: SAME_START, endTime: '2026-09-01T11:00:00.000Z',
        status: 'completed', completed: true, notes: '',
        exercises: [], recommendations: [], ...over,
    });

    it('B1: a colliding fingerprint must not hand one workout another’s identity', async () => {
        // keyOf is `${name}|${startMs}` -- the id is only a fallback for an
        // unparseable date. Two workouts with the same name and start time
        // therefore collide, and Map keeps the LAST one. Local A then adopted
        // B's client_id while keeping its own backendId, and deleting A
        // deleted B instead.
        StorageService.saveHistory(USER.id, [cached({ backendId: 'srv-A', client_id: null })]);
        ApiService.getHistory.mockResolvedValue({
            total: 2,
            items: [
                serverRow({ id: 'srv-A', client_id: null, name: SAME_NAME, start_time: SAME_START }),
                serverRow({ id: 'srv-B', client_id: 'cid-B', name: SAME_NAME, start_time: SAME_START }),
            ],
        });
        await mount();

        const row = ctx.history.find(w => w.id === 'srv-A');
        expect(row, 'the cached row vanished').toBeTruthy();
        expect(row.client_id,
            "row A adopted another workout's client_id"
        ).not.toBe('cid-B');

        await act(async () => { ctx.deleteWorkout('srv-A'); });

        expect(ApiService.deleteWorkoutByClientId,
            'deleting A issued a delete keyed on B'
        ).not.toHaveBeenCalledWith('cid-B');
        expect(ApiService.deleteWorkout).toHaveBeenCalledWith('srv-A');
    });

    it('B1: a known backendId wins over any fingerprint match', async () => {
        // Positive identity must beat content matching, even when the
        // fingerprint points somewhere else entirely.
        StorageService.saveHistory(USER.id, [cached({ backendId: 'srv-A', client_id: null })]);
        ApiService.getHistory.mockResolvedValue({
            total: 2,
            items: [
                serverRow({ id: 'srv-B', client_id: 'cid-B', name: SAME_NAME, start_time: SAME_START }),
                serverRow({ id: 'srv-A', client_id: 'cid-A', name: 'Renamed Later', start_time: SAME_START }),
            ],
        });
        await mount();

        const row = ctx.history.find(w => w.id === 'srv-A');
        expect(row.client_id, 'took the id of the fingerprint match, not of its own server row')
            .toBe('cid-A');
    });

    it('B4: a cached legacy row deleted elsewhere is not re-uploaded', async () => {
        // The old mapper left cached rows with no backendId. If another device
        // deletes the row BEFORE this client's first successful pull, that pull
        // correctly returns empty -- there is nothing to enrich -- and the
        // backfill reads the row as never-uploaded and uploads it again.
        StorageService.saveHistory(USER.id, [cached({ id: 'srv-A', client_id: null })]);
        ApiService.getHistory.mockResolvedValue({ total: 0, items: [] });

        await mount();
        await act(async () => { await new Promise(r => setTimeout(r, 0)); });

        const uploaded = ApiService.saveWorkout.mock.calls.map(([w]) => w?.name);
        expect(uploaded,
            'a legacy row absent from the server was re-uploaded; it may have ' +
            'been deleted on another device'
        ).not.toContain(SAME_NAME);
    });
});

describe('review round 2 — B2 and B3', () => {
    const OTHER = { id: 'user-2', name: 'Other', email: 'other@example.com' };

    it('B2: a delete resolving after a profile switch edits the ORIGINATING profile', async () => {
        // drop() was an unscoped setHistory filter invoked in the request's
        // .then. Queue storage fails, so the row stays visible; the user
        // switches profile while the request is pending; the request then
        // succeeds and drop() edits whoever is on screen instead of the owner.
        //
        // switchProfile reads the provider's React `profiles` state, which
        // refreshGlobalState seeds from storage on mount — so both profiles
        // must exist BEFORE mounting or the switch silently does nothing and
        // this test proves nothing. There is an explicit assertion below that
        // the switch really happened, because an earlier version of this test
        // did not switch at all and passed against the unfixed code.
        StorageService.saveProfiles([
            { id: USER.id, name: USER.name, email: USER.email },
            { id: OTHER.id, name: OTHER.name, email: OTHER.email },
        ]);
        StorageService.saveCurrentProfileId(USER.id);
        StorageService.saveHistory(OTHER.id, [{
            id: 'srv-1', client_id: 'cid-1', name: 'Another persons workout',
            startTime: '2026-09-05T10:00:00.000Z', status: 'completed',
            completed: true, notes: '', exercises: [], recommendations: [],
        }]);
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        let release;
        ApiService.deleteWorkoutByClientId.mockReturnValue(new Promise(r => { release = r; }));
        await mount();

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const realSet = localStorage.setItem.bind(localStorage);
        vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
            if (k.startsWith('fitness_sync_queue')) throw new Error('QuotaExceededError');
            return realSet(k, v);
        });

        await act(async () => { ctx.deleteWorkout('srv-1'); });
        expect(pendingDeletes(), 'precondition: the queue write must fail').toEqual([]);
        expect(ctx.history.map(w => w.id),
            'precondition: an unqueued delete keeps the row visible'
        ).toContain('srv-1');

        ApiService.getHistory.mockResolvedValue({ total: 0, items: [] });
        await act(async () => { ctx.switchProfile(OTHER.id); });
        await act(async () => { await new Promise(r => setTimeout(r, 0)); });
        expect(ctx.currentProfile?.id,
            'precondition: the profile switch did not happen, so this test would ' +
            'pass against the unfixed code'
        ).toBe(OTHER.id);

        // A's delete finally lands, while B is on screen.
        await act(async () => { release(); await new Promise(r => setTimeout(r, 0)); });

        const bStored = StorageService.loadProfileState(OTHER.id).history || [];
        expect(bStored.map(w => w.id),
            'the other profile stored workout was removed by someone elses delete'
        ).toContain('srv-1');
        expect(ctx.history.map(w => w.id),
            'the other profile visible workout was removed by someone elses delete'
        ).toContain('srv-1');

        const aStored = StorageService.loadProfileState(USER.id).history || [];
        expect(aStored.map(w => w.id),
            'the originating profile kept the row it deleted'
        ).not.toContain('srv-1');
    });


});

describe('boot replay', () => {
    // A true cold start is not reachable in-process: SyncQueue is a module
    // singleton whose init() is guarded by an `initialized` flag, and
    // vi.resetModules does not clear the vi.mock factory cache, so re-importing
    // hands back the same mocked module. Rather than pretend, the two things
    // boot recovery depends on are pinned separately, and each one fails on
    // its own if broken.

    it('the provider wires SyncQueue.init() on mount', async () => {
        // Half one: without this call nothing replays after a restart. The
        // previous remount test called flush() by hand, so deleting init()
        // from the provider left every test green.
        const init = vi.spyOn(SyncQueue, 'init');
        await mount();
        expect(init, 'the provider never calls SyncQueue.init()').toHaveBeenCalled();
    });

    it('a replayed delete issues a NEW request, not a remembered one', async () => {
        // Half two: the executor must actually contact the API when the queue
        // replays. Call history is cleared at the restart boundary, so the
        // original pre-restart request cannot satisfy the assertion — that was
        // the flaw that let a no-op replay executor pass.
        ApiService.getHistory.mockResolvedValue({ total: 1, items: [serverRow()] });
        ApiService.deleteWorkoutByClientId.mockRejectedValue(new Error('offline'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await mount();

        await act(async () => { ctx.deleteWorkout('srv-1'); });
        expect(pendingDeletes().map(o => o.key),
            'precondition: the failed delete must be queued'
        ).toEqual(['cid-1']);

        await unmount();

        // --- restart boundary: forget everything the first session did -------
        ApiService.deleteWorkoutByClientId.mockClear();
        ApiService.deleteWorkoutByClientId.mockResolvedValue(undefined);
        ApiService.getHistory.mockResolvedValue({ total: 0, items: [] });
        expect(ApiService.deleteWorkoutByClientId.mock.calls.length,
            'precondition: history cleared, so any call below is genuinely new'
        ).toBe(0);
        expect(pendingDeletes().map(o => o.key),
            'precondition: the intent survived the restart'
        ).toEqual(['cid-1']);

        await mount();
        await act(async () => { await SyncQueue.flush(); });

        expect(ApiService.deleteWorkoutByClientId,
            'the replay never reached the API - a no-op executor would look ' +
            'identical from the queue side'
        ).toHaveBeenCalledWith('cid-1');
        expect(pendingDeletes(), 'a confirmed delete must leave the queue').toEqual([]);
    });
});
