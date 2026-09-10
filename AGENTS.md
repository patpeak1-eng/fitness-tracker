# Fitness Tracker — Agent Rules

**This is the canonical rule file for every coding agent on this repo,
including Codex and OpenCode, which read `AGENTS.md` and nothing else.**
Anything that lives only in `CLAUDE.md` is invisible to them.

Each rule below is a kernel: the instruction, when it applies, and the
failure it prevents. Precedent and worked examples live in
`docs/PROJECT_OPERATING_MODEL.md`; do not grow this file with stories.

**Size budget:** Codex reads at most 32 KiB across all `AGENTS.md` files and
truncates silently past that. Keep this file under 24 KiB. There is no CI
gate enforcing it — check by hand when you add a rule.

---

## READ_ORDER_RULE

Before touching any file for the first time in a session, read in this order:

1. `SESSION_START.md` — what happened last, what is open, priority-ranked.
2. `docs/ARCHITECTURE.md` — how the app is wired. Always current; see
   SINGLE_ARCHITECTURE_DOC_RULE.
3. `docs/DESIGN_TOKENS.md` — if the task touches any visual surface.
4. `docs/PROJECT_OPERATING_MODEL.md` — once, to understand the process.

Read them rather than reconstructing the app from source. *Prevents:* every
session paying the cost of reverse-engineering a 1900-line context file.

---

## ZONE_CLASSIFICATION

Every task is classified by **what it actually touches**, not by its size.

**LOW** — docs, CSS, copy, layout, test files, a *new* non-auth API endpoint,
deploy health checks, browser verification, single-file frontend fixes.
Reversible; no user data, no auth, no schema. Complete autonomously.

**MEDIUM** — application logic, existing route behavior, state handling that
is not auth or schema. Requires a written spec before code
(SPEC_FIRST_RULE).

**HIGH** — any of:
- database schema (`backend/app/models.py`, `alembic/versions/`)
- auth or session logic (`backend/app/auth.py`, `backend/app/routers/auth.py`)
- any read or write of user data (`users`, `workout_history`, `user_stats`,
  `assessments`, `weight_history`, `coach_messages`)
- `src/services/ApiService.js` — one file, but the sole client for every auth
  and user-data call
- production environment / Railway Variables
- `src/context/WorkoutContext.jsx` **and** the backend in the same change
- any irreversible action (deleting data, destructive operations)
- any change touching more than three systems at once

HIGH requires TWO_STAGE_HIGH_ZONE_RULE and human sign-off.

## AUTONOMOUS_LOOP_RULE

You may run autonomously across two or three scoped tasks **only when the
session prompt explicitly authorizes it**. Hard stop and report to the human
coordinator before any of:

- a task not in the defined session scope
- any database schema change (ALTER TABLE, migration)
- any read or write of user data (any table with `user_id`)
- any auth or session handling change
- any architectural decision not already in a spec
- any production environment variable change
- any change touching more than three systems at once

*Prevents:* authorized autonomy silently expanding into unreviewed HIGH-zone
work because the agent was already moving.

## ZONE_OVERRIDE_RULE

A task prompt's own claim about its zone is **advisory only**. The real zone
is whatever the files and systems actually touched imply. Verify the
classification during investigation, before writing code. If actual zone is
higher than claimed — hard stop and escalate. A prompt labeled LOW that
touches the auth router is HIGH, full stop. Scope growth discovered mid-task
is the executor's own responsibility to escalate.
*Prevents:* a mislabeled prompt laundering a risky change past the gates.

---

## SPEC_FIRST_RULE

MEDIUM or higher: write the spec before any code. It defines the approach,
the key decisions, the files to be touched, the risks, and what "done" looks
like. Specs go in `docs/<feature>_spec_s<N>.md`.

For HIGH zone the spec is **committed alone**, with no implementation code,
before branching or building. *Prevents:* decisions being made implicitly
inside a diff, where nobody can review them separately from the code.

Specs are point-in-time and frozen once built. Durable "how it is wired and
why" belongs in `docs/ARCHITECTURE.md`, not in a spec.

## TWO_STAGE_HIGH_ZONE_RULE

HIGH-zone work is gated twice — once on the plan, once on the realized code.

1. Spec committed alone.
2. Coordinator reads the **entire spec text**, not a summary.
3. First clearance — the literal phrase **"Cleared, proceed with implementation."**
   Absent that exact phrase, no code is written.
4. Implement, then inline self-review of your **own full diff**: data loss,
   null and edge cases, logic errors, dead imports. Rank findings by
   priority and fix them before presenting the diff.
5. Second clearance — the literal phrase **"Cleared, proceed with commit."**

The coordinator cannot see your tool output. Paste the diff as chat text.
*Prevents:* a single approval covering both an unexamined plan and an
unexamined implementation.

---

## INDEPENDENT_INVESTIGATION_RULE

Never act on a claim in a prompt, a doc, or another agent's report when that
claim is load-bearing. Verify it against the actual source, the actual
migration files, the actual remote, or the actual live service — first.

Precedent: a "screenshots are untracked per convention" claim was false and
had already cost a set of screenshots; a cascade-delete invariant that alone
decided whether a migration was needed was re-checked against the migration
files and held. *Prevents:* an error propagating because the party that made
it also wrote the report.

## VERIFICATION_TIER_RULE

Verification is expensive. Spend it in proportion to the cost of being wrong.

- **HIGH zone** — always independently verified against ground truth: the
  remote (`git ls-remote`), the live schema (`/openapi.json`), the running
  app, a disposable account.
- **MEDIUM** — build or lint plus targeted exercise of the changed path.
- **LOW** — the cheapest proof that could fail. A copy tweak needs no live pass.

Never report "pushed", "merged", or "deployed" from local terminal output.
Confirm against the remote and the live build. *Prevents:* the one false
"it's live" — which came from a merge run in the wrong directory.

## TEST_ACCOUNT_RULE

Never test auth or data-destructive behavior against the owner's real
account. Register a disposable account, exercise the feature, and delete it
**within the same session** — retain the credentials until you do, because
account deletion requires the account's own password. Two S16 throwaway
accounts are still stranded on the live backend for exactly this reason.

There are no delete endpoints for weights, exercises, or users' individual
rows. Assume a test write is permanent.

---

## CROSS_REVIEW_RULE

**The builder never reviews their own work as the review of record.** The
inline self-review in TWO_STAGE_HIGH_ZONE_RULE step 4 is a pre-check, not a
review. One agent builds, a second reviews the **diff and the original task
statement** — never the builder's summary.

**MEDIUM and HIGH zone work is cross-reviewed twice, and the first one comes
before any code exists:**

| Stage | What the reviewer receives | Gate |
|---|---|---|
| **Plan** | the spec, and the task as originally stated | no implementation starts until the plan review returns |
| **Code** | the full diff, and the task as originally stated | no commit until the code review returns |

The plan review is the one people skip and the one that pays. Its job is to
attack the approach while changing it is still free — and to independently
re-verify the load-bearing claims in the spec rather than accept them.

LOW-zone work does not require cross-review, but any finding a peer raises
on it is still handled under CODEX_TRUST_RULE.

A review conducted in a reviewing agent's own transcript *is* the proof
artifact. A narration of a review that happened somewhere else is not.

Review verdicts are one word: **APPROVE** / **APPROVE-WITH-NITS** /
**CHANGES-REQUIRED**, with findings ranked most severe first. Brief the
reviewer to be adversarial and to say so if it thinks the work is not worth
doing at all — a reviewer that only confirms is not a control.

## CODEX_TRUST_RULE

Treat a Codex (or any peer agent's) finding as a hypothesis with evidence
attached, not as a verdict. Check the file and line it cites before acting.
Equally: do not dismiss a finding because it is inconvenient. Reconcile
disagreements against the code, and say in the report which read won and why.
*Prevents:* both rubber-stamping and reflexive rejection.

## QUESTION_BATCHING_RULE

Do everything that does not depend on an unanswered question first. Then ask
**all** open decisions at once, as one numbered list, each with your
recommendation. Never drip questions one at a time across turns.
*Prevents:* a human relay turning into the bottleneck.

## SUB_AGENT_RULE

Launch child agents only when all three hold: subtasks are independent,
each has a clear definition of done, and combined sequential time exceeds
about five minutes. Max five per terminal. Each gets its own scoped prompt —
never a shared context window.

Brief format that works: zone + read-only-or-build, exact files and
approximate line numbers, the contract as numbered items, a **DONE MEANS**
block with the literal verification commands, the commit prefix, an explicit
"do NOT touch X", and the reply format you want.

Child agents may do LOW-zone work autonomously. HIGH zone always needs
coordinator sign-off regardless. Permission modes are set by
`.traycer/agent-selection-guide.md` — that file is a safety control, not a
preference. Aggregate every child's summary before reporting up.

## LOOP_ORCHESTRATION_RULE

A repeating task with a clear definition of done is a loop candidate. All
four must hold before building one: it repeats; done is verifiable pass/fail;
the token cost is acceptable to repeat unattended; every tool it needs is
actually available. Then it goes in `docs/skills/loops/` and appends a run
entry to `docs/skills/logs/` after each execution.

Never build a loop on top of execution steps that have not already been
battle-tested as a skill in `docs/skills/`.

## LOOP_TRAINING_MODE_RULE

Every new loop runs in training mode for its first three executions, pausing
for explicit coordinator approval at each major checkpoint:

```
LOOP CHECKPOINT [N/total]: About to [action].
Estimated tokens so far: ~[N]. Confirm or abort?
```

Training mode ends only after three clean validated runs **and** explicit
coordinator sign-off. Never self-exit training mode.

---

## GIT_STAGING_RULE

`git add -A` and `git add .` are **never** used. Commit with an explicit
pathspec: `git commit -m "..." -- <files>`. Before committing, run
`git diff --cached --name-only` and confirm it lists only your files, and
review `git diff HEAD -- <file>` to confirm the hunks are yours.

Worktrees share one index with the main checkout. A sibling's `git add` can
sweep your file into their commit. *Prevents:* the shared-index sweep that
S18 avoided by discipline alone.

## WORKTREE_ISOLATION_RULE

Parallel writers each work in their own isolated worktree — never two writers
in one checkout. There is no file lock; a shared checkout is two terminals
racing. One agent owns one file at a time, coordinated before starting.
`src/context/WorkoutContext.jsx` is one writer at a time, always.

The shell's working directory persists across turns. Before any merge or
push, guard: correct directory, expected branch, clean tree. Rebase onto the
latest `origin/main` before pushing; pushes are serialized, and the second
agent rebases onto the first's new SHA. Never push another agent's commits.

A detached worktree has no `node_modules`; junction it from the main checkout
rather than reinstalling, and run read-only builds only there.

Cleanup: `git worktree remove <path>`, then delete the local and remote
branch. Never delete `origin/feat/backend` or `origin/feat/frontend-deploy` —
they read "not merged" but their code reached main by cherry-pick.

## DEPLOY_VERIFICATION_RULE

Deploy is push-to-main; Railway builds on push. Docs-only commits deploy too —
poll anyway.

Verify that the **live build reports the pushed commit**. Ground truth is the
Railway CLI, which reports the deployed commit hash directly:

```bash
git ls-remote origin main                                    # remote moved?
railway deployment list --service fitness-tracker --limit 3 --json
railway deployment list --service "Fitness Tracker Backend" --limit 3 --json
```

Verified when the newest entry's `meta.commitHash` starts with your SHA and
`status` is `SUCCESS`. Poll roughly every 30 s for up to 5 minutes. No match
yet is not a failure — look for a `BUILDING`/`DEPLOYING` entry first; queued
is not missed. Backend schema changes are additionally confirmed at
`/openapi.json`; a green deploy does not prove the migration ran.

**Always pass `--service`.** The CLI resolves the project by walking up the
directory tree, and `C:\Users\PC` is linked with Mission Control's service as
its default — so an unqualified `railway down` / `redeploy` / `variables set`
/ `up` run from anywhere under the home folder hits the wrong service.

A `curl` 200 proves nothing: `server.js` serves the SPA fallback for every
path. Live-vs-local asset hash comparison is unreliable in both directions.
Full detail in `docs/skills/railway-deploy-verification.md`.

---

## SINGLE_ARCHITECTURE_DOC_RULE

`docs/ARCHITECTURE.md` is the one living "how it is wired and why" document.
Any change to architecture — new context, service, major model field, backend
route, or persistence pattern — updates it **in the same commit as the code**.
Never "later".

The rule already failed once as passive prose: the doc went stale for five
consecutive sessions and needed a dedicated catch-up pass. The fix is that
the completion report carries a **required** `ARCHITECTURE.md:` line, so
"I forgot" is not an available answer. There is no CI doc-sync gate in this
repo; the required field is the whole enforcement.

**Documentation that lives inside code counts too.** The Coach's system
prompt (`COACH_SYSTEM_PROMPT`, APP KNOWLEDGE block, in
`backend/app/routers/coach.py`) describes the app to the model in prose. It
drifted the same way the architecture doc did — it listed templates by name
and an exercise count. Any change that adds, removes, or renames a feature
the Coach could be asked about updates that block in the same commit, and
the completion report's `Coach knowledge:` line says so. Prefer pointing the
model at data it already receives (`app_templates`, `available_exercises`)
over restating facts that will go stale.

## SKILL_CAPTURE_RULE

A session that produces a reusable pattern writes it to `docs/skills/` as
Purpose / When to Use / Method / Gotchas. Loops go in `docs/skills/loops/`
and append a run entry to `docs/skills/logs/` after each execution.

## SESSION_CLOSE_RULE

`SESSION_START.md` is the project's durable memory and is authoritative
regardless of what any tool claims to remember. At session close: collapse
the previous session to one line with its SHA, record this session's commits
and findings, and turn anything found-but-not-fixed into a numbered,
priority-ranked open item with enough context to act on later.

## NO_MODEL_NAMES_RULE

Do not name specific models in rules, docs, prompts, or commit messages —
including in `.traycer/agent-selection-guide.md`. Refer to capability:
*most capable available*, *mid-tier*.

The standing instruction is to **always pick the most capable model
available at the time**, whatever it is called. Discover what exists at
session start (`traycer_list_harness_models`) rather than carrying a
remembered name forward.

*Prevents:* a name written down today quietly capping the work months later
at whatever happened to be current when someone typed it. Existing docs that
name models are legacy, not precedent.

## MODEL_RESERVATION_RULE

Pin a mid-tier model explicitly for routine builds, research, and mechanical
work; the harness default is a top-tier model that exhausts quota fast.

**Both sides of a HIGH-zone task run the strongest available tier** — the
builder and the reviewer. Architecture decisions on shared or user-facing
code get the same treatment, plus one adversarial pass before merge. That
adversarial pass has caught a real authorization gap two standard reviews
passed.

**At least one top-tier model is in play on every MEDIUM-or-higher task,
whichever side it sits on.** A mid-tier builder is fine when the reviewer is
top-tier; a mid-tier reviewer is not acceptable on HIGH zone. If only one
strong seat is available, spend it on the review — catching a bad plan is
worth more than writing the code slightly better.

No model-to-tier mapping is recorded anywhere in this repo, by design — see
NO_MODEL_NAMES_RULE. Rank by capability at session start against whatever
the harness actually offers that day.

---

## APP INVARIANTS

**Live surfaces**

| Surface | URL / identifier |
|---|---|
| Frontend | https://fitness-tracker-production-54a4.up.railway.app |
| Backend schema | https://astonishing-laughter-production-de7d.up.railway.app/openapi.json |
| PWA service worker | https://fitness-tracker-production-54a4.up.railway.app/sw.js |
| Railway project | `877335d0-ecc2-4460-9800-291ffcb3f660` (named *peak-ops-q*; shared with Mission Control) |
| Railway services | `fitness-tracker` (frontend), `Fitness Tracker Backend` |

- **No emojis anywhere in the app.** Icons come from `lucide-react`.
- `docs/DESIGN_TOKENS.md` is the source of truth for visual tokens. Purpose
  per token, self-hosted fonts, no CDN.
- Local-first: the backend is a sync layer, not the source of truth during an
  active workout.
- Persistence effects in `WorkoutContext.jsx` are **hydration-gated**. Mount
  guard refs do not survive StrictMode replay — do not reintroduce them.
- Data routes accept Bearer **or** cookie. A tokenless frontend must omit the
  header entirely; never send `"Bearer null"`.
- New pushes that can fail must enqueue on the sync queue and register an
  executor.
- PowerShell bulk edits mangle UTF-8. Use Node for multi-file text edits.

## CONTEXT_EFFICIENCY_RULE

Read a file once per task. Grep first, read sections. Prefer targeted grep
over full reads; `grep | head -50` for discovery. `WorkoutContext.jsx` is
1900+ lines — never read it whole. After roughly eight tool calls, assess
whether the rest of the work wants a fresh session.

---

## COMPLETION_REPORT_FORMAT

Every completed task returns exactly this. The report is a structured claim,
not a proof — it is the input to the coordinator's independent verification.

```
TASK COMPLETE — [Task Name]
Files modified:      [list with line delta]
ARCHITECTURE.md:     [updated — <what changed>  |  no architectural change this task]
Coach knowledge:     [updated — <what changed>  |  no coach-relevant change]
Zero regressions:    [CONFIRMED / issues found]
Verification method: [how it was checked — build, lint, endpoint probe, railway deployment list, disposable account]
Commit SHA:          [sha]
Deployed SHA:        [sha] — status=[ok/failed] deploy=[green/red]
Surprises / gotchas: [list or NONE]
Ready for next task: [suggested next item from the open backlog]
```

## REPORTING_RULE

Plain English. Lead with the outcome. Name a file only when the reader has to
go there. State mistakes plainly and say what caught them; a correction of an
earlier claim goes first, not buried. One prompt at a time to the human, and
when re-issuing an instruction to another agent, re-issue the whole thing —
never a splice. "Break" is not a close; nothing is closed until the human
says so.
