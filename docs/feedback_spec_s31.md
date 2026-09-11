# Spec — In-app Feedback (S31)

> **STATUS: DRAFT, spec only, no code. Awaiting plan review and the literal
> "Cleared, proceed with implementation."**
> Owner direction (2026-09-10): skip the external form; build it in the app.
> Wording is **Feedback**, not "bug report". Entry point beside the version
> line in Settings.

**Zone:** HIGH — new database table and migration, a new backend router, an
addition to `UserResponse`, and a new call in `src/services/ApiService.js`.
Two-clearance gate applies. No auth logic, no user-data table, and no
existing route changes.

---

## 1. Purpose

Users — now including fire-service co-workers — need a way to tell the owner
that something is broken, could be better, or is missing, without leaving
the app. The owner needs a way to read those reports without opening a
database. The report must carry the build version and device details so the
owner never has to ask "which version were you on?".

## 2. Existing facts, verified 2026-09-10

| Thing | Where | Relevance |
|---|---|---|
| Build id in the UI | `Settings.jsx:486` renders `FitTrack — {__APP_VERSION__}` | the Feedback entry sits beside it; version attaches automatically |
| `__APP_VERSION__` | `vite.config.js:11-12`, from `RAILWAY_GIT_COMMIT_SHA[:7]` or `dev` | already exists; nothing to add |
| Auth dependency | `backend/app/auth.py:84 get_current_user` — required auth only | guest submissions need an *optional* variant (§4) |
| Rate limiting | `backend/app/rate_limit.py:66 rate_limit(key, limit, window)`; login uses 10/60 s | reuse for POST, keyed by client IP |
| Client IP helper | `_client_ip(request)` in `routers/auth.py` | reuse; do not reimplement |
| Migration naming | `alembic/versions/0010_add_equipment_environments.py` is the latest | next is `0011_feedback`; revision id must stay under 32 chars |
| `UserResponse` | `schemas.py:75-89` | gains `is_admin: bool = False` |
| Frontend API client | `ApiService.js:16 apiFetch` sends Bearer-or-cookie | one new `sendFeedback`, one new `getFeedback` |
| Local backend | `database.py:17-18` falls back to a local DB when `DATABASE_URL` is unset | full local verification is possible before touching production |
| Existing feedback path | none — the only matches for "feedback" in `src/` are UI save-state names | greenfield |

## 3. Data model

New table `feedback`:

| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `user_id` | UUID fk `users.id`, **nullable**, `ON DELETE SET NULL` | null for guests; account deletion keeps the report but detaches it |
| `category` | enum-like string: `broken` / `improve` / `idea` | validated in the schema, not the DB |
| `message` | text, 1–2000 chars | |
| `contact_email` | string, nullable | optional; prefilled from the profile when signed in |
| `app_version` | string(16) | from `__APP_VERSION__` |
| `route` | string(64) | the in-app path the user was on when they opened Feedback |
| `user_agent` | string(256) | from the request header, server-side |
| `created_at` | timestamptz, server default | |

No status/triage column in this pass (§7 Q3). Adding one later is an
additive migration.

`user_id` is **not** in the HIGH-zone user-data list by name, but the table
references `users` and the account-deletion cascade must be checked: the
spec's position is `SET NULL`, so deleting an account never deletes its
feedback and never fails because of it.

## 4. Backend

New router `backend/app/routers/feedback.py`, registered like the others.

- `POST /api/feedback` — body `{category, message, contact_email?, app_version, route}`.
  Auth **optional**: a new `get_optional_user` dependency that returns the
  user when a valid Bearer/cookie is present and `None` otherwise, without
  raising. Rate limited `rate_limit(f"feedback:{ip}", 5, 3600)` — five per
  IP per hour, generous for humans, closed to loops. Stores `user_agent`
  from the header. Returns `201 {id}`.
- `GET /api/feedback?limit=50` — **admin only**; newest first. Returns each
  row plus the submitter's email/name when `user_id` resolves.
- **Admin gate:** `is_admin = user.email.lower() in ADMIN_EMAILS`, where
  `ADMIN_EMAILS` is a comma-separated Railway variable. Computed, never
  stored, so there is no column to migrate and no account row to edit.
  Setting that variable is a **production environment change** and is the
  owner's action (§7 Q1).
- `UserResponse.is_admin` is added so the frontend can show the inbox entry
  only to admins. `/me` already returns `UserResponse`; the generic profile
  PUT ignores unknown fields, so `is_admin` cannot be set from the client.

## 5. Frontend

- **Settings** (`Settings.jsx`, beside the version line): a `Send feedback`
  button opening a modal — three category chips, a message field with a
  live counter, an optional email prefilled from the profile, and a one-line
  note "Your app version and device type are included automatically." On
  send: success toast; on failure, the message stays in the field with
  "Couldn't send — check your connection and try again." No queueing: this
  is not a data push, and silently retrying a user's words later is worse
  than telling them it failed.
- **Route capture:** the modal records the path the user was on when they
  navigated to Settings, via a tiny "previous route" ref in `Layout.jsx`
  (falls back to `/settings`).
- **Inbox** (`/feedback`, admin only): a list, newest first — category chip,
  message, who (email or "guest"), version, route, date. Link to it appears
  in Settings only when `/me` says `is_admin`. Route guard on the page
  itself too — hiding the link is not authorization; the backend rejects
  non-admins with 403 regardless.
- **Help page:** one sentence at the bottom of the Feature Guide pointing
  at Settings → Send feedback.
- **Coach knowledge:** one line added to the APP KNOWLEDGE block
  ("Feedback: Settings → Send feedback reports a problem or idea to the
  owner") — required by SINGLE_ARCHITECTURE_DOC_RULE.

## 6. Verification

1. Local backend with the fallback DB: run the migration, submit as guest,
   as a signed-in disposable user, and 6× in an hour from one IP (6th is
   429). Confirm `SET NULL` by deleting the disposable account and reading
   the row back.
2. `GET /api/feedback` as non-admin → 403; as an address in `ADMIN_EMAILS` →
   200 with the rows.
3. Playwright, desktop and 375 px: Settings shows the button; modal opens;
   send succeeds; failure state renders when the API is blocked; inbox link
   absent for non-admin, present and populated for admin. Console clean.
4. Live: deploy, `/openapi.json` shows `/api/feedback`, migration confirmed
   applied, one disposable-account submission, one guest submission; owner
   opens the inbox on the real app and sees both. Test rows are deleted
   through the DB by the owner or left as the first two entries — there is
   no delete endpoint and this spec does not add one.
5. `docs/ARCHITECTURE.md`: new table, new router, new route, same commit.

## 7. Decisions for the owner

1. **Admin gate via a Railway variable** `ADMIN_EMAILS` holding your Google
   sign-in address (recommended: no schema, no editing your user row) — or
   an `is_admin` column set once in the database? Either way the first
   admin is a one-time action only you can take.
2. **Accept feedback from guests** who use the app without an account?
   Recommended yes, rate-limited; co-workers who have not signed up yet are
   exactly who will hit problems first.
3. **Inbox is read-only in this pass** — no "mark as done", no reply from
   the app. Recommended; add triage if the inbox actually fills.

## 8. Not in scope

Email notifications (no mail service exists; adding one is its own
decision). Screenshots or attachments. Replying to users from the app.
Deleting feedback from the app.
