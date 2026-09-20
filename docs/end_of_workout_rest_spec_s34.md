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

**What actually happens today.** `goToNext` (`:207-222`) advances the set,
else the exercise, else — on the final set of the final exercise —
`setConfirmModal({ isOpen: true })` (`:220`). The auto-advance effect (`:123`)
calls it once a rest has run down. So the dialog the owner is asking for
*already appears*; it just appears **after sitting through a rest timer**.

This feature is therefore not new behaviour. It brings an existing dialog
forward to the moment of completion and drops the pointless rest. Two
consequences for the tests in §7: the dialog opening is **not** proof that the
advance was suppressed, because `goToNext`'s third branch opens it too; and the
advance must be asserted against both `currentSetIndex` and
`currentExerciseIndex`, since the first branch (`:212-214`) moves the set index
while leaving the exercise index alone.

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
1. If a rest is currently live — `isActive`, or paused with `timeLeft > 0` —
   **arm a suppression latch** (§4.3).
2. `skipRest()`, to clear that rest.
3. Open the existing `confirmModal`.

Timer orchestration stays in the view, where the advance lifecycle lives; the
context stays the decision-maker. No new context state, no new component.

### 4.3 Suppressing the auto-advance — a latch, not a one-shot ref

`:123` advances when a rest transitions to `isActive === false` with
`timeLeft === 0`, which is exactly the state `skipRest`
(`TimerContext.jsx:129-131`) produces. Without suppression, finishing while a
rest is running advances the view underneath the dialog.

**Clearing `wasRestingRef` is not sufficient, and revision 1 was wrong to say
it was.** `:126` re-writes `wasRestingRef.current = restTimer.isActive` on
*every* run of that effect, unconditionally. A passive effect queued from an
earlier rest tick can therefore run *after* the completion handler cleared the
ref and set it back to `true`; the subsequent stopped/zero effect then sees
`true` and advances. The plan reviewer reproduced this against the installed
React with a forced scheduler yield — a deterministic scheduling model, not a
device-specific flake.

**Required lifecycle** for a separate `suppressAdvanceRef`:

- **Arm** it in the completion handler *only when a rest is actually live*
  (`isActive`, or paused with `timeLeft > 0`). Arming when the rest is already
  idle would leave it armed with no transition coming, wrongly swallowing a
  later legitimate advance.
- **In the advance effect, check the latch before anything else.** While armed:
  do not call `goToNext`; still keep `wasRestingRef` honest by assigning
  `restTimer.isActive` as today; and **disarm only once the cleared transition
  is actually observed** (`!isActive && timeLeft === 0`). This is what makes it
  survive stale effects — a re-arming write from an older effect no longer
  matters, because the latch, not the ref, gates the advance.
- **Disarm on cleanup**: when the active workout changes or the view unmounts,
  so a latch can never leak across workouts.

The latch is a view-lifecycle ref, which is the appropriate tool here — see the
StrictMode note in §9.

## 5. Deliberate positions

- The dialog **asks**; it does not finish the workout. `finishWorkout` still
  runs only from `handleConfirmFinish` (`:224-230`).
- Un-ticking a set after the dialog opens does not force it closed; it stays
  dismissible as today. Re-ticking opens it again, which is correct.
- Skipping sets means the prompt never fires and the Finish button behaves
  exactly as it does now. Intended fallback, not a gap.
- This job adds **no new drag or touch gesture**, so it carries none of job 2's
  pointer-behaviour divergence. It is still verified on **both** iPhone and
  Android, because it touches the final-set input path, the on-screen keyboard
  dismissal after `blur()` (`:297`), and dialog presentation — all of which do
  differ between the two.

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
6. **Warm-ups count, in two steps** — one step cannot kill the mutation.
   With an incomplete warm-up plus an incomplete normal set: completing the
   normal set returns `false`; *then* completing the warm-up returns `true`.
   *Mutation: filter warm-ups out of the predicate → the first half returns
   `true` → red.* (A single-step version passes under that mutation, because
   dropping the only outstanding warm-up leaves every retained set complete.)
7. **Same-event ordering.** In one `act`, drive the real provider the way
   `commitActualReps` does: `updateSet` writing the final set's reps, then
   `toggleSetComplete` immediately. Assert the call returns `true`
   **synchronously**, and that after commit the reps and the completed flag
   both survived. *Mutation: compute the predicate from a re-read of
   `activeWorkout` after `updateSet` → the toggle sees stale state → red.*
   (Revision 1 proposed deferring an `updateSet` promise. That is not
   constructible: `updateSet` returns `void` and is lexically captured.)

**Component** (`GuidedWorkoutView.test.jsx`, the existing ReactDOM/jsdom
pattern from `loginIdentity.test.jsx`)
8. Each of the three call sites — reps entry, Log Set, checkbox — opens the
   dialog when its completion finishes the workout. Three cases, one per site.
   *Mutation: unwire any single site → that case red.*
9. Finishing **while a rest is running** does not advance. The fixture must
    have a **navigable following exercise** and must drive the timer through
    real stateful updates, not a frozen mock — otherwise the effect never
    fires and the test passes for the wrong reason. Assert **both**
    `currentSetIndex` and `currentExerciseIndex` are unchanged; the dialog
    being open proves nothing, since `goToNext`'s third branch (`:220`) opens
    it too. *Mutation: gate the advance on `wasRestingRef` alone instead of
    the latch, with a stale re-arming effect in play → the view advances →
    red.*
10. Finishing while a rest is **paused with time remaining** clears it: the
    rest timer ends at zero and inactive, and the view still does not advance.
    *Mutation: skip the `skipRest()` call on a paused rest → a paused timer
    survives behind the dialog → red.* (Revision 1's mutant — dropping
    suppression while idle — cannot fail, because neither version advances
    when there was no rest transition to begin with.)
11. Arming is **conditional**: finishing with no rest live leaves the latch
    disarmed, so a later legitimate rest-driven advance still works.
    *Mutation: arm unconditionally → the next advance is swallowed → red.*

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
2. **StrictMode.** The predicate is pure and computed outside any state
   updater, so it is safe. The APP INVARIANTS warning about mount-guard refs
   is about refs used to gate *effects on mount*, which StrictMode replays —
   it does not apply here: ordinary event handlers are not replayed, and the
   §4.3 suppression latch is a view-lifecycle ref, which is the right tool.
   Revision 1 over-applied that invariant.
3. **A rest live at the moment of completion** — running or paused — is the
   interesting state, and what tests 9, 10 and 11 exist for. The stale-effect
   re-arming in §4.3 is the specific failure they guard.

## 10. Done means

Completing the final outstanding set — in any order, from any of the three
controls — starts no rest timer, does not advance the view, and offers to
finish. Every other set behaves exactly as it does today. All tests green, all
mutations confirmed red, deploy verified on both services, `ARCHITECTURE.md`
and the Coach prompt updated in the same commit.
