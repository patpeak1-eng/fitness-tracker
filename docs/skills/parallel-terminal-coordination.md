# Skill: Parallel Terminal Coordination

## Purpose
Run 4 Claude Code terminals simultaneously on the same repo without
history tangles, cross-contamination, or lost work.

## When to Use
- Any session with 2+ terminals working on different files in parallel
- Whenever a terminal reports "sibling's files are staged in the index"

## Method
1. Claude Chat assigns file ownership before any terminal starts:
   T1 owns: backend files only
   T2 owns: specific frontend files only
   T3 owns: different frontend files only
   Never assign the same file to two terminals
2. Every terminal uses isolated worktree for commits (see isolated-worktree-commit skill)
3. Push order matters — establish a chain before releasing terminals:
   T1 pushes first → T2 rebases to T1's SHA → T2 pushes → T3 rebases → etc.
4. Each terminal checks origin/main for dependencies before building:
   git fetch origin && git diff origin/main -- <dependency-file>
5. Claude Chat coordinates rebase signals — terminals do not push until signaled

## Gotchas
- Local main can diverge from origin/main when other terminals push via worktree
  Fix: git reset --hard origin/main from main checkout when working tree is clean
- A terminal's dependency (e.g. rate_limit.py) may not be on origin/main yet
  even if it exists locally — always check origin/main, not local main
- Never push another terminal's commits even if they appear in your local history
- If git status shows unexpected files, STOP and report to Claude Chat before committing
- The "confirm only N files" check must be done in the isolated worktree, not shared checkout
