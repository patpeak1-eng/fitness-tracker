# Preparation Controls and Exercise Visual Contract — S25.3

## Purpose

Let an athlete tailor the number of planned sets before beginning a workout,
while ensuring the exercise visual they request is consistently shown in the
preparation and guided-workout instruction sheet.

## Decisions

1. A Coach plan remains a recommendation. In Preparation, an athlete can add
   or remove individual sets before pressing **Start workout**.
2. Set removal is available only while `activeWorkout.status === 'preparing'`.
   Guided sessions keep their set log stable.
3. Every exercise retains at least one set. The final remaining set cannot be
   removed.
4. Use the existing `removeSet` WorkoutContext action and its immutable
   `ActiveWorkoutService.removeSet` helper. No API, storage, or data-model
   changes are needed.
5. Built-in exercises use the canonical `illustration` property. The shared
   instruction sheet must use it first, while retaining `imageUrl` as a
   compatibility fallback for custom or legacy exercises.
6. Use the existing 73 local `/illustrations/*` assets. Do not fetch, generate,
   store, or transmit new images.

## Scope

- Preparation rows and the shared instruction sheet only.
- Existing guided-workout and exercise-library visual surfaces inherit the
  correction through their shared data contract.
- Documentation and a reusable visual-contract note.

## Done looks like

- Every preparation row has an accessible remove-set control when more than one
  set exists; it mutates only the current local active workout.
- The control is absent once the workout is active and never leaves an exercise
  with zero sets.
- Arnold Press and all other built-in exercises render their local illustration
  from the info sheet; a bad or missing source still has a clear fallback.
- Existing add-set, set-edit, validation, and guided-workout behaviors remain
  intact.
