# Fitness Tracker handoff

## Canonical local checkout

Use `C:\dev\fitness-tracker` as the project root. It directly contains `package.json`, `src`, `public`, and the backend. Do not move sibling Git worktrees inside this folder.

## Start and verify

```powershell
cd C:\dev\fitness-tracker
npm install
npm test -- --run
npm run build
npm run dev
```

## Current reconciliation notes

- The local and GitHub Coach commits were parallel commits with identical tree content. Their histories were joined with a clean merge; no Coach code was overwritten.
- Guided-workout prep now requires a positive weight for every externally weighted set. Bodyweight, calisthenics, yoga, and equipment-free exercises do not require an external weight.
- Prep weight edits update `activeWorkout` through `updateSet`, invalid weights are highlighted, and the Start button remains disabled until the prep data is valid.
- Template startup prefers an explicitly configured set weight, then current bodyweight for bodyweight exercises, then the most recent historical weight for externally weighted exercises.

## Folder note

`C:\dev\fitness-tracker-wt-logout` is a registered detached Git worktree. The other similarly named folders observed under `C:\dev` were empty remnants when inspected on 2026-06-19. Review them before cleanup; do not copy them into the main checkout.
