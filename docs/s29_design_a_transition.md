# S29 Design A — Account/scope transition state machine

> C0 design document. No code. Companion to `profile_identity_spec_s29_v2.md`
> (revision 5) §6 items 1, 4, 5. Cross-reviewed with Design B (dispatch
> protocol, Codex-authored) and Design C (restore transaction). Every claim
> about current behaviour is anchored to a line read on 2026-09-10 at
> `9cb2883`; anything not verified is marked *(unverified)*.

## 1. Vocabulary (shared with B and C)

| Term | Meaning |
|---|---|
| **principal** | the account UUID a *validated* credential resolves to, or `null` |
| **principalSource** | `'bearer' \| 'cookie' \| null` — which transport produced it; backend precedence is Bearer over cookie (`backend/app/auth.py:103`: `credentials.credentials if credentials else request.cookies.get("session_token")`) |
| **scope** | the localStorage id under which data keys live (`scopedKey`, `StorageService.js:91`; base keys `:43-67`) — today `profile.id` |
| **binding** | `accountId → scopeId`, exclusive both ways, with **provenance** (§3) |
| **bindingStatus** | `'trusted' \| 'unbound' \| 'conflict'` for the *selected* scope against the *current* principal |
| **sessionGeneration** | monotonically increasing integer bumped on every transition that changes principal, scope, or logout state; an `AbortSignal` is tied to it |
| **authState** | `'authenticated' \| 'expired' \| 'loggedOut' \| 'none'` |
| **crossTabSafe** | `'locks' in navigator`; when false, automatic cloud dispatch is disabled (Design B fallback) |

A exposes one read-only object to B, C, and the UI:
`{ principal, principalSource, scopeId, bindingStatus, sessionGeneration, authState, crossTabSafe, signal }`.

## 2. Current behaviour this replaces (anchored)

- `currentProfile` is initialised from the stored list and `currentProfileId`
  unless `isLoggedOut()` (`WorkoutContext.jsx:306-318`); `refreshGlobalState`
  (`:491-503`) then re-selects `lastId || profilesData[0]` **without**
  consulting the marker. Two selection paths, one of them unguarded.
- The boot auth check (`:513-560`) calls cookie-only `getMe`
  (`ApiService.js:70-77`); on a different id it **replaces the list and
  selects the cloud profile** (`:535-540`); on a same-id field drift it
  rewrites the list (`:548`); then `SyncQueue.flush()` (`:555`) with
  whatever credentials exist. Neither branch calls `setProfiles`.
- `canSyncToBackend` (`:327-332`) gates on `authChecked && profile.email &&
  API configured` — the presence of an email, not a validated principal.
- Pull (`refreshProfileData`, `:578-`) guards completion writes only by
  `latestProfileIdRef.current !== profile.id` (`:698`) — scope, not account.
- Sign-out (`Profile.jsx:56-78`) awaits `/api/auth/logout`, **then** clears
  the token, sets the marker, empties the list, removes `currentProfileId`,
  and hard-navigates.
- OAuth completion is a backend 302 to `${frontend_url}/`
  (`routers/auth.py:~314`); `AuthCallback.jsx` only redirects and is not on
  the real path. There is no client-side "deliberate login completed" event
  for OAuth today.
- Marker helpers: `setLoggedOut/isLoggedOut/clearLoggedOut`
  (`StorageService.js:471-481`); token helpers `:459-469`.

## 3. Binding provenance (the rule revision 4 got wrong)

A binding `accountId → scopeId` is **trusted** only if it was created by:

1. **Allocation** — the upgraded client creates a *new, empty* scope
   during a validated-account transition (first sign-in of an account on
   this device after stage 1). Recorded with `provenance: 'allocated'`,
   the generation, and a timestamp.
2. **Inheritance** — an already-trusted binding read from the bindings
   store (never from a backup — Design C quarantines those).
3. **Adoption** — the user explicitly authorises, on the recovery screen,
   copying selected *unbound* data into the **current verified** account.
   Recorded with `provenance: 'adopted'`, the source scope id, and the
   generation. Out of scope for stage 1's read-only recovery; the record
   format is defined now so C3/C6 do not invent it.

Exclusivity: one account has at most one trusted scope; one scope has at
most one trusted account. Any write that would violate exclusivity is
refused and surfaced as `conflict`.

**Never** provenance: co-presence (a principal validated while some scope
was selected), an email or name match, a single-entry list, "whichever
credential happens to be present", a `cloud_<timestamp>` suffix, or a
backup's own claim.

## 4. States and transitions

States are `(authState, principal, scopeId, bindingStatus)`.

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| any | **boot** | — | resolved per §5 | no binding writes; no list rewrite; no scope re-selection without a trusted binding |
| `none`/`expired` | **deliberate login** (password via identity-v1 endpoints, or OAuth completion detected per §6) | credential validated; contract satisfied | `authenticated` | bump generation; `clearLoggedOut()`; look up binding for principal → if trusted, select that scope; if none, **allocate** (§3.1); if the currently selected scope is unbound, it stays unbound and reachable in recovery — it is **not** adopted |
| `authenticated` | **/me refresh** returns same principal | — | same | field drift updates `currentProfile` display fields and `setProfiles` from the returned list; no scope change |
| `authenticated` | **/me refresh** returns a *different* principal (cookie changed in another tab) | — | `authenticated`, new principal | bump generation (aborts in-flight); select the new principal's trusted scope or allocate; previous scope untouched |
| `authenticated` | request gets **401** | — | `expired` | bump generation; keep scope selected (local-first, `:559-563` comment preserved); dispatch paused; banner (existing `SyncQueue` auth-expired path) |
| any | **explicit logout** | user action | `loggedOut` | **synchronously**: `setLoggedOut()`, `clearAuthToken()`, bump generation (aborts everything), clear `currentProfileId`, `principal = null`; keep list, bindings, scopes, hold; **then** `await` cookie logout; **then** navigate |
| `loggedOut` | late `/me` success, surviving cookie, late logout-cookie response | — | `loggedOut` | ignored — generation mismatch; marker is authoritative until a deliberate login |
| `loggedOut` | deliberate login | as above | `authenticated` | as above |
| any | **backup restore** (Design C) | — | unchanged until C's gate passes | never changes principal or scope by itself |

Invariant checked in tests: **no transition other than deliberate login
or adoption writes a binding; no transition other than deliberate login,
trusted-binding lookup, or allocation changes `scopeId`.**

## 5. Boot resolution (replaces both selection paths)

1. Read marker. If `isLoggedOut()`: `authState = 'loggedOut'`, `scopeId =
   null`, render the login gate. Do not select `profilesData[0]`. Do not
   call `/me`. (Fixes 3.3: the marker is consulted regardless of list
   length; `getOrCreateProfiles`' empty-list special case is removed from
   the decision.)
2. Else read stored `currentProfileId` and the bindings store. Select the
   stored scope **if** it exists in storage (discovery, spec §6 item 2) —
   local-first, no network needed. `bindingStatus` is computed against
   whatever principal later resolves.
3. Resolve principal: `getMe` with Bearer **and** cookie (transport fix
   ships only in C4, with everything below). Outcomes:
   - no credential → `authState 'none'`; stay local.
   - 401 → `'expired'`; stay local; dispatch paused.
   - principal P → `'authenticated'`; look up binding(P):
     - trusted and equals selected scope → `trusted`; proceed.
     - trusted and differs from selected scope → select the trusted scope
       (the stored selection was stale); the previously selected scope is
       untouched.
     - none → if the selected scope is *itself* unbound and this device has
       **never** had a trusted binding for P, **allocate** a new empty
       scope for P and select it; the unbound scope stays reachable in
       recovery. Never bind P to the pre-existing scope.
     - selected scope bound to a different account → `conflict`; keep it
       selected for local use, **all** cloud dispatch and pulls fail
       closed, banner explains.
4. Only after 3 resolves does any pull or flush run, and only with
   `bindingStatus === 'trusted'`, under the generation captured at step 3.

Legacy `cloud_<timestamp>` scopes are unbound by definition after
migration (no provenance can be manufactured for them). The consequence
for an existing password user — an empty new scope on first upgraded
sign-in, with their prior data in recovery — is deliberate, and their
cloud-synced history re-pulls into the new scope. Unsynced local data is
*not* lost; it is in recovery (spec §5). This is stated to the owner in
the C0 summary because it is the one user-visible consequence.

## 6. Deliberate login detection

- **Password**: the identity-v1 endpoints (spec §4) return `user_id`; the
  client transition runs in the login handler, replacing
  `activateProfileAndGo` (`Login.jsx:29-35`), which today replaces the list.
- **OAuth**: the backend 302 lands on `/`. Detection: the backend sets a
  short-lived, non-HttpOnly **login-intent cookie** (or a `?login=1` marker
  stripped on read — *(choice for cross-review)*) alongside the session
  cookie; boot consumes it exactly once as "deliberate login" and clears
  the logout marker **only** in that path. A session cookie without the
  intent marker is treated as a *surviving* cookie and cannot clear
  `loggedOut`.
- "Continue without account" (`Login.jsx:105-114`) is a deliberate
  transition to `authState 'none'` with the guest scope (`user_default`,
  load-existing-or-create; metadata preserved) and clears the marker; it
  clears neither Bearer nor cookie today — it must, or a surviving cookie
  reactivates the cloud principal on the next boot.

## 7. Credential handling for requests (interface to B)

- Bearer is snapshotted into the request at creation; never re-read.
- Every scoped data request carries `X-Fitness-Account-Id: <principal>`
  (Design B attaches it). Backend dependency `require_account_match`:
  **optional-but-enforced-when-present** in stage 1 (header present and ≠
  resolved principal → 403; absent → pass, so un-upgraded bundles keep
  working); **required** for identity-contract clients in stage 2. Applied
  to every user-data router dependency. HIGH by file; lands in C4
  (backend) with the client attach rule.
- A request created under generation N is not dispatched, and its
  completion is ignored, if the current generation ≠ N.

## 8. Fixtures (C1 red → C4 green)

`transition.test.js` (synthetic storage + credential stubs; no network):

1. `boot_loggedOut_never_selects_first_profile` — list non-empty, marker
   set → login gate, `scopeId null`, no `/me` call.
2. `me_uuid_with_legacy_scope_does_not_bind` — selected `cloud_1700…`,
   `/me` → P → bindings unchanged, `bindingStatus 'unbound'`, allocation
   occurs, old scope bytes identical.
3. `a_selected_b_logs_in_never_adopts_a` — selected scope bound to A; login
   as B → B allocated or trusted-selected; A's binding and scope untouched.
4. `binding_exclusive_both_ways` — writing a second scope for one account
   or a second account for one scope is refused with `conflict`.
5. `late_me_after_logout_is_ignored` — logout bumps generation; a `/me`
   resolving afterwards changes nothing; marker still set.
6. `logout_order_is_synchronous` — marker, token clear, generation bump,
   and dispatch stop all observable **before** the awaited network logout
   resolves (network stub never resolves; assertions still hold).
7. `surviving_cookie_cannot_clear_loggedOut` — boot with marker set and a
   valid cookie, no intent marker → still logged out.
8. `oauth_intent_clears_marker_once` — intent marker present → deliberate
   login path; second boot without it → not re-triggered.
9. `expired_keeps_local_scope` — 401 → `'expired'`, scope still selected,
   dispatch paused, no scope change.
10. `principal_change_in_other_tab` — `/me` returns Q while P's scope is
    selected → generation bump, Q's scope selected/allocated, P's scope
    untouched.
11. `continue_without_account_clears_credentials`.
12. `mixed_bearer_cookie_principal_source` — Bearer for A and cookie for B
    → principal A, `principalSource 'bearer'`, and a request carrying
    `X-Fitness-Account-Id: B` is refused client-side before send.

## 9. Open for cross-review

- OAuth intent: cookie vs one-shot query marker (§6).
- Whether `conflict` should also block local *writes* to the selected
  scope, or only cloud dispatch (position: only dispatch — local-first).
- Allocation naming: new scope ids are the account UUID itself
  (`scopeId = accountId`) — simplest, makes the trusted binding
  self-evident, and distinguishes them from legacy `cloud_<ts>` and
  `user_*` ids at a glance. *(Position: yes; B/C to confirm no collision
  with key parsing.)*
