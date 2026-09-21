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

  it("removeSet removes only the selected set", () => {
    const workout = {
      ...mkWorkout(),
      exercises: [
        {
          id: "exi_1",
          sets: [
            { id: "set_1", reps: 5 },
            { id: "set_2", reps: 8 },
          ],
        },
      ],
    };

    const next = ActiveWorkoutService.removeSet(workout, {
      exerciseInstanceId: "exi_1",
      setId: "set_1",
    });

    expect(next.exercises[0].sets).toEqual([{ id: "set_2", reps: 8 }]);
    expect(workout.exercises[0].sets).toHaveLength(2);
  });

  it("removeExercise removes only the targeted exercise instance", () => {
    const workout = {
      ...mkWorkout(),
      exercises: [
        { id: "exi_1", sets: [{ id: "set_1", reps: 5 }] },
        { id: "exi_2", sets: [{ id: "set_2", reps: 8 }] },
      ],
    };

    const next = ActiveWorkoutService.removeExercise(workout, { exerciseInstanceId: "exi_1" });

    expect(next.exercises.map((e) => e.id)).toEqual(["exi_2"]);
    expect(workout.exercises).toHaveLength(2);
  });

  it("removeExercise preserves the workout's final exercise", () => {
    // An empty workout cannot start; the service refuses independently of the
    // context guard (S32 template removal spec, decision 3).
    const workout = {
      ...mkWorkout(),
      exercises: [{ id: "exi_1", sets: [{ id: "set_1", reps: 5 }] }],
    };

    const next = ActiveWorkoutService.removeExercise(workout, { exerciseInstanceId: "exi_1" });

    expect(next).toBe(workout);
    expect(next.exercises).toHaveLength(1);
  });

  it("removeSet preserves an exercise's final set", () => {
    const workout = {
      ...mkWorkout(),
      exercises: [{ id: "exi_1", sets: [{ id: "set_1", reps: 5 }] }],
    };

    const next = ActiveWorkoutService.removeSet(workout, {
      exerciseInstanceId: "exi_1",
      setId: "set_1",
    });

    expect(next.exercises[0].sets).toEqual([{ id: "set_1", reps: 5 }]);
  });
});

describe("reorderExercise (S34)", () => {
  const state = () => ({
    status: "preparing",
    exercises: [
      { id: "a", sets: [{ id: "s1" }] },
      { id: "b", sets: [{ id: "s2" }] },
      { id: "c", sets: [{ id: "s3" }] },
    ],
  });

  it("moves one exercise and leaves the others in relative order", () => {
    // Mutation: insert without removing first (drop the splice(from, 1)).
    // Flips: the id-order assertion — the list grows to four entries.
    const before = state();
    const next = ActiveWorkoutService.reorderExercise(before, { exerciseInstanceId: "a", toIndex: 2 });

    expect(next.exercises.map(e => e.id)).toEqual(["b", "c", "a"]);
    expect(next.exercises, "no duplication or loss").toHaveLength(3);
    expect(before.exercises.map(e => e.id), "input not mutated").toEqual(["a", "b", "c"]);
  });

  it("carries the exercise objects by reference, so set identity survives", () => {
    // Mutation: deep-clone the moved exercise instead of carrying it.
    // Flips: the toBe identity assertion on the sets array.
    const before = state();
    const movedSets = before.exercises[0].sets;
    const next = ActiveWorkoutService.reorderExercise(before, { exerciseInstanceId: "a", toIndex: 1 });

    expect(next.exercises[1].sets).toBe(movedSets);
  });

  it("refuses an unknown id, an out-of-range index, and a no-op move, by identity", () => {
    // Mutation: drop any one of the three guards.
    // Flips: that guard's toBe(before) — a refusal that returns a NEW object
    // fails identity even though the contents look unchanged.
    const before = state();

    expect(ActiveWorkoutService.reorderExercise(before, { exerciseInstanceId: "zzz", toIndex: 1 })).toBe(before);
    expect(ActiveWorkoutService.reorderExercise(before, { exerciseInstanceId: "a", toIndex: 3 })).toBe(before);
    expect(ActiveWorkoutService.reorderExercise(before, { exerciseInstanceId: "a", toIndex: -1 })).toBe(before);
    expect(ActiveWorkoutService.reorderExercise(before, { exerciseInstanceId: "a", toIndex: 1.5 })).toBe(before);
    expect(ActiveWorkoutService.reorderExercise(before, { exerciseInstanceId: "a", toIndex: 0 })).toBe(before);
    expect(ActiveWorkoutService.reorderExercise(null, { exerciseInstanceId: "a", toIndex: 0 })).toBe(null);
  });
});
