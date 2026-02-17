import { describe, it, expect } from "vitest";
import ActiveWorkoutService from "./ActiveWorkoutService";

const mkWorkout = () => ({
  id: "ws_1",
  name: "Test Workout",
  startTime: new Date().toISOString(),
  status: "active",
  exercises: [],
});

describe("ActiveWorkoutService", () => {
  it("addExercise appends the provided workout exercise object", () => {
    const workout = mkWorkout();

    const newWorkoutExercise = {
      id: "exi_1",
      exerciseId: "ex_1",
      name: "Bench Press",
      sets: [],
    };

    const next = ActiveWorkoutService.addExercise(workout, { newWorkoutExercise });

    expect(next.exercises.length).toBe(1);
    expect(next.exercises[0].id).toBe("exi_1");
    expect(next.exercises[0].exerciseId).toBe("ex_1");
    expect(next.exercises[0].sets).toEqual([]);
  });
});
  it("updateSet updates only the targeted set", () => {
    const workout = {
      ...mkWorkout(),
      exercises: [
        {
          id: "exi_1",
          exerciseId: "ex_1",
          name: "Bench Press",
          sets: [
            { id: "set_1", reps: 5, weight: 135, completed: false },
            { id: "set_2", reps: 5, weight: 145, completed: false },
          ],
        },
      ],
    };

    const next = ActiveWorkoutService.updateSet(workout, {
      exerciseInstanceId: "exi_1",
      setId: "set_2",
      updates: { reps: 8, completed: true },
    });

    expect(next.exercises[0].sets[0]).toEqual({
      id: "set_1",
      reps: 5,
      weight: 135,
      completed: false,
    });

    expect(next.exercises[0].sets[1]).toEqual({
      id: "set_2",
      reps: 8,
      weight: 145,
      completed: true,
    });
  });
