# FABLE 5 EXECUTION BRIEF — Fitness Tracker
## Session 11 Research Handoff | Locked for Session 12

**Purpose:** This document is the complete, locked brief for Fable 5's execution window (now → July 7, 2026, before API-only access). It combines three research tracks run across Gemini, ChatGPT, and Claude Chat's own verification pass. No Fable 5 work starts until this document is read in full at Session 12 open.

**Deadline constraint:** Fable 5 access reverts to API-only on July 7, 2026. All work below should be sequenced to complete or reach final review before that date.

---

## SECTION 0 — SCOPE FILTER (Read First)

The Track 3 research (Gemini strategic analysis) was written for a commercial multi-tenant fitness product. This app is personal/family use with a Fire Station first-responder profile. The following recommendations from that research are **explicitly out of scope** — do not build:

| Excluded | Reason |
|---|---|
| Lifetime pricing / subscription models | No monetization layer exists or is planned |
| Coach-led program marketplace | Single-family user base, no third-party sharing use case |
| Web Share Target API for cross-user CSV sharing | Low value for 2-5 known users |
| Social feed / community features | Already explicitly rejected in this app's design (S9-S11) |

Everything else in this document is in-scope and filtered for relevance to a personal PWA used by Patrick and family members, including a firefighter with Fire Station pause/resume requirements.

---

## SECTION 1 — VISUAL REDESIGN SPEC

### 1.1 Critical Evaluation of the Research

Two independent visual research passes (ChatGPT, Gemini) both analyzed Hevy, Fitbod, Strong, Nike Training Club, and MyFitnessPal. **The exact hex values and pixel measurements in both reports conflict with each other** — this is expected, since neither model has access to real design tokens and both are reconstructing from screenshots and marketing material. Treat every hex code and pixel value in both reports as **directional, not literal**.

**What is NOT directional and should be trusted:** the structural and behavioral patterns, because both reports independently converged on the same patterns despite different exact numbers. That convergence is the signal.

### 1.2 Structural Patterns Confirmed by Both Reports (High Confidence)

| Pattern | Source Consensus | Apply To |
|---|---|---|
| Flat cards, minimal/no drop shadow, separation via surface contrast | Both reports, all 5 apps | Already implemented S11 D3-D4 — confirm audit finds no regressions |
| Timer-first hierarchy in active workout (timer is largest visual element) | Both reports | Already implemented S11 D5 — verify timer digits are visually dominant |
| Set-complete state uses color transition (not just an icon change) | Both reports | Already implemented S11 D2 — confirm consistency across all set-logging surfaces |
| Bottom tab navigation, 5 items max, icon + optional label | Both reports | Verify current nav matches — audit item |
| PR / milestone gets a distinct accent color, separate from primary CTA color | Both reports | **Gap is visual-treatment ONLY** (verified S12 audit): PR detection logic already exists — `checkPersonalRecord()` (`WorkoutContext.jsx:1375`) sets `isPR` on sets at completion (`:1416`). Build only the distinct accent rendering for `isPR` sets; do not rebuild detection. |
| Nutrition dashboards use ring/radial progress for calories + macros, not bar charts | Both reports (MyFitnessPal specifically) | New for nutrition feature — see Section 2 |
| Rest timer shown as a persistent floating element, not a modal | Both reports | Verify current implementation matches |

### 1.3 Screen-by-Screen Direction

**Scope correction (locked, supersedes any earlier framing):** This app has a validated token system from Session 11 — blue-violet dark base (#0e0e18), 4 surface levels, neon green (#bfff00) accent, 12px card radius, tabular numbers. **This token system is the foundation and travels forward unchanged.**

Screen composition, layout, card structure, and information hierarchy are **fully in scope for redesign**. Fable 5 is authorized to rebuild screen layouts against the structural specs in Section 1.2/1.3 below — this is a clone-level visual redesign using the top apps as direct templates, not an incremental CSS pass. Do not preserve current screen composition for its own sake. The S11 tokens (color, radius, typography scale) apply *within* the new layouts; they do not constrain the layouts themselves.

| Screen | S11 Status | Redesign Direction (tokens carry forward, layout is rebuilt) |
|---|---|---|
| Dashboard | D1-D5 applied | Add: weekly snapshot styling consistency check against research card patterns |
| Active workout / set logging | D1-D5 applied | Add: PR gold/amber flag treatment (currently missing per research gap above) |
| Exercise library | Equipment filter added S11 | Verify card radius/spacing matches D4 spec across all 73 exercise cards |
| Template builder | Persistent filter + multi-select added S11 | No further visual work needed |
| Analytics | Not touched in S11 design sprint | **Full pass needed** — apply surface hierarchy + tabular numbers to charts, consider radial/ring pattern for any percentage-based metrics |
| Profile / Settings | Not touched in S11 design sprint | **Full pass needed** — apply consistent card/list styling per D4 |
| Nutrition (new) | Does not exist | Build using MyFitnessPal's dashboard pattern as primary reference — see Section 2 |
| Empty states | Not audited | Both reports confirm pattern: centered icon + one sentence + one primary action. Audit current empty states against this. |

### 1.4 One Structural Idea Worth Adopting

Both reports independently flagged Nike Training Club's **active-interval highlight bar** (the current exercise in a sequence gets a bright accent bar/background while upcoming exercises stay muted) as a distinctive, well-received pattern. This maps directly onto the existing Guided Mode "Up Next" list in `GuidedWorkoutView.jsx`. Low-cost, high-clarity addition — flag for Fable 5 as a specific enhancement to the existing exercise queue display.

---

## SECTION 2 — NUTRITION TRACKING: TECHNICAL ARCHITECTURE

### 2.1 Architecture Decision (Locked)

Based on the ChatGPT technical report and Claude Chat's own verification, the recommended stack is:

```
Packaged food (barcode):
  Open Food Facts API (free, no key, rate-limited but sufficient for personal use)
  → barcode lookup first
  → if no match: nutrition label OCR (Tesseract.js, browser-native, free)
  → if OCR fails/ambiguous: Claude Haiku 4.5 vision to parse label text into structured JSON

Plated meals / restaurant food (photo):
  Claude Haiku 4.5 vision
  → decomposes photo into candidate ingredient list + estimated portions
  → returns structured JSON (NOT raw nutrition claims)
  → resolve each candidate against Open Food Facts or manual entry
  → user confirms/edits before saving to diary

Manual entry:
  Direct form entry, always available as fallback for every path above
```

**Why this stack and not the alternatives the research presented:**

| Option | Cost | Why Rejected / Accepted |
|---|---|---|
| Native ML Kit (Lose It!'s approach) | Free but native-only | **Rejected** — ML Kit is not PWA-compatible. This app is explicitly a PWA. |
| Commercial nutrition API (fatsecret, Edamam) | $14-99+/month | **Rejected for V1** — unnecessary cost for a 2-5 user personal app. Open Food Facts free tier is sufficient at this scale. Revisit only if the app is ever opened beyond family use. |
| OpenAI Vision (GPT-4o) for photo parsing | ~$0.0019-0.0036/image (high detail) | **Rejected** — you already have Claude API infrastructure (AI Coach). Adding a second AI vendor for one feature is unnecessary integration overhead. |
| Claude Haiku 4.5 vision for photo parsing | ~$0.0013/image (1000×1000, standard tier) | **Accepted** — cheapest option, already-integrated vendor, correct model tier per Anthropic's own task-complexity guidance |

### 2.2 Cost Math — Verified

**Claude Haiku 4.5 vision, per Anthropic's current pricing (verified July 2026):**
- $1 per million input tokens, standard tier
- A 1000×1000 image ≈ 1,300 tokens → **≈ $0.0013 per image**
- At 3 photo logs/day, per user, for a 5-user household: 15 images/day × 30 days = 450 images/month
- Monthly cost: 450 × $0.0013 = **$0.585/month** for the entire household's photo-based food logging

This is negligible. Do not over-engineer cost controls for V1 — the volume this app will see makes it a rounding error.

**Open Food Facts:** $0. No API key, no usage cap for reasonable personal-scale traffic. Rate limits (15 req/min/IP reads, 10 req/min/IP search) will never be approached by a 2-5 user household app.

**Tesseract.js:** $0. Runs client-side in the browser, zero API cost, zero backend dependency.

**Total new infrastructure cost for full nutrition feature: under $1/month.**

### 2.3 TDEE Model (Adopt As-Is From Gemini Research)

This is the correct approach and should be the basis for any calorie/weight-trend coaching logic:

```
CO = CI − ΔE_stored

CO = true Total Daily Energy Expenditure (calculated, not estimated from wearables)
CI = logged caloric intake (averaged over a rolling window, e.g. 7-14 days)
ΔE_stored = change in stored energy, derived from smoothed body-weight trend
```

**Worked example:**
- User logs an average of 2,000 kcal/day intake over 2 weeks
- Smoothed weight trend shows a rate of loss implying a 400 kcal/day deficit
- CO = 2000 − (−400) = **2,400 kcal/day true expenditure**

**Why this matters:** it requires zero wearable/HealthKit integration for V1. It only needs two data points the app will already capture — logged food intake and logged body weight (already exists via `weightHistory` in WorkoutContext). This is the cheapest and most accurate path — do not build a wearable-calorie-adjusted model; the research is explicit that this approach causes systematic overeating due to non-additive metabolic compensation.

**Implementation note:** requires a weight-smoothing algorithm (rolling average, e.g. 7-day) to filter out day-to-day water/glycogen noise before calculating the trend. This is a well-known algorithm (exponential moving average is sufficient) — do not over-build this.

### 2.4 AI Coach Integration — Corrected Scope

**Original framing (Patrick, S11):** "Wire nutrition to AI Coach so I can have a conversation about it."

**Research finding (both Track 2 and Track 3):** Conversational AI as the *primary retrieval interface* for trends and data is a documented failure pattern. Users across WHOOP, MyFitnessPal, and other apps rate chat-based trend retrieval as friction, not a feature. Specific failure modes cited: forcing back-and-forth conversation to get a simple graph, patronizing unsolicited validation, and — in the most severe cited case — a context-routing failure that misdirected a simple logging question to a crisis hotline.

**Corrected scope for AI Coach + nutrition:**

| AI Coach Role | Scope |
|---|---|
| **Input parsing (build this)** | Photo → structured food entry. Voice/text → structured food entry ("log 225 for 8 reps" / "had a chicken breast and rice"). This is where AI adds real value — reducing logging friction. |
| **Coaching commentary (build this)** | Contextual comments on logged data — e.g., after a workout, brief commentary referencing recent nutrition trend. This is conversational but supplementary, not the primary data interface. |
| **Trend retrieval (do NOT build as chat)** | "How has my protein trended this month" stays a chart/dashboard, never a chat answer. This is cheaper to build (no new AI calls) and matches what users actually rate well. |

This descopes the AI Coach nutrition work significantly from "full conversational nutrition AI" to "logging assistant + occasional coaching commentary" — smaller build, avoids the specific failure mode multiple competitor apps are currently being criticized for.

---

## SECTION 3 — FEATURE BACKLOG (Consolidated, Priority-Ordered)

Cross-referenced against current app state (WorkoutContext.jsx, StorageService.js as of SHA `81a1be3`).

| # | Feature | Priority | Current State | Build Scope |
|---|---|---|---|---|
| 1 | Equipment Profile system (Full Gym/Home Gym/Fire Station/Bodyweight/Custom) | P0 | **CLOSED — already built** (verified S12 audit, live 2026-07-03): profile picker UI on /track (`TrackWorkout.jsx:170`), `DEFAULT_EQUIPMENT_PROFILES` + session override + compatibility filter (`WorkoutContext.jsx:121`, `:1931`), persisted per-profile (`StorageService.js:310`, `:323`) | None — remaining gap is cloud sync of the selection (local-only), tracked under S12 data-reliability findings |
| 2 | Fire Station pause button | P0 | Unbuilt | Prominent pause/resume on active workout screen, tied to Fire Station profile |
| 3 | Set-type differentiation (warm-up/working/AMRAP/drop) | P0 | **Not built** — all sets currently treated identically in volume calcs | New data model field on set objects + UI toggle + volume calc exclusion logic for warm-ups |
| 4 | Template picker chip filters (Muscle Focus + Duration) | P1 | **CLOSED — already built** (verified S12 audit, live 2026-07-03): Muscle Focus + Duration chips on /track (`TrackWorkout.jsx:21` `DURATION_CHIPS`, `:206` render; filtering verified in browser) | None |
| 5 | RPE/RIR-based auto-progression | P1 | Partially built — `smartProgressionEnabled` exists but is fixed-increment only | Add RPE/RIR input field to set logging, use as progression signal instead of fixed % |
| 6 | Plate calculator | P1 | **CLOSED — already built** (verified S12 audit): `PlateCalculator.jsx` exists and is wired into the active-workout screen (`TrackWorkout.jsx:6`, `:426`) | None — verify plate-set customization meets the original spec before building anything further |
| 7 | Nutrition tracking — full build | P1 | Does not exist | Per Section 2 architecture — barcode, photo, manual, TDEE model, AI Coach logging assistant |
| 8 | Workout streak calendar | P2 | Not built | Visual calendar, existing `history` data already supports this |
| 9 | e1RM analytics | P2 | **CLOSED — already built** (found during S12 reconciliation): Epley e1RM computed per set (`Analytics.jsx:55`), charted as "Estimated 1RM History" with info panel (`Analytics.jsx:182`) | None |
| 10 | Assessment CTA on empty dashboard | P2 | **CLOSED — already built** (verified S12 audit, live 2026-07-03): empty-state prompt + "Start Assessment" button (`Dashboard.jsx:179-186`) | None |
| 11 | Profile switch race condition fix | P3 | Known bug, documented | useRef guard, same pattern as existing mount guard |

**Backlog reconciliation (S12 audit, 2026-07-03):** items 1, 4, 6, 9, 10 above were found already built and are closed with source evidence; the Section 1.2 PR row is confirmed a visual-treatment gap only. Remaining open build items: 2 (Fire Station pause), 3 (set-type differentiation), 5 (RPE/RIR), 7 (nutrition), 8 (streak calendar), 11 (profile-switch race).

**Already built — do not duplicate (confirmed via research cross-reference):**
- Muscle volume distribution (`getMuscleVolumeDistribution()` — matches P1 research recommendation, already done)
- Unrestricted routine/template limits (no artificial cap exists)
- Offline resilience (localStorage-based persistence, matches P0 research requirement)
- Settings sync to backend (verified complete S11, all 7 fields)

---

## SECTION 4 — AUDIT CHECKLIST (Run First, Before Any New Feature Work)

Per MASTER_CONTEXT.md AUDIT_FIX_VERIFY_CLOSE_CYCLE (§2.13), Fable 5's first task is a full audit pass — not feature work. Checklist:

1. **Console errors/warnings** — full app walkthrough, every screen, capture and log all console output
2. **Design system consistency** — verify D1-D5 (Session 11 design sprint) applied consistently across Analytics and Profile/Settings screens, which were not directly touched in S11
3. **Touch target sizing** — mobile-first check, minimum 44×44px tap targets per standard accessibility guidance
4. **Dead code scan** — ESLint no-unused-vars, unused imports, TODO/FIXME grep (last cleanup was S10, threshold for next cleanup may be met)
5. **Null guard audit** — WorkoutContext.jsx and StorageService.js, focus on any code path touching `currentProfile`, `activeWorkout`, or set-level data
6. **Illustration verification** — confirm all 73 exercise illustrations load correctly across slow/throttled network conditions (previous session had a false-positive lazy-load timing issue — confirm it's not a real intermittent bug)
7. **PWA service worker behavior** — confirm cache invalidation works correctly on deploy (no stale bundle issues)
8. **Equipment filter regression check** — confirm S11 template builder changes (equipment filter, persistent filters, multi-select) still function correctly after any subsequent commits

Findings from this audit become Fable 5's first fix pass before any Section 3 feature work begins.

---

## SECTION 5 — EXECUTION SEQUENCE

```
1. AUDIT (Section 4 checklist)
   → Fix findings, single audit-fix commit or small batch of commits
   → Deploy + verify green

2. VISUAL REDESIGN EXTENSION (Section 1.3 — Analytics + Profile/Settings screens)
   → Apply existing D1-D5 system to untouched screens
   → Add PR flag treatment, active-interval highlight bar
   → Preview-gate each significant visual change per existing Codex/Fable workflow pattern

3. FEATURE BUILD — P0 items first (Section 3, items 1-3)
   → Equipment Profile system
   → Fire Station pause button
   → Set-type differentiation

4. FEATURE BUILD — P1 items (Section 3, items 4-7)
   → Template picker duration filter
   → RPE/RIR progression
   → Plate calculator
   → Nutrition tracking full build (Section 2 architecture)

5. AI COACH WIRING
   → Nutrition logging assistant (photo/voice/text → structured entry)
   → Coaching commentary layer
   → Explicitly do NOT build chat-based trend retrieval (Section 2.4)

6. P2/P3 backlog as time allows before July 7 deadline
```

Each stage follows the standard AUDIT_FIX_VERIFY_CLOSE_CYCLE from MASTER_CONTEXT.md — spec first, implement, deploy, verify live, close. HIGH zone files (WorkoutContext.jsx) still require coordinator sign-off per existing zone rules even under Fable 5 execution.

---

## SECTION 6 — CURRENT APP STATE REFERENCE

**Last verified SHA:** `81a1be3` (Session 11 close)

**Live URLs:**
- Frontend: https://fitness-tracker-production-54a4.up.railway.app
- Backend: https://astonishing-laughter-production-de7d.up.railway.app

**Design system (locked, do not replace):**
- Canvas: `#0e0e18` | Surface 1: `#16162a` | Surface 2: `#1e1e2e` | Surface 3: `#28283c`
- Primary accent: `#bfff00` (neon green)
- Card radius: 12px | Input/row radius: 8px | Pills: 999px | CTA buttons: 10px
- Tabular numbers on all weight/rep/timer displays (`font-feature-settings: "tnum"`)
- Completed set treatment: green tint background + left border, no full-flood color

**Architecture constraints (unchanged):**
- WorkoutContext.jsx = HIGH zone, one terminal at a time
- bcrypt==4.0.1 pinned, never upgrade
- No emojis anywhere — lucide-react icons only
- Alembic revision IDs under 32 characters

**Existing AI Coach infrastructure:**
- Backend-proxied via `POST /api/coach/chat` (SSE streaming)
- Model: claude-sonnet-4-6
- Voice: ElevenLabs (Jarvis voice)
- `CoachMessage` table exists in PostgreSQL

For nutrition photo parsing specifically, add a separate lightweight call path using **Claude Haiku 4.5**, not the existing Sonnet 4.6 coach conversation model — different task complexity, different cost profile (see Section 2.2).

---

*Document compiled from: ChatGPT visual research (Hevy/Fitbod/Strong/NTC/MyFitnessPal), Gemini visual research (same 5 apps, pixel-spec format), Gemini strategic/feature audit + TDEE model research, ChatGPT nutrition technical implementation research, and Claude Chat's independent verification of Claude API vision pricing and Open Food Facts rate limits (July 3, 2026).*
