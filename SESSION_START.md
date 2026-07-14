FITNESS TRACKER — SESSION START BRIEF
Paste this into Claude Chat at the start of every session.

Before any work: read docs/ARCHITECTURE.md (how the app is built),
docs/DESIGN_TOKENS.md (the locked visual system), and MASTER_CONTEXT.md
(how sessions operate).

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
- Auth: dual-transport — get_current_user accepts Bearer header
  (email/password, JWT in localStorage) OR session_token cookie
  (Google OAuth). Both carry the same JWT. Cloud users identified by
  currentProfile.email presence (canSyncToBackend gate).
  - /api/auth/me is dual-transport since S14 (810c940) — uses the shared
    get_current_user dependency like every other route
- WorkoutContext.jsx: central state, HIGHEST RISK — one terminal at a time
- StorageService.js: localStorage layer (quota-safe writes)
- ApiService.js: all backend calls via apiFetch() with credentials:include
  + conditional Bearer header. HTTP errors carry err.status.
- SyncQueue.js: retry queue for failed cloud pushes (401 -> re-login banner)
- bcrypt==4.0.1 pinned — never upgrade

## Visual System (LOCKED)
docs/DESIGN_TOKENS.md is the source of truth. "Ember on Graphite":
graphite neutrals (#0d0d0f canvas, no blue cast), ember #ff5c2a accent
(interactive/selection ONLY, never data values), success green / PR gold
/ rest blue / danger semantics each with one reserved purpose. Fonts
self-hosted in public/fonts (Inter body, Archivo SemiExpanded display) —
never add a font CDN import. The S11 neon-green/purple system is RETIRED.

## Session 13 Final State (reference)
S13 closed at 17d3a42 (final code SHA 040edd4 + docs). Shipped: Fire
Station pause, set-type differentiation, dashboard + screens token
passes, glassmorphism fully retired, WorkoutContext hydration-gate
sweep (10 persist effects), warmup-PR guard, Codex review retired.
Full commit list: git log 650f6ca..17d3a42.

## Session 14 Final State
Session 14 commits, in order:
1. b5c5658 - fix(storage): coach_* keys (enabled/personality/voice_id/
   voice_input/autoplay) included in JSON backup export/import —
   they are bare (non-fitness_-prefixed) keys and were silently
   excluded from every backup. Import clears them before restore
   (full replace); old backups without coach keys still import.
2. 85e568c - style(history): accent-on-data fixes — History date-badge
   day numeral, WorkoutDetails workout-title and rec-value → 
   --text-primary. exercise-number badge kept accent (wayfinding, not
   data) but repointed from orphaned --primary-color to --primary —
   it was rendering with NO background at all.
3. 5b39d71 - chore: ProfileSelector dead-code pass — only a stale
   comment removed. isEditing is a live feature; glass-panel is still
   a real utility class (index.css converted it to filled-card in S13,
   the class was kept). Component itself remains unimported (see open
   items).
4. 52d944d - fix(context): TimerContext hydration-gate sweep — both
   mount-ref persist effects (timer defaults incl. backend sync,
   exercise prefs) converted to a TimerContext-local timerHydratedFor
   gate set in the profile-load effect. Verified live: seeded
   non-default values survive StrictMode dev reload. Backend-sync
   restore-run suppression preserved via timersSyncedProfileRef.
5. 810c940 - refactor(auth): /api/auth/me uses the shared
   get_current_user dependency (HIGH zone, coordinator-cleared) —
   hand-rolled cookie-only JWT block and _user_id_from_session
   removed; /me now accepts Bearer OR cookie like every other route.
   Response shape unchanged; OAuth cookie flow traced end-to-end.
   401 detail unifies to "Could not validate credentials" (no
   frontend consumer reads the detail text).
6. (this commit) docs: SESSION_START.md to Session 14 state.

FOUND ALREADY COMPLETE during S14 prep: "Settings sync to backend"
(theme/units/sound/timers/coach prefs) is fully built — hydration-gated
persist effects in WorkoutContext/TimerContext push via canSyncToBackend()
+ ApiService.saveProfile() with SyncQueue fallback. The former P1 open
item is CLOSED without code; only the coach_* backup/export gap remained
(fixed this session, commit 1).

## Session 15 Open Items (priority order)
P2 - Per-screen light-mode QA — light theme is at token-level parity
     (graphite-inverse mapping) but not audited screen-by-screen.
P2 - Orphaned --primary-color in ExerciseSelector.css (T2 S14 finding):
     7 uses (lines 125, 127, 163, 165, 212, 221, 276) reference a
     variable defined NOWHERE — selected-state backgrounds/borders/text
     in the exercise selector silently resolve to nothing today. Swap
     to --primary (+ visual verify). Note: --primary-rgb and
     --primary-light are NOT orphaned (defined in index.css:39/:56);
     --primary-light has one decorative use (History empty-icon), fine.
P3 - ProfileSelector.jsx is entirely unimported (no route renders it) —
     deleting page + CSS is a product decision: it is the only UI for
     local multi-profile create/manage. Coordinator call.
P3 - Historical warmup sets still seed the PR baseline (S13 c40750a
     note) — product decision pending.
P3 - Browser-pane screenshot capture timed out repeatedly in the S14
     terminal session (page responsive, infra issue) — T2 was verified
     via computed-style probes instead of before/after PNGs. If it
     recurs, screenshot deliverables need the chrome-devtools MCP path.

## VISUAL_REVIEW_RULE (standing)
Before/after screenshots are MANDATORY deliverables for every design
task, mobile-first, uploaded directly to the coordinator for review
before commit clearance. A described change is not a reviewed change.
Every color/spacing/type choice must trace to a token in
docs/DESIGN_TOKENS.md — grep-zero hardcoded hex is the bar.

## Terminal Workflow (Mission Control / Direct-to-Main)
Every terminal prompt must start with:
  git fetch origin && git rebase origin/main
Every terminal prompt must end with:
  git push origin main
  Report SHA + files changed
Inline self-review required before every commit (re-read full diff,
check for data loss, null cases, logic errors, dead imports; rate
findings P1/P2/P3). Literal "Cleared, proceed with commit" from
coordinator gates each commit.
WorkoutContext.jsx = one terminal at a time only.
Never git add -A — always explicit pathspec.
docs/ARCHITECTURE.md updated in the same commit as any architectural
change — standing rule, not optional.

## Session Start Protocol
1. Confirm terminals on latest main HEAD (git log --oneline -3)
2. Railway dashboard — both services green, ACTIVE card = current SHA
3. Live app loads at frontend URL
4. Claude Chat: list_connected_browsers → select laptop → navigate to
   /openapi.json to read current schema
5. Work through open issues in priority order
