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

## Session 12 Final State
Session 12 final SHA on main: 8f03019 (deployed, Railway ACTIVE, green)

Nine commits, in order (all deployed green):
1. ea80d7f - fix(ui): null guard, emoji removal, 44px touch targets,
   token colors (approved audit-fix pass)
2. 02b46f5 - docs(architecture): verify sections 4.5, 7, 8 against source
   (S12 audit — dual Bearer/cookie auth + full route inventory VERIFIED)
3. 5867b10 - docs(brief): close backlog items 1,4,6,9,10 as already built
   (Equipment Profiles, Duration filter, Plate calc, e1RM, Assessment CTA
   all shipped pre-S12)
4. 567484b - fix(storage): quota-safe writes, atomic timer persistence,
   template dedup adoption (reliability hardening)
5. fdb3321 - feat(sync): retry queue, sync-status badge, 401 re-login
   prompt, settings pull-down (SyncQueue system)
6. 7b81066 - feat(sync): exercise/template cloud sync, email-gate fix,
   trapped-data backfill (Critical #1/#2/#3 closed)
7. 8b30633 - fix(workout): hydration-gate history persistence against
   pre-restore wipes (StrictMode-replay defeat; ref guards insufficient)
8. bb883de - feat(analytics): rebuild screen per S12 visual spec (PR ring,
   segmented metric, time-range chips, recent-sessions list)
9. 8f03019 - feat(design): migrate to Ember-on-Graphite token system v2
   (self-hosted Inter+Archivo, ember palette, app-wide sweep,
   Analytics/Profile/Settings re-skinned)

Reliability workstream (data-loss audit): CLOSED. All 3 CRITICAL and
all 4 MODERATE findings fixed and verified live.
Visual workstream: Analytics/Profile/Settings rebuilt + entire app
migrated to Design Tokens v2.

## Session 13 Open Items (priority order)
P0 - Fire Station pause button (brief Section 3, item 2) — SPEC FIRST.
     Prominent pause/resume on active workout, tied to Fire Station
     equipment profile. HIGH zone (WorkoutContext) — coordinator sign-off.
P0 - Set-type differentiation (brief Section 3, item 3) — SPEC FIRST.
     warm-up/working/AMRAP/drop set field + UI toggle + volume-calc
     exclusion for warm-ups. HIGH zone. All sets currently identical.
P1 - Dashboard visual pass — the token migration re-skinned it centrally
     but Dashboard renders DATA VALUES in ember accent ("0 days" streak,
     "50%" goal), which the token spec reserves for interactive/active
     states only. Also still uses the shared Card.css glassmorphism.
     Needs its own screen pass to the v2 grammar.
P2 - Per-screen light-mode QA — light theme is at token-level parity
     (graphite-inverse mapping) but not audited screen-by-screen.
P2 - Card.css glassmorphism retirement — the shared Card component is
     pre-S11 glass (blur + shine + hover-lift); Analytics/Profile/Settings
     dropped it, but Dashboard/History/others still use it.
P3 - Backend /api/auth/me dual-transport (backend-auth tier) — Option 2
     from the email-gate fix; not urgent (Option 1 self-heal shipped).
P3 - StrictMode-replay hole in remaining guard-only persist effects
     (weight/activeWorkout/theme) — dev-only symptom, prod-safe single
     mount; use the hydration-gate pattern if sweeping. Dead-code pass.

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
Codex review required before every commit (literal "Codex cleared,
proceed with commit" from coordinator gates each commit).
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
