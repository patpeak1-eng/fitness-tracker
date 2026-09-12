# Spec — Three real defects, one sequence (S32, revision 2)

> **STATUS: spec only, no code. Awaiting re-review and the literal
> "Cleared, proceed with implementation."**
>
> **Revision 2 (2026-09-12) — a review found a P0 and four P1s in
> revision 1, all verified in source. Two corrections matter to decisions
> already taken:**
>
> 1. **The Fix 3 race is not acceptable, and the owner's "accept it" was
>    given on my mischaracterisation.** I described a narrow window
>    costing only the server's copy. With pushes on every active-workout
>    change, in-flight requests overlap routinely: a slow PUT can land
>    after a later PUT *or* after a clear. Worse, the fence I proposed
>    could not work — a version column lives on the row that DELETE
>    **removes**, so the high-water mark vanished exactly when it was
>    needed. Fix 3 now carries a fence that survives clearing (§3).
> 2. **Fix 1 would have failed permanently on older workouts.** Revision 1
>    said "no `backendId` and no `client_id` means never synced". Migration
>    `0002_add_client_id_to_workout_history.py:7-14` states the opposite in
>    as many words: legacy rows are explicitly allowed to have
>    `client_id = NULL`. Those rows are synced, their `id` *is* the server
>    id, and the old rule would have skipped the delete, retired the
>    tombstone, and let the workout return forever.
>
> Also corrected: the tombstone retired too early to stop the race it was
> for; the active-workout pull could resurrect a finished workout; and Fix
> 2 is not one commit, because the two Railway services deploy
> independently.

**Zone: HIGH** throughout — `ApiService.js`, user data, auth, schema, and
`WorkoutContext.jsx` with the backend. Two-clearance gate per commit.

**Owner decisions carried in:** password-account count run and authorised —
**four password accounts exist, all `example.com` test fixtures with no
workouts, no meals, no templates** (one stray weight row), so Fix 2 has no
real user to strand. Build all three including the fence, however long it
takes.

---

## Fix 1 — Deleting a workout must actually delete it

### Broken

`deleteWorkout` (`WorkoutContext.jsx:1792-1794`) filters local state only;
no `ApiService` delete exists in `src/`. The backend endpoint is fine
(`workouts.py:145-164`). The row survives and the next pull merges it back
(`:802-829`). Deterministic for every cloud user.

### Resolving which server row to delete

Row shapes actually in circulation, all verified:

| Origin | `id` | `client_id` | `backendId` |
|---|---|---|---|
| Created locally, saved directly | local UUID | UUID | set (`:1768-1776`) |
| Created locally, saved via queue | local UUID | UUID | may be absent |
| Pulled from server | **server UUID** | UUID *or* `NULL` | absent |
| Restored from a backup | any of the above | any | any |

Local ids are UUIDs too, so shape cannot distinguish them. Resolution
order:

1. Explicit `backendId` → use it.
2. Else a `client_id` → look it up; safe because `(user_id, client_id)` is
   unique (`models.py:135-145`).
3. Else fetch history and **exact-match the row's `id`** against server
   ids — this is the legacy `client_id = NULL` case, and it is a real
   synced row.
4. Only a **successful** fetch that matches nothing proves local-only.
   A fetch that *fails* must enqueue and retain the intent; it must never
   be read as "never synced".

404 on delete is success (already absent) — but only once resolution has
identified a real id, or a 404 masks a wrong id while the row lives on.

### Tombstone lifecycle

A pull that started before the delete can return after it, and re-add the
row at `:802-829`. So the tombstone cannot retire on delete-confirmed.

- Stored profile-scoped, keyed by **both** `client_id` and server `id`
  (legacy rows have no `client_id`).
- Carries the pull generation at which it was created.
- The merge skips any row it names.
- Retired only when a pull **started after** the delete was confirmed
  comes back **without** the row. Nothing else retires it.
- **Not exported.** It is device-local intent, not data. On import,
  tombstones inside a snapshot are discarded — an old backup must not
  suppress valid server rows, and cannot resurrect deleted ones either,
  because a confirmed delete means the server no longer has them.
  Pending deletes live in the sync queue, which is where retry belongs.

### Change

`ApiService.deleteWorkout(id)`; `resolveWorkoutBackendId(row)` per the
order above; `deleteWorkout` removes locally, writes the tombstone, then
attempts the delete, enqueuing `workout_delete` on failure; register that
executor (none of the ten at `:344-411` covers it).

### Done means

Delete a synced workout → reload, sign out and in → still gone. Delete
offline → reconnect → gone server-side, does not return. Delete a **legacy
row with no `client_id`** → actually deleted. Delete while a pull is in
flight → does not reappear. Delete a never-synced workout → no request.

---

## Fix 2 — Password sign-in must keep the same identity

### Broken

`Token` (`schemas.py:28-30`) has no `user_id`; both handlers return it
unchanged (`routers/auth.py:114,139`). So `Login.jsx:65,90` always take
`'cloud_' + Date.now()`, and cookie-only `getMe` (`ApiService.js:70-77`)
cannot correct a Bearer session. Every login **and every registration**
lands on a new scope.

### Two commits, backend first — not one

The frontend and backend are **separate Railway services that deploy
independently**. A new frontend against an old backend would refuse every
password login, because the frontend's new rule is "no id, no sign-in".
Old frontend against new backend is harmless — it just starts using the
id. So:

- **2a (backend, additive):** `Token` gains `user_id`; both constructors
  populate it. Deploy, then confirm the field is live in
  `/openapi.json` and in a real login response before proceeding.
- **2b (frontend):** use `result.user_id`; **refuse to activate without
  it** rather than inventing a timestamp; delete both fallbacks.

Callers verified complete: only `Login.jsx:61,86` call register and login;
OAuth uses the cookie callback and `/me`; continue-without-account is
separate (`:104-114`); the S12 email backfill is untouched.

### Done means

Register a disposable password account → its profile id is the server
UUID. Sign out, sign in → same id, data intact. Verified against the live
backend with a throwaway account, deleted afterwards.

---

## Fix 3 — The active workout must sync, and cannot without a fence

### Broken

No executor for it (`:344-411`); the only push path is `syncToApi`
(`StorageService.js:429-457`), whose effect depends on **`history`**
(`WorkoutContext.jsx:1143-1154`), so changing the live workout triggers
nothing; failures are swallowed as warnings (`:446-455`);
`getActiveWorkout` has no caller and does not even check `r.ok`
(`ApiService.js:126-127`).

### Why a fence is required, not optional

Server PUT overwrites by `user_id` and DELETE removes the row, both with
no precondition (`workouts.py:98-141`). Once we push on every change,
overlapping requests are normal, so a slow PUT can land after a newer PUT
or after a clear. Debouncing coalesces edits *before* sending; it does
nothing about requests already in flight.

### The fence — a high-water mark that survives clearing

`active_workout` is one row per user (`models.py:164-181`, `user_id`
unique). Migration `0011`:

- `client_seq BIGINT NOT NULL DEFAULT 0`
- `workout_data` becomes **nullable**, and clearing is a soft clear:
  the row stays, `workout_data = NULL`. This is the crux — a sequence on
  a row that DELETE removes cannot fence anything.

Handlers:

- **PUT** — `UPDATE … SET workout_data = :d, client_seq = :s WHERE
  user_id = :u AND client_seq < :s`; insert when no row. Zero rows
  affected → **409** with the current `client_seq`.
- **DELETE** — same guard, setting `workout_data = NULL`. Also 409 with
  the current seq.
- **GET** — returns `null` when the row is absent **or** `workout_data IS
  NULL`; includes `client_seq` in the response so the client can advance.

`client_seq` is a **Lamport counter**: the client stores one per profile
and, on every active mutation, sets it to `max(local, lastServerSeq) + 1`.
Every response (200 and 409 alike) carries the server's current seq, so a
client that falls behind catches up in one round trip. This is what gives
multi-device ordering: two devices converge on last-write-wins by
sequence rather than by arrival time, and a stale arrival is rejected
instead of applied. A 409 is **not retried** — being stale is the answer.

### Client changes

- Register an `active_workout` executor (save and clear share one
  resource key and the latest desired state).
- Push on `activeWorkout` change, debounced, **only after** active
  hydration for the current profile, only when cloud-eligible, and only
  after any pending desired state is reconciled. Cancel timers on profile
  or generation change.
- **Do not push an empty preparing workout.** `startWorkout` creates one
  with `status: 'preparing'` and no exercises (`:1462-1470`), while
  hydration rejects any active workout with an empty `exercises` array
  (`:601-627`). Pushing it would sync something the receiving device
  discards. Push begins at the first exercise.
- Fix `getActiveWorkout` to check `r.ok` before parsing, and map
  `response.workout_data`, not the wrapper (`schemas.py:157-167`).
- **Pull merge must not resurrect a finished workout.** "No local active
  workout" can mean *never had one* or *the user finished it and the
  clear is still queued*. Before applying a server copy, consult the
  durable desired state: if a clear is pending or confirmed for a
  sequence at or above the server's, the server copy is stale and is
  discarded rather than adopted.

### Done means

Start a workout with an exercise on one device → it appears on another.
Lose the network mid-workout, log sets, reconnect → the server catches
up. Finish → the server's slot clears and stays clear. A delayed save
arriving after a clear is rejected with 409 and does not resurrect it. A
delayed save arriving after a newer save is rejected. Empty preparing
workouts are never pushed.

---

## Sequencing

| Commit | Contents | Depends on |
|---|---|---|
| 1 | Fix 1 (deletion) | — |
| 2a | `Token.user_id`, backend only, additive | — |
| 2b | `Login.jsx` uses it, fallbacks deleted | 2a **deployed and verified live** |
| 3a | Migration `0011` + fenced PUT/DELETE/GET, backend only. Absent `client_seq` behaves as today, so existing clients are unaffected | — |
| 3b | Client: executor, gated debounced push, corrected pull and merge | 3a **deployed and verified live** |

Fix 1 is independent. Fix 2 and Fix 3 are each backend-then-frontend, and
the backend halves are inert for existing clients.

## Verification

Local `npm run dev`, clean profile, Playwright desktop and 375 px,
console clean; then a **disposable** live account, deleted within the
session — never the owner's. Each commit deployed and confirmed with
`scripts/poll_deploy.sh`; backend commits additionally confirmed against
`/openapi.json`. `ARCHITECTURE.md` and the Coach APP KNOWLEDGE block
updated in the same commit as any behaviour they describe.

There is still no local PostgreSQL and no backend test harness, so
migration `0011` and the fenced handlers are verified by live probe and a
disposable account rather than by regression tests. Stated plainly, not
claimed as tested. A local Postgres would change that and is worth doing
before the next backend change.

## Open

1. The four `example.com` test accounts should be removed. Two cannot be
   deleted through the app (passwords lost), so it is a direct production
   write and needs its own explicit go-ahead.
2. A local PostgreSQL and a backend test harness — recommended before the
   next backend change after this one.

## Not in scope

The S29 two-account designs (shelved, documents retained). The in-app
Feedback build — replaced by a **"Send feedback" mail link** in Settings
beside the version line, carrying the app version; LOW zone, one file, no
backend. `docs/feedback_spec_s31.md` is kept for the day volume justifies
the real thing.
