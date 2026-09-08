# Skill: Railway Deploy Verification

## Purpose
Confirm a pushed commit has actually deployed to Railway — from the terminal,
without a browser and without asking the human — before releasing dependent
terminals or running integration tests.

## When to Use
- After every push to main (docs-only pushes deploy too — verify anyway)
- After any Alembic migration
- Before releasing another terminal to push dependent changes
- After any Railway env var change

## Method

The Railway CLI reports the deployed commit hash directly. This is the
ground truth; nothing else on this project is.

```bash
railway deployment list --service fitness-tracker --limit 3 --json
# frontend           -> --service fitness-tracker
# backend + migrate  -> --service "Fitness Tracker Backend"
```

Each entry carries `status` (`SUCCESS` / `FAILED` / `BUILDING` / `DEPLOYING`)
and `meta.commitHash`. The deploy is verified when the newest entry's
`commitHash` starts with the SHA you pushed **and** `status` is `SUCCESS`.

1. `git push origin main`, then confirm the remote actually moved:
   `git ls-remote origin main`. Never trust local push output.
2. Poll the command above roughly every 30 s for up to 5 minutes.
3. No matching hash yet is not a failure — a queued build has not started.
   Look for a `BUILDING`/`DEPLOYING` entry before concluding anything.
4. For a backend change, additionally confirm the schema is live:
   `curl -s https://astonishing-laughter-production-de7d.up.railway.app/openapi.json`
   and grep for the new field. A green deploy does **not** prove the
   migration ran.

Service and project facts, verified 2026-09-08:

| Thing | Value |
|---|---|
| Railway project | `877335d0-ecc2-4460-9800-291ffcb3f660`, named **peak-ops-q** |
| Frontend service | `fitness-tracker` |
| Backend service | `Fitness Tracker Backend` |
| Frontend URL | https://fitness-tracker-production-54a4.up.railway.app |
| Backend URL | https://astonishing-laughter-production-de7d.up.railway.app |

## Gotchas

- **The fitness tracker and Mission Control share one Railway project.** The
  project is *named* `peak-ops-q`; the fitness services live inside it
  alongside `supportive-vibrancy (Q)` and `peak-cnc`. `railway status`
  reporting "peak-ops-q" is correct, not a mis-link.
- **Always pass `--service` explicitly.** The CLI resolves the project by
  walking *up* the directory tree, and `C:\Users\PC` itself is linked — with
  `supportive-vibrancy (Q)` as its default service. So any Railway command
  run from an unlinked directory anywhere under the home folder silently
  targets Mission Control's service. `railway down`, `railway redeploy`,
  `railway variables set` and `railway up` are all destructive under that
  default. Never run a mutating Railway command without `--service`.
- **`curl` returning 200 proves nothing about the frontend.** `server.js`
  serves `dist/index.html` for every unmatched route, so the SPA fallback
  200s any path including ones that do not exist.
- **Comparing live and local asset hashes is unreliable** in both directions:
  the Railway build environment differs from local, and a bundle-neutral
  refactor does not change the hash at all.
- Build success is not deploy success — the pre-deploy migration runs after
  the build.
- Alembic revision IDs must be under 32 chars (`alembic_version` is
  VARCHAR(32)). Use `0004_uq_stats`, not
  `0004_add_unique_constraint_user_stats`.
- Railway keeps serving the last good deploy when a new one fails, so the app
  staying up is not evidence the deploy succeeded.
- A frontend push also triggers a backend redeploy — a frontend-only commit
  can fail on a pending migration.

## Superseded

Earlier revisions of this skill directed the reader to the Railway dashboard
Deployments panel, read through a browser MCP. That path still works but is
not required, and no browser MCP is connected in the current toolchain. The
CLI method above replaces it. `railway mcp` can start a local Railway MCP
server if richer agent access is ever wanted.
