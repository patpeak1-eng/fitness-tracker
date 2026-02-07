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

    return {
        ...state,
        exercises: (state.exercises || []).filter(
            ex => ex.id !== exerciseInstanceId
        )
    };
};

const ActiveWorkoutService = {
    addExercise,
    updateSet,
    removeExercise
};

export default ActiveWorkoutService;
