# S34 — Reorder exercises by dragging, and no rest timer at the end

> Spec committed alone under SPEC_FIRST_RULE. No implementation code.
> Anchored to `c766002`. Every file:line below was read at that revision.

## 1. The two asks, in the owner's words

> "I would like to have a bundle of dots … to be able to press and hold to then
> move the exercises up or down from the list … I want to apply that to both a
> whatever custom templates there are and also what defaults the default
> templates there are so this will apply globally."

> "at the end of completing the entire workout we currently have the resting
> timer after the very last exercise … there's no need to rest because the
> workout is completed. So I'd like to take out the rest timer at the very end
> … Or maybe we can get a pop up window saying finish workout."

Two features, one spec, because they share `WorkoutContext.jsx` and the prep /
guided surfaces. **Zone: HIGH** — A persists to `custom_templates`, and both
touch `WorkoutContext.jsx`. Two clearances, plan review first.

## 2. What already exists (Ponytail rung 5 — this is most of the work)

- **Order is already derived from the workout array.**
  `templateExercisesFromWorkout` maps `workout.exercises` in order
  (`WorkoutContext.jsx:3123-3132`). Reordering the session array and saving
  therefore persists the new order **with no change to any save path.**
- **The structural-save and fork rules already shipped in S27/S32.**
  `saveTemplateFromPrep` updates an own custom in place under the same name,
  refuses a built-in under its own name, and otherwise forks;
  `writeTemplate` is the single canonical write path and refuses built-ins.
  **No new persistence path is introduced by this spec.**
- **A "Finish Workout?" dialog already exists**
  (`GuidedWorkoutView.jsx:719-726`, reusing the shared `Modal`), driven by
  `confirmModal` state (`:67`) and `handleConfirmFinish` (`:224`). Feature B
  triggers this existing dialog; it builds no new component.
- **The two-layer guard pattern exists**: context guard plus an independent
  service guard, identity-preserving on refusal
  (`WorkoutContext.jsx:2926-2934`, `ActiveWorkoutService.js:31-42`).

**Why this is safe to build now and was not before.** Until `eb6039b`, prep set
edits resolved the template row by *position*
(`syncToTemplate`). Reordering on top of that would have written weights onto
the wrong exercise. `resolveSyncTargetIndex` now matches by catalog id
(`WorkoutContext.jsx:2515-2532`), so reordering cannot mis-target. This is a
load-bearing dependency and §7 tests it explicitly.

## 3. Feature A — drag to reorder

### Mechanism: Pointer Events, no new dependency

No drag library is installed (`package.json`). HTML5 drag-and-drop is not an
option — it does not fire on touch without a polyfill, and the owner's primary
device is a phone.

Pointer Events cover mouse, touch and pen in one code path. The dedicated grip
handle is what makes this tractable: `touch-action: none` applies **to the
handle only**, so a drag started on the handle never scrolls the page, while
the rest of the card scrolls normally. That removes the hardest problem in
touch reordering without a hold delay or a scroll-lock hack.

### Interaction contract

- Grip renders in the prep exercise header, **left of the name**, inside
  `.header-left` before the `<h3>` (`ExerciseResult.jsx:54-59`). Icon:
  `GripVertical` from `lucide-react` — six dots, the platform convention.
  No emoji (APP INVARIANTS).
- Prep only (`isPrep && workoutData && typeof onReorder === 'function'`),
  mirroring `showRemoveExercise` (`ExerciseResult.jsx:14`).
- Drag begins after **6 px of pointer movement** from the handle, not on a
  hold — see decision A in §4.
- While dragging: the dragged card is visually lifted; as the pointer crosses a
  neighbour's **measured midpoint**, the list reorders live. Midpoints come
  from real `getBoundingClientRect()` reads, never assumed row heights — prep
  rows vary in height with set count.
- Auto-scroll when the pointer is within 48 px of the viewport top or bottom,
  so a long list is reorderable on a phone.
- Release commits; pointer cancel or Escape reverts to the pre-drag order.
- `prefers-reduced-motion` suppresses the transition; the reorder still happens.

### Keyboard, which is not optional

ACCESSIBILITY is never on the chopping block (global CLAUDE.md). The handle is
a real `<button>`, focusable, `aria-label="Reorder {exercise name}"`. With it
focused, **Arrow Up / Arrow Down move that exercise one position** and move
focus with it. A polite `aria-live` region announces
`"{name}, position {i} of {n}"`. This is the whole keyboard story — no
drag-mode state machine.

### State ownership

`TrackWorkout.jsx` owns the drag session (which instance, the live target
index, the pre-drag snapshot) and passes `onReorder` plus drag flags down, the
same split S32 used for removal: the page owns the collection, the row owns its
control. Pointer maths live in a **ref**, not state — a re-render mid-drag must
not lose `setPointerCapture`.

### Mutation and guards

New pure `ActiveWorkoutService.reorderExercise(state, { exerciseInstanceId, toIndex })`:

- returns `state` unchanged if `!state`, if the id is not present, if `toIndex`
  is out of `[0, length-1]`, or if `toIndex` equals the current index
- otherwise removes the item and re-inserts it at `toIndex`
- never mutates the input; the exercise objects themselves are carried by
  reference so set identity is preserved

New `WorkoutContext.reorderExerciseInWorkout(exerciseInstanceId, toIndex)`,
guards mirroring `removeExerciseFromWorkout` exactly
(`WorkoutContext.jsx:2926-2934`): functional `prev`, refuse unless
`prev.status === 'preparing'`, refuse an unknown id, **return `prev` by
identity on every refusal**. Exposed on the context value beside
`removeExerciseFromWorkout` (`:3630`).

Two layers, deliberately: the service guard is independent of the UI, matching
the established `removeSet` / `removeExercise` shape.

### Built-ins

Reordering a built-in changes the **session only**. The built-in is never
written — `syncToTemplate` returns early for non-custom
(`WorkoutContext.jsx:2552`), `writeTemplate` refuses built-ins, and
`saveTemplateFromPrep` refuses a built-in under its own name and forks
otherwise. Saving a reordered built-in therefore prompts for a name and creates
the user's own copy, exactly as removal does. **No code change is required for
this**; §7 proves it rather than implements it.

## 4. Owner decisions

Accepted in conversation 2026-09-20, recorded here:

| # | Decision |
|---|---|
| 1 | Hand-rolled Pointer Events, no drag dependency |
| 2 | Reordering a built-in forks on save; the built-in is never modified |
| 3 | A reorder is session-local until Save or START, like removal |
| 4 | Completing the final set skips rest and opens the existing Finish dialog |
| 5 | "The end" means no incomplete sets remain anywhere, not a positional last set |

### 4b. One deviation the owner should confirm — decision A

The ask said "press and hold". This spec starts the drag on **6 px of
movement, with no hold delay**, because the grip is a dedicated handle: a
press there can only mean reorder, so a hold would add latency for nothing, and
`touch-action: none` on the handle already prevents the scroll conflict a hold
delay normally exists to solve. Todoist and Things behave this way.

If the owner prefers a literal press-and-hold, it is a one-constant change
(a ~180 ms timer before the drag arms) and no other part of this spec moves.

## 5. Feature B — no rest timer when the workout is finished

### Today

`toggleSetComplete` (`WorkoutContext.jsx:2635-2672`) ends with an
**unconditional** `timerApiRef.current?.startRestTimer()` on completion
(`:2667`). It fires after every set, the workout's final set included.

### Change

On completion only, compute whether the workout is finished **after applying
this toggle** — not from the pre-toggle `activeWorkout`, which is stale.
Finished means: across every exercise, every set has `completed === true`,
with the set being toggled counted as complete.

- finished → stop the work timer, **do not** start rest, and report completion
- not finished → today's behaviour exactly, unchanged

`toggleSetComplete` **returns** whether the workout is now finished.
`GuidedWorkoutView` opens its existing `confirmModal` on `true`
(call site `:525`). No new context state, no new component, no new modal.

### Deliberate edge-case positions

- **Warm-up sets count.** They are ordinary sets the athlete ticks
  (`:2645-2648` only exempts them from PR checks). Excluding them would fire
  the prompt early.
- **Un-ticking after the prompt** does not force the dialog closed; it is
  dismissible as it is today. Re-ticking fires it again, which is correct.
- **Skipped sets** mean the prompt never fires, and the existing Finish button
  behaves exactly as it does now. This is the intended fallback, not a gap.
- The prompt **does not finish the workout by itself.** It asks. `finishWorkout`
  still runs only from `handleConfirmFinish` (`:224-230`).

## 6. Files

| File | Change |
|---|---|
| `src/services/ActiveWorkoutService.js` | new pure `reorderExercise` + guards |
| `src/services/ActiveWorkoutService.test.js` | service guard tests |
| `src/context/WorkoutContext.jsx` | `reorderExerciseInWorkout` + expose; `toggleSetComplete` returns finished-ness and skips rest |
| `src/components/workout/ExerciseResult.jsx` | grip handle in the prep header |
| `src/components/workout/ExerciseResult.css` | handle styles, `touch-action: none`, drag state |
| `src/pages/TrackWorkout.jsx` | drag session state, pointer handlers, `onReorder` wiring |
| `src/pages/TrackWorkout.css` | dragging/placeholder styles if needed |
| `src/components/workout/GuidedWorkoutView.jsx` | open the existing Finish dialog on completion |
| `src/context/templateSave.provider.test.jsx` | reorder + fork + reorder-then-set-edit |
| `src/pages/TrackWorkout.test.jsx` | keyboard reorder and drag wiring |
| `docs/ARCHITECTURE.md` | reorder mutation + end-of-workout rest rule, same commit |
| `backend/app/routers/coach.py` | APP KNOWLEDGE: reordering exists |

**Not touched:** `StorageService.js`, `ApiService.js`, `SyncQueue.js`, and the
backend beyond the Coach prompt. If any turns out to be needed, that is scope
growth and goes back to the owner (ZONE_OVERRIDE_RULE).

## 7. Tests — each names the mutation that turns it red

**Service** (`ActiveWorkoutService.test.js`)
1. Moves an exercise to a new index; others keep relative order; set objects
   preserved by identity. *Mutation: splice without removing first → duplicate.*
2. Unknown id, out-of-range index, and same-index each return `state` **by
   identity**. *Mutation: drop the equality check → a new object → red.*

**Provider** (`templateSave.provider.test.jsx`)
3. Reorder in prep, then Save under the same name: the stored custom's
   exercise order matches the new session order. *Mutation: reorder returns
   prev → order unchanged → red.*
4. **Reorder, then edit a set on a moved exercise.** The edit lands on the
   right exercise by catalog id, and the untouched one is unchanged. This is
   the S32 regression guard. *Mutation: resolve positionally → wrong row → red.*
5. Reorder a **built-in**, save under a new name: the built-in in provider
   state is deep-equal to a pre-action snapshot, and the new custom carries the
   reordered payload. *Mutation: drop the `isCustom` early return → red.*
6. Reorder refused when `status !== 'preparing'`; `activeWorkout` identity
   unchanged. *Mutation: drop the status guard → red.*
7. Completing the final outstanding set does **not** start rest and reports
   finished; completing a non-final set **does** start rest. Assert against a
   mocked `timerApiRef`. *Mutation: restore the unconditional `startRestTimer`
   → red.*
8. Completing a set while another exercise still has an outstanding set does
   not report finished — covers out-of-order ticking. *Mutation: use
   "last set of last exercise" instead of "none outstanding" → red.*

**Page** (`TrackWorkout.test.jsx`, existing ReactDOM/jsdom pattern)
9. Arrow Down on a focused grip moves that exercise one position and calls
   `reorderExerciseInWorkout` with the right index exactly once.
   *Mutation: unbind the key handler → red.*
10. A synthesised pointerdown → pointermove past the next row's midpoint →
    pointerup calls reorder once with the expected target index.
    *Mutation: remove the pointerup commit → red.*

## 8. Verification (HIGH tier)

- Full suite, production build, lint on every touched file.
- Every mutation above run and confirmed red, then the file restored to its
  exact pre-mutation checksum.
- Browser pass at desktop **and 390 px**: drag with a mouse, drag by touch
  emulation, keyboard reorder, and a full workout to the final set confirming
  no rest timer and the dialog. Console must be clean.
  `.main-content` caps at 600 px — verify at the width the app renders.
- Live pass on the standing account `agent-test-data@example.com`
  (TEST_ACCOUNT_RULE); no new account is created.
- Deploy confirmed by `railway deployment list --service … --json` reporting
  the pushed SHA with `SUCCESS` on both services. No schema probe — no backend
  contract changes.

## 9. Risks

1. **Three controls in one header** — grip, info, remove — each wanting 44 px
   inside a 600 px-capped column. At 390 px this is the real design risk.
   Mitigation: grip and remove at 44 px on the outer edges, name truncating
   with ellipsis between them; if it does not fit, the fallback is a 32 px grip
   with a 44 px hit area via padding, which keeps the touch target legal.
2. **Pointer capture lost on re-render.** Mitigation: drag maths in refs; the
   capture lives on the handle element, which does not unmount during a drag.
3. **Duplicate catalog ids.** A template listing the same exercise twice
   already fails closed for set write-through (S32, backlog 7b). Reordering
   does not make this worse, and test 4 uses distinct exercises so it does not
   accidentally depend on the ambiguous path.
4. **Auto-scroll and momentum scrolling on iOS** can fight each other.
   Mitigation: auto-scroll via `window.scrollBy` in a rAF loop only while a
   drag is active, cancelled on pointerup.
5. **`toggleSetComplete` gains a return value.** Any other caller ignoring it
   is unaffected, but every call site is checked during implementation.

## 10. Done means

- An exercise can be dragged by its grip, on phone and with a mouse, and with
  Arrow keys, and the new order survives Save and START.
- A reordered built-in leaves the built-in untouched and forks to a named copy.
- Completing the final outstanding set starts no rest timer and offers to
  finish; completing any other set is unchanged.
- All tests green, all mutations confirmed red, deploy verified on both
  services, `ARCHITECTURE.md` and the Coach prompt updated in the same commit.
