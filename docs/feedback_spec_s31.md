# Spec — In-app Feedback (S31)

> **STATUS: REVISION 4, 2026-09-11 — after a third plan review
> (independent cold Claude reviewer) returned CHANGES-REQUIRED with nine
> findings, all verified and adopted. Spec only, no code. Awaiting review
> of this revision, the owner's provisioning decision (§7 Q6), and the
> literal "Cleared, proceed with implementation."**
> Owner direction: build it in the app; wording is **Feedback**; entry
> beside the version line in Settings.
>
> **Revision history:**
> - *Rev 1* — email allowlist for admin; `/me` mis-described; no local DB.
> - *Rev 2* — promised fixtures with no harness; per-IP idempotency vs
>   "never store the IP"; import-time raise on a bad env var; Modal
>   behaviour it lacks; a Layout tracker; unlisted route and caller.
> - *Rev 3* — assumed a "disposable local PostgreSQL" that **does not exist
>   on the development machine** (no `psql`, `pg_ctl`, `docker`, `podman`;
>   no `asyncpg`, no `pytest-asyncio`; `docs/skills/alembic-migration-
>   pattern.md:40` already says so). The only Postgres is the production
>   service. Route capture recorded a constant. IntegrityError no-row
>   branch and the 409 UI unspecified. Modal changes misattributed and
>   under-specified. Harness pitfalls unnamed.

**Zone:** HIGH — new table and migration, new router, a new call in
`src/services/ApiService.js`, a change to the account-deletion route, a
new backend test harness, and an edit to the `AGENTS.md` zone list.

---

## 1. Purpose

Users, now including fire-service co-workers, report that something is
broken, could be better, or is missing — from inside the app, with the
build version attached automatically. The owner reads reports in the app.

## 2. Existing facts, verified (2026-09-11, `55e97ca`)

| Thing | Where | Relevance |
|---|---|---|
| Build id in the UI | `Settings.jsx:486` | entry point beside it |
| `__APP_VERSION__` | `vite.config.js:11-12` | attached automatically |
| Required-auth dependency | `backend/app/auth.py:84-123 get_current_user(request, credentials=Depends(bearer_scheme), db=Depends(get_db))`; `HTTPBearer(auto_error=False)` `:45`; Bearer wins when the header is present `:103`; empty token → 401 `:104-105`; `JWTError` → 401 `:111` | optional variant delegates (§4) |
| `HTTPBearer(auto_error=False)` | returns `None` for missing header, empty `Bearer`, non-bearer scheme (installed FastAPI 0.136.1, `security/http.py`); `requirements.txt` pins nothing | presence tested on the raw header |
| Rate limiter | `rate_limit.py:66`; `Retry-After` `:71-75`; module-level `_limiter` `:42`; never evicts `:35-38` | reuse; reset between tests |
| Client IP | `routers/auth.py:59-72 _client_ip`; callers `:83`, `:125` | move to `rate_limit.py` |
| IntegrityError precedent | `routers/auth.py:101-110` | same pattern |
| `SECRET_KEY` precedent | `auth.py:24-34` warn + ephemeral key, never raises | same for `ADMIN_USER_IDS` |
| `/me` | `routers/auth.py:321` no `response_model`; dict `:356-362`; client copies five fields (`WorkoutContext.jsx:526-532`); `getMe` cookie-only (`ApiService.js:70-77`) | not used for the flag |
| Input schemas | `schemas.py:100-117`, `:17-20`; `profile.py:45,49-50` | flag on no input schema |
| Migrations | latest `0010` id `equipment_env_cloud`; `0007:66` `ondelete="CASCADE"`; `0007:60-64` `created_at` is **nullable** (do not copy) | `0011` pattern |
| `User` relationships | nine, all `cascade="all, delete-orphan", passive_deletes=True` (`models.py:46-100`) | one DELETE; PostgreSQL runs FK actions |
| Deletion docstring | `routers/auth.py:381-384` — stale (omits `food_log`) | fix in the same commit |
| Deletion promise | `Settings.jsx:471,536-538` | §3 honours it |
| Local DB | **none.** `database.py:17-20` placeholder; `alembic.ini:10` placeholder; `env.py:29-31` reads `DATABASE_URL`; `load_dotenv()` at `database.py:12`, `auth.py:20` (does not override existing env) | §6.1 provisioning |
| Backend tests | none: no `backend/tests`, `conftest.py`, `pytest.ini`, `pyproject.toml`; no pytest-asyncio/asyncpg installed | harness is a deliverable |
| `Modal` | `Modal.jsx` 32 lines; early `return null` at `:6` **before any hook**; overlay `onClick={onClose}` `:9`; X `:14`; no focus/key handling; **17 call sites in 12 files** | any change is app-wide |
| Navigation to Settings | only `Dashboard.jsx:80`; Dashboard is the **index route** (`App.jsx:54`) so its pathname is always `/` | route capture would record a constant |
| Settings modals | `:495`, `:511`; booleans `:69,:72`; busy guard inside `onClose` `:513` | same pattern |
| Cloud-profile discriminator | `Settings.jsx:465` `apiConnected && currentProfile?.email` | gates the account-id display and the capability call |
| Routes | `App.jsx:53-67`; `<Layout>` gated on `currentProfile` `:53` | `/feedback` added |
| Zone list | `AGENTS.md:47-48` (omits `food_log`) | gains `food_log`, `feedback` |
| Revision-id limit | `alembic_version` is VARCHAR(32) (`docs/skills/railway-deploy-verification.md:70`) | `0011` id `add_feedback` |
| `pydantic[email]` | installed | `EmailStr` works |

## 3. Data model and deletion contract

Table `feedback` (`0011_add_feedback.py`, `revision = "add_feedback"`,
`down_revision = "equipment_env_cloud"`):

| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `user_id` | UUID FK `users.id` `ondelete="CASCADE"` (model **and** migration), nullable, indexed | null for guests |
| `category` | string; `Literal["broken","improve","idea"]` | |
| `message` | text; trimmed, non-blank, 1–2000 | |
| `contact_email` | string(254) nullable; `field_validator(mode="before")` blank → `None`; `EmailStr` | |
| `app_version` | string(16), 1–16 | |
| `user_agent` | string(256), truncated server-side | |
| `client_key` | `UUID` in the schema (rejects garbage), string(36) **UNIQUE** in DB | idempotency |
| `created_at` | timestamptz **`nullable=False`**, server default, indexed | cursor `(created_at, id)` |

**No `route` column.** The only way to reach Settings is from the
Dashboard, so a captured pathname would always be `/`; recording a
constant is worse than nothing. If a second entry point ever exists, add
the column then (YAGNI). The §1 promise is "version attached", not
"screen".

**Idempotency:** `UNIQUE(client_key)`. On `IntegrityError`: rollback;
re-select by `client_key`; **no row → re-raise** (a different constraint
fired, e.g. the `user_id` FK during a concurrent account deletion);
row found and `existing.user_id == principal_id` (both `None` for guests
counts) → `200 {id}`; otherwise `409`. No per-IP dedupe; the IP is never
stored.

**Deletion contract:** deleting an account deletes its feedback, contact
address included. No `Feedback` relationship on `User`. Deletion
docstring corrected (also adds `food_log`). Guest feedback kept until the
owner removes it; the modal says "Kept until it's been acted on."
Feedback **is** user data: `AGENTS.md:47` gains `food_log` and `feedback`.

## 4. Backend

New `backend/app/routers/feedback.py`; `get_optional_user` lives in
`auth.py` beside `get_current_user`.

- **Admin identity:** `ADMIN_USER_IDS`, comma-separated UUIDs. Parsed once
  at import: strip entries, skip empties (a trailing comma is not an
  error), log an error per invalid entry, keep valid ones, **never
  raise**. Observability: always `logger.info("ADMIN_USER_IDS: %d admin
  id(s) loaded")`; `logger.warning(...)` when the variable is non-empty
  but yields zero. A change takes effect on the next process start
  (Railway restarts on variable change). Predicate `is_admin(user)`;
  no column on `User`; never from a request.
- `GET /api/feedback/access` — `get_current_user`; `{ is_admin }`.
- `POST /api/feedback` — optional auth with the **full signature**:
  ```
  async def get_optional_user(request: Request,
                              credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
                              db: AsyncSession = Depends(get_db)) -> Optional[User]:
      if "authorization" not in request.headers and "session_token" not in request.cookies:
          return None
      return await get_current_user(request, credentials, db)
  ```
  (`Headers.__contains__` is case-insensitive.) Precedence therefore
  matches every other route in every case — the only divergence is
  "both absent → guest". Body per §3; rate limits **10/h per account**
  (`f"{user.id}:feedback"`), **30/h per guest IP** (`f"feedback:{ip}"` —
  a NAT'd station shares it; intended); `Retry-After` surfaced; `201
  {id}`; `200 {id}` on an idempotent repeat; `409` on a cross-principal
  repeat.
- `GET /api/feedback?limit=50&cursor=<opaque>` — admin only (403); newest
  first; `limit ≤ 100`; cursor is an **opaque base64 of `(created_at,
  id)`** so `+00:00` never hits a query string unencoded.
- `_client_ip` moves to `rate_limit.py`; `auth.py` imports it from there.

## 5. Frontend

- **Settings**, beside the version line: `Send feedback` button. When
  `apiConnected && currentProfile?.email` (the existing cloud
  discriminator, `:465`): on mount call `getFeedbackAccess()`, **swallow
  401/network** (a guest or expired session simply sees no inbox link),
  keep local `isAdmin`; show the account id under the version line so the
  owner can copy it for `ADMIN_USER_IDS`. Local-only profiles show
  neither (their id is not an account). Not in `WorkoutContext`.
- **Modal — exactly two component changes, app-wide (17 call sites):**
  (1) an `isOpen`-keyed effect placed **above** the early return
  (rules of hooks) that stores `document.activeElement`, moves focus into
  the dialog container, and restores it on close; (2) a keydown listener
  for Escape that calls `onClose` — so every caller's existing `onClose`
  guard applies. Plus `role="dialog" aria-modal="true"
  aria-labelledby=<title id>` on the container. No prop additions. The
  overlay/Escape **guard lives in Settings' `onClose`** (the `:513`
  pattern): ignored while sending or while the draft is non-empty.
- **Draft semantics (all three exits defined):** overlay click and Escape
  are ignored while sending or with a non-empty draft; the **X button and
  Cancel close the modal and keep the draft in Settings state**, so
  reopening restores it; the draft is cleared only on success or an
  explicit "Discard" inside the modal.
- Modal content: three category chips; message with counter; "Reply email
  (optional)" prefilled, labelled apart from the signed-in identity; "Your
  app version is included. Kept until it's been acted on." Submit
  disables the button, mints `client_key` once per draft, sends via
  `ApiService.sendFeedback`. **UI states:** 201/200 → success, clear
  draft; **409 → "Already received — start a new message"** (terminal for
  that draft, clears it, since the words are stored); 401 → keep draft,
  "session expired, sign in again"; 429 → keep draft, show the wait;
  network → keep draft, "check your connection". No background retry —
  explicit exception to the `AGENTS.md` queue rule, recorded as such.
- **Inbox** at `/feedback` (`App.jsx` route added): guard via
  `getFeedbackAccess` on mount **and** backend 403; newest first; "Load
  more" via the opaque cursor; escaped React text, newlines preserved,
  long words wrapped.
- **Help page:** one sentence. **Coach knowledge:** one line, same commit.
- **Known limitation:** logged-out users cannot reach Settings; a broken
  login cannot be reported from the login screen.

## 6. Verification

1. **Provisioning (decision Q6, blocks everything below):** a
   PostgreSQL the tests may destroy. Recommended: **install PostgreSQL
   locally** (`winget install PostgreSQL.PostgreSQL`), create database
   `fitness_test`, and `pip install asyncpg pytest pytest-asyncio` into the
   backend environment (`backend/requirements-dev.txt`). Alternatives: a
   throwaway Railway Postgres service reached over the network (costs, and
   lives in the production project), or Docker once installed. **The
   production `Postgres` service is never a test target.**
2. **Harness** (`backend/pytest.ini`, `backend/tests/conftest.py`):
   `TEST_DATABASE_URL` required; host **allowlist** `{localhost,
   127.0.0.1}` unless `TEST_DB_ALLOW_REMOTE=1`; set
   `os.environ["DATABASE_URL"]` to it **before importing `main`** (dotenv
   does not override, and the app's own engine then points at the test
   DB); engine with `poolclass=NullPool` (asyncpg connections are bound to
   the creating loop); `app.dependency_overrides[get_db]` (every router
   uses that single function; no direct `AsyncSessionLocal` use outside
   `database.py:36`); schema via `alembic.command.upgrade(cfg, "head")`
   once per session and `downgrade base` at teardown (so `0011` itself is
   under test); `TRUNCATE … CASCADE` over `Base.metadata.sorted_tables`
   per test; an autouse fixture resetting `_limiter._windows`; cookie
   tests set the cookie on the httpx request; expired-token tests use
   `create_access_token(subject, expires_delta=timedelta(seconds=-1))`;
   `httpx.ASGITransport`.
3. **Fixtures first, red then green:** case-variant password account not
   admin; malformed header alone → 401; malformed header + valid cookie →
   that user; expired → 401; absent → guest 201; flag on no input schema
   (introspect the three); bad `ADMIN_USER_IDS` entry skipped, app
   imports, warning logged when zero valid; account deletion with feedback
   rows (loaded and unloaded) → user and rows gone, guest rows untouched;
   `client_key` repeat same principal → 200 same id, cross-principal →
   409, no-row IntegrityError → 500 not 409; 429 with `Retry-After` and a
   fresh limiter per test; pagination beyond 50 with a `created_at` tie;
   `created_at` never null.
4. Playwright, desktop and 375 px: button beside the version line; modal
   focus enters on open and returns on close; Escape ignored with a
   draft, closes without one; overlay click ignored with a draft; X keeps
   the draft and reopening restores it; success; 409/401/429/network
   states as specified; inbox link absent for non-admin, present for
   admin; inbox renders `<script>` as text; with a rest timer running.
   Console clean.
5. Live: deploy — note push-to-main runs `0011` in production
   immediately via the pre-deploy step (empty table, reversible by
   `downgrade -1`); `/openapi.json` shows the three routes; **owner**
   copies the account id from Settings and sets `ADMIN_USER_IDS`; one
   disposable-account submission and one guest submission; owner opens the
   inbox on the real app; disposable account deleted through the app, row
   confirmed gone.
6. Same commit as the code: `ARCHITECTURE.md` (table, router, routes,
   harness, queue-rule exception), `AGENTS.md:47` zone list,
   `SESSION_START.md:278-282` (still describes S31 as a Google Form),
   `docs/skills/` entry for the harness.

## 7. Decisions for the owner

1. Admin gate = `ADMIN_USER_IDS` Railway variable (recommended) or a DB
   column set by hand.
2. Guests may submit (recommended yes); expired session → "sign in again".
3. Deletion: delete a person's feedback with their account (recommended).
4. Inbox read-only with paging (recommended).
5. Backend test harness as part of this work (recommended — S29's backend
   stages need it too) or a scripted probe.
6. **Where the test database comes from:** install PostgreSQL locally
   (recommended; one `winget` install, reversible), a throwaway Railway
   Postgres, or wait for Docker. Nothing in §6 or §8 can run until this
   exists.
7. Drop the `route` column (recommended) or send a literal `/settings`.

## 8. First commit after clearance

Schema only, inert once deployed: `Feedback` model, `0011_add_feedback.py`
(id `add_feedback`, down `equipment_env_cloud`), the `ARCHITECTURE.md`
row, the `AGENTS.md:47` line. Verified by `upgrade head` / `downgrade -1`
/ `upgrade head` against the test database — **gated on Q6**. Commit
prefix `feat(feedback):`, explicit pathspec.

## 9. Not in scope

Email notifications. Attachments. Replying or triaging from the app.
Reporting from the login screen. Any change to `/me` or `getMe`'s
transport. A retention job. A `route` column.

## 10. Provenance

Rev 1 reviewed by an independent Codex agent: CHANGES-REQUIRED. Rev 2 and
rev 3 reviewed by independent cold Claude agents: CHANGES-REQUIRED (ten,
then nine findings), each verified against source and adopted. Reviewer
transcripts are the proof artifacts.
