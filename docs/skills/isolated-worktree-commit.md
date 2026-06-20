# Skill: Isolated Worktree Commit

## Purpose
Commit and push exactly N files to origin/main without risk of sweeping
in other terminals' staged or unstaged work from the shared checkout.

## When to Use
- Any time multiple terminals are working in parallel on the same repo
- When git status --short shows files you did not touch
- When you need a scoped commit with guaranteed file isolation

## Method
1. Create isolated worktree at origin/main:
   git worktree add ../ft-wt-isolated origin/main
2. Copy your changed files into the worktree:
   cp src/pages/MyFile.jsx ../ft-wt-isolated/src/pages/MyFile.jsx
3. Commit from the worktree:
   cd ../ft-wt-isolated
   git add src/pages/MyFile.jsx
   git commit -m "fix: my scoped change"
   git push origin HEAD:main
4. Clean up:
   cd ../fitness-tracker
   git worktree remove ../ft-wt-isolated --force

## Gotchas
- Never use bare `git commit` in shared checkout — sweeps sibling staged files
- Always verify commit contains ONLY your files before pushing: git show --stat HEAD
- Use git push origin HEAD:main from a detached worktree, not git push origin main
- Remove worktree immediately after push — stale worktrees confuse git worktree list
- node_modules in worktree: create a junction or run npm install separately
