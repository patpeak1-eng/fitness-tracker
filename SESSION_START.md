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

## Session 19 Final State
S19 = nutrition implementation sessions 1 and 2 of 3 (per
docs/nutrition_spec_s18.md; UI placement Option C decided).
Session 1 (backend):
1.  0ab35cd - feat(nutrition): migration 0007 (food_log +
    off_product_cache), FoodLog/OffProductCache models, nutrition router
    (7 routes: log CRUD, /analyze Claude Vision — fully implemented, not
    stubbed; /barcode cache-first OFF lookup; /summary), rate-limit
    constants, coach NUTRITION context block + trend-deflection boundary.
    All 6 acceptance criteria verified live; throwaway accounts deleted
    via the S18 deletion feature.
Session 2 (frontend core), all live-verified on a disposable account
(deleted through the Settings danger zone at session end):
2.  fb6b274 - feat(nutrition): foodLog state in WorkoutContext
    (hydration-gated on settingsHydratedFor, client_id offline-first,
    client_id pull-merge with backendId ADOPTION, 3 SyncQueue executor
    types incl. resolve-by-client_id for offline-created rows), 7
    ApiService methods, StorageService foodLog key. ARCHITECTURE.md §4.7
    updated same commit. HIGH zone, coordinator-cleared. StrictMode
    reload, offline-add→reconnect-push, and re-login dedup all proven.
3.  ecc58b0 - feat(nutrition): EMA utility (src/utils/ema.js, alpha 0.25,
    gap-tolerant carry-forward) + 6 vitest tests incl. hand-computed
    fixture week.
4.  43a9204 - feat(nutrition): manual + barcode entry paths
    (src/components/nutrition/: FoodLogFlow single-save-funnel, shared
    EntryForm, BarcodeEntry with feature-detected BarcodeDetector live
    scan + ALWAYS-present manual code fallback), /nutrition route +
    page shell. Barcode verified live (real OFF product, exact values,
    source=barcode).
5.  66a03ce - feat(nutrition): photo/label AI path (PhotoEntry: downscale
    →/analyze→MANDATORY editable review with Estimated badge +
    confidence; failure falls back to manual form). ONE flow for meals
    AND labels (backend classifies). Verified live: label OCR exact
    (source=label, high conf), meal estimate (source=photo, low conf),
    analyze-without-save persists nothing, user edit wins over AI value.
6.  51d5785 - feat(nutrition): dashboard + history (today totals/macros,
    optional manual targets via StorageService nutritionTargets key,
    dual-series 7-day EMA chart calories+weight with muted raw points,
    day-grouped history 7/30/90d, confirm-guarded delete + edit modal).
    Offline render verified (dead-API boot).
7.  80dbc37 - feat(nutrition): nav placement Option C — More overflow
    item + Dashboard quick-log card (today kcal + "+" deep-links into
    the open log modal via location.state).
8.  b328324 - feat(login): local-only data-loss disclaimer under
    "Continue without account" (decided prior session — now SHIPPED, do
    not re-queue).
9.  (this commit) docs: SESSION_START.md to Session 19 state.

## Session 20+ Open Items (priority order)
P2 - NUTRITION SESSION 3 of 3 (final): photo/label AI review polish,
     barcode scanner hardening (live BarcodeDetector camera loop is
     UNTESTED on a real mobile device — this session's browser lacked
     the API, so only the manual-code fallback is field-proven), edit
     flow polish, and a real-phone verification pass (camera capture,
     real meal photo, real label). Also: mobile-viewport + light-theme
     screenshot pass for all new nutrition screens (deferred this
     session; VISUAL_REVIEW_RULE debt).
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
