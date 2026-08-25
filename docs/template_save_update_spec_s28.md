# S28 — Prep-screen template save/update (Prompt B successor)

Product decisions fixed by coordinator (T2 session prompt, 2026-08-24):
name decides update-vs-fork; both actions always visible in prep; START
auto-saves except built-ins; honest result reporting, no alert().

## Approach

One new context function, `saveTemplateFromPrep(name)`, built on the two
persistence paths that already exist — no new write path (ARCHITECTURE §14):

| Case (source = template behind activeWorkout.sourceTemplateId) | Action |
|---|---|
| source is own custom, name unchanged | `writeTemplate(source.id, tpl => {...tpl, exercises: snapshot})` — update in place, id/backendId survive |
| source is own custom, name changed | create via `saveCustomTemplate(name, snapshot)` — fork, original untouched |
| source is built-in, name unchanged | refuse: `{ ok:false, error }` — surfaced inline in the save dialog |
| source is built-in, name changed | create (fork); built-in never written |
| no source (ad-hoc / empty / source deleted) | create |

`snapshot` = `templateExercisesFromWorkout(activeWorkout)`, the per-set
mapping extracted verbatim from `saveWorkoutAsTemplate` (which now calls the
same helper — behavior unchanged, mapping single-sourced).

Returns `{ ok, template?, mode: 'updated'|'created', error? }`. Local
persistence is the success criterion; the cloud leg stays fire-and-forget
with SyncQueue fallback exactly as `writeTemplate` / `saveCustomTemplate`
already do. `saveCustomTemplate` gains a `return newTemplate` (previously
returned undefined; no caller reads it today).

**Re-pointing:** on every successful create, `activeWorkout.sourceTemplateId`
is moved to the new template's id. Rationale: `updateSet` → `syncToTemplate`
live-syncs weight edits to `sourceTemplateId` (prep included); after a fork,
those edits must land on the fork, never the original. This also makes a
second save-with-same-new-name an in-place update of the fork instead of a
second fork.

## UI (TrackWorkout.jsx, prep block)

- Save Template button: visible for EVERY prep workout (the
  `!sourceTemplateId` gate is deleted — coordinator-confirmed design error).
  Independent of zero-weight validation (unchanged).
- Save dialog: prefilled with the source/workout name. Context line:
  own custom — "Keeping the name updates 'X'; a new name saves a copy."
  built-in — "'X' is a built-in template. Change the name to save your own
  copy." Submitting a built-in unchanged name keeps the dialog open and
  shows the returned error inline.
- On success: dialog closes, button flips to "Template Saved" (existing
  pattern), token-styled success notice (WorkoutSummary S27 pattern —
  classes defined locally in TrackWorkout.css, NOT reused from
  WorkoutSummary.css: cross-chunk class reuse is the S28 leak bug class).
- On failure: no "Template Saved" anywhere; error notice.
- START (`handleStartWorkout`): if not already saved this prep —
  own custom → `saveTemplateFromPrep(source.name)` (silent in-place update);
  no source → `saveTemplateFromPrep(activeWorkout.name)` (create, existing
  auto-save semantics); built-in → no write ever. Explicit save sets the
  `savedTemplate` flag, so save-then-START performs exactly one write.
  Auto-save is fire-and-forget: its local write is synchronous, the cloud
  leg can never block `startGuidedSession()`.

## Out of scope / untouched

`syncToTemplate` (live-edit path), `saveWorkoutAsTemplate` (behavior frozen;
loses its last in-repo caller but remains exported context API),
`startWorkoutFromTemplate` (already restores set count from `sets` arrays —
acceptance 10 needs no change), backend (PUT route exists since S27).

## Done =

The 12 acceptance criteria in the session prompt, asserted against stored
JSON (localStorage custom-templates key) and a localStorage write-counter
for the exactly-one-write criteria; build clean; four screenshots.

## Addendum — dirty-state re-save (S28 follow-up)

Coordinator clarification: "save then START = exactly one write" meant "no
duplicate template," not "no second save." The boolean `savedTemplate` flag
suppressed all persistence after one explicit save, so post-save prep edits
were silently lost — the same loss class this spec exists to fix.

Replacement: TrackWorkout keeps `savedSnapshot`, the serialized
`templateExercisesFromWorkout(activeWorkout)` captured on each successful
save (helper now exported from WorkoutContext so the comparison uses the
exact bytes that were saved — no parallel mapping to drift). `isSaved` =
current serialization equals the snapshot. Save button disables and reads
"Template Saved" only while clean; any prep edit makes it dirty again, and
START auto-saves dirty state through the same saveTemplateFromPrep matrix
(own custom in-place, ad-hoc create-once, built-in never). Repeated saves
of an own custom template always route to the in-place update branch (and
after a fork the re-pointed sourceTemplateId keeps it that way), so no path
mints a duplicate.
