FITNESS TRACKER — SESSION START BRIEF
Paste this into Claude Chat at the start of every session.

Before any work: read docs/ARCHITECTURE.md (how the app is built)
and MASTER_CONTEXT.md (how sessions operate).

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

## Session 11 Final State
Session 11 final SHA on main: this docs close-out commit
  (last code change: 81a1be3; run `git log --oneline -1` for the exact SHA)
Completed in S11:
- Design sprint D1-D5 (a860ac1 -> c0525f1): tabular-nums, dark surface
  hierarchy, border-radius scale, set-logging table typography
- Equipment filter in template builder exercise picker (3d83881)
- Persistent filters + multi-select in template builder (81a1be3)
- Auth gate tightened to email presence — canSyncToBackend (705df32)
- TimerContext settings-sync catch downgraded to console.warn (17027a5)
- Settings Sync verified already complete (all 7 fields wired to
  PUT /api/profile) — no change needed
- Full 3-track research sprint for Fable 5 (visual redesign spec,
  nutrition technical architecture, feature audit) synthesized into
  docs/FABLE5_SESSION12_BRIEF.md

## Session 12 Priorities
P1 - Fable 5 execution — read docs/FABLE5_SESSION12_BRIEF.md in full
     before any work.
P2 - Audit pass (Brief Section 4) before any new feature work.
P3 - Full visual redesign — screen composition rebuild, NOT incremental
     CSS. Tokens (color/radius/typography) carry forward unchanged;
     layout is fully open for redesign against the top-app structural
     specs in the brief.
P4 - Feature build — Equipment Profile, Fire Station pause, set-type
     differentiation, nutrition tracking (see brief Section 3).
P5 - docs/ARCHITECTURE.md must be updated in the same commit as any
     architectural change — standing rule, not optional.

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
