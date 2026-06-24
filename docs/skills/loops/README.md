# Loop Skills Index

Loops are autonomous repeating tasks with a clear pass/fail definition of done.
All loops require training mode for first 3 runs before full autonomy.

## Four-Condition Test
Before building any loop, all four must be true:
1. Does it repeat across sessions?
2. Clear verifiable definition of done (pass/fail)?
3. Token cost acceptable for autonomous repetition?
4. All necessary tools available (Chrome MCP, bash, git)?

## Loop Registry
| Loop | File | Status | Runs |
|---|---|---|---|
| Deploy Verification | deploy_verification_loop.md | PLANNED | 0 |

## Loop Candidates for This Project
- Deploy verification: push → Railway green → endpoint probe → report
- Session start health check: Railway status + git HEAD + live app load
- Audit/lint pass: ESLint run → fix hook errors → verify 0 errors
