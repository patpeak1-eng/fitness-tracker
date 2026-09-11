# Spec — Account identity, profile retirement, and sync ownership (S29 v2)

> **STATUS: REVISION 3, 2026-09-10 — all §7 decisions answered by the owner;
> priority raised to P1; awaiting plan review of this revision and the
> literal "Cleared, proceed with implementation." No code has been written.**
> Supersedes `profile_orphan_spec_s29.md`, whose central premise was wrong.
> Two independent cross-review passes on revision 2 returned
> CHANGES-REQUIRED / AGREE-WITH-NITS and are incorporated.
>
> **Why P1 now:** the owner has started sharing the app with co-workers.
> Defect 3.1 is latent for Google sign-in and live for email/password
> sign-in; new users are the ones most likely to register with a password.
>
> **Resume by reading this file top to bottom.** It is written for a session
> with no memory of the conversation that produced it.

**Zone:** HIGH — identity, auth transport, user data, sync ownership, and the
logout gate. Four systems, which is independently a hard stop under
AUTONOMOUS_LOOP_RULE.

---

## 1. How this started, and why the first plan was wrong

Filed in `SESSION_START.md` as a **P3**: "cloud login/register silently
orphans local profiles." The first spec accepted that framing and proposed a
single `upsertProfile` helper.

Cross-review overturned the premise. The framing was wrong in the direction
that makes the problem **bigger**, and the priority was wrong by two levels.

## 2. The owner's product decision (2026-09-09, decisive)

> "For the multiple users on one device, that should never happen. All users
> will be using their own devices and won't share devices."

**One account is one person on their own device.** Device-sharing is not a
supported workflow and never will be. This settles what the frontend's
multi-profile feature is *for*: nothing. It has no forward use case.

**What this decision does NOT settle** — and the distinction matters, because
getting it wrong destroys real data:

- It does not make removal free. Sibling profiles may already exist on real
  devices, created deliberately or accidentally in earlier sessions. Data
  that exists must not be destroyed just because the workflow that made it is
  now unsupported.
- It does not eliminate multiple entries. The *same* person signing out and
  back in, or holding two Google accounts (personal and work), still produces
  more than one local identity on one device.
- It does not fix the identity defect. See §3.1 — that defect reaches a
  single-profile, single-device, one-account user on every password sign-in.

**Owner's further decisions (2026-09-10), recorded verbatim in spirit:**

| # | Question | Decision |
|---|---|---|
| 1 | Optional containment stage first? | Left to the builder. **Decision: skip the separate stage; fold "stop creating new profiles" into stage 2** — with one profile per person it is a two-line UI removal, not a release |
| 2 | Does any device hold a second profile? | "No one has a second profile. Make it so no one can have a second profile." |
| 3 | Password sign-in? | **Keep and fix.** Nearly everyone uses Google, but anyone without a Google account must still be able to use the app |
| 4 | Interim login-page copy? | Not needed |
| 5 | The "Fire Station profile" framing in `ARCHITECTURE.md`? | Not a thing. The only fire-station aspect is *where* the owner trains; the equipment "station" environment idea did not pan out. Framing corrected in the same commit as this revision |

**What decision 2 changes and what it does not.** The picker, `createProfile`,
and `switchProfile` are retired outright rather than staged behind a legacy
view. But "no one has a second profile" is the owner's belief, not something
the app can verify — devices are not inspectable. So the retirement keeps
one guard, cheap and non-destructive: if a device's stored list holds more
than one entry at boot, do **not** pick one and discard the rest; keep the
list and its scopes intact and let the account-bound identity select its
own entry (§6 stage 3). Nothing is deleted, merged, or re-keyed.

## 3. The three defects, verified

Every claim below was read from source. Where a claim was load-bearing it was
verified a second way; those are marked.

### 3.1 — P1: password sign-in has no stable identity

`Login.jsx:65,90` build the profile id as
`result.user_id || 'cloud_' + Date.now()`. But `Token`
(`backend/app/schemas.py:28-30`) carries **only** `access_token` and
`token_type`, and both `/register` and `/login` return exactly that
(`backend/app/routers/auth.py:113-114,138-139`).

**Verified three ways:** schema source, route source, and the live deployed
`/openapi.json`.

So the timestamp is not a fallback — it is the only path. Every email/password
sign-in mints a new profile id and lands on a new localStorage data scope.
The boot path cannot repair it: `getMe` sends `credentials: 'include'` and no
Authorization header (`ApiService.js:70-77`), while password login holds a
Bearer token, so `getMe` fails and the correcting branch never runs.

**This reaches the ordinary single-profile user.** It is not a multi-profile
edge case. Google/OAuth users are unaffected — the cookie makes `getMe`
succeed, so their id is the server's real UUID.

### 3.2 — P1: the sync queue crosses account boundaries

`SyncQueue` accepts ownerless entries, deduplicates by type/key alone,
dispatches without an ownership check, and flushes on boot, foreground, and
online. A failed operation for account A can therefore replay against account
B's credentials after a sign-out and sign-in.

Independent of profile count — removing the picker does not fix it. Also
reachable by an OAuth user switching Google accounts in the same browser.

Note for implementation: the existing local `uid` is **not** proof of
ownership. It is a local scope id, sometimes a timestamp alias, and some
producers omit it entirely (`WorkoutContext.jsx:1160`,
`TimerContext.jsx:227-230`). The 20-entry dead-letter cap
(`SyncQueue.js:20,46`) is not a suitable archive for bulk migration.

### 3.3 — P1: preserving any profile breaks the explicit-logout gate

`getOrCreateProfiles` (`StorageService.js:245-269`) consults `isLoggedOut()`
**only inside** its `profiles.length === 0` branch. `refreshGlobalState`
(`WorkoutContext.jsx:469-481`) then selects `lastId` or `profilesData[0]`
unconditionally.

So the moment we stop emptying the list on sign-out — which the obvious fix
to the original bug requires — **explicit logout stops gating**, and
`App.jsx:53` admits protected routes. The naive fix silently disables logout.

Explicit logout must become independent of list length. Ordinary
expired/offline auth must keep working local-first; those are different
conditions and must not be collapsed. A surviving cookie can also reactivate
a session at `WorkoutContext.jsx:501-518`.

### 3.4 — P2: storage-only writes leave React state stale

The cloud-boot branches (`WorkoutContext.jsx:515-529`) write storage and
`currentProfile` but never call `setProfiles`. A later `createProfile` /
`deleteProfile` / `updateProfile` then rewrites storage from a stale
`profiles` snapshot, undoing the correction. Any helper must return the
resulting list and callers must synchronise React state with it.

## 4. The rollout hazard — read before touching the backend

**Adding `user_id` to the `Token` response is not a safe backend-only
deploy.** The currently deployed frontend already reads `result.user_id`. The
moment the backend returns it, every already-deployed browser switches from
its `cloud_<timestamp>` scope to the real UUID scope on the next sign-in —
and the local history under the old scope silently disappears from view.

A backend-first commit therefore **causes the exact data-loss event this work
exists to prevent**, with no frontend change at all. The field is additive to
the JSON contract but is not additive in behaviour.

This is why §6 puts compatibility before identity activation.

## 5. Migration position — the part that must not be hand-waved

Existing local scopes may hold the only copy of someone's workout history.
`loadProfileState` reads one supplied uid; it neither combines nor recovers
siblings. Removing a profile's list entry, or its only route to the UI,
strands that data even though every byte is still on disk.

**Prohibited without explicit, per-item user choice:**
- picking `profiles[0]`, or merging by name or email
- merging sibling histories into the currently signed-in account
- calling `clearProfileData` as cleanup
- treating `importSnapshot` as a migration mechanism — it removes current keys
  first and can reintroduce old profiles, stale credentials, and unowned
  queued writes (`StorageService.js:390-420`)

Local scopes and timestamp aliases **cannot** be attributed to an account
from their keys. Uncertain records are retained for deliberate recovery, not
guessed at. A metadata-only archive that initialization then ignores does not
count as migration.

## 6. Staged plan

Each stage is separately spec'd, separately reviewed, separately signed off.

| # | Stage | Fixes | Notes |
|---|---|---|---|
| 0 | This spec (revision 3), plan-reviewed and cleared | — | current position |
| 1 | Account-boundary safety **plus profile retirement**: single authenticated principal; credential-transition policy; owner-bound queue entries; explicit logout independent of list length; remove profile creation, switching, and the `/profiles` route; keep `updateProfile` for name editing; multi-entry guard (§2) | 3.2, 3.3, decision 2 | first substantive release; must land **before** stage 2. `WorkoutContext.jsx` + backend together → HIGH |
| 2 | Stable identity: return `user.id` in `Token` for login and register, remove the timestamp fallback, client refuses a missing/invalid id | 3.1 | gated by §4 — deploy the compatibility handling in stage 1 **first**; verify old/new client against old/new backend |
| 3 | Cleanup: delete `ProfileSelector`, `createProfile`/`switchProfile`/`deleteProfile` and their exports, Settings "switch profile" entries; update Coach APP KNOWLEDGE ("multi-profile support") and `ARCHITECTURE.md` | — | docs + dead code; LOW once 1 and 2 are live |

**Reviewer's recommendation, accepted:** identity activation is a
prerequisite, not a resolution, and must follow account-boundary safety.
Prefer adding `user_id` to `Token` over a second frontend round-trip — it
avoids the registration-succeeded-but-lookup-failed case, and `getProfile`
currently does not check `r.ok`.

**The §4 rollout trap, restated as a stage-1 requirement:** stage 1 must
make the client tolerate a `user_id` appearing in the login response
*without* switching an existing device's scope out from under it. Only then
can stage 2 return the field.

**First commit when work resumes:** this revision, plan-reviewed and
cleared. First *code* commit: stage 1.

## 7. Decisions — all recorded (see §2 table)

Nothing remains open for the owner. What remains is engineering: the
plan review of this revision, then the clearance phrase, then stage 1.

Open for the **builder and reviewer** to settle in the stage-1 design, not
the owner: the exact ownership key for queue entries (account id vs local
scope id vs both); how a pending entry created by an old client is held
rather than replayed; and whether explicit logout should clear the stored
list or only the active id (the spec's position: only the active id, with
`isLoggedOut()` consulted regardless of list length).

## 8. Verification required before any stage is called done

Repeated password sign-in; Google sign-in; mixed cookie/Bearer; A→B→A
transitions; offline and 401; delayed and duplicate auth resolution;
StrictMode double-invocation; pending queue entries created by both old and
new clients; old backup import. Local `npm run dev` first, then a
**disposable** account against the live backend — never the owner's.
`docs/ARCHITECTURE.md` updated in the same commit as any stage that changes
the persistence or auth model.

## 9. Provenance

Planned by the Claude session, cross-reviewed twice by an independent
top-tier Codex agent working read-only in its own worktree on branch
`codex/review-s29-profile-orphan` (Traycer agent
`a85ddc71-6cd5-4a72-8da2-d1eefe1a83a1` — reuse it on resume; its context
holds both reviews). Pass 1 returned CHANGES-REQUIRED and overturned the
premise; pass 2 returned AGREE-WITH-NITS and supplied §2's account-versus-
device distinction, §4, and §5. Both reviews live in that agent's transcript,
which is the proof artifact.
