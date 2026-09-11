# Spec — Account identity, profile retirement, and sync ownership (S29)

> **STATUS: REVISION 7, 2026-09-11 — C0 designs A, B, C at revision 3
> after the Codex adversarial pass returned CHANGES-REQUIRED on all three
> (four P1s and four P2s, every one verified in source and adopted).
> Owner direction 2026-09-11: build the full design; the narrow-fix
> alternative was offered and declined. Awaiting review of revision 3 and
> the literal "Cleared, proceed with implementation." No application code
> has been written. Priority P1.**
>
> **What revision 2 of the designs got wrong** (each fixed in revision 3):
> the queue's dedupe key *is* its identity (`type:key`), so two accounts'
> settings ops destroyed each other before any ownership check could run;
> aborted requests were returned to `pending`, which re-sends creates the
> server may already have committed; ops were sent before being persisted,
> so a crash lost them entirely; "compare-and-remove is never lossy" was
> false against an unlocked old tab, so the legacy keys are now **copied
> and never removed** until stage 3; the adoption prompt claimed it could
> never adopt another account's data while its own mechanism could, so it
> is now an explicit **transfer** naming the destination account and
> showing a preview; the OAuth nonce had no route, store, expiry, or
> session binding and now has all four (including a new table and
> migration, stated as stage-2 schema work); `conflict` allowed mutations
> to be stamped with the wrong account; a late 401 could clear a newer
> login's credentials; and restore could crash mid-write with no recovery
> and could overwrite-then-upload a trusted scope.
>
> **Decision surfaced by the cross-review, for the owner:** every Google
> user's data already lives under a scope named by the server UUID. Under
> the provenance rule that scope is *unbound*, so stage 1 either empties
> every existing user's working app (the owner included) or offers a
> one-time **explicit transfer** on the first upgraded sign-in, naming the
> destination account and previewing the data (Design A §4 — it is a
> user-authorised transfer, not a claim of prior ownership, because
> nothing on the device can prove that). Without it, data that never
> re-pulls (an in-progress workout, exercise prefs, progression settings,
> equipment profile, custom equipment, nutrition targets) would sit in
> recovery only.
>
> Supersedes `profile_orphan_spec_s29.md`. Written for a session with no
> memory of the conversation that produced it.
>
> **Revision history of what each draft got wrong, kept on purpose:**
> - *Rev 1* — treated the bug as a multi-profile edge case; it is a missing
>   identity for password sign-in (§3.1).
> - *Rev 3* — replaced recovery with a "more than one list entry" guard that
>   cannot see one-list-entry / many-scopes (`Login.jsx:30` replaces the list
>   on every sign-in while `:65,:90` mint a new scope every time).
> - *Rev 4* — defined "proof that a scope belongs to an account" as *a
>   validated principal was active while the scope was selected*. That is
>   exactly the A-is-selected / B-signs-in coincidence the work exists to
>   stop. Validating a credential proves the **account**, not ownership of
>   existing data. Corrected in §6 item 1.

**Zone:** HIGH — identity, auth transport, user data, sync ownership, the
logout gate, `WorkoutContext.jsx` together with the backend.

---

## 1. Origin and priority

Filed as a P3 ("cloud login orphans local profiles"). Four review passes
established three P1 defects (§3) and a rollout trap (§4). **P1** since
2026-09-10: the owner has begun sharing the app with co-workers, who are
the users most likely to register with a password.

## 2. Owner decisions (all recorded; nothing open for the owner)

| Decision | Answer (2026-09-10) |
|---|---|
| Device sharing | Never. One account is one person on their own device |
| Second profiles | "No one has a second profile. Make it so no one can have one" |
| Password sign-in | **Keep and fix** — anyone without a Google account must still be able to use the app |
| Interim login copy | Not needed |
| "Fire Station profile" | Does not exist; `ARCHITECTURE.md` framing corrected |
| Containment stage | Builder's call — folded into stage 1 |

The second-profile decision rules out *intentional* extra profiles. It does
**not** cover the *aliases this bug manufactured* — every `cloud_<timestamp>`
scope a password user ever signed into, each possibly holding an unsynced
workout. The rule is honoured by never offering creation or normal
switching again; the data is honoured by §5.

## 3. The three defects, verified

**3.1 — P1, no stable identity for password sign-in.** `Token`
(`schemas.py:28-30`) carries only `access_token`/`token_type`; `/register`
and `/login` return exactly that (`routers/auth.py:113-114,138-139`; live
`/openapi.json` agrees). `Login.jsx:65,90` therefore always mint
`'cloud_' + Date.now()` and a fresh storage scope. The boot path cannot
repair it: `getMe` is cookie-only (`ApiService.js:70-77`) while password
login holds a Bearer token. Google/OAuth users get the server UUID.

**3.2 — P1, the sync queue crosses account boundaries.** `enqueue`
(`SyncQueue.js:76-88`) keys ops by `type:key`, accepts `uid = null`, and an
old tab's enqueue drops unknown fields; `flush` (`:105-125`) dispatches
every op with whatever credentials exist now and removes by id after the
await (`:117-120`); `init` (`:154-162`) flushes on boot, online, and
visible; `persistQueue` (`:31-36`) swallows quota failure. Ownership is
captured too late — producers enqueue inside a failure `catch`
(`WorkoutContext.jsx:~1178-1182`, `TimerContext.jsx:~223-230`). **The queue
is not the only path:** the direct push/backfill (`WorkoutContext.jsx:
~1026-1097`), `syncToApi` (called at `~1148-1154`; `StorageService.js:
429-450` saves history and saves *or deletes* the active workout with
global credentials), and pull-completion writes (`~673-698`, guarded only
by `latestProfileIdRef !== profile.id` — scope, not account) all operate on
the current credentials regardless of who owns the scope.

**3.3 — P1, preserving any stored profile breaks explicit logout.**
`getOrCreateProfiles` (`StorageService.js:245-269`) consults `isLoggedOut()`
only in the empty-list branch; `refreshGlobalState` (`WorkoutContext.jsx:
491-505`) then selects unconditionally. Sign-out (`Profile.jsx:56-78`)
awaits the network logout *first*, then clears state. The OAuth callback is
a backend redirect straight to `/` (`routers/auth.py:218` handler), so
`AuthCallback.jsx` cannot be where a deliberate login completion is
recorded. A surviving cookie or late `/me` (`WorkoutContext.jsx:~523-540`)
can reactivate a session.

**3.4 — P2, storage-only writes leave React state stale.** Boot branches
never `setProfiles`; `updateProfile` (`~1404-1415`) rewrites the list from
a stale snapshot.

## 4. Identity-contract protocol (replaces "deploy stage 1 first")

The PWA registers with `registerType: 'prompt'` (`vite.config.js:69`): an
open tab keeps the old bundle until the user accepts an update, and an old
login tab still runs `Login.jsx:90`. `UserRegister`/`UserLogin`
(`schemas.py:17-25`) do not forbid unknown fields, and `/register` commits
before returning (`auth.py:95-114`) — so an *old backend* would ignore an
opt-in field and create an account before a new client could reject the
missing id. A field alone has a deploy-race window. Therefore:

- **Versioned endpoints** `/api/auth/identity-v1/login` and
  `/api/auth/identity-v1/register`, absent from the original backend (it
  answers 404 before any mutation), with a body field
  `identity_contract: "account-scope-v1"` validated by schema.
- **Stage-2 backend behaviour:** recognised opt-in → normal validation,
  then `Token` with `access_token`, `token_type`, **validated `user_id`**;
  no id-less success. Legacy endpoints / missing contract → controlled
  `409 CLIENT_UPDATE_REQUIRED` **before** any DB write or credential
  activation; no token, no activating id. Malformed → 422. Well-formed but
  unsupported version → controlled unsupported-contract error; never a
  downgrade to legacy success.
- Rejection blocks stale software, not password accounts; the old tab's
  local data, inputs, and any offline workout stay intact. It is activated
  only once the updated bundle is verified available. Rollback floor: the
  original backend is harmless (404); a stage-2 backend must not be rolled
  back to one that answers legacy login with success while stage-1 clients
  exist. Pinned in the C0 design.
- The same "resolving a principal never changes a scope" rule (§6) covers
  `/me`, the OAuth redirect, re-login, restore, and boot.

## 5. Migration and recovery position

Per-profile data lives under id-scoped keys (`scopedKey`,
`StorageService.js:91`, over `PROFILE_SCOPED_BASE_KEYS` `:43-67` — history,
active workout, assessments, weight history, custom exercises and
templates, food log, settings — plus the legacy `_<uid>` form `:92`). The
profiles list is one global key. No defect path calls `clearProfileData`
(`:386-388`), so orphaned scopes survive on disk, including ones absent
from the list.

**Prohibited without explicit, per-item user choice:** picking
`profiles[0]`; merging by name or email; merging into the signed-in
account; `clearProfileData` as cleanup; `importSnapshot` as migration
(`:401-420` clears and restores every `fitness_*` key including
credentials, the logout marker, and queues).

**Required:** discover scopes from **storage keys**; keep bindings only
with provenance (§6 item 1); a read-only, credential-free recovery surface
covering **every** data type above — counts per type, a minimal readable
preview, scoped JSON export of all recognised data in both key formats,
unparseable values retained verbatim — using a **non-mutating reader**
(`loadProfileState` migrates and deletes global keys at `:275-282`, so it
is not that reader). Retaining bytes is not access; an opaque full backup
is not access; no automatic merging.

## 6. Staged plan and the stage-1 contract

| # | Stage | Fixes | Gate |
|---|---|---|---|
| 0 | C0 design set (A, B, C below) plan-reviewed and cleared | — | current |
| 1 | Account-boundary safety, recovery, stop new profile creation — commits C1–C4, with **C3b (backend, inert)** before C4 | 3.2, 3.3, 3.4, §5 | HIGH; test-first |
| 2 | Stable identity via the §4 protocol — C5 plumbing, then a separately reviewed activation | 3.1 | gated on the §7 mixed-version matrix |
| 3 | Retirement and cleanup — C6 | — | zone by diff |

Every live entry point to a removed feature is removed or redirected in
the release that removes it; the Coach APP KNOWLEDGE block and
`ARCHITECTURE.md` change in the same commit. Retirement is not a
prerequisite for the safety fix.

### The stage-1 contract

**Principle:** an *authenticated principal* (account UUID from a validated
credential) and a *local scope* (the localStorage id holding the data) are
different things. Resolving the principal — at login, `/me`, OAuth
completion, restore, or boot — **never** creates, reassigns, or selects a
binding as a side effect.

1. **Binding provenance.** `accountId → scopeId` is trusted only if it came
   from one of: (a) an already-trusted binding; (b) allocation of a **new,
   empty** scope by the upgraded client inside a validated-account
   transition; (c) an explicit, separately recorded, user-authorised
   adoption of existing unbound data into the *current verified* account
   (user-authorised transfer — never "proven historical ownership"; a
   `cloud_<timestamp>` suffix proves nothing). Bindings are **exclusive in
   both directions**: one account, one scope; one scope, one account.
   Imported bindings from a backup are untrusted metadata.
2. **Scope discovery** from storage keys, both formats, all base keys.
3. **Recovery surface** ("Other data on this device", from Settings): per
   §5; also shows held queue operations (counts, types, dates) **even when
   there are no unbound scopes**; read-only; no adoption in this pass.
4. **Principal resolution without scope change.** `getMe` sends Bearer as
   well as cookie — but **only** once the boot branch has been changed so a
   resolved UUID updates `accountId` and *looks up* a trusted binding; it
   never writes one, never replaces the list, never re-selects a scope
   without one. Same rule for OAuth completion and re-login. Cloud
   **reads** and their completion writes are gated by `accountId +
   scopeId + session generation`, not by scope alone.
5. **Explicit logout.** Synchronously first: set the marker, clear
   credentials, bump the session generation, stop dispatch, invalidate
   pending auth/pull/queue callbacks; *then* await the cookie logout.
   Retain list, bindings, scopes, and pending work; clear only the active
   selection. The marker is enforced in both init paths, auth completion,
   and dispatch. Only a deliberate successful login clears it — recorded
   at the login transition, since the OAuth flow lands on `/` directly.
   Offline/expired sessions keep local access to the previously selected
   scope; explicit logout does not.
6. **Queue ownership and durable dispatch** — Design B. Every op carries
   `accountId`, `scopeId`, op/revision id, producer version; dedupe
   includes owner and scope; captured at mutation time; **new active-v2
   key** so an old tab's enqueue cannot strip fields; legacy entries go to
   a **versioned hold** — persisted and read back **before** any original
   is removed, idempotent on later boots and imports, originals preserved
   on quota failure; dispatch fails closed unless owner matches the
   validated principal at dispatch and at each await boundary; a newer
   revision is never acknowledged by an older completion; two-tab
   invalidation via storage events with the residual limits stated.
   **All** direct paths obey the same gate: push/backfill, `syncToApi`,
   pull completion.
7. **Restore boundary** — Design C. Restored data passes the identity and
   queue boundary before any refresh or dispatch; restored credentials are
   not a session; restored bindings are untrusted; restored ownerless ops
   go to the hold; non-destructive staging with validation and quota
   handling.
8. **List/state coherence** — every list write returns the list; storage
   failure is surfaced, never presented as durable.
9. **Stop new profile creation** — remove the create UI and its action
   after inventorying every caller; normal switching stays until stage 3.

### C0 — three designs before code

| Design | Covers | Author |
|---|---|---|
| **A** — account/scope transition state machine | items 1, 4, 5: principal validation, credential precedence (Bearer over cookie, as `auth.py:103`), binding provenance and exclusivity, scope selection, session generation, offline/expired vs explicit logout, OAuth completion, late logout-cookie responses | Claude session |
| **B** — durable dispatch protocol | item 6 in full, plus the direct paths and pull callbacks | Claude session (the reviewer supplied the interface proposals and the hold-not-retry rule, then hit its usage limit before authoring; it has reviewed every revision since) |
| **C** — restore transaction | item 7: which keys are data vs session/queue/binding authority; staging; validation; quota; the gate before refresh/dispatch | Claude session |

Each is cross-reviewed by the other author before the set goes to the
owner. Items 2, 3, 8, 9 are designed in their implementation commits
against the acceptance details above.

### Commit sequence (stage 1 → 2 → 3)

- **C0** — design documents only.
- **C1** — `test(auth): S29 account-boundary and legacy-scope regression
  fixtures`. Synthetic storage/credential fixtures and a scenario harness;
  production unchanged. The new suite is **deliberately red** for the
  recorded defects and reported as such; expected failures are never
  counted as a fix.
- **C2** — `feat(storage): S29 scope inventory and ownership primitives`.
  Non-mutating discovery/read/export helpers, the pure transition/binding
  model, v2 queue/hold primitives, restore validators — not yet wired.
  Unit fixtures (modern/legacy/orphan keys, every data type, bad JSON,
  binding exclusivity, revisions, quota) go green; integrated fixtures stay
  red.
- **C3** — `feat(recovery): expose retained device data without
  activation`. Recovery view/export, held-op display, removal of new
  profile creation and its callers, docs and Coach prose. Discovery and
  recovery fixtures go green, including food-only, active-workout-only,
  and hold-only scopes.
- **C3b** — `feat(auth): inert server prerequisites for the identity
  boundary`. The identity-v1 endpoints, the `login_nonce` table and its
  migration, `require_account_match` in optional-when-absent mode, and
  Design B §6's `client_seq` fence on `active_workout` (schema + both
  handlers). **Nothing changes for existing clients** — the new endpoints
  are unused, the header is absent, and an omitted `client_seq` behaves as
  today. This exists because revision 3 had C4's client calling endpoints
  that only arrived in C5, which would have left a logged-out user on a
  new client unable to sign in at all.
- **C4** — `fix(auth): activate the account and scope transition
  boundary`. One reviewed, atomic integration: principal resolution,
  protected boot selection, bindings, logout/OAuth intent, session
  generation, every direct and queued dispatch/pull guard, mutation-time
  producer ownership (TimerContext included), restore-before-refresh,
  list/state coherence. `/me`-UUID-with-legacy-scope, mixed credentials,
  logout/late-auth, A→B→A, concurrent tabs, imported credentials/bindings/
  queues go green. `getMe`'s new transport ships **here**, never earlier.
  HIGH across many files — the coupling is real and is not cured by
  slicing unsafe intermediate states into commits.
- **C5** — `feat(auth): identity-contract compatibility plumbing`.
  Versioned endpoints and client integration behind the activation
  contract; original endpoints never start returning `user_id`. Contract
  fixtures green; the §7 matrix exercised against a stage-2 candidate
  backend in a disposable environment. **Activation is a separate,
  separately cleared change.**
- **C6** — stage 3 retirement: switching, `/profiles`, dead APIs, live
  links; recovery preserved; docs and Coach prose in the same commit.

## 7. Verification

- **Mixed-version identity rollout preserves legacy scope** (gates stage
  2): seed the pre-stage-1 bundle with a timestamp-scoped offline history,
  a one-entry list, a second orphan scope, and pending legacy ops; keep a
  tab on it through the stage-1 deploy, then against the stage-2 backend;
  assert legacy requests cannot activate a UUID or mutate registration
  state — they receive `409 CLIENT_UPDATE_REQUIRED` before any write. Run
  the stage-1 client against `Token` with and without `user_id` and
  against canonical `/me`; assert the trusted scope stays selected,
  unbound scopes remain reachable in recovery, every blob is byte-
  identical, no cross-owner write leaves the device. Cover server-first,
  client-first, rollback to the original backend (404 path), repeated
  login, update-prompt refusal.
- Existing matrix: repeated password sign-in; Google sign-in; A→B→A;
  offline and 401; delayed/duplicate auth resolution; StrictMode; two tabs;
  concurrent enqueue; quota failure; old backup import; a scope holding
  only an unfinished workout or only a food log.
- Local first (`npm run dev`, disposable local Postgres for backend
  stages); then a **disposable** account on the live backend — never the
  owner's.
- `ARCHITECTURE.md` and the Coach APP KNOWLEDGE block change in the same
  commit as any stage that changes persistence, auth, or a feature.

## 8. Provenance

Planned by the Claude session; plan-reviewed four times by independent
top-tier Codex agents, read-only in their own worktrees (agent
`a85ddc71-6cd5-4a72-8da2-d1eefe1a83a1`, passes 1–2, 2026-09-09; agent
`6554b7a8-2a8a-48e1-90fc-712cc438aa64`, passes 3–4, 2026-09-10). Pass 4
returned CHANGES-REQUIRED on revision 4, identified the binding-provenance
error, and supplied the protocol pinning and the C0–C6 sequence adopted
here. All three designs are authored by the Claude session. Reviewer transcripts are the
proof artifacts.
