# SPEC — Health & Nutrition Tracking (S18, SPEC ONLY — NOT IMPLEMENTED)

**Status:** Awaiting coordinator clearance. No code written. Unconditionally
HIGH zone — new database schema + user data + WorkoutContext/backend
simultaneous change. Implementation is its own future session (likely more
than one, given scope) with the standard two-stage clearance pattern (same
as the S16 experience-level column and the S17 account-deletion spec).

**Required background:** `docs/nutrition_research_synthesis.md` (S17). This
spec implements its locked decisions:
- AI Coach's nutrition role is deliberately narrow — input parsing and brief
  commentary only; trend retrieval stays chart/dashboard, **never** chat
  (synthesis §2).
- Trend method is a simple 7-day EMA over logged intake + existing
  `weightHistory`; wearable-calorie-adjusted models are rejected
  (synthesis §3).

**Technical direction (coordinator research, 2026-07-14 — supersedes
synthesis §4 "Track 2 incomplete"):**
- **Barcode / packaged food:** Open Food Facts API. Free, no paid tier,
  **15 req/min/IP read limit** — the backend caches and rate-limits its own
  outbound calls; the frontend never calls OFF directly and never
  per-keystroke.
- **Photo of a meal + nutrition label OCR:** Claude Vision via the **same
  Anthropic API client already used by the coach**
  (`backend/app/routers/coach.py`, `AsyncAnthropic`, `ANTHROPIC_API_KEY`).
  No new vendor, no new key. **One model, one endpoint** handles both
  "identify this plate" and "read this label" — no separate OCR pipeline.

---

## 1. Data Model (verified against `backend/app/models.py`, 2026-07-14)

### 1.1 New table: `food_log`

Mirrors `WorkoutHistory` conventions exactly: UUID PK, `client_id` for
offline-first dedup, `user_id` FK with DB-level `ON DELETE CASCADE` +
indexed, JSONB for structured detail, timezone-aware timestamps.

```python
class FoodLog(Base):
    __tablename__ = "food_log"
    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_food_log_user_client_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Frontend-generated id — same duplicate-prevention pattern as
    # workout_history.client_id (offline-first, sync-queue replays).
    client_id = Column(String, nullable=True, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    logged_at = Column(DateTime(timezone=True), nullable=False)  # when eaten (user-editable)
    description = Column(String, nullable=False)      # "Chicken salad, large"
    calories = Column(Integer, nullable=False)
    protein_g = Column(Float)                          # macros nullable — manual
    carbs_g = Column(Float)                            # quick-log may be
    fat_g = Column(Float)                              # calories-only
    source = Column(String(20), nullable=False, server_default="manual")
    #   "manual" | "photo" | "barcode" | "label"
    confidence = Column(String(10))                    # "low"|"medium"|"high"; NULL for manual/barcode
    barcode = Column(String(32))                       # EAN/UPC when source="barcode"
    items = Column(JSONB)                              # per-item breakdown from vision analysis
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="food_entries")
```

Plus on `User`: a `food_entries` relationship with
`cascade="all, delete-orphan", passive_deletes=True` — identical shape to
the existing eight relationships, which also keeps the S17 account-deletion
cascade audit true with zero extra work (deletion remains a single
`db.delete(user)`).

**Photos are NOT stored.** The image is sent to the analyze endpoint,
forwarded to Claude Vision, and discarded; only the structured result is
saved. No blob storage exists in this stack and v1 does not add any
(YAGNI + privacy: nothing to leak, nothing to delete later). If photo
retention is ever wanted, it is a separate spec.

### 1.2 New table: `off_product_cache` (no user data)

Backend-side cache for Open Food Facts responses so the 15 req/min/IP limit
is never consumed twice for the same product, and repeat scans work even if
OFF is down.

```python
class OffProductCache(Base):
    __tablename__ = "off_product_cache"

    barcode = Column(String(32), primary_key=True)
    product = Column(JSONB, nullable=False)   # normalized: name, brand, per-100g + per-serving macros
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
```

No `user_id` — it caches public product data, shared across users. Rows
older than 90 days are re-fetched on next request (freshness check in the
route, no cron).

## 2. Migration Plan

Current HEAD (verified): **0006**, revision ID `add_experience_lvl`
(filenames are 0001–0006; alembic chains on the **revision ID string**, not
the filename — see the 0006 header comment).

- **New file:** `backend/alembic/versions/0007_add_nutrition.py`
- `revision = "add_nutrition"` (13 chars — under the 32-char
  `alembic_version.version_num` cap called out in 0006)
- `down_revision = "add_experience_lvl"`
- Hand-authored to match `models.py` (same convention as 0001–0006; no
  local alembic CLI/Postgres). Railway runs `alembic upgrade head` on
  deploy.
- `upgrade()`: `op.create_table("food_log", ...)` with the FK
  `ondelete="CASCADE"` + `ix_food_log_user_id` index + the
  `uq_food_log_user_client_id` unique constraint (mirrors 0002's pattern);
  `op.create_table("off_product_cache", ...)`.
- `downgrade()`: drop index + both tables (reverse order).

One migration, both tables. No changes to any existing table.

## 3. API Contracts

New router: `backend/app/routers/nutrition.py`, `prefix="/api/nutrition"`,
all routes `Depends(get_current_user)` (Bearer-or-cookie for free, same as
every data router). Schemas in `backend/app/schemas.py`
(`FoodLogCreate`, `FoodLogUpdate`, `FoodLogResponse`, `PhotoAnalyzeRequest`,
`PhotoAnalyzeResponse`, `BarcodeProductResponse`).

| Endpoint | Calls | Purpose |
|---|---|---|
| `POST /api/nutrition/log` | **neither** | Create an entry (201). All sources funnel here — photo/barcode/label flows analyze first, the user reviews/edits, then the client POSTs the final values. Follows `weight.py`'s create shape; `client_id` upsert semantics like workouts sync (existing `user_id+client_id` row → update, not duplicate). |
| `GET /api/nutrition/log?start=&end=` | **neither** | List entries in a date range (default: last 30 days), `logged_at` ascending. |
| `PUT /api/nutrition/log/{id}` | **neither** | Edit an entry (own rows only — 404 on other users'). Required so AI-estimated values stay user-correctable after save too. |
| `DELETE /api/nutrition/log/{id}` | **neither** | Delete an entry (own rows only). First row-level delete endpoint for user data — scoped to a single `food_log` row, 204. |
| `POST /api/nutrition/analyze` | **Claude Vision** | Body: `{ image: <base64>, media_type, hint?: str }`. One endpoint for BOTH meal photos and nutrition labels: the prompt instructs the model to classify the image (plate vs. label), extract `{description, calories, protein_g, carbs_g, fat_g, items[], confidence, source: "photo"\|"label"}`, and return **strict JSON**. Nothing is persisted — the client shows the result for review/edit, then POSTs `/log`. Uses the coach's `AsyncAnthropic` client pattern + `ANTHROPIC_API_KEY`; model `claude-sonnet-4-6` (same constant family as `COACH_MODEL`). Rate-limited per user (`NUTRITION_ANALYZE_LIMIT = 10/min` via `app/rate_limit.py`) — cost guardrail identical in spirit to the coach's. Request size cap ~5 MB; client downscales images before upload. |
| `GET /api/nutrition/barcode/{code}` | **Open Food Facts** (cache-first) | 1. Look up `off_product_cache` — fresh hit returns immediately, zero OFF calls. 2. Miss/stale → GET `https://world.openfoodfacts.org/api/v2/product/{code}.json` (with the User-Agent header OFF requires), normalize, upsert cache, return. Outbound calls throttled globally (reuse `RateLimiter`, key `"off_outbound"`, 10/min — headroom under OFF's 15/min/IP). Throttle exhausted + no cache → 503 with Retry-After; client offers manual entry. Unknown barcode → 404. Barcode values are exact (`confidence: null`); user picks serving size client-side, then POSTs `/log` with `source="barcode"`. |
| `GET /api/nutrition/summary?days=7` | **neither** | Daily totals (calories, protein/carbs/fat) grouped by `logged_at` date. Exists for the **coach context** and any future consumer; the frontend dashboard computes its own totals/EMA from local data (Section 5) and does not depend on this route. |

The frontend **never** calls Open Food Facts or the Anthropic API directly —
no keys in the client, no per-keystroke external calls, all throttling
server-side.

`src/services/ApiService.js` (HIGH-zone file) gains the corresponding
methods via the existing `apiFetch` helper; new pushes register SyncQueue
executors per the S12 retry architecture.

## 4. AI Coach Integration

**Scope guard (locked, synthesis §2):** logging assistant + brief
commentary only. Trend questions ("how has my protein trended?") are
answered by the dashboard charts, **never** as a chat response. No chat
message ever triggers food logging or external lookups in v1 — input
parsing runs through the dedicated `/analyze` endpoint, not the coach chat.

`_build_user_context()` in `coach.py` — extend with one new block,
following the S16 experience-level extension pattern exactly (append to
`parts`, omit when empty, keep the "no data" sentinel logic intact):

```
NUTRITION (last 7 days): entries=<n>, avg_daily_calories=<x>,
avg_daily_protein_g=<x>, today: calories=<x>, protein_g=<x>
```

- Computed in `coach_chat` with one extra query over `food_log`
  (`logged_at >= now - 7 days`), aggregated in Python — same cost class as
  the existing last-10-workouts query. No EMA here; plain averages are
  enough for commentary.
- Omitted entirely when the user has no `food_log` rows (block absent, no
  "nutrition: none" noise — same drop-empty-fields discipline as the stats
  dict).
- `COACH_SYSTEM_PROMPT` gains two lines: (1) the WHAT YOU CAN SEE list adds
  the nutrition summary; (2) an explicit boundary instruction: *"For
  questions about nutrition trends or history, give at most a one-line
  observation and direct the user to the Nutrition dashboard — never
  recite logged data or act as a trend-retrieval interface."* This encodes
  the synthesis §2 rejection in the prompt itself, and the static block
  stays prompt-cached.

## 5. Weight/Calorie Trend Calculation (7-day EMA, synthesis §3)

**Where it lives: the frontend.** Rationale:

- Both inputs are already (or will be) local-first: `weightHistory` lives
  in `WorkoutContext.jsx` today; `foodLog` follows the same pattern
  (Section 7.4). The chart page has everything it needs with zero network
  round-trips, and works offline — consistent with the app's local-first
  architecture.
- The trend is **chart-only** by locked decision — no backend consumer
  exists. A backend EMA endpoint would serve nobody (the coach context uses
  plain 7-day averages, Section 4). YAGNI.

**What it reads:** local `weightHistory` (existing) + local `foodLog` (new),
each collapsed to one value per calendar day (weight: last entry of the
day; calories: sum of the day's entries).

**The math (keep it this simple, per synthesis §3):**

```
alpha = 2 / (7 + 1)            // = 0.25, standard 7-day EMA
ema[0] = series[0]
ema[i] = alpha * series[i] + (1 - alpha) * ema[i - 1]
```

One small pure function (`src/utils/ema.js` or colocated with existing
analytics utils if one fits — check for an existing smoothing helper
first), applied independently to the daily-weight series and the
daily-calorie series. Days with no data carry the previous EMA forward
(gap-tolerant); the raw points render alongside the smoothed line.

## 6. UI Placement — PROPOSALS ONLY (coordinator/Patrick decision, do not implement)

Current nav (verified in `src/components/layout/BottomNavigation.jsx`):
5 slots — Home `/`, Workout `/track`, Progress `/analytics`, Profile
`/profile`, **More** (overflow: Exercises, Timer, Coach).

| Option | What changes | For | Against |
|---|---|---|---|
| **A. Own bottom-nav tab** (`/nutrition`, e.g. demote Profile into More to stay at 5 slots) | BottomNavigation reshuffle | Logging happens 3–5×/day — more often than any current tab. One tap = best adherence, and adherence is the whole game in food tracking. | Displaces an existing tab (Profile is the least-frequent candidate but still a visible demotion); nav churn for users; biggest UI change. |
| **B. Section under Progress** (`/analytics` gains a Nutrition tab/segment; logging launched from there + a Home quick-log card) | Analytics page + Dashboard card | Zero nav change; trends live next to the existing volume/1RM charts where a "review" mindset already exists. | Mixes a high-frequency *capture* action into a low-frequency *review* surface; logging is 2 taps and conceptually buried. The Home quick-log card is doing the real work. |
| **C. More overflow item** (`/nutrition` alongside Exercises/Timer/Coach) | One entry in the More menu (+ optional Home quick-log card) | Cheapest and most consistent with how Coach/Timer were added; fully reversible; good v1-probe placement. | Two taps for the most frequent action in the feature; overflow placement signals "secondary" and will measurably depress logging rates. |

Not picked here by design. Note for the decision: whichever placement wins,
a **Home dashboard quick-log card** (today's calories + a "+" button) is
cheap, fits the existing Dashboard card grid, and mitigates the tap-count
downside of B and C.

## 7. Screens (follow `docs/DESIGN_TOKENS.md` — Ember-on-Graphite, purpose-per-token)

Layout constraint (S14/S15 finding): `.main-content` caps at 600px — design
mobile-first; no >600px media-query layouts (they are dead by construction).

### 7.1 Log Entry screen (`/nutrition/log` or modal from the dashboard)
- Four entry paths as segmented options: **Manual** (description, calories,
  optional macros, date/time defaulting to now) · **Photo** (camera/file →
  `/analyze`) · **Label** (same `/analyze` endpoint — the model
  distinguishes) · **Barcode** (native `BarcodeDetector` API where
  available — platform feature, no new dependency — with manual code-entry
  fallback → `/barcode/{code}`, then serving-size picker).
- **Review-before-save is mandatory for every AI path** (Section 10): the
  analyze result renders as a pre-filled editable form, values marked
  "Estimated", confidence shown, every field editable. Nothing persists
  until the user taps Save.
- Loading state during analysis (2–5 s vision round-trip); failure falls
  back to the manual form with whatever was extracted.

### 7.2 Daily dashboard
- Today: calories + macro totals vs. optional targets (targets read from
  existing `UserStats.goal` heuristics or entered manually — v1 keeps
  targets manual and optional; no TDEE calculator).
- 7-day EMA trend chart: smoothed daily calories and smoothed weight on one
  card (dual series, raw points muted). Chart-only trend surface per the
  locked coach boundary.
- Today's entry list with source icons (✎ manual / 📷 estimated / ⬚ barcode
  exact / 🏷 label) and per-entry edit/delete.

### 7.3 History view
- Reverse-chronological day groups, per-day totals, expandable to entries;
  same edit/delete affordances. Range selector (7/30/90 days).

### 7.4 State & sync (WorkoutContext)
- `foodLog` state follows the established patterns to the letter:
  **hydration-gated persistence** (the S13 `activeWorkoutHydratedFor`
  pattern — no mount-guard refs, they fail under StrictMode replay),
  `client_id` on every entry, pull-merge preserving `client_id`,
  SyncQueue-registered push executors, 401 → re-login banner.

## 8. Zone Classification & Risk

**Unconditionally HIGH.** New schema (`models.py` + `alembic/versions/`),
new user-data table, `routers/` + `schemas.py`, `ApiService.js` (HIGH-zone
file), and `WorkoutContext.jsx` + backend simultaneously. Hard-stop rules
apply: this spec → coordinator clearance → implementation session(s) →
diffs in chat → literal "Cleared, proceed with commit" per HIGH-zone commit.

Recommended implementation split (each its own session/clearance):
1. **Backend:** migration 0007 + models + schemas + nutrition router +
   coach context block.
2. **Frontend core:** WorkoutContext foodLog + ApiService + manual logging
   + dashboard + EMA chart.
3. **AI/barcode paths:** photo/label analyze flow + barcode scan flow +
   polish. (2 and 3 may merge if session capacity allows.)

Risks:
- *Vision cost abuse:* per-user rate limit on `/analyze` (Section 3), size
  cap, no unauthenticated access. A single image is a fraction of a cent at
  Sonnet rates; 10/min/user keeps worst-case bounded.
- *OFF rate limit / outage:* cache-first + global outbound throttle +
  manual-entry fallback (Section 3). OFF is never on the critical path.
- *Bad AI estimates persisted silently:* structurally prevented — analyze
  never writes; only the user's reviewed POST does (Sections 3, 10).
- *Duplicate rows on re-login/replay:* `client_id` unique constraint +
  upsert semantics, the exact fix already proven on `workout_history`.
- *Coach scope creep into trend chat:* boundary encoded in the system
  prompt and in what the context block contains — averages only, no
  per-entry data to recite (Section 4).
- *Privacy:* meal photos go to the Anthropic API transiently and are never
  stored by our backend (Section 1.1). State this in the UI the first time
  the photo path is used.
- *Testing:* disposable account on live per standing practice; never
  Patrick's account.

## 9. Files Touched (implementation sessions)

| File | Change |
|---|---|
| `backend/alembic/versions/0007_add_nutrition.py` | **new** — `food_log` + `off_product_cache` (Section 2) |
| `backend/app/models.py` | `FoodLog`, `OffProductCache`, `User.food_entries` relationship |
| `backend/app/schemas.py` | FoodLog create/update/response + analyze/barcode schemas |
| `backend/app/routers/nutrition.py` | **new** — all Section 3 routes |
| `backend/app/routers/__init__.py` + app router registration | register nutrition router |
| `backend/app/routers/coach.py` | nutrition context block + 2 system-prompt lines (Section 4) |
| `backend/app/rate_limit.py` | `NUTRITION_ANALYZE_LIMIT/WINDOW`, `OFF_OUTBOUND_LIMIT/WINDOW` consts |
| `backend/app/main.py` (or wherever routers mount) | include nutrition router |
| `src/services/ApiService.js` | nutrition methods (**HIGH-zone file**) |
| `src/context/WorkoutContext.jsx` | `foodLog` state, hydration-gated persist, sync executors (**one terminal at a time**) |
| `src/pages/Nutrition.jsx` + `.css` | **new** — dashboard/history (Section 7) |
| `src/components/nutrition/` | **new** — log-entry form, analyze review, barcode scanner components |
| `src/components/layout/BottomNavigation.jsx` | per Section 6 decision |
| `src/pages/Dashboard.jsx` | quick-log card (if adopted per Section 6) |
| `src/utils/ema.js` | **new** — the ~6-line EMA helper (Section 5) |
| `docs/ARCHITECTURE.md` | route inventory + data-model sections, same commits |

## 10. Accuracy Disclosure (explicit, non-negotiable in the UI)

Photo-based calorie/macro estimation of non-packaged food is **inherently
approximate** — portion size, hidden fats, and preparation are not reliably
inferable from an image. Barcode lookups are exact (label-declared values);
label OCR is near-exact but can misread. The spec deliberately does not
oversell this:

- Every AI-derived value is labeled **"Estimated"** in the review form, on
  the entry row, and in the entry detail — visually distinct from
  barcode-exact values (token-compliant badge, not color alone).
- Stored `confidence` (low/medium/high, straight from the model's own
  self-assessment) is displayed, not hidden.
- **The user can edit every AI-estimated field before it saves** (analyze
  → review → save flow, Section 3) and after (PUT endpoint).
- Dashboard/trend copy treats totals as directional ("~2,150 kcal"), and
  the coach's commentary style already avoids false precision.

## 11. Acceptance Criteria (for the implementation sessions)

1. Migration 0007 applies cleanly on Railway (`alembic upgrade head`,
   deploy green); `/openapi.json` shows the new routes/schemas.
2. Manual, photo, label, and barcode flows each produce a saved, correct
   `food_log` row on a disposable live account; photo/label rows carry
   `confidence` and user-edited values, barcode rows carry the barcode.
3. Analyze endpoint never persists anything on its own (verified by row
   counts before/after an analyze-without-save).
4. Repeat barcode scan of the same product performs zero outbound OFF calls
   (cache hit verified in backend logs).
5. Coach chat includes the NUTRITION block when entries exist and omits it
   when none do; a "how has my protein trended" question yields a one-line
   deflection to the dashboard, not recited data.
6. EMA chart renders correct smoothed series against hand-computed values
   for a fixture week; offline dashboard works with no network.
7. Reload/StrictMode persistence: `foodLog` survives refresh with the
   hydration gate; no duplicate rows after logout/login (client_id merge).
8. Zero regressions in workout logging, coach chat, and weight history.
