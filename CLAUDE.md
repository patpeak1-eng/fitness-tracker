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
