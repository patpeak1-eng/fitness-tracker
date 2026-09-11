# Spec — In-app Feedback (S31)

> **STATUS: REVISION 2, 2026-09-10 — rewritten after plan review returned
> CHANGES-REQUIRED. Spec only, no code. Awaiting plan review of this
> revision and the literal "Cleared, proceed with implementation."**
> Owner direction: skip the external form; build it in the app; wording is
> **Feedback**; entry beside the version line in Settings.
>
> **What revision 1 got wrong:** it gated the admin inbox on an email
> allowlist, but registration checks email by exact, case-sensitive
> equality (`routers/auth.py:88-99`, `models.py:28`) and never verifies
> mailbox ownership — so a differently-cased registration could match a
> lowercased allowlist. It also claimed `/me` returns `UserResponse`; it
> returns a hand-built dict with no response model (`auth.py:321,356-362`),
> and the app copies only five fields from it. And it treated the database
> fallback as a ready local DB; it is a placeholder URL. All corrected.

**Zone:** HIGH — new table and migration, new router, a new call in
`src/services/ApiService.js`, and a change to the account-deletion route.
Two-clearance gate applies. No auth-transport change (that is S29's).

---

## 1. Purpose

Users, now including fire-service co-workers, report that something is
broken, could be better, or is missing — from inside the app, with the
build version and route attached automatically. The owner reads reports in
the app, not a database.

## 2. Existing facts, verified 2026-09-10

| Thing | Where | Relevance |
|---|---|---|
| Build id in the UI | `Settings.jsx:486` `FitTrack — {__APP_VERSION__}` | entry point sits beside it |
| `__APP_VERSION__` | `vite.config.js:11-12` from `RAILWAY_GIT_COMMIT_SHA[:7]` or `dev` | attaches automatically |
| Required-auth dependency | `auth.py:84-118 get_current_user` | an optional variant is needed (§4) |
| Rate limiter | `rate_limit.py:66 rate_limit(key, limit, window, current_user=None)`; emits `Retry-After` (`:69-74`); per-process memory, resets on restart (`:7-10`) | reuse; it slows loops, it is not an abuse guarantee |
| Client IP | `routers/auth.py:59-72 _client_ip`; leftmost XFF, trusts proxy sanitisation | reuse for guest limiting; never persist it |
| `/me` | `auth.py:321` no `response_model`; returns a dict (`:356-362`); client copies only id/name/color/avatar/email (`WorkoutContext.jsx:~526-542`); `getMe` is cookie-only (`ApiService.js:70-77`) | **not** used for the admin flag — see §4 |
| `UserResponse` / `ProfileUpdate` | `schemas.py:75-92` and `:100-117`, independent; profile PUT iterates `payload.model_dump(exclude_unset=True)` then `setattr` (`routers/profile.py:45-50`) | admin flag must never appear on any input schema |
| Migrations | latest file `0010_add_equipment_environments.py`, **revision id `equipment_env_cloud`**, down `add_date_of_birth` | `0011` must set `down_revision = "equipment_env_cloud"` |
| Account deletion | `routers/auth.py:~381-406`, docstring says every FK cascades; `User` relationships use `cascade='all, delete-orphan'` (`models.py:46-99`) | §3 decides feedback's behaviour explicitly |
| Deletion promise in UI | `Settings.jsx:471,536-538`: "your account and all its cloud data" | feedback must not contradict it |
| Local DB | `database.py:17-22` falls back to `postgresql+asyncpg://user:pass@localhost:5432/fitness` — a placeholder, nothing listens | local verification needs a disposable Postgres (§6) |
| Previous-route mechanism | none — `Layout.jsx` has no location tracking; `BackButton` uses `navigate(-1)` | small tracker added (§5) |
| Settings modals | logout and account deletion, separate booleans (`Settings.jsx:~495,511`) | feedback modal is a third, never simultaneous |
| Existing feedback path | none | greenfield |

## 3. Data model and deletion contract

Table `feedback`:

| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `user_id` | UUID fk `users.id`, nullable, **`ON DELETE CASCADE`** | null for guests |
| `category` | `Literal["broken","improve","idea"]` in the schema; string in DB | |
| `message` | text; trimmed, non-blank, 1–2000 chars, validated server-side | |
| `contact_email` | string(254), nullable; blank → null; validated | optional reply address |
| `app_version` | string(16), 1–16 chars | |
| `route` | string(64); pathname only, no query/hash | |
| `user_agent` | string(256); truncated server-side | diagnostic text, not identity |
| `client_key` | string(36); per-draft idempotency key | a retry after an ambiguous network result does not duplicate |
| `created_at` | timestamptz, server default | |

**Deletion contract (decided here, not inferred):** deleting an account
deletes that account's feedback, contact address included — consistent
with the promise the app already makes. Implemented by the FK action; no
`User.feedback` relationship is declared, so SQLAlchemy's delete-orphan
pattern is not involved and cannot pre-empt the FK. The deletion-route
docstring is updated to say so. Guest feedback has no account and is kept
until the owner removes it from the database; the modal says "Kept until
it's been acted on." No retention job in this pass.

This **is** user data. The zone table's user-data list gains `feedback`.

## 4. Backend

New router `backend/app/routers/feedback.py`.

- **Admin identity: `ADMIN_USER_IDS`**, a comma-separated Railway variable
  of account UUIDs — the owner's already-verified, immutable id. Parsed
  and validated once at import; malformed → fail loudly; empty → nobody is
  admin. One server-side predicate `is_admin(user)` used by *both* the
  capability endpoint and inbox authorisation. Never a column on an input
  schema, never from the request body, never from the client.
  (If an environment variable is unwanted: a server-controlled `is_admin`
  DB column defaulting false, absent from every input schema. Email
  allowlists are rejected.)
- `GET /api/feedback/access` — required auth via `apiFetch`, returns
  `{ is_admin }`. This is how the frontend learns to show the inbox link.
  It deliberately does **not** touch `/me` or `getMe`'s transport — fixing
  that transport is S29's job and doing it here activates S29's
  scope-switch hazard. The flag is display-only; authorisation is
  re-checked on every inbox request.
- `POST /api/feedback` — body `{category, message, contact_email?,
  app_version, route, client_key}`. **Optional auth, precisely:** a new
  `get_optional_user` returns `None` **only when neither transport is
  present** (checks actual header/cookie presence — `HTTPBearer(
  auto_error=False)` would classify a malformed header as absent, so
  presence is checked directly). A present-but-invalid or expired
  credential, or a deleted user → **401**; infrastructure errors stay
  errors; nothing is retried under another identity or silently as a
  guest. Two valid differing credentials follow `get_current_user`'s
  Bearer precedence; attribution uses that principal, never
  `currentProfile.email`. Idempotent on `client_key` per submitter (or per
  IP for guests): a repeat returns the existing `id` with 200.
  Rate limits: **10/hour per authenticated account**, **30/hour per guest
  IP**, `Retry-After` surfaced to the UI. Returns `201 {id}`.
- `GET /api/feedback?limit=50&before=<created_at>` — admin only (403
  otherwise); newest first; `limit` max 100; cursor by `created_at`, so
  reports beyond the first page stay readable. Each row includes the
  submitter's email/name when `user_id` resolves, or `guest`.

## 5. Frontend

- **Settings**, beside the version line: `Send feedback` → modal (reuses
  `Modal`; its own boolean; never open alongside the logout or deletion
  dialogs; focus restored on close). Three category chips; message field
  with counter (2000); optional email prefilled from the profile and
  labelled "Reply email (optional)" separately from who you are signed in
  as; the line "Your app version and screen are included. Kept until it's
  been acted on." Submit disables the button, generates the draft's
  `client_key` once, sends via a new `ApiService.sendFeedback`. Success
  only on 201/200. On 401: keep the draft, say the session has expired,
  offer sign-in. On 429: keep the draft, show the wait. On network failure:
  keep the draft, "Couldn't send — check your connection and try again."
  **Explicit exception to the queue rule in `AGENTS.md`:** feedback is not
  enqueued for background retry; silently resending a person's words later
  is worse than telling them it failed. Recorded as a deliberate exception,
  not a claim that this is not a data push.
- **Anonymous send** for a signed-in user is not offered in this pass.
- **Route capture:** a small tracker in `Layout.jsx` snapshots the prior
  distinct pathname on entry to `/settings` and passes it through Outlet
  context; pathname only; stable across re-renders and StrictMode; defaults
  to `/settings` on direct load. `Dashboard.jsx:80`'s navigation to
  Settings needs no change.
- **Known limitation:** explicitly logged-out users cannot reach Settings
  (`App.jsx:53`), so a broken *login* cannot be reported from the login
  screen. Accepted for this pass; noted in the Help page text.
- **Inbox** `/feedback` (admin only; page guard *and* backend 403): list,
  newest first, "Load more" via the cursor. Every field rendered as escaped
  React text — no raw HTML, no Markdown — with newlines preserved and long
  words wrapped. Columns: category chip, message, who (email or guest),
  reply email if given, version, route, date.
- **Help page:** one sentence pointing at Settings → Send feedback.
- **Coach knowledge:** one line in the APP KNOWLEDGE block, same commit.
- **Verify with an active rest timer** — `Layout` renders
  `RestTimerOverlay`; the modal must not fight it.

## 6. Verification

1. **Local backend against a disposable local PostgreSQL** with an
   explicit `DATABASE_URL` set for both the app and Alembic, checked
   before running anything — never the production URL, and `load_dotenv`
   must not be allowed to pick it up. Run `0011`; confirm `down_revision`
   resolves; run it down and up.
2. **Fixtures first (red, then green):** case-variant password account is
   **not** admin; malformed/expired/invalid token → 401 not guest; absent
   credentials → guest 201; `is_admin` absent from every input schema
   (assert by introspecting `ProfileUpdate`, `UserRegister`,
   `FeedbackCreate`); account deletion with feedback rows present, both
   loaded and unloaded → user gone, rows gone, guest rows untouched;
   `client_key` repeat → same id; rate limit returns 429 with
   `Retry-After`; pagination beyond 50.
3. Playwright, desktop and 375 px: button beside the version line; modal
   opens; success; 401/429/network states keep the draft; inbox link
   absent for non-admin, present for admin; inbox renders a message
   containing `<script>` as text; with a rest timer running. Console clean.
4. Live: deploy; `/openapi.json` shows the three routes; migration
   confirmed applied; owner sets `ADMIN_USER_IDS` (a production
   environment change — the owner's action, with the value supplied by the
   builder from the owner's own `/me`); one disposable-account submission
   and one guest submission; owner opens the inbox on the real app and
   sees both; disposable account deleted through the app and its row
   confirmed gone.
5. `docs/ARCHITECTURE.md`: table, router, routes, zone-list addition, and
   the queue-rule exception — same commit as the code.

## 7. Decisions for the owner

1. **Admin gate = `ADMIN_USER_IDS` Railway variable** holding your account
   UUID (recommended) — or a DB column set once by hand? Either is a
   one-time action only you can take; the variable is the one that never
   touches your user row.
2. **Guests may submit** (recommended yes) — with the precise rule that an
   *expired* signed-in session is told to sign in again rather than
   silently submitted as a guest.
3. **Deletion contract:** delete a person's feedback when they delete
   their account (recommended — it is what the app already promises), or
   keep feedback after deletion with a disclosure and a retention period?
4. Inbox read-only, with paging. Recommended.

## 8. Not in scope

Email notifications (no mail service). Attachments. Replying from the app.
Deleting or triaging feedback from the app. Reporting from the login
screen. Any change to `/me` or to `getMe`'s transport.

## 9. Provenance

Plan-reviewed once by an independent top-tier Codex agent (Traycer agent
`6554b7a8-2a8a-48e1-90fc-712cc438aa64`), read-only, 2026-09-10:
CHANGES-REQUIRED; all findings verified against source and adopted here.
