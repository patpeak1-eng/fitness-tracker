// ActiveWorkoutService
// Pure helpers for active workout state mutations

const addExercise = (state, { newWorkoutExercise }) => {
    if (!state) return state;

    return {
        ...state,
        exercises: [...(state.exercises || []), newWorkoutExercise]
    };
};

const updateSet = (state, { exerciseInstanceId, setId, updates }) => {
    if (!state) return state;

    return {
        ...state,
        exercises: (state.exercises || []).map(ex => {
            if (ex.id !== exerciseInstanceId) return ex;

            return {
                ...ex,
                sets: (ex.sets || []).map(set =>
                    set.id === setId ? { ...set, ...updates } : set
                )
            };
        })
    };
};

const removeExercise = (state, { exerciseInstanceId }) => {
    if (!state) return state;
    const exercises = state.exercises || [];
    // The final exercise is preserved: an empty workout cannot start, so
    // removing it would be a trap, not a state (mirrors removeSet below).
    if (exercises.length <= 1) return state;

    return {
        ...state,
        exercises: exercises.filter(ex => ex.id !== exerciseInstanceId)
    };
};

// Move one exercise to a new position. Order is the only thing that changes:
// the exercise objects themselves are carried by reference, so set identity,
// completion and instance ids all survive a reorder untouched.
const reorderExercise = (state, { exerciseInstanceId, toIndex }) => {
    if (!state) return state;
    const exercises = state.exercises || [];
    const from = exercises.findIndex(ex => ex?.id === exerciseInstanceId);
    if (from === -1) return state;
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= exercises.length) return state;
    if (from === toIndex) return state;

    const next = [...exercises];
    const [moved] = next.splice(from, 1);
    next.splice(toIndex, 0, moved);
    return { ...state, exercises: next };
};

const addSet = (state, { exerciseInstanceId, newSet }) => {
    if (!state) return state;

    return {
        ...state,
        exercises: (state.exercises || []).map(ex => {
            if (ex.id !== exerciseInstanceId) return ex;

            return {
                ...ex,
                sets: [...(ex.sets || []), newSet]
            };
        })
    };
};

const removeSet = (state, { exerciseInstanceId, setId }) => {
    if (!state) return state;

    return {
        ...state,
        exercises: (state.exercises || []).map(ex => {
            if (ex.id !== exerciseInstanceId) return ex;
            if ((ex.sets || []).length <= 1) return ex;
            return { ...ex, sets: (ex.sets || []).filter(s => s.id !== setId) };
        })
    };
};


const ActiveWorkoutService = {
    addExercise,
    updateSet,
    removeExercise,
    reorderExercise,
    addSet,
    removeSet
};

export default ActiveWorkoutService;
