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

## Open Issues (Priority Order)
P0 - client_id dedup: backend migration adds client_id to workout_history,
     frontend sends client_id on saveWorkout, StorageService writes backend
     UUID back locally. Eliminates workout duplication on re-login.
P1 - Shared tree cleanup: C:\dev\fitness-tracker on feat/backend with dirty
     WIP — stash with label, checkout main, rebase at session start.
P2 - Weight push: wiring POST /api/weight with recorded_at preserved.
P3 - Two throwaway prod users (smoke+ts@example.com x2) in DB.

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
