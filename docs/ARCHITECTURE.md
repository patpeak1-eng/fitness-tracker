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

A mobile-first Progressive Web App for personal fitness tracking, used by the owner, family, and (since S30) fire-service co-workers — each on their own device with their own account. Workouts can be paused and resumed because training at a fire station gets interrupted; that is the only "fire station" aspect of the product. (Earlier revisions described a "Fire Station profile"; the owner confirmed on 2026-09-10 that no such thing exists and the equipment "station" environment idea did not pan out.) Built as a "Guided Workout" experience — timers, audio cues, smart set recommendations — rather than a spreadsheet-style logger.

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
  exercises        — DEFAULT_EXERCISES (79 built-in) + custom, per-profile
  templates        — DEFAULT_TEMPLATES (7 built-in) + custom, per-profile

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
  equipmentEnvironments — named confirmed photo/manual equipment lists (S24/S25,
                          local-first + cloud profile sync; images never stored)

Hydration gates (S13/S15 — see pattern 7 below):
  historyHydratedFor, activeWorkoutHydratedFor, settingsHydratedFor
  (+ timerHydratedFor in TimerContext.jsx)

Ephemeral session state:
  restTimer        — {timeLeft, isActive, duration}
  workTimer        — {timeLeft, isActive, duration}
  exercisePrefs    — per-exercise timer overrides

Progression state:
  smartProgressionEnabled, progressionMode, progressionType, progressionIncrement
  (staged plans for the progression system: docs/PROGRESSION_ROADMAP.md)

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
                      customTemplates, customExercises, equipmentProfile,
                      customEquipment, equipmentEnvironments, foodLog,
                      nutritionTargets
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
  getHistory/saveWorkout  → /api/workouts (getHistory paginates in 200-row
                            pages until complete history is hydrated;
                            saveWorkout maps camelCase → snake_case)
  get/save/clearActiveWorkout → /api/workouts/active
  getProfile/saveProfile  → /api/profile (partial objects OK — ProfileUpdate
                            fields are all Optional server-side)
  getWeightHistory/addWeightEntry → /api/weight
  get/save/deleteCustomTemplate   → /api/templates
  sendCoachMessage        → /api/coach/chat (message + up to 6 transient images
                            + active workout + bounded app context; returns raw Response for SSE — never
                            call .json() on it)
  getCoachHistory         → /api/coach/history
  analyzeEquipment        → /api/coach/equipment/analyze (1-6 transient images;
                            combined confirmed equipment is saved by the client)
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

**Food log sync (S19, full-history hydration S24; spec: docs/nutrition_spec_s18.md §7.4 and docs/ai_coach_expansion_spec_s24.md):** `foodLog` state in WorkoutContext is local-first like `weightHistory` — entries keep the backend's snake_case field names plus `id`/`client_id`/`backendId`. Persistence is hydration-gated on `settingsHydratedFor` (restored in the same `refreshProfileData` batch, so the existing gate covers it — no new flag). Every entry gets a frontend `client_id` at creation; the backend POST is idempotent on `(user_id, client_id)`, so queue replays can't duplicate rows. Three executor types: `food_log` (create), `food_log_update`, `food_log_delete` — the latter two resolve a missing backend UUID by `client_id` via the list endpoint (queue order guarantees a pending create flushes first; this also closes the offline-create-then-delete resurrection hole). Login pull rides the cloud `allSettled` batch, requests from Unix epoch forward (complete durable history), union-merges by `client_id`, and **adopts** backend UUIDs onto local entries that were pushed via the queue (executors deliberately never write back into storage — the persist effect would clobber it). Device-only entries backfill through the same once-per-boot-gated block as workouts/weights.

**Assessment sync (S24):** the previously unused `/api/assessments` routes now
participate in cloud pull, local/backend-id adoption, device-only backfill, and
the retry queue. The frontend-generated assessment `id` remains inside the
JSONB payload and is the cross-device merge key. This makes assessment goals
and equipment answers available to durable Coach context rather than only the
originating browser.

### 4.8 Equipment Profile System ✅ VERIFIED (S15, local-only)

`DEFAULT_EQUIPMENT_PROFILES` in WorkoutContext defines five tiers — `full_gym`, `home_gym`, `fire_station`, `bodyweight_only`, `custom` — each an equipment string list. `activeEquipmentProfileId` + `customEquipmentItems` are profile-scoped persisted state (hydration-gated, **local-only — deliberately not backend-synced**). `TrackWorkout.jsx` and `ExerciseSelector.jsx` consume the active profile to filter exercises by their `equipment` field.

S24 adds `equipmentEnvironments`: named, confirmed equipment arrays created
manually or from the Coach photo-review flow. S25 makes them local-first and
cross-device through nullable `users.equipment_environments` JSONB. `NULL`
means an upgraded device may backfill its local S24 list once; after the server
holds an array, including `[]`, the cloud value wins on login so deletions do
not resurrect from stale device storage. Changes use the hydration-gated
profile-setting effect and existing retry queue. Environments activate through
`sessionEquipmentOverride`, so the exercise compatibility filter is unchanged.

The S25 capture surface requests the outward camera first with an explicit
front/back flip control, retains native-camera and multi-file fallbacks, and
collects up to six removable photos. All photos are browser-normalized to JPEG
at no more than 1280 px. The same transient set can be analyzed jointly for a
combined editable inventory and attached directly to the next Coach turn. Raw
photos, object URLs, and model image blocks are discarded; only confirmed
equipment metadata is stored.

S25.1 clarifies this temporary-photo lifecycle in the interface: attached
photos can either be analyzed into an editable inventory for a named location
or sent with the next Coach message for discussion. After a successful Coach
reply, the app clears the attachments and explains that they were removed for
privacy. Live video is explicitly deferred; the still-photo workflow is the
current product path. See `docs/ai_coach_photo_flow_maintenance_s25_1.md`.

S25.2 closes the equipment panel as soon as a photo-bearing Coach request is
accepted for streaming, releasing the camera preview so the reply remains
visible. A failed request retains the photos for retry, and the existing
successful-reply cleanup still removes them for privacy. A user who explicitly
starts a Coach-proposed workout now routes directly to `/track`, the existing
preparation surface, rather than taking a dashboard detour. See
`docs/ai_coach_handoff_polish_s25_2.md`.

S25.3 keeps Coach proposals athlete-adjustable before training begins: the
Preparation rows use the existing `removeSet` state action alongside Add Set,
but never allow an exercise to have zero sets and never expose removal after a
guided workout starts. Built-in exercise visuals use the canonical local
`illustration` field, with `imageUrl` only as a legacy/custom fallback. This
unifies the detail sheet with the existing library and guided-workout visual
surfaces. See `docs/preparation_controls_visual_contract_s25_3.md`.

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

79 built-in exercises. ID prefix indicates category: `wt_` (weights), `cal_` (calisthenics), `yoga_`, `cardio_`.
Six were added in S30 from a short workout video (`docs/tiktok_exercises_spec_s30.md`): all `Weights` / `Dumbbells`, rep-based, with illustrations generated in the house style (per-panel phase labels, no title; `wt_lunge.jpg` is the appearance reference). A built-in template entry may carry per-set targets — `{ id, sets: [{ targetReps }] }` — and `dumbbell_full_body` is the first built-in to use that form. A timed set with an external load is **not** supported end to end (preparation, summary, analytics, PR, and progression all assume reps); see that spec §5 before adding one.

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
  POST /register                 → Token (201) — {access_token, token_type, user_id}
  POST /login                    → Token        — same shape

**`Token.user_id` is the password client's only source of identity (S32 Fix
2a).** It is the canonical `users.id`, and deliberately the same value as the
JWT subject — identity and authorization must name the same user, or a client
scopes its local data by one id while the server attributes its writes to
another. Required, not optional: the server always knows it, so a missing
value should fail response validation rather than reach a client that would
invent one.

Before this, `Token` carried no identity, so `Login.jsx` fell back to
`'cloud_' + Date.now()`. Because `activateProfileAndGo` **replaces the whole
profiles array**, every password sign-in minted a new local profile and
orphaned everything scoped to the previous one. `getMe` could not repair it:
the backend `/me` accepts Bearer, but the frontend `getMe` is cookie-only by
design, so a Bearer-only password session never learned who it was. Google
users were never affected — the OAuth callback sets a cookie and `/me` returns
the canonical id.

Deploy order mattered and was not optional: **2a (backend) shipped and was
verified live (`1a924b6`) before 2b (frontend)**. 2b refuses to activate a
profile without a `user_id`, so a new frontend against a not-yet-rolled-over
backend would have blocked sign-in outright. The two services deploy from one
push but not atomically.

**Client side (S32 Fix 2b).** `Login.jsx` takes the id from `result.user_id`
and nothing else — both `'cloud_' + Date.now()` fallbacks are deleted. A
response missing either `access_token` or `user_id` sets an error and does not
activate a profile. Refusing is the safer failure: a retry costs seconds,
while a silently wrong identity costs the user their local data with no signal.
The missing-token half of that guard also fixes a pre-existing hang — the old
code fell through and left the spinner running for ever.

`handleContinueWithout` is deliberately untouched. The local-only profile has
no server identity by design and still activates `user_default`.

**Credential capability** — not sign-in method — is what the data records.
`hashed_password` is `NOT NULL` for every user, so its presence tells you
nothing; only equality with `GOOGLE_OAUTH_SENTINEL`
(`"google_oauth_no_password"`) does, and what it proves is that the account has
**no usable local password**.

It is not a log of how anyone signs in. `google_callback` only creates a user
when none exists (`if user is None`), so an account first registered with a
password keeps its real hash and can then sign in either way. A real hash
therefore means "password-capable", not "signs in with a password".

`verify_password` **fails closed** on anything passlib cannot parse. Handing it
the sentinel raises `UnknownHashError`, which used to escape the login handler
as a **500** — so typing a password for a Google account returned a server
error rather than "Invalid email or password", and since every real account on
this deployment is OAuth, that was the common case. Found in review of Fix 2
but predating it.

The `try/except` lives in `verify_password`, not at the call sites, so both
callers (`login` and `delete_account`) are covered and a future caller cannot
reintroduce it by forgetting the sentinel. A value that is not a recognisable
hash cannot match any password, so `False` is correct as well as safe — but
note the tempting wrong fix, comparing the plaintext to the stored value, is an
authentication bypass for anyone who knows the constant. There is a test for
exactly that.
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
  GET  ""                        → WorkoutListResponse (excludes soft-deleted)
  POST ""                        → WorkoutResponse (201)
  GET  /active                   → ActiveWorkoutResponse | null
  PUT  /active                   → upsert active workout blob
  DELETE /active                 → 204
  DELETE /deletions/by-client-id?client_id=
                                 → 204 (SOFT delete by the CLIENT's identifier,
                                    valid even for a row the server has never
                                    seen — declared before /{id})
  DELETE /{id}                   → 204 (SOFT delete — sets deleted_at)

**Workout deletion is a soft delete (S32, migration 0011).** `DELETE /{id}`
sets `workout_history.deleted_at` and keeps the row; the list filters
`deleted_at IS NULL` on **both** its count and its row query, and the Coach's
two direct reads (`coach.py`) filter it too. The row is retained on purpose:
it is the server's durable record of the deletion, so a re-upload of the same
`client_id` — from a restored backup or a second device that still holds the
row — collides with it and returns it **with `deleted_at` set** instead of
resurrecting the workout. Because the list hides deleted rows, that POST
response is the only channel through which a client can learn its copy was
deleted elsewhere.

**`DELETE /deletions/by-client-id` is what makes deletion safe (S32 Fix 1b).**
`DELETE /{id}` can only remove a row that already exists. While an upload is
in flight there is nothing to delete, so a client is forced to *infer* from an
absent row whether that upload will land — and that inference cannot be made
safe across a lost response or a crash. Five review rounds on a client-only
design each found a narrower version of the same hole; the endpoint removes
the inference instead of guarding it.

It is a single `INSERT ... ON CONFLICT DO UPDATE`, so no create or second
delete can interleave between a check and a write:

- row exists → soft-deleted, `COALESCE` keeping the **original** deletion time
  so a repeat does not slide it forward;
- row does not exist → a placeholder is written **already deleted**
  (`name='(deleted)'`, since `name` is NOT NULL). A create arriving later
  collides with it and comes back marked `deleted_at`, reusing the Fix 1a
  mechanism, rather than resurrecting the workout.

Idempotent and owner-scoped — a repeat is 204 and never adds a second row,
which is what lets the client keep the intent queued until it succeeds.
Placeholders are excluded from the user-facing history rows and count and from
both Coach reads. They are **not** invisible everywhere, and the doc used to
claim they were: `POST ""` deliberately returns a deleted row as the deletion
acknowledgment, and `DELETE /{id}` reads one to stay idempotent.

`client_id` is a **query parameter, not a path segment**, deliberately. It is
client-generated and therefore an arbitrary string; one containing `/` survives
`encodeURIComponent` as `%2F`, which the ASGI server decodes before routing, so
the request 404s. A live probe against a local backend confirmed it — and the
client dead-letters a non-401/429 4xx, so that 404 would have discarded the
deletion permanently.

**This route never 404s for an unknown `client_id`** — that case is a normal
204. A 404 from it therefore means the route is missing, which is what an older
backend returns while a deploy is still rolling over. The frontend and backend
build from the same push but land independently, so that window is real.
`ApiService.deleteWorkoutByClientId` marks a 404 `retryable`, and `SyncQueue`
keeps a `retryable` error queued instead of dead-lettering it — the only
exception to "a non-auth 4xx means the payload is rejected".

**The path needs TWO segments for that to work**, which is why it is
`/deletions/by-client-id` and not `/by-client-id`. With one segment the old
backend matches it against `DELETE /{id}`, fails to parse `by-client-id` as a
UUID, and returns **422** — which is dead-lettered, discarding the deletion for
good. Verified by loading `origin/main`'s router into a throwaway app: the
one-segment path returns 422 with `loc=['path','id']`, the two-segment path
returns a clean 404.

`POST ""` **accepts** a create with no `client_id` and then **stamps one**:
`client_id = str(row.id)`. The value is the freshly minted primary key, so it
cannot collide, and the stamp only fills a gap — a supplied `client_id` is
never overwritten, because overwriting would break the idempotent re-upload
the whole deletion design rests on.

It is repaired rather than rejected because rejection loses data. Requiring
one was tried and reverted: the shipped login backfill queues the raw local
workout (`WorkoutContext.jsx` ~1036-1048), a legacy or restored row may carry
none, and `SyncQueue` dead-letters any 4xx (`SyncQueue.js` ~131-137) — so a
400 permanently discarded that workout on a client that cannot be updated in
the same deploy. Older deployed clients are still out there; the server
therefore cannot *require* an identifier, but it can supply one.

Why it matters: a row with `client_id` NULL has no durable identity, because
PostgreSQL treats NULLs as distinct under the `(user_id, client_id)` unique
constraint, so a re-upload after deletion inserts a fresh row and resurrects
the workout — and no client can name the row to delete it either. Stamping
makes every row nameable from the moment it exists.

`POST ""` resolves conflicts with `INSERT ... ON CONFLICT DO NOTHING …
RETURNING` and then reads the row back — by the returned id when the insert
happened, and by the **effective** `client_id` (post-stamp) when a conflict
suppressed it. Reading back by the raw payload value would match on NULL and
so match every identifierless row for that user.

It previously caught `IntegrityError` from `commit()` and re-queried. **A
regression test shows that path 500'd on a plain sequential duplicate**: the
re-query raised `MissingGreenlet`, and the client queue retries 5xx forever,
so every duplicate sync became a permanent retry loop. The precise trigger was
*not* isolated — a rollback expires `current_user`, so the likeliest cause is
attribute access on it during the re-query rather than the session as a whole
being unusable. A savepoint was tried and the concurrency test still failed.
The fix removes the exception path instead of depending on which explanation
is right. The other two instances of this pattern are also gone: the food-log
variant in `nutrition.py` (`ON CONFLICT DO NOTHING … RETURNING` plus a
read-back) and `PUT /active`.

`PUT /active` uses `ON CONFLICT (user_id) DO UPDATE`, so one statement covers
the first save, a repeat save, and a genuine race — insert and update are the
same operation, and nothing can reach the session to poison it. The conflict
target is the unique index `ix_active_workout_user_id` (0001), which is what
guarantees one active workout per user.

Its `DO UPDATE` sets `updated_at` **explicitly**. The column's
`onupdate=func.now()` is an ORM-side hook and does not fire for a Core insert,
so without that the timestamp would freeze at the row's first insert — silently,
since nothing else about the response changes.

**The response is built from `RETURNING`, never from a read-back.** Reading the
row again after the commit is its own 500 window: a concurrent clear for the
same user lands in between, the read finds nothing, and the handler raises —
correct final data, wrong response, and the queue retries a 5xx for ever. The
columns are returned explicitly rather than the ORM entity, because an entity
obtained that way is expired by the commit and touching it afterwards triggers
a lazy load with no greenlet — the same failure by another route.

### The active-workout fence (S32 Fix 3, migration `0012`)

One row per user is not enough on its own: writes still applied in **arrival**
order, so a save delayed behind a newer save — or behind the clear that ends
the workout — won simply by landing last, and the finished workout came back.

`active_workout.client_seq` (BIGINT, default 0) is a per-user Lamport counter,
and the fenced branch applies a write only `WHERE active_workout.client_seq <
EXCLUDED.client_seq`. PostgreSQL locks the conflicting row and re-evaluates
that predicate after waiting, so a stale save cannot win a race: strictly lower
is suppressed, equal yields one winner and one 409.

**Clearing is a soft clear** — the row is retained with `workout_data = NULL`,
which is why that column is now nullable. A sequence written on a row that
`DELETE` removes fences nothing: a save still in flight just re-inserts. The
retained row also means a clear arriving *before* any save creates the fence,
closing the absent-row case. `GET /active` therefore returns
`{workout_data: null, client_seq}` for a cleared slot rather than JSON null —
only a user who has never saved gets null. That contract change was free
because `getActiveWorkout` had no caller, which is itself the gap 3b closes.

**A suppressed write returns 409 carrying the server's current sequence**, so
the client rebases — reissues the still-current desired state above that bound
— instead of discarding the user's edit. Reading the bound after suppression is
safe precisely because the clear is soft: the fence row is retained, so a
concurrent write can only move the bound higher.

**An unversioned request takes a separate legacy statement** with no fenced
`WHERE`, behaving exactly as before and never seeing a 409 — clients deployed
before this cannot be updated in the same deploy, and rejecting them would drop
the user's in-progress workout. Those writes still advance the high-water mark,
so a sequenced client rebases above them rather than being stranded. *Transition
limitation:* unversioned requests remain arrival-ordered until those clients are
gone.

One accepted edge, **in `POST ""`** — which still reads the row back, unlike
`PUT /active` above: if an account is hard-deleted between the insert and that
read-back, the cascade removes the row and the read-back raises, returning 500.
The data outcome is correct — account and row are both gone — and every other
authenticated route races account deletion the same way.

> This section describes the branch `traycer/fitness-tracker-zesty-walrus`, not
> `main`. Open items and review state live in `SESSION_START.md`.

**Client side (S32 Fix 1b).** `deleteWorkout` (`WorkoutContext.jsx`) records a
deletion, **enqueues** `workout_delete`, writes a **tombstone**, and only then
removes the row — and it removes it *after* a successful enqueue, not before.
There is **no lookup**: the earlier `resolveWorkoutBackendId` is gone, along
with the unsafe inference that a successful-but-empty lookup proved the workout
was never uploaded.

Four rules earn their place here, each from a defect that reached review:

1. **Identity is adopted only on a positive match, with no content fallback.**
   `matchFor` tries `backendId`, then `client_id`, then a local id that is
   itself a server id — and then gives up. A name and start time are not
   evidence of identity even when unique in the result: the row held locally
   may have been deleted elsewhere while a *different* workout happens to share
   them, and adopting that row's `client_id` makes the next delete remove the
   wrong workout. An unidentified row simply stays unidentified until a pull
   returns its real row.

2. **Async completions are owner-scoped.** `dropOwned` captures the profile id
   at call time, always prunes that profile's *stored* history, and touches
   React state only while that profile is still current. An unscoped
   `setHistory` in the request's `.then` removed whichever profile happened to
   be on screen and left the real row on disk. Same rule as
   `dropLocallyAsDeleted`.
3. **No identifier is manufactured at deletion time.** `chooseDeletionTarget`
   resolves `client_id`, then `backendId`, and otherwise returns `localOnly` —
   the row is removed locally and *nothing is claimed about the server*. There
   is no third source of identity, and both attempts to invent one were
   destructive:

   - **Minting a `client_id`** named nothing the server had seen, so the
     placeholder deletion succeeded while the real row stayed live — and the
     guard was then retired on that false confirmation, letting an ordinary
     pull resurrect the workout.
   - **Treating a UUID-shaped local id as the server id** was false at the
     root. `generateId` already returned `crypto.randomUUID()` *before* commit
     `8b88b49`, which is the commit that first wrote `client_id` and
     `backendId` at all. So a workout finished before then has a local id `L`
     unrelated to its server row's id `S`. `DELETE /L` answers 404, the client
     treats 404 as success, the guard retires, and `S` returns on the next
     pull.

   Content matching cannot stand in for either, on the client *or* on the
   server: counting rows that look alike establishes how many candidates
   exist, never that a candidate **is** this row.

   **The two properties, stated precisely** — an earlier draft of this section
   overstated both:

   - *Backend.* Every new row created through `POST /api/workouts` has a
     non-NULL `client_id`; if the request omits one, the backend uses the newly
     inserted server id. This prevents newly inserted NULL identities. It does
     **not** establish a correspondence with an existing local legacy id.
   - *Client.* A local row with neither `client_id` nor `backendId` is removed
     only locally and makes no cloud-deletion claim; it may have an
     uncorrelated legacy cloud copy. A *cancellable* legacy queued create is
     cancelled before local removal. A *successfully acknowledged* one is
     correlated from its own queue op and response (`planStampedIdentityAdoption`
     — see 5 below). A create whose request flush had **already captured** when
     Delete was pressed remains an explicit unresolved legacy limitation, and
     that applies to **both** outcomes — the response being lost, *and* the
     response arriving normally. In the second case the local row is already
     gone, so adoption correctly fail-closes rather than resurrecting what the
     user deleted; nothing then holds a deletion intent for the stamped id, and
     the next pull brings the workout back.

     An earlier revision of this section claimed only the lost-response
     interval was open. That was false; review caught it. The case is pinned by
     the `LIMITATION:` test in `workoutDeletion.provider.test.jsx` so it cannot
     be quietly relabelled as fixed — if that test ever fails, the limitation
     has been closed and this text is what needs rewriting.

   The production census covered **server rows where `client_id IS NULL`** and
   found zero. It inventoried neither local queue payloads nor their
   correspondence to server rows, so it cannot be cited for more than that.

   Closing the last interval is not a matter of another guard: a response
   cannot retroactively repair a lost one. It would need a stable key carried
   in the request *before the first send*, plus a migration for already-queued
   payloads — a different change, deliberately not made here.

4. **The backfill uploads only what carries a stable identifier.** See
   `backfillDisposition`. A `backendId` means the server has seen the row, so it
   is skipped. A `client_id` makes re-upload **idempotent** — that, not "this
   device created it", is the property being relied on, since a pulled row
   carries another device's `client_id`; if the server holds a deletion for that
   id the upload collides with it and comes back marked deleted. *Neither*
   identifier is ambiguous: the old mapper stored pulled rows without a
   `backendId`, so such a row may be one another device has deleted. Ambiguous
   rows are kept locally, never uploaded, and reconciled if a later pull
   identifies them. No identifier is minted during backfill at all.

   Absence from a pull proves nothing on its own — a moving-`OFFSET` page walk
   can skip a still-live row — so no branch here infers deletion from it.

5. **A legacy queued upload adopts the identity the server stamped.** The
   `workout` executor used to discard the response, and the consequence was not
   a race but a permanent one: the local row stayed identifierless, `matchFor`
   could not join it to the server row because the ids differ, the new-item
   fingerprint filter hid that row while the local one existed, and so **every
   later delete reported success while the cloud row survived**.

   The correlation is positive, not inferred — the queue operation *is* the
   link between `op.payload.id` and that request's response. This is the same
   write-back `assessment` and `template` already did; `workout` was the
   exception. Every guard is fail-closed (legacy ops only, `op.key` must still
   match the payload, `saved.client_id === String(saved.id)` to prove the stamp
   path, exactly one unidentified local match, storage before React,
   owner-scoped). "Exactly one" matters: `SyncQueue`'s dedupe is not uid-aware
   and imported storage can duplicate an id.

   React is updated through a **functional** update that re-plans against
   current state, not by assigning the storage snapshot. The snapshot was read
   before the request resolved, so assigning it would drop anything added in
   between — replacing the whole visible list with stale data.

   Honest bound: this is **recovery for a completed response, not a crash fix**.
   If the app dies after the write-back but before the queue entry clears, the
   replay creates a second server row, and the guard then correctly refuses to
   overwrite the identity already adopted — leaving a live duplicate. It also
   does nothing for a row deleted while its create was already in flight; see
   the limitation under 3.

The ordering is load-bearing. The queue entry is the durable intent; the
tombstone is only a local display guard. Writing the guard first meant a crash
in between left a tombstone with no intent behind it, and reconciliation retires
a tombstone the moment the queue holds nothing for it — so the delete was
silently forgotten and an in-flight create could commit with nothing left to
undo it.

- **Which endpoint** — `chooseDeletionTarget` (module scope, returns exactly one
  of `clientId` / `backendId`, or `localOnly`). A row with a `client_id` is
  deleted by client id; a row already known to the server but predating client
  ids is deleted by its **server id**; a row with neither is local-only.
- **`mapServerWorkout` stamps `backendId`** on every pulled row, and that is
  what makes the branch above work. **Local ids are UUIDs too**, so without it
  a pulled legacy row is indistinguishable from a never-uploaded local one —
  review caught exactly that twice, and the second time it was the shape of the
  fix itself. The id alone carries no provenance; only `backendId` does.
- `crypto.randomUUID()` at `startWorkout` means every normally-created workout
  already has an identifier; `ensureWorkoutClientId` only stamps legacy and
  restored rows, and the login backfill stamps and **persists** before queueing.
  Note the limit: this governs what *this* client sends from now on. The
  `workout` executor still transmits already-stored queue payloads as they were
  written.
- **`wasDeletedOnServer`** guards the backfill, which uploads whatever is
  local-and-absent. A row carrying a `backendId` is **not re-uploaded**, because
  for a legacy row (`client_id` NULL) that upload is unrecognisable to the
  server and lands as a brand-new workout no future deletion can catch.
  **It is a skip and nothing more.** A first version also deleted the local copy
  and wrote a tombstone, which was a destructive bug caught in review:
  `getHistory` pages with a moving `OFFSET` over the *live* rows, so a
  concurrent delete on another device shifts the window and a still-live row can
  be omitted even though every request succeeded. The fabricated tombstone was
  then read back as user intent, and reconciliation deleted that live workout on
  the server. **Absence across a non-atomic page walk proves nothing** — the
  same mistake this whole redesign exists to remove, reintroduced one layer
  down. Skipping is safe under that uncertainty; deleting is not.
- Tombstones live in the profile-scoped `fitness_deleted_workouts`, keyed on
  **both** ids, and gate the pull merge (a pull that started before the delete
  can land after it) and the backfill.
- `planTombstoneReconciliation` (module scope, pure) decides each tombstone's
  fate against a pull: still on the server → **reissue**; absent and nothing
  outstanding in the queue → **retire**; absent but an op is still in flight →
  **hold**. Server ids and client ids are indexed in **separate** maps, because
  `client_id` is client-generated and can be any string — including one equal to
  a different row's server UUID.
- `deletionOpFor` builds the reissue op from **only** what the server reports.
  Falling back to the tombstone's `clientId` was wrong: when the server row's
  `client_id` is NULL, that id is one we minted, it names no row, and reissuing
  it repeats an ineffective delete for ever.
- The `workout_delete` executor **throws** on a payload with no identifier
  rather than resolving. A resolved executor is treated as success and the op is
  dropped, so falling through silently would discard a deletion without ever
  contacting the server.
- Nothing is ever evicted from the tombstone store; it warns past 200. Evicting
  the oldest would silently let that workout return, which is the bug the store
  exists to prevent. A permanently-offline profile therefore grows it
  unbounded — accepted, and cheap next to a resurrection.
- `ApiService.deleteWorkout` treats 404 as success: already gone is the state
  we wanted, and a retry after a lost response must not loop.

**Known gaps, stated rather than guessed away.**

- **Overlapping pulls — FIXED.** `pullGenerationRef` orders pulls for the same
  profile: `refreshProfileData` takes a generation on entry, and results are
  discarded if a newer pull has since started. `latestProfileIdRef` could not do
  this — it says which profile is current, so two overlapping pulls for one
  profile both pass it and the slower one overwrites the newer result. The
  failure that motivated it: P1 stalls holding a live row, the delete succeeds,
  P2 returns empty and retires the guard, then P1 lands and puts the workout
  back into state and storage. The server stayed correct; the UI did not.
- **Already-transmitted legacy creates.** A create that has *already left* a
  pre-redesign client carrying no `client_id` cannot be made identifiable after
  the fact, so no recorded deletion can catch it. `deleteWorkout` cancels such a
  create while it is still cancellable (`SyncQueue.remove`); once `flush` has
  captured it, nothing local can help.
Earlier revisions of this section claimed the already-transmitted legacy create
was the only resurrection path left. That has been wrong at every revision so
far, so this list is written as *what is currently handled*, not as a closure
claim. Each item below has a provider-level regression test; open items are in
`SESSION_START.md`.

- **The pull merge now enriches rows it already holds.** It filters known rows
  by fingerprint *before* mapping, so a row cached by the old mapper kept
  `backendId: undefined` for ever, and the backfill read it as never-uploaded.
  Matched existing rows now adopt the server's `id` and `client_id`, not just
  newly-seen ones.
- **A minted identifier is persisted to stored history before the intent is
  queued.** `chooseDeletionTarget` mints one for a row that has neither, and the
  deletion is recorded against it. Left only in the queue entry, a crash before
  the row's removal was persisted meant the surviving history row did not carry
  it — and the backfill minted a *different* one, whose upload could not collide
  with the deletion.
- **`SyncQueue.enqueue` now returns whether the op reached storage.** It
  swallowed `localStorage` failures, so on a full quota `deleteWorkout` removed
  the row and reported success with nothing recorded anywhere. The optimistic
  removal is now conditional: if the write failed the row stays visible, and the
  deletion completes only when the request itself succeeds — a known outcome
  rather than an assumed one.

Deletion behaviour is exercised through the real provider in
`src/context/workoutDeletion.provider.test.jsx`. How that harness works, and why
helper-level tests were not enough here, is in
`docs/skills/provider-level-testing.md`.

/api/assessments (routers/assessments.py)   GET "", POST ""
/api/weight      (routers/weight.py)         GET "", POST "" (201)
/api/templates   (routers/templates.py)      GET "", POST "" (201), DELETE /{id} (204)
/api/exercises   (routers/exercises.py)      GET "", POST "" (201)

/api/coach     (routers/coach.py)
  POST /chat                     → SSE streaming AI Coach chat; optional 1-6
                                    transient images on the current user turn
                                    (model claude-sonnet-4-6, prompt-cached
                                    system blocks, long-term compact context,
                                    optional validated workout-plan event,
                                    rate-limited)
  POST /equipment/analyze        → joint 1-6 photo Claude Vision equipment detection;
                                    canonical terms + confidence, images discarded
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

**Database:** PostgreSQL on Railway (18.6; the local test database matches).
Migrations via Alembic (11 revisions in
`alembic/versions/`), with revision IDs constrained to under 32 characters
(the `alembic_version` column is VARCHAR(32)). Migration 0008
(`avatar_color_default`, S21) changed and backfilled the `users.color` default
from retired lime to Design Tokens v2 ember. Migration 0009
(`add_date_of_birth`, S21) adds nullable `user_stats.date_of_birth`; NULL keeps
the legacy manual age fallback. Migration 0010 (`equipment_env_cloud`, S25)
adds nullable `users.equipment_environments` JSONB; NULL is the one-time local
backfill marker and stored arrays become authoritative. See
`docs/avatar_color_spec_s21.md`, `docs/dob_age_spec_s21.md`, and
`docs/ai_coach_visual_equipment_spec_s25.md`.

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
Model:        claude-sonnet-4-6 (COACH_MODEL in routers/coach.py, max_tokens 1600)
Personas:     apex (default) / hype / zen — persona prompt is system block 1,
              static app-knowledge prompt is block 0, both prompt-cached;
              per-request user context is block 2, uncached. It contains
              profile stats/preferences, the last 10 workouts in detail,
              active session, recent assessments, custom template/exercise
              summaries, compact 28/90/365-day + all-time training/nutrition/
              weight trends, and bounded frontend app context (exercise
              library, equipment, local assessments/stats, templates and
              nutrition targets). Long-term aggregates are computed server-
              side; raw historical meal rows are never placed in the prompt.
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
Actions:      Anthropic propose_workout tool output is server-validated against
              compatible exercise ids and emitted as SSE `workout_plan`.
              CoachView renders a review card; only explicit Start workout or
              Save template clicks call existing WorkoutContext mutations.
Equipment:    POST /api/coach/equipment/analyze accepts 1-6 downscaled images,
              returns a combined canonical inventory + confidence/notes, and
              never stores images. POST /chat accepts the same transient image
              blocks so the conversational Coach can inspect them directly.
              The user edits and confirms before activation; named environments
              then sync through users.equipment_environments JSONB.
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

## 12. PWA UPDATE DELIVERY (S26)

**Model: prompt, not silent.** `vite.config.js` sets `registerType: 'prompt'`
(was `autoUpdate`). Under autoUpdate, users silently received each deploy one
app-open late — with multiple users including an external beta tester, nobody
could tell which build they were on or when it changed. Prompt mode makes the
update a visible, user-controlled action.

**Registration wiring — exactly one registrar.**
`UpdateBanner.jsx` (src/components/common/) imports
`virtual:pwa-register/react` and registers the service worker itself via
`useRegisterSW`. Because of that, `injectRegister: null` is set in
`vite.config.js` — with the default injection AND the virtual-module import,
the SW would be registered twice. If UpdateBanner is ever removed, the
injectRegister setting must be revisited or updates stop being delivered.

**Update detection.** `useRegisterSW`'s `onRegistered` starts a 15-minute
`registration.update()` interval (cleared on unmount, StrictMode-guarded), so
a new deploy can surface the banner while the app stays open — no cold start
required. When the new worker reaches `waiting`, `needRefresh` flips and the
banner renders: "New version available" + Reload. Reload calls
`updateServiceWorker(true)` — skipWaiting + page reload. Dismissal is
session-state only, never persisted; a stale build prompts again next load.

**Workout suppression.** The banner does not render while
`activeWorkout.status` is `'active'` **or** `'paused'`. A mid-set reload
prompt is unacceptable, and a version change mid-workout risks the in-flight
localStorage shape. Paused counts as in-progress because a paused workout is
resumable from the Dashboard ("Resume Paused Workout"), where no pause
overlay hides the banner. The banner appears once the workout is finished or
cancelled (needRefresh state survives).

**Version string.** `__APP_VERSION__` is a Vite `define` (JSON-stringified)
sourced from `RAILWAY_GIT_COMMIT_SHA` (set by Railway at build time), first 7
chars, falling back to `'dev'` for local builds. Rendered in Settings'
`.version-info` block ("Version <sha7>"), so any tester can report exactly
which build they are on.

## 13. SESSION LIFETIME & SYNC RECOVERY (S26/S27)

Background: docs/session_expiry_spec_s26.md. The JWT lives 7 days
(`ACCESS_TOKEN_EXPIRE_MINUTES`, backend/app/auth.py) inside a 30-day
HttpOnly `session_token` cookie; there is no refresh endpoint.

**Sliding session (cookie transport only).** `GET /api/auth/me`
(backend/app/routers/auth.py) re-issues the cookie when BOTH hold: the
request authenticated via the cookie (no `Authorization: Bearer` header —
the transport test mirrors `get_current_user`, header wins), AND the
token's remaining lifetime is below 50% of `ACCESS_TOKEN_EXPIRE_MINUTES`.
The fresh token is minted by `create_access_token` and set via
`_set_session_cookie` — the single definition of the cookie attributes,
shared with the OAuth callback so they cannot drift. `get_token_expiry`
(backend/app/auth.py) verifies signature+expiry with the same parameters as
authentication, so an invalid or expired token can never be extended — /me
has already 401'd before the sliding branch runs. Effect: opening the app
before the halfway mark renews the session; idle users still expire on the
configured window. Bearer transport (email/password, token in localStorage)
is deliberately not renewed — it would require frontend token-replacement
work that has not been done.

**SyncQueue dead-letter.** A queued op rejected with a non-auth 4xx
(not 401/429) is no longer discarded: it moves to
`localStorage['fitness_sync_deadletter']` with the failing error and an ISO
timestamp, capped at 20 entries (oldest dropped). Dead-lettered ops are
never replayed automatically; they exist so a rejected finished workout
remains recoverable by hand. 401 (halt + `authExpired`), 5xx/429/network
(retry) behavior is unchanged (src/services/SyncQueue.js).

**Expiry toast.** SyncStatusBadge's expired state copy is
"Signed out. Workouts saved — log in to sync." and it is suppressed while
`activeWorkout.status` is `'active'` or `'paused'` — the same rule as the
Section 12 update banner, for the same Fire Station reason (a paused
workout parks on the Dashboard where the badge renders). While suppressed,
the neutral "N not synced" pill still shows. Tap-to-flush behavior is
unchanged.

## 14. PROGRESSION APPLY PATH (S27)

Spec + decisions: docs/smart_progression_spec_s27.md; staging:
docs/PROGRESSION_ROADMAP.md.

**Recommendation shape.** finishWorkout's detection now stamps each
recommendation with `templateId` (the finished workout's `sourceTemplateId`)
and the positional `exerciseIndex`, captured while the workout still exists —
applying runs post-finish, when `activeWorkout` is null. Old recommendations
without `templateId` render without an Apply button. History/backend storage
is JSONB; no migration.

**Single template-write path.** `writeTemplate(templateId, transformFn)` in
WorkoutContext is THE way a template gets modified: it resolves the template
(custom-only; built-ins refused), applies a pure transform, persists
state → localStorage → cloud (PUT `/api/templates/{id}` when `backendId` is
known, create otherwise) with SyncQueue fallback (`'template_update'` /
`'template'` ops), and **returns `{ ok, error? }`** — callers must branch on
it. Local persistence is the success criterion; cloud is best-effort, like
every push in the app. The queued in-place template save (Prompt B) must be
built as another transform over this function — never a second write path.

**applyRecommendation(rec).** Thin transform over writeTemplate: re-verifies
`exerciseIndex` against the catalog `exerciseId` (indices can shift if the
workout skipped a missing exercise), then writes `weight` on EVERY set of
that exercise (decision 1). Template sets carry no `setType` yet, so all
template sets count as working sets until decision 4 ships. The old
`applyProgression` (dead on three independent conditions — see spec §A) is
deleted. WorkoutSummary branches on the returned result: token-styled
success/failure banner, no native `alert()`, and "Saved" only on real
success (decisions 8/9).

**Hold and deload (S28, spec piece C).** Detection in `finishWorkout` is no
longer hit-only. Recommendations now carry `type: 'increase' | 'hold' |
'deload'` (entries predating the field render as increases — backward
compatible). A missed target (same judged sets as the hit predicate: real
rep target + real weight, warm-ups excluded, per-mode) emits a `hold`
(`newWeight === oldWeight`) — display-only, no Apply (decision 5). Two
CONSECUTIVE missed sessions on the same exercise emit a `deload` (~10%,
rounded to the 2.5 kg / 5 lb plate grain; equipment-aware grains are piece
E) — applyable like an increase. Consecutiveness is DERIVED at detection
time from history (newest-first scan for the previous completed entry
carrying the catalog exercise id — this workout is not yet in history), no
new stored state. Bodyweight (isBodyweight / Calisthenics / Yoga /
equipment None) and duration exercises (no set with a rep target) are gated
out of ALL weight recommendations (decision 7). `getSuggestedLoad` — the
third parallel suggestion engine, zero consumers — is deleted (decision 6).
WorkoutSummary renders type tags, per-rec message for hold/deload, and
hides Apply for holds.

**Backend.** `PUT /api/templates/{id}` (`routers/templates.py`) — same auth
dependency and ownership 404 as DELETE, same response schema as POST;
payload reuses `TemplateCreate`. No schema/migration change.

**Prep-screen save (S28).** Spec: docs/template_save_update_spec_s28.md.
`saveTemplateFromPrep(name)` (WorkoutContext) is the queued Prompt B,
built exactly as anticipated above: the NAME decides update vs fork.
Own custom template + unchanged name → `writeTemplate` transform replacing
`exercises` with `templateExercisesFromWorkout(activeWorkout)` (the per-set
snapshot extracted from `saveWorkoutAsTemplate`; both now share it) —
id/backendId preserved. Any other case → create via `saveCustomTemplate`;
an unchanged built-in name is refused (`{ok:false}`), so built-ins are never
written and never silently forked. On every successful create the session's
`activeWorkout.sourceTemplateId` is re-pointed at the new template so
syncToTemplate live edits and recommendations target the copy, not the
original. TrackWorkout's Save button now shows for EVERY prep workout (the
old `!sourceTemplateId` gate was a design error, removed S28); START
auto-saves through the same function (own custom → in-place, ad-hoc →
create once, built-in → never). "Saved" is dirty-state, not a one-shot
flag (S28 follow-up): TrackWorkout serializes
`templateExercisesFromWorkout(activeWorkout)` (helper exported for exactly
this) and compares against the snapshot captured at the last successful
save — clean state disables Save and suppresses START's auto-save (no
duplicate write); any prep edit re-enables both, and repeated saves of an
own custom template always hit the in-place branch, never a duplicate.
`saveWorkoutAsTemplate` is behavior-frozen and now has no in-repo caller
(kept as context API).

**Remove an exercise from a template (S32).** Spec:
docs/template_exercise_removal_spec_s32.md. There is no template editor; the
prep screen is the edit surface. `ExerciseResult` (prep mode) renders a
remove-exercise control in its header and asks the page via
`onRequestRemoveExercise(instanceId, name)`; `TrackWorkout` owns the
confirmation `Modal` and the collection rule (`canRemoveExercise` = more than
one exercise) and calls `removeExerciseFromWorkout`, which is guarded twice:
the context accepts only `status === 'preparing'`, a known instance id and
never the last exercise, and `ActiveWorkoutService.removeExercise` preserves
the final exercise independently (same two-layer shape as `removeSet`).
Persistence is the existing prep-save contract: an own custom template is
updated in place by Save or by a dirty START; a built-in is never written —
Save prefills the first free `"<name> (my version)"` (`utils/templateNames.js`)
and forks. The Save dialog refuses a normalized name collision against any
custom template, including a case-only rename of the source; the exact
same-name save of an own custom is the in-place branch and is exempt. That
rule covers the prep Save dialog and built-in forks only — the no-source START
auto-save, the Coach save and assessment program import still create directly.

**Built-in prep boundary.** `syncToTemplate` (the set-field write-through from
`updateSet`) returns without mutation when the resolved template is not
custom. Provider `templates` state is seeded from `DEFAULT_TEMPLATES` by
reference, so before S32 a prep weight edit on the rich-object built-in
mutated the module constant in memory for the page lifetime (never persisted).

**Prep set write-through resolves by identity, and fails closed.** The workout
row and its template entry are two separate arrays, aligned only because
`startWorkoutFromTemplate` builds one from the other in order. Removing an
exercise — or a set — in prep breaks that alignment, so `syncToTemplate` must
not trust the workout's position. `resolveSyncTargetIndex` picks the template
entry whose catalog id matches, and writes only when exactly one does; a
missing id, or the same exercise listed twice, refuses the write. The set level
has no ids to match on, so it refuses whenever the template entry's set count
differs from the workout row's. A refusal costs only the immediate
write-through: Save and START persist the whole prep payload through
`writeTemplate` and resolve no indices at all. Occurrence identity for repeated
exercises is deliberately not built — see `SESSION_START.md` item 7b.

**Reordering exercises in prep.** `reorderExerciseInWorkout` moves one exercise
within the session, guarded in both the context and `ActiveWorkoutService` like
every other active-workout mutation, refusing outside `preparing`, on an
unknown instance id, on an out-of-range index, and on a no-op — each returning
`prev` by identity. Exercise objects are carried by reference, so set identity
and completion survive a move. Nothing is persisted: `templateExercisesFromWorkout`
already derives template order from the workout array, so Save and START pick
the new order up with **no change to any write path**, and a built-in still
forks rather than being modified.

Two things make this safe that were not true before S34. Prep rows are keyed by
**instance id**, not by position — an index-based key made React rebuild the row
on every move, destroying the element holding pointer capture. And both template
resolvers now match by catalog id and fail closed on ambiguity;
`resolveTemplateExerciseIndex` previously tried the stored position first, so a
reordered template listing one exercise twice had the wrong copy updated by a
progression recommendation.

The drag is hand-rolled Pointer Events — one path for mouse, touch and pen, no
dependency. The grip carries `touch-action: none`, so a drag started there never
scrolls the page; that is what a dedicated handle buys, and why no hold delay is
needed. Drag arms after 6 px of movement, target index comes from **measured**
row midpoints (prep rows vary in height with set count), and pointer maths live
in a ref so a re-render mid-drag cannot discard them. Arrow Up/Down on the
focused grip moves the exercise without a pointer at all.

**The workout ends when nothing is outstanding, and then it does not rest.**
`toggleSetComplete` returns whether that action finished the workout, and
suppresses the rest timer when it did — resting after the last set is a wait
for nothing. "Finished" is *no incomplete set anywhere*, never "the last set of
the last exercise": sets are ticked in any order, and positional reasoning has
produced three separate defects in this file. The answer is a **synchronous
hypothetical** computed before `updateSet` — that update is asynchronous, so a
read after it still shows the pre-toggle value — treating only the one
validated set as complete. Warm-ups count; they are exempt from the PR check,
not from completion.

`GuidedWorkoutView` consumes that boolean at all three completion call sites
through one shared handler, and opens the Finish dialog that `goToNext` already
opens at the end of a workout — the change brings that dialog forward, it does
not add one. When a rest was live it is cleared, and a **suppression latch**
blocks the auto-advance: clearing `wasRestingRef` alone is insufficient because
the rest effect re-writes it on every run, so an effect queued from an earlier
tick can re-arm it and the cleared-rest transition then advances the view under
the dialog. The latch arms only when a rest is actually live, disarms only once
the cleared transition is observed, and never outlives its workout.

**Template backendId adoption.** `adoptTemplateBackendId(uid, localId,
backendId)` is the shared acknowledgement path for direct and queued template
creates: it writes the originating profile's custom storage, then updates
provider state only while `latestProfileIdRef.current === uid`. All three
create acknowledgements use it — `saveCustomTemplate`, `writeTemplate`'s
create branch, and the SyncQueue `'template'` executor. Before S32 the id
reached storage only, so an in-place save later in the same page session read
a provider object with no `backendId`, overwrote the stored row without it and
POSTed a second cloud row. Direct creates are also tracked by profile and local
id in `pendingTemplateCreatesRef` while in flight: any `writeTemplate` calls
that find no `backendId` but a pending create coalesce into one PUT of the
latest payload behind it (falling back to a `template_update` op carrying the
id) instead of racing multiple updates or issuing a second POST; if the create
itself fails, its queue entry carries the latest STORED payload. Not covered,
by decision: a create that already failed into the queue followed by an
in-place save (today's direct POST), and a create whose response was lost after
the server committed — template create is not idempotent server-side. That is
the separate "template create idempotency" backlog item (stable client id +
unique constraint + upsert, the S32 workouts pattern).

---

*Compiled from: WorkoutContext.jsx, StorageService.js, ActiveWorkoutService.js, ApiService.js, SyncQueue.js, App.jsx, full `src/` inventory, backend source + live openapi.json, docs/DESIGN_TOKENS.md, and session notes through S25.3. Full catch-up audit pass completed S17; S24/S25/S25.1/S25.2/S25.3 architecture changes were then added with their implementation commits; S26 added Section 12 (PWA update delivery); S27 added Section 13 (session lifetime & sync recovery); S32 added template exercise removal, catalog-id-resolved prep set sync, and direct pending-create serialization. Last updated: S32, 2026-09-14.*
