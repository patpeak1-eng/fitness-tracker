// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000" }
/**
 * S32 — the prep screen's wiring for removing an exercise and for the
 * template-name rules (spec §7, page cases a–d).
 *
 * These mount the real TrackWorkout page, with the real ExerciseResult rows and
 * the real Modal, under a hand-built WorkoutContext value. Helper tests prove
 * the name rules; these prove the page actually applies them and that the
 * remove control reaches removeExerciseFromWorkout. Same ReactDOM + act pattern
 * as loginIdentity.test.jsx — no @testing-library.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { WorkoutContext } = await import('../context/WorkoutContext');
const TrackWorkout = (await import('./TrackWorkout')).default;

const CATALOG = [
    { id: 'wt_squat', name: 'Squat', category: 'Weightlifting', equipment: 'Barbell', primary_muscle: 'Legs' },
    { id: 'wt_flat_bench', name: 'Bench Press', category: 'Weightlifting', equipment: 'Barbell', primary_muscle: 'Chest' },
];

const instance = (n, exId) => ({
    id: `inst-${n}`,
    exercise: CATALOG.find(e => e.id === exId),
    sets: [{ id: `set-${n}`, weight: 60, targetReps: 5, reps: 0, completed: false }],
});

const prepWorkout = (sourceTemplateId, count = 2) => ({
    id: 'w-1',
    name: 'Prep',
    status: 'preparing',
    startTime: new Date().toISOString(),
    sourceTemplateId,
    exercises: [instance(1, 'wt_squat'), instance(2, 'wt_flat_bench')].slice(0, count),
});

const BUILT_IN = { id: 'powerhouse', name: 'The Powerhouse', exercises: ['wt_squat', 'wt_flat_bench'] };
const OWN = { id: 'tpl_custom_push', name: 'Push Day', isCustom: true, exercises: [] };
const OTHER_CUSTOM = { id: 'tpl_custom_leg', name: 'Leg Day', isCustom: true, exercises: [] };

let container, root, value;

const baseValue = (activeWorkout, templates) => ({
    activeWorkout,
    exercises: CATALOG,
    templates,
    cancelWorkout: vi.fn(),
    startWorkoutFromTemplate: vi.fn(),
    startWorkout: vi.fn(),
    deleteTemplate: vi.fn(),
    startGuidedSession: vi.fn(),
    prepValidation: { canStartGuidedWorkout: true, invalidWeightSetKeys: [] },
    equipmentProfiles: [],
    activeEquipmentProfileId: null,
    setSessionEquipmentOverride: vi.fn(),
    getCompatibleExercises: () => CATALOG,
    customEquipmentItems: [],
    saveTemplateFromPrep: vi.fn(async (name) => ({ ok: true, mode: 'created', template: { id: 'tpl_custom_new', name } })),
    templateExercisesFromWorkout: (w) => w.exercises.map(ex => ({ id: ex.exercise.id, sets: ex.sets })),
    removeExerciseFromWorkout: vi.fn(),
    reorderExerciseInWorkout: vi.fn(),
    addExerciseToWorkout: vi.fn(),
    units: 'metric',
    updateSet: vi.fn(),
    addSet: vi.fn(),
    removeSet: vi.fn(),
});

const mount = async (v) => {
    value = v;
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        root = createRoot(container);
        root.render(
            <WorkoutContext.Provider value={value}>
                <TrackWorkout />
            </WorkoutContext.Provider>
        );
    });
};

const buttonByText = (text) =>
    [...container.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const click = async (el) => {
    if (!el) throw new Error('no element to click');
    await act(async () => { el.click(); });
};
const type = async (el, text) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
        setter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
};
const openSave = async () => {
    await click(buttonByText('Save Template'));
    const input = container.querySelector('input[placeholder="Template name"]');
    expect(input, 'the Save Template dialog did not open').toBeTruthy();
    return input;
};
const submitSave = async () => click(buttonByText('Save'));

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(async () => {
    if (root) await act(async () => { root.unmount(); });
    container?.remove();
    root = null;
});

describe('template name rules on the prep Save dialog (decision B)', () => {
    it('(a) a built-in source prefills the first free "(my version)" name', async () => {
        // Mutation: prefill sourceTemplate.name instead → input reads "The Powerhouse" → red.
        await mount(baseValue(prepWorkout('powerhouse'), [
            BUILT_IN, { id: 'tpl_custom_v1', name: 'The Powerhouse (my version)', isCustom: true, exercises: [] },
        ]));
        const input = await openSave();
        expect(input.value).toBe('The Powerhouse (my version 2)');
    });

    it('(b) a case-only rename of the SOURCE custom is refused before any save', async () => {
        // Mutation: remove the isTemplateNameTaken gate in confirmSaveTemplate →
        // saveTemplateFromPrep is called → red.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        const input = await openSave();
        expect(input.value, 'precondition: an own custom prefills its own name').toBe('Push Day');
        await type(input, ' push DAY ');
        await submitSave();

        expect(container.querySelector('.save-tpl-error')?.textContent).toMatch(/already exists/);
        expect(container.querySelector('input[placeholder="Template name"]'), 'the dialog closed').toBeTruthy();
        expect(value.saveTemplateFromPrep).not.toHaveBeenCalled();
    });

    it('(b2) another custom\'s name, any case, is refused the same way', async () => {
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN, OTHER_CUSTOM]));
        const input = await openSave();
        await type(input, 'leg day');
        await submitSave();

        expect(container.querySelector('.save-tpl-error')?.textContent).toMatch(/already exists/);
        expect(value.saveTemplateFromPrep).not.toHaveBeenCalled();
    });

    it('(c) the exact unchanged own-custom name is the in-place branch and goes through', async () => {
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN, OTHER_CUSTOM]));
        await openSave();
        await submitSave();

        expect(value.saveTemplateFromPrep).toHaveBeenCalledTimes(1);
        expect(value.saveTemplateFromPrep).toHaveBeenCalledWith('Push Day');
        expect(container.querySelector('.save-tpl-error')).toBeNull();
    });
});

describe('(d) remove-exercise wiring through the row and the confirmation', () => {
    it('cancel calls nothing; confirm calls removeExerciseFromWorkout once with the instance id', async () => {
        // Mutation: disconnect onRequestRemoveExercise in the ExerciseResult
        // mapping → no dialog, no call → red.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        const removeSquat = container.querySelector('button[aria-label="Remove Squat from this workout"]');
        expect(removeSquat, 'no remove control rendered for the row').toBeTruthy();
        expect(removeSquat.getAttribute('aria-disabled')).toBe('false');

        await click(removeSquat);
        expect(buttonByText('Remove'), 'the confirmation did not open').toBeTruthy();
        await click(buttonByText('Cancel'));
        expect(value.removeExerciseFromWorkout).not.toHaveBeenCalled();
        expect(buttonByText('Remove')).toBeUndefined();

        await click(removeSquat);
        await click(buttonByText('Remove'));
        expect(value.removeExerciseFromWorkout).toHaveBeenCalledTimes(1);
        expect(value.removeExerciseFromWorkout).toHaveBeenCalledWith('inst-1');
    });

    it('with one exercise left the control refuses, says why, and stays reachable', async () => {
        // Mutation: derive canRemoveExercise from `length > 0` → enabled → red.
        await mount(baseValue(prepWorkout('tpl_custom_push', 1), [BUILT_IN, OWN]));
        const removeSquat = container.querySelector('button[aria-label="Remove Squat from this workout"]');
        expect(removeSquat.getAttribute('aria-disabled')).toBe('true');
        const reason = container.querySelector('.remove-exercise-reason');
        expect(reason?.textContent).toMatch(/at least one/);
        expect(removeSquat.getAttribute('aria-describedby')).toBe(reason.id);
        await click(removeSquat);
        expect(buttonByText('Remove')).toBeUndefined();
        expect(value.removeExerciseFromWorkout).not.toHaveBeenCalled();

        // The reason is only announced if the control is still reachable. A
        // `disabled` button leaves the tab order and takes its description with
        // it. Mutation: swap aria-disabled back for `disabled` → red.
        expect(removeSquat.hasAttribute('disabled'), 'a disabled control is skipped by the tab order').toBe(false);
        removeSquat.focus();
        expect(document.activeElement, 'the control must be focusable to be announced').toBe(removeSquat);
    });
});

describe('adding an exercise from the prep screen (S35)', () => {
    const addButton = () => container.querySelector('.add-exercise-btn');
    const selector = () => container.querySelector('.exercise-selector-overlay');
    const rowAddButtons = () => Array.from(container.querySelectorAll('.exercise-item .add-btn'));

    it('the Add Exercise button opens the picker', async () => {
        // Mutation: render the picker on `false` instead of showAddExercise.
        // Flips: the selector-is-open assertion.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        expect(selector(), 'the picker must not be open unprompted').toBeNull();

        await click(addButton());
        expect(selector(), 'Add Exercise did not open the picker').toBeTruthy();
    });

    it('confirming a selection adds that exercise and closes the picker', async () => {
        // Mutation: pass a no-op onSelect to ExerciseSelector.
        // Flips: the toHaveBeenCalledWith assertion.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        await click(addButton());

        await click(rowAddButtons()[0]);
        await click(buttonByText('Add 1 exercise'));

        expect(value.addExerciseToWorkout).toHaveBeenCalledTimes(1);
        expect(value.addExerciseToWorkout).toHaveBeenCalledWith('wt_squat');
        expect(selector(), 'the picker must close after adding').toBeNull();
    });

    it('several exercises staged at once are each added', async () => {
        // Mutation: call onSelect only for the first staged exercise in
        // ExerciseSelector.handleConfirmSelection.
        // Flips: the call-count and second-argument assertions.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        await click(addButton());

        await click(rowAddButtons()[0]);
        await click(rowAddButtons()[1]);
        await click(buttonByText('Add 2 exercises'));

        expect(value.addExerciseToWorkout).toHaveBeenCalledTimes(2);
        expect(value.addExerciseToWorkout).toHaveBeenNthCalledWith(1, 'wt_squat');
        expect(value.addExerciseToWorkout).toHaveBeenNthCalledWith(2, 'wt_flat_bench');
    });

    it('closing the picker without confirming adds nothing', async () => {
        // Mutation: have onClose also call addExerciseToWorkout.
        // Flips: the not.toHaveBeenCalled assertion.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        await click(addButton());
        await click(rowAddButtons()[0]);
        await click(container.querySelector('.exercise-selector-overlay .close-btn'));

        expect(value.addExerciseToWorkout).not.toHaveBeenCalled();
        expect(selector()).toBeNull();
    });
});

describe('reorder wiring (S34)', () => {
    const grips = () => Array.from(container.querySelectorAll('.reorder-grip'));

    it('a grip renders per prep row, keyed so a reorder cannot remount it', async () => {
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        expect(grips()).toHaveLength(2);
        expect(grips()[0].getAttribute('aria-label')).toMatch(/Squat/);
    });

    it('Arrow Down on a focused grip moves that exercise one place, once', async () => {
        // Mutation: unbind the keydown handler on the grip.
        // Flips: the toHaveBeenCalledWith assertion — zero calls.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));

        const grip = grips()[0];
        grip.focus();
        await act(async () => {
            grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });

        expect(value.reorderExerciseInWorkout).toHaveBeenCalledTimes(1);
        expect(value.reorderExerciseInWorkout).toHaveBeenCalledWith('inst-1', 1);
    });

    it('Arrow Up at the top, and Arrow Down at the bottom, are refused', async () => {
        // Mutation: drop the bounds check in handleReorderByKey.
        // Flips: the not.toHaveBeenCalled assertion.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));

        const [first, last] = grips();
        await act(async () => {
            first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
            last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });

        expect(value.reorderExerciseInWorkout, 'neither end can move outward').not.toHaveBeenCalled();
    });

    // --- Pointer drag (S34 follow-up) ---------------------------------------
    // The first build reordered the live array on every pointer move. React then
    // MOVED the row's DOM node, which released pointer capture and fired
    // pointercancel; on a phone the pointer is gone after that, so the drag died
    // immediately. It shipped because nothing here ever dispatched a pointer
    // event. These tests dispatch real ones.
    const ptr = (type, { pointerId = 1, clientY = 0 } = {}) => {
        const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
        const e = new Ctor(type, { bubbles: true, cancelable: true, clientY, button: 0 });
        if (e.pointerId === undefined) Object.defineProperty(e, 'pointerId', { value: pointerId });
        return e;
    };

    // Two 100px-tall rows at y=0 and y=100, so midpoints are 50 and 150.
    const stubRowGeometry = () => {
        const cards = Array.from(container.querySelectorAll('.exercise-result-card'));
        cards.forEach((c, i) => {
            c.getBoundingClientRect = () => ({ top: i * 100, height: 100, bottom: i * 100 + 100, left: 0, right: 0, width: 300, x: 0, y: i * 100 });
        });
        return cards;
    };

    const dragFirstRowDown = async () => {
        const grip = grips()[0];
        stubRowGeometry();
        await act(async () => { grip.dispatchEvent(ptr('pointerdown', { clientY: 10 })); });
        await act(async () => { window.dispatchEvent(ptr('pointermove', { clientY: 40 })); });
        await act(async () => { window.dispatchEvent(ptr('pointermove', { clientY: 170 })); });
    };

    it('a pointer drag commits exactly one reorder, and only on release', async () => {
        // Mutation: reorder inside the pointermove handler (the shipped bug).
        // Flips: the during-the-drag assertion — zero calls becomes two.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        await dragFirstRowDown();

        expect(value.reorderExerciseInWorkout, 'the list must not move while the finger is down').not.toHaveBeenCalled();

        await act(async () => { window.dispatchEvent(ptr('pointerup', { clientY: 170 })); });

        expect(value.reorderExerciseInWorkout).toHaveBeenCalledTimes(1);
        expect(value.reorderExerciseInWorkout).toHaveBeenCalledWith('inst-1', 1);
    });

    it('the dragged row follows the finger while the drag is live', async () => {
        // Mutation: stop passing dragStyle to ExerciseResult.
        // Flips: the transform assertion — the style is empty.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        await dragFirstRowDown();

        const dragged = container.querySelector('.exercise-result-card.is-dragging');
        expect(dragged, 'the row under the finger is not marked as dragging').toBeTruthy();
        expect(dragged.style.transform).toBe('translateY(160px)');

        const displaced = container.querySelector('.exercise-result-card.is-displaced');
        expect(displaced, 'the row being passed does not move out of the way').toBeTruthy();
        expect(displaced.style.transform).toBe('translateY(-100px)');
    });

    it('pointercancel aborts the drag and leaves the order alone', async () => {
        // Mutation: treat pointercancel as a drop (commit on it too).
        // Flips: the not.toHaveBeenCalled assertion.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        await dragFirstRowDown();

        await act(async () => { window.dispatchEvent(ptr('pointercancel', { clientY: 170 })); });

        expect(value.reorderExerciseInWorkout).not.toHaveBeenCalled();
        expect(container.querySelector('.exercise-result-card.is-dragging'), 'the drag preview must clear').toBeNull();
    });

    it('a tap on the grip never arms a drag', async () => {
        // Mutation: drop the 6px arming threshold (`< 6` -> `< 0`).
        // Flips: the is-dragging assertion — a 2px tap starts a drag preview.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        const grip = grips()[0];
        stubRowGeometry();
        await act(async () => { grip.dispatchEvent(ptr('pointerdown', { clientY: 10 })); });
        await act(async () => { window.dispatchEvent(ptr('pointermove', { clientY: 12 })); });

        expect(container.querySelector('.exercise-result-card.is-dragging'), 'a 2px tap must not start a drag').toBeNull();

        await act(async () => { window.dispatchEvent(ptr('pointerup', { clientY: 12 })); });
        expect(value.reorderExerciseInWorkout).not.toHaveBeenCalled();
    });

    // --- Reorganize mode -----------------------------------------------------
    const toggle = () => container.querySelector('.reorganize-toggle');

    it('reorganize mode collapses every row to its name, and restores them', async () => {
        // Mutation: ignore isCompact in ExerciseResult (`const compact = false`).
        // Flips: the sets-are-hidden assertion — the inputs are still there.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        expect(container.querySelectorAll('.sets-container')).toHaveLength(2);

        await click(toggle());

        expect(container.querySelectorAll('.exercise-result-card.is-compact')).toHaveLength(2);
        expect(container.querySelectorAll('.sets-container'), 'sets must be hidden while reorganizing').toHaveLength(0);
        // Collapsed, not emptied: every name and its grip must survive.
        expect(grips()).toHaveLength(2);
        expect(container.textContent).toMatch(/Squat/);

        await click(toggle());
        expect(container.querySelectorAll('.sets-container'), 'leaving the mode restores the sets').toHaveLength(2);
    });

    it('a drag still commits while collapsed', async () => {
        // Mutation: stop rendering the grip in compact mode
        // (`showReorder = ... && !compact`).
        // Flips: grips() is empty, so the drag never starts and the
        // toHaveBeenCalledWith assertion goes red.
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        await click(toggle());
        await dragFirstRowDown();
        await act(async () => { window.dispatchEvent(ptr('pointerup', { clientY: 170 })); });

        expect(value.reorderExerciseInWorkout).toHaveBeenCalledWith('inst-1', 1);
    });

    it('the toggle is not offered when there is nothing to reorder', async () => {
        // Mutation: drop the `length > 1` condition.
        // Flips: the toBeNull assertion.
        await mount(baseValue(prepWorkout('tpl_custom_push', 1), [BUILT_IN, OWN]));
        expect(toggle(), 'one exercise cannot be reordered').toBeNull();
    });

    it('the grip is a real button, so it is reachable by keyboard', async () => {
        await mount(baseValue(prepWorkout('tpl_custom_push'), [BUILT_IN, OWN]));
        const grip = grips()[0];
        expect(grip.tagName).toBe('BUTTON');
        grip.focus();
        expect(document.activeElement).toBe(grip);
    });
});
