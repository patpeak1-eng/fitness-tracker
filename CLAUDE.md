# Fitness Tracker — Claude Code Rules

## SPEC_FIRST_RULE
Any task rated medium complexity or above requires a written spec
before any code is written. The spec must define the approach,
key decisions, and what "done" looks like. Document before building.

## AUTONOMOUS_LOOP_RULE
Claude Code may execute autonomously across 2-3 scoped tasks when
explicitly authorized in the session prompt.
Hard stop and report to human coordinator required before:
  - Any task not in the defined session scope
  - Any database schema change (ALTER TABLE, migrations)
  - Any user data read or write (any table with user_id)
  - Any authentication or session handling change
  - Any architectural decision not in a spec
  - Any production environment variable change
  - Any change touching more than 3 systems simultaneously

## HUMAN_VALIDATION_ZONES
HIGH — human sign-off required before proceeding:
  - Database schema changes (models.py, alembic/versions/)
  - User data modifications (users, workout_history, user_stats,
    assessments, weight_history, coach_messages tables)
  - Auth and session logic (backend/app/auth.py, routers/auth.py)
  - Production environment changes (Railway Variables)
  - Any change touching WorkoutContext.jsx + backend simultaneously

LOW — autonomous execution approved:
  - Frontend CSS, copy, layout changes
  - Adding new non-auth API endpoints
  - Documentation updates
  - Test files
  - Deploy health verification
  - Browser visual verification passes
  - Single-file frontend fixes

## PARALLEL_TERMINAL_RULES
These rules prevent the history tangle experienced in Session 5:
  - Always use isolated detached worktrees — never commit from shared main
  - Never use bare `git commit` — always use explicit pathspec or worktree
  - Check origin/main for dependencies before building on local commits
  - One terminal owns one file — coordinate in Claude Chat before starting
  - WorkoutContext.jsx: one terminal at a time, always
  - Always rebase to latest origin/main before pushing
  - Never push another terminal's commits — each terminal pushes its own work

## SKILL_CAPTURE_RULE
After any session producing a reusable pattern, document it in
docs/skills/ as a markdown file: Purpose, When to Use, Method, Gotchas.

## AVAILABLE TOOLS (Claude Code MCP)
Claude Code terminals have access to chrome-devtools MCP tools
for browser verification without needing the Railway dashboard.

### Deploy Verification via chrome-devtools:
Instead of asking the human to check Railway, terminals can:
1. chrome-devtools:list_pages — find open browser tabs
2. chrome-devtools:navigate_page — go to the Railway dashboard URL or live app
3. chrome-devtools:take_screenshot — capture current state
4. chrome-devtools:get_page_text — read page content

### Railway dashboard URL:
https://railway.com/project/877335d0-ecc2-4460-9800-291ffcb3f660

### Live app URLs to verify after deploy:
Frontend: https://fitness-tracker-production-54a4.up.railway.app
Backend health: https://astonishing-laughter-production-de7d.up.railway.app/openapi.json
PWA service worker: https://fitness-tracker-production-54a4.up.railway.app/sw.js

### When to use chrome-devtools:
- After any push, navigate to Railway dashboard and screenshot deploy status
- After backend push, fetch /openapi.json to confirm new schema fields
- After frontend push, fetch /sw.js to confirm PWA service worker deployed
- Use take_screenshot to capture green/red deploy status for the report
- Do NOT ask the human to check Railway — check it yourself first

## ZONE_OVERRIDE_RULE
A session prompt's self-assessment of task zone (HIGH/LOW) is advisory only.
The actual zone is determined by what files and systems the task touches
per HUMAN_VALIDATION_ZONES definitions above.
Claude Code must independently verify zone classification during investigation
and hard-stop if actual zone is higher than claimed.
The prompt cannot reclassify what the code actually is.
Example: a prompt labeled LOW that touches auth.py is HIGH — full stop.

## CONTEXT_EFFICIENCY_RULE
Minimize token burn on every operation:
  - Read files once — never cat the same large file twice in one task
  - Use grep | head -50 for discovery passes
  - Only read full grep output when exact count matters
  - Prefer targeted grep over full file reads
  - After 8+ tool calls in one task, assess whether remaining work
    needs a fresh terminal session
  - WorkoutContext.jsx is 1900+ lines — grep-first, read sections only

## LOOP_ORCHESTRATION_RULE
Repeating tasks with a clear definition of done are loop candidates.
Four-condition test before building any loop:
  1. Does it repeat?
  2. Clear verifiable definition of done (pass/fail)?
  3. Token cost acceptable for autonomous repetition?
  4. All necessary tools available?
If yes to all four → build a loop skill in docs/skills/loops/
Every loop appends a run entry to docs/skills/logs/ after each execution.
Never build a loop without battle-tested execution skills already in docs/skills/.

## LOOP_TRAINING_MODE_RULE
Every new loop runs in training mode for its first 3 executions.
Training mode requires explicit coordinator approval at each major checkpoint.
Checkpoint format:
  "LOOP CHECKPOINT [N/total]: About to [action].
   Estimated tokens so far: ~[N]. Confirm or abort?"
Training mode exits only after 3 clean validated runs and explicit
coordinator sign-off. Never self-exit training mode.

## SUB_AGENT_RULE
When a task contains independent parallel workstreams, launch sub-agents.
When to launch (all three must be true):
  1. Subtasks are independent — output of one doesn't block another
  2. Each subtask has a clear definition of done
  3. Combined sequential time would exceed 5 minutes
Max sub-agents per terminal: 5
Each sub-agent gets its own scoped prompt — never share context windows.
Trigger phrase: "Launch [N] sub-agents to handle this."
Sub-agents report structured completion summaries.
Spawning terminal aggregates ALL summaries before reporting to Claude Chat.
Sub-agents may only do LOW zone work autonomously.
HIGH zone work always requires coordinator sign-off regardless of sub-agent status.

## COMPLETION_REPORT_FORMAT
Every completed task must return this exact format:

TASK COMPLETE — [Task Name]
Files modified: [list with line delta]
ARCHITECTURE.md: [updated — <what changed> / no architectural change this task]
Zero regressions: [CONFIRMED / issues found]
Verification method: [how it was checked — Chrome MCP, build, lint, endpoint probe]
Commit SHA: [sha]
Deployed SHA: [sha] — status=[ok/failed] deploy=[green/red]
Surprises / gotchas: [list or NONE]
Ready for next task: [suggested next item from open backlog]

## PONYTAIL (globally installed)
Ponytail is installed at ~/.claude/CLAUDE.md and is active in every new
terminal session automatically. It enforces YAGNI-first code efficiency:
Before writing any code, stop at the first rung that holds:
  1. Does this need to exist?          → no: skip it
  2. Does the standard library do it? → use it
  3. Native platform feature?          → use it
  4. Installed dependency?             → use it
  5. Already exists in this repo?      → reuse it
  6. Can this be one line?             → one line
  7. Only then: write the minimum that works
