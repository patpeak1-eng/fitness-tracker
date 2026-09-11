# S29 Design B — Durable dispatch protocol (revision 4)

> C0 design document. No code. Consumes Design A revision 4's state.
> Anchored to `6059452`.
>
> **Revision 4 (2026-09-11) — the adversarial pass found that client-side
> ordering cannot fix an already-sent stale mutation, and it is right.**
> `backend/app/routers/workouts.py:133-141` is
> `delete(ActiveWorkout).where(ActiveWorkout.user_id == current_user.id)` —
> no version, no precondition, nothing to reject a late request with. A
> DELETE that reached the server and stalled will erase whatever is there
> when it finally executes, including a workout saved after it. Aborting
> locally does not cancel server work, and a Web Lock dies with its tab.
> **This requires a server-side fence** (§6), which is new backend scope.
> Also fixed: unconditional replacement destroyed ambiguity evidence;
> "supersedes" was never defined and was wrong for partial updates;
> admission was unspecified for four of the six auth states; hold growth
> was unbounded; and deferred producers read state after the user's action
> rather than at it.

## 1. Two record kinds (this is the revision-4 shape change)

Revision 3 had one record that was both "what the user wants" and "what we
tried", and replaced it wholesale on the next edit — which discarded the
evidence that an earlier create might already be on the server.

**Desired state** (`fitness_sync_desired_v1`) — replaceable:

```
{ dedupeKey,            // `${accountId|'-'}:${scopeId}:${type}:${field}`
  resourceKey,          // `${family}:${resourceId}` — owner-scoped
  revision,             // per dedupeKey
  type, field, key, payload,
  accountId, scopeId, producerVersion, updatedAt }
```

**Attempts** (`fitness_sync_attempts_v1`) — append-only, never replaced:

```
{ attemptId,            // uuid
  dedupeKey, resourceKey, revision,
  idempotencyKey,       // the server client_id where one exists
  startedAt, phase,     // 'persisted' | 'sent' | 'settled'
  outcome }             // null | 'applied' | 'rejected' | 'ambiguous'
```

An edit replaces desired state and leaves every attempt intact. An
unresolved `ambiguous` attempt therefore survives edits, backfills, and
restarts — which is what stops a duplicate create.

`fitness_sync_hold_v1` unchanged in shape; `reason ∈ 'legacy' |
'owner_mismatch' | 'ambiguous' | 'unowned'`, `source ∈ 'legacy_queue' |
'legacy_dead_letter' | 'restore' | 'v2'`.

Reserved prefixes (shared with A and C): `fitness_sync_`,
`fitness_bindings_`, `fx_staging_`, `fx_quarantine_`, `fx_journal_`.

## 2. Supersession — defined per type, not assumed

Revision 3 said a newer record "supersedes" an older one. That is false in
two verified cases:

- **Profile settings are partial.** `routers/profile.py:45-57` does
  `model_dump(exclude_unset=True)` then `setattr` per field. A `theme`
  update and a `units` update touch different columns; neither supersedes
  the other. `dedupeKey` therefore includes **`field`**, not just `type`.
- **An update cannot supersede an unsent create.** The `food_log_update`
  executor (`WorkoutContext.jsx:395-407`) resolves a backend id and, when
  there is none, **silently succeeds without writing anything**. Dropping
  the create in favour of the update would lose the row entirely.

| Family | Supersedes an earlier unsent record? |
|---|---|
| `profile_settings` | only the **same field** |
| `workout`, `food_log` (create) | never — server-keyed, both are real rows |
| `weight`, `template`, `exercise`, `assessment` (create) | never |
| `*_update`, `*_delete` | only a record for the **same resource id**, and only if that record is `persisted` and never sent |
| active workout PUT/DELETE | same resource, never-sent only |

Nothing that has reached `phase: 'sent'` is ever dropped by supersession.

## 3. Admission — all six auth states

Ownership is captured **at the user's action**, not in an effect that runs
later. Settings producers are effects (`WorkoutContext.jsx:1170-1185`), so
the owner is passed **into** the effect from the action that caused it;
reading `A.state` inside the effect is not mutation-time capture.

| `authState` / `bindingStatus` | Admission |
|---|---|
| `authenticated` + `trusted` | owned intent, `accountId = principal` |
| `authenticated` + `conflict` | `accountId = A.state.scopeOwner` (may be `null`) |
| `authenticated` + `unbound` | **no cloud intent**: local persistence only, `accountId = null` |
| `expired` | local only, `accountId` = last trusted owner for that scope, else `null` |
| `none` / `loggedOut` | local only, `accountId = null` |

A `null` owner **never** manufactures an intent and never dispatches. It
waits in the hold as `unowned` with an explicit user action to resolve it.

**One lifecycle for mismatches** (revision 3 said "hold" in one place and
"wait then dispatch" in another): an op whose owner is not the current
principal goes to the **hold** with `owner_mismatch`, and the recovery
screen offers "send these when `<email>` signs in". Nothing dispatches
automatically on an owner's return.

## 4. Admission steps and crash behaviour (six, not five)

1. Persist desired state. *Crash here: nothing was promised; the local
   mutation is already in app storage and is reconstructed from it.*
2. Append an attempt, `phase: 'persisted'`. *Crash: safe to retry.*
3. Mark `phase: 'sent'` **and verify that write** before calling `fetch`.
   *Crash before fetch: conservatively `ambiguous`. Crash after: the
   server may or may not have committed.*
4. Await the response. *Crash: `ambiguous`.*
5. On success, write any `backendId` write-back (executors do this at
   `WorkoutContext.jsx:347-384`) **and then** durably settle the attempt
   `applied`. A crash between them re-reads as `ambiguous`, which is
   correct — the write-back is what makes a later update addressable.
6. On an explicit rejection known not to have applied (4xx that is not
   403/409), settle `rejected` and return desired state to eligible.

Boot recovery promotes every `sent`-but-unsettled attempt to `ambiguous`.
**Exactly-once HTTP execution is not promised and is not claimed**;
server-keyed types tolerate a second execution without duplicating a row.

## 5. Dispatch gate

`op.accountId === A.state.principal && op.scopeId === A.state.scopeId &&
bindingStatus === 'trusted' && authState === 'authenticated' && !paused`.
Checked at dispatch and at every await boundary. Owner mismatch → hold;
`null` owner → hold (`unowned`); not-yet-trusted → stays eligible and
drains when it becomes trusted (never generation-gated — that was
revision 1's bug). Generation gates in-flight work only.

Triggers: `A.subscribe` on any transition into trusted + authenticated +
not paused, plus online, visible, and the manual badge — **all** subject
to the `crossTabSafe` guard in §7.

## 6. Resource fencing — the part that needs the server

**Stated plainly: no client-side rule can make this safe.** Once a request
is in flight, the client cannot recall it, and the server has no way to
tell a stale one from a current one:

- active workout DELETE: `workouts.py:133-141`, deletes by `user_id` only.
- active workout PUT: `:96-127`, overwrites with no precondition.

Two changes, both stage-1 backend work and both new scope this revision
introduces:

1. **A monotonic fence per resource.** `active_workout` gains
   `client_seq BIGINT NOT NULL DEFAULT 0`. Every PUT and DELETE carries
   the client's sequence for that resource; the server applies the change
   only `WHERE client_seq < :incoming` and returns 409 otherwise. A late
   DELETE with an old sequence is a no-op instead of data loss. Schema +
   migration + both handlers + the client.
2. **Until that ships, block the resource.** A resource with an
   unresolved `ambiguous` attempt admits no further dispatch — local edits
   continue, nothing is sent for that resource — and the recovery screen
   shows "one change to your active workout is unconfirmed". A pull cannot
   prove a still-running request has ended, so the block clears only on an
   authoritative outcome or an explicit user action.

## 7. Two tabs

Desired state, attempts, hold, and dispatch all run under
`navigator.locks.request('fitness-sync')`.

**Without Web Locks** (`crossTabSafe === false`) revision 3 still allowed
shared-array writes, so two tabs could lose each other's records even with
dispatch off. Revision 4: **cloud-intent admission is paused** and records
are written under **per-operation keys** (`fitness_sync_attempts_v1:<uuid>`)
rather than one shared array, so no tab can clobber another's. Local edits
continue and are recoverable. The manual dispatch button obeys the same
guard. "Open one tab" is advice, not a mechanism, and is not relied on.

`storage` events invalidate in-memory copies; a bindings or marker change
requests `A.transition('principalChanged')`.

**Residual:** an old-bundle tab holds no lock, can still write the legacy
key, and can still send with a valid token — rejecting old *login*
endpoints does not revoke a token it already has. Stage-3 deletion of the
legacy keys therefore needs positive evidence no old bundle can run, not
just the login rejection.

## 8. Legacy migration — copy, never remove, with semantic identity

Copied into the hold on every boot, restore, and `storage` event; **never
removed** until stage 3 (an unlocked old tab can write between a read and
a removal). Identity for idempotence is **semantic**: `type`, `key`,
normalised `payload`, and `uid` — explicitly **excluding** `attempts`,
`lastError`, `heldAt`, and any wrapper nesting, so an old tab's retry
metadata does not manufacture a new entry and a repeated import does not
grow the hold. Versions of a changed payload are preserved as distinct
entries under the same semantic id.

**Bounded storage:** the hold has an explicit cap. On reaching it, nothing
unresolved is evicted; instead admission of new cloud intent pauses and
the UI reports "sync storage full". `SyncQueue.js:20` bounds only the dead
letter today, and `enqueue` `:76-86` has no cap at all.

Held entries are labelled "unconfirmed — may already have reached the
server", never "unsent".

## 9. Fixtures (C1 red → C2/C4 green)

Attempt/desired separation: `edit_does_not_discard_ambiguous_attempt`;
`ambiguous_create_survives_backfill_and_restart`.
Supersession: `theme_does_not_supersede_units`;
`food_update_does_not_supersede_unsent_create`;
`sent_records_are_never_superseded`.
Admission: `crash_at_each_of_six_steps`;
`backendId_writeback_crash_is_ambiguous`;
`null_owner_never_dispatches`; `unbound_admits_no_cloud_intent`;
`deferred_effect_uses_action_time_owner`.
Fencing: `late_delete_after_newer_put_is_rejected_by_seq`;
`resource_blocked_while_ambiguous_pre_fence`.
Cross-tab: `no_web_locks_pauses_admission_and_uses_per_op_keys`;
`two_unlocked_tabs_do_not_clobber`.
Legacy: `semantic_identity_is_stable_across_retry_metadata`;
`hold_cap_pauses_admission_without_evicting`.
Plus the revision-3 set: owner-scoped dedupe, exact id+revision
acknowledgement, legacy copy-never-remove, owner mismatch to hold, pull
gated by account+scope+generation, 403 to `owner_mismatch`.

## 10. Contested

1. Adding `client_seq` to `active_workout` — new schema, and the only
   honest fix for §6.
2. Blocking a resource after ambiguity until the fence exists.
3. Pausing cloud-intent admission entirely without Web Locks.
