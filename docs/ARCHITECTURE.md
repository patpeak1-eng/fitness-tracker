# FITNESS TRACKER — SYSTEM ARCHITECTURE
## Living Document | How This App Works, End to End

**Purpose:** This document exists so that no future session, terminal, or model (Claude Code, Fable 5, or otherwise) has to reverse-engineer how this app is wired before making a change. Read this before touching any file for the first time in a new session.

**Confidence levels used throughout this document:**
- ✅ **VERIFIED** — confirmed directly against source file content
- 📋 **SESSION-NOTES** — confirmed via prior session discovery reports and memory, not directly read from source in this document's compilation
- ⚠️ **PROVISIONAL** — best current understanding, requires verification against live repo before being treated as ground truth

**Update rule:** Any session that changes architecture (new context, new service, new major data model field, new backend route, new persistence pattern) updates this document in the same commit as the change. This is not optional — an out-of-date architecture doc is worse than no doc, because it creates false confidence.

---

## 1. SYSTEM OVERVIEW

A mobile-first Progressive Web App for personal fitness tracking, used by a small family group including a Fire Station (first-responder) profile with pause/resume workflow requirements. Built as a "Guided Workout" experience — timers, audio cues, smart set recommendations — rather than a spreadsheet-style logger.

**Core philosophy (unchanged across all sessions):** local-first, profile-scoped, offline-resilient. The backend is a sync layer, not the source of truth during an active session.

---

## 2. TECH STACK ✅ VERIFIED

```
Frontend:  React 18.3.1 + Vite 6.0.5, served as a PWA
Routing:   react-router-dom 7.13.0
Charts:    recharts 2.15.0
Icons:     lucide-react 0.473.0 (no emojis anywhere in the app — enforced rule)
Dates:     date-fns 4.1.0
Effects:   canvas-confetti 1.9.4
Testing:   vitest 4.0.18 + jsdom
Linting:   eslint 9.17.0 + eslint-plugin-react-hooks

Backend:   FastAPI + PostgreSQL (Railway) — 📋 SESSION-NOTES, see Section 7
Auth:      Google OAuth, HttpOnly cookie (SameSite=None; Secure) — 📋 SESSION-NOTES
Deploy:    Railway, GitHub webhook triggers build — no `railway up`, ever
```

---

## 3. HIGH-LEVEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                     BROWSER (PWA)                             │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────┐    │
│  │   Pages/      │───▶│   WorkoutContext.jsx              │    │
│  │   Routes      │    │   ("The Brain" — HIGH ZONE)       │    │
│  │  (react-      │◀───│                                    │    │
│  │   router)     │    │  - Profile state                  │    │
│  └──────────────┘    │  - Active workout state            │    │
│                        │  - History, templates, exercises  │    │
│                        │  - Timer state (rest/work)         │    │
│                        │  - Progression settings            │    │
│                        └───────────┬────────────────────────┘    │
│                                    │                              │
│                        ┌───────────┴────────────────┐            │
│                        ▼                             ▼            │
│              ┌──────────────────┐         ┌──────────────────┐  │
│              │ ActiveWorkoutSvc  │         │  StorageService   │  │
│              │ (pure reducers)   │         │  (localStorage,   │  │
│              │                   │         │   profile-scoped) │  │
│              └──────────────────┘         └────────┬──────────┘  │
│                                                      │             │
│                                                      ▼             │
│                                            ┌──────────────────┐   │
│                                            │   ApiService      │   │
│                                            │  (backend sync,   │   │
│                                            │  credentials:     │   │
│                                            │  include)         │   │
│                                            └────────┬──────────┘   │
└─────────────────────────────────────────────────────┼──────────────┘
                                                        │
                                                        ▼
                                    ┌────────────────────────────────┐
                                    │   BACKEND (FastAPI/Postgres)     │
                                    │   📋 SESSION-NOTES — see Sec 7   │
                                    │                                  │
                                    │  /api/profile (GET/PUT)          │
                                    │  /api/coach/chat (SSE)           │
                                    │  /api/voice/coach-synthesize     │
                                    │  /api/templates (POST)           │
                                    │  /health, /openapi.json          │
                                    └────────────────────────────────┘
```

---

## 4. FRONTEND ARCHITECTURE

### 4.1 Routing ⚠️ PROVISIONAL (confirmed routes only — full list needs T1 verification)

Confirmed to exist based on file access and session work:

| Route | Page | Notes |
|---|---|---|
| `/` | Dashboard | Central hub, active workout card if one exists |
| `/track` | TrackWorkout | Active session view or template picker |
| `/exercises` | Exercises (Exercise Library) | Search + category/muscle/equipment filters |
| `/analytics` | Analytics / AnalyticsView | Charts, muscle volume distribution |
| `/profile` | Profile | Settings, data export/import, profile switching |
| `/assessment` | Assessment | Onboarding wizard, recommendation engine |

**Not yet confirmed:** exact route for template creation modal (may be a modal over `/track`, not a standalone route — `CreateTemplateModal.jsx` referenced in S11 work suggests modal pattern, not routed page).

### 4.2 State Management — WorkoutContext.jsx ✅ VERIFIED

**This is the single highest-risk file in the codebase. One terminal at a time, always.**

**What it holds (confirmed from source):**

```
Shared/global data:
  exercises        — DEFAULT_EXERCISES (73 built-in) + custom, per-profile
  templates        — DEFAULT_TEMPLATES (6 built-in) + custom, per-profile

Profile state:
  profiles         — array of all local profiles
  currentProfile   — active profile object

User-specific state (reset on profile change):
  activeWorkout    — current in-progress workout or null
  history          — completed workout array
  assessments      — assessment history
  theme, units, soundEnabled
  defaultRestTime, defaultWorkTime
  userStats        — age, height, weight, goal, etc.
  weightHistory    — array of {date, weight}

Ephemeral session state:
  restTimer        — {timeLeft, isActive, duration}
  workTimer        — {timeLeft, isActive, duration}
  exercisePrefs    — per-exercise timer overrides

Progression state:
  smartProgressionEnabled, progressionMode, progressionType, progressionIncrement

Guided mode state:
  currentExerciseIndex, currentSetIndex (persisted into activeWorkout object)
```

**Key architectural patterns (verified):**

1. **Two-phase initialization:** `refreshGlobalState()` loads profile list on mount → `refreshProfileData(profile)` loads profile-scoped state whenever `currentProfile` changes. This separation matters — do not collapse it.

2. **Persist-on-change via useEffect pairs:** every piece of profile-scoped state has a dedicated `useEffect` that fires `StorageService.save*()` on change, gated by `if (currentProfile)`. Adding new persisted state means adding a new state variable + a new persist `useEffect` following this exact pattern — do not invent a different persistence mechanism.

3. **Backend sync gate — `canSyncToBackend`** (fixed S11, SHA `705df32`): sync only fires when `currentProfile?.email` is present (i.e., real authenticated user, not a local `user_default` or locally-created unauthenticated profile). Uses a `canSyncRef` pattern (ref holding latest value) so `.catch()` callbacks always read current auth state, not stale closure state. **Any new backend-synced field must use this same gate — do not write a new auth check.**

4. **Active workout mutations delegate to ActiveWorkoutService** — `WorkoutContext` never mutates `activeWorkout.exercises` directly. It always calls into the pure reducer functions in `ActiveWorkoutService.js` (see 4.3). This keeps the mutation logic testable and isolated from persistence/React state concerns.

5. **Template sync-back:** editing a set's weight/reps during an active workout that came from a template (`sourceTemplateId`) syncs the change back into the template itself (`syncToTemplate()`), so future workouts from that template start with updated targets. This is a deliberate design choice — do not treat template mutation during a live workout as a bug.

6. **Guided mode index persistence:** `currentExerciseIndex`/`currentSetIndex` are wrapped in custom setters that also write into `activeWorkout.currentExerciseIndex` so the position survives a page reload mid-workout.

### 4.3 ActiveWorkoutService.js ✅ VERIFIED

Pure, stateless reducer functions. Every function takes `(state, payload)` and returns a new state object — no mutation, no side effects, no localStorage access. This file should stay this way; if it ever needs to read profile/auth state, that's a sign the function belongs in WorkoutContext instead.

```
addExercise(state, { newWorkoutExercise })
updateSet(state, { exerciseInstanceId, setId, updates })
removeExercise(state, { exerciseInstanceId })
addSet(state, { exerciseInstanceId, newSet })
removeSet(state, { exerciseInstanceId, setId })
```

All five follow the identical pattern: null-guard on `state`, map/filter over `exercises`, return new object via spread. Any new active-workout mutation should be added here, following the same signature convention, not inlined into WorkoutContext.

### 4.4 StorageService.js ✅ VERIFIED

**Key management pattern:**

```
Global keys (not profile-scoped): profiles, currentProfileId, autoSync
Profile-scoped keys: history, activeWorkout, assessments, theme, units,
                      sound, defaultRest, defaultWork, stats, weightHistory,
                      exercisePrefs, smartProg, progMode, progType, progInc,
                      customTemplates, customExercises
```

Profile-scoped keys are namespaced as `{baseKey}_user_{uid}`. A **legacy migration path** exists (`legacyScopedKey`, `migrateLegacyProfileKey`) for an older `{baseKey}_{uid}` format — this runs automatically on `getOrCreateProfiles()` via `startupCleanup()`. **Do not remove this migration code** without confirming no user has data in the legacy format.

**Adding a new persisted field:** add its key to `KEY`, add it to `PROFILE_SCOPED_BASE_KEYS` if profile-scoped, add `save*`/`load*` helper methods following the existing naming convention, wire it into `loadProfileState(uid)`'s return object.

### 4.5 ApiService.js 📋 SESSION-NOTES (confirmed via T1 discovery report, S11)

```
saveProfile(profile) → PUT /api/profile
  - credentials: include + conditional Bearer token
  - throws on !response.ok
  - accepts partial objects (all ProfileUpdate fields are Optional server-side)
```

Every backend call uses `credentials: include`. This is required for the HttpOnly cookie auth pattern to work. **Any new API call must follow this pattern** — do not build a fetch call without `credentials: include` or it will silently fail to authenticate.

### 4.6 Component Tree ⚠️ PROVISIONAL — Partial, Needs Full T1 Pass

Confirmed to exist (from file references across S9-S11 sessions):

```
App.jsx
├── Dashboard.jsx
├── TrackWorkout.jsx
│   ├── GuidedWorkoutView.jsx
│   │   └── ExerciseIllustration.jsx (S10, wired to 3 surfaces)
│   ├── RestTimerOverlay.jsx
│   └── ExerciseResult.jsx
├── Exercises.jsx (Exercise Library)
├── CreateTemplateModal.jsx
│   └── ExerciseSelector.jsx (equipment filter, multi-select — S11)
├── AnalyticsView.jsx
├── Assessment.jsx
├── Profile.jsx
└── Timer.jsx (settings/timer defaults page)

Contexts:
├── WorkoutContext.jsx (the Brain)
└── TimerContext.jsx (timer-default sync, separate from active session timers)
```

**This tree is incomplete.** It reflects only components referenced during S9-S11 session work. A full component inventory (every file in `src/components/` and `src/pages/`) has not been compiled. First Fable 5 audit task should include generating a complete, verified version of this section.

---

## 5. DATA MODEL

### 5.1 Profile Object ✅ VERIFIED (StorageService/WorkoutContext)

```json
{
  "id": "user_default | user_<generated>",
  "name": "string",
  "color": "hex",
  "avatar": "single character"
}
```

Cloud/authenticated profiles additionally carry an `email` field — this is what the `canSyncToBackend` gate checks for (Section 4.2).

### 5.2 Exercise Object ✅ VERIFIED (DEFAULT_EXERCISES structure)

```json
{
  "id": "wt_bench | cal_pushup | yoga_child | cardio_run",
  "name": "string",
  "category": "Weights | Calisthenics | Yoga | Cardio",
  "primary_muscle": "string",
  "equipment": "string | undefined",
  "instructions": "string",
  "isDurationBased": true,
  "illustration": "/illustrations/{id}.jpg"
}
```

73 built-in exercises. ID prefix indicates category: `wt_` (weights), `cal_` (calisthenics), `yoga_`, `cardio_`.

### 5.3 Template Object ✅ VERIFIED

```json
{
  "id": "string",
  "name": "string",
  "exercises": ["exercise_id", ...] | [{ "id": "...", "sets": 3 }, ...],
  "sets": 3,
  "isCustom": true
}
```

Note the dual format — legacy templates store exercises as plain ID strings; custom templates built via `saveWorkoutAsTemplate()` store richer objects with per-set target data. Code that reads `template.exercises` must handle both shapes (see `getExerciseById` safety lookup pattern in WorkoutContext).

### 5.4 Active Workout / History Object ✅ VERIFIED

```json
{
  "id": "string",
  "name": "string",
  "startTime": "ISO string",
  "endTime": "ISO string | undefined",
  "status": "preparing | active | completed",
  "sourceTemplateId": "string | undefined",
  "notes": "string",
  "currentExerciseIndex": 0,
  "currentSetIndex": 0,
  "exercises": [
    {
      "id": "generated",
      "exercise": { /* full Exercise object, embedded */ },
      "sets": [
        {
          "id": "generated",
          "weight": 0,
          "targetReps": 0,
          "targetTime": 0,
          "reps": 0,
          "distance": 0,
          "time": 0,
          "completed": false,
          "isPR": false,
          "lastPerformance": { /* object or null */ }
        }
      ]
    }
  ],
  "recommendations": [ /* populated on finishWorkout() */ ]
}
```

**Known gap (flagged in Fable 5 brief, Section 3):** no `setType` field exists (warm-up/working/AMRAP/drop). All sets are currently treated identically in volume calculations. If this is built, it is a new field on the set object — add it here and update this doc in the same commit.

---

## 6. PERSISTENCE FLOW

```
User action (e.g. complete a set)
        │
        ▼
WorkoutContext function (e.g. toggleSetComplete)
        │
        ▼
ActiveWorkoutService pure reducer (returns new state)
        │
        ▼
setActiveWorkout(newState)  ← React state updates
        │
        ▼
useEffect fires (activeWorkout changed)
        │
        ▼
StorageService.saveActiveWorkout(uid, workout)  ← localStorage write
        │
        ▼
(if canSyncToBackend) ApiService call  ← fire-and-forget backend sync
```

**Critical property:** the localStorage write is synchronous and always happens. The backend sync is best-effort and never blocks the UI. This is why the app works fully offline — the backend is a convenience layer for cross-device sync, not a dependency for core function.

---

## 7. BACKEND ARCHITECTURE 📋 SESSION-NOTES — REQUIRES T1 VERIFICATION

**Everything in this section is compiled from session notes and prior discovery reports, not read directly from backend source files. Treat as a starting hypothesis, not ground truth, until a terminal with backend repo access confirms it.**

**Confirmed routes (via `/openapi.json` reads and T1 discovery reports across sessions):**

```
GET  /health                    → {"status": "ok"}  (no SHA field — known gap)
GET  /openapi.json              → full route schema
GET  /api/profile                → ProfileResponse (UserResponse + UserStatsResponse)
PUT  /api/profile                → accepts ProfileUpdate (all fields Optional)
                                    theme, units, sound_enabled, default_rest_time,
                                    default_work_time, coach_personality, coach_voice_id
POST /api/coach/chat             → SSE streaming, AI Coach conversation
POST /api/voice/coach-synthesize → ElevenLabs voice synthesis
POST /api/templates              → mentioned in backlog notes, not confirmed live
```

**Database:** PostgreSQL on Railway. Migrations via Alembic, revision IDs constrained to under 32 characters (VARCHAR(32) column limit — this caused a silent deploy failure once, see MASTER_CONTEXT.md Section 9).

**Known table:** `CoachMessage` — stores AI Coach conversation history, CASCADE delete tied to user.

**Auth:** Google OAuth, HttpOnly cookie, `SameSite=None; Secure`. Frontend calls `/api/auth/me` on mount with `credentials: include` to check session state — 📋 session-notes, endpoint not directly confirmed against source.

**Pinned dependency:** `bcrypt==4.0.1` — passlib incompatibility with bcrypt 5.0+, never upgrade.

**First Fable 5 backend task should be:** read the actual FastAPI route files, confirm every route above against source, fill in any routes missing from this list, and update this section from 📋 SESSION-NOTES to ✅ VERIFIED.

---

## 8. AI COACH INTEGRATION 📋 SESSION-NOTES — REQUIRES T1 VERIFICATION

```
Model:        claude-sonnet-4-6 (default, per session notes)
Voice:        ElevenLabs, default voice "Jarvis" (FxZjRiAEBESrb7srpme7)
Transport:    SSE streaming via POST /api/coach/chat
Frontend:     ReadableStream fetch pattern (exact component not confirmed —
              likely a dedicated CoachChat or similar component, not yet
              located in available files)
Storage:      CoachMessage table, PostgreSQL, CASCADE delete on user removal
```

**For nutrition photo/voice logging integration (Fable 5 build target, see FABLE5_SESSION12_BRIEF.md Section 2.4):** this should be a **separate call path**, not routed through the existing Sonnet 4.6 coach conversation endpoint. Use Claude Haiku 4.5 for photo/voice parsing — different task complexity, different cost profile. Do not overload `/api/coach/chat` with structured-data-extraction traffic; that endpoint's SSE streaming pattern is built for conversational responses, not JSON extraction.

---

## 9. DESIGN SYSTEM ✅ VERIFIED (built and implemented this session, S11)

```
Canvas:          #0e0e18
Surface 1:       #16162a  (cards)
Surface 2:       #1e1e2e  (rows)
Surface 3:       #28283c  (inputs/chips)
Card border:     rgba(255, 255, 255, 0.07)
Primary accent:  #bfff00  (neon green)
Rest timer:      #3b82f6  (blue, unchanged from pre-S11)

Card radius:     12px
Input/row radius: 8px
Pill/chip radius: 999px
CTA button radius: 10px

Typography:      font-feature-settings: "tnum" on all weight/rep/timer displays
Completed set:   rgba(52,199,89,0.10) bg + rgba(52,199,89,0.6) left border
                 (NOT a full opaque flood — deliberate choice per S11 research)
```

This is the token foundation referenced in Section 1 of FABLE5_SESSION12_BRIEF.md — carries forward into any visual redesign work.

---

## 10. KNOWN TECHNICAL DEBT

| Item | Status | Notes |
|---|---|---|
| Profile switch race condition | Open, P3 | `activeWorkout` persist effect can fire before incoming profile's workout is restored. Fix pattern: `useRef` guard, same approach as existing mount guard. |
| Set-type differentiation | Not built | All sets (warm-up/working/AMRAP) treated identically in volume calcs. Flagged in Fable 5 brief as P0. |
| Component tree documentation | Incomplete | Section 4.6 above needs full audit pass. |
| Backend architecture | Unverified | Section 7 above is session-notes only, not source-verified. |
| npm audit — workbox transitive deps | Open | Backlog item, not yet actioned. |
| OAuth state/nonce/PKCE hardening | Open | Backlog item, not yet actioned. |

---

## 11. HOW TO EXTEND THIS APP SAFELY

**Adding new persisted state:**
1. Add key to `StorageService.KEY`
2. Add to `PROFILE_SCOPED_BASE_KEYS` if profile-scoped
3. Add `save*`/`load*` methods in StorageService
4. Add state variable + persist `useEffect` in WorkoutContext, following existing pattern exactly
5. If it should sync to backend, gate it behind `canSyncToBackend`/`canSyncRef` — do not write a new auth check
6. Update this document, Section 4.2 and 4.4

**Adding new active-workout mutations:**
1. Add a pure function to `ActiveWorkoutService.js`, following the `(state, payload) → newState` signature
2. Call it from a new WorkoutContext function — never mutate `activeWorkout` directly elsewhere

**Adding a new backend route:**
1. Confirm zone classification (auth/schema changes = HIGH zone, sign-off required)
2. Update `/openapi.json` will reflect it automatically — verify via Chrome MCP
3. Update this document, Section 7

**Adding a new screen/route:**
1. Follow existing page component pattern (see Section 4.6)
2. Apply the Section 9 design tokens — do not introduce new colors/radii without updating Section 9
3. Update this document, Section 4.1

**Before starting any session:** read this document in full, then read MASTER_CONTEXT.md for workflow/ceremony rules. This document is the *what and how*; MASTER_CONTEXT.md is the *process*.

---

*Compiled from: WorkoutContext.jsx, StorageService.js, ActiveWorkoutService.js, package.json (all source-verified), FULL_APP_ASSESSMENT.md, PROJECT_CONTEXT.md, and session notes/memory across S9-S11. Backend sections require T1 verification before being treated as authoritative. Last updated: Session 11 close, 2026-07-03.*
