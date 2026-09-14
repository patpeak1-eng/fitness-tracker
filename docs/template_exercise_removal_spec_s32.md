# Remove an exercise from a template — spec (S32)

**Zone:** HIGH — writes `custom_templates`, which is user data and syncs to the
backend. No new write path is introduced; see §2.

**Status:** revision 2, spec only. No code until the literal clearance.

**Revision 2 (2026-09-13).** Plan-stage cross-review (Codex, adversarial)
returned CHANGES-REQUIRED with eight findings; every one was re-verified
against the cited source lines and adopted. Revision 1 was wrong on three
load-bearing claims: a fork *does* re-point the live session (§6), START
*does* persist a dirty custom prep without an explicit save (§4 decision 4),
and `syncToTemplate` *does* touch built-ins with rich exercise objects (§6).
The file list was also incomplete. Owner decisions reopened by the review are
listed in §4b with recommendations; the clearance phrase is required against
this revision, not revision 1.

---

## 1. The problem

There is no way to remove an exercise from a template anywhere in the app.

Requested during the S30 TikTok work ("I'll need to be able to remove an
exercise from any custom template") and never built. Extended by the owner on
2026-09-13 to cover **built-in templates too** — with the rule that editing a
built-in must produce a **new custom template** and leave the built-in intact,
so the shipped baseline is always recoverable.

## 2. What already exists — read this before writing anything

The investigation found most of this feature already built. The work is a UI
path to code that has already been reviewed and shipped, plus two small
guards the review showed are missing.

| Piece | Where | State |
|---|---|---|
| Single canonical template write | `writeTemplate(id, transformFn)` | Shipped (S27). Refuses built-ins by design |
| Create / fork a custom template | `saveCustomTemplate(name, exercises)` | Shipped |
| **The fork rule itself** | `saveTemplateFromPrep(name)` | Shipped (S28) |
| Remove an exercise from the active workout | `removeExerciseFromWorkout(instanceId)` | Shipped, exposed on the context, **no UI caller anywhere**, **no guards** (§6) |
| Per-set remove control in prep | `ExerciseResult.jsx` (`isPrep`) | Shipped (S25.3), guarded in context *and* service |
| Remove-an-exercise control | `CreateTemplateModal` | Exists, but only while building a NEW template |

`saveTemplateFromPrep` already implements exactly the owner's rule:

- own custom template, name unchanged → updates in place, id and `backendId` preserved
- built-in under its own name → **refused**: *"…is a built-in template. Change the name to save your own copy."*
- anything else → forks a new custom template **and re-points the session at
  the copy** (`WorkoutContext.jsx` ~3302-3306; `docs/ARCHITECTURE.md` "Prep-screen
  save (S28)")

`WorkoutContext.jsx` states plainly that `writeTemplate` is the one write path
and **"there must never be a second write path."** This spec adds no second
path; it adds a caller.

## 3. Approach

Add a remove control to the **prep screen** — the stage after a template is
picked and before the workout starts — wired to the existing
`removeExerciseFromWorkout`. Saving then goes through the existing
`saveTemplateFromPrep`, which already does the right thing for both template
kinds.

**Component boundary.** Each prep row is rendered by
`src/components/workout/ExerciseResult.jsx`, which already owns the prep-only
per-set remove control and imports the trash icon. The visible
remove-exercise button goes in that component's prep header, beside the info
button. `TrackWorkout.jsx` owns the pending target and the confirmation
`Modal` (it owns collection length and session flow) and passes
`canRemoveExercise` and `onRequestRemoveExercise` down as props. The control
renders only for object-shaped `workoutData` with an instance id; it never
passes a catalog exercise id to the instance-id API.

Rejected: a dedicated template editor. It is a much larger surface for the same
outcome, and it would need its own write path — the thing the codebase
explicitly forbids.

## 4. Decisions (owner-approved 2026-09-13, revised by review)

1. **Route.** Prep-screen removal plus the existing save path. Not a dedicated
   editor.
2. **Fork naming.** Keep today's behaviour — a built-in under its own name is
   refused and the user types a name. The field is **prefilled** with a
   suggestion (`"<name> (my version)"`) so the refusal is a one-tap fix rather
   than a dead end. See §4b decision B for collisions.
3. **Removing the last exercise is refused.** An empty template cannot start a
   workout, so it would be a trap rather than a state worth supporting. The
   control is disabled with a visible reason when one exercise remains, **and**
   the context mutation and the service each independently preserve the final
   exercise (§6) — the same two-layer pattern the per-set remove already uses.
4. **Persistence.** *Revision 1 said "scoped to the session until an explicit
   save". That is not what shipped S28 code does and the review rejected it.*
   Correct contract: removal changes the active prep immediately. Backing out
   before Save or START leaves the source untouched. For an **own custom**
   source, START is an existing S28 persistence trigger (`handleStartWorkout`,
   `TrackWorkout.jsx` ~193-206) and saves dirty prep in place — so starting
   after a removal persists the removal to that custom template. For a
   **built-in** source, START never forks; the removal persists only when Save
   creates a named custom copy. See §4b decision A.

### 4b. Owner decisions reopened by the review — awaiting answers

| # | Decision | Recommendation |
|---|---|---|
| A | START after a removal on an own custom template: keep today's auto-save (decision 4 as written above), or add a confirm step, or suppress auto-save for structural changes (alters shipped S28 behaviour; scope growth) | **Keep today's auto-save.** Set edits already persist on START the same way; a removal is one more edit |
| B | Prefilled fork name collides with an existing custom name (nothing prevents duplicate names locally or server-side: `saveCustomTemplate` always appends; `custom_templates.name` has no uniqueness constraint) | **Prefill the first free variant** (`"<name> (my version)"`, then `"<name> (my version 2)"`…, trimmed, case-insensitive) and reject a colliding submit with an inline error. UI-only, `TrackWorkout.jsx` |
| C | Scope growth: the review found two guards that require touching `WorkoutContext.jsx` and `ActiveWorkoutService.js` (§6). Revision 1 forbade any context change | **Accept the two guards** — each is a few lines, both close real holes in the invariant the owner asked for, and the zone was already HIGH |

## 5. Files

| File | Change |
|---|---|
| `src/components/workout/ExerciseResult.jsx` | Remove-exercise button in the prep header (prep mode only); exercise-named accessible label; visible final-exercise reason; replace the pre-existing warning emoji in the data-mismatch fallback (line ~33) with a Lucide icon or plain text — repo invariant, same file |
| `src/components/workout/ExerciseResult.css` | Button styling per `docs/DESIGN_TOKENS.md`: `var(--danger)` for the destructive hover, not the hard-coded `#ff4d4d` the per-set button uses |
| `src/pages/TrackWorkout.jsx` | Pending-removal state; reusable `Modal` confirmation; `canRemoveExercise` from exercise count; prefilled fork name with collision handling (decision B); pass props down |
| `src/pages/TrackWorkout.css` | Any modal/notice styling not already present |
| `src/context/WorkoutContext.jsx` | Two guards, no new write path: (1) `syncToTemplate` returns without mutation when the resolved template is not custom; (2) `removeExerciseFromWorkout` uses the functional `prev`, accepts only `status === 'preparing'`, requires a matching instance id, and preserves at least one exercise |
| `src/services/ActiveWorkoutService.js` | `removeExercise` independently preserves the final exercise |
| `src/context/templateSave.provider.test.jsx` | New. Real-provider tests for the save/fork contract (§7) |
| `src/services/ActiveWorkoutService.test.js` | New or extended. Floor invariant for `removeExercise` |
| `docs/ARCHITECTURE.md` | Same commit: the built-in prep boundary (`syncToTemplate` never writes a built-in), the remove-exercise prep control, and the guards |

No change to `StorageService.js`, `ApiService.js`, or the backend. If
implementation finds one is needed, that is a **scope change** and goes back to
the coordinator (ZONE_OVERRIDE_RULE).

## 6. Risks and defects found at plan review

- **Built-in mutation through `syncToTemplate` (found by review, verified).**
  Any prep weight/rep edit calls `updateSet`, which calls `syncToTemplate` for
  every `sourceTemplateId` **without checking `isCustom`**
  (`WorkoutContext.jsx` ~2586-2588, ~2600-2647). For a built-in with rich
  exercise objects — today only "Dumbbell Full Body" — the in-memory entry in
  `templates` is replaced with an edited copy and the shared exercise object's
  `sets` is reassigned in place. Provider state is initialized from the module
  constant `DEFAULT_TEMPLATES` by reference, so that shared object *is* the
  constant's entry: the edit survives a profile switch and lasts until reload.
  The localStorage write is skipped because the built-in is not in custom
  storage, so nothing persists or syncs. It is still a live violation of "the
  built-in is untouched", and it would make the §7 built-in-unchanged
  test fail whenever a set was edited before the fork. Fix: an early return
  when the resolved template is not custom. Revision 1's claim that
  `syncToTemplate` only writes custom templates was **wrong**.
- **`sourceTemplateId` after a fork (revision 1 had this backwards).** Every
  successful create/fork re-points the active session at the created custom
  template (`WorkoutContext.jsx` ~3302-3306). Subsequent set edits,
  recommendations, and a later dirty START target that copy. Before a fork
  succeeds the source remains the built-in; after success the built-in must
  remain untouched. This is deliberate S28 behaviour and is kept.
- **No guards on the orphaned mutation.** `removeExerciseFromWorkout`
  (`WorkoutContext.jsx` ~2938-2944) checks only a captured truthy
  `activeWorkout`, then delegates with no status, target, or floor guard;
  `ActiveWorkoutService.removeExercise` removes the last exercise. Contrast
  `removeSet`, which is guarded in both places. A UI-only guard is an
  affordance, not an invariant. Both layers get the guard.
- **Legacy string-shaped active workouts.** Every current creation path
  (template start, Coach plan) produces instance objects with generated ids.
  Hydration and backup restore admit any non-empty `exercises` array without
  shape checks, but such a prep already crashes in the dirty-state serializer
  before any remove call, so this is not a new silent no-op path. Normalizing
  malformed legacy snapshots is a separate, pre-existing scope; not here.
- **Confirm before removing.** Removal is destructive from the user's point of
  view; prep can hold a long list, and a mis-tap should not be silent. The
  existing reusable `Modal` (as used for template delete) is the pattern.
- **Dirty state.** The saved-snapshot comparison serializes
  `templateExercisesFromWorkout(activeWorkout)`, so a removal re-arms Save and
  START's auto-save with no change needed.

## 7. Done means

- An exercise can be removed from a custom template, and the change persists
  (via Save, or via START per decision 4).
- The same on a built-in produces a **new** custom template; the built-in is
  unchanged afterwards — including after set edits made before the fork.
- Removing the last exercise is not possible: control disabled with a reason,
  context refuses, service refuses.
- Abandoning prep leaves both template kinds untouched.
- No emoji in any touched file; icons from `lucide-react`.

**Tests — each mutation-checked** (revert the behaviour, confirm red, record
the mutation in the commit message). Eight tests this session could not fail;
that is the default assumption now, not the exception.

`src/context/templateSave.provider.test.jsx` — real provider mounted, only
`ApiService` mocked (pattern: `docs/skills/provider-level-testing.md`;
harness: `workoutDeletion.provider.test.jsx`). Functions taken off the
context, never the module.

1. **Built-in refusal.** Start a built-in, `saveTemplateFromPrep(<its name>)`
   → `{ ok: false }`, no custom entry written, session still points at the
   built-in.
2. **Fork leaves the original intact.** Start the rich-object built-in
   ("Dumbbell Full Body"), capture the provider's built-in object serialized;
   edit a set, remove an exercise, `saveTemplateFromPrep("<name> (my version)")`
   → the provider's built-in entry is serialized-equal to the capture; no
   stored custom entry reuses its id; the new custom has a distinct id and the
   reduced, edited payload; `activeWorkout.sourceTemplateId` now equals the new
   id. *"Unchanged" is defined against provider state, not localStorage —
   localStorage never holds built-ins.* Mutation: remove the `isCustom` guard
   in `syncToTemplate` → red.
3. **In-place update for an own custom template.** Create a custom, start it,
   remove an exercise, save under the same name → same id and `backendId`,
   exercise count reduced, exactly one custom entry in storage.
4. **Repeated fork with the prefilled name** (decision B) → second fork gets
   the next free name, or is refused inline; never two identical names.
5. **Last-exercise guard (context).** With one exercise,
   `removeExerciseFromWorkout(id)` leaves the workout unchanged; with two, it
   removes one. Also: no-op outside `preparing`, no-op for an unknown id.

`src/services/ActiveWorkoutService.test.js` — `removeExercise` preserves the
final exercise; removes a non-final one.

## 8. Verification (HIGH tier — VERIFICATION_TIER_RULE)

Revision 1 called this LOW-risk and waived the disposable account. The zone is
HIGH by the spec's own classification, so:

1. Focused tests green, each with its recorded breaking mutation; `npm run
   build` and lint clean.
2. `npm run dev` on a clean profile (the template picker only renders with no
   active workout — see `docs/skills/`). Desktop and 390 px; console clean.
   Exercise: custom remove + Save; custom remove + START (auto-persist);
   built-in remove + Save with the prefilled name; built-in remove + back out;
   last-exercise refusal.
3. Deploy, then confirm the live build reports the pushed SHA on **both**
   Railway services (`railway deployment list --service … --json`).
4. Disposable cloud account on the live build (TEST_ACCOUNT_RULE): custom
   in-place update and built-in fork, each confirmed across a reload and a
   pull; delete the account through Settings in the same session, credentials
   retained until then.
5. Remote SHA proof via `git ls-remote`. No schema probe: no backend contract
   changes.
