// ActiveWorkoutService
// Pure helpers for active workout state mutations

const addExercise = (state, { newWorkoutExercise }) => {
    if (!state) return state;

    return {
        ...state,
        exercises: [...(state.exercises || []), newWorkoutExercise]
    };
};

const ActiveWorkoutService = {
    addExercise
};

export default ActiveWorkoutService;
