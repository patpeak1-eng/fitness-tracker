# Session Expiry During Active Workouts — Investigation Spec (S26)

**Status:** SPEC ONLY — no code written. Zone: HIGH (auth/session).
**Trigger:** During a 47-minute workout on Android Chrome, the toast
"Session expired — log in again to keep syncing" appeared at the
finish-workout step. User re-authenticated manually; local data intact.
An external beta tester (Google account) could not self-diagnose this.

---

## 1. Current behavior (with evidence)

### 1.1 Auth cookie and token lifetime

Two independent lifetimes are in play, and they do not match:

- **Cookie lifetime — 30 days.** The Google OAuth callback stores the JWT in
  an HttpOnly `session_token` cookie with `max_age=2592000` (30 days):
  `backend/app/routers/auth.py:294-301`.
- **JWT lifetime — 7 days (default).** The token inside that cookie carries
  its own `exp` claim: `ACCESS_TOKEN_EXPIRE_MINUTES`, read from the
  environment with default `10080` minutes = 7 days
  (`backend/app/auth.py:37`, applied in `create_access_token`,
  `backend/app/auth.py:56-64`). `backend/.env.example:4` also documents
  `10080`. **The value actually set in Railway Variables cannot be
  determined from the code** — if production overrides it, the effective
  lifetime differs from 7 days.
- Verification is `jose.jwt.decode` (`backend/app/auth.py:90`), which rejects
  an expired `exp` with `JWTError` → HTTP 401
  (`backend/app/auth.py:80-95`). Library: `python-jose`; the 7-day figure is
  this app's own env default, not a library default.

**Net effect:** the browser keeps sending a perfectly good cookie for 30
days, but the JWT inside it goes hard-invalid after 7. Days 8–30 are a
guaranteed silent-401 window.

**A second, unconfirmed expiry mechanism:** if `SECRET_KEY` is not set in the
environment, the backend generates an **ephemeral per-process key** at boot
(`backend/app/auth.py:24-34`). Every backend restart or redeploy would then
invalidate ALL outstanding tokens instantly, regardless of `exp`. Whether
Railway sets `SECRET_KEY` cannot be determined from the code (see Open
Questions). Given the deploy cadence (multiple backend deploys per week),
an unset `SECRET_KEY` would fully explain an "expiry" arriving mid-workout
rather than at a 7-day boundary. The 47-minute observation is consistent
with either (a) a JWT issued ~7 days earlier crossing its `exp` during the
workout, or (b) a backend restart under an ephemeral key. The code alone
cannot distinguish these.

### 1.2 What surfaces the toast

- Exact string: `"Session expired — log in again to keep syncing"` —
  `src/components/layout/SyncStatusBadge.jsx:25`.
- It renders when `SyncQueue`'s state has `authExpired: true`
  (`SyncStatusBadge.jsx:16-28`, subscribed at line 14).
- `authExpired` is set in exactly one place: during a queue **flush**, when a
  replayed op's executor throws with `err.status === 401`
  (`src/services/SyncQueue.js:105-110`). `ApiService` attaches `.status` to
  every HTTP error precisely so this check works
  (`src/services/ApiService.js:35-39`).
- Note the two-step choreography: the *failed original push* only
  **enqueues** (which does not set `authExpired`); the toast appears when a
  subsequent **flush** replays the op and hits 401. Flush triggers are
  enumerated in §1.3. This matches the observation that the toast appeared
  "at the finish-workout step": the finish push 401s → enqueue → the user
  lands on /summary (badge is mounted again there) → a flush fires → 401 →
  toast.
- Badge visibility: mounted in `src/components/layout/Layout.jsx:26`, hidden
  while `activeWorkout?.status === 'active'` (`Layout.jsx:15`) — so it can
  appear on the summary screen, the dashboard, and **during a paused
  workout** (paused does not count as guided mode there).

### 1.3 Did the workout reach the cloud? (SyncQueue mechanics)

- `finishWorkout` pushes via `ApiService.saveWorkout`; **any** failure
  (including 401) enqueues the full workout payload:
  `src/context/WorkoutContext.jsx:1657-1677` (enqueue at 1670-1675). Local
  history is written regardless — the push is explicitly non-fatal.
- The queue is **persisted in localStorage** under `fitness_sync_queue`
  (`src/services/SyncQueue.js:15, 25-32`). **A queued workout therefore
  survives browser close before re-login.** It is not lost.
- Flush triggers (`SyncQueue.js:131-140` and callers):
  1. App boot — `SyncQueue.init()` (called from
     `WorkoutContext.jsx:387`) flushes once (line 139).
  2. `online` event (line 135).
  3. `visibilitychange` → visible (lines 136-138).
  4. Manual tap on the "N not synced" badge (`SyncStatusBadge.jsx:33`).
  5. After a successful boot `/me` — `clearAuthExpired()` + `flush()`
     (`WorkoutContext.jsx:526-529`).
- **Re-login path:** both login methods end with `window.location.href = '/'`
  (`src/pages/Login.jsx:34, 114`; Google OAuth is a full redirect chain),
  which forces a full reload → boot `/me` succeeds → trigger 5 replays the
  queue. So re-auth does reliably deliver the queued workout.
- **One genuine data-loss hazard in the replay path:** a non-401 4xx during
  flush (e.g. a 422 validation rejection) **permanently drops the op** with
  only a console.warn (`SyncQueue.js:111-115`). A queued workout that the
  server rejects for shape reasons is gone. 401 and 5xx/429/network keep it.

### 1.4 Blast radius of a mid-workout expiry

- **Set updates / active workout state: unaffected.** The in-progress workout
  lives only in localStorage (`StorageService.saveActiveWorkout`,
  `WorkoutContext.jsx:1113`). `ApiService` has `/api/workouts/active`
  helpers (`ApiService.js:136, 147`) but **no frontend code calls them** —
  grep for `ApiService.saveActiveWorkout` returns zero call sites. Nothing
  mid-set touches the network.
- **Template saves:** `saveWorkoutAsTemplate` persists locally first, then
  cloud-pushes with SyncQueue fallback (`WorkoutContext.jsx:2245-2303`,
  enqueue at 2295). Safe.
- **Per-set template sync (`syncToTemplate`):** local-only — writes state +
  localStorage, no network (`WorkoutContext.jsx:1745-1794`). Safe.
- **Timer preference edits:** backend push with SyncQueue fallback
  (`src/context/TimerContext.jsx:224-232`). Safe.
- **Coach: the one lossy surface.** Coach requests are request/response, not
  queued. On 401 the user gets the generic bubble "Could not reach the coach.
  Check your connection and try again." (`src/pages/CoachView.jsx:618`) —
  wrong diagnosis (it is not a connection problem), no re-login hint, and
  the typed message is not retried. Voice (WS) fails similarly.
- **The toast itself is part of the blast radius:** it can surface during a
  *paused* workout (§1.2) and on the summary screen — the Fire Station
  persona can meet it mid-session.

### 1.5 Refresh behavior

**There is no token refresh of any kind.** `create_access_token` is called
in exactly three places, all initial logins: password register
(`backend/app/routers/auth.py:92`), password login (`auth.py:117`), and the
Google callback (`auth.py:284`). No refresh endpoint exists, no middleware re-issues
cookies, and the frontend never re-requests a token
(grep for "refresh" in `backend/app/routers/auth.py` / `backend/app/auth.py`
finds only SQLAlchemy `db.refresh`). The session expires hard; recovery is a
full re-login (Google redirect chain for OAuth users).

---

## 2. Gap

1. **Cookie/JWT lifetime mismatch (30d vs 7d):** for weeks 2–4 of every
   session the browser holds a cookie that is guaranteed to 401. Users see
   "expired" while apparently still logged in.
2. **No refresh:** even daily active users are forcibly logged out every 7
   days (or on every backend restart, if `SECRET_KEY` is unset — unverified).
3. **Expiry is discovered at the worst moment** — at the end of a workout,
   or mid-paused-session — rather than proactively at app open.
4. **Coach fails with a misleading error** and lost input on 401.
5. **Silent permanent drop of 4xx-rejected queue ops** (`SyncQueue.js:111-115`)
   — orthogonal to expiry but sits directly on the recovery path.
6. **Beta-tester UX:** the recovery action (tap toast → /login → Google) is
   discoverable only via the toast; nothing explains that local data is safe.

---

## 3. Fix options (tradeoffs only — no selection made)

### Option A — Align lifetimes via configuration only
Set `ACCESS_TOKEN_EXPIRE_MINUTES=43200` (30 days) in Railway Variables so
the JWT matches the 30-day cookie; optionally also change the code default.
- **Files:** none (Railway Variables only), or `backend/app/auth.py:37` +
  `backend/.env.example:4` if the default should move too.
- **Tradeoffs:** zero/near-zero code; removes the days 8–30 dead zone.
  Does NOT fix hard expiry — it just moves the cliff to day 30. Longer
  stolen-token validity window (no revocation mechanism exists). Does
  nothing if the real cause is an unset `SECRET_KEY`.
- **Risk/zone:** LOW effort but **HIGH zone** (production environment
  change; auth policy). Coordinator sign-off required.

### Option B — Sliding session (cookie re-issue on activity)
On any authenticated request (or just on `/me` at boot), if the JWT's `exp`
is within N days, mint a fresh token and re-set the `session_token` cookie.
Active users never expire; idle users expire after the configured window.
- **Files:** `backend/app/auth.py` (decode returns `exp`),
  `backend/app/routers/auth.py` (re-issue in `/me` — simplest single point),
  no frontend changes (cookie is HttpOnly; browser just receives it).
- **Tradeoffs:** genuinely fixes the recurring-user case with a small,
  auditable diff if confined to `/me` (runs once per app boot). Idle-expiry
  semantics preserved. Slightly extends token lifetime on each visit —
  standard sliding-session behavior. Bearer-header users (email/password,
  token in localStorage) need a parallel path (e.g. `/me` response returns a
  fresh token for the frontend to store) — that widens the diff and touches
  `ApiService.js`/login storage, which is HIGH-zone frontend.
- **Risk/zone:** **HIGH** (auth.py + routers/auth.py are explicitly
  HIGH-zone). Moderate complexity; needs careful testing of both transports.

### Option C — Proactive expiry detection in the frontend
Keep lifetimes as-is; make expiry visible *early and safely*: on app boot
and on workout **start**, ping `/me`; if 401, show the re-login prompt
before the user invests 47 minutes. Optionally suppress the expired toast
while `activeWorkout` is in progress (mirroring the S26 update-banner rule)
and show it at the summary instead, with copy stating local data is safe.
- **Files:** `src/context/WorkoutContext.jsx` (boot already calls `/me` —
  add a 401 branch that raises the prompt; `startGuidedSession` hook-in),
  `SyncStatusBadge.jsx` (copy/visibility), possibly `CoachView.jsx` for a
  correct 401 message.
- **Tradeoffs:** no auth-policy change, purely UX; the 7-day logout still
  happens, users just meet it at a recoverable moment. Touches
  WorkoutContext (coordination-sensitive file) but no backend.
- **Risk/zone:** MEDIUM (WorkoutContext + user-facing auth UX; no backend,
  no schema). Does not reduce re-login frequency.

### Option D — Full refresh-token architecture
Separate long-lived refresh token (DB-backed, revocable) + short-lived
access token, rotation on use.
- **Files:** `backend/app/auth.py`, `backend/app/routers/auth.py`,
  `backend/app/models.py` + Alembic migration (new table/column),
  `src/services/ApiService.js` (retry-on-401 with refresh).
- **Tradeoffs:** the industry-correct answer; revocation becomes possible.
  Far larger surface: schema change (hard-stop trigger per
  AUTONOMOUS_LOOP_RULE), both transports, retry middleware. Overkill for a
  two-user app unless revocation is actually wanted.
- **Risk/zone:** **HIGH++** (auth + schema + ApiService, three systems).

### Option E — Verify/repair production secrets (may be the actual root cause)
Confirm `SECRET_KEY` and `ACCESS_TOKEN_EXPIRE_MINUTES` are explicitly set in
Railway Variables for the backend service. If `SECRET_KEY` is unset, every
deploy logs the warning at `backend/app/auth.py:31-34` and rotates all
sessions — which would make observed expiry frequency track the deploy
cadence, not the 7-day window.
- **Files:** none (Railway dashboard check; backend deploy logs confirm via
  the warning string).
- **Tradeoffs:** costs minutes; if the key is unset this explains the
  mid-workout expiry outright and options A–D are tuning a symptom.
- **Risk/zone:** read-only check is LOW; *setting* the variable is a
  production env change → **HIGH** sign-off, and note that setting a key
  where an ephemeral one was in use will itself invalidate current sessions
  once.

**Complementary micro-fix (any option):** change the 4xx-drop in
`SyncQueue.js:111-115` to preserve workout-type ops (or park them in a
dead-letter key) so a validation bug can never silently discard a finished
workout. Files: `src/services/SyncQueue.js` only. LOW zone.

---

## 4. Open questions for the coordinator

1. **Railway Variables (backend service):** is `SECRET_KEY` set? Is
   `ACCESS_TOKEN_EXPIRE_MINUTES` set, and to what? (Determines whether the
   observed expiry was the 7-day `exp` or key rotation. Checkable in the
   Railway dashboard → backend service → Variables; deploy logs would show
   the `auth.py:31` warning if the key is ephemeral.)
2. When was the affected user's last login relative to the 47-minute
   workout? (>7 days ⇒ consistent with `exp`; <7 days ⇒ points at Option E.)
3. What idle-logout window is acceptable for this user base — is a 30-day
   sliding session fine, or is 7-day hard expiry a deliberate security
   posture?
4. Should the expired toast be suppressed during paused workouts (matching
   the S26 update-banner rule), and should its copy state that local data is
   safe?
5. Is coach-message loss on 401 worth fixing in this effort, or separately?
6. Priority call: is the SyncQueue 4xx-drop micro-fix in scope for the same
   effort?

---

*Investigated read-only from: backend/app/auth.py, backend/app/routers/auth.py,
backend/.env.example, src/services/SyncQueue.js, src/services/ApiService.js,
src/components/layout/SyncStatusBadge.jsx, src/components/layout/Layout.jsx,
src/context/WorkoutContext.jsx, src/context/TimerContext.jsx,
src/pages/Login.jsx, src/pages/CoachView.jsx. No application code modified.
S26, 2026-08-24.*
