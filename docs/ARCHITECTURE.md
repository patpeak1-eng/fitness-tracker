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

Backend:   FastAPI + PostgreSQL (Railway) — ✅ VERIFIED, see Section 7
Auth:      Dual: Bearer JWT (email/password) OR HttpOnly session cookie
           (Google OAuth) — ✅ VERIFIED, see Section 7
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
                                    │   ✅ VERIFIED — see Sec 7        │
                                    │                                  │
                                    │  9 routers: auth, profile,       │
                                    │  workouts, assessments, weight,  │
                                    │  templates, exercises, coach,    │
                                    │  voice + /health                 │
                                    └────────────────────────────────┘
```

---

## 4. FRONTEND ARCHITECTURE

### 4.1 Routing ✅ VERIFIED (read directly from App.jsx, S17 audit 2026-07-14)

All route pages are lazy-loaded (`React.lazy`) so each compiles to its own chunk. Two routes render outside the auth gate so OAuth callback and login work with no profile; the rest nest under `/` inside `<Layout />` and redirect to `/login` when no `currentProfile` exists.

| Route | Page | Notes |
|---|---|---|
| `/login` | Login | Outside auth gate |
| `/auth/callback` | AuthCallback | Google OAuth landing; outside auth gate |
| `/` | Dashboard | Central hub; active-workout card with resume + cancel actions |
| `/track` | TrackWorkout | Active session view (guided) or template picker |
| `/history` | History | Completed workout list → WorkoutDetails |
| `/timer` | Timer | Timer-defaults page (rest/work durations, per-exercise prefs) |
| `/exercises` | Exercises (Exercise Library) | Read-only browsing/reference |
| `/analytics` | Analytics | Charts, muscle volume distribution (recharts chunk) |
| `/coach` | CoachView | AI Coach chat (SSE streaming) |
| `/summary` | WorkoutSummary | Post-workout summary/confetti screen |
| `/profile` | Profile | Stats, weight history, data export/import |
| `/settings` | Settings | Theme/units/sound, AI Coach prefs, equipment profiles |
| `/assessment` | Assessment | Onboarding wizard, recommendation engine |
| `/help` | HelpView | Help/reference content |
| `/profiles` | ProfileSelector | Local (device-only) multi-profile management — create/switch/delete; entry point: Settings > Account > "Manage local profiles" (S17 Task 6). Local profiles have no `email`, so `canSyncToBackend` keeps them off the backend by design |

Template creation is a modal (`CreateTemplateModal.jsx` → `ExerciseSelector.jsx`) over `/track`, not a routed page.

Provider nesting (App.jsx): `BrowserRouter > ErrorBoundary > WorkoutProvider > TimerProvider > Routes`. A shared `timerApiRef` bridges WorkoutContext → TimerContext imperative actions (WorkoutProvider can't `useTimer()` because TimerProvider is nested inside it).

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
  coachPersonality, coachVoiceId          — AI Coach prefs (S13)
  experienceLevel  — beginner/intermediate/advanced (S16, syncs to backend)
  defaultRestTime, defaultWorkTime
  userStats        — age, height, weight, goal, etc.
  weightHistory    — array of {date, weight}
  activeEquipmentProfileId, customEquipmentItems — equipment system (S15, local-only)

Hydration gates (S13/S15 — see pattern 7 below):
  historyHydratedFor, activeWorkoutHydratedFor, settingsHydratedFor
  (+ timerHydratedFor in TimerContext.jsx)

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

7. **Hydration-gate pattern (S13, swept app-wide S13 commit `040edd4`; the modern replacement for the older mount-guard refs):** every persist `useEffect` is gated on a `*HydratedFor` state variable holding the profile id whose data has actually been restored into React state — `if (!currentProfile || xHydratedFor !== currentProfile.id) return;`. `refreshProfileData(profile)` sets the gate to the profile's id only *after* loading that profile's stored values into state. This prevents the persist effect from writing initial/default state over stored data on mount, and — unlike the old `useRef` mount guards — survives React StrictMode's double-mount replay (mount-guard refs were proven insufficient in the S13 reload-persistence regression, commit `c70a32f`). Gates in use: `historyHydratedFor`, `activeWorkoutHydratedFor`, `settingsHydratedFor` (WorkoutContext) and `timerHydratedFor` (TimerContext, S15 — gates timer defaults and `exercisePrefs`). **Any new persist effect must be gated the same way — never use a bare mount-ref.**

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

### 4.5 ApiService.js ✅ VERIFIED (read directly from source, S12 audit)

All authenticated calls go through a single `apiFetch` wrapper:

```
apiFetch(path, options)
  - credentials: 'include' always (sends the HttpOnly session_token cookie)
  - Authorization: Bearer <token> attached ONLY when
    localStorage 'fitness_auth_token' exists — deliberately omitted otherwise,
    because the backend prefers the header over the cookie and a
    "Bearer null" header would shadow the cookie and break OAuth users
  - rejects immediately if VITE_API_URL is not configured

Exported calls (all via apiFetch unless noted):
  register/login          → plain fetch, surface 4xx JSON detail to the UI
  getMe                   → cookie-only fetch to /api/auth/me
  getHistory/saveWorkout  → /api/workouts (saveWorkout maps camelCase → snake_case)
  get/save/clearActiveWorkout → /api/workouts/active
  getProfile/saveProfile  → /api/profile (partial objects OK — ProfileUpdate
                            fields are all Optional server-side)
  getWeightHistory/addWeightEntry → /api/weight
  get/save/deleteCustomTemplate   → /api/templates
  sendCoachMessage        → /api/coach/chat (returns raw Response for SSE —
                            never call .json() on it)
  getCoachHistory         → /api/coach/history
  synthesizeVoice         → /api/voice/coach-synthesize
```

**Any new API call must go through `apiFetch`** — it encodes both auth
transports. Do not hand-roll a fetch without `credentials: 'include'`, and do
not send an Authorization header when there is no token.

### 4.6 Component Tree ✅ VERIFIED (full `src/` inventory, S17 audit 2026-07-14)

```
src/
├── App.jsx                      — router + provider nesting (see 4.1)
├── main.jsx / index.css         — entry + global styles (design tokens)
│
├── pages/                       — one per route (all lazy-loaded)
│   ├── Login.jsx / AuthCallback.jsx
│   ├── Dashboard.jsx            — hub; resume/cancel active workout
│   ├── TrackWorkout.jsx         — picker + active session shell
│   ├── History.jsx
│   ├── Timer.jsx                — timer-defaults page
│   ├── Exercises.jsx            — exercise library (read-only)
│   ├── Analytics.jsx            — (AnalyticsView.css is its stylesheet)
│   ├── CoachView.jsx            — AI Coach chat
│   ├── WorkoutSummary.jsx
│   ├── Profile.jsx / Settings.jsx / Assessment.jsx / HelpView.jsx
│   └── ProfileSelector.jsx      — local multi-profile management (/profiles, S17)
│
├── components/
│   ├── layout/    Layout.jsx (shell + <Outlet/>), BottomNavigation.jsx,
│   │              SyncStatusBadge.jsx (SyncQueue state indicator)
│   ├── common/    Card.jsx, Modal.jsx, CustomSelect.jsx, BackButton.jsx,
│   │              ErrorBoundary.jsx, ExerciseIllustration.jsx
│   ├── workout/   GuidedWorkoutView.jsx, ExerciseSelector.jsx,
│   │              CreateTemplateModal.jsx, TemplateSelector.jsx,
│   │              RestTimerOverlay.jsx, ExerciseResult.jsx,
│   │              InstructionModal.jsx, WorkoutNotesModal.jsx,
│   │              PlateCalculator.jsx, ExerciseMedia.jsx, BodyHighlightSVG.jsx
│   ├── history/   WorkoutDetails.jsx
│   └── analytics/ ProgressChart.jsx
│
├── context/
│   ├── WorkoutContext.jsx       — the Brain (HIGH ZONE, ~2100 lines)
│   └── TimerContext.jsx         — rest/work timers + timer-default persistence
│
├── services/
│   ├── StorageService.js        — localStorage, profile-scoped keys
│   ├── ApiService.js            — backend client (HIGH ZONE)
│   ├── SyncQueue.js             — persistent retry queue for failed pushes (S12)
│   └── ActiveWorkoutService.js  (+ .test.js) — pure reducers
│
├── constants/  storageKeys.js, coachPersonalities.js, voiceIds.js
└── utils/      recommendationEngine.js, units.js, types.js,
                exerciseFilters.js (S17 — shared filter predicates + canonical
                category/muscle/equipment vocabulary for Exercises.jsx and
                ExerciseSelector.jsx; matchesEquipmentProfile mirrors
                WorkoutContext's internal isExerciseCompatible)
```

### 4.7 Settings Sync + SyncQueue ✅ VERIFIED (S12–S16)

**Settings-sync, end to end:** `theme`, `units`, `soundEnabled`, `coachPersonality`, `coachVoiceId`, and `experienceLevel` each follow the identical path —

```
Settings UI change
  → WorkoutContext state setter
  → persist useEffect (gated on settingsHydratedFor === currentProfile.id)
      1. StorageService.save*(uid, value)          ← always, synchronous
      2. if (canSyncToBackend) ApiService.saveProfile({ field })  ← partial PUT /api/profile
      3. on push failure → SyncQueue.enqueue({type, key, payload})
```

The backend `PUT /api/profile` handler is a generic `setattr` loop over Optional `ProfileUpdate` fields — adding a new synced setting needs a migration + `models.py` column + `schemas.py` field, but **no handler edit** (see memory: profile-sync field pattern). On login, a pull backfills local state from the server profile.

**SyncQueue (`src/services/SyncQueue.js`, S12):** persistent localStorage-backed retry queue for failed cloud pushes. Ops carry a `(type, key)` dedupe key so only the latest value per item is held. Executors are registered at runtime from WorkoutContext (keeps SyncQueue dependency-free, no import cycles). The queue flushes on boot, on `online`, and on foreground; a 401 during replay stops flushing and raises `authExpired`, which surfaces a re-login banner via `SyncStatusBadge.jsx`. **Any new backend push path must enqueue on failure and register an executor.**

**Food log sync (S19, spec: docs/nutrition_spec_s18.md §7.4):** `foodLog` state in WorkoutContext is local-first like `weightHistory` — entries keep the backend's snake_case field names plus `id`/`client_id`/`backendId`. Persistence is hydration-gated on `settingsHydratedFor` (restored in the same `refreshProfileData` batch, so the existing gate covers it — no new flag). Every entry gets a frontend `client_id` at creation; the backend POST is idempotent on `(user_id, client_id)`, so queue replays can't duplicate rows. Three executor types: `food_log` (create), `food_log_update`, `food_log_delete` — the latter two resolve a missing backend UUID by `client_id` via the list endpoint (queue order guarantees a pending create flushes first; this also closes the offline-create-then-delete resurrection hole). Login pull rides the existing 6-promise `allSettled` (90-day window), union-merges by `client_id`, and **adopts** backend UUIDs onto local entries that were pushed via the queue (executors deliberately never write back into storage — the persist effect would clobber it). Device-only entries backfill through the same once-per-boot-gated block as workouts/weights.

### 4.8 Equipment Profile System ✅ VERIFIED (S15, local-only)

`DEFAULT_EQUIPMENT_PROFILES` in WorkoutContext defines five tiers — `full_gym`, `home_gym`, `fire_station`, `bodyweight_only`, `custom` — each an equipment string list. `activeEquipmentProfileId` + `customEquipmentItems` are profile-scoped persisted state (hydration-gated, **local-only — deliberately not backend-synced**). `TrackWorkout.jsx` and `ExerciseSelector.jsx` consume the active profile to filter exercises by their `equipment` field.

**Gotcha (from S15):** `exercise.equipment` uses `/` both as an OR-separator AND inside literal multi-word names (`"Parallel Bars/Bench"`). Matching logic must test the full string before slash-splitting.

**Other S12–S16 UI changes worth knowing:** Dashboard's active-workout card gained a cancel action (S15/S16 — `cancelWorkout()` from WorkoutContext, confirm-guarded), alongside the existing cancel paths in TrackWorkout and GuidedWorkoutView.

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
          "setType": "normal | warmup",
          "lastPerformance": { /* object or null */ }
        }
      ]
    }
  ],
  "recommendations": [ /* populated on finishWorkout() */ ]
}
```

**Set-type differentiation (SHIPPED S13):** `setType` exists on every set (`'normal'` default, `'warmup'`). Warm-up sets are excluded from progression judgment (working sets only), are never PR-eligible, and are surfaced distinctly in GuidedWorkoutView, Analytics, WorkoutSummary, and WorkoutDetails. Sets predating the field (`setType === undefined`) count as working sets. AMRAP/drop set types are **not** built — only normal/warm-up.

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

## 7. BACKEND ARCHITECTURE ✅ VERIFIED (read directly from backend source, S12 audit)

**Verified against `backend/main.py`, every router in `backend/app/routers/`, and the live `/openapi.json` (2026-07-03; nutrition router added S19). All ten routers are registered in `main.py`; none use `include_in_schema=False`. The live schema matches source exactly.**

**Complete route inventory (from source decorators):**

```
GET  /health                     → {"status": "ok"}  (no SHA field — known gap)

/api/auth      (routers/auth.py)
  POST /register                 → Token (201)
  POST /login                    → Token
  GET  /google                   → OAuth redirect — CSRF state cookie (S8) +
                                    PKCE S256 challenge/verifier cookie (S18)
  GET  /google/callback          → validates state + PKCE verifier (missing
                                    verifier fails closed → /login?error=
                                    auth_failed), sends code_verifier in the
                                    token exchange, sets HttpOnly
                                    session_token cookie
  GET  /me                       → session check — dual-transport (cookie or
                                    Bearer) since S14 (810c940); was cookie-only
                                    before. Frontend getMe deliberately stays
                                    cookie-only (see 4.5)
  POST /logout                   → clears session cookie
  DELETE /account                → permanently deletes user + ALL data (S18).
                                    Requires typed confirm=="DELETE"; local
                                    (email/password) users must also re-enter
                                    their password (OAuth users can't — sentinel
                                    hash). Single-transaction delete relies on
                                    the ON DELETE CASCADE FKs (no per-table
                                    cleanup); clears session cookie; 204.
                                    Rate-limited per user like login.

/api/profile   (routers/profile.py)
  GET  ""                        → ProfileResponse (UserResponse + UserStatsResponse)
  PUT  ""                        → ProfileUpdate (all fields Optional; generic
                                    setattr loop — new synced fields need no
                                    handler edit)

/api/workouts  (routers/workouts.py)
  GET  ""                        → WorkoutListResponse
  POST ""                        → WorkoutResponse (201)
  GET  /active                   → ActiveWorkoutResponse | null
  PUT  /active                   → upsert active workout blob
  DELETE /active                 → 204
  DELETE /{id}                   → 204

/api/assessments (routers/assessments.py)   GET "", POST ""
/api/weight      (routers/weight.py)         GET "", POST "" (201)
/api/templates   (routers/templates.py)      GET "", POST "" (201), DELETE /{id} (204)
/api/exercises   (routers/exercises.py)      GET "", POST "" (201)

/api/coach     (routers/coach.py)
  POST /chat                     → SSE streaming AI Coach chat
                                    (model claude-sonnet-4-6, prompt-cached
                                    system blocks, rate-limited)
  POST /chat/stream              → deprecated alias, delegates to /chat
  GET  /history                  → last 20 CoachMessage rows

/api/voice     (routers/voice.py)
  POST /coach-synthesize         → ElevenLabs TTS, returns base64 MP3
  WS   /stream                   → streaming TTS bridge to ElevenLabs
                                    (WebSocket — never appears in openapi.json;
                                    auths via session_token cookie or ?token=)

/api/nutrition (routers/nutrition.py)  — S19, spec: docs/nutrition_spec_s18.md
  POST /log                      → FoodLogResponse (201). client_id idempotent
                                    upsert (same IntegrityError pattern as
                                    workouts). All sources funnel here — the
                                    AI/barcode paths analyze first, user
                                    reviews/edits, THEN posts.
  GET  /log?start=&end=          → entries in range (default last 30 days)
  PUT  /log/{id}                 → edit own entry (404 on others'); keeps
                                    AI-estimated values user-correctable
  DELETE /log/{id}               → 204, own rows only
  POST /analyze                  → Claude Vision (claude-sonnet-4-6): ONE
                                    endpoint for meal photos AND nutrition
                                    labels (model classifies, returns strict
                                    JSON estimate + confidence). NEVER
                                    persists; rate-limited per user
                                    (NUTRITION_ANALYZE_LIMIT); 503 without
                                    ANTHROPIC_API_KEY; ~5 MB image cap.
  GET  /barcode/{code}           → Open Food Facts lookup, cache-first
                                    (off_product_cache table, 90-day
                                    freshness). GLOBAL outbound throttle
                                    (OFF_OUTBOUND_LIMIT — OFF's 15/min limit
                                    is per-IP, all users share the backend
                                    IP). Stale cache served on throttle/OFF
                                    outage; 503+Retry-After only when there
                                    is no cache at all; 404 unknown barcode.
  GET  /summary?days=N           → daily calorie/macro totals (coach context
                                    + future consumers; frontend dashboard
                                    computes its own totals/EMA from local
                                    data per spec Section 5)
```

**Database:** PostgreSQL on Railway. Migrations via Alembic (7 revisions in `alembic/versions/`), revision IDs constrained to under 32 characters (VARCHAR(32) column limit — this caused a silent deploy failure once, see MASTER_CONTEXT.md Section 9).

**Known tables beyond the 0001 core eight:** `coach_messages` (0003 — AI Coach conversation history, CASCADE delete tied to user); `food_log` (0007/S19 — nutrition entries, user-scoped, CASCADE, per-user-unique `client_id` like workout_history); `off_product_cache` (0007/S19 — shared no-user-id barcode→product cache for Open Food Facts, 90-day freshness). `food_log` keeps the account-deletion "single-transaction, no per-table cleanup" invariant intact (standard cascade shape on `User.food_entries`).

**Auth (✅ VERIFIED from `app/auth.py` `get_current_user`):** dual-transport, one dependency:
- `Authorization: Bearer <JWT>` header — email/password users (JWT in localStorage). Takes **precedence** when present (`HTTPBearer(auto_error=False)`).
- HttpOnly `session_token` cookie — Google OAuth users. Fallback when no Bearer header.
- Both carry the same signed JWT (`sub` = user id); decode path is identical.
- This is why openapi.json shows an HTTPBearer security scheme while the app also works cookie-only — **both documents were right; the patterns coexist by design.** Any new authenticated endpoint just takes `Depends(get_current_user)` and gets both transports for free.
- WebSocket routes can't carry the header from a browser — `/api/voice/stream` mirrors the contract via cookie or `?token=` query param (`voice._authenticate_ws`).

**Rate limiting:** `app/rate_limit.py` caps per-user coach, voice, and nutrition-analyze calls (cost guardrail on Anthropic/ElevenLabs spend), plus a GLOBAL (not per-user) `off_outbound` throttle on Open Food Facts calls — OFF's 15 req/min limit is per-IP and all users share the backend's IP (S19).

**Pinned dependency:** `bcrypt==4.0.1` — passlib incompatibility with bcrypt 5.0+, never upgrade.

---

## 8. AI COACH INTEGRATION ✅ VERIFIED (read directly from source, S12 audit)

```
Model:        claude-sonnet-4-6 (COACH_MODEL in routers/coach.py, max_tokens 1024)
Personas:     apex (default) / hype / zen — persona prompt is system block 1,
              static app-knowledge prompt is block 0, both prompt-cached;
              per-request user context (experience level + stats + last 10
              workouts + active session + 7-day NUTRITION summary line when
              food_log rows exist — plain averages only, never per-entry
              data; trend questions are deflected to the dashboard by the
              NUTRITION BOUNDARY block in the system prompt, S19) is
              block 2, uncached
Calibration:  users.experience_level (beginner/intermediate/advanced, default
              intermediate, migration 0006) controls response DEPTH — the
              EXPERIENCE CALIBRATION block in COACH_SYSTEM_PROMPT tells the
              model how much to explain per level. Set by Assessment
              completion or Settings > AI Coach; syncs via PUT /api/profile
              like theme/units/coach prefs (S16 spec:
              docs/experience_level_spec_s16.md)
Voice:        ElevenLabs "Jarvis" (FxZjRiAEBESrb7srpme7), model eleven_flash_v2_5;
              REST synth at POST /api/voice/coach-synthesize, streaming bridge
              at WS /api/voice/stream
Transport:    SSE streaming via POST /api/coach/chat
Frontend:     src/pages/CoachView.jsx; ApiService.sendCoachMessage returns the
              raw Response for ReadableStream consumption
Storage:      CoachMessage table, PostgreSQL, CASCADE delete on user removal;
              chat replays last 10 turns, /history returns last 20
Guardrails:   per-user rate limits on both coach and voice (app/rate_limit.py);
              503 when ANTHROPIC_API_KEY / ELEVENLABS_API_KEY unset
```

**For nutrition photo/voice logging integration (Fable 5 build target, see FABLE5_SESSION12_BRIEF.md Section 2.4):** this should be a **separate call path**, not routed through the existing Sonnet 4.6 coach conversation endpoint. Use Claude Haiku 4.5 for photo/voice parsing — different task complexity, different cost profile. Do not overload `/api/coach/chat` with structured-data-extraction traffic; that endpoint's SSE streaming pattern is built for conversational responses, not JSON extraction.

---

## 9. DESIGN SYSTEM ✅ VERIFIED — Design Tokens v2 "Ember on Graphite" (LOCKED, S12, shipped `8f03019`)

**`docs/DESIGN_TOKENS.md` is the single source of truth.** It supersedes the S11 system (blue-violet canvas + neon green) that earlier revisions of this section described. Summary only — do not copy values from here into code, read the tokens doc:

```
Neutrals:   graphite scale — --bg-app #0D0D0F, --bg-card #161618,
            --surface #1E1E21, --input-bg #28282C; hairline --border
            rgba(255,255,255,0.06); text #F4F4F2 / #9C9CA3 / #5F5F66
Accent:     --primary #FF5C2A "ember" (CTAs/active/selection ONLY, ≤10% of screen)
Semantics:  --success #3DC96E, --pr-gold #E9B84C (PR + warm-up markers),
            --danger #E5484D, --rest-blue #4C8DFF (rest timer only)
Fonts:      Inter (body/UI) — self-hosted woff2, no CDN
Rule:       one reserved purpose per token; numbers/data never accent-colored
Themes:     light theme via data-theme attribute on root (S15)
```

**Gotcha:** PowerShell bulk edits mojibake UTF-8 in these files — use Node for scripted edits.

---

## 10. KNOWN TECHNICAL DEBT

| Item | Status | Notes |
|---|---|---|
| Profile switch race condition | ✅ Resolved (verified S17 Task 8) | Closed as a side effect of the hydration-gate pattern (4.2 pattern 7): the persist gate compares `activeWorkoutHydratedFor` (whose data is in state) against `currentProfile.id` (whose key would be written), so on a runtime switch the effect is a no-op until `refreshProfileData` restores the incoming profile's data and flips the gate in the same batch. In-flight cloud pulls are separately guarded by `latestProfileIdRef`. Empirically confirmed during S17 Task 6 live profile-switch testing (no cross-profile writes). |
| Set-type differentiation | ✅ Shipped S13 | `setType: 'normal' \| 'warmup'` on every set; warm-ups excluded from progression + PRs (see 5.4). AMRAP/drop not built. |
| Component tree documentation | ✅ Resolved S17 | Section 4.6 is a full verified `src/` inventory as of 2026-07-14. |
| Backend architecture | Verified S12 | Section 7 read directly from backend source + live openapi.json, 2026-07-03; /me dual-transport note added S17. |
| npm audit — workbox transitive deps | ✅ Resolved (verified S17 Task 9) | `npm audit` reports 0 vulnerabilities (686 deps); workbox-build 7.4.1 via vite-plugin-pwa 1.3.0. The early-session findings were resolved upstream by interim dependency upgrades — no change was needed. |
| OAuth state/nonce/PKCE hardening | ✅ Resolved (S18) | state ✅ implemented+validated since S8 (audit confirmed S17); PKCE ✅ S256 added S18 (`code_challenge` on the auth URL, verifier in an `oauth_verifier` HttpOnly cookie with attributes identical to `oauth_state`, `code_verifier` in the token exchange, missing verifier fails closed like a state mismatch); nonce documented-N/A — the flow never consumes the id_token, so there is nothing for a nonce to bind (becomes REQUIRED if id_token validation is ever added; see docs/oauth_hardening_spec_s17.md §2). |
| TimerContext mount-refs | ✅ Resolved S15 | Replaced by `timerHydratedFor` hydration gate. |

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

*Compiled from: WorkoutContext.jsx, StorageService.js, ActiveWorkoutService.js, ApiService.js, SyncQueue.js, App.jsx, full `src/` inventory, backend source + live openapi.json (S12), docs/DESIGN_TOKENS.md, and session notes/memory across S9-S16. Full catch-up audit pass completed S17 — all PROVISIONAL flags cleared; routing (4.1) and component tree (4.6) verified directly against source. Last updated: Session 17, 2026-07-14.*
