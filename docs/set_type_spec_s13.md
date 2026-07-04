# Set-Type Differentiation — Spec (Session 13)

## Current Behavior
Every set has identical structure. No way to mark warm-up, working,
AMRAP, or drop sets. Volume calculations count all completed sets equally.

## Gap
Users need to tag sets by type. Warm-ups excluded from volume. AMRAP/drop
sets get visual markers for training methodology tracking.

## Proposed Changes

### Data Model — new `setType` field on every set object
- Values: 'normal' (default), 'warmup', 'amrap', 'dropset'
- Missing/undefined setType treated as 'normal' — zero migration needed

### WorkoutContext.jsx (HIGH zone)
- addSet(), startWorkoutFromTemplate(), addExerciseToWorkout(): include
  setType: 'normal' in new set objects
- calculateVolume(): exclude sets where setType === 'warmup'
- finishWorkout() progression logic: exclude warmup sets from
  "all sets met target" check
- updateSet(): confirm setType passes through updates (already generic)

### UI — Set Row (GuidedWorkoutView or equivalent)
- Type indicator chip left of set number: W (warmup, --pr-gold bg),
  A (AMRAP, --primary bg), D (drop, --text-muted bg), blank for normal
- Tap chip to cycle types
- Warmup rows: subtle --pr-gold at ~10% opacity background tint
- Completed warmup: green checkmark retained with gold tint

### Analytics
- calculateVolume() change flows through automatically
- History: warmup sets shown but visually lighter (muted)

## Files Touched
1. src/context/WorkoutContext.jsx — HIGH
2. src/components/workout/GuidedWorkoutView.jsx — set row rendering
3. Any SetRow component if it exists separately

## Risk
HIGH. calculateVolume affects all analytics. Existing history (no setType)
must render correctly via undefined → 'normal' fallback.
