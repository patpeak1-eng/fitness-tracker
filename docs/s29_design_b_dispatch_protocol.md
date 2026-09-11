# S29 Design B — Durable dispatch protocol (revision 2)

> C0 design document. No code. Companion to the spec §6 item 6 and §3.2.
> Uses Design A revision 2's vocabulary and `A.subscribe`. Anchored to
> `2102e47` unless noted. Codex proposed the interface (Web Locks, header,
> Bearer snapshot, quarantined restore, hold-not-retry); drafted by the
> Claude session; queued for Codex's adversarial pass.
>
> **Revision 2 (2026-09-11) — from the cold cross-review:** (F2) the
> durable precondition included the session generation, so nothing ever
> drained after a reload; (F5) the write inventory was derived from
> `enqueue` calls and missed four direct writers and three flush triggers;
> (F6) "remove the legacy key after read-back" lost or duplicated ops
> written by an old tab; (F12) `source`/`origin` naming, no gate-transition
> trigger, 403 classification. All corrected.

## 1. Today (anchored)

- Queue key `fitness_sync_queue` (`SyncQueue.js:15`); dead letter `:19-20`
  (cap 20); `persistQueue` swallows quota errors (`:31-36`); `enqueue`
  (`:76-88`) dedupes by `type:key` (replace), accepts `uid = null`, spreads
  a fixed field set (an old bundle drops unknown fields); `flush`
  (`:105-151`) sends with current credentials, removes by id after the
  await (`:117-120`), dead-letters any non-401 4xx (`:131-137`).
- Triggers: `init` boot/online/visible (`:154-162`); `WorkoutContext.jsx:
  413` boot, `:555` after `/me`, `:1097` after backfill, `:2339` and
  `:2373` after food-log update/delete; manual `SyncStatusBadge.jsx:45`.
- Executors `WorkoutContext.jsx:344-411`: `workout`, `weight`,
  `assessment`, `profile_settings`, `template`, `template_update`,
  `exercise`, `food_log`, `food_log_update`, `food_log_delete`.
- **Complete write inventory** (every path that sends user data):
  1. queued producers — all inside failure catches: settings ×6
     (`:1182…1262`), timers (`TimerContext.jsx:227`), environments
     (`:766`), backfill (`:1096`), data mutations (`:1331, 1780, 2026,
     2227, 2249, 2293, 2322, 2333, 2356, 2367, 2440, 2512, 2594`);
  2. the direct call each of those makes first;
  3. backfill block (`:1008-1097`) — reconciles weights by `recorded_at`
     and assessments by `assessment_data.id` before pushing (`:1036-1093`);
  4. `StorageService.syncToApi` (`WorkoutContext.jsx:1148-1154` →
     `StorageService.js:429-457`): history save, active-workout **PUT or
     DELETE**;
  5. `Profile.jsx:99-101` `saveProfile({ stats })`, gated by
     `currentProfile?.email`;
  6. `WorkoutContext.jsx:2469` `deleteCustomTemplate` — destructive,
     direct, never queued;
  7. `CoachView.jsx:518` `sendCoachMessage` → writes `coach_messages`;
  8. `Settings.jsx:203` `deleteAccount`, gated by `Settings.jsx:81`
     (stored token, not the principal);
  9. pull completion writes in `refreshProfileData` (`:578-`), guarded
     only by scope at `:698`.
- Server idempotency: `(user_id, client_id)` unique on `workout_history`
  and `food_log` only (`models.py:138,145,253-259`).

## 2. Storage

- `fitness_sync_queue_v2` — active. Op: `{ id, revision, type, key,
  payload, accountId, scopeId, producerVersion, createdAt, attempts,
  lastError, idempotencyKey, state: 'pending' | 'inflight' }`. Enqueue
  **replaces** per `type:key` and increments `revision` (today's semantics,
  now explicit). No generation field — durable ops are not generation-
  scoped (F2).
- `fitness_sync_hold_v1` — held ops: `{ heldAt, reason, source, op }`.
  `reason ∈ 'legacy' | 'owner_mismatch' | 'ambiguous_result' |
  'unconfirmed'`; `source ∈ 'legacy_queue' | 'legacy_dead_letter' |
  'restore' | 'v2'`. **Field name is `source`** (C uses the same).
- Both keys are excluded from discovery and from `exportSnapshot`'s data
  set by an explicit prefix list shared with C (`fitness_sync_`,
  `fitness_bindings_`, C's staging/quarantine prefixes).
- Every write is read-back verified; `QuotaExceededError` or a mismatch
  is reported (`syncPaused` reason), and the caller's originals are kept.

## 3. Legacy migration — compare-and-remove, never lossy

On every boot, restore commit, and `storage` event for the legacy keys:
1. Read the legacy queue and dead letter; append each entry to the hold
   (`reason 'legacy'`, raw entry verbatim, keyed by content hash — rerun-
   safe).
2. Persist the hold; read back; verify.
3. **Re-read the legacy key immediately before removal.** If its content
   differs from step 1 (an old tab wrote meanwhile), migrate the delta
   and repeat; only when identical, remove. Bounded to three attempts,
   then leave the key and try next boot.
4. An old tab may **already have sent** an op that is now held (it
   iterates its own in-memory copy, `:112`). Therefore legacy hold entries
   are surfaced as **"unconfirmed — may already have reached the
   server"**, never "unsent", and are never auto-promoted. Types with a
   server key (`workout`, `food_log`) can be safely re-sent later by a
   user action; the others cannot without a reconcile (§5).

## 4. Producers — ownership at mutation

One path, `dispatch.mutate(type, key, payload, opts)`: stamps `accountId`,
`scopeId` from `A.state` at the moment of the user's action; tries the
request immediately with a **snapshotted Bearer** and
`X-Fitness-Account-Id`; on retryable failure enqueues; on ambiguous or
non-idempotent failure holds (§5). All nine inventory items above route
through it in C4 — including `syncToApi`'s active-workout DELETE, the
custom-template DELETE, `Profile.jsx`'s stats save, and coach chat.
`Settings.jsx`'s account deletion does not queue but uses the same gate and
`A.state.principalSource` (Design A §7). `canSyncToBackend` and every
`currentProfile?.email` gate are replaced by
`A.state.bindingStatus === 'trusted' && A.state.authState === 'authenticated'`.

## 5. Dispatch gate, completion, idempotency

- **Durable precondition** (checked at dispatch and at each await
  boundary): `op.accountId === A.state.principal && op.scopeId ===
  A.state.scopeId && bindingStatus === 'trusted' && authState ===
  'authenticated'`. Owner mismatch → hold (`owner_mismatch`). Status not
  trusted/authenticated → stays queued (drains when it becomes so).
- **In-flight only:** the request is created under generation N with
  `A.state.signal`; a bump aborts it and its completion is discarded. The
  op returns to `pending` (not lost).
- **Completion:** applied only if `op.revision` is still the newest for
  `type:key`; otherwise discarded, and the newer op is not removed.
- **Idempotency classes (all ten types + direct paths):**
  - safe to retry: `workout`, `food_log` (server `client_id`);
    `profile_settings`, `template_update`, `food_log_update`,
    `food_log_delete`, active-workout PUT/DELETE, template DELETE (PUT/
    DELETE are idempotent by target);
  - **not safe**: `weight`, `template`, `exercise`, `assessment` creates
    (no server key). Ambiguous outcome → hold `ambiguous_result`.
    Reconciliation option before any re-send: the backfill's own
    fingerprints (weights by `recorded_at`, assessments by
    `assessment_data.id`, `:1036-1093`) can confirm presence via a pull —
    used by the recovery screen's "check" action; templates/exercises
    reconcile by name+content. Adding `client_id` to those four models is
    the stage-2 follow-up that retires this class.
- **403 from `require_account_match`** → hold `owner_mismatch` (replaces
  the blanket 4xx dead-letter at `:131-137`).
- **Triggers:** `A.subscribe` on any transition to
  trusted+authenticated (replaces the post-`/me` and post-backfill
  flushes); online; visible; the manual badge. Boot alone does not
  dispatch until the gate is true.
- Serial dispatch; `type:key` order preserved.

## 6. Two tabs

- Queue/hold read-modify-write and dispatch run under
  `navigator.locks.request('fitness-sync')`. Without Web Locks
  (`A.state.crossTabSafe === false`): mutations still queue; automatic
  dispatch is disabled; "sync paused — open the app in one tab".
- `storage` events on the queue, hold, bindings, and logout-marker keys
  invalidate in-memory copies; a bindings/marker change requests
  `A.transition('principalChanged')`.
- Residual: an old-bundle tab holds no lock and can send with the shared
  cookie; the header is optional in stage 1. Mitigated by the update
  prompt and stage-2 rejection; stated, not solved.

## 7. Pull completion

Reads are issued under `(accountId, scopeId)` + the in-flight signal;
completion writes apply only if both still match and status is trusted.
Replaces the scope-only guard at `:698`.

## 8. Recovery screen (hold)

Counts by `reason` and `type`, oldest/newest `heldAt`, per-entry type/key/
summary; "unconfirmed" wording for legacy; a "check against server"
action for weight/assessment via the reconcile above; shown even with no
unbound scopes; included in C's scoped export.

## 9. Fixtures (C1 red → C2/C4 green)

1. `legacy_migrates_compare_and_remove` — old-tab write between read and
   removal is migrated, not lost. *(C2)*
2. `quota_failure_preserves_originals` *(C2)*
3. `old_bundle_enqueue_cannot_strip_v2_fields` *(C2)*
4. `owned_at_mutation_not_at_failure` *(C4)*
5. `dispatch_fails_closed_on_owner_mismatch` *(C4)*
6. `generation_bump_aborts_inflight_and_op_returns_to_pending` *(C4)*
7. `persisted_op_drains_after_reload` — F2 regression. *(C4)*
8. `newer_revision_wins` *(C4)*
9. `non_idempotent_ambiguous_goes_to_hold; idempotent_retries` *(C4)*
10. `all_nine_write_paths_use_gate` — under `unbound`, zero `ApiService`
    writes including `deleteCustomTemplate`, `saveProfile({stats})`,
    coach chat, active-workout DELETE. *(C4)*
11. `pull_completion_requires_account_and_status` *(C4)*
12. `no_web_locks_disables_auto_dispatch` *(C4)*
13. `x_account_header_matches_snapshot` *(C4)*
14. `require_account_match_403_becomes_owner_mismatch_hold` *(C4)*
15. `gate_transition_triggers_flush` — becoming trusted+authenticated
    dispatches without a visibility change. *(C4)*

## 10. Contested points

1. Hold-not-retry vs reconcile-by-pull vs `client_id` first for the four
   create types.
2. Disabling auto-dispatch without Web Locks.
3. Routing account deletion and coach chat through the same gate (adds
   friction under `conflict`, by design).
