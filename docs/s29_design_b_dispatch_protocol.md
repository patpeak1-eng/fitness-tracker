# S29 Design B — Durable dispatch protocol (revision 3)

> C0 design document. No code. Companion to the spec §6 item 6 and §3.2;
> consumes Design A revision 3's state object. Anchored to `59eb7a8`.
>
> **Revision 3 (2026-09-11) — from the Codex adversarial pass, all four
> findings verified in source before adoption:**
> - Dedupe and acknowledgement were still keyed by `type:key`, which is
>   literally the existing op id (`SyncQueue.js:77,79`), so two accounts'
>   settings ops overwrite each other *before* any ownership check runs.
>   The owner gate cannot save an op that has already been deleted.
> - Aborted requests were returned to `pending`, contradicting this
>   document's own ambiguity rule: an abort does not undo a commit the
>   server already made.
> - Ops were sent **before** being persisted, so a crash could leave
>   neither a queue entry nor a hold entry.
> - "Compare-and-remove is never lossy" was false: the old tab can write
>   between the final read and the removal.
> Also fixed: coach chat was inventoried but unclassified; "PUT/DELETE are
> idempotent by target" ignored stale ordering (an old active-workout
> DELETE can erase a newer save).

## 1. Today (anchored, unchanged)

`fitness_sync_queue` (`SyncQueue.js:15`); dead letter `:19-20` (cap 20);
`persistQueue` swallows quota failure `:31-36`; `enqueue` `:76-88` filters
by `op.type === type && op.key === key` and sets **`id: \`${type}:${key}\`**
— identity and dedupe are the same tuple, with no owner in it; `flush`
`:105-151` sends with current credentials and removes by id after the
await `:117-120`; non-401 4xx is dead-lettered `:131-137`. Triggers:
`init` boot/online/visible `:154-162`; `WorkoutContext.jsx:413`, `:555`,
`:1097`, `:2339`, `:2373`; manual `SyncStatusBadge.jsx:45`.

Complete write inventory (unchanged from revision 2, re-verified): the ten
queued executors `WorkoutContext.jsx:344-411`; every producer's direct
call; the backfill `:1008-1097` (reconciles weights by `recorded_at`,
assessments by `assessment_data.id`, `:1036-1093`); `syncToApi`
(`:1148-1154` → `StorageService.js:429-457`, history save plus active
workout **PUT or DELETE**); `Profile.jsx:99-101`; `WorkoutContext.jsx:2469`
`deleteCustomTemplate`; `CoachView.jsx:518` coach chat; `Settings.jsx:203`
account deletion; pull completion `:578-`, guarded only by scope at `:698`.

Server idempotency exists only on `workout_history` and `food_log`
(`models.py:138,145,253-259`).

## 2. Storage

`fitness_sync_queue_v2` (active) — each record:

```
{ id,                       // uuid, NOT derived from type:key
  dedupeKey,                // `${accountId|'-'}:${scopeId}:${type}:${key}`
  revision,                 // per dedupeKey counter
  resourceKey,              // `${family}:${resourceId}` for ordering (§5)
  type, key, payload,
  accountId, scopeId,       // ownership, stamped at mutation (§4)
  producerVersion, createdAt,
  attempts, lastError,
  idempotencyKey,           // uuid; the server client_id where one exists
  state }                   // 'pending' | 'inflight' | 'ambiguous'
```

`fitness_sync_hold_v1` — `{ heldAt, reason, source, op }` with
`reason ∈ 'legacy' | 'owner_mismatch' | 'ambiguous' | 'unowned'` and
`source ∈ 'legacy_queue' | 'legacy_dead_letter' | 'restore' | 'v2'`.

Reserved prefixes excluded from discovery and from the scoped export,
shared with A and C: `fitness_sync_`, `fitness_bindings_`, `fx_staging_`,
`fx_quarantine_`, `fx_journal_`. **The hold is included in the full backup
export and excluded from the recovery screen's scoped export** — matching
Design C §4, which revision 2 contradicted.

Every write is read-back verified; a quota failure or mismatch is reported
(`syncPaused`) and leaves the caller's originals intact.

## 3. Legacy migration — copy, never remove

Revision 2 claimed compare-and-remove was safe. It is not: an old bundle's
`enqueue` is a read-modify-write on the legacy key with no lock, so
between the new tab's final read and its `removeItem` the old tab can
write an op that removal then destroys.

**The legacy keys are therefore never removed by the upgraded client.**
Instead, on every boot, restore commit, and `storage` event:

1. Read the legacy queue and dead letter.
2. Append each entry not already present to the hold, keyed by a content
   hash (`reason 'legacy'`, raw entry verbatim), and persist with
   read-back verification. Re-running is a no-op for entries already held.
3. Record the migrated hashes. Nothing is deleted.

The legacy keys are small and bounded; leaving them costs a few kilobytes
and removes an entire class of race. They are deleted in stage 3, once no
old bundle can still be running.

Held legacy entries are labelled **"unconfirmed — may already have reached
the server"**, never "unsent": an old tab iterating its own in-memory copy
(`:112`) may have sent them. They are never auto-promoted.

## 4. Admission — persist before send

One path, `dispatch.mutate(type, key, payload, opts)`:

1. Stamp ownership from `A.state` **at the moment of the user's action**:
   `accountId` is `A.state.principal` when `bindingStatus === 'trusted'`;
   under `conflict` it is `A.state.scopeOwner` (or `null`), per Design A
   §7 — never the currently signed-in account.
2. **Persist the record as `pending`** with its `dedupeKey`, `revision`,
   `resourceKey`, and `idempotencyKey`. Dedupe replaces any existing
   record with the same `dedupeKey` and increments `revision`.
3. Only then attempt the immediate send, marking the record `inflight`
   with an attempt id.
4. On success: acknowledge by **exact `id` + `revision`**, and only if
   that record is still the newest for its `dedupeKey`.
5. On a retryable failure: back to `pending`.
6. On an ambiguous outcome (abort, network error after send, 5xx) or a
   crash: the record is `ambiguous` (§5) — **not** `pending`.

A crash between 2 and 3 leaves a `pending` record that was never sent:
safe. A crash after 3 leaves an `inflight` record, which boot recovery
promotes to `ambiguous`, because the server may have committed.

All nine inventory paths route through this in C4, including
`syncToApi`'s active-workout DELETE, `deleteCustomTemplate`,
`Profile.jsx`'s stats save, and coach chat. `canSyncToBackend` and every
`currentProfile?.email` gate are replaced in C4 — Design C §2 explains
why they cannot be replaced earlier.

## 5. Dispatch, ordering, and idempotency classes

**Durable precondition** (at dispatch and at every await boundary):
`op.accountId === A.state.principal && op.scopeId === A.state.scopeId &&
bindingStatus === 'trusted' && authState === 'authenticated' && !paused`.
Owner mismatch → hold (`owner_mismatch`); `op.accountId === null` → hold
(`unowned`); status not yet trusted → **stays queued** and drains when it
becomes trusted (the generation is *not* part of this test — that was
revision 1's bug, which meant nothing ever drained after a reload).

**In-flight only:** requests are created under generation N with
`A.state.signal`; a bump aborts them and their completions are discarded.

**Resource ordering.** Each record carries `resourceKey`. Dispatch is
serial per `resourceKey`, and a record is **dropped rather than sent** if
a newer record exists for the same `resourceKey` and the newer one
supersedes it. This is what stops a stale active-workout DELETE from
erasing a workout saved after it — "PUT and DELETE are idempotent by
target" is true in isolation and false against a newer mutation.

**Idempotency classes — every type and direct path:**

| Class | Members | On ambiguity |
|---|---|---|
| Server-keyed, safe to retry | `workout`, `food_log` (unique `(user_id, client_id)`) | retry |
| Target-idempotent **and** ordering-checked | `profile_settings`, `template_update`, `food_log_update`, `food_log_delete`, active-workout PUT/DELETE, `deleteCustomTemplate`, `saveProfile({stats})` | retry only if newest for its `resourceKey` |
| **Not safe** — no server key | `weight`, `template`, `exercise`, `assessment` creates, **and coach chat** (`CoachView.jsx:518` appends a message; a blind resend duplicates a conversation turn) | hold `ambiguous`; offer the recovery screen's reconcile |

Reconcile uses fingerprints the backfill already computes
(`:1036-1093`): weights by `recorded_at`, assessments by
`assessment_data.id`, templates and exercises by name plus content, coach
messages by timestamp plus text. **A server idempotency key alone does not
establish ownership** — a legacy or restored held op is only ever resumed
into the account the user names, never inferred from the key.

**403 from `require_account_match`** → hold `owner_mismatch`, replacing
the blanket 4xx dead-letter at `:131-137`.

**Triggers:** `A.subscribe` on any transition into trusted + authenticated
+ not paused (replacing the post-`/me` and post-backfill flushes), plus
online, visible, and the manual badge.

## 6. Two tabs

Queue and hold read-modify-write, and dispatch, run under
`navigator.locks.request('fitness-sync')`. Without Web Locks
(`crossTabSafe === false`): mutations still persist as `pending`,
automatic dispatch is disabled, and the UI says "sync paused — open the
app in one tab". `storage` events invalidate in-memory copies; a bindings
or marker change requests `A.transition('principalChanged')`.

**Residual, stated exactly:** an old-bundle tab holds no lock and can
still send with the shared cookie, and can still write the legacy key
(which is why §3 never removes it). The header is optional in stage 1, so
the server cannot reject those. Mitigated only by the update prompt and
stage 2's rejection.

## 7. Pull completion

Issued under `(accountId, scopeId)` and the in-flight signal; completion
writes apply only if both still match, the status is still trusted, and
the generation is unchanged — covering A→B→A and same-scope auth changes.
Replaces the scope-only guard at `:698`.

## 8. Recovery screen

Counts by `reason` and `type`, oldest and newest `heldAt`, per-entry
type/key/summary, "unconfirmed" wording for legacy and ambiguous entries,
and a "check against the server" reconcile for the classes above. Shown
even when there are no unbound scopes.

## 9. Fixtures (C1 red → C2/C4 green)

1. `dedupe_is_per_owner_scope_type_key` — A's and B's settings ops coexist. *(C2)*
2. `ack_requires_exact_id_and_revision` *(C2)*
3. `legacy_is_copied_never_removed; old_tab_write_after_read_survives` *(C2)*
4. `quota_failure_preserves_originals` *(C2)*
5. `persist_before_send; crash_between_persist_and_send_is_pending` *(C2)*
6. `inflight_recovered_at_boot_is_ambiguous_not_pending` *(C4)*
7. `owned_at_mutation_not_at_failure` *(C4)*
8. `conflict_mutation_stamped_scope_owner_or_null_never_current` *(C4)*
9. `dispatch_fails_closed_on_owner_mismatch_and_unowned` *(C4)*
10. `persisted_op_drains_after_reload` *(C4)*
11. `stale_delete_dropped_when_newer_save_exists` *(C4)*
12. `coach_chat_ambiguous_is_held_not_resent` *(C4)*
13. `all_nine_write_paths_use_gate` *(C4)*
14. `pull_completion_requires_account_scope_and_generation` *(C4)*
15. `no_web_locks_disables_auto_dispatch` *(C4)*
16. `x_account_header_matches_snapshot` *(C4)*
17. `403_becomes_owner_mismatch_hold` *(C4)*
18. `gate_transition_triggers_flush` *(C4)*

## 10. Contested

1. Never removing the legacy keys until stage 3 (costs a few KB; removes a
   race class).
2. Holding ambiguous coach-chat turns rather than resending.
3. Disabling automatic dispatch without Web Locks.
