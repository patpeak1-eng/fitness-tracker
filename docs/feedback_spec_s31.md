# Spec — In-app Feedback (S31)

> **STATUS: REVISION 3, 2026-09-10 — rewritten after a second plan review
> (independent Claude reviewer, cold) returned CHANGES-REQUIRED with ten
> findings, all verified against source and adopted. Spec only, no code.
> Awaiting plan review of this revision and the literal "Cleared, proceed
> with implementation."**
> Owner direction: build it in the app; wording is **Feedback**; entry
> beside the version line in Settings.
>
> **Revision history, kept on purpose:**
> - *Rev 1* — admin gate by email (unsafe: registration compares email
>   case-sensitively and never verifies ownership); claimed `/me` returns
>   `UserResponse` (it returns a hand-built dict); assumed a ready local DB.
> - *Rev 2* — promised "fixtures first, red then green" against a backend
>   that has **no test harness at all** (no `backend/tests/`, no
>   `conftest.py`, no pytest in `requirements.txt`); made guest idempotency
>   "per IP" while also promising never to persist the IP; had a malformed
>   `ADMIN_USER_IDS` raise at import and take the whole backend down;
>   promised focus restoration from a `Modal` that has none; specified a
>   Layout route tracker when one navigation site and `location.state` do
>   the job; left the `/feedback` route and the flag's caller unlisted.

**Zone:** HIGH — new table and migration, new router, a new call in
`src/services/ApiService.js`, a change to the account-deletion route, and
a **new backend test harness**. Two-clearance gate applies. No
auth-transport change (that is S29's).

---

## 1. Purpose

Users, now including fire-service co-workers, report that something is
broken, could be better, or is missing — from inside the app, with the
build version and screen attached automatically. The owner reads reports
in the app.

## 2. Existing facts, verified (2026-09-10, `9cb2883`)

| Thing | Where | Relevance |
|---|---|---|
| Build id in the UI | `Settings.jsx:486` | entry point beside it |
| `__APP_VERSION__` | `vite.config.js:11-12` | attaches automatically |
| Required-auth dependency | `auth.py:84-123 get_current_user`; `bearer_scheme = HTTPBearer(auto_error=False)` at `:45`; Bearer wins over cookie at `:103` | optional variant delegates to it (§4) |
| `HTTPBearer(auto_error=False)` | returns `None` for a missing header, an empty `Bearer`, or a non-bearer scheme (verified in installed FastAPI) | presence must be tested on the raw header |
| Rate limiter | `rate_limit.py:66 rate_limit(key, limit, window, current_user=None)`; `Retry-After` `:71-75`; per-process memory `:7-10`; `_windows` never evicts (`:20,35-38`) — grows until restart, negligible | reuse |
| Client IP | `routers/auth.py:59-72 _client_ip` (private, in a router) | move to `rate_limit.py`; never persisted |
| Registration race precedent | `routers/auth.py:101-110` catches `IntegrityError` | same pattern for idempotency |
| `SECRET_KEY` precedent | `auth.py:24-34` missing → warn and degrade, never raise | same for `ADMIN_USER_IDS` |
| `/me` | `auth.py:321` no `response_model`; dict at `:356-362`; client copies five fields (`WorkoutContext.jsx:526-537`); `getMe` cookie-only (`ApiService.js:70-77`) | not used for the admin flag |
| Input schemas | `ProfileUpdate` `schemas.py:100-117`, `UserRegister` `:17-20`; `profile.py:45` `model_dump(exclude_unset=True)` → `setattr` `:49-50`; undeclared JSON keys are dropped by Pydantic | admin flag on no input schema |
| Migrations | latest `0010`, revision id `equipment_env_cloud`, down `add_date_of_birth`; `0007_add_nutrition.py:66` shows `ondelete="CASCADE"` in a migration | `0011` pattern |
| `User` relationships | all nine `cascade="all, delete-orphan", passive_deletes=True` (`models.py:46-100`) | `db.delete(user)` + commit (`routers/auth.py:405-406`) emits one DELETE; PostgreSQL runs FK actions |
| Deletion docstring | `routers/auth.py:381-384` — **already stale** (omits `food_log`) | fix in the same commit |
| Deletion promise | `Settings.jsx:471,536-538` "all cloud data" | §3 honours it |
| Local DB | `database.py:17-20` placeholder URL; `alembic.ini:10` placeholder; `env.py:29-31` overrides from `DATABASE_URL`; no `backend/.env` in the repo | disposable Postgres + explicit URL |
| Backend tests | **none**: no `backend/tests/`, no `conftest.py`, no pytest/pytest-asyncio in `requirements.txt` | harness is a deliverable (§6) |
| `Modal` | `src/components/common/Modal.jsx`, 32 lines: overlay `onClick={onClose}` (`:9`), no focus trap/restore, no Escape, unused `useEffect` import | focus/close behaviour must be built |
| Navigation to Settings | **only** `Dashboard.jsx:80`; no bottom-nav entry | `location.state` is the mechanism |
| Existing Settings modals | logout `:495`, deletion `:511`; separate booleans `:69,:72`; deletion guards close while busy (`:513`) | same pattern |
| Routes | `App.jsx:53-67` | `/feedback` added |
| `pydantic[email]` | installed | `EmailStr` works |

## 3. Data model and deletion contract

Table `feedback` (`0011_add_feedback.py`, `down_revision =
"equipment_env_cloud"`):

| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `user_id` | UUID FK `users.id` **`ondelete="CASCADE"`**, nullable, **indexed** | null for guests; FK action in both model and migration |
| `category` | string; `Literal["broken","improve","idea"]` in the schema | |
| `message` | text; trimmed, non-blank, 1–2000 chars, server-side | |
| `contact_email` | string(254), nullable; `field_validator(mode="before")` blank → `None`; `EmailStr` | |
| `app_version` | string(16), 1–16 | |
| `route` | string(64); pathname only | |
| `user_agent` | string(256), truncated server-side | diagnostic text |
| `client_key` | string(36), **`UNIQUE`** — the whole idempotency mechanism | per-draft UUID |
| `created_at` | timestamptz, server default, **indexed** | cursor `(created_at, id)` |

**Idempotency:** `UNIQUE(client_key)` only (a 36-char UUID; cross-submitter
collision is not realistic). On `IntegrityError`: rollback, re-select by
`client_key`; if the existing row's `user_id` equals the current principal
(both `NULL` for guests counts) return `200 {id}`; otherwise `409`. No
per-IP dedupe — the IP is never stored, and `UNIQUE(user_id, client_key)`
would be a no-op for guests (NULLs are distinct).

**Deletion contract:** deleting an account deletes its feedback, contact
address included — what the app already promises. No `Feedback`
relationship on `User`, so the ORM cannot pre-empt the FK. The deletion
docstring is corrected (it also omits `food_log` today). Guest feedback is
kept until the owner removes it from the database; the modal says "Kept
until it's been acted on." This **is** user data; the zone list gains
`feedback`.

## 4. Backend

New `backend/app/routers/feedback.py`.

- **Admin identity:** `ADMIN_USER_IDS`, comma-separated account UUIDs, set
  by the owner in Railway. Parsed **once at import, tolerant**: each bad
  entry logged as an error and skipped, valid ones kept, **never raise**
  (a typo in the Railway UI must not take down login and sync). Empty →
  nobody is admin. One predicate `is_admin(user)` (`user.id ∈ set`) used by
  the capability endpoint and inbox authorisation. No column on `User`;
  nothing for `setattr` to hit; never from a request body or the client.
- `GET /api/feedback/access` — required auth (`get_current_user`), returns
  `{ is_admin }`. Display-only; authorisation is re-checked per request.
- `POST /api/feedback` — **optional auth, implementable and consistent:**
  ```
  if "authorization" not in request.headers and "session_token" not in request.cookies:
      return None            # genuine guest
  return await get_current_user(request, credentials, db)   # same precedence as every other route
  ```
  So: no transport → guest; malformed header + valid cookie → the cookie
  user (as elsewhere); malformed header alone → 401; expired → 401. Never
  silently downgraded to guest. Body validated per §3; idempotent per §3;
  rate limited **10/hour per account** (`f"{user.id}:feedback"`) and
  **30/hour per guest IP** (`f"feedback:{ip}"`) — a station sharing one
  NAT'd Wi-Fi shares the guest budget; intended and stated. `Retry-After`
  surfaced. `201 {id}`.
- `GET /api/feedback?limit=50&before=<created_at>&before_id=<id>` — admin
  only (403); newest first; `limit ≤ 100`; cursor on `(created_at, id)`.
  Rows include submitter email/name when `user_id` resolves, else `guest`.
- `_client_ip` moves from `routers/auth.py` to `rate_limit.py`
  (router-to-router import is the wrong direction); `auth.py` imports it
  from there. One-line move, no behaviour change.

## 5. Frontend

- **Settings**, beside the version line: `Send feedback` opens the modal
  (own boolean; never alongside logout/deletion). On mount, when the API
  is configured and a session may exist, Settings calls
  `ApiService.getFeedbackAccess()` and keeps a local `isAdmin` for the
  inbox link. **Not** in `WorkoutContext` (one writer, HIGH). Settings
  also shows the account id under the version line so the owner can copy
  it for `ADMIN_USER_IDS` without devtools.
- **Modal changes (benefit the two existing dialogs too):** store
  `document.activeElement` on open and refocus it on close; close on
  Escape; **overlay click does not close while sending or while the draft
  is non-empty** (deletion-modal guard pattern, `Settings.jsx:513`);
  remove the unused import. Small, LOW by diff, listed as scope.
- Modal content: three category chips; message with counter; "Reply email
  (optional)" prefilled, labelled separately from the signed-in identity;
  "Your app version and screen are included. Kept until it's been acted
  on." Submit disables the button, mints `client_key` once per draft,
  sends via `ApiService.sendFeedback`. Success only on 201/200. 401 → keep
  draft, "session expired, sign in again". 429 → keep draft, show wait.
  Network → keep draft, "check your connection". **Explicit exception to
  the `AGENTS.md` queue rule:** no background retry; silently resending a
  person's words is worse than telling them it failed.
- **Route capture — smallest correct mechanism:** `Dashboard.jsx:80`
  becomes `navigate('/settings', { state: { from: location.pathname } })`;
  Settings reads `useLocation().state?.from ?? '/settings'`. One line each,
  StrictMode-proof (it lives in the history entry). No Layout tracker.
- **Inbox** at `/feedback` (`App.jsx` route added): page guard via
  `getFeedbackAccess` on mount **and** backend 403; newest first; "Load
  more" via the cursor; every field escaped React text, newlines
  preserved, long words wrapped.
- **Help page:** one sentence. **Coach knowledge:** one line, same commit.
- **Known limitation:** explicitly logged-out users cannot reach Settings
  (`App.jsx:53`); a broken login cannot be reported from the login screen.

## 6. Verification

1. **Backend test harness (new deliverable, reusable by S29's backend
   stages):** `backend/requirements-dev.txt` (pytest, pytest-asyncio,
   httpx), `backend/tests/conftest.py` building an async engine from an
   explicit `TEST_DATABASE_URL` (a disposable local PostgreSQL; refuses to
   run if the URL contains the production host), creating tables per
   session and truncating per test, and an ASGI client with dependency
   overrides for the DB session. Documented in `docs/skills/`.
2. **Fixtures first, red then green:** case-variant password account is
   not admin; malformed header alone → 401; malformed header + valid
   cookie → that user; expired → 401; absent → guest 201; `is_admin` on
   no input schema (introspect `ProfileUpdate`, `UserRegister`,
   `FeedbackCreate`); bad `ADMIN_USER_IDS` entry logged and skipped, app
   imports; account deletion with feedback rows, loaded and unloaded →
   user and rows gone, guest rows untouched; `client_key` repeat same
   principal → 200 same id, different principal → 409; 429 with
   `Retry-After`; pagination beyond 50 with a `created_at` tie.
3. Alembic: `upgrade head`, `downgrade -1`, `upgrade head` against the
   disposable DB with an explicit `DATABASE_URL`.
4. Playwright, desktop and 375 px: button beside the version line; modal
   opens and returns focus on close; Escape closes when the draft is
   empty; overlay click does **not** close a non-empty draft; success;
   401/429/network states keep the draft; inbox link absent for
   non-admin, present for admin; inbox renders `<script>` as text; with a
   rest timer running. Console clean.
5. Live: deploy; `/openapi.json` shows the three routes; migration
   applied; **owner** copies the account id from Settings and sets
   `ADMIN_USER_IDS` (production change — the owner's action); one
   disposable-account submission and one guest submission; owner opens
   the inbox on the real app; disposable account deleted through the app,
   row confirmed gone.
6. `docs/ARCHITECTURE.md`: table, router, routes, zone-list addition, the
   queue-rule exception, the test harness — same commit as the code.

## 7. Decisions for the owner

1. **Admin gate = `ADMIN_USER_IDS` Railway variable** (recommended) or a
   DB column set by hand.
2. **Guests may submit** (recommended yes); an expired session is told to
   sign in again, never silently filed as a guest.
3. **Deletion:** delete a person's feedback with their account
   (recommended) or retain with disclosure and a retention period.
4. Inbox read-only with paging (recommended).
5. **Backend test harness as part of this work** (recommended — the
   HIGH-zone verification tier cannot be met without it, and S29's backend
   stages need it too) or a scripted probe instead, accepting a weaker
   tier for this feature.

## 8. First commit after clearance

Schema only, serving no traffic: the `Feedback` model (FK
`ondelete="CASCADE"` + index, `client_key` unique, `created_at` index),
`0011_add_feedback.py` (`down_revision = "equipment_env_cloud"`), the
`ARCHITECTURE.md` row — verified by up/down/up on the disposable DB. Then
the harness and red fixtures, then the router, then the UI.

## 9. Not in scope

Email notifications. Attachments. Replying or triaging from the app.
Reporting from the login screen. Any change to `/me` or `getMe`'s
transport. A retention job.

## 10. Provenance

Rev 1 reviewed by an independent Codex agent (`6554b7a8-…`): CHANGES-
REQUIRED. Rev 2 reviewed by an independent cold Claude agent: CHANGES-
REQUIRED, ten findings; every one verified against source and adopted.
Reviewer transcripts are the proof artifacts.
