# S34 — No rest timer when the workout is finished

> Spec committed alone under SPEC_FIRST_RULE. No implementation code.
> Anchored to `56c1e47`. Every file:line below was read at that revision.
>
> This is **job 1 of 2**, split out of the combined S34 spec on the plan
> reviewer's recommendation and the owner's agreement. Job 2 (drag to reorder)
> gets its own spec after this ships. The combined spec is superseded.

## 1. The ask

> "at the end of completing the entire workout we currently have the resting
> timer after the very last exercise ... there's no need to rest because the
> workout is completed. So I'd like to take out the rest timer at the very end
> ... Or maybe we can get a pop up window saying finish workout."

**Zone: HIGH.** It changes `WorkoutContext.jsx` and the completion flow of
`active_workout`, which is user data. Two clearances.

## 2. Today

`toggleSetComplete` (`WorkoutContext.jsx:2635-2672`) ends with an
**unconditional** `timerApiRef.current?.startRestTimer()` whenever a set is
marked complete (`:2667`). Nothing distinguishes the workout's final set, so
the athlete is made to rest after finishing.

A "Finish Workout?" dialog already exists (`GuidedWorkoutView.jsx:719-726`),
driven by `confirmModal` (`:67`) and `handleConfirmFinish` (`:224-230`),
reusing the shared `Modal`. **This spec builds no new dialog** — it triggers
that one.

## 3. Deciding "the workout is finished"

**Definition:** no set anywhere in the workout remains incomplete, counting the
set now being toggled as complete. Not "the last set of the last exercise" —
sets can be ticked in any order, and the positional reading would fire early
or not at all. Positional identity has produced three separate defects in this
codebase in the last month; it is not used here.

**How it is computed — this is the part most likely to be got wrong.**
`updateSet` is an asynchronous React state update, so `activeWorkout` inside
`toggleSetComplete` does not reflect the toggle. Therefore:

- Compute a **synchronous hypothetical** from the `activeWorkout` the handler
  closes over: validate that `exerciseInstanceId` and `setId` both resolve;
  then test whether every set of every exercise is complete, treating **only
  that one validated set** as complete regardless of its stored value.
- **Never** re-read React state after calling `updateSet`.
- **Never** compute this inside a state updater or take the answer out of one —
  updaters must stay pure and may be replayed under StrictMode.

The plan reviewer verified that prior same-event `updateSet` calls at the two
non-checkbox call sites (`GuidedWorkoutView.jsx:295-296`, `:313-314`) write
reps, weight, distance or time only, and never another set's `completed` flag,
so the closure value is sound for every current caller.

**Warm-up sets count.** They are ordinary sets the athlete ticks; `:2645-2648`
exempts them from PR checks only. Excluding them would fire the prompt early.

## 4. The change

### 4.1 `WorkoutContext.toggleSetComplete`

Returns a boolean: *did this action finish the workout?* Completion only —
un-completing always returns `false` and keeps today's `skipRest()` behaviour
(`:2668-2671`). An unresolvable instance or set id returns `false` and changes
no timer.

- finished → `stopWorkTimer()`, and **do not** call `startRestTimer()`
- not finished → exactly today's behaviour, unchanged

The context's only new responsibility is deciding and reporting. It does not
orchestrate the dialog.

### 4.2 `GuidedWorkoutView` — all three call sites

`toggleSetComplete` has **three** callers, not one:

| Line | Caller |
|---|---|
| `:296` | `commitActualReps` — typing reps and confirming |
| `:314` | `confirmSetCompletion` — the Log Set modal (distance/time) |
| `:525` | the set checkbox |

All three consume the return value. A single shared handler takes the boolean
so the behaviour cannot drift between them.

On `true`, in this order:
1. Suppress the pending auto-advance by clearing `wasRestingRef.current`.
2. `skipRest()`, to clear a rest that was already running or paused from the
   previous set.
3. Open the existing `confirmModal`.

**Why step 1 exists.** `:123` advances to the next exercise when a rest
transitions to `isActive === false` with `timeLeft === 0`, and `skipRest`
(`TimerContext.jsx:129-131`) sets exactly that. Without the suppression,
finishing while a rest is running would advance the view underneath the dialog.

Timer orchestration stays in the view, where `wasRestingRef` lives; the context
stays the decision-maker. No new context state, no new component.

## 5. Deliberate positions

- The dialog **asks**; it does not finish the workout. `finishWorkout` still
  runs only from `handleConfirmFinish` (`:224-230`).
- Un-ticking a set after the dialog opens does not force it closed; it stays
  dismissible as today. Re-ticking opens it again, which is correct.
- Skipping sets means the prompt never fires and the Finish button behaves
  exactly as it does now. Intended fallback, not a gap.
- No touch interaction changes, so this job carries **no iOS/Android
  divergence risk**. That belongs to job 2.

## 6. Files

| File | Change |
|---|---|
| `src/context/WorkoutContext.jsx` | `toggleSetComplete` returns finished-ness; skips rest when finished |
| `src/components/workout/GuidedWorkoutView.jsx` | shared handler at all three call sites; suppress auto-advance, clear rest, open the existing dialog |
| `src/context/templateSave.provider.test.jsx` *or* a new `workoutCompletion.provider.test.jsx` | provider tests below |
| `src/components/workout/GuidedWorkoutView.test.jsx` (new) | call-site and auto-advance tests |
| `docs/ARCHITECTURE.md` | the completion rule, same commit |
| `backend/app/routers/coach.py` | APP KNOWLEDGE: no rest after the final set |

**Not touched:** `TimerContext.jsx` (existing `skipRest` is sufficient),
`StorageService.js`, `ApiService.js`, `SyncQueue.js`, `ActiveWorkoutService.js`,
the backend beyond the Coach prompt. Any need for one is scope growth and goes
back to the owner (ZONE_OVERRIDE_RULE).

## 7. Tests — each names the mutation that turns it red

**Provider**
1. Completing the last outstanding set returns `true`, calls `stopWorkTimer`,
   and does **not** call `startRestTimer`. *Mutation: restore the unconditional
   `startRestTimer` → red.*
2. Completing a set while others remain returns `false` and **does** start
   rest. *Mutation: always return `true` → red.*
3. **Out of order:** with two exercises, complete every set of exercise 2 and
   all but one of exercise 1, then complete exercise 2's positionally-last set
   first — returns `false`. Then complete exercise 1's remaining set — returns
   `true`. *Mutation: use "last set of the last exercise" → red on both halves.*
4. Un-completing returns `false` and calls `skipRest`, never `startRestTimer`.
   *Mutation: return `true` when un-completing → red.*
5. An unknown instance id, and a known instance with an unknown set id, each
   return `false` and call no timer method. *Mutation: drop the validation →
   the hypothetical counts a phantom set → red.*
6. A workout whose only outstanding set is a **warm-up** is finished by
   completing it. *Mutation: exclude warm-ups from the predicate → returns
   `false` → red.*
7. The predicate is computed without re-reading state after `updateSet`:
   assert `startRestTimer` was not called even when `updateSet` is made to
   resolve on a later tick. *Mutation: compute from a post-`updateSet` read →
   red or hangs.*

**Component** (`GuidedWorkoutView.test.jsx`, the existing ReactDOM/jsdom
pattern from `loginIdentity.test.jsx`)
8. Each of the three call sites — reps entry, Log Set, checkbox — opens the
   dialog when its completion finishes the workout. Three cases, one per site.
   *Mutation: unwire any single site → that case red.*
9. Finishing **while a rest is running** leaves `currentExerciseIndex`
   unchanged and the dialog open. *Mutation: drop the `wasRestingRef`
   suppression → the view advances → red.*
10. Finishing when no rest is running still opens the dialog and does not
    advance. *Mutation: call `skipRest` unconditionally without the
    suppression → red.*

## 8. Verification (HIGH tier)

- Full suite, production build, lint on every touched file.
- Every mutation above run, confirmed red, then the file restored to its exact
  pre-mutation checksum.
- Browser pass at desktop and 390 px: run a short workout to the final set and
  confirm no rest starts, the dialog appears, the view has not advanced, and
  the console is clean.
- Live pass on the standing account `agent-test-data@example.com`; no new
  account is created (TEST_ACCOUNT_RULE).
- Deploy confirmed by `railway deployment list --service … --json` reporting
  the pushed SHA with `SUCCESS` on both services. No schema probe — no backend
  contract change.

## 9. Risks

1. **A caller added later that ignores the return value** silently loses the
   behaviour. Mitigation: one shared handler in the view rather than three
   copies, and test 8 covers each site.
2. **StrictMode replay.** The predicate is pure and computed outside any
   updater, so a replay recomputes the same answer. Explicitly not stored in a
   ref or a mount guard — those do not survive replay (APP INVARIANTS).
3. **A rest already running at the moment of completion** is the interesting
   state, and it is what tests 9 and 10 exist for.

## 10. Done means

Completing the final outstanding set — in any order, from any of the three
controls — starts no rest timer, does not advance the view, and offers to
finish. Every other set behaves exactly as it does today. All tests green, all
mutations confirmed red, deploy verified on both services, `ARCHITECTURE.md`
and the Coach prompt updated in the same commit.
