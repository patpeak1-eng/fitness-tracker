(Handoff copy — canonical source is peak-ops-q/docs/skills/traycer_multi_agent_working_model.md; keep the two in sync or treat this one as a snapshot dated 2026-09-07.)

# Traycer Multi-Agent Working Model — what actually worked

**Pattern name:** Research → plan → decision → spec → parallel worktree
build → cross-review → guarded merge → verified deploy → human check.

**Purpose:** everything learned running Claude Code + Codex together under
Traycer on peak-ops-q (Sept 2026: Q personality selector Phase 1, voice
delivery Phase 2, and the adversarial hardening pass). Written to be
handed to a *different* repository — the peak-ops-specific parts are
marked so they can be swapped, not copied blindly.

## When to use

Any repo where more than one coding agent will touch code in the same
session, where a human wants to read the work in chat rather than relay
prompts between terminals, and where "done" has to mean deployed and
verified, not narrated.

---

## 1. Set up the repo BEFORE the first build (30 minutes that prevent days)

| File | Why it must exist | Notes |
|---|---|---|
| `AGENTS.md` | **The only rule file Codex reads.** Anything that lives only in `CLAUDE.md` is invisible to Codex and OpenCode. | Keep it under ~24 KiB total: Codex's instruction budget is 32 KiB across all `AGENTS.md` files and it truncates silently. peak-ops enforces this with a CI size gate. |
| `CLAUDE.md` | Claude Code's file. First line: `@AGENTS.md` (Claude Code import), then Claude-only blocks. | Never duplicate rules between the two; `AGENTS.md` is canonical. |
| `.traycer/agent-selection-guide.md` | **A safety control, not a preference.** Traycer's default for agent-spawned children is `full_access` and agents are told never to infer a stricter mode except from this file. Without it, every child agent runs unattended with no approval gate. | See the starter in §8. Also mirror the permission rules into the user-level `~/.traycer/agent-selection-guide.md` — the MCP tool serves *that* one, not the workspace one. |
| One living architecture doc | Durable "how it is wired and why" goes in ONE file, as evergreen sections. Specs are separate, point-in-time, frozen once built. | peak-ops: `docs/mc_architecture.md` + a doc-sync CI gate (a commit touching code must touch the arch doc or carry a `[no-doc: reason]` trailer). Strongly recommended for any repo. |
| `docs/rule_history.md` | Where rule *precedent* goes, so the rule file stays small. | Optional but keeps `AGENTS.md` under budget. |
| `docs/skills/` | Reusable patterns get packaged here after a session. | This file is one. |

Rules from peak-ops worth porting verbatim (all in `AGENTS.md` there):
INDEPENDENT_INVESTIGATION_RULE, QUESTION_BATCHING_RULE,
HUMAN_VALIDATION_ZONES + ZONE_OVERRIDE_RULE, SPEC_FIRST_RULE,
GIT_STAGING_RULE, COMMIT_PATHSPEC_RULE, SINGLE_ARCHITECTURE_DOC_RULE,
VERIFICATION_TIER_RULE, CODEX_TRUST_RULE, MODEL_RESERVATION_RULE,
NO_MODEL_NAMES_RULE, TRAYCER_WORKING_MODEL_RULE. Deploy rules
(WEBHOOK_DEPLOY_RULE, SHA_VERIFICATION_RULE) are Railway-specific —
port the *shape* (deploy = push to main; verify the live build reports
the pushed commit; poll, don't assume) to whatever the target hosts on.

---

## 2. The loop (this exact sequence shipped three features cleanly)

1. **Research first, split by strength.** Claude Code reads the internal
   code paths; a Codex chat agent does external research (vendor docs,
   API capabilities) and an independent read of the same code. Two
   reads of the load-bearing question beat one.
2. **Plan artifact, not code.** Write a Traycer artifact (`kind: spec`)
   with: current state as a table with `file:line` evidence, findings
   that changed the plan, honest constraints, options as a table with
   trade-offs, a recommendation, and a numbered list of decisions the
   human must make. End the message with ready-to-send options.
3. **Ask all questions at once.** Batch every decision into one
   numbered list; never drip them.
4. **Spec in the repo before code.** Once decisions land, write
   `docs/spec_<feature>.md` (decisions table, approach, work split,
   definition of done, risks) and commit it to main *before* branching.
   Worktrees then branch from a main that already contains the spec.
5. **Build in parallel, in worktrees, split by zone/role.** One worktree
   per writer. Never two writers in one checkout — Traycer has no file
   lock; it is exactly two terminals racing.
6. **Cross-review, never self-review.** Claude Code builds → Codex
   reviews the diff; Codex builds → Claude Code reviews. The reviewer
   gets the diff and the task statement, not the builder's summary.
   A Codex review in a Traycer *chat* agent is itself the proof
   artifact (readable transcript). Narration of a review is not.
7. **Merge from the main checkout, behind a guard.** See §5.
8. **Verify the deploy against the live system**, not your terminal.
9. **Human verifies through the real surface** for anything the human
   uses daily or anything customer-facing. The builder's own check is a
   spot check, never sign-off.
10. **Docs land in the same commit as the code.** Architecture doc
    section, spec addendum, rule history line. Never "later".
11. **Clean up**: remove worktrees, delete local + remote branches,
    re-index the code graph, update the artifact status line.

---

## 3. Agent choreography (Traycer specifics)

* **Create children with `traycer_create_agent`**, brief them with
  `traycer_send_message(expectReply: true)`. The reply arrives later as
  its own message; never poll, never hold a turn open waiting.
* **`responseId` belongs to the receiver's thread.** You reply to a
  request with the id you were given; you cannot reuse it to follow up
  on a request *you* sent (that fails with RESPONSE_ID_MISMATCH — send a
  fresh message instead).
* **Brief format that worked:** zone + read-only/build, exact files and
  approximate line numbers, the contract in numbered items, "DONE MEANS"
  with the verification commands, the commit-message prefix and
  trailer, "do NOT touch X", and the reply format you want (SHA, proof
  of push, diff hunks / findings ranked most severe first + one verdict
  word: APPROVE / APPROVE-WITH-NITS / CHANGES-REQUIRED).
* **Tell Codex to PUSH its feature branch.** Otherwise its commit exists
  only in its local worktree; a feature-branch push deploys nothing and
  makes the merge source unambiguous.
* **Reuse an agent when its context helps** (the researcher already
  knows the file layout); spawn fresh for a *cold* review. Archive
  finished agents — archiving is reversible (any message wakes them).
* **Bind the child to its worktree at creation** (`workspace.entries`),
  or rebind an idle agent with `traycer_configure_agent`.
* **Permission modes, verified behaviour for Codex chat agents:**
  `supervised` AND `auto_accept_edits` both stop on every shell command
  waiting for a human; outbound agent-to-agent calls also fail under
  `auto_accept_edits`. A Codex chat agent that must run commands and
  reply needs `full_access` — permitted by the guide only for LOW-zone
  work. Never for anything touching schema, auth, customer data or
  production config; hand those to a supervised Claude Code terminal.
* **Model tiers and quota.** The Codex default model for the harness
  (a top-tier one) burned its usage limit twice in one hour on small
  tasks. Pin a mid-tier model explicitly for routine builds/research
  (`model` + `reasoningEffort` at creation). Reserve the strongest tiers
  for: architecture decisions on customer-facing or shared code, and one
  adversarial review pass before merging such code. That pass found a
  real authorization gap two standard reviews had passed.
* **When the human resets a Codex quota, the human should message the
  parent agent first** ("Codex reset, resume") so ownership is clear;
  otherwise two agents finish the same work.
* `traycer_get_self` is authoritative for what model you are actually
  running — a UI model switch may not have applied to this agent.

---

## 4. Verification discipline (the part that caught every mistake)

* **Never report "pushed/merged/deployed" from local output.** Confirm
  with `git ls-remote origin <branch>` and the live health/version
  endpoint. The one false "it's live" this month came from a merge run
  in the wrong directory; the deploy poll's no-match exposed it.
* **Deploy poll:** every 30 s for up to 5 min until the live build
  reports the pushed commit. On no match: check the host's deploy queue
  first (queued ≠ missed), then re-fire with an empty commit on main.
* **Tests must be able to fail.** Mutation-check them: neuter the guard
  in memory and confirm the suite goes red. A raising stub is not proof
  if the code under test has a fail-soft `except Exception`; use a mock
  and `assert_not_called()`.
* **Structural invariants beat text windows.** Check the AST (e.g.
  "every done-event dict literal carries key X"), not a substring
  within N characters.
* **Drive the real entry point offline.** Stub every external dependency
  at the module namespace (client, model roster, clock, store, buffer,
  logging) and run the real function end to end; assert on the captured
  outbound payloads and emitted events.
* **UI: headless Chrome with API fixtures.** Serve the frontend
  statically, intercept `**/api/**` with canned responses, screenshot at
  desktop AND 375 px, exercise save + failed-save rollback, check the
  console. `playwright` (python) with `channel="chrome"` uses the
  installed browser when the bundled one isn't downloaded.
* **A shared route is not "safe because the client doesn't send the
  field."** If a route serves two products, the *server* must gate the
  privileged field on which credential authenticated. Client-side
  convention is not an authorization boundary.

---

## 5. Git discipline under worktrees

```bash
# before ANY merge/push — the guard that would have prevented the wrong-dir merge
cd /path/to/main/checkout && [ "$(git branch --show-current)" = "main" ] \
  && [ -z "$(git status --short)" ] && echo "guard ok"
git fetch origin
git merge --no-ff origin/<feature-branch> -m "Merge branch '<feature>': <what> — <review verdict + SHA>"
git push origin main && git ls-remote origin main      # verify against the remote
```

* The Bash tool's working directory **persists after `cd`**. After
  building in a worktree, you are still in it next turn. Always guard.
* Commit with a pathspec: `git commit -m "..." -- <files>`. Before that:
  `git status --short` (index check) and review `git diff HEAD -- <file>`
  hunks are yours (authorship check).
* Docs-only commits still deploy on push-to-main; that is normal, poll
  anyway.
* Worktrees share one `.git`: a branch committed in a sibling worktree is
  visible locally as a plain branch ref even if never pushed.
* Cleanup: `git worktree remove <path>` (a "Permission denied" on a
  locked temp file is cosmetic if `git worktree list` no longer shows
  it), then `git branch -D` and `git push origin --delete`.

---

## 6. Traycer and tooling gotchas (each cost real time once)

| Gotcha | What to do |
|---|---|
| GitNexus's resolver collapses two worktrees that share the same last commit — "repo not found" for the second even though `~/.gitnexus/registry.json` lists it. | Temporarily drop the other worktree's entry from the registry, run `npx gitnexus detect-changes --scope all --repo <path>`, restore the file. Or index each worktree with `--force`. |
| `npx gitnexus analyze` rewrites the symbol-count line in `AGENTS.md`/`CLAUDE.md`. | Run with `--skip-agents-md`. |
| Traycer rewrites artifact markdown on save (table separators, bold spacing) and can mangle inline bold at line starts. | Re-read before editing; keep bold on its own token. |
| `ScheduleWakeup` is for `/loop` sessions only. | Don't use it to wait for an agent reply — you are re-invoked automatically when the reply lands. |
| Windows console is cp1252: printing an emoji from a subprocess result crashes Python. | `PYTHONIOENCODING=utf-8` or `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`; pass `encoding="utf-8"` to every `subprocess.run(text=True)`. |
| A Codex GUI child bound to a worktree keeps that binding after the worktree is deleted. | Rebind with `traycer_configure_agent(workspace=...)` or create a fresh agent. |
| `auto_accept_edits` / `supervised` block Codex chat agents on each command. | See §3. |

---

## 7. Communicating with the human (what Patrick asked for, repeatedly)

* Plain English every report; no code words in prose; name a file only
  when the reader must go there.
* Lead with the outcome. State mistakes plainly and what caught them.
  Corrections of an earlier claim go first, not buried.
* One prompt at a time; when re-issuing an instruction to another agent,
  re-issue the whole thing, never a splice.
* End with ready-to-send next-step options (Traycer `NEXT_STEPS` block).
* "Break" is not a close. Nothing is closed until the human says so.
* Keep the artifact's status line current; it is what the human reads
  first next morning.

---

## 8. Starters for a new repo

### `.traycer/agent-selection-guide.md` (minimum viable safety control)

```markdown
# Agent Selection Guide — <repo>
This file is a SAFETY CONTROL. Child agents default to full_access
without it. Read AGENTS.md first; rules live there.

## Permission modes (mandatory)
- Never spawn a child with full_access, EXCEPT a Codex Chat agent whose
  LOW-zone task requires running commands or replying by message
  (auto_accept_edits and supervised block those). Never task a
  full-access Codex agent with HIGH-zone work.
- HIGH zone (schema, auth, customer/financial data, production config):
  supervised, Claude Code on the Terminal interface, strongest tier.
- Never add bypass / skip-permissions / full-auto CLI flags.

## Zones decide agent and model
- HIGH → Claude Code terminal, strongest tier, spec in docs/ first.
- LOW (copy, CSS, tests, docs, mechanical refactors, research) → Codex
  chat, mid-tier, or Claude Code mid-tier.
- Architecture decisions on shared/customer-facing code → strongest
  tier, plus one adversarial review pass before merge.

## Run location
- Parallel writers ALWAYS in a fresh worktree. `local` mode only for a
  single agent or read-only work.

## Review
- Builder never reviews own work. Codex chat transcript = review proof.
- Merge from the main checkout behind a pwd/branch/clean guard; verify
  with git ls-remote; poll the live build for the pushed commit.
```

### `AGENTS.md` skeleton

Port the rule list from §1. Keep each rule a kernel: instruction, when
it applies, the failure it prevents. Move precedent to
`docs/rule_history.md`. Add the size gate.

### First message to the new session

> Read `docs/skills/traycer_multi_agent_working_model.md` (copied from
> peak-ops-q). Before any build: confirm `AGENTS.md`,
> `.traycer/agent-selection-guide.md` and one living architecture doc
> exist here; if not, create them from the starters in that file and
> commit them first. Then tell me what you found.

## Gotchas (summary)

The two failures that actually happened were not model-capability
failures: a merge run from the wrong directory, and an authorization
boundary that rested on client behaviour. Both were caught by the same
habit — verify against the real system (remote, live build, real router
with a real cookie), never against a report. Keep that habit; it is the
whole method.
