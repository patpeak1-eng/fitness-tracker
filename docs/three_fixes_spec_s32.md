# Spec — Three real defects, one sequence (S32, revision 4)

> **STATUS: spec only, no code. Awaiting re-review and the literal
> "Cleared, proceed with implementation."**
>
> **Revision 4 (2026-09-12) — two P0s and four P1s from the third review,
> all verified. One of them made the design smaller.**
>
> - **Deletion moves to the server, and the client tombstone shrinks.**
>   Revision 3 tried to make deletion durable with exported client-side
>   tombstones. That could never deliver its promise: after retirement, or
>   on a *second device* that never saw the tombstone, an old backup
>   restores the workout and the backfill re-uploads it
>   (`WorkoutContext.jsx:1033-1048`). The right place for "this was
>   deleted" is the server. `workout_history` gains `deleted_at`; DELETE
>   soft-deletes; the list filters it out; and `POST` already returns the
>   existing row on a `client_id` collision (`workouts.py:56-78`), so a
>   re-upload attempt now comes back marked deleted instead of
>   resurrecting. The client tombstone drops to a short-lived guard for
>   one thing only: a pull already in flight. No export, no cross-device
>   propagation, no retirement rule to get wrong.
> - **Acknowledgement cannot use content as identity (ABA).** Clear at
>   seq 5 in flight; user starts B (6); cancels B, so desired content is
>   "clear" again (7). Seq 5 succeeds, content matches, and revision 3
>   would delete entry 7 — then the delayed PUT 6 clears the server's
>   seq-5 fence and resurrects B. Identity is now an immutable
>   `desiredRevision` plus the exact dispatched `client_seq`.
> - `RETURNING` yields nothing when the conditional `DO UPDATE` is
>   suppressed, so the 409's current sequence needs a follow-up `SELECT`.
> - The legacy branch needs its own statement (`client_seq =
>   active_workout.client_seq + 1`), not the sequenced `WHERE`.
> - GET could not both return JSON `null` and carry `client_seq`.
> - 3a is **API-compatible**, not "no effect".

**Zone: HIGH** throughout. Two-clearance gate per commit. **All three
fixes now touch the backend** — two migrations in total.

**Owner decisions carried in:** authorised count found **four password
accounts, all `example.com` fixtures, no workouts/meals/templates**.
Build all three, fence included.

---

## Fix 1 — Deletion, made durable on the server

### Broken

`deleteWorkout` (`WorkoutContext.jsx:1792-1794`) filters local state only;
no `ApiService` delete exists in `src/`. The row survives and the next
pull re-adds it (`:802-829`). Restoring an old backup also re-uploads it.

### 1a — server (migration `0011`)

- `workout_history.deleted_at TIMESTAMPTZ NULL`.
- `DELETE /api/workouts/{id}` sets `deleted_at = now()` instead of
  removing the row; already-deleted is success.
- The list endpoint filters `deleted_at IS NULL`.
- `POST /api/workouts` keeps today's behaviour — on a `client_id`
  collision it returns the existing row (`workouts.py:56-78`) — which now
  carries `deleted_at`. That single fact is what stops resurrection from
  **any** device and **any** backup, permanently, without client
  bookkeeping.
- Response schema gains `deleted_at` so clients can react.

API-compatible: existing clients never send it, never see a deleted row in
the list, and their re-upload attempts return the existing row exactly as
before.

### 1b — client

Resolution order for the server id (row shapes verified): explicit
`backendId`; else `client_id` lookup (safe — `(user_id, client_id)` is
unique, `models.py:135-145`); else exact `id` match against a fetched page
— the legacy `client_id = NULL` case migration `0002:7-14` explicitly
permits; only a **successful** fetch matching nothing proves local-only. A
**failed** fetch enqueues and retains intent.

Make that fallback rare with patterns that already exist: the pull adopts
`backendId` onto a workout matched by `client_id`, as the food log does
(`:847-875`), and the `workout` executor writes the returned id back as
the assessment and template executors do (`:347-369`).

`deleteWorkout` removes locally, then deletes remotely, enqueuing
`workout_delete` on failure (no such executor exists among the ten at
`:344-411`).

**The remaining tombstone is small.** Purpose: stop a pull that started
before the delete from re-adding the row. Profile-scoped, keyed by
`client_id` and server `id`, retired on the first successful pull that
started after the delete confirmed and omits the row. **Not exported** —
it no longer needs to be, because the server now holds the truth.

**Backfill gate:** skip any workout whose server record reports
`deleted_at`. With 1a this is a belt-and-braces check rather than the
whole defence.

### Done means

Delete a synced workout → reload, sign out and in → gone. Offline delete →
reconnect → gone, stays gone. **Legacy row with no `client_id`** →
actually deleted. Delete during an in-flight pull → does not reappear.
**Restore a pre-deletion backup, on this device or another** → the workout
does not come back and is not re-uploaded. Never-synced → no request.

---

## Fix 2 — Password sign-in must keep the same identity

`Token` (`schemas.py:28-30`) has no `user_id`; both handlers return it
unchanged (`routers/auth.py:114,139`); `Login.jsx:65,90` therefore always
take `'cloud_' + Date.now()`, and cookie-only `getMe` cannot correct a
Bearer session.

**2a (backend, additive, behaviourally ACTIVE):** `Token` gains
`user_id`. The deployed frontend already reads it, so password clients
adopt the canonical id on their next sign-in the moment this deploys.
That is the intended end state, safe here only because the four affected
accounts are verified-empty fixtures. Deploy, then confirm in
`/openapi.json` and a live login response.

**2b (frontend):** use `result.user_id`; **refuse to activate without
it**; delete both fallbacks.

Callers verified complete: only `Login.jsx:61,86`; OAuth uses the cookie
callback and `/me`; continue-without-account is separate (`:104-114`).

---

## Fix 3 — Active-workout sync, with a fence that holds

### 3a — server (migration `0012`)

`active_workout` is one row per user (`models.py:164-181`, `user_id`
unique). Add `client_seq BIGINT NOT NULL DEFAULT 0`; make `workout_data`
**nullable**; clearing is a soft clear that keeps the row, because a
sequence on a row `DELETE` removes cannot fence anything.

**Sequenced branch** (request carries `client_seq`) — one statement:

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

Valid because `user_id` is unique. **No row returned means the update was
suppressed** — `RETURNING` cannot report the current value in that case,
so the 409 path performs a follow-up `SELECT client_seq` and returns it in
a structured body. A clear arriving before any save *creates* the fence
row with `workout_data = NULL`, which is what closes the absent-row hole.

**Legacy branch** (no `client_seq`) — a separate statement, not the
sequenced `WHERE`: insert with `client_seq = 1`; on conflict apply the
data or null and set `client_seq = active_workout.client_seq + 1`. Old
clients keep exactly today's behaviour and never see a 409, and their
writes still advance the high-water mark. **Transition limitation:**
unversioned requests remain arrival-ordered until old clients are gone.

**GET** returns `{ workout_data: null, client_seq }` for a cleared row —
revision 3 asked for JSON `null` *and* a sequence, which is impossible.
Changing this contract is free: `getActiveWorkout` has **no caller** in
`src/` today.

### 3b — client

`client_seq` is a Lamport counter per profile: on dispatch, `seq =
max(local, lastServerSeq) + 1`.

**Acknowledgement identity is immutable, never content.** Each enqueue
carries a `desiredRevision`; each dispatch records the exact
`client_seq` sent. Success removes the entry only if it still holds that
same revision and sequence. This closes both the ABA case above and the
stable-id removal race at `SyncQueue.js:116-120`.

**On 409 — rebase, never discard.** Read the server's sequence from the
structured body, then either reissue the still-current desired state as a
**new** revision at a higher sequence, or drop it if superseded. Never
resend the stale attempt. Enablers: `saveActiveWorkout` /
`clearActiveWorkout` must surface the structured body (they stringify it
today, `ApiService.js:129-150`); `SyncQueue` must honour
`err.retryable === true` at `:131-137` instead of dead-lettering — safe
because only the active-workout code sets it. **Termination:** at most one
rebase per response, then backoff; each 409 supplies a strictly higher
bound, so a quiescent server converges. Under continuous contention the
entry legitimately stays pending — it must never dead-letter.

**Push triggers:** on `activeWorkout` change, debounced; only after
hydration for the current profile, only when cloud-eligible, only after
pending desired state reconciles; timers cancel on profile change.
**Empty preparing workouts are never pushed** — `startWorkout` creates one
with no exercises (`:1462-1470`) and hydration rejects exactly that
(`:601-627`). Cross-device coverage therefore begins at the first
exercise, deliberately, and says so in the product copy.

**Pull merge must not resurrect a finished workout.** Absent local state
can mean *never had one* or *finished with a clear still queued*. Consult
durable desired state first: a pending or confirmed clear at a sequence at
or above the server's means the server copy is stale. `getActiveWorkout`
gains an `r.ok` check and maps `workout_data`.

### Done means

Start a workout with an exercise on one device → appears on another.
Network drops mid-workout → reconnect → server catches up. Finish → slot
clears and stays clear. Save delayed past a clear → rejected, no
resurrection. Save delayed past a newer save → rejected. Two devices
racing → one wins, **the loser reissues at a higher sequence rather than
losing the edit**. Clear(5) → start B(6) → cancel B(7), with 5 landing
late → B does **not** resurrect. Offline 409 → not dead-lettered.

---

## Sequencing

| Commit | Contents | Depends on | Existing clients |
|---|---|---|---|
| 1a | Migration `0011` `deleted_at`, soft delete, list filter | — | API-compatible |
| 1b | Client delete, resolution, in-flight tombstone, backfill gate | 1a live | — |
| 2a | `Token.user_id` | — | **active** — canonical id adopted on next login |
| 2b | `Login.jsx` uses it, fallbacks deleted | 2a live | — |
| 3a | Migration `0012`, fenced upsert, legacy branch, GET contract | — | API-compatible |
| 3b | Executor, gated push, 409 rebase, immutable ack, corrected pull | 3a live | — |

## Verification

Local `npm run dev`, clean profile, Playwright desktop and 375 px,
console clean; then a **disposable** live account, deleted within the
session — never the owner's. Two-device and racing-request cases use two
browser contexts against the live backend. Each commit deployed and
confirmed with `scripts/poll_deploy.sh`; backend commits also against
`/openapi.json`.

**Two migrations and a concurrency-sensitive upsert now sit in this work,
and there is still no local PostgreSQL and no backend test harness.** The
fence's correctness is exactly the kind of thing that wants a test which
can fail. Provisioning a local database before 3a is the strong
recommendation; without it, 3a is verified by live probe only, which is
stated rather than dressed up.

## Open

1. Provision a local PostgreSQL plus a minimal harness before 3a —
   recommended.
2. Remove the four `example.com` fixtures; two need a direct production
   write and their own go-ahead.

## Not in scope

S29's two-account designs (shelved, retained). The in-app Feedback build —
replaced by a **"Send feedback" mail link** in Settings carrying the app
version; LOW zone, one file. `docs/feedback_spec_s31.md` retained.
