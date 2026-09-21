// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000" }
/**
 * S32 — remove an exercise from a template, through the REAL provider.
 *
 * Spec: docs/template_exercise_removal_spec_s32.md §7. These mount
 * WorkoutProvider, take the functions off the context the UI consumes, and
 * drive them. Only ApiService is mocked; StorageService and SyncQueue are real,
 * so every assertion is about what actually lands in storage, the queue, or
 * the cloud calls.
 *
 * Every test names the mutation that turns it red (recorded in the commit).
 * No @testing-library/react — react-dom/client plus React.act is enough.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useContext } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Node's experimental localStorage shadows jsdom's here; a map is all we need.
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

// ApiService is the trust boundary. Derive the mock from the real exports so
// it cannot go stale as ApiService grows.
vi.mock('../services/ApiService', async (importOriginal) => {
    const actual = await importOriginal();
    const mocked = {};
    for (const name of Object.keys(actual)) mocked[name] = vi.fn(async () => undefined);
    mocked.isAvailable = vi.fn(() => true);
    return mocked;
});

const ApiService = await import('../services/ApiService');
const StorageService = (await import('../services/StorageService')).default;
const SyncQueue = (await import('../services/SyncQueue')).default;
const ActiveWorkoutService = (await import('../services/ActiveWorkoutService')).default;
const { WorkoutContext, WorkoutProvider } = await import('./WorkoutContext');

const USER = { id: 'user-1', name: 'Tester', email: 'tester@example.com' };
const OTHER = { id: 'user-2', name: 'Other', email: 'other@example.com' };

const RICH_BUILT_IN = 'dumbbell_full_body'; // the only built-in with rich exercise objects
const STRING_BUILT_IN = 'powerhouse';        // 6 exercises, legacy string shape

const seededCustom = (over = {}) => ({
    id: 'tpl_custom_seed',
    backendId: 'backend-sentinel',
    name: 'Own Custom',
    isCustom: true,
    exercises: [
        { id: 'wt_squat', sets: [{ targetReps: 5, weight: 100 }] },
        { id: 'wt_flat_bench', sets: [{ targetReps: 5, weight: 60 }] },
    ],
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
    ApiService.getActiveWorkout.mockResolvedValue(null);
    ApiService.saveActiveWorkout.mockResolvedValue({});
    ApiService.clearActiveWorkout.mockResolvedValue(undefined);
};

let ctx = null;
const Probe = () => {
    ctx = useContext(WorkoutContext);
    return null;
};

let container, root;
let timerApi = null;

const flush = async () => {
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};

const mount = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    timerApi = {
        skipRest: vi.fn(),
        resetWorkTimer: vi.fn(),
        startRestTimer: vi.fn(),
        stopWorkTimer: vi.fn(),
    };
    const timerApiRef = { current: timerApi };
    await act(async () => {
        root = createRoot(container);
        root.render(
            <WorkoutProvider timerApiRef={timerApiRef}>
                <Probe />
            </WorkoutProvider>
        );
    });
    await flush();
};

const unmount = async () => {
    if (root) await act(async () => { root.unmount(); });
    container?.remove();
    root = null;
    ctx = null;
};

const seedProfiles = (list = [USER]) => {
    StorageService.saveProfiles(list.map(p => ({ id: p.id, name: p.name, email: p.email })));
    StorageService.saveCurrentProfileId(list[0].id);
};

const startTemplate = async (templateId) => {
    await act(async () => { ctx.startWorkoutFromTemplate(templateId); });
    expect(ctx.activeWorkout?.status, 'precondition: prep did not start').toBe('preparing');
    expect(ctx.activeWorkout.sourceTemplateId, 'precondition: wrong source').toBe(templateId);
};

const save = async (name) => {
    let result;
    await act(async () => { result = await ctx.saveTemplateFromPrep(name); });
    return result;
};

const customsInStorage = (uid = USER.id) => StorageService.loadCustomTemplates(uid);
const queued = (type) =>
    JSON.parse(localStorage.getItem('fitness_sync_queue') || '[]').filter(o => o.type === type);

// A create whose settlement the test controls.
const deferredCreate = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    ApiService.saveCustomTemplate.mockReturnValueOnce(promise);
    return { resolve, reject };
};

beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.resetAllMocks();
    emptyPulls();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(async () => {
    await unmount();
});

describe('1. a built-in under its own name is refused', () => {
    it('writes nothing and leaves the session on the built-in', async () => {
        seedProfiles();
        await mount();
        await startTemplate(STRING_BUILT_IN);

        const result = await save('The Powerhouse');

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/built-in/);
        expect(customsInStorage()).toEqual([]);
        expect(ctx.activeWorkout.sourceTemplateId).toBe(STRING_BUILT_IN);
        expect(ApiService.saveCustomTemplate).not.toHaveBeenCalled();
        expect(ApiService.updateCustomTemplate).not.toHaveBeenCalled();
    });
});

describe('2. forking a built-in leaves the original intact', () => {
    it('after a set edit and a removal, the built-in in provider state is unchanged; the copy carries both', async () => {
        // Mutation: remove the `!tpl.isCustom` early return in syncToTemplate →
        // the built-in's first set gains weight 20 → the snapshot comparison
        // goes red. Mutation for the fork: point saveTemplateFromPrep's create
        // at the built-in id → "no stored custom entry reuses its id" goes red.
        seedProfiles();
        await mount();
        await startTemplate(RICH_BUILT_IN);

        const snapshotBefore = JSON.stringify(ctx.templates.find(t => t.id === RICH_BUILT_IN));
        const first = ctx.activeWorkout.exercises[0];
        const last = ctx.activeWorkout.exercises[ctx.activeWorkout.exercises.length - 1];
        expect(ctx.activeWorkout.exercises, 'precondition: the rich built-in has six exercises').toHaveLength(6);

        await act(async () => { ctx.updateSet(first.id, first.sets[0].id, { weight: 20 }); });
        expect(ctx.activeWorkout.exercises[0].sets[0].weight, 'precondition: the edit landed').toBe(20);

        await act(async () => { ctx.removeExerciseFromWorkout(last.id); });
        expect(ctx.activeWorkout.exercises, 'precondition: the removal landed').toHaveLength(5);

        const result = await save('Dumbbell Full Body (my version)');
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('created');

        expect(JSON.stringify(ctx.templates.find(t => t.id === RICH_BUILT_IN)),
            'the built-in changed in provider state').toBe(snapshotBefore);

        const customs = customsInStorage();
        expect(customs).toHaveLength(1);
        expect(customs[0].id).not.toBe(RICH_BUILT_IN);
        expect(customs[0].isCustom).toBe(true);
        expect(customs[0].exercises).toHaveLength(5);
        expect(customs[0].exercises[0].sets[0].weight).toBe(20);
        expect(ctx.activeWorkout.sourceTemplateId, 'the session was not re-pointed at the copy')
            .toBe(customs[0].id);
    });
});

describe('3. in-place update of an own custom template', () => {
    it('keeps both ids, updates the one stored row, and PUTs — never POSTs', async () => {
        // Mutation: make writeTemplate drop backendId from nextTemplate → the
        // PUT assertion and the stored backendId go red.
        seedProfiles();
        StorageService.saveCustomTemplates(USER.id, [seededCustom()]);
        await mount();

        const mounted = ctx.templates.find(t => t.id === 'tpl_custom_seed');
        expect(mounted?.backendId, 'precondition: the seeded template is not on the provider with its id')
            .toBe('backend-sentinel');
        await startTemplate('tpl_custom_seed');
        expect(ctx.activeWorkout.exercises, 'precondition').toHaveLength(2);

        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[1].id); });
        ApiService.updateCustomTemplate.mockResolvedValue({ id: 'backend-sentinel' });

        const result = await save('Own Custom');
        expect(result.ok).toBe(true);
        expect(result.mode).toBe('updated');

        const entry = ctx.templates.find(t => t.id === 'tpl_custom_seed');
        expect(entry.backendId).toBe('backend-sentinel');
        expect(entry.exercises).toHaveLength(1);
        const stored = customsInStorage();
        expect(stored).toHaveLength(1);
        expect(stored[0].id).toBe('tpl_custom_seed');
        expect(stored[0].backendId).toBe('backend-sentinel');
        expect(stored[0].exercises).toHaveLength(1);
        expect(ApiService.updateCustomTemplate).toHaveBeenCalledTimes(1);
        expect(ApiService.updateCustomTemplate.mock.calls[0][0]).toBe('backend-sentinel');
        expect(ApiService.saveCustomTemplate).not.toHaveBeenCalled();
    });

    it('3b. same-session create, acknowledgement settled, then in-place save (decision D-i)', async () => {
        // Mutation: revert adoptTemplateBackendId to storage-only → the
        // provider precondition goes red; and the follow-up save POSTs again.
        seedProfiles();
        await mount();
        await startTemplate(STRING_BUILT_IN);
        const { resolve } = deferredCreate();

        const fork = await save('The Powerhouse (my version)');
        expect(fork.ok).toBe(true);
        const localId = fork.template.id;
        expect(ApiService.saveCustomTemplate).toHaveBeenCalledTimes(1);

        await act(async () => { resolve({ id: 'backend-new' }); });
        await flush();

        expect(ctx.templates.find(t => t.id === localId)?.backendId,
            'provider state did not adopt the acknowledged id (red before S32)').toBe('backend-new');
        expect(customsInStorage().find(t => t.id === localId)?.backendId).toBe('backend-new');

        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[0].id); });
        ApiService.updateCustomTemplate.mockResolvedValue({ id: 'backend-new' });
        const update = await save('The Powerhouse (my version)');
        expect(update.mode).toBe('updated');
        expect(ApiService.updateCustomTemplate).toHaveBeenCalledTimes(1);
        expect(ApiService.updateCustomTemplate.mock.calls[0][0]).toBe('backend-new');
        expect(ApiService.saveCustomTemplate, 'a second create was issued').toHaveBeenCalledTimes(1);
        expect(customsInStorage().find(t => t.id === localId)?.backendId).toBe('backend-new');
    });

    it('3c. saves BEFORE the create settles coalesce into one PUT of the latest payload (decision D-ii)', async () => {
        // Mutation: remove the pendingTemplateCreatesRef branch in writeTemplate
        // → the save POSTs → saveCustomTemplate called twice → red.
        seedProfiles();
        await mount();
        await startTemplate(STRING_BUILT_IN);
        const { resolve } = deferredCreate();

        const fork = await save('The Powerhouse (my version)');
        const localId = fork.template.id;
        expect(ApiService.saveCustomTemplate).toHaveBeenCalledTimes(1);

        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[0].id); });
        const update = await save('The Powerhouse (my version)');
        expect(update.ok).toBe(true);
        expect(update.mode).toBe('updated');
        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[0].id); });
        await save('The Powerhouse (my version)');
        expect(ctx.activeWorkout.exercises, 'precondition: the second save is newer').toHaveLength(4);
        expect(ApiService.saveCustomTemplate, 'another create ran while the first was pending').toHaveBeenCalledTimes(1);
        expect(ApiService.updateCustomTemplate, 'PUT before the create resolved').not.toHaveBeenCalled();

        ApiService.updateCustomTemplate.mockResolvedValue({ id: 'backend-new' });
        await act(async () => { resolve({ id: 'backend-new' }); });
        await flush();

        expect(ApiService.updateCustomTemplate).toHaveBeenCalledTimes(1);
        const [putId, putPayload] = ApiService.updateCustomTemplate.mock.calls[0];
        expect(putId).toBe('backend-new');
        expect(putPayload.exercises, 'the PUT did not carry the latest payload').toHaveLength(4);
        expect(ApiService.saveCustomTemplate).toHaveBeenCalledTimes(1);
        expect(ctx.templates.find(t => t.id === localId)?.backendId).toBe('backend-new');
        expect(customsInStorage().find(t => t.id === localId)?.backendId).toBe('backend-new');
        expect(queued('template')).toEqual([]);
        expect(queued('template_update')).toEqual([]);
    });

    it('3c-reject. the pending create rejects after the in-place save: one queued create, latest payload', async () => {
        // Mutation: queue `newTemplate` (the original fork payload) instead of
        // the latest stored one in saveCustomTemplate's catch → the queued
        // exercise count is 6, not 5 → red.
        seedProfiles();
        await mount();
        await startTemplate(STRING_BUILT_IN);
        const { reject } = deferredCreate();

        const fork = await save('The Powerhouse (my version)');
        const localId = fork.template.id;
        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[0].id); });
        await save('The Powerhouse (my version)');
        expect(ApiService.saveCustomTemplate, 'precondition: exactly one create in flight').toHaveBeenCalledTimes(1);

        await act(async () => { reject(new Error('network')); });
        await flush();

        const ops = queued('template').filter(o => o.key === localId);
        expect(ops).toHaveLength(1);
        expect(ops[0].uid).toBe(USER.id);
        expect(ops[0].payload.exercises, 'the queue holds the stale fork payload').toHaveLength(5);
        expect(ApiService.updateCustomTemplate).not.toHaveBeenCalled();
    });

    it('3c-put-reject. the chained PUT rejects: one template_update op carrying the backend id', async () => {
        // Mutation: enqueue the update without backendId → the executor could
        // not address the row → red.
        seedProfiles();
        await mount();
        await startTemplate(STRING_BUILT_IN);
        const { resolve } = deferredCreate();

        const fork = await save('The Powerhouse (my version)');
        const localId = fork.template.id;
        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[0].id); });
        await save('The Powerhouse (my version)');

        ApiService.updateCustomTemplate.mockRejectedValueOnce(new Error('put failed'));
        await act(async () => { resolve({ id: 'backend-new' }); });
        await flush();

        const ops = queued('template_update').filter(o => o.key === localId);
        expect(ops).toHaveLength(1);
        expect(ops[0].payload.backendId).toBe('backend-new');
        expect(ops[0].payload.exercises).toHaveLength(5);
        expect(queued('template')).toEqual([]);
    });

    it('3d. a queued create that replays adopts the id into provider state (executor site)', async () => {
        // Mutation: revert the 'template' executor to the storage-only
        // write-back → the provider entry lacks the id → red.
        seedProfiles();
        await mount();
        await startTemplate(STRING_BUILT_IN);
        ApiService.saveCustomTemplate.mockRejectedValueOnce(new Error('offline'));

        const fork = await save('The Powerhouse (my version)');
        const localId = fork.template.id;
        await flush();
        expect(queued('template').map(o => o.key), 'precondition: the failed create was not queued')
            .toContain(localId);

        ApiService.saveCustomTemplate.mockResolvedValue({ id: 'backend-replayed' });
        await act(async () => { await SyncQueue.flush(); });
        await flush();

        expect(queued('template')).toEqual([]);
        expect(ctx.templates.find(t => t.id === localId)?.backendId).toBe('backend-replayed');
        expect(customsInStorage().find(t => t.id === localId)?.backendId).toBe('backend-replayed');
    });

    it('3e. an acknowledgement that lands after a profile switch edits the ORIGINATING profile only', async () => {
        // Mutation: drop the `latestProfileIdRef.current === uid` gate in
        // adoptTemplateBackendId → B's template (same local id, seeded on
        // purpose) is stamped with A's backend id → red. With distinct ids the
        // unguarded mapper would be a no-op and this test could never fail.
        // Keep B local-only so switching profiles cannot independently backfill
        // its deliberately colliding template while A's create is pending.
        // The adoption gate is about provider ownership, not B's cloud state.
        seedProfiles([USER, { ...OTHER, email: undefined }]);
        await mount();
        await startTemplate(STRING_BUILT_IN);
        const { resolve } = deferredCreate();

        const fork = await save('The Powerhouse (my version)');
        const localId = fork.template.id;
        StorageService.saveCustomTemplates(OTHER.id, [{
            id: localId, name: 'B own', isCustom: true,
            exercises: [{ id: 'wt_squat', sets: [{ targetReps: 5, weight: 100 }] }],
        }]);
        expect(StorageService.loadCustomTemplates(OTHER.id)[0].id, 'precondition: B must collide on the local id')
            .toBe(localId);

        await act(async () => { ctx.switchProfile(OTHER.id); });
        await flush();
        expect(ctx.currentProfile?.id, 'precondition: the profile switch did not happen').toBe(OTHER.id);
        expect(ctx.templates.find(t => t.id === localId)?.name, 'precondition: B row not on screen').toBe('B own');

        await act(async () => { resolve({ id: 'backend-new' }); });
        await flush();

        expect(ctx.templates.find(t => t.id === localId)?.backendId,
            'A\'s backend id was stamped onto B\'s template').toBeUndefined();
        expect(StorageService.loadCustomTemplates(OTHER.id)[0].backendId).toBeUndefined();
        expect(StorageService.loadCustomTemplates(USER.id).find(t => t.id === localId)?.backendId)
            .toBe('backend-new');

        await act(async () => { ctx.switchProfile(USER.id); });
        await flush();
        expect(ctx.templates.find(t => t.id === localId)?.backendId).toBe('backend-new');
    });

    it('3e2. a pending create with the same local id under another profile is independent', async () => {
        // Mutation: key pendingTemplateCreatesRef by local id alone -> B's save
        // chains behind A's request instead of issuing B's own create -> red.
        seedProfiles([USER, OTHER]);
        await mount();
        await startTemplate(STRING_BUILT_IN);
        const createA = deferredCreate();

        const fork = await save('The Powerhouse (my version)');
        const localId = fork.template.id;
        expect(ApiService.saveCustomTemplate).toHaveBeenCalledTimes(1);

        StorageService.saveCustomTemplates(OTHER.id, [{
            id: localId,
            name: 'B own',
            isCustom: true,
            exercises: [
                { id: 'wt_squat', sets: [{ targetReps: 5, weight: 100 }] },
                { id: 'wt_flat_bench', sets: [{ targetReps: 5, weight: 60 }] },
            ],
        }]);

        // Prevent profile B's ordinary cloud refresh from backfilling the
        // deliberately colliding fixture before this test drives the save.
        ApiService.isAvailable.mockReturnValue(false);
        await act(async () => { ctx.switchProfile(OTHER.id); });
        await flush();
        expect(ctx.currentProfile?.id, 'precondition: B is not active').toBe(OTHER.id);
        expect(ctx.templates.find(t => t.id === localId)?.name, 'precondition: B fixture is not loaded').toBe('B own');

        ApiService.isAvailable.mockReturnValue(true);
        await startTemplate(localId);
        const createB = deferredCreate();
        const updateB = await save('B own');

        expect(updateB.mode).toBe('updated');
        expect(ApiService.saveCustomTemplate,
            'B incorrectly reused A\'s pending create record').toHaveBeenCalledTimes(2);

        await act(async () => { createB.resolve({ id: 'backend-b' }); });
        await flush();
        await act(async () => { createA.resolve({ id: 'backend-a' }); });
        await flush();

        expect(StorageService.loadCustomTemplates(USER.id).find(t => t.id === localId)?.backendId).toBe('backend-a');
        expect(StorageService.loadCustomTemplates(OTHER.id).find(t => t.id === localId)?.backendId).toBe('backend-b');
        expect(ctx.templates.find(t => t.id === localId)?.backendId).toBe('backend-b');
    });
});

describe('4. backing out of prep leaves exercise membership untouched', () => {
    it('remove, then cancel: the stored custom still has both exercises', async () => {
        // Mutation: have removeExerciseFromWorkout also write the template →
        // storage drops to one entry → red.
        seedProfiles();
        StorageService.saveCustomTemplates(USER.id, [seededCustom()]);
        await mount();
        await startTemplate('tpl_custom_seed');

        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[1].id); });
        expect(ctx.activeWorkout.exercises, 'precondition').toHaveLength(1);
        await act(async () => { ctx.cancelWorkout(); });

        expect(ctx.activeWorkout).toBeNull();
        expect(customsInStorage()[0].exercises).toHaveLength(2);
        expect(ctx.templates.find(t => t.id === 'tpl_custom_seed').exercises).toHaveLength(2);
        expect(ApiService.updateCustomTemplate).not.toHaveBeenCalled();
    });
});

describe('5. removeExerciseFromWorkout guards (context layer)', () => {
    it('refuses the last exercise, an unknown id, and any status but preparing; removes one of two', async () => {
        // Identity assertions: the guarded branches return `prev`, so the
        // activeWorkout reference must not change. Mutation: delete the
        // `list.length <= 1` line → the service still blocks but returns a NEW
        // object → the toBe(before) identity check goes red on its own.
        seedProfiles();
        StorageService.saveCustomTemplates(USER.id, [
            seededCustom(),
            seededCustom({ id: 'tpl_custom_one', name: 'One', exercises: [{ id: 'wt_squat', sets: [{ targetReps: 5, weight: 100 }] }] }),
        ]);
        await mount();

        await startTemplate('tpl_custom_one');
        const only = ctx.activeWorkout;
        const removeSpy = vi.spyOn(ActiveWorkoutService, 'removeExercise');
        expect(only.exercises, 'precondition').toHaveLength(1);
        await act(async () => { ctx.removeExerciseFromWorkout(only.exercises[0].id); });
        expect(ctx.activeWorkout).toBe(only);
        expect(ctx.activeWorkout.exercises).toHaveLength(1);
        expect(removeSpy, 'the context delegated removal of the final exercise').not.toHaveBeenCalled();
        await act(async () => { ctx.cancelWorkout(); });

        await startTemplate('tpl_custom_seed');
        const two = ctx.activeWorkout;
        await act(async () => { ctx.removeExerciseFromWorkout('no-such-instance'); });
        expect(ctx.activeWorkout, 'an unknown id must be a no-op, not a filter').toBe(two);

        await act(async () => { ctx.removeExerciseFromWorkout(two.exercises[0].id); });
        expect(ctx.activeWorkout.exercises.map(e => e.id)).toEqual([two.exercises[1].id]);
        await act(async () => { ctx.cancelWorkout(); });

        await startTemplate('tpl_custom_seed');
        await act(async () => { ctx.startGuidedSession(); });
        expect(ctx.activeWorkout.status, 'precondition: the guided session did not start').toBe('active');
        const live = ctx.activeWorkout;
        await act(async () => { ctx.removeExerciseFromWorkout(live.exercises[0].id); });
        expect(ctx.activeWorkout).toBe(live);
        expect(ctx.activeWorkout.exercises).toHaveLength(2);
    });
});

describe('6. a set edit after a removal targets the right template exercise (H1)', () => {
    it('resolves by catalog id, and cancelling leaves the untouched exercise untouched', async () => {
        // Mutation: in resolveSyncTargetIndex, return `exIndex` directly
        // instead of resolving by catalog id → the edit lands on wt_squat and
        // both the 100 assertion and the 999 assertion go red.
        seedProfiles();
        StorageService.saveCustomTemplates(USER.id, [seededCustom()]);
        await mount();

        await startTemplate('tpl_custom_seed');
        const before = customsInStorage()[0];
        expect(before.exercises.map(e => e.id), 'precondition').toEqual(['wt_squat', 'wt_flat_bench']);

        // Drop the FIRST exercise, so the survivor's workout index (0) no
        // longer matches its template index (1).
        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[0].id); });
        const survivor = ctx.activeWorkout.exercises[0];
        expect(survivor.exercise.id, 'precondition: wrong survivor').toBe('wt_flat_bench');
        expect(ctx.activeWorkout.exercises, 'precondition: index did not shift').toHaveLength(1);

        await act(async () => { ctx.updateSet(survivor.id, survivor.sets[0].id, { weight: 999 }); });
        await flush();

        const afterEdit = customsInStorage()[0];
        const byId = id => afterEdit.exercises.find(e => e.id === id);
        expect(byId('wt_flat_bench').sets[0].weight, 'the edit must land on the bench').toBe(999);
        expect(byId('wt_squat').sets[0].weight, 'the removed exercise must be untouched').toBe(100);

        // Backing out must not leave the corruption behind either — Save/START
        // would have overwritten it, Cancel does not.
        await act(async () => { ctx.cancelWorkout(); });
        await flush();
        const afterCancel = customsInStorage()[0];
        expect(afterCancel.exercises.map(e => e.id), 'membership must survive the cancel').toEqual(['wt_squat', 'wt_flat_bench']);
        expect(afterCancel.exercises.find(e => e.id === 'wt_squat').sets[0].weight).toBe(100);
    });
});

describe('6b. a template listing the same exercise twice (re-review P1)', () => {
    const duplicateSeed = () => seededCustom({
        exercises: [
            { id: 'wt_squat', sets: [{ targetReps: 5, weight: 100 }] },
            { id: 'wt_squat', sets: [{ targetReps: 5, weight: 200 }] },
            { id: 'wt_flat_bench', sets: [{ targetReps: 5, weight: 60 }] },
        ],
    });
    const weights = () => customsInStorage()[0].exercises.map(e => e.sets[0].weight);

    it('refuses the write after a removal rather than editing the wrong occurrence', async () => {
        // The reviewer's reproduction: remove the FIRST Squat, edit the
        // survivor. Catalog id cannot disambiguate and the arrays have
        // diverged, so nothing is written.
        // Mutation: in resolveSyncTargetIndex, replace the ambiguous branch
        // with `return exIndex;` → stored becomes [999, 200, 60] → red.
        seedProfiles();
        StorageService.saveCustomTemplates(USER.id, [duplicateSeed()]);
        await mount();

        await startTemplate('tpl_custom_seed');
        expect(weights(), 'precondition').toEqual([100, 200, 60]);

        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[0].id); });
        const survivor = ctx.activeWorkout.exercises[0];
        expect(survivor.exercise.id, 'precondition: wrong survivor').toBe('wt_squat');

        await act(async () => { ctx.updateSet(survivor.id, survivor.sets[0].id, { weight: 999 }); });
        await flush();
        expect(weights(), 'an ambiguous target must not be guessed').toEqual([100, 200, 60]);

        await act(async () => { ctx.cancelWorkout(); });
        await flush();
        expect(weights(), 'and nothing lands on the way out either').toEqual([100, 200, 60]);
    });

    it('refuses even with nothing removed, because the id cannot disambiguate', async () => {
        // Round 2 dropped the positional tie-break: an equal-length template is
        // only reliably aligned today, and the unaligned state is constructible
        // (C3). Ambiguity now always fails closed, so a duplicate template
        // loses the immediate write-through — Save and START still persist it.
        // Mutation: return `matches[0]` instead of -1 for a multi-match →
        // stored becomes [777, 200, 60] → red.
        seedProfiles();
        StorageService.saveCustomTemplates(USER.id, [duplicateSeed()]);
        await mount();

        await startTemplate('tpl_custom_seed');
        const second = ctx.activeWorkout.exercises[1];
        expect(second.exercise.id, 'precondition').toBe('wt_squat');

        await act(async () => { ctx.updateSet(second.id, second.sets[0].id, { weight: 777 }); });
        await flush();
        expect(weights(), 'an ambiguous target is never guessed').toEqual([100, 200, 60]);
        // Not vacuous: the edit really did reach the workout row, so the
        // resolver is what refused, not a dropped update.
        expect(ctx.activeWorkout.exercises[1].sets[0].weight).toBe(777);

        // ...and an explicit Save still captures it, so nothing is lost.
        await save('Own Custom');
        await flush();
        expect(weights(), 'Save persists what the write-through refused').toEqual([100, 777, 60]);
    });
});

describe('6c. a set edit after a SET removal (re-review round 2, P2)', () => {
    it('refuses rather than editing the removed set\'s slot', async () => {
        // The same defect one level down: remove the FIRST set, and the
        // survivor's positional index points at the removed set's slot.
        // Mutation: drop the `tplEx.sets.length !== exLocator?.setCount`
        // guard → stored becomes wt_squat [999, 110] → red.
        seedProfiles();
        StorageService.saveCustomTemplates(USER.id, [seededCustom({
            exercises: [
                { id: 'wt_squat', sets: [{ targetReps: 5, weight: 100 }, { targetReps: 5, weight: 110 }] },
                { id: 'wt_flat_bench', sets: [{ targetReps: 5, weight: 60 }] },
            ],
        })]);
        await mount();

        await startTemplate('tpl_custom_seed');
        const squat = ctx.activeWorkout.exercises[0];
        expect(squat.sets, 'precondition').toHaveLength(2);

        await act(async () => { ctx.removeSet(squat.id, squat.sets[0].id); });
        const survivor = ctx.activeWorkout.exercises[0];
        expect(survivor.sets, 'precondition: the set did not come off').toHaveLength(1);

        await act(async () => { ctx.updateSet(survivor.id, survivor.sets[0].id, { weight: 999 }); });
        await flush();

        const stored = customsInStorage()[0].exercises.find(e => e.id === 'wt_squat');
        expect(stored.sets.map(s => s.weight), 'the removed set\'s slot must not be edited').toEqual([100, 110]);

        await act(async () => { ctx.cancelWorkout(); });
        await flush();
        expect(customsInStorage()[0].exercises.find(e => e.id === 'wt_squat').sets.map(s => s.weight)).toEqual([100, 110]);
    });
});

describe('7. a rejected chained PUT queues the latest payload, not the captured one (H2)', () => {
    it('does not replay membership that a newer save already superseded', async () => {
        // Mutation: in the chained PUT's catch, queue `withId` instead of
        // re-reading storage → the queued op carries 2 exercises and the
        // toHaveLength(1) assertion goes red.
        seedProfiles();
        StorageService.saveCustomTemplates(USER.id, [seededCustom({
            backendId: undefined,
            exercises: [
                { id: 'wt_squat', sets: [{ targetReps: 5, weight: 100 }] },
                { id: 'wt_flat_bench', sets: [{ targetReps: 5, weight: 60 }] },
                { id: 'wt_deadlift', sets: [{ targetReps: 5, weight: 140 }] },
            ],
        })]);
        await mount();
        await startTemplate('tpl_custom_seed');

        // Fork under a new name; its create stays pending.
        const create = deferredCreate();
        await save('Forked Copy');
        const forkedId = ctx.activeWorkout.sourceTemplateId;
        expect(forkedId, 'precondition: the session did not repoint').not.toBe('tpl_custom_seed');
        expect(customsInStorage().find(t => t.id === forkedId)?.backendId, 'precondition: create already settled').toBeUndefined();

        // An in-place save while the create is pending schedules ONE chained
        // PUT behind it. Hold that PUT open.
        let rejectChained;
        ApiService.updateCustomTemplate.mockReturnValueOnce(new Promise((_, rej) => { rejectChained = rej; }));
        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[0].id); });
        await save('Forked Copy');

        await act(async () => { create.resolve({ id: 'backend-new' }); });
        await flush();
        expect(ApiService.updateCustomTemplate, 'precondition: chained PUT never fired').toHaveBeenCalledTimes(1);

        // A newer direct save lands and succeeds while that PUT is still out.
        ApiService.updateCustomTemplate.mockResolvedValue({});
        await act(async () => { ctx.removeExerciseFromWorkout(ctx.activeWorkout.exercises[0].id); });
        await save('Forked Copy');
        await flush();
        expect(customsInStorage().find(t => t.id === forkedId).exercises, 'precondition: storage is not at 1').toHaveLength(1);

        // Only now does the chained PUT fail.
        await act(async () => { rejectChained(new Error('network')); });
        await flush();

        const ops = queued('template_update');
        expect(ops, 'exactly one queued update for this template').toHaveLength(1);
        expect(ops[0].payload.exercises, 'the queue must not resurrect a removed exercise').toHaveLength(1);
        expect(ops[0].payload.backendId).toBe('backend-new');
        // Scoped to the forked row: the seeded custom has no backendId either,
        // so login backfill creates it too and a bare call count would count
        // an unrelated POST.
        const createsForFork = ApiService.saveCustomTemplate.mock.calls.filter(([t]) => t?.id === forkedId);
        expect(createsForFork, 'no second create for the forked template').toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// S34 — no rest timer once the workout is finished.
// Spec: docs/end_of_workout_rest_spec_s34.md section 7.
// Every test names both its mutation AND the asserted value that flips under
// it. A mutation that changes no asserted value is a decorative test.
// ---------------------------------------------------------------------------

const twoExerciseSeed = (squatSets, benchSets) => seededCustom({
    exercises: [
        { id: 'wt_squat', sets: squatSets },
        { id: 'wt_flat_bench', sets: benchSets },
    ],
});
const aSet = (over = {}) => ({ targetReps: 5, weight: 100, ...over });

const startGuided = async (seed) => {
    seedProfiles();
    StorageService.saveCustomTemplates(USER.id, [seed]);
    await mount();
    await startTemplate('tpl_custom_seed');
    await act(async () => { ctx.startGuidedSession(); });
    expect(ctx.activeWorkout.status, 'precondition: guided session did not start').toBe('active');
};

const complete = async (exIdx, setIdx) => {
    const ex = ctx.activeWorkout.exercises[exIdx];
    const set = ex.sets[setIdx];
    let reported;
    await act(async () => { reported = ctx.toggleSetComplete(ex.id, set.id, !!set.completed); });
    return reported;
};

describe('8. no rest timer once the workout is finished (S34)', () => {
    it('8a. the final outstanding set reports finished and starts no rest', async () => {
        // Mutation: make startRestTimer unconditional again.
        // Flips: the not.toHaveBeenCalled assertion on startRestTimer.
        await startGuided(twoExerciseSeed([aSet()], [aSet()]));

        expect(await complete(0, 0), 'first of two is not the end').toBe(false);
        expect(timerApi.startRestTimer, 'a normal set still rests').toHaveBeenCalledTimes(1);

        timerApi.startRestTimer.mockClear();
        expect(await complete(1, 0), 'that was the last outstanding set').toBe(true);
        expect(timerApi.startRestTimer, 'no rest once the workout is over').not.toHaveBeenCalled();
        expect(timerApi.stopWorkTimer, 'the work timer still stops').toHaveBeenCalled();
    });

    it('8b. ticking out of order is judged by what remains, not by position', async () => {
        // Mutation: decide on "last set of the last exercise" instead of
        // "nothing outstanding".
        // Flips: BOTH halves — the positionally-last set would report true
        // when it is not the end, and the earlier set would report false
        // when it is.
        await startGuided(twoExerciseSeed([aSet(), aSet()], [aSet()]));

        expect(await complete(0, 0), 'squat set 1').toBe(false);
        expect(await complete(1, 0), 'bench is last by position, squat set 2 remains').toBe(false);
        expect(timerApi.startRestTimer, 'still resting, work remains').toHaveBeenCalledTimes(2);

        timerApi.startRestTimer.mockClear();
        expect(await complete(0, 1), 'nothing outstanding now').toBe(true);
        expect(timerApi.startRestTimer).not.toHaveBeenCalled();
    });

    it('8c. warm-ups count toward completion, in two steps because one cannot fail', async () => {
        // Mutation: exclude warm-up sets from the predicate.
        // Flips: the FIRST assertion — completing the normal set would report
        // true, because the only thing left is a warm-up the mutant ignores.
        // A single-step version cannot fail: dropping the only outstanding
        // warm-up leaves every retained set complete, so it reports true
        // either way.
        await startGuided(twoExerciseSeed([aSet()], [aSet()]));

        // setType must be set on the WORKOUT, not the template:
        // startWorkoutFromTemplate hardcodes setType 'normal' when it builds
        // sets, so a warm-up seeded in the template never reaches the session.
        // Seeding it there made an earlier version of this test vacuous.
        const squat = ctx.activeWorkout.exercises[0];
        await act(async () => { ctx.updateSet(squat.id, squat.sets[0].id, { setType: 'warmup' }); });
        expect(ctx.activeWorkout.exercises[0].sets[0].setType, 'precondition: not a warm-up').toBe('warmup');

        expect(await complete(1, 0), 'a warm-up is still outstanding').toBe(false);
        expect(await complete(0, 0), 'the warm-up was the last one').toBe(true);
        expect(timerApi.startRestTimer, 'only the non-final set rested').toHaveBeenCalledTimes(1);
    });

    it('8d. un-ticking never reports finished, and still skips rest', async () => {
        // Mutation: return the predicate on the un-complete branch too.
        // Flips: the toBe(false) on the un-tick.
        await startGuided(twoExerciseSeed([aSet()], [aSet()]));
        await complete(0, 0);
        expect(await complete(1, 0), 'precondition: finished').toBe(true);

        timerApi.startRestTimer.mockClear();
        timerApi.skipRest.mockClear();
        expect(await complete(1, 0), 'un-ticking is never a finish').toBe(false);
        expect(timerApi.skipRest, 'un-ticking clears rest as before').toHaveBeenCalled();
        expect(timerApi.startRestTimer).not.toHaveBeenCalled();
    });

    it('8e. an unresolvable instance or set reports false', async () => {
        // Mutation: drop the target?.sets?.some(...) validation.
        // Flips: both toBe(false) assertions.
        // The fixture must be OTHERWISE COMPLETE for that to bite: with work
        // still outstanding the predicate returns false regardless of the
        // validation, so an earlier version of this test could not fail.
        await startGuided(twoExerciseSeed([aSet()], [aSet()]));
        await complete(0, 0);
        expect(await complete(1, 0), 'precondition: every real set is complete').toBe(true);

        let r1, r2;
        await act(async () => { r1 = ctx.toggleSetComplete('no-such-instance', 'no-such-set', false); });
        const realEx = ctx.activeWorkout.exercises[1];
        await act(async () => { r2 = ctx.toggleSetComplete(realEx.id, 'no-such-set', false); });

        expect(r1, 'unknown instance').toBe(false);
        expect(r2, 'known instance, unknown set').toBe(false);
    });

    it('8f. same event: reps land, then the toggle reports finished synchronously', async () => {
        // This is how commitActualReps drives it: updateSet then
        // toggleSetComplete, same handler, same tick.
        //
        // Mutation: make the predicate OBSERVE instead of hypothesise — drop
        // the `ex.id === exerciseInstanceId && s.id === setId ? true` arm so
        // every set is read as stored.
        // Flips: `reported` becomes false, because the target set is not
        // complete in state yet and never will be within this tick.
        // (8a dies under the same mutation. Merely MOVING the computation
        // after updateSet is not a mutation at all: `activeWorkout` is the
        // same object either way inside one tick, which is why an earlier
        // version of this test could not fail.)
        await startGuided(twoExerciseSeed([aSet()], [aSet()]));
        await complete(0, 0);

        const ex = ctx.activeWorkout.exercises[1];
        const set = ex.sets[0];
        let reported;
        await act(async () => {
            ctx.updateSet(ex.id, set.id, { reps: 7 });
            reported = ctx.toggleSetComplete(ex.id, set.id, false);
        });

        expect(reported, 'reported synchronously, from the hypothetical').toBe(true);
        const after = ctx.activeWorkout.exercises[1].sets[0];
        expect(after.reps, 'the reps survived the same-event toggle').toBe(7);
        expect(after.completed, 'and so did the completion').toBe(true);
    });
});
