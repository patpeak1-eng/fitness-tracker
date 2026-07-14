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

## Session 15 Final State (reference)
S15 closed at f8a09fe. Shipped: Dashboard End-Workout cancel action
(01749aa, closed the "stuck test workout" report), guided-view desktop
clipping fix — stacked layout at all widths (62ea8a4), orphaned
--primary-color repointed in ExerciseSelector (4e1ed26), neon-green
Create-New-Exercise bg tokenized (f583f04). Equipment-filter/Home-Gym
complaint RESOLVED as reachability, not a missing feature.
ProfileSelector confirmed fully unreachable (product decision pending).
Full commit list: git log 4971674..f8a09fe.
CORRECTION (S16): S15 claimed design-review screenshots are "untracked
per convention" — that was WRONG. S13's screenshots ARE tracked;
screenshots are COMMITTED deliverables. The s15-*.png set was lost as a
result; S16's set is committed.

## Session 16 Final State
Session 16 commits, in order:
1. d4cb6ab - refactor(dashboard): duplicate Start Training nav cards
   removed (Strength/HIIT/Data duplicated bottom-nav Workout/Progress
   tabs). Also removed 4 icon imports that were ALREADY dead pre-task
   (Play/Calendar/Timer/TrendingUp) + the section's Dashboard-only CSS.
2. 945aaec - fix(track): equipment row VERIFIED scrolling correctly at
   1440px (528px strip of 752px content, all cards reachable) — the
   "cut off" report was a discoverability gap, not clipping: scrollbar
   hidden, no affordance. Added alpha-only mask-image right-edge fade
   (36px) + matching padding so the last card sits clear at max scroll.
   First mask pattern in the codebase. Screenshots COMMITTED:
   docs/design-review/s16-equipment-row-{1440,375}.png.
3. 2059bc8 - docs(spec): experience-level coach calibration spec.
4. eb0ed96 - docs(spec): migration deploy-safety made explicit
   (down_revision = 0005's revision ID "add_coach_prefs" not filename;
   server_default is TRUE DB-level default — existing rows backfilled,
   never NULL).
5. 26a1048 - feat(coach): experience-level setting calibrates coach
   response depth (HIGH zone, both gates cleared). users.experience_level
   (migration 0006) + ProfileUpdate/UserResponse fields + EXPERIENCE
   CALIBRATION block in COACH_SYSTEM_PROMPT + _build_user_context reads
   it (single call site confirmed; /chat/stream alias delegates) +
   frontend: StorageService key, WorkoutContext hydration-gated persist
   + login-pull, Settings 3-way control, Assessment auto-populates from
   its experience answer. Deploy VERIFIED: Railway pre-deploy log shows
   "Running upgrade add_coach_prefs -> add_experience_lvl" on
   PostgresqlImpl, both services ACTIVE on 26a1048. Live A/B transcripts
   captured via disposable accounts: beginner vs advanced visibly
   different in depth/terminology; never-set account defaults to
   intermediate, no errors.
6. (this commit) docs: SESSION_START.md to Session 16 state.

EXERCISE-BROWSING OVERLAP (T3, product decision PENDING — coordinator):
Three browsing UIs: Exercises.jsx (/exercises page: search + category
tabs + instruction accordions; NO equipment/muscle filters),
TrackWorkout picker (filters TEMPLATES not exercises), and
ExerciseSelector.jsx (Build-My-Own modal: search + category + equipment
+ muscle filters, multi-select, custom-exercise form; NO instructions).
Latent inconsistencies: category vocabularies differ ("Weight Lifting"
vs "Weights"), and the selector offers a "Functional" category that
exists in NO data — a chip that always returns zero results. Verdict:
full component merge NOT worth it (page vs modal, read-only vs
mutating); realistic share = extract filter predicates to one util
(fixes vocabulary drift + dead chip as a side effect). Open product
question: should /exercises gain equipment/muscle filters for parity?

COACH TEST ACCOUNTS: two disposable accounts remain on the live backend
(s16-coach-test-*@example.com) — no user-delete endpoint exists.
Harmless; flag for cleanup if a delete endpoint ever ships.

## Session 17 Open Items (priority order)
P2 - Per-screen light-mode QA (full audit) — token-level parity but
     not audited screen-by-screen. S15 spot-check finding for the
     audit: common/Modal renders on a dark surface even in light theme
     (readable, but visually inconsistent) — affects every modal.
P3 - ProfileSelector product decision (see S15 findings) — delete the
     unreachable page+CSS, or re-route it.
P3 - Exercise-browsing overlap product decision (see T3 findings
     above) — shared filter-predicate util + whether /exercises gains
     equipment/muscle filters. Quick win regardless: remove the dead
     "Functional" category chip.
P3 - Historical warmup sets still seed the PR baseline (S13 c40750a
     note) — product decision pending.
P3 - .filter-chip.active is defined in BOTH TrackWorkout.css and
     ExerciseSelector.css (different looks, cascade-order dependent
     winner) — harmless now (both token-compliant) but worth
     deduplicating.
P3 - Browser-pane screenshot capture broken 3 sessions running — the
     Playwright MCP path is the working standard (saves PNGs directly
     to docs/design-review/; commit them).

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
