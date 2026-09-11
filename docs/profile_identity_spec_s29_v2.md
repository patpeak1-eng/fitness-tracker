# Spec — Account identity, profile retirement, and sync ownership (S29)

> **STATUS: REVISION 4, 2026-09-10 — stage-1 design rewritten after the
> third plan review returned CHANGES-REQUIRED. Awaiting plan review of this
> revision and the literal "Cleared, proceed with implementation." No code
> has been written. Priority P1.**
>
> Supersedes `profile_orphan_spec_s29.md`. Written for a session with no
> memory of the conversation that produced it; resume from here.
>
> **What revision 3 got wrong, stated plainly:** it replaced the recovery
> requirement with a guard on "more than one entry in the profiles list".
> That guard cannot detect the case this bug manufactures. Password sign-in
> *replaces* the list with a single entry every time (`Login.jsx:30`) while
> minting a new storage scope every time (`:65`, `:90`), so the affected
> user has **one** list entry and **several** history scopes. The reviewer
> reproduced it by executing the real activation code against synthetic
> storage: two sign-ins produced one list entry and two history scopes, and
> a later UUID activation selected an empty scope. Revision 4 restores
> recovery as an executable requirement and redesigns stage 1 around
> "resolving who you are must never change where your data is".

**Zone:** HIGH — identity, auth transport, user data, sync ownership, the
logout gate, and `WorkoutContext.jsx` together with the backend.

---

## 1. Origin

Filed as a **P3** ("cloud login orphans local profiles"). Three review
passes established it is three P1 defects (§3) plus a rollout trap (§4).
Raised to **P1** on 2026-09-10 because the owner has begun sharing the app
with co-workers — the users most likely to register with a password.

## 2. Owner decisions (all recorded; nothing open for the owner)

| Decision | Answer (2026-09-10) |
|---|---|
| Device sharing | Never. One account is one person on their own device |
| Second profiles | "No one has a second profile. Make it so no one can have a second profile" |
| Password sign-in | **Keep and fix.** Anyone without a Google account must still be able to use the app |
| Interim login copy | Not needed |
| "Fire Station profile" | Does not exist; framing corrected in `ARCHITECTURE.md` |
| Containment stage | Left to the builder — folded into stage 1 |

**Reading the second-profile decision correctly.** It rules out *intentional*
extra profiles — the picker and creation go. It does **not** rule out the
*aliases this bug manufactured*: every `cloud_<timestamp>` scope a password
user ever signed into. Those hold real, possibly unsynced, workouts. The
owner's rule is honoured by never offering profile creation or normal
switching again; the data is honoured by §6 stage 1's recovery surface.

## 3. The three defects, verified

### 3.1 — P1: password sign-in has no stable identity
`Token` (`backend/app/schemas.py:28-30`) carries only `access_token` and
`token_type`; `/register` and `/login` return exactly that
(`routers/auth.py:113-114,138-139`). Verified against the live
`/openapi.json` too. So `Login.jsx:65,90`'s `result.user_id || 'cloud_' +
Date.now()` always mints a timestamp id and a fresh localStorage scope.
The boot path cannot repair it — `getMe` is cookie-only
(`ApiService.js:70-77`) while password login holds a Bearer token.
Google/OAuth users are unaffected; their id is the server UUID.

### 3.2 — P1: the sync queue crosses account boundaries
`SyncQueue.enqueue` (`SyncQueue.js:76-88`) keys ops by `type:key` only and
accepts `uid = null`; `flush` (`:105-125`) dispatches every op through the
registered executor using whatever credentials the app holds now; `init`
(`:154-162`) flushes on boot, `online`, and tab-visible. A failed op for
account A replays against account B after a re-login. Reproduced by the
reviewer with a mocked B executor receiving an A payload despite `op.uid`.
Ownership is also captured too late: `WorkoutContext.jsx:~1178-1182` and
`TimerContext.jsx:~223-230` enqueue inside a `catch` after the request has
already failed, with no owner.

### 3.3 — P1: preserving any stored profile breaks explicit logout
`getOrCreateProfiles` (`StorageService.js:245-269`) consults `isLoggedOut()`
only inside its `profiles.length === 0` branch; `refreshGlobalState`
(`WorkoutContext.jsx:~469-481`) then selects `lastId` or `profilesData[0]`
unconditionally. Sign-out today (`Profile.jsx:56-78`) awaits the network
logout *first*, then clears the token, sets the marker, and empties the
list — so a stored list plus the marker is a state the code never expects.
`AuthCallback.jsx` only redirects; a surviving cookie or a late `/me`
response can reactivate a session (`WorkoutContext.jsx:~523-540`).

### 3.4 — P2: storage-only writes leave React state stale
The cloud-boot branches write storage and `currentProfile` but never
`setProfiles`; `updateProfile` (`:~1404-1415`) later rewrites the list from
a stale snapshot. Any list write must return the resulting list and callers
must synchronise React state with it.

## 4. The rollout trap — now a protocol, not a deploy order

Adding `user_id` to the `Token` response is **not** safe merely because a
newer frontend is deployed first. The PWA registers with
`registerType: 'prompt'` (`vite.config.js:66`): an already-open tab keeps
running the old bundle until the user accepts the update, and an old login
tab still executes `Login.jsx:90`. The moment the backend returns
`user_id`, that tab switches the device to a UUID scope and its local
history disappears from view — the exact loss this work exists to prevent.

**Protocol (stage 2 depends on it, stage 1 builds it):**
- Upgraded clients **opt in** by sending an identity-contract version on
  login/register (a header or body field). The backend returns `user_id`
  **only** to requests that opt in. Legacy requests get the legacy response.
- Legacy behaviour is acknowledged as still defective for the un-upgraded
  tab, and tested as such; it is bounded, not fixed, by this protocol.
- Preferred over letting legacy clients keep minting timestamp scopes
  indefinitely: once stage 2 is live, the backend may answer a legacy
  login with a controlled "update required" failure **before** any
  registration side effect, so a stale tab cannot create an account it
  will then scope wrongly. Decision for the reviewer in stage-2 design.
- The same protection covers **every** place a principal is resolved —
  `/me`, the OAuth callback, re-login, backup restore, and bootstrap — not
  only the login response. See stage 1.

## 5. Migration and recovery position

Per-profile data lives under id-scoped keys (`scopedKey` at
`StorageService.js:91`, base keys in `PROFILE_SCOPED_BASE_KEYS` at `:43`).
The profiles list is one global key. Nothing on the defect paths calls
`clearProfileData` (`:386-388`), so orphaned scopes survive on disk —
including scopes whose id is absent from the list (§ above).

**Prohibited without explicit, per-item user choice:** picking
`profiles[0]`; merging by name or email; merging sibling histories into the
signed-in account; `clearProfileData` as cleanup; `importSnapshot` as a
migration mechanism (`:401-420` clears and restores every `fitness_*` key,
credentials, logout marker, and queues included).

**Required (restored from review 2, dropped by revision 3):** discover
retained scopes from **storage keys**, not from the list; keep explicit
account→scope bindings once they are proven; provide a supported,
local-only, read-only recovery surface for scopes that cannot be bound —
view what is there and export it — so that no user's only copy of a
workout becomes unreachable. Retaining bytes is not access. An opaque full
backup is not access. No automatic merging.

## 6. Staged plan (revision 4)

Every stage is separately spec'd in detail, plan-reviewed, and cleared.
This table is the map; it is not the stage designs.

| # | Stage | Fixes | Gate |
|---|---|---|---|
| 0 | This revision, plan-reviewed and cleared | — | current |
| 1 | **Account-boundary safety** (design below) | 3.2, 3.3, 3.4, the protocol side of §4, recovery per §5; stops new profile creation | HIGH; test-first |
| 2 | **Stable identity** through the negotiated protocol: backend returns `user.id` to opted-in clients; client refuses a missing/invalid id; proven bindings preserved | 3.1 | HIGH; gated on the §7 mixed-version test, **not** on a green stage-1 deploy |
| 3 | **Retirement and cleanup**: retire normal switching and `/profiles` once recovery is reachable; delete `createProfile`/`switchProfile`/`deleteProfile`, `ProfileSelector`, Settings entries; update Coach prose and `ARCHITECTURE.md` for anything not already updated in 1–2 | — | zone decided by what the diff touches — not LOW by label |

Retirement may share a release with completed recovery; it is **not** a
prerequisite for shipping the safety fix. Every live entry point to a
removed feature is removed or redirected **in the release that removes the
feature**, and the Coach APP KNOWLEDGE block and `ARCHITECTURE.md` change
in that same commit.

### Stage 1 design — the contract

**Principle:** an *authenticated principal* (account UUID, from a validated
credential) and a *local scope* (the localStorage id whose keys hold the
data) are different things. Resolving the principal — at login, `/me`,
OAuth callback, restore, or boot — **never** changes the local scope by
itself. A scope changes only through an explicit, tested transition that
either follows a proven binding or asks.

1. **Identity model.** Introduce `accountId` (server UUID or null) alongside
   the existing local `profile.id` (scope). Persist a bindings map
   `accountId → scopeId`, proven only by a validated principal having been
   active while that scope was selected. Legacy `cloud_<timestamp>` aliases
   with no proven binding are **retained unbound**.
2. **Scope discovery.** Enumerate localStorage for keys matching
   `<base><segment><uid>` across `PROFILE_SCOPED_BASE_KEYS` (and the legacy
   `_<uid>` form) to list every scope that holds data, whether or not it is
   in the profiles list.
3. **Recovery surface.** A read-only screen reachable from Settings:
   "Other data on this device" — one row per unbound scope with counts and
   date range, view history, export JSON. No merge, no switch-as-identity,
   no delete in this pass. Absent when there are no unbound scopes.
4. **Principal resolution without scope change.** Repair `getMe` to send
   the Bearer token as well as the cookie (today it is cookie-only) —
   **and** change the boot branch so a resolved UUID updates `accountId`
   and the binding, never replaces the list or the selected scope unless a
   binding says so. Same rule for the OAuth callback and re-login.
5. **Explicit logout.** Order: set the logout marker and clear credentials
   **synchronously first**; stop dispatch; invalidate pending auth, pull,
   and queue callbacks; *then* await the cookie logout. Retain the list,
   bindings, scopes, and pending work; clear only the active selection.
   `isLoggedOut()` is enforced in both initialisation paths
   (`WorkoutContext.jsx:~306-312` and `~491-503`), in auth completion
   (`~523-540`), and in dispatch — not only in `getOrCreateProfiles`. A
   surviving cookie or late `/me` must not clear the marker; only a
   deliberate successful login does. Offline/expired sessions keep local
   access to the previously selected scope; explicit logout does not.
6. **Queue ownership.** Every op carries `accountId` (authorisation owner),
   `scopeId` (write-back target), and a unique op/revision id; dedupe
   includes owner and scope. Ownership is captured **when the mutation is
   created**, not in the failure `catch`. Dispatch fails closed unless the
   op's owner matches the validated principal; transitions between awaited
   ops are re-checked; a newer revision is never acknowledged by an older
   request's completion. Old-format entries move to a **versioned hold**
   under a new key, preserved verbatim, surfaced in the recovery screen,
   never assigned to the current login and never dropped; the 20-entry
   dead-letter store is not used for this. The direct push/backfill path
   (`WorkoutContext.jsx:~1026-1097`) obeys the same owner check.
7. **Backup restore boundary.** Restored data passes the same
   identity/queue boundary before any refresh or dispatch; a restored token
   or cookie is not trusted as a session; restored ownerless ops go to the
   hold.
8. **List/state coherence.** Every list write returns the list and callers
   set React state from it (3.4).
9. **Stop new profile creation** in this release (remove the create UI and
   its action); normal switching stays until stage 3.

### Stage 1 — first commit

`test(auth): S29 account-boundary and legacy-scope regression fixtures`:
synthetic storage and credential tests, red before the fix, for — one list
entry with two history scopes; `/me` returning a UUID while a timestamp
scope is selected; mixed Bearer/cookie principals; logout followed by a
late auth response; A→B pending ops; a backup-restored ownerless queue.
The first production change is the principal/scope boundary with those
tests green — not `user_id`, not deleting `/profiles`.

## 7. Verification

- **Mixed-version identity rollout preserves legacy scope** (required before
  stage 2): seed the *pre-stage-1* bundle with a timestamp-scoped offline
  history, a one-entry list, a second orphan scope, and pending legacy ops;
  keep a tab on that bundle while stage 1 deploys, then point at the stage-2
  backend; assert legacy requests cannot trigger UUID activation or mutate
  registration state before the upgrade gate. Separately run the stage-1
  client against `Token` with and without `user_id` and against canonical
  `/me`; assert the proven scope stays selected, unbound scopes remain
  reachable in recovery, every blob is byte-identical, and no cross-owner
  write leaves the device. Cover server-first, client-first, rollback,
  repeated login, and update-prompt refusal.
- Existing matrix: repeated password sign-in; Google sign-in; A→B→A;
  offline and 401; delayed and duplicate auth resolution; StrictMode replay;
  two tabs; concurrent enqueue; storage quota failure; old backup import.
- Local `npm run dev` first; then a **disposable** account on the live
  backend — never the owner's.
- `docs/ARCHITECTURE.md` and the Coach APP KNOWLEDGE block change in the
  same commit as any stage that changes persistence, auth, or a feature.

## 8. Provenance

Planned by the Claude session; plan-reviewed three times by an independent
top-tier Codex agent, read-only in its own worktree (Traycer agent
`a85ddc71-6cd5-4a72-8da2-d1eefe1a83a1` for passes 1–2 on 2026-09-09,
`6554b7a8-2a8a-48e1-90fc-712cc438aa64` for pass 3 on 2026-09-10). Pass 3
returned CHANGES-REQUIRED on revision 3 and supplied the stage-1 design
positions adopted above. Reviewer transcripts are the proof artifacts.
