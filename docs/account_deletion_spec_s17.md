# SPEC — Account Deletion (S17, SPEC ONLY — NOT IMPLEMENTED)

**Status:** Awaiting coordinator clearance. No code written. HIGH zone —
auth + user data + irreversible action. Implementation is its own future
session with the standard two-stage clearance pattern (same as the S16
experience-level column).

**Motivation:** Two disposable test accounts from S16 coach-calibration
testing remain on the live backend. No delete mechanism exists at any layer.
This spec turns that into a real, permanent feature rather than a one-off
cleanup.

---

## 1. Current State (verified against source, 2026-07-14)

- **No delete-account endpoint exists.** `backend/app/routers/auth.py` has
  register/login/google/google-callback/me/logout only. `profile.py` has
  GET/PUT only. No router exposes any user deletion.
- **No frontend surface exists.** Settings has "Switch profile" (local
  logout) only; nothing touches the backend account.
- **No admin/manual path exists** short of raw SQL against the Railway
  Postgres instance.

## 2. Cascade Audit (models.py + alembic, verified)

Every table with a `user_id` FK already has **DB-level
`ON DELETE CASCADE`** (created in migration `0001_initial_schema.py`;
`coach_messages` in `0003_add_coach_messages.py`) AND ORM-level
`cascade="all, delete-orphan", passive_deletes=True` on the `User`
relationships:

| Table | FK CASCADE (DB) | ORM cascade | Migration |
|---|---|---|---|
| user_stats | ✅ | ✅ | 0001 |
| workout_history | ✅ | ✅ | 0001 |
| active_workout | ✅ | ✅ | 0001 |
| assessments | ✅ | ✅ | 0001 |
| weight_history | ✅ | ✅ | 0001 |
| custom_templates | ✅ | ✅ | 0001 |
| custom_exercises | ✅ | ✅ | 0001 |
| coach_messages | ✅ | ✅ | 0003 |

**Conclusion: deletion needs NO new migration and NO per-table cleanup.**
A single `await db.delete(user); await db.commit()` (or
`DELETE FROM users WHERE id = :id`) removes the user and all eight child
tables atomically in one transaction. That is the entire data path.

## 3. Endpoint Design

```
DELETE /api/auth/account          (auth.py — keeps all account-lifecycle
                                   routes in one router)
Auth:   Depends(get_current_user) — both transports (Bearer or cookie) for free
Body:   { "password": "<string, optional>", "confirm": "<string>" }
204     on success (+ delete_cookie session_token, samesite="none", secure)
401     wrong/missing password
400     confirm string missing/wrong
```

**Re-confirmation (server-enforced, not just UI):**
- **Local (email/password) user** (`hashed_password` is a real hash):
  `password` field REQUIRED and verified with `verify_password()`. A stolen
  session alone cannot delete the account.
- **Google OAuth user** (`hashed_password == "google_oauth_no_password"`
  sentinel — no password exists to re-enter): require the literal typed
  string `confirm: "DELETE"` in the body. This is the strongest
  server-checkable factor available without adding a fresh-OAuth-reauth
  flow, which is out of scope for v1.
- Both cases also require the typed `"DELETE"` confirm string (uniform
  contract; password is the additional factor for local users).
- Rate-limit the route like login (`app/rate_limit.py`) to blunt abuse of
  the password-verification oracle.

## 4. Frontend

- **Location:** Settings → new bottom `Group title="Danger zone"`, below
  everything else. Single red row action "Delete account…". Rendered ONLY
  for cloud-backed profiles (`currentProfile.email` present — mirrors the
  `canSyncToBackend` gate). Local device profiles already have deletion via
  `/profiles` and must not see this (their data never reaches the backend).
- **Confirmation modal** (uses `common/Modal`, higher-stakes than "End
  Workout"):
  - Title: "Delete account permanently" (danger color, not ember).
  - Body copy enumerates exactly what is destroyed: workout history,
    assessments, weight history, custom templates/exercises, coach
    conversation, profile/stats — "This cannot be undone. Your local data
    on this device is not affected unless you also delete the local
    profile."
  - Typed-confirmation input: button stays disabled until the user types
    `DELETE`. Local users additionally get a password field.
  - Confirm button styled `--danger` (#E5484D per DESIGN_TOKENS.md), NOT
    the ember primary; requires the input gate, no default focus.
- **After 204:** clear auth token (`StorageService`), clear synced flags,
  `switchProfile(null)` → back to /login. Local-only data handling: leave
  local profile data intact (explicitly stated in the modal), deleting it
  is the user's separate choice via /profiles.

## 5. OAuth Users vs Local Users

- **Local user:** password re-entry (Section 3). Done.
- **Google OAuth user:** the backend stores NO Google tokens (the callback
  uses the access token transiently and discards it), so there is **no
  grant to revoke server-side**. The Google-side consent grant remains
  listed in the user's Google account settings ("Third-party apps &
  services") until the user removes it themselves — the modal copy should
  say so. Optional future enhancement (NOT v1): call
  `https://oauth2.googleapis.com/revoke` during an OAuth-fresh reauth
  delete flow.
- If a deleted OAuth user signs in with Google again, the callback's
  find-or-create path simply creates a fresh empty account — acceptable
  and arguably desirable behavior; no code change needed.

## 6. Zone Classification & Risk

**Unconditionally HIGH** — touches `routers/auth.py` (auth logic), destroys
user data irreversibly, and modifies session handling (cookie clear).
Hard-stop rules apply: spec → clearance → implementation → diff in chat →
"Cleared, proceed with commit".

Risks:
- *Wrong-account deletion:* mitigated by server-side password/confirm
  factors + typed UI gate + danger styling.
- *Partial deletion:* not possible — single-transaction DB cascade
  (Section 2).
- *CSRF on cookie transport:* DELETE with a required JSON body is not
  sendable via form-CSRF; FastAPI already only reads the cookie, and
  SameSite=None cookie + JSON body + CORS allow-list on the backend
  restrict cross-origin calls. Verify CORS config during implementation.
- *Test blast radius:* verify with a disposable account first
  (per standing disposable-account practice); NEVER against Patrick's
  account.

## 7. Files Touched (implementation session)

| File | Change |
|---|---|
| `backend/app/routers/auth.py` | `DELETE /api/auth/account` route (~40 lines) |
| `backend/app/schemas.py` | `AccountDeleteRequest { password: str \| None, confirm: str }` |
| `backend/app/rate_limit.py` | (reuse existing helpers; possibly new LIMIT consts) |
| `src/services/ApiService.js` | `deleteAccount(body)` via `apiFetch` (HIGH-zone file) |
| `src/pages/Settings.jsx` | Danger-zone group + confirmation modal |
| `src/pages/Settings.css` | Danger-zone styles (tokens: `--danger`) |
| `docs/ARCHITECTURE.md` | Section 7 route inventory update (same commit) |

No migration. No models.py change. No WorkoutContext change (logout path
already exists via `switchProfile(null)`).

## 8. Acceptance Criteria (for the implementation session)

1. Disposable test account deleted end-to-end from the live UI; `/me`
   returns 401 afterward; all 8 child-table row counts for that user hit 0.
2. Wrong password → 401, account intact. Missing confirm → 400, intact.
3. OAuth-user path verified with a throwaway Google account or mocked
   sentinel user.
4. Local-profile users never see the entry point.
5. The two S16 disposable accounts removed using the new feature.
