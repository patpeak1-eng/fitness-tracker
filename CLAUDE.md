@AGENTS.md

# Fitness Tracker — Claude Code notes

**`AGENTS.md` is the canonical rule file** and is imported above. Every rule
— zones, clearance phrases, spec-first, git staging, worktree isolation,
deploy verification, completion report format — lives there, because Codex
and OpenCode read `AGENTS.md` and nothing else. **Do not restate a rule
here.** A rule in two files drifts; when it drifts, the two agents on this
repo start working to different rules.

This file holds only what is specific to Claude Code as a harness.

---

## Read order at session start

`SESSION_START.md` → `docs/ARCHITECTURE.md` → `docs/DESIGN_TOKENS.md` (if the
task is visual) → `docs/PROJECT_OPERATING_MODEL.md` (once, for process).

`SESSION_START.md` is the project's durable memory and is authoritative
regardless of what any tool's internal memory claims. Read it even when your
own memory looks complete — the memory may be absent, partial, or from a
different machine.

## Ponytail

`~/.claude/CLAUDE.md` loads automatically in every terminal and carries the
Ponytail decision ladder: before writing code, stop at the first rung that
holds — does this need to exist, does the standard library do it, is it a
native platform feature, is it an installed dependency, does it already exist
in this repo, can it be one line, and only then write the minimum that works.

Lazy, not negligent. Never on the chopping block: trust-boundary validation,
data-loss handling, security checks, accessibility, error handling, and tests
for critical paths.

## Harness notes

- **No browser MCP is connected.** Deploy verification runs through the
  Railway CLI — see `AGENTS.md` DEPLOY_VERIFICATION_RULE and
  `docs/skills/railway-deploy-verification.md`. Do not ask the human to check
  Railway; check it yourself with `railway deployment list --service ...`.
  Earlier revisions of this file directed terminals to chrome-devtools MCP
  tools; those tools are not present in the current toolchain.
- Screenshot capture through the browser pane has been unreliable since S14.
  If visual proof is genuinely needed, use a Playwright MCP with absolute
  repo paths — and confirm it is actually connected before promising a
  screenshot.
- `.main-content` caps at 600 px, so a media query above 600 px inside a
  routed page is dead by construction. Verify layout at the width the app
  actually renders.
- The Traycer worktree the session runs in is not the main checkout. Merges
  to `main` run from the main checkout behind a directory, branch, and
  clean-tree guard.
- Bulk multi-file text edits: use Node, not PowerShell. PowerShell mangles
  UTF-8 in this repo's files.
