# Loop Skill: Deploy Verification

## Purpose
After any push to main, verify the Railway deploy is green and the live app is
serving the correct commit SHA — without human intervention. Confirms a pushed
commit actually reached production before releasing dependent terminals or
running integration tests.

## When to Use
- After every `git push origin HEAD:main` that should trigger a Railway auto-deploy
- After any Alembic migration (the pre-deploy step runs `alembic upgrade head`)
- Before releasing dependent terminals to push changes that build on this one
- After any Railway env var change

## Four-Condition Test Result
1. Repeats? YES — every push to main triggers a deploy to verify
2. Clear done-state? YES — Railway ACTIVE + correct SHA + endpoint 200
3. Token cost OK? YES — 3-4 Chrome MCP calls, LOW context
4. Tools available? YES — Chrome MCP navigate + screenshot + get_page_text

## Done State
Railway Deployments panel shows the ACTIVE card with the correct SHA and
"Deployment successful" (not "Building" or "Failed"). For backend pushes, the
pre-deploy `alembic upgrade head` step shows no errors.

## Method (when activated)
1. After git push, note the pushed SHA. Wait ~90 seconds (Railway build time) —
   poll, don't check immediately.
2. Open the Railway dashboard → the relevant service (frontend or backend) →
   Deployments tab. The dashboard is auth-gated, so drive it with Chrome MCP
   (`browser_batch` navigate + `get_page_text`), not plain curl.
3. Find the ACTIVE card — confirm its SHA matches the pushed commit.
4. Confirm the status text reads "Deployment successful".
5. Probe the live endpoints (each expects 200):
   - Frontend `/`
   - Frontend `/sw.js` (PWA service worker)
   - Backend `/openapi.json`
6. If backend: confirm the pre-deploy step (`alembic upgrade head`) shows a green
   checkmark / no errors in the logs.
7. Append a run entry to `docs/skills/logs/deploy_health.md`.

## Gotchas
- Railway build takes 60-120 seconds — poll, don't check immediately.
- Frontend and backend are SEPARATE Railway services — check both. A frontend
  push can also trigger a backend redeploy, so watch for migration failures on
  frontend-only commits when a pending migration exists.
- `curl` / HTTP 200 is NOT reliable for the frontend — the SPA fallback returns
  200 for ANY path, so a 200 says nothing about which build is live.
- `/openapi.json` via Chrome MCP confirms the backend is live but NOT which SHA is
  deployed — for SHA truth, read the Deployments ACTIVE card.
- A green build does NOT guarantee a green migration — the pre-deploy step runs
  AFTER the build; check it separately.
- Railway keeps serving the last good deploy if a new one fails — the app stays
  live, which can mask a failed deploy. Always confirm the ACTIVE card's SHA.
- GitHub API rate-limits unauthenticated commit-log requests — confirm SHAs with
  `git log` via an isolated worktree instead of the API.
- `/sw.js` only exists if vite-plugin-pwa built correctly (Node 20 required).
- Alembic revision IDs must be under 32 chars (alembic_version is VARCHAR(32)) —
  use short IDs like "0004_uq_stats". A too-long id fails `alembic upgrade head`
  on pre-deploy. See `railway-deploy-verification.md` for the migration-specific
  verification skill.

## Training Status
PLANNED — 0 of 3 checkpoint runs completed. Autonomy not yet granted; the first 3
runs require Claude Chat (coordinator) approval at the "SHA confirmed" checkpoint
before proceeding. Training mode exits only after 3 clean validated runs and
explicit coordinator sign-off (never self-exit).

Checkpoints:
- CHECKPOINT 1/3: "About to navigate Railway dashboard. Tokens: ~[N]. Confirm?"
- CHECKPOINT 2/3: "Dashboard shows [status]. About to probe endpoints. Confirm?"
- CHECKPOINT 3/3: "Endpoints green, SHA confirmed. About to write log entry. Confirm?"
