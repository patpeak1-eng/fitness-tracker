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

## Sessions 21–24 Final State

S21 shipped the stale-avatar default/backfill correction and date-of-birth
field with computed age (migrations 0008/0009), plus PWA icon cleanup and
live verification. S22 committed the visual-identity research. S23 added
native Share This App with clipboard/manual fallbacks.

S24 expands the AI Coach end to end (spec:
docs/ai_coach_expansion_spec_s24.md):

- durable Coach context now combines last-10 workout detail with compact
  28/90/365-day and all-time workout, nutrition, and weight summaries;
  profile/app settings, assessments, custom templates/exercises, nutrition
  targets, the exercise library, and confirmed equipment are included;
- full cross-device history hydration replaces the old 90-day food window
  and single 50-workout page; assessment routes now participate in cloud
  pull, device backfill, and SyncQueue retry;
- typed or spoken workout requests can emit a server-validated
  `workout_plan`; the app shows a review card and requires an explicit Start
  workout or Save template action before mutation;
- the Coach camera flow sends a downscaled equipment photo to a transient
  Claude Vision endpoint, requires editable review, saves only the confirmed
  named environment locally, and reuses the existing equipment compatibility
  filter; the image is never stored;
- docs/ARCHITECTURE.md was updated in the same implementation change.

S25 completes the visual equipment path (spec:
docs/ai_coach_visual_equipment_spec_s25.md):

- the Coach can receive and inspect up to six transient photos on the current
  conversation turn; only the text caption remains in Coach history;
- equipment analysis combines multiple angles into one editable inventory;
- the phone UI requests the outward camera first, provides a front/back flip,
  repeated captures, a native-camera fallback, and multi-photo library upload;
- named environments such as Station 12 sync through nullable
  `users.equipment_environments` JSONB while offline/local profiles retain the
  existing local-first behavior; raw photos are never stored;
- the still-photo workflow is the current product path; live video is deferred
  unless routine use demonstrates a need that photos cannot meet.

S25.1 photo-flow maintenance (spec:
docs/ai_coach_photo_flow_maintenance_s25_1.md):

- separates the two user-controlled photo paths in the Coach interface:
  identify and save equipment, or send photos to Coach for discussion;
- explains that successful Coach sends clear temporary photo attachments for
  privacy, preventing the detector's empty state from looking broken;
- updates the architecture freshness marker and removes two obsolete lint
  suppressions; no Coach API, account, or database behavior changes.

S25.2 Coach handoff polish (spec:
docs/ai_coach_handoff_polish_s25_2.md):

- a successful photo-bearing Coach request closes the equipment panel before
  the reply streams, so the chat remains visible and the camera stream is
  released; failed requests retain photos for retry;
- Coach-proposed workouts now open `/track` directly, avoiding the dashboard
  detour before the existing preparation screen;
- installed-PWA testing confirmed the multi-photo capture, visual Coach reply,
  and Coach workout proposal flows in normal phone use.

S25.3 preparation controls and visual contract (spec:
docs/preparation_controls_visual_contract_s25_3.md):

- Coach-proposed sets remain editable in Preparation: athletes can add or
  remove a set, while an exercise always keeps at least one set and guided
  sessions keep their set log stable;
- the shared instruction sheet uses canonical local `illustration` paths first,
  with `imageUrl` retained only as a legacy/custom fallback;
- 73 declared built-in illustrations match the 73 deployed local assets;
  Arnold Press's previous “No Visual Available” state was a field-name mismatch,
  not missing image files.

## Session 30 — 2026-09-10 (in progress)

**Shipped and live at `520d6f0`** (both Railway services SUCCESS, verified
by `scripts/poll_deploy.sh`; live-URL Playwright pass at desktop and 375px,
screenshots in `docs/design-review/s30-live-*.png`):
`3c08484` six illustrations, generated by the Codex reviewer from text plus
the existing house-style references only — no creator footage — and
independently approved by both agents. `6d6eaeb` six exercises + the
"Dumbbell Full Body" template (`docs/tiktok_exercises_spec_s30.md`,
revision 3). `520d6f0` dev-server verification screenshots.
Owner waived the Codex code-review gate for `6d6eaeb` (data-only; Codex at
usage limit) — recorded as an exception, not a precedent.

**Merged and deployed at `509ca8e` (both services SUCCESS; backend
`/openapi.json` 200). Reviewed twice — Claude reviewer APPROVE-WITH-NITS,
then Codex APPROVE-WITH-NITS on the owner's request; all six nits verified
against source and applied. Owner authorised the merge in his own words
(cannot read diffs; asked Codex to go through it for him):** the
Coach system prompt no longer hard-codes template names or an exercise
count and now points at the context keys it actually receives; its stale
navigation list and OAuth-only sync claim are corrected and the features it
never mentioned (Nutrition, equipment photo scan, History, Timer, Help,
personalities) are added (`backend/app/routers/coach.py`). AGENTS.md gains a
required `Coach knowledge:` completion-report line with a rule kernel under
SINGLE_ARCHITECTURE_DOC_RULE. Zone note: coach.py reads user-data tables and
writes coach_messages, so by file it is HIGH even though this diff is a
prose constant — the two-clearance gate applies.

**Process:** plan-stage cross-review caught a P1 in the first S30 spec —
a 30-second dumbbell hold modelled as 30 reps — and re-verification showed
the whole timed-with-load path is unsupported (spec §5). Pattern captured
in `docs/skills/plan-stage-cross-review.md`. Rules updated: cross-review
mandatory for MEDIUM+ (`29a6465`), never name a model (`6703e26`).
`/watch` (yt-dlp + ffmpeg) is on the user PATH permanently.

**Open items added this session (priority order):**
- **P1 — S29 identity (moved up from P3, owner decision 2026-09-10).**
  Email/password sign-in has no stable identity; the owner is sharing the
  app with fire-station co-workers who may not use Google. Resume from
  `docs/profile_identity_spec_s29_v2.md`; remaining §7 decisions and the
  clearance phrase are still required. Reviewer agent `a85ddc71…` holds
  both prior reviews.
- **P2 — Feedback feature.** Owner-approved: name it "Feedback" with three
  intents (something's broken / could be better / idea); place it in
  Settings beside the version line; first version is a Google Form
  pre-filled with build id and page. Owner creates the form; frontend link
  is a LOW-zone change once the URL exists.
- **P2 — Timed exercises with an external load** are unsupported end to
  end: preparation, guided pill, completion, summary, analytics, PR engine,
  progression, and the Coach catalogue (which omits `isDurationBased`) all
  assume reps. Eight surfaces, HIGH zone. Needed before any loaded hold or
  carry can be added. Detail in `docs/tiktok_exercises_spec_s30.md` §5.
- **P2 — Rep-range double progression.** Owner described the exact method:
  target 10 → range 8–10; all sets at the top → add weight; within range →
  hold; below → deload. Already listed as the next planned addition in
  `docs/PROGRESSION_ROADMAP.md`; engine today keys "double" mode to a
  single target (`WorkoutContext.jsx:1590`). MEDIUM, own spec.
- **P3 — Remove an exercise from an existing custom template.** No UI
  path exists: `TemplateSelector.jsx:47-55` offers only whole-template
  delete; add/remove lives only in `CreateTemplateModal.jsx:34`; the S28
  prep-screen sync writes sets, not structure. Cheapest fix: open the
  create modal in edit mode. MEDIUM, own spec.
- **P3 — GitNexus index stale** since `7771bee`; re-run
  `npx gitnexus analyze --skip-agents-md` at a quiet moment.

## Session 29 — PAUSED IN PROGRESS (2026-09-09, not a session close)

Work is mid-flight and will resume in a day or two. Nothing is closed.

**Shipped this session (all docs/process, no app code):**
`64e83f0` AGENTS.md + `.traycer/agent-selection-guide.md` — the rules were
invisible to Codex, which reads only AGENTS.md.
`a580f5f` CLAUDE.md de-duplicated to a thin `@AGENTS.md` import (7.5 KB →
2.7 KB); deploy verification rewritten around the Railway CLI after the
documented chrome-devtools path turned out not to be connected.
`0612cfd` `scripts/poll_deploy.sh` — deploy check as a guarded poll.
`dcf7ca6` first S29 spec. `06c6f47` same spec marked CHANGES-REQUIRED.
`29a6465` cross-review mandatory for MEDIUM+, top-tier reviewer required.
`6703e26` never name a model; always pick the most capable available.

**STATE AT THE START OF 2026-09-11 (overnight work done; owner to resume):**
- **S29 at C0, designs A/B/C all at revision 2** after an overnight cold
  cross-review returned CHANGES-REQUIRED on all three (twelve findings,
  each verified, each adopted). The decisive one: every Google user's data
  already lives under the server-UUID scope, so "allocate a fresh scope
  named `<uuid>`" would have laundered ownership or emptied every user.
  Design A now allocates provably fresh ids and adds a **one-time explicit
  adoption prompt** at the first upgraded sign-in ("keep this device's
  data with this account?") — owner to confirm (below). Also fixed: the
  generation no longer gates durable queue ops (queue never drained);
  OAuth deliberate-login uses a server-validated single-use nonce (a
  cross-origin intent cookie is unreadable); stale Bearer cleared before a
  Google sign-in; mid-session principal change is always `conflict`; the
  write inventory now covers `saveProfile({stats})`, `deleteCustomTemplate`,
  coach chat, account deletion, and three extra flush triggers; legacy
  queue migration is compare-and-remove; restore quarantines bindings and
  strips `email` from restored list entries; staging keys moved out of
  the `fitness_` prefix. **Morning task for Codex:** adversarial pass on
  A/B/C revision 2 (thread `e2505ef6-…`, agent `6554b7a8-…`). Then the
  clearance phrase, then C1.
- **Feedback (S31) at revision 4** after two more cold reviews
  (CHANGES-REQUIRED, ten then nine findings). Blocking fact: **there is no
  PostgreSQL on the development machine** (no psql/pg_ctl/docker; no
  asyncpg/pytest-asyncio) — the only Postgres is production. Nothing in
  the backend verification plan can run until one exists (decision 6).
  `route` column dropped (it would always record `/`).
- **Owner decisions open (seven, all with recommendations in
  `docs/feedback_spec_s31.md` §7 and `docs/profile_identity_spec_s29_v2.md`
  status block):** admin gate; guests; deletion contract; inbox;
  test harness; **test database provisioning** (recommended: install
  PostgreSQL locally via winget); drop `route`; plus **S29's adoption
  prompt** and the S29-vs-S31 ordering.
- Quota: Codex exhausted twice on 2026-09-10; Claude once. Codex on
  review only.

**OPEN — P1, NEXT UP (owner, 2026-09-10: "resolve as soon as possible",
co-workers are being onboarded).** What was filed as a P3 "cloud login
orphans local profiles" is actually **three P1 defects**, and the original
framing was wrong. Full detail, verified evidence, the three-stage plan and
every owner decision (all answered 2026-09-10: one profile per person,
keep-and-fix password sign-in, no interim copy, no "fire station profile")
are in **`docs/profile_identity_spec_s29_v2.md` revision 3** — start there.
Next step: plan review of revision 3, then the clearance phrase, then
stage 1 (account-boundary safety + profile retirement, HIGH).
In one line each:
  1. Email/password sign-in has no stable identity — `Token` carries no
     `user_id`, so every sign-in mints `cloud_<timestamp>` and a new data
     scope. Reaches ordinary single-profile users. Google/OAuth unaffected.
  2. The sync queue dispatches without an ownership check and flushes on
     boot, so account A's failed write can replay against account B.
  3. Preserving any profile on sign-out breaks the explicit-logout gate —
     the naive fix to (1) silently disables logout.
  Plus a rollout trap: adding `user_id` to the backend response is NOT a
  safe backend-only deploy, because deployed clients already read that field
  and would switch data scopes instantly. See spec §4.
  Owner decision recorded: devices are never shared, so the local
  multi-profile feature has no forward use case — but existing stored
  profiles must not be destroyed to remove it. See spec §2 and §5.
  Reviewer agent `a85ddc71-6cd5-4a72-8da2-d1eefe1a83a1` holds both
  cross-review transcripts; reuse it rather than starting cold.

**OPEN — P3, environment.** `C:\Users\PC` is linked as a Railway project
directory with Mission Control's service as its default, and the CLI
resolves by walking up the tree — so an unqualified mutating `railway`
command from any Traycer worktree targets the wrong service. `--service` is
now mandatory in AGENTS.md; unlinking the home directory would remove the
hazard structurally but touches the Mission Control setup. Owner aware,
not yet actioned.

## Session 25+ Open Items (priority order)
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
P1 - Real phone-camera S25.2 Coach pass. Confirm a successful photo send
     collapses the equipment panel before the Coach text arrives, then confirm
     the Coach workout action opens preparation without visiting the dashboard.
P3 - Live-video visual walkthrough is deferred. Reconsider only if routine
     still-photo use proves insufficient for a real station or gym workflow;
     compare accuracy, latency, cost, reliability, and provider data handling
     before any implementation.
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
