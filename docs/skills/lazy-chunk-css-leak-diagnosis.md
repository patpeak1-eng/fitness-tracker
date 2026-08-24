# Lazy-Chunk CSS Leak Diagnosis

## Purpose
Diagnose "state-dependent" layout bugs where a component renders correctly
on some navigation paths and broken on others, with no recent commits
touching the component.

## When to Use
- A component's size/spacing breaks only sometimes on device, but its files
  haven't changed in recent history.
- The breakage correlates with which pages were visited earlier in the
  session, not with data values.
- Computed styles show a rule the component's own CSS never defines.

## Method
1. All route pages are lazy-loaded (App.jsx `React.lazy`). Vite emits one
   CSS file per route chunk and injects it when the route first loads.
   Component CSS is global once injected — class collisions across chunks
   are order-of-navigation dependent.
2. Grep the class name across `src/` (not just the broken component's CSS):
   `grep -r "col-weight" src/`. Any second definition in another chunk's
   CSS is a suspect.
3. Reproduce both states locally: fresh-load the broken page (healthy),
   then visit the suspect route and client-side-navigate back (broken).
   Confirm with `getBoundingClientRect()` before/after, and check
   `document.styleSheets` for the suspect rule's presence.
4. Fix by scoping the leaking rules under the owning component's container
   selector (e.g. `.sets-table .col-weight`), not by adding counter-rules
   in the victim — counter-rules just move the cascade race.

## Gotchas
- The grid tracks can stay correct while cells shrink: a `width: 30%` on a
  grid item shrinks the item inside its track, so headers look normal while
  inputs clip. Measure the cell AND the track.
- Precedent (S28): `WorkoutDetails.css` `.col-weight { width: 30% }` (History
  chunk) shrank ExerciseResult prep inputs to ~24px, but only after History
  had been visited. Same class, different chunk, load-order dependent.
- Remaining known collision: `.exercise-header` is defined by both
  ExerciseResult.css and WorkoutDetails.css (flex-start vs space-between,
  different margins). Harmless so far because bundle order has been stable —
  scope it when either component's header changes.
