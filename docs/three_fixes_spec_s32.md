# Spec — Three real defects, one sequence (S32)

> **STATUS: spec only, no code. Awaiting plan review and the literal
> "Cleared, proceed with implementation."**
>
> Owner direction 2026-09-12: fix these three, in this order. They were
> selected because each affects a single user on a single device — no
> shared devices, no second accounts — which is how this app is actually
> used. The two-account work (S29 designs A/B/C) is **shelved**, not
> deleted: an independent audit rated its remaining defects "negligible
> immediate reach" for this usage. Feedback (S31) is replaced by an email
> link (§5).

**Zone: HIGH.** Touches `src/services/ApiService.js`, user data
(`workout_history`, `active_workout`), auth (`Token`, `Login.jsx`), and
`WorkoutContext.jsx` with the backend. Two-clearance gate applies to each
commit.

**Shape:** three independent commits. Each ships alone, is verifiable
alone, and leaves the app working. No commit depends on a later one.

---

## Fix 1 — Deleting a workout does not delete it

### What is broken

`deleteWorkout` (`WorkoutContext.jsx:1792-1794`) is three lines:

```js
const deleteWorkout = (workoutId) => {
    setHistory(prev => prev.filter(w => w.id !== workoutId));
};
```

It filters local state and nothing else. `git grep deleteWorkout` finds no
`ApiService` call anywhere in `src/`. The backend endpoint exists and is
correct — `DELETE /api/workouts/{id}`, owner-scoped, 404 if not yours
(`backend/app/routers/workouts.py:145-164`). It is simply never called.

The row is still on the server, so the next cloud pull merges it back
(`WorkoutContext.jsx:802-829`). **Deterministic for any cloud user**: the
workout disappears, and returns on the next sign-in or reload that pulls.

### The id problem, and why this is not a one-liner

`getHistory` (`ApiService.js:80-100`) returns the server's page items and
the merge keeps `id: w.id` and `client_id` (`:808-814`). Whether `w.id` is
the *server's* UUID or a locally generated id depends on where the row came
from: a locally created workout has a local id and a `client_id`; a pulled
row carries the server id. Deleting by the wrong one silently 404s.

**Rule:** resolve the server id the same way food logs already do
(`resolveFoodBackendId`, the precedent at `WorkoutContext.jsx:409-412`):
prefer an explicit `backendId`, else match by `client_id` against a fetched
page, else treat the row as never-synced and delete locally only. This is
an existing, reviewed pattern — reuse it rather than inventing one.

### The offline problem

A delete issued with no connection must not be lost, or the row returns on
the next pull. `AGENTS.md` requires new pushes that can fail to enqueue and
register an executor. There is no `workout_delete` executor today (the ten
registered are at `:344-411`).

### Change

1. `ApiService.deleteWorkout(id)` — `DELETE /api/workouts/{id}`, treating
   **404 as success** (already gone is the desired end state).
2. `resolveWorkoutBackendId(row)` mirroring the food-log resolver.
3. `deleteWorkout` becomes: remove locally, then attempt the API delete;
   on failure enqueue `{ type: 'workout_delete', key: <client_id or id>,
   payload: { backendId, client_id } }`.
4. Register the `workout_delete` executor.
5. **Tombstone against the pull race.** Deleting locally while a pull is
   in flight lets the merge re-add the row. Keep a small
   `deletedClientIds` set in the profile-scoped store; the merge at
   `:802-829` skips any row whose `client_id` or id is in it; an entry is
   dropped once the server delete is confirmed. Without this the fix is
   only mostly effective, which for a delete is not good enough.

### Done means

Delete a synced workout, reload, sign out and back in — it stays gone.
Delete with the network off, reconnect — it goes away server-side and does
not return. Delete a never-synced workout — no request, no error. Deleting
one workout leaves the rest untouched.

---

## Fix 2 — Password sign-in creates a new data space every time

### What is broken

`Token` (`schemas.py:28-30`) carries only `access_token` and
`token_type`; `/register` and `/login` return exactly that
(`routers/auth.py:75-114, 117-139`). So `result.user_id` in
`Login.jsx:65,90` is always `undefined` and the id is always
`'cloud_' + Date.now()`. `getMe` is cookie-only (`ApiService.js:70-77`),
so a Bearer-only password session never self-corrects. Every password
login and **every registration** lands on a fresh scope.

Cloud-backed rows re-pull into the new scope, so the loss is not total —
but anything not yet synced, plus the in-progress workout, exercise
preferences, progression settings, equipment profile and nutrition
targets, is stranded under the previous id.

### The rollout hazard, and why it is small right now

The deployed frontend **already reads** `result.user_id`. The moment the
backend returns it, every existing password client switches scope on its
next sign-in. That is the same stranding, once, for anyone who already has
a password account with local data.

**This is why it goes now rather than later:** the owner uses Google, and
co-workers have been sent the link but are not yet signed up. The set of
affected users is currently near zero and grows with every day we wait.

**Before implementing, count them.** `hashed_password ==
GOOGLE_OAUTH_SENTINEL` distinguishes OAuth from password accounts
(`routers/auth.py:288, 395`). One read-only query against production,
authorised by the owner, tells us exactly who is affected. If the answer
is zero, ship it plainly. If not, the affected users are named and their
stranded scope is recoverable by hand.

### Change

1. `Token` gains `user_id: str`. Both handlers populate it — they already
   have `user.id` (`:113-114`, `:138-139`).
2. `Login.jsx` uses `result.user_id` and **refuses to activate without
   it**, rather than silently falling back to a timestamp. A missing id is
   now a bug, not a normal path, and should surface as one.
3. The timestamp fallback is deleted from both call sites.

No migration. No new endpoint. No change to `getMe`, cookies, or the OAuth
path.

### Done means

Register a disposable password account: its profile id is the server UUID.
Sign out, sign in again: **the same** id, and the data is still there.
Confirmed against the live backend with a throwaway account, deleted after.

---

## Fix 3 — The active workout never syncs

### What is broken

Three separate gaps, all verified:

- No executor for the active workout exists (ten registered at
  `:344-411`; none for it), so a failed push has no retry.
- The only path that pushes it is `syncToApi`
  (`StorageService.js:429-457`), and the effect that calls it depends on
  **`history`** (`WorkoutContext.jsx:1143-1154`) — starting or editing a
  live workout changes `activeWorkout`, which triggers nothing.
- Failures are swallowed as `console.warn` (`:446-455`).

And `ApiService.getActiveWorkout` (`:126-127`) has **no caller in
`src/`**, so nothing ever pulls it back.

Net effect: an in-progress workout exists only on the device that started
it, indefinitely.

### Change

1. Register an `active_workout` executor for the save and the clear.
2. Push on `activeWorkout` change — debounced (a set completion should not
   be one request per keystroke), gated on the same conditions as the
   other cloud writes, and enqueued on failure.
3. Call `getActiveWorkout` on profile load, merging only when the server
   copy is newer and there is no local one — local-first, per the app's
   stated invariant.

**Deliberately not fixed here:** the stale-delete race the audit found
(a late `clearActiveWorkout` erasing a newer server copy). That needs a
server-side version check, which is separate scope. Fix 3 makes the race
*more* reachable by pushing more often, so it is called out here and
must be decided before Fix 3 ships — either accept it (it costs the
server copy, not the phone's) or add the fence first.

### Done means

Start a workout on one device, open the app on another: it is there.
Kill the network mid-workout, log sets, reconnect: the server catches up.
Finish the workout: the server's active slot clears.

---

## Verification (all three)

Local `npm run dev` on a clean profile with Playwright at desktop and
375 px, console clean; then a **disposable** account against the live
backend, deleted within the session — never the owner's. Deploy each
commit and confirm with `scripts/poll_deploy.sh`. `ARCHITECTURE.md` and
the Coach APP KNOWLEDGE block updated in the same commit as any change
that alters behaviour they describe.

Backend changes here are small and additive, but there is still no local
PostgreSQL and no test harness, so Fix 2's backend edit is verified by
live probe against `/openapi.json` plus a disposable account — stated
honestly rather than claimed as regression-tested.

## Open decisions

1. **Fix 2 timing:** run the read-only count of password accounts first
   (recommended), or ship without counting?
2. **Fix 3 and the stale-delete race:** accept it for now, or add the
   server-side version check before Fix 3?
3. **Order:** as written (1, 2, 3). Fix 1 is the most broken promise; Fix
   2 is cheapest now and gets more expensive daily.

## Not in scope

The S29 two-account designs (shelved, documents retained). The in-app
Feedback build (§5). Any change to OAuth, cookies, or `getMe`'s transport.

## §5 — Feedback, replaced

The in-app build needed a table, a migration, a router, an admin inbox, a
test harness and a PostgreSQL install; four reviews each found real
problems. Replacement: a **"Send feedback" link in Settings** beside the
version line that opens the user's mail client with the app version and
page prefilled. No backend, no schema, no tests. LOW zone, one file. If it
gets used enough to be annoying, build the real one then, with evidence.
`docs/feedback_spec_s31.md` is retained for that day.
