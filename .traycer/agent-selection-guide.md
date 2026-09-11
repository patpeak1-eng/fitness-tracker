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

Pin a mid-tier model explicitly when creating routine children; the harness
default is top-tier and burns quota fast.

## Choosing a tier (owner's direction, 2026-09-09)

**No model is named anywhere in this repo, on purpose.** New and better
models ship constantly; a name written down today is wrong within months and
quietly caps the work at whatever was current when someone typed it. The
standing instruction is *always pick the most capable model available at the
time*, whatever it happens to be called.

Discover what exists at session start — `traycer_list_harness_models` for
each harness — and rank by capability then. Do not carry a remembered name
forward from a previous session, and do not record one here.

| Zone | Builder | Reviewer |
|---|---|---|
| HIGH | most capable available | most capable available |
| MEDIUM | mid-tier acceptable | most capable available |
| LOW | mid or light tier | optional |

When only one top-capability seat is available, it goes to the **reviewer**.
Catching a bad plan is worth more than writing the code slightly better.

## Cost (owner direction, 2026-09-11)

The most capable models are also the most expensive, and both harnesses
exhausted their quota on 2026-09-10. Spend capability where the zone
demands it and nowhere else:

- **LOW** work (docs, copy, CSS, test files, screenshots, log updates):
  a less capable, cheaper model. Never the top tier.
- **MEDIUM**: mid-tier builder; the reviewer is the strong seat.
- **HIGH**: strong on the review side always; the builder may be one tier
  down when the reviewer is strong. Use the harness's medium reasoning
  effort by default; raise it only for an adversarial pass on a plan.
- Coordination turns (relaying, briefing, committing docs) do not need
  the top tier — the coordinating agent should run one tier down and
  switch up only for a HIGH-zone design or build turn.
- Do not run two top-tier reviewers on the same artifact in parallel;
  sequence them, and let the second one see the first's findings.

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
