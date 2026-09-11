# S29 Design B — Durable dispatch protocol (sync queue, direct paths, pulls)

> C0 design document. No code. Companion to `profile_identity_spec_s29_v2.md`
> (revision 5) §6 item 6 and the direct paths in §3.2. Uses the vocabulary
> and the exposed state object from Design A §1. **Authorship note:** the
> Codex reviewer was assigned this design, stated its interface proposals
> (Web Locks; A's state shape; `X-Fitness-Account-Id`; Bearer snapshot;
> quarantined restore) and one substantive finding (creates without server
> idempotency must be *held*, not retried), then hit its usage limit before
> writing. This draft was written by the Claude session from the same source
> facts, incorporating those proposals verbatim; it is queued for the Codex
> reviewer's adversarial pass alongside A and C. Every claim about current
> behaviour is anchored to a line read on 2026-09-10 at `2e071d9`.

## 1. What exists today (anchored)

- **Queue storage:** one key, `fitness_sync_queue` (`SyncQueue.js:15`); dead
  letter `:19-20` capped at 20; `persistQueue` (`:31-36`) swallows quota
  failure; `enqueue` (`:76-88`) accepts `uid = null`, dedupes by `type:key`
  only, overwrites the prior op, and — because it spreads a fixed field
  set — an **old bundle's enqueue drops any field it does not know**.
- **Dispatch:** `flush` (`:105-125`) iterates every op, calls the registered
  executor with whatever credentials exist *now*, removes by id after the
  await (`:117-120`); a 401 anywhere sets the auth-expired banner and stops.
  Triggers: boot, `online`, `visibilitychange` (`init`, `:154-162`) and
  `WorkoutContext.jsx:413` boot flush, plus `:555` after `/me` and `:1097`
  after backfill.
- **Executors** (`WorkoutContext.jsx:344-411`): `workout`, `weight`,
  `assessment`, `profile_settings`, `template`, `template_update`,
  `exercise`, `food_log`, `food_log_update`, `food_log_delete`. All call
  `ApiService.*`, which reads the **global** token at request time
  (`ApiService.js:16-27`) and sends the cookie.
- **Producers** enqueue inside a failure `catch`, *after* the direct call
  already failed — ownership is never captured at mutation time:
  settings ×6 (`:1182,1198,1214,1230,1246,1262`), timers
  (`TimerContext.jsx:227`), equipment environments (`:766`), backfill
  (`:1096`), and the data mutations at `:1331, 1780, 2026, 2227, 2249,
  2293, 2322, 2333, 2356, 2367, 2440, 2512, 2594`.
- **Direct paths that bypass the queue entirely:** every successful
  `ApiService.*` call above; the backfill block (`:1008-1097`) which pushes
  device-only data it finds; `StorageService.syncToApi` (called from
  `WorkoutContext.jsx:~1148-1154`), which saves the last workout, and
  saves **or clears** the server's active workout (`StorageService.js:
  429-450`) — all with global credentials; and **pull completion writes**
  in `refreshProfileData` (`:578-`), guarded only by
  `latestProfileIdRef.current !== profile.id` (`:698`) — a scope check, not
  an account check.
- **Server idempotency exists only for workouts and food entries**
  (`models.py:138,145` and `:253-259` unique `(user_id, client_id)`;
  `ApiService.js:110,260` send it). Weight entries, templates, exercises,
  and assessments have **no** client key: a retry after an ambiguous
  result can duplicate a record.

## 2. Storage format

Two new keys; the legacy key is never written by the upgraded client.

- `fitness_sync_queue_v2` — the **active** queue. Each op:
  `{ id, revision, type, key, payload, accountId, scopeId, generation,
  producerVersion, createdAt, attempts, lastError, idempotencyKey }`.
  `revision` is a per-`type:key` counter; `idempotencyKey` is a UUID
  minted at creation for types without a server client key (§5).
- `fitness_sync_hold_v1` — the **hold** for legacy/ownerless/unverifiable
  ops: `{ heldAt, reason, source: 'legacy_queue' | 'legacy_dead_letter' |
  'restore' | 'ambiguous_result' | 'owner_mismatch', op }`. Read-only from
  the UI; never auto-dispatched.
- Both are written with **read-back verification**: write, re-read, compare
  a content hash; on mismatch or `QuotaExceededError`, the write is reported
  as failed and the caller's *original* data is left in place. No silent
  swallow (`persistQueue :31-36` is replaced).

## 3. Migration of the legacy queue (idempotent, non-destructive)

On first upgraded boot **and** on every subsequent boot and on restore:
1. If `fitness_sync_queue` or the dead-letter key exists and is non-empty,
   copy each entry into the hold with `source` set and the raw entry
   preserved verbatim (unknown fields kept).
2. Persist the hold with read-back verification.
3. **Only after step 2 succeeds**, remove the legacy keys. If it fails, the
   legacy keys stay, the hold is left as written, and a `syncPaused`
   reason is surfaced. Re-running is safe: entries are keyed by a hash of
   their raw content, so duplicates are not created.
4. An old tab can still write the legacy key after migration (it has no
   lock). The next boot migrates again. That is the residual limit: **an
   op written by an old bundle after the upgrade is held, not dispatched.**

Legacy ops are never promoted to the active queue automatically — the old
`uid` was a local scope id, sometimes a timestamp alias, and often absent
(settings/timers enqueue no uid). Promotion is a user action on the
recovery screen in a later stage, and only into the current verified
account (Design A §3.3).

## 4. Producers — ownership at mutation time

Every enqueue becomes `enqueueOwned(op)` which stamps `accountId`,
`scopeId`, `generation` from Design A's state **at the moment the user
mutates**, not in the failure catch. Concretely:

- The direct call and the fallback enqueue are replaced by one call:
  `dispatch.mutate(type, key, payload, opts)` which (a) stamps ownership,
  (b) tries the request immediately under the current generation, (c) on
  retryable failure appends to the active queue, (d) on **ambiguous** or
  **non-idempotent** failure (§5) writes to the hold with
  `reason: 'ambiguous_result'`.
- `canSyncToBackend` (`WorkoutContext.jsx:327-332`, gates on `email`) is
  replaced by `A.bindingStatus === 'trusted' && A.authState ===
  'authenticated'`. Timers (`TimerContext.jsx:218-232`) receive the same
  predicate through the existing `canSyncRef` prop.
- The backfill block (`:1008-1097`) and `syncToApi` are **rewritten to go
  through `dispatch.mutate`** — no direct `ApiService` writes remain
  outside it. `syncToApi`'s server-side `clearActiveWorkout` is a
  destructive write and is gated the same way; it never runs under
  `unbound` or `conflict`.

## 5. Dispatch gate and idempotency

- **Precondition, checked at dispatch and again at every `await`
  boundary:** `op.accountId === A.principal && op.scopeId === A.scopeId &&
  op.generation === A.sessionGeneration && A.bindingStatus === 'trusted'`.
  Any mismatch → the op is **not sent**; if the mismatch is a generation
  change the op stays queued (it belongs to a session that may return); if
  it is an owner mismatch the op moves to the hold (`owner_mismatch`).
- **Credentials are snapshotted at request creation** — the Bearer token
  is captured into the request; `ApiService` gains a variant that takes an
  explicit token rather than re-reading `loadAuthToken()` mid-flight.
  Cookies cannot be snapshotted, therefore every scoped data request also
  sends `X-Fitness-Account-Id: <op.accountId>`; the backend dependency
  `require_account_match` (Design A §7) rejects a mismatch with 403.
- **Completion:** a response is applied only if the op's `revision` is
  still the newest for its `type:key` **and** the generation still
  matches; otherwise the response is discarded (no local write, no
  removal of a newer op). In-flight requests carry Design A's
  `AbortSignal`; a generation bump aborts them — but an aborted request
  may already have reached the server, so:
- **Idempotency by type:** `workout` and `food_log` carry `client_id`
  (server-unique); a retry is safe. `weight`, `template`, `exercise`,
  `assessment` **have no server key** — an ambiguous outcome (abort after
  send, network error after send, 5xx) moves the op to the hold with
  `ambiguous_result` and is surfaced ("1 change could not be confirmed"),
  never retried blindly. Stage-2 follow-up: add `client_id` to those four
  models so this hold reason disappears; out of scope for stage 1.
- **Triggers** keep boot/online/visible, but every trigger first
  re-evaluates the gate; the post-`/me` flush (`:555`) and post-backfill
  flush (`:1097`) are removed in favour of the gate re-check.
- **Rate:** unchanged serial dispatch; no parallel sends (a `type:key`
  chain must stay ordered).

## 6. Two tabs

- Queue and hold read-modify-write, and dispatch itself, run under
  `navigator.locks.request('fitness-sync', …)` — one tab dispatches at a
  time, no interleaved writes. `A.crossTabSafe` is false where Web Locks
  are absent (*(unverified)*: Safari ≥ 15.4, Firefox ≥ 96, Chromium ≥ 69
  support it); then automatic dispatch is **disabled**, mutations still
  land in the active queue, and the UI shows "sync paused on this
  browser — open the app in one tab".
- `storage` events on the queue/hold/binding keys invalidate the in-memory
  copy; a tab that observes a **binding or logout-marker change** bumps its
  own generation (Design A's "principal changed in another tab").
- What cannot be guaranteed: an **old-bundle tab** holds no lock and can
  still send its own direct requests with the shared cookie. The server
  header check does not help (it sends no header; header is optional in
  stage 1). Mitigation is the update prompt and the identity-contract
  rejection in stage 2; stated as a residual, not solved.

## 7. Pull completion and cloud reads

Reads are gated identically: a pull is issued under `(accountId, scopeId,
generation)`; its completion writes are applied only if all three still
match and `bindingStatus === 'trusted'`. This replaces the scope-only
guard at `:698` and covers A→B→A and same-scope auth changes.

## 8. What the recovery screen shows for the hold

Read-only: count by `reason`, count by `type`, oldest and newest
`heldAt`, and for each entry the type, key, and a one-line payload summary
(no raw JSON dump). Shown **even when there are no unbound scopes**.
Export of the hold is included in the scoped export (Design C).

## 9. Fixtures (C1 red → C2/C4 green)

`dispatch.test.js`, synthetic localStorage and a fake `ApiService`:

1. `legacy_queue_migrates_to_hold_before_removal` — hold verified by
   read-back; legacy key removed only after; rerun creates no duplicates.
   *(C2)*
2. `quota_failure_preserves_originals` — `setItem` throws on the hold
   write → legacy key untouched, `syncPaused` reason set. *(C2)*
3. `old_bundle_enqueue_cannot_strip_v2_fields` — legacy-shaped enqueue
   lands in the legacy key, not the v2 key. *(C2)*
4. `owned_at_mutation_not_at_failure` — ownership fields equal the state
   at mutate time even if the principal changes before the failure.
   *(C4)*
5. `dispatch_fails_closed_on_owner_mismatch` — op for A, principal B → not
   sent, moved to hold `owner_mismatch`. *(C4)*
6. `generation_bump_mid_await_discards_completion` — response after bump
   applies nothing and removes nothing. *(C4)*
7. `newer_revision_wins` — two ops same `type:key`; older completes last;
   local state reflects the newer. *(C4)*
8. `non_idempotent_ambiguous_goes_to_hold` — `weight` op, network error
   after send → hold `ambiguous_result`, no retry; same for `workout` →
   retried (has `client_id`). *(C4)*
9. `syncToApi_and_backfill_use_gate` — under `unbound`, no `ApiService`
   write occurs, including `clearActiveWorkout`. *(C4)*
10. `pull_completion_requires_account_and_generation` — A→B→A sequence;
    B's pull response never writes into A's scope. *(C4)*
11. `no_web_locks_disables_auto_dispatch` — `navigator.locks` undefined →
    mutations queue, nothing sent, UI reason present. *(C4)*
12. `x_account_header_matches_snapshot` — header equals `op.accountId`,
    not the current principal, when they differ. *(C4)*

## 10. Open for cross-review (most likely contested)

1. Holding — not retrying — ambiguous `weight/template/exercise/
   assessment` results. Alternative is adding `client_id` to those models
   first (schema change, HIGH) so everything retries safely.
2. Disabling automatic dispatch without Web Locks, versus a best-effort
   single-tab heuristic.
3. Removing the post-`/me` and post-backfill flushes in favour of gate
   re-evaluation on the existing triggers.
4. Rewriting `syncToApi` and the backfill through `dispatch.mutate` in C4
   rather than leaving them as guarded direct calls.
5. Whether legacy ops with a `uid` equal to a *trusted* scope may be
   promoted automatically (position: no — `uid` was never an account).
