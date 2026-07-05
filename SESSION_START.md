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
  - Backend /api/auth/me is COOKIE-ONLY by construction (ignores Bearer)
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

## Session 13 Final State
Session 13 final code SHA on main: fe31b12 (plus the docs commit that
updated this file).

Session 13 commits, in order:
1. 650f6ca - docs: retire Codex review references (inline self-review is
   the sole review standard; "Cleared, proceed with commit" gates)
2. 4258794 - docs: add fire-station-pause and set-type-differentiation
   specs (both P0 specs approved and committed before implementation)
3. c70a32f - feat(workout): pause/resume for Fire Station use case —
   pauseAllTimers/resumeTimers freeze countdowns in place, totalPausedMs
   accounting, activeDurationMs on completed workouts, token-compliant
   paused overlay + always-visible header pause button. ALSO fixed a
   pre-existing P1: active-workout persist effect wiped storage on
   reload under StrictMode replay — now hydration-gated (same pattern
   as 8b30633 used for history).
4. 9a31cdf - feat(workout): set-type differentiation — setType field
   (normal/warmup/amrap/dropset, undefined = normal so zero migration),
   tap-to-cycle chip on set rows, warmup excluded from volume at ALL
   FOUR computation sites (calculateVolume, WorkoutSummary, Analytics,
   WorkoutDetails) and from progression checks. Legacy history verified.
5. 84c15f3 - style(dashboard): data values to --text-primary + tnum,
   glassmorphism retired via .dashboard-scoped Card override,
   grep-zero hardcoded colors.
6. fe31b12 - style(screens): token pass on Exercise Library, TrackWorkout,
   GuidedWorkoutView — neon lime/cyan legacy palettes tokenized,
   accent-on-data fixed, exercise cards de-glassed.

Both P0 features (Fire Station pause, set-type differentiation) SHIPPED.
Dashboard P1 visual pass SHIPPED. Codex review retired from all docs.

## Session 14 Open Items (priority order)
P2 - Per-screen light-mode QA — light theme is at token-level parity
     (graphite-inverse mapping) but not audited screen-by-screen.
P2 - Card.css glassmorphism retirement (shared component) — Dashboard now
     overrides it locally; the shared Card.css glass (blur + shine +
     hover-lift) still applies on History and any other Card consumers.
     Retire centrally once remaining consumers are audited.
P3 - Backend /api/auth/me dual-transport (backend-auth tier) — Option 2
     from the email-gate fix; not urgent (Option 1 self-heal shipped).
P3 - StrictMode-replay hole in remaining guard-only persist effects
     (weight/theme/units/sound/stats — activeWorkout fixed in c70a32f) —
     dev-only symptom, prod-safe single mount; use the hydration-gate
     pattern if sweeping. Dead-code pass.
P3 - PR detection still counts warmup-tagged sets (noted in S13 review);
     decide whether warmups should be PR-eligible.

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
