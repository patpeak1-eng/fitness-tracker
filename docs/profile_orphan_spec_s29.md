# Spec — Profile list replacement orphans local profiles (S29)

> **SUPERSEDED by [`profile_identity_spec_s29_v2.md`](profile_identity_spec_s29_v2.md).**
> Read that file instead. This one is kept only as the record of what the
> first pass got wrong and how it was caught.
>
> **STATUS: CHANGES-REQUIRED — do not implement this plan as written.**
> Cross-review by an independent top-tier agent (2026-09-09) returned
> CHANGES-REQUIRED. The central premise below is **wrong**, and it is wrong
> in the direction that makes the problem bigger, not smaller. Corrections,
> each independently re-verified:
>
> 1. **There is no stable identity for password login.** `Login.jsx:65,90`
>    read `result.user_id`, but `Token` (`backend/app/schemas.py:28-30`)
>    carries only `access_token` and `token_type`, and both `/register` and
>    `/login` return exactly that (`routers/auth.py:113-114,138-139`). The
>    live deployed `/openapi.json` confirms it. So `'cloud_' + Date.now()`
>    is not a fallback — it is **the** path. Every email/password login mints
>    a new profile id and therefore a new data scope. `getMe` cannot repair
>    it: it is cookie-only (`ApiService.js:70-77`) while password login
>    holds a Bearer token. **This hits single-profile users**, which
>    invalidates §7 Q1's framing that the bug only matters to people who
>    deliberately keep more than one profile.
> 2. **Retaining cloud siblings exposes a principal/data-scope mismatch.**
>    `switchProfile` (`WorkoutContext.jsx:1357-1364`) changes the selected
>    profile but never the credentials, so a pull can write account B's data
>    into profile A's scope. Account deletion follows credentials too, so
>    removing `currentProfile.id` is not necessarily removing the account
>    actually deleted.
> 3. **The sync queue crosses account transitions.** `SyncQueue` dispatches
>    without an owner check and flushes on boot, so a failed operation for
>    account A can replay against account B after a re-login.
> 4. **Preserving siblings breaks the explicit-logout gate.**
>    `getOrCreateProfiles` only consults `isLoggedOut()` inside the
>    `profiles.length === 0` branch, and `refreshGlobalState:469-481` then
>    selects `profilesData[0]` regardless.
> 5. **A storage-only upsert leaves React's `profiles` state stale.** The
>    boot branches never call `setProfiles`, so a later CRUD action rewrites
>    storage from a stale snapshot and re-orphans what the upsert just fixed.
>
> Confirmed as originally written: the call-site locations (though the count
> is **six**, not five — sign-out and delete are separate sites), the
> rejection of the stale-null-closure hypothesis (independently reproduced
> under a StrictMode harness), and "orphaned, not deleted" for the immediate
> list-replacement operation.
>
> **Scope has grown past a single helper into identity, auth transport, sync
> ownership, and the logout gate — four systems.** Per AUTONOMOUS_LOOP_RULE
> that is a hard stop pending owner direction. A revised spec supersedes
> this one before any code is written.

**Status:** spec only, no implementation, now superseded pending revision.

**Zone:** HIGH — touches the login flow, profile identity, and
`WorkoutContext.jsx`. Two-stage gate applies.

**Backlog origin:** `SESSION_START.md` P3, "Cloud login/register silently
orphans local profiles (found S18, coordinator-confirmed)".

---

## 1. What the S18 note said, and what is actually true

The note described **two** call sites replacing the profiles list. Direct
inspection of current `main` (`0612cfd`) found **five**, in four distinct
user-facing flows. Everything below was read from source, not carried over
from the note.

| # | Flow | Location | Call |
|---|---|---|---|
| 1 | Email/password **login** and **register** | `src/pages/Login.jsx:29-35` (`activateProfileAndGo`), invoked at `:64` and `:89` | `saveProfiles([profileObj])` |
| 2 | **Continue without an account** | `src/pages/Login.jsx:106-111` | `saveProfiles([{ id: 'user_default', … }])` |
| 3 | **Cloud session boot**, cookie user differs from active profile | `src/context/WorkoutContext.jsx:513-518` | `saveProfiles([cloudProfile])` |
| 3b | **Cloud session boot**, same user but a server field drifted | `src/context/WorkoutContext.jsx:519-529` | `saveProfiles([refreshed])` |
| 4 | **Sign out** and **delete account** | `src/pages/Profile.jsx:76`, `src/pages/Settings.jsx:213` | `saveProfiles([])` |

For contrast, the profile CRUD actions are all correct and list-preserving —
`createProfile` (`WorkoutContext.jsx:1343-1345`), `deleteProfile`
(`:1369-1371`), `updateProfile` (`:1387-1393`). The bug is not that the app
lacks a correct pattern; it is that four flows bypass it.

### Findings that change the picture

- **This is not only a login-time bug.** Vector 3b fires on an *ordinary
  boot* whenever the server's copy of `name`, `color`, `avatar`, or `email`
  differs from the cached profile — for example the S21 colour backfill. A
  cloud user with sibling local profiles can lose the list without touching
  the login screen.
- **Signing out destroys profiles that have nothing to do with the
  session.** Vector 4 empties the entire list. Local profiles created via
  `/profiles` are not part of any cloud account, yet a sign-out removes them.
- **Deleting your cloud account also removes your local profiles.** Same
  call, in `Settings.jsx`. Deleting account A silently unlists profile B.
- **A hypothesis I raised and rejected, recorded so it is not re-raised:** I
  suspected the `currentProfile` reference in the `[]`-dependency effect at
  `:513` was a stale `null` closure, which would have made the wipe fire on
  *every* cloud boot. It is not. `useState` at `:284` uses a lazy initializer
  that reads storage during first render, so the closure captures a hydrated
  profile. Common-case boots do not wipe.
- **The wipe often reads as "my profile reset", not "my list shrank."**
  `getOrCreateProfiles` (`StorageService.js:245-269`) auto-creates a fresh
  `user_default` profile whenever the list is empty and the user is not
  explicitly logged out.

## 2. Why the data is orphaned rather than deleted

The profiles list is a single **global** localStorage key
(`saveProfiles` → `writeJSON(KEY.profiles, …, { global: true })`,
`StorageService.js:162-164`). Per-profile data is written under **id-scoped**
keys (`scopedKey(baseKey, uid)`).

Nothing in any of the five vectors calls `clearProfileData`
(`StorageService.js:386-388`) — that is only reached from `deleteProfile`.
So a replaced list leaves every scoped blob intact and unreferenced: history,
templates, settings, active workout, all still in localStorage, with no entry
in the list pointing at them. **The data is recoverable in principle.**

## 3. How a user reaches this state

`/profiles` (`App.jsx:67`) renders `ProfileSelector`, whose "add" control
calls `createProfile` (`ProfileSelector.jsx:16`). So: sign in to a cloud
account, add a second profile for a family member, then sign out — or simply
reboot after a server-side field change — and the second profile disappears
from the picker.

## 4. Constraints

- **No backend or schema change.** The multi-profile list is local-only;
  the server models a single user per account. No migration, no
  `models.py`, no `alembic/`. This keeps the change out of the most
  dangerous HIGH-zone territory, though the flow itself remains HIGH.
- **`ApiService.js` is not touched.**
- **`WorkoutContext.jsx` is single-writer** — no parallel terminal on it
  while this runs.
- **Recovering already-orphaned profiles is a separate problem** from
  stopping future orphaning, and has a real limitation: `name`, `color`, and
  `avatar` exist *only* in the profiles list. The scoped blobs do not carry
  them. Anything reconstructed from orphaned keys can recover the **data**
  but not the **identity** — entries would come back as "Recovered profile"
  with a placeholder name for the user to rename.

## 5. Options

| Option | Approach | For | Against |
|---|---|---|---|
| **A — Upsert everywhere** | Add a `upsertProfile(profile)` helper to `StorageService`: load the list, replace-by-id or append, save. Replace vectors 1, 2, 3, 3b with it. Decide vector 4 separately (§7 Q1/Q2). | Smallest diff; one helper fixes four sites; mirrors the already-correct CRUD pattern; no new concepts | Does not recover profiles already orphaned |
| **B — A plus a recovery pass** | A, plus a one-time scan of localStorage for id-scoped keys whose uid is absent from the list, re-adding placeholder entries | Recovers existing losses | Recovered entries are unnamed; adds a migration-shaped code path that runs on every boot forever for a one-time problem |
| **C — List is authoritative; sign-out only clears the session** | Never replace the list anywhere. Sign-out clears token + `currentProfileId` only | Cleanest conceptual model | Largest behavioural change; alters what sign-out means; more surface to review in a HIGH-zone flow |

**Recommendation: A**, with vector 4's semantics settled by decision. It is
the Ponytail answer — the repo already contains the correct pattern three
times over, so the fix is to reuse it rather than invent anything. B's
recovery can be run once as a throwaway console snippet if you actually have
orphaned data, rather than shipped as permanent boot-time code.

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A merge keyed wrongly could point two profiles at one data scope, cross-contaminating history | **Highest** — this is the one that matters | Upsert strictly by `id`; never match on name or email; verify with two profiles holding distinct history |
| `user_default` id is minted in two places (`Login.jsx:107`, `StorageService.js:256-261`), so "continue without an account" can collide with an auto-created default | Medium | Upsert-by-id makes collision a merge rather than a duplicate, which is the desired outcome — but confirm it reattaches to the expected data |
| Sign-out leaving cloud profiles listed could imply a session that no longer exists | Medium | Depends on Q1; if we stop clearing, remove only the signed-out account's entry |
| Regression in the auth gate — an empty list is what currently triggers the login screen | Medium | `isLoggedOut()` already gates `getOrCreateProfiles`; verify the gate still fires when the list is non-empty but the session is gone |

## 7. Decisions required

1. **Is multi-profile a feature you actually use?** If every device in the
   family runs a single profile, this is a latent bug and the honest
   recommendation is to leave it, or make the replacement explicit and
   documented, rather than spend a HIGH-zone cycle. Everything below assumes
   yes.
2. **Sign-out semantics** — should signing out remove only the signed-out
   cloud profile and leave local ones listed, or keep clearing everything?
3. **Account deletion semantics** — same question, decided separately.
   Deleting cloud account A arguably should not unlist local profile B.
4. **Recovery** — do you want already-orphaned profiles recovered (with
   placeholder names), or is stopping future loss enough?
5. **"Continue without an account"** — append `user_default` to the existing
   list, or keep replacing?

## 8. Definition of done

- A single `upsertProfile` helper in `StorageService`, used by every vector
  that currently replaces the list.
- With two profiles present (one cloud, one local, each holding distinct
  history), all of these leave both listed and both data scopes intact:
  login, register, continue-without-account, boot with a drifted server
  field, boot as a different cloud user, sign out, delete account.
- The login gate still appears when the session is genuinely gone.
- Verified first on `npm run dev` against a clean profile, then once against
  the live backend with a **disposable** account — never the owner's.
- `docs/ARCHITECTURE.md` updated in the same commit if the profile-identity
  model changes shape.

## 9. Work split

Single writer, single session. `WorkoutContext.jsx` is exclusive for the
duration. Suggested order: helper + unit-level check → the two `Login.jsx`
vectors → the two `WorkoutContext.jsx` boot branches → sign-out and delete
per decisions → full two-profile verification pass.
