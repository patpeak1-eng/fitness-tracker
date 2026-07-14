# Fitness Tracker — Health & Nutrition Research Synthesis

**Status:** Research complete. Never previously formalized into a document — compiled from Session 9 (initial backlog capture) and Session 12 (full 3-track research sprint) conversation history. Nothing nutrition-related exists in the repo, the codebase, or Google Drive as of this writing.

**This is NOT a build-ready spec.** It is the locked research findings and product decisions. Before any code is written, this needs to become a proper SPEC_FIRST document (data model, exact migrations, exact screens, exact API contracts) — that document doesn't exist yet either.

---

## 1. Why This Exists / Background

First captured as a backlog item in Session 9, deliberately deprioritized: "This is one of the last builds per your sequencing. Nothing gets built here until the core workout app, illustrations, and UI overhaul are complete... Capturing it now so the data model decisions we make in earlier sessions do not accidentally close the door on it."

In Session 12, a structured 3-track research sprint was run across multiple AI platforms (ChatGPT, Gemini, Claude) to answer the open questions before building. All three tracks completed. The synthesis below is what came out of that sprint.

---

## 2. Locked Product Decision: AI Coach's Nutrition Role Is Deliberately Narrow

**Original framing (Session 11):** "Wire nutrition to AI Coach so I can have a conversation about it."

**Research finding — a documented failure pattern, not a hunch:** Using conversational chat as the primary retrieval interface for trends and data is something users across MyFitnessPal, WHOOP, and other apps rate as friction, not a feature. Cited failure modes: forcing back-and-forth conversation to get what should be a simple graph, patronizing unsolicited validation, and a documented case where a context-routing failure misdirected a simple logging question to a crisis hotline.

**Corrected, locked scope:**

| AI Coach Role | Scope | Build This? |
|---|---|---|
| Input parsing | Photo of food -> structured food entry. Voice/text -> structured food entry. This is where AI genuinely reduces logging friction. | Yes |
| Coaching commentary | Brief, contextual comments referencing recent nutrition trends. Conversational, but supplementary — never the primary interface. | Yes |
| Trend retrieval | "How has my protein trended this month" — stays a chart/dashboard, answered visually. Never answered as a chat response. | No — explicitly rejected |

This directly affects the AI Coach's context payload (`_build_user_context()` in `backend/app/routers/coach.py`, already extended once for experience-level in Session 16) — nutrition data should feed into that context for commentary purposes, but no new "ask about my nutrition" chat flow should replace the dashboard.

---

## 3. Locked Product Decision: Weight/Calorie Trend Calculation Method

**Rejected:** A wearable-calorie-adjusted model. Research is explicit this causes systematic overeating due to non-additive metabolic compensation.

**Chosen:** A 7-day rolling average (EMA) on two data points the app already captures: logged food intake (new) and body weight (`weightHistory`, already exists in `WorkoutContext.jsx`). Cheapest, most accurate path; no new external integration needed; the smoothing algorithm itself should stay simple.

---

## 4. Technical Implementation Candidates (Partially Complete — Needs Refresh)

- **Food database:** Open Food Facts was the leading candidate — free, public API. Verify current API terms/rate limits before committing; this is 2026-01-era research.
- **Photo/OCR recognition:** Three options were being compared — OpenAI Vision (GPT-4o), Google ML Kit, Claude Vision. This comparison was never finished. Re-run fresh before implementation given how fast this space moves.
- **Barcode scanning:** Lowest priority, "possible future" — no technical research completed.

**Open gap:** cost-per-image and rate-limit comparisons were never fully synthesized. Treat as incomplete.

---

## 5. Full Feature Scope (Original Capture, Session 9 — Still the Baseline)

- Manual food and calorie logging
- Photo-based food recognition
- Nutrition label scanning (OCR)
- Daily calorie and macro tracking dashboard
- Integration with workout data (calories burned vs. consumed — display/context only, see Section 3 caveat)
- Barcode scanning for packaged foods (lowest priority)

---

## 6. What Still Needs to Happen Before This Is Buildable

1. Write the actual SPEC_FIRST document — data model (new tables, e.g. `food_log`), API contracts, screens, migration plan. Unconditionally HIGH zone (schema change) — same two-stage spec-then-clearance-then-implementation-then-clearance pattern as the S16 experience-level column.
2. Re-run the Track 2 technical comparison with current 2026 pricing.
3. Decide UI placement — nav is already at 5 items (Home/Workout/Progress/Profile/More). Own tab, section under Progress, or elsewhere?
4. Confirm exactly how nutrition data feeds `_build_user_context()` alongside the experience-level calibration and personality system.
5. Cross-reference against `docs/ARCHITECTURE.md` (just caught up in this same session) as the nutrition build's own architectural documentation requirement.

---

*Compiled from Session 9 and Session 12 conversation history, committed Session 17.*
