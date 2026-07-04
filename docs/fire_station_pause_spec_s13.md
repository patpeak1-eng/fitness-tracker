# Fire Station Pause Button — Spec (Session 13)

## Current Behavior
Active workout has two statuses: `preparing` and `active`. Once started,
only options are End Session (finish/save) or Cancel (discard). No way to
pause. Timers continue running if user steps away.

## Gap
Fire station users need pause/resume that freezes all timers and persists
through reload. Elapsed-time calculations must exclude paused intervals.

## Proposed Changes

### WorkoutContext.jsx (HIGH zone)
- Add `status: 'paused'` as valid workout state
- `pauseWorkout()`: set status='paused', stop restTimer and workTimer
  (isActive=false), store `pausedAt` ISO timestamp on workout object
- `resumeWorkout()`: set status='active', resume timers that had
  remaining time, accumulate pause duration into `totalPausedMs`
- Timer useEffect intervals: guard — if activeWorkout?.status === 'paused',
  timers do not tick (defense-in-depth)
- `finishWorkout()`: subtract totalPausedMs from (endTime - startTime)
  for accurate elapsed duration

### GuidedWorkoutView.jsx (MEDIUM zone)
- Prominent Pause/Resume button, always visible during active phase
- Paused state: dims workout surface, shows Pause icon (lucide),
  single Resume button, uses --text-muted for dimmed elements
- Resume returns to exact prior state (same exercise, same set)

### Persistence
- `pausedAt` and `totalPausedMs` on activeWorkout object — auto-persisted
  via existing localStorage useEffect
- Reload while paused: restores paused state, timers stopped, UI paused

## Files Touched
1. src/context/WorkoutContext.jsx — HIGH
2. src/components/workout/GuidedWorkoutView.jsx — MEDIUM
3. src/pages/TrackWorkout.jsx — if pause button needed outside guided view

## Risk
HIGH. Timer logic has multiple interacting useEffects. totalPausedMs
calculation must be correct for analytics accuracy.
