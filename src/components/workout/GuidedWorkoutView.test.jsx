// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000" }
/**
 * S34 — finishing the workout must not advance the view.
 *
 * Spec: docs/end_of_workout_rest_spec_s34.md sections 4.3 and 7 (cases 9-11).
 *
 * These mount the REAL GuidedWorkoutView under a hand-built WorkoutContext and
 * a STATEFUL TimerContext, because the behaviour under test lives in an effect
 * that only fires on a real rest-state transition. A frozen timer mock never
 * fires it and the test would pass for the wrong reason — the failure mode the
 * plan review caught twice in this spec.
 *
 * Advance is asserted against setCurrentSetIndex / setCurrentExerciseIndex,
 * not against the dialog: goToNext's third branch opens the same dialog, so
 * "dialog is open" proves nothing about suppression.
 *
 * Same ReactDOM + act pattern as TrackWorkout.test.jsx. No @testing-library.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const { WorkoutContext } = await import('../../context/WorkoutContext');
const { TimerContext } = await import('../../context/TimerContext');
const GuidedWorkoutView = (await import('./GuidedWorkoutView')).default;

const EX = { id: 'cal_hold', name: 'Wall Sit', category: 'Calisthenics', equipment: 'None', primary_muscle: 'Legs', isDurationBased: true };
// Duration-based on purpose: the set checkbox (the call site these cases
// drive) only renders for duration-based exercises. A weightlifting fixture
// renders the reps input instead and the checkbox query finds nothing.
const EX2 = { id: 'cal_plank', name: 'Plank', category: 'Calisthenics', equipment: 'None', primary_muscle: 'Core', isDurationBased: true };

// Two exercises so there is somewhere to advance TO; a single-exercise fixture
// makes goToNext fall through to its dialog branch and the test cannot tell
// suppression from "nowhere to go".
const workout = () => ({
    id: 'w-1',
    name: 'Session',
    status: 'active',
    startTime: new Date().toISOString(),
    exercises: [
        // Incomplete: the click must COMPLETE this set, not un-tick it.
        { id: 'inst-1', exercise: EX, sets: [{ id: 'set-1', weight: 100, targetReps: 5, reps: 0, completed: false }] },
        // A following exercise, so goToNext has somewhere to go and a
        // suppression failure is actually observable.
        { id: 'inst-2', exercise: EX2, sets: [{ id: 'set-2', weight: 60, targetReps: 5, reps: 5, completed: true }] },
    ],
});

let ctxValue, timerValue, setCurrentSetIndex, setCurrentExerciseIndex, toggleSetComplete, skipRest;
let container, root, setRest;

// The harness owns rest state so a test can drive a real transition.
const Harness = ({ initialRest }) => {
    const [rest, setRestState] = React.useState(initialRest);
    setRest = setRestState;
    const timer = { ...timerValue, restTimer: rest, skipRest: (...a) => { skipRest(...a); setRestState({ timeLeft: 0, isActive: false, duration: 45 }); } };
    return (
        <WorkoutContext.Provider value={ctxValue}>
            <TimerContext.Provider value={timer}>
                <GuidedWorkoutView />
            </TimerContext.Provider>
        </WorkoutContext.Provider>
    );
};

const mount = async (initialRest) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        root = createRoot(container);
        root.render(<Harness initialRest={initialRest} />);
    });
};

beforeEach(() => {
    vi.restoreAllMocks();
    setCurrentSetIndex = vi.fn();
    setCurrentExerciseIndex = vi.fn();
    skipRest = vi.fn();
    // Reports "finished" — this suite is about what the VIEW does with that.
    toggleSetComplete = vi.fn(() => true);

    ctxValue = {
        activeWorkout: workout(),
        currentExerciseIndex: 0,
        setCurrentExerciseIndex,
        currentSetIndex: 0,
        setCurrentSetIndex,
        finishWorkout: vi.fn(async () => ({})),
        cancelWorkout: vi.fn(),
        updateSet: vi.fn(),
        toggleSetComplete,
        units: 'lbs',
        pauseWorkout: vi.fn(),
        resumeWorkout: vi.fn(),
    };
    timerValue = {
        exercisePrefs: {},
        updateTimerPref: vi.fn(),
        startRestTimer: vi.fn(),
        toggleRestTimer: vi.fn(),
        addTimeRest: vi.fn(),
        workTimer: { timeLeft: 0, isActive: false, duration: 0 },
        startWorkTimer: vi.fn(),
        stopWorkTimer: vi.fn(),
        toggleWorkTimer: vi.fn(),
        resetWorkTimer: vi.fn(),
        addTimeWork: vi.fn(),
    };
});

afterEach(async () => {
    if (root) await act(async () => { root.unmount(); });
    container?.remove();
    root = null;
});

// Click the set checkbox for the current (incomplete) set.
const tickCurrentSet = async () => {
    const btn = container.querySelector('.active-set-check');
    expect(btn, 'precondition: no set checkbox rendered').toBeTruthy();
    await act(async () => { btn.click(); });
};

const advanced = () =>
    setCurrentSetIndex.mock.calls.length > 0 || setCurrentExerciseIndex.mock.calls.length > 0;

describe('9. finishing while a rest is RUNNING does not advance', () => {
    it('arms the latch, clears the rest, and swallows the transition', async () => {
        // Mutation: gate the advance on wasRestingRef alone (drop the
        // suppressAdvanceRef check in the effect).
        // Flips: `advanced()` becomes true — skipRest produces exactly the
        // inactive/zero transition the effect advances on.
        await mount({ timeLeft: 20, isActive: true, duration: 45 });

        await tickCurrentSet();

        expect(toggleSetComplete, 'the set was toggled').toHaveBeenCalledTimes(1);
        expect(skipRest, 'a live rest is cleared on finish').toHaveBeenCalled();
        expect(advanced(), 'the view must not advance under the dialog').toBe(false);
    });
});

describe('10. finishing while a rest is PAUSED with time left', () => {
    it('still clears it and still does not advance', async () => {
        // Mutation: only clear/arm when restTimer.isActive, ignoring a paused
        // timer with time remaining.
        // Flips: the skipRest assertion — a paused timer survives behind the
        // dialog and the latch is never armed.
        await mount({ timeLeft: 12, isActive: false, duration: 45 });

        await tickCurrentSet();

        expect(skipRest, 'a paused rest is still live and must be cleared').toHaveBeenCalled();
        expect(advanced()).toBe(false);
    });
});

describe('11. arming is conditional', () => {
    it('finishing with no rest live leaves a later advance working', async () => {
        // Mutation: arm the latch unconditionally.
        // Flips: the final `advanced()` assertion — the latch, armed with no
        // transition coming, swallows the NEXT legitimate rest-driven advance.
        await mount({ timeLeft: 0, isActive: false, duration: 45 });

        await tickCurrentSet();
        expect(skipRest, 'nothing live, nothing to clear').not.toHaveBeenCalled();
        expect(advanced(), 'no transition, so no advance either').toBe(false);

        // A later, ordinary rest cycle must still advance.
        await act(async () => { setRest({ timeLeft: 30, isActive: true, duration: 45 }); });
        await act(async () => { setRest({ timeLeft: 0, isActive: false, duration: 45 }); });

        expect(advanced(), 'an ordinary rest must still advance afterwards').toBe(true);
    });
});
