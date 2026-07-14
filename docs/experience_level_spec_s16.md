# SPEC — Experience-Level Coach Calibration (S16 Task 4)

Zone: **HIGH** (users-table schema change + WorkoutContext.jsx edit).
Status: awaiting coordinator clearance before implementation.

## Current behavior

- `_build_user_context()` (backend/app/routers/coach.py:115) sends the coach:
  USER STATS & GOALS (age/height/current_weight/target_weight/goal/
  motivation/body_fat/muscle_mass/bone_density, empties dropped), RECENT
  WORKOUT HISTORY (last 10), and the live workout context. **No experience
  signal of any kind.**
- The 3 personalities (Apex/Hype/Zen) are separate cached system blocks —
  tone only, no technical-depth calibration.
- The Assessment wizard already collects `experience`
  ('beginner'|'intermediate'|'advanced', Assessment.jsx:27) and
  recommendationEngine.js:132 consumes it — but it's only stored inside the
  saved assessment record; nothing downstream ever reads it again.
- `experience_level` / `experienceLevel` appear nowhere in the repo
  (grep-zero) — this is a greenfield field name.

## Gap

The coach answers a first-week beginner and a competitive lifter
identically. No persistent, user-editable experience signal exists, and the
assessment's answer dead-ends in the assessment history record.

## Proposed fix (decided direction — implementing, not debating)

New persistent `experience_level` setting ('beginner'|'intermediate'|
'advanced', default 'intermediate'), riding the existing settings-sync
infrastructure end to end.

### 1. Backend — schema (the HIGH-zone part)

- **models.py `User`** (confirmed: theme/units/coach_personality live on the
  `users` table, models.py:32-38): add
  `experience_level = Column(String(20), server_default="intermediate")`
  after `coach_voice_id`.
- **Migration `0006_add_experience_level.py`** following the 0005 pattern
  exactly: hand-authored, nullable + server_default so existing rows
  backfill, revision id `"add_experience_lvl"` (18 chars ≤ 32),
  down_revision `"add_coach_prefs"`, downgrade drops the column.

### 2. Backend — schemas + route

- **schemas.py**: `experience_level: Optional[str] = None` added to BOTH
  `UserResponse` (after coach_voice_id, line ~70) and `ProfileUpdate`
  (line ~90) — mirrors exactly how coach_personality/coach_voice_id were
  added. Per the established pattern, the PUT /api/profile handler is a
  generic setattr loop and needs **no** edit.
- **coach.py `_build_user_context()`**: gains a `user` parameter (the route
  already holds the authenticated `User` from get_current_user); prepends
  `EXPERIENCE LEVEL: <value>` (falling back to "intermediate" when
  NULL/empty) to the context parts. Call site at coach.py:229 updated.
- **coach.py `COACH_SYSTEM_PROMPT`**: new behavioral block (static text →
  stays inside the cached block, no cache impact):

  ```
  EXPERIENCE CALIBRATION — the user context includes an EXPERIENCE LEVEL;
  calibrate every response's depth to it:
  - beginner: explain terminology and form cues whenever you use them,
    proactively suggest specific exercises, invite follow-up questions
  - intermediate: assume working knowledge of common lifts and terms;
    less hand-holding, explain only genuinely non-obvious concepts
  - advanced: skip fundamentals entirely, use technical language freely,
    focus on nuance (programming, periodization, weak-point work) over
    basics
  ```

### 3. Frontend — state + persistence (WorkoutContext.jsx — HIGH zone file)

- **StorageService.js**: new `KEY.experienceLevel = 'fitness_experience_level'`,
  added to `PROFILE_SCOPED_BASE_KEYS`; `loadProfileState()` returns
  `experienceLevel: readRaw(KEY.experienceLevel, 'intermediate', { uid })`;
  new `saveExperienceLevel(uid, level)` one-liner.
- **WorkoutContext.jsx**: `const [experienceLevel, setExperienceLevel] =
  useState('intermediate')`; hydrated in `refreshProfileData` in the same
  batch as theme/units (before `setSettingsHydratedFor(uid)`); persist
  effect copies the **exact theme/units/coach_personality pattern**: gate on
  `settingsHydratedFor === currentProfile.id`, `experienceLevelSyncedProfileRef`
  same-profile check, `ApiService.saveProfile({ experience_level: … })` with
  SyncQueue fallback (`type: 'profile_settings', key: 'experience_level'`).
  No new pattern invented.
- **Login pull**: the existing cloud-pull in refreshProfileData applies
  backend profile values on login — apply `me.experience_level` there the
  same way theme/units are applied (backend wins on login).
- Exposed via context value: `experienceLevel, setExperienceLevel`.

### 4. Settings.jsx

3-way segmented control (Beginner/Intermediate/Advanced) in the existing
"AI Coach" Group, reusing the `unit-toggle`/`unit-btn` segmented pattern
already used for the personality picker (Settings.jsx:285-290) — tokens
only, no new CSS invented.

### 5. Assessment.jsx

In `handleCalculate` (line ~50), alongside the existing `saveAssessment({...
formData})`: `setExperienceLevel(formData.experience)` — values already
match ('beginner'/'intermediate'/'advanced'). The person can change it later
in Settings without retaking the Assessment.

### 6. Coach request path

No frontend coach-call change: the backend reads `experience_level` from the
authenticated User row (authoritative, synced). Local-only profiles can't
reach the coach anyway (authenticated backend route).

## Files touched (exact)

| File | Change |
|---|---|
| backend/alembic/versions/0006_add_experience_level.py | new migration |
| backend/app/models.py | +1 column on User |
| backend/app/schemas.py | +1 field in UserResponse, +1 in ProfileUpdate |
| backend/app/routers/coach.py | _build_user_context param + context line; COACH_SYSTEM_PROMPT block |
| src/services/StorageService.js | KEY + scoped-keys list + load/save |
| src/context/WorkoutContext.jsx | state + hydration + persist effect + login-pull apply + context value |
| src/pages/Settings.jsx | 3-way control in AI Coach group |
| src/pages/Assessment.jsx | setExperienceLevel on completion |
| docs/ARCHITECTURE.md | settings-sync field list + coach context (same commit) |

## Definition of done

- Migration + models + schemas compile (`py_compile`); `npm run build` clean
- Beginner vs advanced answers to the same question are visibly different in
  depth/terminology (live transcripts pasted in chat)
- A profile that never set the field gets 'intermediate' behavior, no errors
- Existing settings sync unaffected (theme/units/coach prefs still persist)

## Risk / zone

- **HIGH**: users-table migration + WorkoutContext.jsx edit (one terminal —
  this one — only). Both stop-gates apply: this spec, then the
  implementation diff.
- Migration risk low: additive nullable column with server default, same
  shape as 0005 which deployed cleanly. Downgrade provided.
- No dependency on any other in-flight work. (S16 Task 2 did not touch
  Assessment.jsx — no overlap.)
