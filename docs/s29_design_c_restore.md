# S29 Design C — Backup restore transaction (revision 4)

> **Revision 4 (2026-09-11) — three corrections from the adversarial pass.**
> 1. **The destination mapping could collapse data.** Revision 3 sent a
>    whole backup to one `restored_<hash>` namespace while promoting the
>    profiles list and selection verbatim. A backup containing **two**
>    source scopes with history would have merged them into one target.
>    §3a now defines an **injective source→target map**, rewrites list and
>    selection ids through it, keeps conflicting raw representations, and
>    checks each target for freshness against discovered keys *and*
>    bindings under the lock — the deterministic name could already exist,
>    and Design A can transfer an unbound scope on a later login.
> 2. **The journal narrowed crashes but not quota failure or other tabs.**
>    Staging can fit while the promoted set does not, so a live-write
>    failure could replay forever; and `paused` is one tab's in-memory
>    state, so a second tab could write during the commit. §3 now keeps
>    rollback values, reserves capacity, and puts a **durable barrier key**
>    plus the shared `fitness-sync` lock in front of hydration, mutation,
>    and dispatch in *every* tab.
> 3. **A same-snapshot re-import could not be detected** once the journal
>    was deleted, so it could hit an already-bound destination. §3b adds a
>    durable receipt. Trusted replacement now revalidates its captured
>    account, scope, and generation at commit, exactly as Design A's
>    transfer does.

> C0 design document. No code. Consumes Design A revision 3's state and
> events; uses Design B revision 3's hold format. Anchored to `59eb7a8`.
>
> **Revision 3 (2026-09-11) — from the Codex adversarial pass:**
> - The commit was not recoverable. A crash or quota failure **during the
>   live writes** (not staging, which was the only case covered) left the
>   device half-restored with no way back. Step 4 also deleted staging
>   before step 5 still needed it.
> - Restoring over a **trusted** scope silently replaced that account's
>   data and then uploaded it. Quarantining imported *bindings* does not
>   prevent that — the danger was the data keys.
> - Stripping `email` from restored list entries was treated as an interim
>   authorisation fix; it is not. It would suppress eleven legitimate
>   cloud-write paths in `WorkoutContext` plus `Profile.jsx:54,99`,
>   `Settings.jsx:465`, `CoachView.jsx:1025`.
> - `restoreBegin` was requested from A, which had no such event.
> - Imported hold entries kept their apparent original `source`.
> - Export contents contradicted Design B.

## 1. Current behaviour (anchored)

`exportSnapshot()` (`StorageService.js:390-399`) dumps every `fitness_*`
key plus the coach keys — data, the profiles list, `currentProfileId`, the
auth token, the logout marker, the queue and dead letter.
`importSnapshot(data)` (`:401-427`) validates only that *some* key starts
with `fitness_` (`:403-405`), **removes every current matching key first**
(`:410-414`), then writes and throws on failure *after* the removal.
Handler `Profile.jsx:163-183` → `importData` (`WorkoutContext.jsx:2800`)
→ `window.location.reload()` (`:2809`).

## 2. Key classification

Reserved prefixes (shared with A and B, excluded from discovery and from
`exportSnapshot`'s data set): `fitness_sync_`, `fitness_bindings_`,
`fx_staging_`, `fx_quarantine_`, `fx_journal_`. The `fx_` prefixes sit
deliberately outside `fitness_` so neither the current exporter nor an old
bundle's importer can see them.

| Class | Keys | Treatment |
|---|---|---|
| **Data** | every `PROFILE_SCOPED_BASE_KEYS` entry in both forms (`:43-67`, `:91-92`) plus the global data keys | promoted **into a recovery namespace** (§3), not over a live scope, unless the user explicitly authorises replacement |
| **Selection** | profiles list, `currentProfileId` | promoted **verbatim, including `email`** — see below; selection applied only if that scope exists after promotion |
| **Session authority** | auth token, logout marker | never restored |
| **Queue** | legacy queue, dead letter, v2 active queue, v2 hold | never promoted to the active queue; every entry lands in the hold with **`source: 'restore'`** regardless of its apparent origin |
| **Bindings** | `fitness_bindings_v1` | quarantine only, `provenance: 'imported'`; A's inheritance reads only its own store |
| **Unknown** | any other `fitness_*` key | quarantined verbatim |

**Why `email` is no longer stripped.** Revision 2 stripped it to make the
pre-C4 email gates inert on restored entries. That was the wrong lever: it
would also disable legitimate syncing for a restored profile, in eleven
`WorkoutContext` cloud-write sites plus three pages. The correct sequencing
is the one Design B already states — **restore stays inert until C4**.
C2 ships the parser, staging, journal, and quarantine helpers with no live
entry point; the Import button keeps today's behaviour until C4 replaces
the email gates with `A.state` reads in the same release.

## 3. The transaction (journaled and recoverable)

A durable journal at `fx_journal_<snapshotHash>` records
`{ phase, stagedKeys, targetKeys, startedAt }` with
`phase ∈ 'staged' | 'committing' | 'committed'`.

1. **Parse and classify** in memory. Reject only if there are no data keys
   at all. Unparseable values are quarantined verbatim; the user is told
   which scope held them.
2. **Choose a destination.** Default: a **recovery namespace** —
   `restored_<snapshotHash>` — which is by construction unbound, so
   nothing about it can dispatch. Promoting into the **currently selected
   trusted scope** requires a separate confirmation naming the account
   ("Replace the data for `<email>` on this device"), because that action
   both overwrites and, once trusted, uploads.
3. **Stage** the promoted set under `fx_staging_<hash>_…` with read-back
   verification. Quota failure → delete staging, live state untouched,
   surface the error. Journal `phase: 'staged'`.
4. **Boundary:** `A.transition('restoreBegin')` — A bumps the generation,
   sets `paused: true`; Design B stops dispatching for the whole commit.
5. **Persist the hold additions and verify them**, *before* any staging is
   discarded — revision 2 had these in the wrong order.
6. Journal `phase: 'committing'`, then write the live keys from staging.
7. Journal `phase: 'committed'`, then delete staging and the journal.
8. `A.transition('restoreCommitted')` — A clears `paused`, re-runs
   discovery, re-evaluates `bindingStatus`. **The restore itself issues no
   `/me` and no pull.** Selection changes only as §2 allows, and Design A
   §5 re-derives status; the two documents now agree.

## 3a. Destination mapping (injective)

A backup may contain many source scopes. The transaction builds a map
`sourceScopeId → targetScopeId`, one target per source, never shared:

- Each target is `restored_<snapshotHash>_<sourceShort>`, and each is
  checked for freshness under the shared lock against discovered storage
  keys **and** the bindings store. A collision re-rolls the suffix.
- Legacy-form keys (`base_uid`, `StorageService.js:92`) and modern-form
  keys (`:91`) for the same source resolve to the same target; where both
  exist and disagree, both are preserved — the modern form is promoted and
  the legacy one is quarantined verbatim rather than silently dropped.
- Global (non-scoped) data keys belong to no source scope and are
  quarantined unless the user chose trusted replacement.
- The profiles list and `currentProfileId` are **rewritten through the
  map**: entries whose scope has a target are promoted with the target id;
  entries with no mapped data are dropped from the list and recorded in
  the receipt. This is why the list can no longer be promoted "verbatim".
- **Trusted replacement targets exactly one source scope**, chosen by the
  user, never an implicit merge of everything in the backup. Its captured
  `(account, scope, generation)` are revalidated under the lock at commit,
  and a mismatch aborts.

## 3b. Durable receipt

`fx_receipt_<snapshotHash>` is written in the same step that marks the
journal `committed` and is **never deleted**: `{ snapshotHash, targets,
committedAt, listRewrites, droppedEntries }`. A re-import of the same file
is detected from the receipt after the journal is gone, and is a no-op
with a message rather than a second promotion into a now-bound
destination.

**Boot recovery.** A journal in `phase: 'committing'` means a crash
mid-write: staging still exists, so re-apply every `targetKey` from
staging and finish the phases. `'staged'` means nothing was written:
delete staging and the journal. `'committed'` means only cleanup
remained. Recovery runs before any dispatch.

**Peak storage** is live data **plus** staging **plus** the promoted set
**plus** hold and quarantine — not "twice the incoming set". If staging
cannot be written, the restore does not start.

**Quota during the live writes, and rollback.** Staging fitting does not
mean the promoted set fits alongside live data. Before entering
`committing` the transaction **reserves capacity** by writing and deleting
a probe of the promoted set's size, and it records the **previous value of
every target key** in the journal. A live-write failure therefore rolls
back from the journal instead of replaying forever; if rollback itself
cannot complete, the barrier (below) stays set and the app opens in a
read-only recovery mode rather than showing partial state as if it were
real.

**Every tab, not just this one.** `A.state.paused` is in-memory and local.
The transaction additionally sets a **durable barrier key**
(`fx_barrier`) and holds the shared `fitness-sync` lock (Design B §7).
Every tab checks the barrier **before hydration, before any mutation, and
before dispatch** — so a second tab cannot write into a half-committed
device. The barrier is cleared only by `committed` or by a completed
rollback; a crash leaves it set, and boot recovery runs **before** normal
hydration.

## 4. Export

- **Excludes** the auth token and the logout marker (a backup is not a
  session).
- **Includes** data, the profiles list and selection, and the v2 active
  queue **and hold** (so pending work survives) — matching Design B §2.
- Bindings are included as metadata and are quarantined on import
  regardless.
- Adds a `_meta` entry: format version, app version, export time,
  classification map. Backups without `_meta` are classified by key name.
- The recovery screen's **scoped** export is the narrower artifact: one
  scope, data keys only, both key formats, unparseable values verbatim —
  no session, queue, hold, or binding keys.

## 5. Fixtures (C1 red → C2 parsers/staging/journal, C4 boundary)

1. `restore_never_writes_token_or_marker`
2. `quota_failure_during_staging_leaves_live_state_intact`
3. `crash_during_live_writes_is_recovered_from_journal_at_boot`
4. `staging_not_deleted_before_hold_is_verified`
5. `default_destination_is_recovery_namespace_not_trusted_scope`
6. `replacing_a_trusted_scope_requires_named_confirmation`
7. `restored_queue_and_hold_entries_all_have_source_restore`
8. `restored_bindings_land_in_quarantine_only`
9. `restore_issues_no_me_and_no_pull_itself`
10. `restored_list_entries_keep_email` — and the C4 gate replacement is
    what makes that safe.
11. `unparseable_value_is_quarantined`
12. `reimport_same_snapshot_is_noop`
13. `legacy_key_format_promoted`
14. `fx_prefixes_invisible_to_export_and_discovery`
15. `export_excludes_token_and_marker_includes_hold`

## 6. Open

- Whether a restored recovery namespace should offer a transfer into the
  signed-in account (Design A §4 mechanism) or stay export-only in stage 1
  (position: export-only; transfer is one more confirmation surface).
- Per-key journal instead of a staging copy if a real device is near
  quota *(unverified that any is)*.
