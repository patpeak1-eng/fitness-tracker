# Spec — Three real defects, one sequence (S32, revision 3)

> **STATUS: spec only, no code. Awaiting re-review and the literal
> "Cleared, proceed with implementation."**
>
> **Revision 3 (2026-09-12) — review found two P0s and four P1s in
> revision 2. All verified in source; all adopted.**
>
> - **"Never retry a 409" threw away real work.** Two devices can both see
>   sequence 5 and both send 6. One is rejected — and under revision 2
>   that mutation was simply lost. Worse, `SyncQueue` dead-letters every
>   non-401/429 4xx (`SyncQueue.js:131-137`), so a 409 was terminal even
>   offline. Worse still, completion removes a queue entry by its stable
>   `type:key` id (`:116-120`) while `enqueue` replaces by the same key
>   (`:72-86`), so an in-flight sequence-5 success would delete a queued
>   sequence-6. §3 replaces this with rebase-and-reissue.
> - **The soft clear had no absent-row case.** A clear arriving before the
>   first save finds no row, a guarded `UPDATE` touches nothing, and the
>   delayed save then inserts and resurrects the workout. §3 makes both
>   handlers conditional upserts.
> - **Commit 2a is not inert, and I said it was.** `Login.jsx:65,90`
>   already read `result.user_id`, so shipping the backend alone performs
>   the one-time scope switch. I documented that exact trap during the S29
>   work and then contradicted it here. It is acceptable *only* because
>   the four password accounts are verified-empty test fixtures — not
>   because nothing happens.
> - **Discarding tombstones on restore does not prevent resurrection.**
>   The backfill re-uploads any workout it finds locally but not on the
>   server (`WorkoutContext.jsx:1033-1048`), so an old backup would
>   recreate a deleted workout *and* push it back. §1 makes tombstones
>   durable, exported data.
> - Tombstone retirement also needs the **confirmation** generation, not
>   just the creation generation.

**Zone: HIGH** throughout. Two-clearance gate per commit.

**Owner decisions carried in:** the authorised count found **four password
accounts, all `example.com` fixtures with no workouts, meals or
templates** (one stray weight row). Build all three, fence included.

---

## Fix 1 — Deleting a workout must actually delete it

### Broken

`deleteWorkout` (`WorkoutContext.jsx:1792-1794`) filters local state only.
No `ApiService` delete exists in `src/`. The backend endpoint is correct
(`workouts.py:145-164`). The row survives and the next pull re-adds it
(`:802-829`).

### Resolving the server row

| Origin | `id` | `client_id` | `backendId` |
|---|---|---|---|
| Local, saved directly | local UUID | UUID | set (`:1768-1776`) |
| Local, saved via queue | local UUID | UUID | often absent |
| Pulled | **server UUID** | UUID *or* `NULL` | absent |
| Restored from backup | any | any | any |

Order: explicit `backendId`; else `client_id` lookup (safe — `(user_id,
client_id)` is unique, `models.py:135-145`); else **exact `id` match
against a fetched history page**, which is the legacy `client_id = NULL`
case that migration `0002:7-14` explicitly permits; only a **successful**
fetch matching nothing proves local-only. A **failed** fetch enqueues and
retains intent — it is never read as "never synced". 404 is success, but
only after resolution has produced a real id.

**Make the fallback rare** (both patterns already exist): the cloud pull
adopts `backendId` onto a local workout matched by `client_id`, exactly as
the food log does (`:847-875`), and the `workout` executor writes the
returned id back the way the assessment and template executors do
(`:347-369`). Then the paginated fetch only ever runs for old, queued, or
restored rows.

### Tombstones — durable, exported data

Revision 2 made them device-local and discarded on import. That fails:
after restoring an older backup, the deleted workout is present locally
and absent on the server, so the backfill re-uploads it.

- Stored profile-scoped, keyed by **both** `client_id` and server `id`.
- Fields: `createdAtGeneration`, `confirmedAtGeneration`, `deletedAt`.
- The pull merge skips any row they name, **and so does the backfill** —
  that second gate is what stops re-upload.
- **Retired** only by a pull whose *start* generation exceeds
  `confirmedAtGeneration` and whose result omits both identifiers. A pull
  that started before confirmation cannot retire it. If pulls keep
  failing the tombstone persists — fail-closed and intended; the store is
  bounded and surfaced in the UI.
- **Exported and restored** as data, merged as a union on import.
- **Documented consequence:** restoring a backup taken *before* a
  deletion will not bring that workout back. The most recent explicit
  intent — the delete — wins over an older snapshot. This is a deliberate
  choice and belongs in the restore copy.

### Done means

Delete a synced workout → reload, sign out and in → gone. Delete offline →
reconnect → gone server-side, does not return. Delete a **legacy row with
no `client_id`** → actually deleted. Delete during an in-flight pull → does
not reappear. **Restore an older backup → the deleted workout does not
come back and is not re-uploaded.** Never-synced workout → no request.

---

## Fix 2 — Password sign-in must keep the same identity

`Token` (`schemas.py:28-30`) has no `user_id`; both handlers return it
unchanged (`routers/auth.py:114,139`), so `Login.jsx:65,90` always take
`'cloud_' + Date.now()`, and cookie-only `getMe` cannot correct a Bearer
session. Every login and registration lands on a new scope.

**2a (backend, additive but NOT inert):** `Token` gains `user_id`; both
constructors populate it. The deployed frontend already reads that field,
so password clients switch to the canonical id on their next sign-in the
moment this deploys. That is the intended end state and is safe here only
because the affected accounts are the four empty fixtures. Deploy, then
confirm in `/openapi.json` and a real login response.

**2b (frontend):** use `result.user_id`; **refuse to activate without
it**; delete both fallbacks.

Callers verified complete: only `Login.jsx:61,86` reach these endpoints;
OAuth uses the cookie callback and `/me`; continue-without-account is
separate (`:104-114`); the S12 email backfill is untouched.

**Done means:** register a disposable password account → profile id is the
server UUID; sign out and in → same id, data intact; throwaway account
deleted afterwards.

---

## Fix 3 — Active-workout sync, with a fence that holds

### Broken

No executor (`:344-411`); the only push path is `syncToApi`
(`StorageService.js:429-457`) behind an effect keyed on **`history`**
(`:1143-1154`), so changing the live workout pushes nothing; failures are
swallowed (`:446-455`); `getActiveWorkout` has no caller and does not
check `r.ok` (`ApiService.js:126-127`).

### 3a — the server fence

`active_workout` is one row per user (`models.py:164-181`, `user_id`
unique). Migration `0011`:

- `client_seq BIGINT NOT NULL DEFAULT 0`
- `workout_data` becomes **nullable**; clearing is a soft clear that keeps
  the row. A sequence on a row that `DELETE` removes cannot fence
  anything.

Both handlers are **conditional upserts**, which is what closes the
absent-row hole:

```sql
INSERT INTO active_workout (user_id, workout_data, client_seq)
VALUES (:u, :data_or_null, :s)
ON CONFLICT (user_id) DO UPDATE
   SET workout_data = EXCLUDED.workout_data,
       client_seq   = EXCLUDED.client_seq,
       updated_at   = now()
 WHERE active_workout.client_seq < EXCLUDED.client_seq
RETURNING client_seq;
```

No row returned → the incoming sequence lost → **409 with the current
`client_seq` in a structured JSON body**. A clear that arrives first
therefore *creates* the fence row with `workout_data = NULL`, and the
delayed save is then rejected instead of resurrecting the workout.

**GET** returns JSON `null` when the row is absent **or** `workout_data IS
NULL`, preserving today's `ActiveWorkoutResponse | null` contract
(`schemas.py:157-167`); it includes `client_seq` so a client can advance.

**Legacy clients that send no `client_seq`** get an explicit branch, not a
default: apply the mutation as today **and** atomically set `client_seq =
current + 1`. Mapping absent to 0 would break them immediately (rows start
at 0 and `0 < 0` is false); ignoring the guard would let them overwrite
fenced state. **Transition limitation, stated:** requests from old clients
remain arrival-ordered until those clients are gone.

### 3b — the client

`client_seq` is a Lamport counter per profile: on dispatch, `seq =
max(local, lastServerSeq) + 1`.

**On 409 — rebase, do not discard.** Never resend the same stale attempt.
If the entry still represents the device's latest desired state, take the
server's sequence from the 409 body and dispatch a **new** attempt at a
higher sequence; if a newer desired state has superseded it, drop it.
Applies to both save and clear. Three enabling changes:

1. `saveActiveWorkout` / `clearActiveWorkout` must surface the structured
   409 body — today they stringify it and expose only `status`
   (`ApiService.js:129-150`).
2. `SyncQueue` must not dead-letter it. Minimal, scoped change at
   `:131-137`: honour `err.retryable === true` regardless of status.
3. **Acknowledgement must not delete newer intent.** There is exactly one
   active-workout desired state per profile (`active_workout:current`),
   and completion removes it **only if its content still matches what was
   sent**; an edit made while the request was in flight leaves it queued
   to dispatch at a higher sequence. This sidesteps the stable-id removal
   race at `:116-120`.

**Push triggers:** on `activeWorkout` change, debounced, only after active
hydration for the current profile, only when cloud-eligible, and only
after pending desired state is reconciled. Timers cancel on profile
change. **Empty preparing workouts are never pushed** — `startWorkout`
creates one with no exercises (`:1462-1470`) while hydration rejects
exactly that (`:601-627`); pushing it would sync something the receiving
device discards. Pushing starts at the first exercise.

**Pull merge must not resurrect a finished workout.** Absent local state
can mean *never had one* or *finished, clear still queued*. Before
adopting a server copy, consult the durable desired state: a pending or
confirmed clear at a sequence at or above the server's means the server
copy is stale and is discarded. `getActiveWorkout` gains an `r.ok` check
and maps `workout_data`, not the wrapper.

### Done means

Start a workout with an exercise on one device → it appears on another.
Network drops mid-workout, sets logged, reconnect → server catches up.
Finish → the slot clears and **stays** clear. A save delayed past a clear
is rejected and does not resurrect. A save delayed past a newer save is
rejected. Two devices racing → one wins, the loser **reissues at a higher
sequence rather than losing the edit**. An offline 409 is not
dead-lettered. Empty preparing workouts are never pushed.

---

## Sequencing

| Commit | Contents | Depends on | Effect on existing clients |
|---|---|---|---|
| 1 | Fix 1 — deletion, tombstones, backendId adoption | — | none |
| 2a | `Token.user_id` | — | **active**: password clients adopt the canonical id on next login |
| 2b | `Login.jsx` uses it, fallbacks deleted | 2a deployed and verified | — |
| 3a | Migration `0011`, fenced upserts, legacy branch | — | none (legacy branch preserves today's behaviour) |
| 3b | Executor, gated debounced push, 409 rebase, queue changes, corrected pull | 3a deployed and verified | — |

## Verification

Local `npm run dev`, clean profile, Playwright at desktop and 375 px,
console clean; then a **disposable** live account, deleted within the
session — never the owner's. Each commit deployed and confirmed via
`scripts/poll_deploy.sh`; backend commits also against `/openapi.json`.
`ARCHITECTURE.md` and the Coach APP KNOWLEDGE block updated in the same
commit as any behaviour they describe.

Two-device and racing-request cases are exercised with two browser
contexts against the live backend and a disposable account.

**Still no local PostgreSQL and no backend test harness**, so migration
`0011` and the fenced handlers are verified by live probe rather than by
tests that can fail. Stated plainly. Given that Fix 3a is now a schema
change with concurrency semantics, provisioning a local database first is
the recommendation.

## Open

1. Provision a local PostgreSQL and a minimal backend harness **before
   3a** — recommended; the fence is the first change here whose
   correctness really wants a test that can fail.
2. Remove the four `example.com` fixtures. Two cannot be deleted through
   the app (passwords lost), so it is a direct production write needing
   its own go-ahead.

## Not in scope

The S29 two-account designs (shelved, retained). The in-app Feedback
build — replaced by a **"Send feedback" mail link** in Settings beside the
version line, carrying the app version; LOW zone, one file, no backend.
`docs/feedback_spec_s31.md` retained.
