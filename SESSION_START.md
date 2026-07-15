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

## Session 16 Final State (reference)
S16 closed at 5af7bbf (final code SHA 26a1048 + docs). Shipped: dashboard
duplicate-nav-cards removal, equipment-row scroll affordance,
experience-level coach calibration end to end (migration 0006, HIGH zone,
deploy + live A/B verified). Full commit list: git log f8a09fe..5af7bbf.

## Session 17 Final State
S17 was the backlog-clearing session (12-task mega-prompt). Commits:
1.  bf1454c - docs(architecture): FULL CATCH-UP S12-S16. ARCHITECTURE.md
    is now GENUINELY CURRENT and authoritative again: routing (4.1) and
    component tree (4.6) verified against source, PROVISIONAL flags
    cleared, settings-sync/SyncQueue (4.7) + equipment profiles (4.8) +
    hydration-gate pattern documented, set-type "not built" error
    corrected (shipped S13), Tokens v2 replaces stale S11 palette in §9,
    tech-debt table re-audited row by row. Future sessions can trust it.
2.  ab4c18c - docs: nutrition research synthesis now lives in the repo
    (docs/nutrition_research_synthesis.md — S9/S12 findings, locked
    product decisions). It is NOT build-ready: a real SPEC_FIRST document
    (data model/migrations/screens/API) is still required before any
    nutrition code is written.
3.  53982c1 - fix(exercise-selector): dead "Functional" category chip
    removed (was never a category; legacy muscle value only).
4.  80167b1 - fix(style): .filter-chip consolidated into shared
    src/styles/filter-chips.css (the two definitions were DIFFERENT
    designs colliding at equal specificity on /track; Tokens-v2 version
    won). NO LONGER an open item.
5.  1a0f06a (+992c42c docs) - feat(exercises): filter parity SHIPPED.
    src/utils/exerciseFilters.js = shared predicates + canonical
    vocabulary ("Weights", drift fixed); Exercises.jsx gained
    equipment-profile + muscle filters (local-only state, page stays
    read-only); ExerciseSelector refactored onto the util, Build-My-Own
    verified end to end. NO LONGER an open item. Note:
    matchesEquipmentProfile MIRRORS WorkoutContext's isExerciseCompatible
    (not imported there — HIGH-zone file left untouched); dedupe
    opportunity for a future WorkoutContext session.
6.  ab57264 - feat(profiles): ProfileSelector RE-ROUTED (product decision
    executed) at /profiles, entry: Settings > Account > "Manage local
    profiles". Create/switch/delete verified live incl. storage isolation
    and scoped-key cleanup. NO LONGER an open item.
7.  1445924 - fix(theme): full light-mode audit, all screens
    screenshotted at 375px and COMMITTED (docs/design-review/
    s17-*-light.png, 14 files). Modal dark-surface ROOT-CAUSED (hardcoded
    rgba(20,20,20,.95) + black footer -> theme tokens, fixed app-wide);
    also fixed: rgba(0,0,0,0.3) wrong-theme input/surface backgrounds in
    ExerciseResult/CoachView/Assessment/History/Timer CSS, invisible
    light-theme chip borders, and ProfileSelector's fully hardcoded dark
    page (surfaced by the re-route).
8.  15af21e - Task 8 finding: profile-switch active-workout race is
    ALREADY RESOLVED by the S13 hydration-gate pattern (gate compares
    hydratedFor id vs currentProfile.id; refreshProfileData flips it
    same-batch). No code change; ARCHITECTURE.md row closed. The old
    proposed useRef fix would have been wrong (StrictMode hole).
9.  15b6088 - Task 9 finding: npm audit is CLEAN (0 vulnerabilities,
    workbox-build 7.4.1 via vite-plugin-pwa 1.3.0) — the debt item was
    stale, resolved upstream by interim upgrades. No dependency changes.
10. e62fccf - docs(spec): ACCOUNT DELETION spec (SPEC ONLY, HIGH zone) —
    AWAITING coordinator clearance for a future implementation session.
    Key finding: all 8 user-FK tables already have DB-level ON DELETE
    CASCADE (migrations 0001/0003) — no migration needed; deletion is a
    single-transaction user delete. Design: DELETE /api/auth/account,
    password re-entry (local) / typed DELETE (OAuth), Settings danger
    zone. Also the path to finally remove the two S16 test accounts.
11. 372e028 - docs(spec): OAUTH HARDENING spec (SPEC ONLY, HIGH zone) —
    AWAITING coordinator clearance. Audit finding: state IS implemented
    and validated (S8 claim confirmed; tech-debt entry was stale); nonce
    is currently N/A (id_token never consumed); PKCE is the one real gap
    (~25-line stdlib-only diff, no redirect-URI/console changes).
12. (this commit) docs: SESSION_START.md to Session 17 state.

## Session 18+ Open Items (priority order)
P2 - Account-deletion spec (docs/account_deletion_spec_s17.md) awaiting
     "Cleared, proceed with implementation" — own session, HIGH zone.
P2 - OAuth PKCE spec (docs/oauth_hardening_spec_s17.md) awaiting
     clearance — own session, HIGH zone, live-verify with throwaway
     Google account.
P3 - Nutrition build: write the real SPEC_FIRST document (see
     docs/nutrition_research_synthesis.md §6) before ANY code — HIGH
     zone (new tables). Re-run 2026 pricing comparison first.
P3 - Cloud login/register silently orphans local profiles (found S18,
     coordinator-confirmed): Login.jsx activateProfileAndGo AND the OAuth
     boot path both call saveProfiles([cloudProfile]) — unconditionally
     REPLACING the profiles list, wiping any local profiles created via
     the S17 /profiles re-route (their scoped data blobs survive in
     localStorage but nothing lists them). Investigate merging with the
     existing profiles list instead of replacing. Do NOT fix ad hoc —
     touches login flow + profile identity, needs its own scoped task.
P3 - Historical warmup sets still seed the PR baseline (S13 c40750a
     note) — product decision pending.
P3 - Dedupe equipment-compat predicate: WorkoutContext's internal
     isExerciseCompatible vs exerciseFilters.matchesEquipmentProfile
     (identical logic) — fold into the next WorkoutContext HIGH-zone
     session, not worth its own.
P3 - Browser-pane screenshot capture broken 4 sessions running — the
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
