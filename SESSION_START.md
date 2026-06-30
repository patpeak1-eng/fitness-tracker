FITNESS TRACKER — SESSION START BRIEF
Paste this into Claude Chat at the start of every session.

## Tools Available to Claude Chat
- Chrome extension connected (Claude in Chrome) — use for reading GitHub
  raw files, Railway dashboard, and backend /openapi.json before writing
  any API code
- Google Drive connected
- Browser: call list_connected_browsers, then select laptop browser
- To read backend schema: navigate to
  https://astonishing-laughter-production-de7d.up.railway.app/openapi.json

## Live URLs
Frontend:  https://fitness-tracker-production-54a4.up.railway.app
Backend:   https://astonishing-laughter-production-de7d.up.railway.app
GitHub:    https://github.com/patpeak1-eng/fitness-tracker
Railway:   peak-ops-q (877335d0-ecc2-4460-9800-291ffcb3f660)

## Architecture
- Frontend: React 18 + Vite, served by Express server.js
- Backend: FastAPI + PostgreSQL on Railway (/backend root dir)
- Auth: Google OAuth, HttpOnly cookie (SameSite=None; Secure)
  - /api/auth/me called on mount with credentials:include
  - Cloud users identified by currentProfile.email presence
  - get_current_user accepts Bearer header OR session_token cookie
- WorkoutContext.jsx: central state, HIGHEST RISK — one terminal at a time
- StorageService.js: localStorage layer
- ApiService.js: all backend calls via apiFetch() with credentials:include
  + conditional Bearer header
- bcrypt==4.0.1 pinned — never upgrade

## Session 10 Final State
Session 10 final SHA on main: 96f7d7b
Completed in S10:
- Dead code cleanup — chore 39a4e3f (40 deletions across 3 files)
- ExerciseIllustration component — feat 714c195 (wired to 3 surfaces:
  exercise library, pre-set detail, rest timer)
- All 73 exercise illustrations recompressed as JPEG quality=85
  (~78KB avg, public/illustrations/) — 96f7d7b

## Session 11 Priorities
P1 - SESSION_START.md update (this document) — reflect S10 final state
     and the S11 plan.
P2 - UI design research sprint: second pass on visual design language
     (colors, typography, layout, card design, spacing). Use the same
     multi-platform research method as the S9 feature research; synthesize
     into a design brief BEFORE any terminal work.
P3 - Settings sync to backend — FRONTEND WIRING ONLY, no new migration.
     /api/preferences does NOT exist. Preference fields already live on
     PUT /api/profile: theme, units, sound_enabled, default_rest_time,
     default_work_time, coach_personality, coach_voice_id (confirmed in
     backend/app/models.py + ProfileUpdate schema). Wire the WorkoutContext
     persist useEffects to PUT /api/profile on change.
P4 - Profile switch active workout race condition (low priority) — useRef
     guard scoped to profile-change transitions.

## Terminal Workflow (Mission Control / Direct-to-Main)
Every terminal prompt must start with:
  git fetch origin && git rebase origin/main
Every terminal prompt must end with:
  git push origin main
  Report SHA + files changed
Codex review required before every commit.
WorkoutContext.jsx = one terminal at a time only.
Never git add -A — always explicit pathspec.

## Session Start Protocol
1. Confirm terminals on latest main HEAD (git log --oneline -3)
2. Railway dashboard — both services green
3. Live app loads at frontend URL
4. Claude Chat: list_connected_browsers → select laptop → navigate to
   /openapi.json to read current schema
5. Work through open issues in priority order
