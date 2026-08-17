import { describe, expect, it } from 'vitest';
import { coachPlanToTemplate } from './coachWorkout';

describe('coachPlanToTemplate', () => {
    it('converts a validated coach plan into the existing workout template shape', () => {
        const template = coachPlanToTemplate({
            name: 'Station Push',
            exercises: [
                {
                    exercise_id: 'cal_pushup',
                    sets: 3,
                    reps: 12,
                    duration_seconds: 0,
                    rest_seconds: 45,
                },
                {
                    exercise_id: 'cal_plank',
                    sets: 2,
                    reps: 0,
                    duration_seconds: 60,
                    rest_seconds: 30,
                },
            ],
        }, 'coach_test');

        expect(template.id).toBe('coach_test');
        expect(template.exercises[0].sets).toHaveLength(3);
        expect(template.exercises[0].sets[0]).toEqual({
            targetReps: 12,
            targetTime: 0,
            restTime: 45,
            weight: 0,
        });
        expect(template.exercises[1].sets[0].targetTime).toBe(60);
    });
});
