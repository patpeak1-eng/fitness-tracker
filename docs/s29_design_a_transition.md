# S29 Design A — Account/scope transition state machine (revision 3)

> C0 design document. No code. Companion to `profile_identity_spec_s29_v2.md`
> §6 items 1, 4, 5. Anchored to `59eb7a8`.
>
> **Revision 3 (2026-09-11) — from the Codex adversarial pass:** the
> adoption prompt was described as "never adopts A's data" while its own
> mechanism could offer exactly that; the nonce was named but never
> designed (no route, no store, no expiry, no binding); `conflict` allowed
> local writes that Design B would stamp with the wrong principal; a late
> 401 could clear credentials belonging to a newer login; two boot
> outcomes overlapped; and the state object B and C consume was never
> written down. All resolved below.

## 1. The exposed object (literal shape — B and C consume this)

```js
A.state = {
  principal:        string | null,   // account UUID from a validated credential
  principalSource:  'bearer' | 'cookie' | null,
  scopeId:          string | null,   // localStorage scope currently selected
  scopeOwner:       string | null,   // account the selected scope is BOUND to, if any
  bindingStatus:    'trusted' | 'unbound' | 'conflict',
  authState:        'authenticated' | 'expired' | 'loggedOut' | 'none',
  sessionGeneration: number,         // in-memory, starts at 1 per page load, never persisted
  paused:           boolean,         // true during a restore commit (Design C)
  crossTabSafe:     boolean,         // 'locks' in navigator
  signal:           AbortSignal,     // aborts on every generation bump
}
A.subscribe(fn)           // fires after every transition
A.transition(event, payload)   // the ONLY writer of generation and bindings
```

`scopeOwner` is new in revision 3: B needs to stamp an op with the owner
of the data it is mutating, which under `conflict` is **not** the current
principal (§7).

Credential precedence mirrors the backend: `auth.py:103` prefers **parsed
Bearer credentials** — a malformed or non-Bearer `Authorization` header
parses to `None` and falls through to the cookie. ("Bearer wins when the
header is present" was imprecise in revision 2.)

## 2. Current behaviour replaced (anchored)

Unchanged from revision 2 and re-verified: two selection paths
(`WorkoutContext.jsx:306-318` honours the logout marker, `:491-505` does
not); cookie-only boot `/me` (`ApiService.js:70-77`) that replaces the
list and selects the cloud profile (`:535-540`); **the cloud profile's
scope is the server UUID** (`:527`); `canSyncToBackend` gates on an email
(`:327-332`), as do `Profile.jsx:54,99`, `Settings.jsx:465`,
`CoachView.jsx:1025`; `Settings.jsx:81` infers "password user" from a
stored token; sign-out awaits the network first (`Profile.jsx:56-78`);
OAuth completion is a backend 302 to `${frontend_url}/`
(`routers/auth.py:305-317`) — there is **no** callback route, nonce
store, or confirm endpoint today; `getActiveWorkout` has no caller, so an
in-progress workout never re-pulls.

## 3. Binding provenance

A binding `{accountId, scopeId, provenance, createdAt, generation}` in
`fitness_bindings_v1` is **trusted** only if created by:

1. **Allocation** — a **provably fresh** scope id `acct_<accountId>_<8 hex>`,
   created empty during a deliberate-login transition. Freshness is
   checked, **under the storage lock**, against both discovered storage
   keys *and* existing bindings; a collision re-rolls. Never the bare
   UUID (that namespace is populated for every Google user, `:527`).
2. **Inheritance** — read from that store. Provenance enum is exactly
   `'allocated' | 'transferred'`. Design C writes `'imported'` records to
   **quarantine**, never to this store, so inheritance cannot see them.
3. **Transfer** — §4.

Exclusivity holds in both directions and is re-checked under the lock at
every write; a violation is refused and surfaced as `conflict`.

## 4. Transfer of unknown-owner data (replaces the "adoption prompt")

**Stated plainly, because revision 2 overclaimed:** nothing on this device
proves that an unbound scope belonged to the account now signing in. A
`cloud_<timestamp>` id proves nothing; a bare-UUID scope proves only that
*some* Google session once used this browser. What follows is therefore an
**explicit user-authorised transfer**, not a proof of prior ownership, and
the design says so in the UI.

**When offered:** on a deliberate login, if the device holds an unbound
scope that is either (a) the bare UUID equal to the signing-in account, or
(b) the scope selected at the moment the login began. A scope **bound to
another account is never offered** — that is `conflict`, not a candidate.

**What the user sees:** the destination account's email, the candidate
scope's contents as a preview (counts by type — workouts, weights,
templates, exercises, food entries, assessments — plus the date range), and
two distinct actions: **"Move this data into <email>"** and **"Keep it
separate"**. The confirming control is separate from the login flow's
primary button so it cannot be clicked through.

**Binding to the moment it was offered:** the prompt captures
`(principal, candidateScopeId, generation)`. On confirmation, under the
storage lock: re-resolve the principal, re-check the generation, re-check
that the candidate is still unbound and that exclusivity still holds. Any
mismatch aborts the transfer and re-prompts. A prompt raised for account P
can never be accepted after a transition to Q.

**Result:** a binding with `provenance: 'transferred'`, recording the
source scope, the destination account, the generation, and the timestamp.
No copy and no merge — the scope becomes that account's scope. Declining
leaves it unbound and reachable in recovery, and allocates a fresh scope.

## 5. Boot resolution (precedence is explicit)

1. **Nonce first** (§6) — a deliberate login is exactly what clears the
   logout marker, so nonce confirmation is processed **before** the
   logged-out early return.
2. Marker set and no confirmed nonce → `loggedOut`, `scopeId null`, login
   gate, no `/me`.
3. Select the stored `currentProfileId` if discovery finds any key for it;
   if it is the guest `user_default` with no keys, create it.
4. Resolve the principal with Bearer **and** cookie (ships in C4 only).
   Then, in this order — the first match wins:
   - a. **The selected scope is bound to an account ≠ principal** →
     `conflict`. Keep it selected for local use; no allocation; cloud
     reads and writes fail closed. (This outranks b, resolving the
     revision-2 overlap.)
   - b. **The principal has a trusted binding** → select that scope
     (`trusted`).
   - c. **Neither** → `unbound`. Keep the selected scope for local use; no
     allocation and no transfer at boot — both happen only in a deliberate
     login (§4).
   - 401 → `expired`; clear the stored Bearer **only if the generation
     that issued the request is still current** (§7); keep the scope;
     dispatch paused.
   - No credential → `'none'`; local.
5. Pulls and flushes run only when `trusted && authenticated && !paused`,
   via `A.subscribe`.

## 6. Deliberate login, and the nonce that makes OAuth detectable

**Credential hygiene first:** the Google button clears the stored Bearer
before redirecting (`Login.jsx:119-122` does not today); password login
calls the cookie logout endpoint first (the client cannot read that cookie,
so it always calls; the endpoint is idempotent). A login on one transport
never competes with a stale credential on the other.

**Password:** the identity-v1 endpoints return `user_id`; the transition
runs in the login handler, replacing `activateProfileAndGo`
(`Login.jsx:29-35`).

**OAuth — concrete design, since none exists today:**

- **Store:** a new table `login_nonce` (`nonce_hash` primary key,
  `user_id`, `created_at`, `consumed_at`) and its migration. This **is**
  schema work and belongs to stage 2, stated here rather than implied.
  An in-process memory store is rejected: Railway may run more than one
  worker and restarts would silently drop nonces.
- **Issue:** at the end of the OAuth callback (`routers/auth.py:305-317`),
  alongside setting the session cookie, insert a row and append
  `?login_nonce=<opaque>` to the 302.
- **Confirm:** the frontend reads the parameter, strips it with
  `history.replaceState`, and calls `POST /api/auth/confirm-login {nonce}`
  **with credentials included**. The server consumes it atomically —
  `UPDATE … SET consumed_at = now() WHERE nonce_hash = :h AND consumed_at
  IS NULL RETURNING user_id` — and additionally requires that the request's
  **own session cookie resolves to that same `user_id`**. Possession of a
  nonce alone therefore cannot clear the logout marker in a different
  browser or session.
- **Expiry** 120 s; rows older than that are ignored and swept lazily.
- **Failure** (replayed, expired, foreign session, or absent) → not a
  deliberate login; a surviving cookie cannot clear the marker.
- **Concurrency:** two simultaneous confirms of one nonce — exactly one
  gets the row; the loser is treated as a replay. Tested.

**"Continue without account"** clears the Bearer, calls cookie logout,
selects the guest scope, and clears the marker.

## 7. Ownership of writes while `conflict`, and the 401 fence

- Local editing continues under `conflict` — the app is local-first.
- **But no cloud intent is created for the wrong account.** A mutation
  made while `bindingStatus === 'conflict'` is stamped with
  `A.state.scopeOwner` (the account the data actually belongs to) when
  that is known, and `owner: null` when it is not. Design B never
  dispatches either: the first waits until that account is the validated
  principal, the second waits for explicit resolution. Under no
  circumstance is the data stamped with the currently signed-in account.
- **Generation fence on auth results:** every auth outcome — success and
  401 alike — carries the generation of the request that produced it.
  A 401 from generation N is ignored if the current generation is > N, so
  a late failure cannot clear credentials established by a newer login.

## 8. Requests (interface to B)

Bearer snapshotted at creation; `X-Fitness-Account-Id: <op.accountId>` on
every scoped data call; backend `require_account_match`
(optional-but-enforced-when-present in stage 1, required for
identity-contract clients in stage 2) on every user-data router **including
coach chat and account deletion**; its 403 is classified by B as
`owner_mismatch`. `Settings.jsx:81` becomes `principalSource === 'bearer'`;
account deletion requires `trusted`. The email gates outside
`WorkoutContext` are replaced in C4 — not before (Design C §2).

## 9. Fixtures (C1 red → C4 green)

1. `boot_loggedOut_never_selects_first_profile`
2. `oauth_uuid_scope_is_unbound_until_transferred`
3. `transfer_requires_named_destination_and_records_provenance`
4. `transfer_prompt_for_P_aborts_after_transition_to_Q`
5. `transfer_never_offers_a_scope_bound_to_another_account`
6. `allocation_is_fresh_against_keys_and_bindings_under_lock`
7. `binding_exclusive_both_ways`
8. `boot_precedence_conflict_outranks_trusted_binding`
9. `mid_session_principal_change_is_conflict`
10. `late_401_does_not_clear_newer_credentials`
11. `nonce_replay_expiry_and_foreign_session_all_fail`
12. `nonce_confirm_is_processed_before_loggedOut_return`
13. `two_concurrent_confirms_one_winner`
14. `logout_order_is_synchronous`
15. `conflict_mutation_is_never_stamped_with_current_principal`
16. `google_button_clears_bearer_before_redirect`
17. `password_login_clears_cookie_first`
18. `continue_without_account_clears_both_transports`
19. `generation_gates_inflight_only`

## 10. Open

- Transfer preview depth (counts + date range proposed; full listing is
  the recovery screen's job).
- Nonce TTL 120 s.
- Whether `conflict` should also block local writes (position: no).
