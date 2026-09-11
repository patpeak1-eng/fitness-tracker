# S29 Design C — Backup restore transaction (revision 2)

> C0 design document. No code. Companion to the spec §6 item 7, Design A
> revision 2 (vocabulary, transitions, bindings store), and Design B
> revision 2 (hold format, field name `source`). Anchors read at `9cb2883`
> / `2102e47`.
>
> **Revision 2 (2026-09-11) — from the cold cross-review:** (F8) §3.6
> said refresh runs through A's boot resolution while fixture 5 asserted
> "no `/me`, no pull" — contradictory, and false: restored history in a
> trusted scope fires `syncToApi` (`WorkoutContext.jsx:1148-1154`) and
> the backfill (`:1008-1097`). (F9) `'imported'` bindings had no defined
> home. (F10) a restored profiles-list entry carrying `email` re-enabled
> the email-gated direct writes (`Profile.jsx:54,99`, `Settings.jsx:465`).
> (F11) staging keys under `fitness_` leaked into export, old-bundle
> import, and scope discovery; the hold key was unclassified. (F12)
> `origin` vs `source`; C bumped the generation itself. Anchors corrected
> (`Profile.jsx` import handler is `:163-183`; the reload is
> `WorkoutContext.jsx:2809` inside `importData` `:2800`).

## 1. Current behaviour (anchored)

- `exportSnapshot()` (`StorageService.js:390-399`) dumps every key
  starting with `fitness_` plus the coach keys: data, the profiles list,
  `currentProfileId`, the auth token, the logout marker, the queue and
  dead letter — and, after S29, anything else under that prefix.
- `importSnapshot(data)` (`:401-427`) checks only that *some* key starts
  with `fitness_` (`:403-405`), **removes every current matching key
  first** (`:410-414`), then writes and throws on failure after the
  removal — a quota failure mid-import leaves neither old nor new state.
- Import handler `Profile.jsx:163-183` → `importData`
  (`WorkoutContext.jsx:2800`) → `window.location.reload()` (`:2809`).
  Nothing distinguishes data from session authority.

## 2. Key classification and prefixes

**Reserved prefixes (shared list, one constant, used by discovery, export,
and import):** `fitness_sync_` (B's v2 queue and hold), `fitness_bindings_`
(A's store), `fx_staging_` and `fx_quarantine_` (this design — deliberately
**not** under `fitness_`, so `exportSnapshot` and an old bundle's
`importSnapshot` never see them and discovery never parses `_user_` inside
them). Discovery skips every reserved prefix before parsing scope ids.

| Class | Keys | Restore treatment |
|---|---|---|
| **Data** | every `PROFILE_SCOPED_BASE_KEYS` entry in both scoped forms (`:43-67`, `:91-92`), plus the global data keys (custom exercises/templates, food log, weight history, assessments, settings, coach preference keys) | promoted after validation |
| **Selection** | profiles list, `currentProfileId` | list entries promoted **with `email` removed** — after C4 list metadata is never authorisation (A §7), and stripping it makes the pre-C4 email gates inert on restored entries too; selection promoted only if that scope exists after promotion, else cleared |
| **Session authority** | auth token, logout marker | never restored; live values win |
| **Queue** | legacy `fitness_sync_queue`, dead letter, v2 active queue, **v2 hold** | never promoted to the active queue; legacy/active entries go to the **hold** with `source: 'restore'`; a snapshot's own hold entries are merged into the hold by content hash (so held ops survive a re-import instead of vanishing) |
| **Bindings** | `fitness_bindings_v1` | **written to quarantine only** (`fx_quarantine_bindings_<hash>`), recorded as `provenance: 'imported'`; never into A's store; A's inheritance reads only its own store, so these can never become trusted without an explicit adoption |
| **Unknown** | any other `fitness_*` key | retained verbatim under `fx_quarantine_` |

## 3. The transaction

1. **Parse and classify** in memory. Reject (nothing written) only if there
   are no data keys at all. Unparseable data values are quarantined
   verbatim, not rejected, so a partly corrupt backup still yields its good
   data; the user is told which scope had corrupt values.
2. **Stage** the promoted set under `fx_staging_<hash>_…` in one pass, with
   read-back verification (B's rule). On quota failure: remove staging
   keys, leave live state untouched, surface "Not enough space to restore".
3. **Boundary:** request `A.transition('restoreBegin')` (A bumps the
   generation; C never does) — in-flight work aborts, dispatch pauses.
4. **Swap:** write live from staging, delete staging. Selection per §2.
   Marker and credentials untouched.
5. **Hold:** append snapshot queue entries to the hold (`source:
   'restore'`), read-back verified, before staging is discarded.
6. **Commit:** `A.transition('restoreCommitted')` — A re-runs discovery and
   re-evaluates `bindingStatus` for the selected scope against the
   **current** principal; **no `/me` call and no pull are issued by the
   restore itself**. Then the app refreshes state (`refreshGlobalState`/
   hydration) under the new generation.
7. **What happens next is ordinary behaviour, stated plainly:** if the
   selected scope is `trusted` and `authenticated`, the restored history
   will be pushed to that (own) account by `syncToApi` and reconciled by
   the backfill exactly as any local data would — through B's gate, so it
   can only ever reach the account the scope is bound to. If the scope is
   `unbound` or `conflict`, nothing leaves the device.
8. **Idempotence:** keyed by snapshot hash; re-importing the same file is
   a no-op with a message.

## 4. Export changes (same commit as import)

- Export **stops including the auth token** (a backup is not a session;
  no loss). It still includes the marker? — no: the marker is session
  authority too; excluded. It includes data, list (with `email` already
  irrelevant post-C4 but exported as-is for fidelity), selection, the v2
  queue and hold (so pending work is not lost), and A's bindings store
  **as metadata** (the importer quarantines it regardless).
- Writes a `_meta` entry: format version, app version, export time, and
  the classification map. Old backups without `_meta` are classified by
  key name.
- The recovery screen's scoped export is the narrower artifact: one scope,
  data keys only, both key formats, unparseable values verbatim.

## 5. Fixtures (C1 red → C2 for parsers/staging, C4 for the boundary)

1. `restore_never_writes_token_or_marker`
2. `restore_quota_failure_leaves_live_state_intact` — third staged key
   throws → live keys byte-identical, no `fx_staging_` residue.
3. `restored_queue_goes_to_hold_with_source_restore`
4. `restored_bindings_land_in_quarantine_only` — A's store unchanged;
   `bindingStatus` unchanged.
5. `restore_issues_no_me_and_no_pull_itself` — transitions `restoreBegin`
   and `restoreCommitted` observed; zero `/me`, zero pull calls **from the
   restore**; subsequent ordinary dispatch (if trusted) is a separate
   assertion.
6. `restored_list_entries_have_no_email`
7. `unparseable_value_is_quarantined`
8. `reimport_same_snapshot_is_noop`
9. `legacy_key_format_promoted`
10. `staging_and_quarantine_keys_are_invisible_to_export_and_discovery`
11. `snapshot_hold_entries_merge_into_hold`
12. `export_excludes_token_and_marker`

## 6. Open for cross-review

- Whether held restore-source ops may be surfaced as "resume sending?"
  (position: only for types with a server key; others via B's reconcile).
- Staging doubles peak storage for the promoted set; per-key journal if a
  real device is near quota *(unverified)*.
