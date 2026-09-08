# Agent Selection Guide — Fitness Tracker

**This file is a SAFETY CONTROL, not a preference.** Without it, child agents
default to `full_access` and run unattended with no approval gate.

It refines the user-level guide at `~/.traycer/agent-selection-guide.md`.
Where they disagree, the stricter rule wins. Read `AGENTS.md` first — the
project rules live there; this file only decides *who* runs work and *how
much rope* they get.

> **Known limitation:** the Traycer MCP tool serves the **user-level** guide,
> not this workspace one. Any permission rule added here must also be
> reflected in `~/.traycer/agent-selection-guide.md` or agents will not see
> it.

## Permission modes (mandatory)

- Default every child agent to `auto_accept_edits`.
- Use `supervised` for anything touching schema, auth, user data, or
  production configuration.
- **One verified exception:** a Codex Chat agent stops on every shell command
  and every outbound agent-to-agent call under both `auto_accept_edits` and
  `supervised`. A Codex Chat agent whose task is LOW zone (read-only
  research, review, docs, copy, CSS, tests) **and** that must run commands or
  reply by message may run `full_access`. Never give a full-access agent
  HIGH-zone work — that goes to a supervised Claude Code terminal.
- Never add bypass, skip-permissions, or full-auto flags to CLI arguments.

## Zones decide agent and model

Zone definitions are in `AGENTS.md` (ZONE_CLASSIFICATION). A prompt's claimed
zone is advisory; the files touched decide.

| Zone | Agent | Tier | Gate |
|---|---|---|---|
| HIGH — schema, auth, user data, `ApiService.js`, production config, `WorkoutContext.jsx` + backend together | Claude Code, terminal, supervised | strongest | spec committed alone, then two clearances |
| MEDIUM — app logic, existing route behavior, non-auth state | either agent | mid-tier | spec before code |
| LOW — copy, CSS, docs, tests, mechanical refactors, research, review | Codex chat or Claude Code | mid-tier | autonomous |

Architecture decisions on shared or user-facing code use the strongest tier,
plus one adversarial review pass before merge.

Never name a specific model — choose by tier. Pin a mid-tier model explicitly
when creating routine children; the harness default is top-tier and burns
quota fast.

## Run location

Parallel writers **always** get a fresh worktree, bound at creation via
`workspace.entries`. Local mode is for a single agent or read-only work only.
One agent owns one file; `src/context/WorkoutContext.jsx` is one writer at a
time, always.

## Review

The builder never reviews their own work as the review of record. The
reviewer receives the diff and the original task statement — not the
builder's summary. A review inside a chat agent's transcript is the proof
artifact; a narration of one is not. Verdict is one word: APPROVE /
APPROVE-WITH-NITS / CHANGES-REQUIRED.

Merges run from the main checkout behind a guard (correct directory, `main`
branch, clean tree) and are confirmed against the remote with
`git ls-remote` — never from local output. Then poll the live build for the
pushed commit.

## Traycer choreography notes

- Create children with `traycer_create_agent`, brief with
  `traycer_send_message(expectReply: true)`. Replies arrive as their own
  message — never poll, never hold a turn open waiting.
- A `responseId` belongs to the receiver's thread; you cannot reuse it to
  follow up on a request you sent. Send a fresh message instead.
- Tell a Codex child to **push its feature branch**, or its commit exists
  only in its own worktree.
- Reuse an agent when its accumulated context helps; spawn fresh for a cold
  review. Archive finished agents — archiving is reversible.
- A child bound to a worktree keeps that binding after the worktree is
  deleted. Rebind with `traycer_configure_agent` or create a fresh agent.
- `traycer_get_self` is authoritative for which agent and model you are.
