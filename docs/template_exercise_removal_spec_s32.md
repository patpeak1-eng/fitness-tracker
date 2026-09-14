# Remove an exercise from a template — spec (S32)

**Zone:** HIGH — writes `custom_templates`, which is user data and syncs to the
backend. No new write path is introduced; see §2.

**Status:** spec only. No code until the literal clearance.

---

## 1. The problem

There is no way to remove an exercise from a template anywhere in the app.

Requested during the S30 TikTok work ("I'll need to be able to remove an
exercise from any custom template") and never built. Extended by the owner on
2026-09-13 to cover **built-in templates too** — with the rule that editing a
built-in must produce a **new custom template** and leave the built-in intact,
so the shipped baseline is always recoverable.

## 2. What already exists — read this before writing anything

The investigation found most of this feature already built. The work is a UI
path to code that has already been reviewed and shipped.

| Piece | Where | State |
|---|---|---|
| Single canonical template write | `writeTemplate(id, transformFn)` | Shipped (S27). Refuses built-ins by design |
| Create / fork a custom template | `saveCustomTemplate(name, exercises)` | Shipped |
| **The fork rule itself** | `saveTemplateFromPrep(name)` | Shipped |
| Remove an exercise from the active workout | `removeExerciseFromWorkout(instanceId)` | Shipped, exposed on the context, **no UI caller anywhere** |
| Remove-an-exercise control | `CreateTemplateModal` | Exists, but only while building a NEW template |

`saveTemplateFromPrep` already implements exactly the owner's rule:

- own custom template, name unchanged → updates in place, id and `backendId` preserved
- built-in under its own name → **refused**: *"…is a built-in template. Change the name to save your own copy."*
- anything else → forks a new custom template

`WorkoutContext.jsx` states plainly that `writeTemplate` is the one write path
and **"there must never be a second write path."** This spec adds no second
path; it adds a caller.

## 3. Approach

Add a remove control to the **prep screen** — the stage after a template is
picked and before the workout starts — wired to the existing
`removeExerciseFromWorkout`. Saving then goes through the existing
`saveTemplateFromPrep`, which already does the right thing for both template
kinds.

Rejected: a dedicated template editor. It is a much larger surface for the same
outcome, and it would need its own write path — the thing the codebase
explicitly forbids.

## 4. Decisions (owner-approved 2026-09-13)

1. **Route.** Prep-screen removal plus the existing save path. Not a dedicated
   editor.
2. **Fork naming.** Keep today's behaviour — a built-in under its own name is
   refused and the user types a name. The field is **prefilled** with a
   suggestion (`"<name> (my version)"`) so the refusal is a one-tap fix rather
   than a dead end.
3. **Removing the last exercise is refused.** An empty template cannot start a
   workout, so it would be a trap rather than a state worth supporting. The
   control is disabled with a reason when one exercise remains.
4. **Removal is scoped to the session until saved.** Removing an exercise
   changes *this workout* immediately; the template changes only on an explicit
   save. Backing out of prep leaves the template untouched.

## 5. Files

| File | Change |
|---|---|
| `src/pages/TrackWorkout.jsx` | Remove control in the prep list; disabled at one exercise; confirm before removing |
| `src/pages/TrackWorkout.css` | Styling per `docs/DESIGN_TOKENS.md`; icon from `lucide-react`, no emoji |
| Save dialog (same file) | Prefill the suggested fork name when the source is a built-in |

No change to `WorkoutContext.jsx`, `StorageService.js`, `ApiService.js`, or the
backend. If implementation finds one is needed, that is a **scope change** and
goes back to the coordinator (ZONE_OVERRIDE_RULE).

## 6. Risks

- **Built-in mutation.** The one outcome that must never happen. `writeTemplate`
  already refuses it; the test must prove the refusal, not assume it.
- **`sourceTemplateId` after a fork.** A workout in progress points at the
  template it came from. Forking creates a new id; the live workout is **not**
  repointed, because silently moving a session onto a different template is
  worse than the inconsistency. `syncToTemplate` only writes to custom
  templates, so a live session from a built-in cannot write back either way.
- **Confirm before removing.** Removal is destructive from the user's point of
  view; prep can hold a long list, and a mis-tap should not be silent.

## 7. Done means

- An exercise can be removed from a custom template, and the change persists.
- The same on a built-in produces a **new** custom template; the built-in is
  byte-identical afterwards.
- Removing the last exercise is not possible.
- Abandoning prep leaves both template kinds untouched.
- Tests: built-in refusal, fork creates and leaves the original intact, in-place
  update for an own custom template, last-exercise guard. **Each mutation-checked
  — revert the behaviour and confirm the test goes red.** Eight tests in this
  session could not fail; that is the default assumption now, not the exception.

## 8. Verification

`npm run dev` on a clean profile (the template picker only renders with no
active workout — see `docs/skills/`). Exercise both paths, then confirm the
built-in is unchanged after a fork by re-reading it from a fresh profile.
LOW-risk UI, so no disposable live account is required unless the sync path is
touched — and per §5 it is not.
