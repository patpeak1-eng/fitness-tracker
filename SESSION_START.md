FITNESS TRACKER — SESSION START BRIEF
Paste this into Claude Chat at the start of every session.

Before any work: read docs/ARCHITECTURE.md (how the app is built),
docs/DESIGN_TOKENS.md (the locked visual system), MASTER_CONTEXT.md
(generic cross-project rules, shared with Mission Control — lives in the
peak-ops-standards repo:
https://raw.githubusercontent.com/patpeak1-eng/peak-ops-standards/main/MASTER_CONTEXT.md),
and docs/PROJECT_OPERATING_MODEL.md (this project's specific operating
history and process). Both context docs are required reads — they don't
overlap: MASTER_CONTEXT.md is the generic ruleset, PROJECT_OPERATING_MODEL.md
is Fitness-Tracker-specific.

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

## Session 17 Final State (reference)
S17 closed at bdb020c (12-task backlog-clearing session). Shipped:
ARCHITECTURE.md full S12-S16 catch-up (now authoritative), nutrition
research synthesis committed, exercise filter parity + shared
exerciseFilters util, ProfileSelector re-routed at /profiles, full
light-mode audit + Modal dark-surface root-cause fix, account-deletion
+ OAuth-hardening specs (both spec-only). Full commit list:
git log 5af7bbf..bdb020c.

## Session 18 Final State (reference)
S18 closed at 5acdab7. Shipped: account deletion end-to-end (5c3e52c —
DELETE /api/auth/account, Settings danger zone, verified live with
disposable accounts), OAuth PKCE hardening (5acdab7, live-verified),
health & nutrition SPEC_FIRST document (8c54b9d,
docs/nutrition_spec_s18.md), PROJECT_OPERATING_MODEL.md (a05b032) +
MASTER_CONTEXT reference fix and completion-report template sync
(c9d8b78). Note: S18 recorded its open items below but never added this
Final State section — added retroactively in S19. Full commit list:
git log bdb020c..5acdab7.

## Session 19 Final State (reference)
S19 = nutrition implementation sessions 1 & 2 of 3 (per
docs/nutrition_spec_s18.md; UI placement Option C). Session 1 backend
(0ab35cd): migration 0007 (food_log + off_product_cache), 7-route
nutrition router incl. Claude Vision /analyze (fully implemented) + OFF
cache-first /barcode + /summary, coach NUTRITION context block +
trend-deflection boundary. Session 2 frontend core: foodLog WorkoutContext
state (hydration-gated, client_id offline-first, backendId-adopting
pull-merge, SyncQueue executors — HIGH, cleared), EMA util + tests,
manual/barcode/photo/label entry paths, dashboard + history with dual EMA
chart, Option C nav, login data-loss disclaimer. All live-verified on
disposable accounts. Closed at 603c885. Full commit list:
git log 5acdab7..603c885.

## Session 20 Final State
S20 = nutrition implementation session 3 of 3 (final polish + hardening +
real-image verification). All live-verified on a disposable account
(deleted through the Settings danger zone at session end):
1.  8395125 - fix(nutrition): barcode scanner hardening. Close-read of the
    camera path found and fixed 3 LATENT defects (the whole scan branch
    had never executed anywhere — S19's browser lacked BarcodeDetector):
    (a) requestAnimationFrame stream-attach raced React's commit → could
    leave a live camera with a dead viewport; replaced with a
    deterministic effect keyed on `scanning`. (b) closing the modal while
    the camera-permission prompt was pending leaked the stream (tracks
    never stopped); now stopped on resolve-after-unmount via a mounted
    ref. (c) double-tap opened two streams; now guarded. Emulated
    end-to-end via Playwright with stubbed getUserMedia + BarcodeDetector
    (correct constraints, format list, auto-stop on detect, unmount
    cleanup, feature-detect both directions). NOT a real-device test —
    see P1 below.
2.  7046d87 - feat(nutrition): review + edit flow polish. Photo thumbnail
    in the review step, read-only detected-items breakdown under the
    Estimated banner (also in edit), and window.confirm delete replaced
    with a token-compliant --danger modal (cancel-safe). Edit preserves
    source/confidence; live create→edit→delete round-trip verified.
3.  (no commit — verification) real-photo /analyze pass. Real Wikimedia
    images (fish-and-chips plate 4048×3036 also exercising the client
    downscale; agave-nectar label photo) through the live UI: meal →
    source=photo, medium confidence, 5-item breakdown, plausible macros;
    label → source=label, high confidence, exact per-serving values read
    off the package. Analyze-without-save persisted zero rows (local +
    backend). Improvement over S19's synthetic-image test.
4.  9038c9f - docs(design-review): 10 committed screenshots
    (docs/design-review/s20-*.png) — nutrition dashboard, manual/barcode-
    fallback/photo-review/edit/delete modals, Home quick-log at mobile
    375px, plus dashboard/manual/delete in LIGHT theme (flipped through
    the real Settings path). VISUAL_REVIEW_RULE debt from S19 cleared.
5.  (this commit) docs: SESSION_START.md to Session 20 state.

NUTRITION STATUS: functionally complete across all 3 implementation
sessions (backend, frontend core, polish/hardening). Not yet "fully
closed" — three items need Patrick's hands-on involvement (P1 below);
none block any other work.

## Session 21+ Open Items (priority order)
P1 - Real-device barcode camera test (blocks full Nutrition closure
     only). On a phone, live app → Log food → Barcode → Scan, point at a
     real packaged product. Everything up to the physical camera+detector
     is proven (component logic, cleanup, feature-detect, OFF lookup);
     the real Chrome-on-Android detector reading a real barcode through
     this UI is the one link no automated environment can exercise —
     same category as the OAuth consent screen that needed manual
     completion. Manual code-entry fallback is field-proven as the safety
     net if the live scan misbehaves.
P1 - Real phone-camera photo through the Photo path (optional but
     recommended). S20's test used a real photograph but from a FILE, not
     a live phone-camera capture. Confirm capture="environment" opens the
     camera and the captured image analyzes correctly.
P1 - Coach nutrition-commentary spot-check once real meals are logged.
     Confirm the trend-deflection boundary (chart-only; coach gives a
     one-line observation and points to the dashboard, never recites
     logged data) feels right in real use.
P2 - Stale neon-green avatar color (#bfff00, the pre-redesign theme).
     Two-layer bug, and existing rows hold the literal stale value (not
     just a fallback gap — confirmed on Patrick's own account): migration
     0001's users.color server_default is still '#bfff00', AND
     routers/auth.py's /me handler falls back to the same literal in two
     places. Fix needs a DB default change + a one-time backfill UPDATE
     for existing rows + the auth.py fallbacks corrected to match. HIGH
     zone (users table). Spec not yet written.
P2 - Date-of-birth field for auto-updating age. UserStats.age is a plain
     String today (manually typed, never auto-updates). Add date_of_birth
     (nullable Date) to UserStats via a new migration; when set, displayed
     age is COMPUTED from DOB (takes priority over the manual string);
     users without a DOB keep today's manual-entry behavior unchanged.
     HIGH zone (user_stats table) + a real UI decision (calendar picker
     on tap, per the original request). Spec not yet written.
P3 - Coach context format nit: NUTRITION line's entries=N reads as
     "days" to the model (S19 backend test saw "two logged days" for 2
     entries/1 day) — consider entries=/days= split in coach.py next
     time it's open.
P3 - Cloud pull food_log window is 90 days: entries older than 90d
     logged on ANOTHER device won't pull to this one (local entries
     unaffected). Fine for v1; revisit if multi-device long-history
     matters.
P3 - Cloud login/register silently orphans local profiles (found S18,
     coordinator-confirmed): Login.jsx activateProfileAndGo AND the OAuth
     boot path both call saveProfiles([cloudProfile]) — unconditionally
     REPLACING the profiles list, wiping any local profiles created via
     the S17 /profiles re-route (their scoped data blobs survive in
     localStorage but nothing lists them). Investigate merging with the
     existing profiles list instead of replacing. Do NOT fix ad hoc —
     touches login flow + profile identity, needs its own scoped task.
P3 - Two S16 disposable coach-test accounts remain on the live backend
     permanently (credentials lost; coordinator-accepted tech debt).
P3 - Historical warmup sets still seed the PR baseline (S13 c40750a
     note) — product decision pending.
P3 - Dedupe equipment-compat predicate: WorkoutContext's internal
     isExerciseCompatible vs exerciseFilters.matchesEquipmentProfile
     (identical logic) — fold into the next WorkoutContext HIGH-zone
     session, not worth its own.
P3 - Browser-pane screenshot capture broken 4+ sessions running — the
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
