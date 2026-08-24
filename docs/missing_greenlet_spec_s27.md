# MissingGreenlet + /api/workouts/active Audit — Investigation Spec (S27)

**Status:** SPEC ONLY — no application code written or modified.
**Trigger:** Railway backend Deploy Logs, 2026-08-24 08:02:06 MDT, deployment
cbd019e7: `sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been
called; can't call await_only() here. Was IO attempted in an unexpected
place?` Frames: `engine/base.py:1969 _exec_single_context` →
`default.py:952 do_execute` → `dialects/postgresql/asyncpg.py:585 execute` →
`_concurrency_py3k.py:123 await_only`. Adjacent lines, same second:
GET /api/exercises 200, GET /api/weight 200, DELETE /api/workouts/active
204, PUT /api/profile 200 ×2. Note: this predates the S27 sliding-session
deploy (~11:34 MDT) — not caused by that change.

---

## 1. Which endpoint raises it

**Ambiguous from the available excerpt — stated plainly, not guessed.** The
quoted traceback contains only SQLAlchemy-internal frames; the excerpt has
no application frame and no request line for the failing call. The adjacent
lines are all *successes*, which identifies the surrounding traffic burst
(it matches the frontend boot sequence: exercise/weight pulls, the
`syncToApi` active-workout DELETE — see §4 — and the settings-backfill
profile PUTs) but not the failing endpoint itself.

What the code audit can and cannot narrow (evidence in §2):

- The textbook causes are **ruled out** for every ordinary request handler.
- The only structurally risky session usage found in the whole backend is
  in the **coach streaming path** and the **voice WebSocket** (§2.3, §5).

Closing the identification requires the full log entry: Railway Log
Explorer, filter `@deployment:cbd019e7` around 08:02:06, and capture the
frames *above* the SQLAlchemy ones plus the request line. Listed as Open
Question 1.

## 2. Root cause analysis

### 2.1 Textbook causes — ruled out, with evidence

MissingGreenlet means SQLAlchemy's sync-facing internals were entered
without the greenlet bridge — classically a lazy ORM load from sync code in
an async app. Here:

- **Post-commit expired-attribute refresh: ruled out.** The session factory
  sets `expire_on_commit=False` (`backend/app/database.py:24-29`), so
  attribute access after `commit()` performs no IO.
- **Lazy relationship loads during response serialization: ruled out.**
  `User` carries many relationships (`backend/app/models.py:46-95`), but no
  response schema exposes any of them — e.g. `UserResponse`
  (`backend/app/schemas.py:75-92`) and `WorkoutResponse`
  (`schemas.py:134-141`) map scalar columns only, and `ProfileResponse`'s
  `stats` is fetched by an explicit awaited query
  (`backend/app/routers/profile.py:15-25, 33, 73`), never via the
  relationship attribute.
- **Non-awaited session calls: none.** A sweep for `db.execute/commit/
  refresh/scalar/flush/delete/merge` without `await` across
  `backend/app/routers/*.py` and `backend/app/*.py` returns zero hits.
- **Concurrent use of one session: none found in request handlers.** The
  only `gather`/`create_task` usage is the voice WS text/audio forwarders
  (`backend/app/routers/voice.py:256-280`), and those tasks do not touch
  the DB (session use ends at authentication, `voice.py:123, 162`).
- Handlers that return ORM data after a commit consistently
  `await db.refresh(...)` first (e.g. `workouts.py:80-81, 110-112, 129-130`,
  `templates.py:42-44`, `weight.py:40-42`, `exercises.py:39-41`).

### 2.2 What remains structurally plausible

**(a) The coach SSE generator uses the request-scoped session after the
handler has returned.** `POST /api/coach/chat` builds its context with the
request's `db`, then returns a `StreamingResponse` whose generator
(`backend/app/routers/coach.py:808-874`) later runs
`db.add(...)` + `await db.commit()` to persist the assistant reply
(`coach.py:862-870`). That `db` comes from the `get_db` yield dependency
(`database.py:34-37`). Whether the dependency's `async with` block has
already exited when the generator body runs **depends on the installed
FastAPI version** — the teardown ordering for dependencies-with-yield
changed around FastAPI 0.106, and `backend/requirements.txt:1` pins
**nothing** (`fastapi`, bare), so the deployed behavior can differ between
builds. A session whose scope has ended, used from a streaming task, is
exactly the shape that produces greenlet-context errors.

**(b) Mid-stream client disconnect / task cancellation.** If the client
drops during the SSE stream (mobile browser backgrounded, network change),
Starlette cancels the generator task. A `CancelledError` landing inside a
DB await can leave the connection to be finalized outside the greenlet
bridge (generator `aclose`/GC), which surfaces as MissingGreenlet — often
logged detached from any request line, matching the excerpt's shape.

**Nuance that must be checked before accepting (a):** the persist commit is
wrapped in `try/except Exception → await db.rollback()`
(`coach.py:866-870`), so a MissingGreenlet raised *inside that commit*
would be caught — the logged traceback would then have to come from the
rollback itself failing, from the context-build queries, or from another
path entirely. This is why §1 says ambiguous: the full traceback's app
frame decides it.

### 2.3 Verdict

Cannot be conclusively pinned from the repo plus the provided excerpt. The
coach streaming path is the only code whose session usage is
structurally unsound under some (unpinned) FastAPI versions and under
mid-stream cancellation; everything else audited is clean. Confirmation
requires the full traceback (Open Question 1) and the deployed FastAPI
version (Open Question 2).

## 3. User impact and frequency

- **Frequency: unknown from the excerpt** — one occurrence quoted. Whether
  it recurs is a Log Explorer count away (Open Question 3).
- **If the source is the coach post-stream persist** (§2.2a): the user sees
  their coach reply stream normally; the failure means the **assistant
  reply is not saved to coach history** — on the next conversation load
  (`GET /api/coach/history`, `coach.py:977`) the coach's side of that
  exchange is missing, and the model's replayed context loses a turn.
  Silent, partial data loss; no 500 reaches the user.
- **If the source is a plain request handler**: that request 500s. The
  frontend's behavior then depends on the caller — queue-backed pushes
  (workout/template/settings) retry via SyncQueue; reads fall back to
  localStorage (`WorkoutContext` boot paths). No identified caller crashes
  the UI on a 500.
- The adjacent-line evidence shows the burst's other requests all
  succeeded, so the incident did not cascade.

## 4. /api/workouts/active caller audit — S26 §1.4 correction

**The S26 §1.4 claim is wrong and is hereby corrected.**
`docs/session_expiry_spec_s26.md` §1.4 stated ApiService's
`/api/workouts/active` helpers have "no frontend code calls them" (the
S26 grep searched only the namespaced form `ApiService.saveActiveWorkout`;
the real call sites use **named imports**). Production's
`DELETE /api/workouts/active 204` is exactly one of these calls firing.

Complete caller inventory (every `/api/workouts/active` method, all of src/):

| Method | Defined | Called from |
|---|---|---|
| `getActiveWorkout` (GET) | `src/services/ApiService.js:126-127` | **nowhere** — zero call sites |
| `saveActiveWorkout` (PUT) | `ApiService.js:129-139` | `src/services/StorageService.js:1` (named import) → `syncToApi`, `StorageService.js:448` |
| `clearActiveWorkout` (DELETE) | `ApiService.js:141-147` | `StorageService.js:1` → `syncToApi`, `StorageService.js:450` |

`syncToApi` itself has exactly one caller:
`src/context/WorkoutContext.jsx:1122-1128` — an effect keyed on `history`
that fires whenever history is non-empty and changes: **on app boot**
(history hydration/merge) and **after every finished workout**. Inside
`syncToApi` (`StorageService.js:446-451`): if a local active workout
exists → `PUT /api/workouts/active`; if not → `DELETE`.

**How the S26 conclusion fares:**

- *"ApiService has /active helpers but no frontend code calls them"* —
  **false**, as shown above.
- *"Nothing mid-set touches the network"* — **still true in the narrow
  sense**: per-set updates mutate `activeWorkout` state, whose persist
  effect (`WorkoutContext.jsx:1111-1115`) writes localStorage only; no
  network call is keyed on `activeWorkout` changes.
- *But the broader "active workout is local-only" premise is **false***:
  an app **boot during an in-progress workout** PUTs the entire active
  workout to the backend, and every finish/boot-without-active DELETEs the
  slot. A mid-workout session expiry therefore *can* produce a failed
  authenticated call for the active workout itself (catch-swallowed with a
  console.warn, `StorageService.js:448-450` — no SyncQueue entry, no user
  impact, no data loss, since localStorage remains source of truth).
- **Impact on the S26 HIGH-zone decision** (sliding session): the decision
  rested on "the workout reaches the cloud via the queue; local data is
  safe" — that part still holds (these active-slot calls are best-effort
  and lossless). The blast-radius section §1.4, however, understated the
  network surface and should not be cited as authority again. This
  document supersedes it for /active.
- Additional finding: the cloud active-workout slot is **write-only** —
  `getActiveWorkout` has no callers, so the data pushed by PUT is never
  read back by any client. The endpoint currently provides no user-facing
  feature (candidate for either wiring up cross-device resume or removal —
  separate spec; Open Question 5).

## 5. Other handlers with the same structural pattern

1. **`POST /api/coach/chat/stream`** (`coach.py:962-975`) — deprecated
   alias that delegates to `coach_chat` and therefore shares the streaming
   generator's session usage identically.
2. **Voice WebSocket** (`backend/app/routers/voice.py:148-162`) — the
   `get_db` session is request-scoped to the WebSocket handler and thus
   held for the socket's entire lifetime. Post-auth it is not used again
   (§2.1), so it cannot lazily load, but a cancelled socket still tears the
   session down from a cancellation path — same cleanup-outside-greenlet
   exposure as §2.2b, with no query to fail visibly.
3. No ordinary request/response handler shares the pattern; all were
   audited clean in §2.1.

## 6. Fix options (tradeoffs only — no selection made)

### Option A — Dedicated session for the post-stream persist
Inside the coach generator, open a fresh `AsyncSessionLocal()` scope for
the assistant-reply persist (and stop touching the request `db` after the
handler returns). Immune to dependency-teardown ordering and to most
cancellation timing.
- **Files:** `backend/app/routers/coach.py` only.
- **Tradeoffs:** small, targeted; fixes the only structurally unsound
  usage whether or not it is the logged culprit. Does not help if the real
  source is elsewhere (which instrumentation would reveal).
- **Risk/zone:** backend, coach path — MEDIUM-HIGH (coach is a live user
  feature; no auth/schema involvement).

### Option B — Pin FastAPI (and audit the teardown ordering once)
Pin `fastapi==<current-good>` in `backend/requirements.txt` so the
dependency-teardown behavior stops drifting between builds; verify the
pinned version keeps yield-dependencies open through streaming.
- **Files:** `backend/requirements.txt`.
- **Tradeoffs:** removes a whole class of "worked yesterday" bugs and is
  good hygiene regardless; by itself it only freezes today's behavior, it
  does not make the post-return session use *correct*.
- **Risk/zone:** dependency change, backend-wide — MEDIUM (needs a deploy
  watch; no code change).

### Option C — Instrumentation first
Add an exception-logging middleware (full tracebacks with app frames) or
simply pull the complete stored traceback from Log Explorer, plus a
counter, before changing behavior. Then re-run this spec's §1 with data.
- **Files:** none (Log Explorer) or `backend/main.py` (middleware).
- **Tradeoffs:** zero behavioral risk; delays the fix by one
  observation cycle. The right first move if the error recurs rarely.
- **Risk/zone:** LOW.

### Option D — Scope the voice WS session to authentication
Authenticate, then close/release the session before entering the
forwarding loop in `voice.py`, so a cancelled socket has no live session
to tear down.
- **Files:** `backend/app/routers/voice.py`.
- **Tradeoffs:** hardening only — nothing in the excerpt implicates voice;
  cheap and safe but speculative as a *fix* for this incident.
- **Risk/zone:** backend voice path — MEDIUM.

Options are combinable; A+B together close both identified structural
holes, C closes the identification gap.

## 7. Open questions for the coordinator

1. **Full log entry:** Railway Log Explorer, deployment `cbd019e7`, around
   2026-08-24 08:02:06 MDT — capture the frames above the SQLAlchemy ones
   and the associated request line (or confirm the traceback is detached
   from any request, which itself points to §2.2b).
2. **Deployed FastAPI version:** `pip show fastapi` in the backend Railway
   console (requirements.txt is unpinned, so the repo cannot answer this).
3. **Frequency:** Log Explorer count of `MissingGreenlet` across the last
   N deployments — one-off or recurring?
4. **Coach-history spot check:** does the affected account's coach history
   show user turns with missing assistant replies around incident times
   (the §3 signature)?
5. **Product call on the write-only active-workout slot** (§4): wire up
   cross-device resume (GET has zero callers today), or retire the
   endpoint? Either way it deserves its own spec; it also determines how
   much hardening /active merits.
6. Should S26's §1.4 be annotated in-place to point here, or is this
   supersession note sufficient?

---

*Investigated read-only from: backend/app/database.py, models.py,
schemas.py, main.py, requirements.txt, routers/{workouts,profile,coach,
voice,templates,weight,exercises,nutrition,assessments,auth}.py;
src/services/{ApiService,StorageService,SyncQueue}.js;
src/context/WorkoutContext.jsx; docs/session_expiry_spec_s26.md.
No application code modified. S27, 2026-08-24.*
