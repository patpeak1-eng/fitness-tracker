# S29 Design C — Backup restore transaction

> C0 design document. No code. Companion to `profile_identity_spec_s29_v2.md`
> (revision 5) §6 item 7 and Design A (vocabulary, generations) and Design B
> (hold format). Anchors read 2026-09-10 at `9cb2883`; unverified items are
> marked.

## 1. Current behaviour (anchored)

- `exportSnapshot()` (`StorageService.js:390-399`) dumps **every**
  localStorage key starting with `fitness_` plus the coach keys — data
  keys, the profiles list, `currentProfileId`, the auth token, the logout
  marker, the sync queue and dead-letter, and any future bindings store.
- `importSnapshot(data)` (`:401-425`) validates only that *some* key
  starts with `fitness_` (`:403-405`), **removes every current matching
  key first** (`:410-414`), then writes the snapshot's keys and throws on
  a write failure (`:~423`) — after the removal, so a quota failure
  mid-import leaves the device with neither the old nor the full new
  state.
- The Profile page's Import (`Profile.jsx:~635-646`) then reloads. Nothing
  on this path distinguishes data from session authority.

Consequences today: an old backup reinstates a stale token and cookie-era
assumptions, an unset logout marker, obsolete queued writes with no owner,
and — after S29 — would reinstate whatever bindings it happened to
contain, all as if trusted.

## 2. Key classification

| Class | Keys | Restore treatment |
|---|---|---|
| **Data** | every `PROFILE_SCOPED_BASE_KEYS` entry in both scoped forms (`:43-67`, `:91-92`), custom exercises/templates, food log, weight history, assessments, settings, coach preference keys | promoted after validation |
| **Selection** | profiles list, `currentProfileId` | list promoted as *entries* (metadata only); selection promoted only if the scope exists after promotion, else cleared |
| **Session authority** | auth token, logout marker | **never restored**; the live marker and credentials win |
| **Queue** | `fitness_sync_queue`, dead-letter, any v2 active queue | never promoted to the active queue; entries go to the **hold** (Design B) as `origin: 'restore'`, ownerless unless they carry a `accountId` that matches a *currently trusted* binding — and even then they are held, not dispatched, until a user-visible confirmation *(cross-review: or always held)* |
| **Bindings** | bindings store | **untrusted metadata**: recorded as `provenance: 'imported'`, which is not a trusted provenance (Design A §3); they never select a scope or authorise dispatch |
| **Unknown** | any other `fitness_*` key | retained verbatim under a quarantine prefix; never promoted |

## 3. The transaction

1. **Parse and classify** the snapshot in memory. Reject (throw, nothing
   written) if there are no data keys at all, or if any data value fails
   its parser — except that unparseable values are retained verbatim in
   quarantine rather than rejected outright *(position: quarantine, not
   reject, so a partly corrupt backup still yields its good data)*.
2. **Stage**: write the promoted set under a staging prefix
   (`fitness_restore_staging_<generation>_…`) in one pass. On quota
   failure: remove the staging keys, leave live state untouched, surface
   "Not enough space to restore — free space or use a smaller backup".
   This is the fix for the current remove-then-write order.
3. **Boundary**: bump `sessionGeneration` (aborts in-flight work, pauses
   dispatch). Compute what the post-restore state *would* be: selected
   scope existence, binding statuses against the *current* principal.
4. **Swap**: for each promoted key, write live from staging, then delete
   staging. Selection: keep the current scope if it still exists;
   otherwise select the snapshot's selection if that scope exists; else
   none. The logout marker and credentials are **not** touched.
5. **Hold**: queue entries from the snapshot are appended to the hold with
   `origin: 'restore'` and the snapshot timestamp, verified by read-back
   (Design B durability rule) before the staging copy is discarded.
6. **Refresh**: only now `refreshGlobalState` / hydration re-run, under the
   new generation, through Design A's boot resolution (§5) — so a restored
   snapshot never causes a pull or a flush by itself, and a restored
   binding is `imported`, never `trusted`.
7. **Idempotence**: the transaction is keyed by a snapshot hash; re-importing
   the same file is a no-op with a message, not a second hold copy.

## 4. Export changes (small, same commit as import)

- Export continues to include everything (a backup must be complete), but
  writes a `_meta` entry: format version, export generation, app version,
  and the classification map above — so a future importer knows what it is
  looking at. Old backups without `_meta` are classified by key name.
- The recovery screen's *scoped* export (spec §5) is a different, narrower
  artifact: one scope, data keys only, no session/queue/binding keys.

## 5. Fixtures (C1 red → C2 green for parsers/staging, C4 green for the boundary)

1. `restore_never_writes_token_or_marker` — snapshot contains a token and
   an unset marker; device is logged out → after restore still logged out,
   no token.
2. `restore_quota_failure_leaves_live_state_intact` — `setItem` throws on
   the third staged key → live keys byte-identical, no staging residue,
   error surfaced.
3. `restored_queue_goes_to_hold_not_active` — snapshot queue has two ops
   → active queue unchanged, hold has two entries with `origin 'restore'`,
   read-back verified.
4. `restored_bindings_are_imported_not_trusted` — snapshot binding for the
   current principal → `bindingStatus` remains `unbound`, no dispatch.
5. `restore_does_not_change_scope_or_pull` — selected scope exists in
   snapshot; after restore same scope, no `/me`, no pull, generation
   bumped once.
6. `unparseable_value_is_quarantined` — one corrupt history blob → other
   data promoted, corrupt value retained verbatim under quarantine, user
   told which scope had it.
7. `reimport_same_snapshot_is_noop`.
8. `legacy_key_format_promoted` — `_uid` form keys in the snapshot land in
   the current form.

## 6. Open for cross-review

- Whether held restore-origin ops with a matching trusted `accountId` may
  be surfaced as "resume sending?" or must stay held permanently
  (position: surface with confirmation; never automatic).
- Staging under a prefix doubles peak storage for the promoted set; if
  quota is tight, stage per-key with a journal instead *(unverified whether
  any real device is near quota)*.
- Whether Export should stop including the token at all *(position: yes —
  a backup is not a session; it is the one export change that reduces
  risk with no loss)*.
