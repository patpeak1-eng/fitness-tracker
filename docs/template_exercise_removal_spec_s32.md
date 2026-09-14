# Remove an exercise from a template — spec (S32)

**Zone:** HIGH — writes `custom_templates`, which is user data and syncs to the
backend. No new template-persistence path is introduced; see §2.

**Status:** revision 4, spec only. No code until the literal clearance.

**Revision 2 (2026-09-13).** Plan-stage cross-review (Codex, adversarial)
returned CHANGES-REQUIRED with eight findings; every one was re-verified
against the cited source lines and adopted. Revision 1 was wrong on three
load-bearing claims: a fork *does* re-point the live session (§6), START
*does* persist a dirty custom prep without an explicit save (§4 decision 4),
and `syncToTemplate` *does* touch built-ins with rich exercise objects (§6).
The file list was also incomplete.

**Revision 3 (2026-09-13).** Round-2 re-review: F1–F5 and F8 resolved; F6/F7
not, plus five new findings (N1–N5), all verified and adopted. The decisive
one (N2): a template created in the same page session never gets its
`backendId` into provider state — only into storage — so the next in-place
save overwrites the stored row without it and POSTs a duplicate cloud row.
This feature's primary flow (fork a built-in, then START) hits exactly that,
so the fix is in scope (§4b decision D).

**Revision 4 (2026-09-13).** Round-3 re-review: N1, N4, N5 resolved; N2/N3
reworked; four new findings (R3-F1–F4), all verified and adopted. Decision D's
acknowledgement-only mechanism could not keep one cloud row when a second
save lands before the first create settles, and it missed the queue-replay
acknowledgement and the profile gate; D is now a shared adoption contract
plus create/update serialization. The collision rule's boundary is stated
narrowly. A page-level `TrackWorkout` test is added — revision 3's claim that
the repo has no page-level harness was false (`src/pages/loginIdentity.test.jsx`).
The clearance phrase is required against this revision.

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
path to code that has already been reviewed and shipped, plus small guards and
one state-adoption fix the reviews showed are missing.

| Piece | Where | State |
|---|---|---|
| Structural template write | `writeTemplate(id, transformFn)` | Shipped (S27). Refuses built-ins by design |
| Create / fork a custom template | `saveCustomTemplate(name, exercises)` | Shipped |
| **The fork rule itself** | `saveTemplateFromPrep(name)` | Shipped (S28) |
| Set-field write-through | `syncToTemplate(...)` via `updateSet` | Shipped; **no built-in check** (§6) |
| Remove an exercise from the active workout | `removeExerciseFromWorkout(instanceId)` | Shipped, exposed on the context, **no UI caller anywhere**, **no guards** (§6) |
| Per-set remove control in prep | `ExerciseResult.jsx` (`isPrep`) | Shipped (S25.3), guarded in context *and* service |
| Remove-an-exercise control | `CreateTemplateModal` | Exists, but only while building a NEW template |

`saveTemplateFromPrep` already implements exactly the owner's rule:

- own custom template, name unchanged (**exact** string match after trim) →
  updates in place, id and `backendId` preserved
- built-in under its own name → **refused**: *"…is a built-in template. Change the name to save your own copy."*
- anything else → forks a new custom template **and re-points the session at
  the copy** (`WorkoutContext.jsx` ~3302-3306; `docs/ARCHITECTURE.md` "Prep-screen
  save (S28)")

**Persistence paths.** This feature introduces no new template-persistence
path. Structural saves (exercise membership) continue through
`saveTemplateFromPrep` → `writeTemplate` / `saveCustomTemplate`.
`syncToTemplate` remains the existing set-field write-through path (it writes
provider state and custom storage immediately on every prep weight/rep edit).
The `writeTemplate` comment about "never a second write path" refers to
structural writes; this spec adds a caller, not a path.

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

**Name rules live in a pure helper.** `src/utils/templateNames.js` exports
`normalizeTemplateName(name)` (trim + case-fold) and
`firstFreeTemplateName(base, templates)` (`"<base> (my version)"`, then
`"<base> (my version 2)"`…, first whose normalized form matches no custom
template). Pure, no context, unit-tested directly (§7). `TrackWorkout.jsx`
consumes it; the provider is unchanged by it.

Rejected: a dedicated template editor — a much larger surface than the
approved prep-screen route for the same outcome.

## 4. Decisions (owner-approved 2026-09-13, revised by review)

1. **Route.** Prep-screen removal plus the existing save path. Not a dedicated
   editor.
2. **Fork naming.** Keep today's behaviour — a built-in under its own name is
   refused and the user types a name. The field is **prefilled** with the first
   free suggestion (§3 helper) so the refusal is a one-tap fix rather than a
   dead end. Collision rule in §4b decision B.
3. **Removing the last exercise is refused.** An empty template cannot start a
   workout, so it would be a trap rather than a state worth supporting. The
   control is disabled with a visible reason when one exercise remains, **and**
   the context mutation and the service each independently preserve the final
   exercise (§6) — the same two-layer pattern the per-set remove already uses.
4. **Persistence.** Removal changes the active prep immediately. Backing out
   before Save or START leaves the source template's **exercise membership**
   unchanged (existing set-field write-through via `syncToTemplate` is
   unchanged and out of scope). For an **own custom** source, START is an
   existing S28 structural-save trigger (`handleStartWorkout`,
   `TrackWorkout.jsx` ~193-206) and saves dirty prep in place — so starting
   after a removal persists the removal to that custom template. For a
   **built-in** source, START never forks; the removal persists only when Save
   creates a named custom copy.

### 4b. Owner decisions reopened by review

A–C decided by the owner 2026-09-13 in his own words ("Accept all three
recommendations in spec 4b"). D decided by the owner 2026-09-13 ("Accept
decision D").

| # | Decision | Decided / recommended |
|---|---|---|
| A | START after a removal on an own custom template | **Decided: keep today's auto-save** (decision 4). START already invokes the structural save for dirty own-custom prep; set fields also have their separate immediate write-through through `syncToTemplate` |
| B | Fork-name collisions (nothing prevents duplicate names locally or server-side: `saveCustomTemplate` always appends; `custom_templates.name` has no uniqueness constraint) | **Decided, rule made action-aware (N1):** a submission whose trimmed name **exactly** equals `sourceTemplate.name` of an own custom is the in-place-update branch and is allowed without collision validation. Every other submission is a create/fork: compare its normalized name with every custom template **including the source** and reject a match inline (modal stays open, `saveTemplateFromPrep` not called). So a case-only rename of your own custom is refused rather than silently forked into a normalized duplicate. Built-in fork prefill uses the first free normalized name. UI-only, `TrackWorkout.jsx` + the §3 helper. **Boundary (R3-F3):** this rule prevents collisions for the prep Save modal and built-in forks only. The existing no-source START auto-save (`TrackWorkout.jsx` ~198-204, the Build-My-Own draft), the Coach save path (`CoachView.jsx` ~777-781), and assessment program import (`WorkoutContext.jsx` ~3400-3420) create custom templates directly and still permit normalized-duplicate names; they are outside this feature and unchanged. Own-custom START is safe (exact source name, in-place); built-in START never creates |
| C | Scope growth: guards in `WorkoutContext.jsx` and `ActiveWorkoutService.js` (§6) | **Decided: accept the two guards.** Each is a few lines, both close real holes in the invariant the owner asked for, and the zone was already HIGH |
| D | **Same-session `backendId` loss (N2, verified).** The cloud acknowledgement in `saveCustomTemplate` (~3244-3252) and in `writeTemplate`'s create branch (~2760-2767) writes `backendId` into storage only, never into provider state. `writeTemplate` then reads the stale provider object (~2728), overwrites the stored row with it (~2748-2752) and POSTs instead of PUTs (~2757-2759): the stored `backendId` is erased and a second cloud row is created. This feature's main path — fork a built-in, then START (auto-save on the now-custom source) — triggers it | **Decided: fix in scope** (owner, on the revision-3 mechanism; revision 4 completes it per R3-F1/F2). Contract: **(i) one shared adoption helper** `adoptTemplateBackendId(uid, localId, backendId)` used by all three create acknowledgements — `saveCustomTemplate` direct create (~3244), `writeTemplate`'s create branch (~2760), and the SyncQueue `'template'` executor (~781). It writes the originating `uid`'s custom storage first, then functionally updates provider state **only when `latestProfileIdRef.current === uid`** (the provider's established gate, ~683-685); a later profile load picks the id up from storage otherwise. **(ii) At most one create request pending per local id.** `saveCustomTemplate` records its create promise by local id in a ref. If `writeTemplate` finds no `backendId` while a create is pending, it persists the latest local payload as today but **chains one PUT of that latest payload after the create resolves** (or a queue enqueue if it rejects) — never a second POST. **(iii) If the create already failed into the queue**, `writeTemplate` re-enqueues the latest payload under the same `('template', localId)` — `SyncQueue.enqueue` already replaces by (type, key) — instead of a direct POST; this needs a queue-membership read, so `SyncQueue.js` gets a one-line `has(type, key)` if nothing equivalent exists. No new write path, no schema change. Tests in §7 (3b, 3c, 3d, 3e) |

## 5. Files

| File | Change |
|---|---|
| `src/components/workout/ExerciseResult.jsx` | Remove-exercise button in the prep header (prep mode only); exercise-named accessible label; visible final-exercise reason; replace the pre-existing warning emoji in the data-mismatch fallback (line ~33) with a Lucide icon or plain text — repo invariant, same file |
| `src/components/workout/ExerciseResult.css` | Button styling per `docs/DESIGN_TOKENS.md`: `var(--danger)` for the destructive hover, not the hard-coded `#ff4d4d` the per-set button uses |
| `src/pages/TrackWorkout.jsx` | Pending-removal state; reusable `Modal` confirmation; `canRemoveExercise` from exercise count; prefill + collision rule (decision B) via the helper; pass props down |
| `src/pages/TrackWorkout.css` | Any modal/notice styling not already present |
| `src/utils/templateNames.js` | New. `normalizeTemplateName`, `firstFreeTemplateName` (§3) |
| `src/utils/templateNames.test.js` | New. Unit tests for the helper (§7) |
| `src/context/WorkoutContext.jsx` | (1) `syncToTemplate` returns without mutation when the resolved template is not custom; (2) `removeExerciseFromWorkout` uses the functional `prev`, accepts only `status === 'preparing'`, requires a matching instance id, and preserves at least one exercise; (3) decision D: shared `adoptTemplateBackendId` used by all three create acknowledgements, profile-gated; pending-create ref and the chained-PUT / re-enqueue branch in `writeTemplate` |
| `src/services/SyncQueue.js` | Only if needed: a one-line `has(type, key)` membership read for decision D (iii) |
| `src/services/ActiveWorkoutService.js` | `removeExercise` independently preserves the final exercise |
| `src/context/templateSave.provider.test.jsx` | New. Real-provider tests for the save/fork contract and decision D (§7) |
| `src/pages/TrackWorkout.test.jsx` | New. Page-level jsdom tests for the collision gate wiring (§7), on the existing `loginIdentity.test.jsx` pattern (ReactDOM + `act`, no testing-library) |
| `src/services/ActiveWorkoutService.test.js` | New or extended. Floor invariant for `removeExercise` |
| `docs/ARCHITECTURE.md` | Same commit: the built-in prep boundary (`syncToTemplate` never writes a built-in), the remove-exercise prep control, the guards, and provider-state `backendId` adoption on create acknowledgement |

No change to `StorageService.js`, `ApiService.js`, or the backend. If
implementation finds one is needed, that is a **scope change** and goes back to
the coordinator (ZONE_OVERRIDE_RULE).

## 6. Risks and defects found at plan review

- **Built-in mutation through `syncToTemplate` (round 1, verified).**
  Any prep weight/rep edit calls `updateSet`, which calls `syncToTemplate` for
  every `sourceTemplateId` **without checking `isCustom`**
  (`WorkoutContext.jsx` ~2586-2588, ~2600-2647). For a built-in with rich
  exercise objects — today only "Dumbbell Full Body" — the in-memory entry in
  `templates` is replaced with an edited copy and the shared exercise object's
  `sets` is reassigned in place. Provider state is initialized from the module
  constant `DEFAULT_TEMPLATES` by reference (~570) and profile reload reuses
  the same constants (~1107), so that shared object *is* the constant's entry:
  the edit survives a profile switch and lasts until reload. The localStorage
  write is skipped because the built-in is not in custom storage, so nothing
  persists or syncs. It is still a live violation of "the built-in is
  untouched", and it would make the §7 built-in-unchanged test fail whenever a
  set was edited before the fork. Fix: an early return when the resolved
  template is not custom.
- **Same-session `backendId` divergence (round 2, verified; extended round 3).**
  See §4b decision D. Pre-existing; reachable today by creating a custom and
  then saving it in place within the same page session; made routine by this
  feature's fork-then-START path. Three orderings, all covered by D:
  acknowledgement already settled (adoption into provider state); second save
  **before** the create settles (one pending create per local id, chained
  PUT); create failed into the queue (re-enqueue replaces the queued payload).
  Adoption is profile-gated like every other async state adoption in the
  provider (~683-685, ~1013-1025). A later cloud pull adopts an orphaned row by
  `template_data.id` (~1488-1500) whether storage adoption ran before or after
  it, so pull ordering is safe — but a pull does not undo a duplicate POST,
  which is why (ii) and (iii) exist.
- **`sourceTemplateId` after a fork.** Every successful create/fork re-points
  the active session at the created custom template (~3302-3306). Subsequent
  set edits, recommendations, and a later dirty START target that copy. Before
  a fork succeeds the source remains the built-in; after success the built-in
  must remain untouched. Deliberate S28 behaviour, kept.
- **No guards on the orphaned mutation.** `removeExerciseFromWorkout`
  (~2938-2944) checks only a captured truthy `activeWorkout`, then delegates
  with no status, target, or floor guard; `ActiveWorkoutService.removeExercise`
  removes the last exercise. Contrast `removeSet`, guarded in both places. A
  UI-only guard is an affordance, not an invariant. Both layers get the guard.
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
- Backing out of prep leaves both template kinds' exercise membership
  untouched.
- A template forked or created in this session keeps one cloud row across a
  following in-place save (decision D).
- No emoji in any touched file; icons from `lucide-react`.

**Tests — each mutation-checked** (revert the behaviour, confirm red, record
the mutation in the commit message). Eight tests this session could not fail;
that is the default assumption now, not the exception.

`src/context/templateSave.provider.test.jsx` — real provider mounted, only
`ApiService` mocked (pattern: `docs/skills/provider-level-testing.md`;
harness: `workoutDeletion.provider.test.jsx`). Functions taken off the
context, never the module. Every precondition asserted.

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
3. **In-place update for an own custom template, seeded with a backend id.**
   Before mount, seed custom storage with
   `{ id: 'tpl_custom_seed', backendId: 'backend-sentinel', name: 'Own Custom', isCustom: true, exercises: [two entries] }`;
   assert the mounted provider exposes the sentinel (precondition). Start it,
   remove an exercise, save under the exact same name → provider and stored
   entries keep both ids; storage has exactly one row; exercise count reduced;
   `ApiService.updateCustomTemplate` called with `backend-sentinel`;
   `ApiService.saveCustomTemplate` **not** called.
   3b. **Same-session create then in-place save, acknowledgement settled
   (decision D-i).** Mock `saveCustomTemplate` with a **manually controlled
   deferred promise** (no acknowledgement promise is exposed, so "await the
   ack" is not deterministic otherwise). Start a built-in, fork it, release the
   deferred with `{ id: 'backend-new' }` inside `act`, flush; assert the
   provider's new entry carries `backend-new` (precondition, red today). Then
   `saveTemplateFromPrep(<fork name>)` → `updateCustomTemplate` called with
   `backend-new`, `saveCustomTemplate` called exactly once overall, stored row
   still has `backend-new`. Mutation: drop the provider-state adoption → red.
   3c. **Save before the create settles (D-ii).** Fork; call the same-name
   save while the deferred is still pending; assert `saveCustomTemplate` has
   one call and `updateCustomTemplate` none; release `{ id: 'backend-new' }`;
   flush → `updateCustomTemplate` called once with `backend-new` and the
   **latest** payload; storage and provider retain `backend-new`; total
   create calls one. Mutation: drop the pending-create chaining → two creates
   → red.
   3d. **Queued create then in-place save (D-iii).** Make the create reject;
   assert a `'template'` op is queued for the local id (precondition). Save in
   place → no direct create call, the queued op's payload is the latest one,
   still exactly one queued op. Then let the executor replay successfully →
   provider entry and storage carry the returned id (executor adoption).
   Mutation: drop executor adoption → provider entry lacks the id → red.
   3e. **Profile switch before a deferred acknowledgement (D-i gate).** Fork
   under profile A with the deferred pending; switch to profile B; release;
   assert B's visible templates are unchanged and A's storage has the id;
   switch back to A → the id is visible. Mutation: remove the profile gate →
   red on B.
4. **Back out leaves membership unchanged.** Start the seeded custom, remove
   an exercise, `cancelWorkout()` → stored custom still has two entries.
5. **Last-exercise guard (context).** With one exercise,
   `removeExerciseFromWorkout(id)` leaves the workout unchanged; with two, it
   removes one. Also: no-op outside `preparing`, no-op for an unknown id.

`src/utils/templateNames.test.js` — (a) with customs `["Name (my version)"]`,
`firstFreeTemplateName("Name", customs)` → `"Name (my version 2)"`;
(b) normalization: `" push DAY "` and `"Push Day"` are equal;
(c) no customs → `"Name (my version)"`.

`src/pages/TrackWorkout.test.jsx` — mount `TrackWorkout` under a mocked
`WorkoutContext.Provider` value (existing ReactDOM + `act` jsdom pattern from
`loginIdentity.test.jsx`; `saveTemplateFromPrep` is a `vi.fn`). Deterministic
cases: (a) opening Save on a built-in when `"Name (my version)"` already
exists prefills `"Name (my version 2)"`; (b) typing a normalized-equal
existing custom name and submitting keeps the modal open, shows the inline
error, and **never** calls `saveTemplateFromPrep`; (c) an exact unchanged
own-custom name calls `saveTemplateFromPrep` with that name. Mutation: remove
the submit guard → (b) red.

`src/services/ActiveWorkoutService.test.js` — `removeExercise` preserves the
final exercise; removes a non-final one.

## 8. Verification (HIGH tier — VERIFICATION_TIER_RULE)

1. Focused tests green, each with its recorded breaking mutation; `npm run
   build` and lint clean.
2. `npm run dev` on a clean profile (the template picker only renders with no
   active workout — see `docs/skills/`). Desktop and 390 px; console clean.
   Exercise: custom remove + Save; custom remove + START (auto-persist);
   built-in remove + Save with the prefilled name; second fork of the same
   built-in prefills "(my version 2)"; typing an existing custom's name (any
   case) shows the inline error and keeps the modal open; built-in remove +
   back out; last-exercise refusal.
3. Deploy, then confirm the live build reports the pushed SHA on **both**
   Railway services (`railway deployment list --service … --json`).
4. Disposable cloud account on the live build (TEST_ACCOUNT_RULE): custom
   in-place update and built-in fork-then-START, each confirmed across a
   reload and a pull, with **one** template row per template on the server;
   delete the account through Settings in the same session, credentials
   retained until then.
5. Remote SHA proof via `git ls-remote`. No schema probe: no backend contract
   changes.
