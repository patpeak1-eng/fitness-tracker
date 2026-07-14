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

## Session 14 Final State (reference)
S14 closed at 4971674 (final code SHA 810c940 + docs). Shipped: coach_*
keys in backup export/import, History/WorkoutDetails accent-on-data
fixes, ProfileSelector dead-code pass, TimerContext hydration gates,
/api/auth/me dual-transport (coordinator-cleared HIGH). "Settings sync
to backend" found ALREADY COMPLETE during prep. Full commit list:
git log 17d3a42..4971674.

## Session 15 Final State
Session 15 commits, in order:
1. 01749aa - feat(dashboard): "End Workout" cancel action on the
   active-workout banner card — --danger ghost button + confirmation
   modal (same copy/pattern as GuidedWorkoutView), stopPropagation so
   the card's navigate('/track') doesn't fire, modal rendered outside
   the clickable Card (common/Modal doesn't portal). Verified for
   preparing AND active statuses; canceled workouts don't enter
   history. This closes the "stuck test workout" report — the gap was
   reachability of cancelWorkout(), which itself was fine.
2. 62ea8a4 - fix(guided-view): REAL DESKTOP BUG found by T2's 1440px
   screenshot — the >1024px side-by-side split overflowed the 600px
   .main-content shell (Layout.css) and overflow:hidden clipped the
   sets table (REPS column, checkboxes) and the End Session button
   entirely. Stacked layout is now the base at every width; dead
   split rules + media query removed. 375px was already correct.
3. 4e1ed26 - fix(style): 7 orphaned --primary-color refs in
   ExerciseSelector.css → --primary. Grep-zero --primary-color across
   src/ now. Filter chips/buttons render ember where they previously
   resolved to nothing.
4. f583f04 - fix(theme): "Create New Exercise" button had a hardcoded
   S11 neon-green rgba background (surfaced by the T3 fix making its
   ember border/text visible) → --primary-dim / primary-rgb tokens.
   Found during the T5 light-mode spot check.
5. (this commit) docs: SESSION_START.md to Session 15 state.

EQUIPMENT-FILTER COMPLAINT: RESOLVED as a reachability issue, not a
missing feature. "Home Gym" renders in picker Zone 1 at 1440px and
375px, is selectable (aria-pressed), and live-filters templates
(6 -> 2 workouts verified). The person could never reach the picker
because a stuck activeWorkout replaced it — fixed by commit 1. No new
filter UI needed. Screenshots: docs/design-review/s15-*.png (kept
untracked, same convention as s13/s14 sets).

PROFILESELECTOR FINDINGS (T4, product decision PENDING — coordinator):
- Genuinely dead: zero static/lazy/dynamic imports; App.jsx enumerates
  every route and none references it. Only its own .jsx/.css files
  (and this doc) mention it.
- Current local-profile flow WITHOUT it: a first-time visitor gets ONE
  auto-created local profile ("Main User", user_default) via
  StorageService.getOrCreateProfiles(); after explicit logout, the
  /login gate offers "Continue without account" (Login.jsx
  handleContinueWithout), which re-creates that same single default
  profile. So local usage works, but multi-local-profile create/
  manage/switch UI does not exist anywhere reachable — ProfileSelector
  was the only UI for it. Decision needed: delete the page+CSS, or
  re-route it (e.g. from Profile page).

## Session 16 Open Items (priority order)
P2 - Per-screen light-mode QA (full audit) — token-level parity but
     not audited screen-by-screen. S15 spot-checked only the files it
     touched (Dashboard banner/modal, picker, ExerciseSelector): all
     readable. NEW finding for the audit: common/Modal renders on a
     dark surface even in light theme (readable, but visually
     inconsistent) — affects every modal app-wide.
P3 - ProfileSelector product decision (see T4 findings above).
P3 - Historical warmup sets still seed the PR baseline (S13 c40750a
     note) — product decision pending.
P3 - .filter-chip.active is defined in BOTH TrackWorkout.css and
     ExerciseSelector.css (different looks, cascade-order dependent
     winner) — harmless now (both token-compliant) but worth
     deduplicating.
P3 - Browser-pane screenshot capture still broken in the S15 terminal
     session (second session in a row) — all S15 visual verification
     went through the Playwright MCP instead, which works well and
     saves PNGs directly to docs/design-review/.

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
