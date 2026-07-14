# SPEC — OAuth state/nonce/PKCE Hardening (S17, SPEC ONLY — NOT IMPLEMENTED)

**Status:** Awaiting coordinator clearance. No code written. HIGH zone —
auth flow. Implementation is its own future session.

---

## 1. Actual Current Status (audited directly from
`backend/app/routers/auth.py` `/google` + `/google/callback`, 2026-07-14)

The ARCHITECTURE.md tech-debt entry ("state/nonce/PKCE — open, never
actioned") is **partially stale**. Session 8's claim is confirmed: state IS
implemented.

| Mechanism | Status | Evidence |
|---|---|---|
| **state** (CSRF) | ✅ **IMPLEMENTED and validated** | `google_login` generates `secrets.token_hex(32)`, stores it in an `oauth_state` HttpOnly cookie (Secure, SameSite=Lax, 10-min TTL) and sends it to Google; `google_callback` rejects unless `?state` exactly matches the cookie, then deletes the cookie. Correct pattern, no gaps found. |
| **nonce** (ID-token replay) | ❌ Not implemented — **but currently N/A** | Nonce exists to bind an `id_token` (JWT from Google) to a session. This flow **never uses the id_token at all**: it exchanges the code, takes only `access_token`, and fetches identity from the `userinfo` endpoint over TLS. There is no ID-token validation for a nonce to protect. It becomes REQUIRED only if the flow ever switches to trusting `id_token` claims directly. |
| **PKCE** (code interception) | ❌ **Not implemented — the one real gap** | No `code_challenge`/`code_verifier` in the auth request or token exchange. This is a confidential client (server holds `client_secret`, code is exchanged server-side), so interception risk is already low — but PKCE is current best practice (RFC 9700 recommends it even for confidential clients) and Google supports it transparently. |

**Net finding:** the only genuinely missing hardening is PKCE. Nonce is a
conditional future requirement documented here so nobody re-audits from
scratch.

## 2. Implementation Plan (PKCE, S256)

Small, self-contained diff in `google_login` + `google_callback`:

1. `google_login`:
   - `code_verifier = secrets.token_urlsafe(64)` (43–128 chars, spec-legal).
   - `code_challenge = base64url(sha256(code_verifier))` without padding
     (`hashlib` + `base64.urlsafe_b64encode(...).rstrip(b"=")` — stdlib only,
     no new dependency).
   - Append `&code_challenge=<...>&code_challenge_method=S256` to the
     Google auth URL.
   - Store the verifier alongside state in a second HttpOnly cookie
     `oauth_verifier` (same attributes as `oauth_state`: Secure,
     SameSite=Lax, max_age=600).
2. `google_callback`:
   - Read `oauth_verifier` cookie; treat missing verifier exactly like a
     state mismatch (`/login?error=auth_failed`).
   - Add `"code_verifier": verifier` to the token-exchange POST body.
   - Delete the `oauth_verifier` cookie in the success response (mirror the
     existing `oauth_state` deletion).

**Redirect URI / Google console changes: NONE.** PKCE parameters ride the
existing authorization request and token exchange; `GOOGLE_REDIRECT_URI`
and the console registration are untouched. No frontend changes — the flow
shape is identical from the browser's perspective.

**Nonce (deferred, documented):** do NOT add now — there is no id_token
validation to bind it to, so it would be dead ceremony. If a future change
starts consuming `id_token`, that change must add `nonce` (cookie-stored,
claim-verified) in the same commit, plus full signature/issuer/audience
validation via Google's JWKS.

## 3. Risk If Shipped Incorrectly

- A broken verifier round-trip fails **closed** (Google rejects the token
  exchange; user lands on `/login?error=auth_failed`) — bad UX, not a
  security hole. Still: **every Google login for every user breaks at
  once** if the cookie name/attributes are wrong, which is why this is
  HIGH zone regardless of the ~25-line diff.
- Cookie attribute pitfalls: `oauth_verifier` must use the exact same
  Secure/SameSite=Lax attributes as `oauth_state` (that pair is proven to
  survive the Google redirect chain in production).
- Must be verified on the live Railway deployment with a throwaway Google
  account before being considered done — localhost cannot fully exercise
  the Secure-cookie redirect chain.

## 4. Zone Classification

**Unconditionally HIGH** — `backend/app/routers/auth.py`, authentication
flow. Hard-stop discipline: this spec → coordinator clearance →
implementation diff in chat → "Cleared, proceed with commit" → deploy →
live OAuth verification with a disposable account.

## 5. Files Touched (implementation session)

| File | Change |
|---|---|
| `backend/app/routers/auth.py` | PKCE in `google_login` + `google_callback` (~25 lines, stdlib only) |
| `docs/ARCHITECTURE.md` | Section 7 auth notes + tech-debt row update (same commit) |

No migration, no schema change, no frontend change, no env-var change.

## 6. Acceptance Criteria (for the implementation session)

1. Live Google login succeeds end-to-end on Railway with PKCE active
   (throwaway account).
2. Tampered/missing verifier → clean `auth_failed` redirect, no 500s.
3. Existing state validation still passes (regression check).
4. ARCHITECTURE.md tech-debt row updated: state ✅ (S8), PKCE ✅ (this
   change), nonce documented-N/A.
