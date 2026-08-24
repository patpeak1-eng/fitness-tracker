# Smart Progression Stage 2 — Implementation Spec (S27)

**Status:** SPEC ONLY — no application code written. Zone: HIGH
(WorkoutContext.jsx, data model). Companion to docs/PROGRESSION_ROADMAP.md.
All product decisions listed in the task are treated as DECIDED and are
specced, not re-opened.

---

## A. The dead Apply path — current behavior with evidence

**Three independent layers make Apply a no-op; any one alone would kill it.**

1. **State guard vs. nulled workout.** `applyProgression`
   (`src/context/WorkoutContext.jsx:1923-1936`) opens with
   `if (!activeWorkout || !activeWorkout.sourceTemplateId) return;`
   (line 1924). `finishWorkout` calls `setActiveWorkout(null)` at line 1653,
   synchronously, before its cloud push — and the summary page only mounts
   after `await finishWorkout()` resolves
   (`GuidedWorkoutView.jsx` `handleConfirmFinish` → `navigate('/summary')`).
   By the time the Apply button exists, `activeWorkout` is null on **every**
   path. There is no route to the summary that preserves it.
2. **ID-type mismatch.** Even with a live workout, the lookup would fail:
   recommendations store `exerciseId: ex.exercise.id` — the **catalog** id,
   e.g. `wt_flat_bench` (`WorkoutContext.jsx:1610`) — but `applyProgression`
   resolves `activeWorkout.exercises.findIndex(e => e.id ===
   exerciseInstanceId)` (line 1927), where `e.id` is the per-workout
   **instance** id from `generateId()` (line 1524). Catalog id never equals
   instance id → `findIndex` returns −1 → `return` at line 1928.
3. **Persistence guard inside syncToTemplate.** The write it would delegate
   to is itself gated: `syncToTemplate` only persists to localStorage when
   `activeWorkout && activeWorkout.sourceTemplateId && currentProfile`
   (`WorkoutContext.jsx:1783`) — null again post-finish.

**What the user experiences today** (`src/pages/WorkoutSummary.jsx:67-75`):
`handleApply` checks `summaryWorkout.sourceTemplateId` (the completed
workout object passed via navigation state — this one IS set), calls
`applyProgression(rec.exerciseId, rec.setId, { weight: rec.newWeight })`
(line 71), and then **unconditionally fires a success alert** — "Updated X
to Y for next time!" (line 73). The user is told the template changed;
nothing was written. This is worse than silent: it is a false confirmation.

**Conclusion:** dead on every path, with a false-positive UX. Confirmed from
code; no runtime condition rescues it.

## B. Writing all working sets — and the Prompt B interaction

**Today:** `syncToTemplate(templateId, exIndex, setIndex, updates)`
(`WorkoutContext.jsx:1745-1794`) writes exactly one set index of one
exercise (lines 1761-1770), keyed by positional index. Recommendations carry
only the LAST working set's id (`setId: lastSet.id`, line 1612;
`lastSet = workingSets[workingSets.length - 1]`, line 1573). Hence the
roadmap defect: sets 1..n−1 never move and the final set diverges.

**What a whole-exercise write requires:**
- Resolve the template by `sourceTemplateId` and the exercise by POSITION
  (template exercises have no ids linking to workout instances; the existing
  positional mapping in `applyProgression` lines 1927-1935 is the pattern —
  it maps workout `exIndex` → template `exIndex`, which holds because
  `startWorkoutFromTemplate` builds workout exercises in template order,
  `WorkoutContext.jsx:1473-1528`).
- Write `weight` on every working set of that exercise's `sets` array.
- **Warm-up identity gap:** template sets do NOT carry `setType`.
  `saveWorkoutAsTemplate` persists only `{weight, targetReps,
  targetDistance, targetTime}` per set (`WorkoutContext.jsx:2259-2264`), and
  `startWorkoutFromTemplate` never reads a `setType` from templates
  (1504-1521 assigns `setType: 'normal'` to every set, line 1518). So
  "exclude warm-up sets" (Decision 1) is currently **undecidable at the
  template layer**. Recommendation: persist `setType` into template sets in
  `saveWorkoutAsTemplate` and honor it in `startWorkoutFromTemplate` —
  JSONB storage, no migration (see §D). Until a template carries setTypes,
  apply-all treats every template set as working (matches today's reality:
  such templates were built without warm-up marks).
- Persist: state (`setTemplates`), localStorage
  (`StorageService.saveCustomTemplates`), and cloud.

**Prompt B interaction (queued: `updateWorkoutTemplate(templateId,
templateName)` overwriting a custom template in place from activeWorkout).**
Assessment:
- Progression-apply **cannot reuse Prompt B's function as-is**: it runs from
  the summary, after `activeWorkout` is null, and it must write ONE
  exercise's weights derived from a recommendation — not overwrite the whole
  template from a live workout.
- They also must not duplicate the write path. **Recommendation: build one
  shared low-level writer** in WorkoutContext, e.g.
  `writeTemplate(templateId, transformFn)` — resolves the template, applies
  a pure transform, then performs the single canonical persist
  (state + localStorage + cloud + SyncQueue fallback). Prompt B's
  `updateWorkoutTemplate` = `writeTemplate(id, () => templateFromActive
  Workout(...))`. Progression's `applyRecommendation(rec)` =
  `writeTemplate(rec.templateId, tpl => withExerciseWeights(tpl,
  rec.exerciseIndex, rec.newWeight))`. Reasoning: one persist path, two thin
  transforms; either task can land first and the other rebases onto the
  helper.
- **Cloud leg gap (affects BOTH tasks):** the backend has **no template
  update route** — `backend/app/routers/templates.py` exposes only GET
  (line 17), POST-create (line 30), DELETE (line 47). In-place overwrite
  needs either a new `PUT /api/templates/{id}` (backend, HIGH zone) or a
  delete+recreate dance (churns `backendId`, races the SyncQueue 'template'
  executor, `WorkoutContext.jsx:337-349`). Recommendation: add the PUT;
  flagging for coordinator sign-off since it is backend scope shared by
  Prompt B.
- The recommendation object must gain what apply needs post-workout:
  `templateId` (from the finished workout's `sourceTemplateId`) and the
  exercise's positional `exerciseIndex` — captured at detection time in
  `finishWorkout`, where both are still known (1556-1618).

## C. Hold and deload

**Today:** one branch. Linear mode recommends +weight when the final working
set hits target (`WorkoutContext.jsx:1583-1587`); double mode when all
working sets hit target (1575-1578). A miss produces nothing (no `else`).
Warm-ups excluded at line 1569. Note there is also a THIRD, parallel
suggestion engine: `getSuggestedLoad` (`WorkoutContext.jsx:1796-1852`),
exported (line 2748) with **zero UI consumers** — dead code that will
confuse future work; recommend deleting or folding it in during this stage.

**"Two consecutive missed sessions" — derivable from history, no new state:**
- History is sorted newest-first (`getLastExerciseStats` comment,
  `WorkoutContext.jsx:1400`) and entries carry full per-set
  `reps/targetReps/weight/setType` (written by `finishWorkout` from the
  live workout object) plus `status` (filter on `'completed'` as
  `getLastExerciseStats` does, line 1402).
- At detection time in `finishWorkout`, the current session's result is in
  hand; the PREVIOUS session for the same exercise is the first `completed`
  history entry containing that catalog exercise id (same scan pattern as
  `getLastExerciseStats:1399-1412`). Apply the same missed-target predicate
  to it. Current miss + previous miss ⇒ deload; current miss + previous
  hit/absent ⇒ hold.
- **No new stored state is needed** — preferred, per the task. The only
  caveat: history merged from the cloud must retain per-set detail, which it
  does (union merge keeps full exercise arrays, `WorkoutContext.jsx:761+`).
- Proposed recommendation shape (extends the existing object at 1609-1616):
  `{ type: 'increase' | 'hold' | 'deload', exerciseId, exerciseName,
  templateId, exerciseIndex, oldWeight, newWeight, message }` — `hold` has
  `newWeight === oldWeight` and still renders (Decision 2: explicit, not
  silent); `deload` computes `oldWeight × 0.9` rounded to the equipment
  increment (§E). Existing renderers (`WorkoutSummary.jsx`,
  `WorkoutDetails.jsx:61-67`) read `message` and render generically; the
  Apply button should hide or relabel for `hold` (nothing to write).

## D. Rep ranges (targetRepsMin / targetRepsMax) — full surface

**Semantics to implement (classic double progression):** work in
`[min, max]`; when every working set reaches `max`, recommend +weight and
reset the working target to `min`; otherwise recommend +1 rep on the sets
below `max` — the smallest viable step. Backward compatibility rule: a set
with only `targetReps` behaves as `min === max === targetReps`, which
reduces exactly to today's behavior; `targetReps` stays the displayed
"current goal" so old data needs no rewrite.

**Every read/write site of `targetReps` found in src/ (grep, S27):**

| Site | Role | Range impact |
|---|---|---|
| `WorkoutContext.jsx:1507,1515` | startWorkoutFromTemplate builds sets from template | copy min/max through; seed `targetReps` from min |
| `WorkoutContext.jsx:1577,1584` | detection predicates | compare against `max` for +weight; `min` for hold/deload judgment |
| `WorkoutContext.jsx:1702` | addExerciseToWorkout default set | defaults for min/max |
| `WorkoutContext.jsx:1730-1731,1766` | updateSet → syncToTemplate live-edit sync | sync range edits |
| `WorkoutContext.jsx:1810,1845` | getSuggestedLoad (dead — see §C) | delete or update |
| `WorkoutContext.jsx:2014,2025` | addSet copies previous set's target | copy range too |
| `WorkoutContext.jsx:2261` | saveWorkoutAsTemplate set capture | persist min/max (+ `setType`, §B) |
| `WorkoutContext.jsx:2479` | importProgram (assessment templates) | seed ranges or single value |
| `src/utils/coachWorkout.js:9` | coach plan → template | coach plans send single `reps`; map to min==max |
| `src/components/workout/CreateTemplateModal.jsx:27` | builder default set shape | default range |
| `src/components/workout/ExerciseResult.jsx:91-95` | **prep screen GOAL input** | UI: single field vs range entry — see open questions |
| `src/components/workout/GuidedWorkoutView.jsx:519` | GOAL column in the set table | display "8-12" when range |
| `GuidedWorkoutView.jsx:464-466,710` | REPS pill + Adjust Target modal | edit range |
| `GuidedWorkoutView.jsx:258-263` | Log Set modal prefill (rep-based never prefills goal — S27 rule; unaffected) | none |
| `src/components/history/WorkoutDetails.jsx:121` | history GOAL display | display range |

**Backend: no migration required.** Sets live inside JSONB blobs typed
`Any`: workout history `exercises = Column(JSONB)`
(`backend/app/models.py:157`), active workout `workout_data`
(`models.py:175`), templates `template_data` (`models.py:228`);
`backend/app/schemas.py:158,166,208,217` pass them through untyped. New keys
flow end-to-end with zero backend changes. (This also covers §B's `setType`
persistence into templates.) No `targetReps` reference exists anywhere in
backend/ (grep).

**This is the largest piece:** ~10 write sites, 5 display sites, plus the
detection rework, and the only one with real UI-design decisions attached.

## E. Equipment-aware increments

**Data actually available:**
- `exercise.equipment` — a string on each catalog exercise; **overloaded**:
  `/` is both an OR-separator ("Barbell/Dumbbells") and part of literal
  names ("Parallel Bars/Bench") — established parsing rule: match the full
  literal first, then slash-split
  (`src/utils/exerciseFilters.js:39-52`).
- Equipment profiles / `customEquipmentItems` describe what the USER has
  (arrays of the same strings) — useful later for availability, not needed
  for increment mapping.
- Custom exercises created **since S27** carry `equipment` (the
  CustomExerciseForm writes it); **pre-S27 custom exercises have no
  equipment value** — grep of the creation path before S27
  (`ExerciseSelector`'s old inline form) confirms the field was never set.
  `equipment` may also be `'None'` or absent on bodyweight catalog entries.

**Proposed mapping** (pure function, e.g.
`minimumIncrement(equipmentString, units)`):

| Equipment token | Imperial | Metric | Rationale |
|---|---|---|---|
| Barbell | 5 lb | 2.5 kg | 2×2.5 lb / 2×1.25 kg plates |
| Dumbbells | 5 lb | 2.0 kg | fixed-dumbbell rack jumps |
| Machine, Cable | 5 lb | 2.5 kg | smallest common stack pin (some stacks are 10/5 — see open questions) |
| Pull-up Bar, None, Low Bar, Wall, Bench/Elevated Surface, absent | — | — | no external load: rep-first progression (§D), never a weight rec |

Parse rule: full-string lookup first; on miss, slash-split and take the
**minimum** increment among recognized tokens (an OR-list means the user can
pick the finer-grained option). Unrecognized token or missing field →
fall back to the existing `progressionIncrement` setting
(`WorkoutContext.jsx:441,1563`) — current behavior, so pre-S27 customs
degrade gracefully rather than misleading. Deload rounding (§C) uses the
same function: round `weight × 0.9` DOWN to the nearest increment (never
recommend a weight the plates can't make).

## F. Progress-page surfacing

**Where recommendations live today:** written once per finished workout onto
the history entry — `recommendations: uniqueRecs`
(`WorkoutContext.jsx:1650`); persisted locally with history, mirrored to the
backend column `recommendations = Column(JSONB)`
(`backend/app/models.py:158`) and restored on login merge
(`WorkoutContext.jsx:796`). Rendered in exactly two places:
`WorkoutSummary.jsx` (once, post-workout) and
`src/components/history/WorkoutDetails.jsx:61-67` (inside one history
entry).

**Latest-per-exercise read:** scan `history` (newest-first) and keep the
first recommendation seen per `exerciseId` — a ~10-line selector, no new
storage, no backend change. Surface as a card on the Progress page
(`src/pages/Analytics.jsx`), each row showing exercise, direction
(increase/hold/deload), and the same Apply affordance as the summary
(sharing `applyRecommendation` from §B). LOW zone (read-only display +
existing apply call).

## G. Coach access (Stage 3 — separable)

**How the payload is assembled:** the frontend builds `app_context` in
`buildCoachAppContext` (`src/pages/CoachView.jsx:172-216`) — already
includes exercise catalogs, templates, assessments, stats, equipment — and
sends it via `sendCoachMessage` (`src/services/ApiService.js:359-378`). The
backend caps it (`MAX_APP_CONTEXT_CHARS`, `backend/app/routers/coach.py`
~598) and separately pulls a year of workout history server-side
(`coach.py:649-665`); the server-side pull selects `WorkoutHistory` rows
which CONTAIN the `recommendations` column, but nothing currently formats
recommendations into the prompt (not determinable as "used" anywhere in
coach.py — grep for `recommendations` in backend/app/routers/coach.py:
zero hits).

**Cheapest separable implementation:** add one field to `app_context` —
`progression: [{ exercise, type, oldWeight, newWeight, sessionsAtWeight }]`
from the §F selector. Frontend-only (CoachView.jsx), no backend change, no
coupling to §§A-E beyond reading whatever recommendations exist — it ships
independently at any point, before or after the rest of Stage 2. Watch the
size cap: ~120 exercises are already truncated at 172-180; progression rows
are small (cap at, say, 20 exercises).

## Data model changes summary

| Change | Where stored | Migration? |
|---|---|---|
| `type` ('increase'/'hold'/'deload') + `templateId` + `exerciseIndex` on recommendation objects | history JSONB (local + `models.py:158`) | No |
| `targetRepsMin` / `targetRepsMax` on sets | workout/template/active JSONB blobs | No |
| `setType` persisted into template sets | template JSONB (`models.py:228`) | No |
| (optional, §B) `PUT /api/templates/{id}` | backend route only — no schema change | No schema migration; new route = HIGH-zone backend change |

**No Alembic migration is required anywhere in this spec.**

## Files touched and zone, per piece

| Piece | Files | Zone |
|---|---|---|
| A+B: fix Apply, all-sets write, shared `writeTemplate` | WorkoutContext.jsx, WorkoutSummary.jsx (+ `PUT /api/templates/{id}`: templates.py) | HIGH (context + user data; backend route HIGH) |
| C: hold/deload branches (+ delete getSuggestedLoad) | WorkoutContext.jsx | HIGH (context), logic-only |
| D: rep ranges | WorkoutContext.jsx, ExerciseResult.jsx, GuidedWorkoutView.jsx, WorkoutDetails.jsx, CreateTemplateModal.jsx, coachWorkout.js | HIGH (context + data shape), broad |
| E: increment mapping | new src/utils/progressionIncrements.js + use in finishWorkout | MEDIUM (pure util) + HIGH touchpoint |
| F: Progress page card | Analytics.jsx (+ shared apply) | LOW |
| G: coach context | CoachView.jsx | LOW-MEDIUM |

## Recommended build order

1. **A+B** — the Apply path is the broken promise users can already see
   (false success alert). Build the shared `writeTemplate` WITH Prompt B so
   the template-write path exists exactly once. Ships alone.
2. **C** (+ retire getSuggestedLoad) — pure detection logic, derivable from
   history; ships alone once A+B gives holds/deloads somewhere to apply.
3. **E** — small pure function consumed by C's deload rounding and A's
   increment; can land with or immediately after C.
4. **F** — anytime after A (needs a working apply to be honest UI).
5. **D** — largest surface, benefits from A-C being settled; last in Stage 2.
6. **G** — independent; any time.

## Coordinator decisions (S27)

All seven open questions are resolved; this section is the authority.

1. **`PUT /api/templates/{id}` — APPROVED. Build it.** Delete+recreate is
   rejected: it churns `backendId` and races the SyncQueue `'template'`
   executor.
2. **Increment table — governed by a rule, not fixed opinion:** the
   recommended increment must be **PHYSICALLY LOADABLE** on that equipment.
   Dumbbells 5 lb / 2.5 kg · Barbell 5 lb / 2.5 kg · Machine 10 lb / 5 kg ·
   Cable 5 lb / 2.5 kg · Bodyweight none (see decision 7). **Fallback:**
   exercises with no equipment value (custom exercises created before S27)
   use the **barbell** increment.
3. **Rep-range ENTRY UI — DEFERRED.** The §D data model is specced now; the
   prep GOAL column input design is decided after pieces A-C ship. Do not
   build the entry UI in this stage without a further coordinator decision.
4. **Persist `setType` into template sets — APPROVED.** Warm-up sets
   flattening to normal on save is a data-loss bug independent of
   progression.
5. **Hold recommendations — DISPLAY ONLY. No Apply button.** A button that
   writes nothing is the pattern this stage exists to remove.
6. **`getSuggestedLoad` — DELETE.** Third parallel suggestion engine, zero
   consumers. Retire it with piece C.
7. **Bodyweight and duration exercises — SUPPRESS weight recommendations
   entirely.** Their progression is reps or time (§D). Never recommend
   added weight for them.

**Additional ruling:** `WorkoutSummary.jsx:73`'s unconditional success alert
is a **P1 defect for piece A** — the apply path must report real success or
real failure, never assume.

Post-device-verification decisions (S27, continued):

8. **Replace native `alert()` in the Apply path** with an in-app
   confirmation using the app's existing design tokens. Native `alert()`
   renders the Railway URL as browser-supplied header chrome that cannot be
   styled or removed — the only fix is to stop calling `alert()`. Copy:
   "Updated Face Pulls to 55 lbs for next time" with no URL chrome.
9. **The confirmation MUST reflect real success or real failure.**
   `applyRecommendation` must return a success/failure result and the UI
   must branch on it. A failed write must say so.
10. **The other 7 native `alert()` call sites**
    (`WorkoutContext.jsx:1348, 1549, 2248`;
    `CreateTemplateModal.jsx:40, 44`; `CoachView.jsx:697`;
    `ProfileSelector.jsx:20`) are a separate LOW-zone sweep. NOT in scope
    for piece A.
11. **LIVE CONFIRMATION (Patrick, Android, SHA 1ccbf38):** the dead Apply
    path in §A was reproduced end to end. Recommendation generated
    (Face Pulls 50 → 55), Apply tapped, success alert shown, button changed
    to "Saved", and the prep screen still showed 50 lbs. Finding A is
    confirmed against production, not only code reading.

---

*Investigated read-only from: src/context/WorkoutContext.jsx,
src/pages/WorkoutSummary.jsx, src/pages/Analytics.jsx, src/pages/CoachView.jsx,
src/components/workout/{GuidedWorkoutView,ExerciseResult,CreateTemplateModal}.jsx,
src/components/history/WorkoutDetails.jsx, src/utils/{exerciseFilters,coachWorkout}.js,
src/services/{ApiService,StorageService}.js, backend/app/{models,schemas}.py,
backend/app/routers/{templates,coach}.py. No application code modified.
S27, 2026-08-24.*
