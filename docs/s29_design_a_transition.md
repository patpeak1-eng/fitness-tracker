# S29 Design A — Account/scope transition state machine (revision 2)

> C0 design document. No code. Companion to `profile_identity_spec_s29_v2.md`
> §6 items 1, 4, 5. Cross-reviewed with Design B (dispatch) and Design C
> (restore). Anchored to `2102e47` unless noted.
>
> **Revision 2 (2026-09-11) — what revision 1 got wrong, from the cold
> cross-review:** (F1) "allocate a fresh scope named `<accountId>`" would
> have landed on a **populated** namespace — every Google user's data
> already lives under `user.id` (`WorkoutContext.jsx:527`), so allocation
> would either launder ownership or empty every existing user, the owner
> included. (F2) Gating durable queue ops on the session generation meant
> the queue never drained after any reload. (F3) A backend-set
> non-HttpOnly "intent cookie" is unreadable across origins. (F4) Bearer
> precedence let a stale Bearer swallow an OAuth sign-in, and let a
> conflicting Bearer capture someone else's deliberate login. (F7) §4 and
> §5 gave the same situation two outcomes. All corrected below.

## 1. Vocabulary and the exposed object (shared with B and C)

| Term | Meaning |
|---|---|
| **principal** | account UUID from a *validated* credential, or `null` |
| **principalSource** | `'bearer' \| 'cookie' \| null` (backend precedence: Bearer if the header is present, else cookie — `auth.py:103`; a present-but-invalid Bearer 401s with **no** cookie fallback, `:104-113`) |
| **scope** | the localStorage id data keys live under (`scopedKey` `StorageService.js:91`, legacy `:92`, base keys `:43-67`) |
| **binding** | `{ accountId, scopeId, provenance, createdAt, generation }`, exclusive both ways |
| **bindingStatus** | `'trusted' \| 'unbound' \| 'conflict'` for the selected scope against the current principal |
| **sessionGeneration** | in-memory integer, initial `1` per page load, **not persisted**; bumped on every transition below; gates **in-flight** work only (abort + discard late completions). Durable ops are gated by owner and status, never by generation (Design B §5) |
| **authState** | `'authenticated' \| 'expired' \| 'loggedOut' \| 'none'` |
| **crossTabSafe** | `'locks' in navigator` |

Exposed: `A.state` (read-only snapshot of the fields above plus `signal`),
`A.subscribe(fn)` (fires on every transition — Design B's gate-transition
trigger), and `A.transition(event, payload)`. **Only `A.transition` bumps
the generation**; B and C never bump it directly — they request a
transition (`'principalChanged'`, `'restoreCommitted'`).

## 2. Current behaviour replaced (anchored)

- Two selection paths: `useState` initialiser (`WorkoutContext.jsx:306-318`,
  honours `isLoggedOut`) and `refreshGlobalState` (`:491-505`, does not).
- Boot `/me` (`:513-560`) is cookie-only (`ApiService.js:70-77`); a
  different id **replaces the list and selects the cloud profile**
  (`:535-540`); same id with drift rewrites the list (`:548`); then
  `SyncQueue.flush()` (`:555`). No `setProfiles`.
- The cloud profile's scope **is** the server UUID (`:527`).
- `canSyncToBackend` (`:327-332`) gates on `email`; so do `Profile.jsx:54,
  99`, `Settings.jsx:465`, `CoachView.jsx:1025` — list metadata used as
  authorisation.
- `Settings.jsx:81` infers "password user" from the stored token, not from
  the validated principal; account deletion (`:203`) is gated on that.
- Sign-out (`Profile.jsx:56-78`) awaits the network first.
- OAuth completion is a backend 302 to `${frontend_url}/`
  (`routers/auth.py:~314`); `Login.jsx:119-122` starts it **without**
  clearing a stored Bearer.
- `getActiveWorkout` has **no caller** in `src/` — an in-progress workout
  never re-pulls from the server. Exercise prefs, progression settings,
  equipment profile, custom equipment, and nutrition targets are
  device-only as well. This is why §3.4 exists.

## 3. Binding provenance

Trusted only if created by:

1. **Allocation** — a **provably fresh** scope id, `acct_<accountId>_<8 random hex>`,
   created empty during a deliberate-login transition and recorded in the
   binding. Never the bare UUID: that namespace is already populated for
   every OAuth user. Discovery treats bare-UUID and `cloud_<ts>` scopes
   alike — **unbound**.
2. **Inheritance** — a trusted binding read from the bindings store
   (`fitness_bindings_v1`, one JSON array, written only by `A.transition`).
   Provenance enum: `'allocated' | 'adopted'`. A record with any other
   provenance (Design C writes `'imported'` records **into quarantine, not
   this store**) is ignored by inheritance.
3. **Adoption** — the user explicitly authorises, and the app records
   `{provenance: 'adopted', sourceScopeId, generation}`.
4. **The first-upgraded-sign-in adoption prompt (stage 1, deliberate
   design choice).** On the first deliberate login of account P after the
   upgrade, if the device holds an unbound scope whose id is **exactly
   P's UUID** (the pre-upgrade OAuth scope) or the scope that was selected
   at the moment of login (a password user's `cloud_<ts>`), the app asks
   once: *"This device has workout data from a previous sign-in. Keep it
   with this account?"* — **Keep** records an `'adopted'` binding to that
   scope (no copy, no merge); **Not mine** leaves it unbound and
   allocates fresh. This is provenance (3), not co-presence: the user
   decides, and the record says so. It is what keeps every existing user —
   including the owner — from booting into an empty app. Only these two
   candidate scopes are offered; other unbound scopes stay in recovery.

Exclusivity: one account ↔ one scope. A write that would violate it is
refused with `conflict`.

**Never** provenance: co-presence, email/name match, single-entry list, a
`cloud_<ts>` or bare-UUID suffix, a backup's own claim.

## 4. Transitions (one outcome per situation)

| Event | Guard | Result |
|---|---|---|
| **boot** | — | §5 |
| **deliberate login** on transport T | credential validated; contract satisfied; **the other transport was cleared first** (§6) | `authenticated`; bump; `clearLoggedOut()`; trusted binding → select; else adoption prompt (§3.4) → adopt or allocate; write the profile-list entry for the selected scope from `/me` fields (this is the one permitted list write; `setProfiles` in the same step) |
| **/me refresh, same principal** | — | display-field drift only; `setProfiles`; no scope change |
| **/me refresh, different principal Q** (cookie changed elsewhere) | — | **`conflict`**: keep the current scope selected for local use, `principal = Q`, `bindingStatus 'conflict'`, bump (aborts in-flight), all cloud reads/writes fail closed, banner "signed in as a different account elsewhere — sign in again here". Allocation happens **only** on a deliberate login (fixes F7) |
| **401** | — | `expired`; bump; **clear the stored Bearer** (it is dead and would otherwise swallow a later OAuth sign-in, F4); keep scope; dispatch paused |
| **explicit logout** | user | synchronously: `setLoggedOut()`, `clearAuthToken()`, bump, clear `currentProfileId`, `principal=null`; then `await` cookie logout (`routers/auth.py:415-421`); then navigate. List, bindings, scopes, hold retained |
| **late /me, surviving cookie, late logout response** | marker set | ignored; marker authoritative until a deliberate login |
| **restore committed** (Design C) | C's gate passed | no principal or scope change; `A.transition('restoreCommitted')` re-runs discovery and re-evaluates `bindingStatus` |

## 5. Boot resolution

1. `isLoggedOut()` → `loggedOut`, `scopeId null`, login gate; **no** `/me`.
2. Else select the stored `currentProfileId` **if discovery finds any key
   for it**; if the stored id is the guest `user_default` and no keys
   exist yet, create it (load-existing-or-create). `bindingStatus` awaits
   the principal.
3. Resolve principal with Bearer **and** cookie (ships in C4 only):
   - none → `'none'`, local.
   - 401 → `'expired'`, clear the stored Bearer, local, paused.
   - P with trusted binding == selected → `trusted`.
   - P with trusted binding ≠ selected → select the trusted scope (stale
     selection); nothing else changes.
   - P with no trusted binding → **`unbound`**: keep the selected scope
     for local use; no allocation, no adoption at boot (adoption only in
     a deliberate login, §3.4); cloud dispatch and pulls fail closed;
     banner "sign in to link this device's data to your account".
   - selected scope bound to another account → `conflict` (as §4).
4. Pulls and flushes run only when `trusted && authenticated`, under the
   generation captured at step 3; B subscribes to that transition.

**Consequence, stated honestly.** With §3.4, an existing user who signs
in after the upgrade keeps their data by answering one prompt. Without
adoption, the data that would have been stranded is more than history:
the in-progress workout (never re-pulled), exercise prefs, progression
settings, equipment profile, custom equipment, and nutrition targets are
device-only. A password user who has accumulated several `cloud_<ts>`
scopes is offered only the currently selected one; the rest stay in
recovery (view/export) — that is the residual.

## 6. Deliberate login detection and credential hygiene

- **Before starting any login**, clear the other transport: the Google
  button clears the stored Bearer first (`Login.jsx:119-122` today does
  not); password login first calls the cookie logout endpoint if a
  `session_token` cookie may exist (the client cannot read it, so it
  always calls; the endpoint is idempotent). A deliberate login on
  transport T therefore never competes with a stale credential on the
  other (F4).
- **Password**: identity-v1 endpoints return `user_id`; the transition
  runs in the login handler, replacing `activateProfileAndGo`
  (`Login.jsx:29-35`).
- **OAuth**: the backend's 302 carries `?login_nonce=<opaque>`; the
  backend stores the nonce single-use with a 60-second TTL. Boot sees the
  query param, strips it via `history.replaceState`, and calls
  `POST /api/auth/confirm-login {nonce}` — the server validates and
  consumes it and returns the principal. Only a **confirmed** nonce is a
  deliberate login; a replayed or bookmarked URL fails confirmation and
  is treated as a surviving cookie (cannot clear `loggedOut`). No
  cross-origin cookie reading is required (F3).
- **Intent with a conflicting Bearer**: impossible after the first
  bullet; if a Bearer somehow survives and resolves to a different
  principal than the confirmed nonce, the result is `conflict` and the
  login is refused with "sign out first" — never "Bearer wins".
- "Continue without account" clears the Bearer and calls cookie logout,
  then selects the guest scope; clears the marker.

## 7. Requests (interface to B)

- Bearer snapshotted at request creation; `X-Fitness-Account-Id:
  <principal>` on every scoped data call; backend `require_account_match`
  (optional-but-enforced-when-present in stage 1, required for
  identity-contract clients in stage 2) applied to every user-data
  router, **including coach chat and account deletion**. A 403 from it is
  classified by B as `owner_mismatch` (today `SyncQueue.js:131-137`
  dead-letters any 4xx).
- `Settings.jsx:81`'s `isPasswordUser` becomes `A.state.principalSource ===
  'bearer'`; account deletion is refused unless `bindingStatus ===
  'trusted'`.
- The email gates outside `WorkoutContext` (`Profile.jsx:54,99`,
  `Settings.jsx:465`, `CoachView.jsx:1025`) are replaced by `A.state`
  reads in C4; list metadata is never authorisation after C4 (closes C's
  F10).

## 8. Fixtures (C1 red → C4 green)

1. `boot_loggedOut_never_selects_first_profile`
2. `oauth_uuid_scope_is_unbound_until_adopted` — pre-upgrade `user_<uuid>`
   keys; `/me` → same UUID → `unbound`, no binding written, bytes identical.
3. `adoption_prompt_keep_records_adopted_binding` — Keep → binding
   `{adopted, sourceScopeId}`; no copy; **Not mine** → fresh
   `acct_<uuid>_<hex>` allocated, old scope untouched.
4. `allocation_ids_are_fresh` — never equal to any existing key's scope.
5. `a_selected_b_logs_in_never_adopts_a` — B's prompt offers only B's own
   UUID scope (if any) — never A's scope.
6. `binding_exclusive_both_ways`
7. `mid_session_principal_change_is_conflict` — Q via `/me` → `conflict`,
   no allocation, dispatch and pulls fail closed.
8. `late_me_after_logout_is_ignored`
9. `logout_order_is_synchronous`
10. `nonce_replay_cannot_clear_loggedOut` — second confirm of the same
    nonce fails; marker stays.
11. `expired_clears_stored_bearer_and_keeps_scope`
12. `google_button_clears_bearer_before_redirect`
13. `password_login_clears_cookie_first`
14. `continue_without_account_clears_both_transports`
15. `generation_gates_inflight_only` — a persisted op survives a reload and
    is dispatched once trusted+authenticated (with B).
16. `x_account_header_is_snapshot_not_current`

## 9. Open for cross-review

- The adoption prompt copy and whether "Not mine" should be available at
  all on a device with exactly one unbound scope (position: yes — never
  guess).
- Nonce TTL (60 s) and where it is stored server-side (position: a
  small table or the existing rate-limit memory; a restart drops it, and
  the user simply signs in again).
- Whether `conflict` blocks local writes (position: no — local-first).
