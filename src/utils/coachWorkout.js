export const coachPlanToTemplate = (plan, id = `coach_${Date.now()}`) => ({
    id,
    name: plan.name,
    isCustom: true,
    coachGenerated: true,
    exercises: plan.exercises.map((item) => ({
        id: item.exercise_id,
        sets: Array.from({ length: item.sets }, () => ({
            targetReps: item.reps || 0,
            targetTime: item.duration_seconds || 0,
            restTime: item.rest_seconds || 60,
            weight: 0,
        })),
    })),
});
