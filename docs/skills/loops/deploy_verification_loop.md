# Loop: Deploy Verification

## Purpose
After any push to main, verify Railway deploy is green and the live
app is serving the correct SHA — without human intervention.

## Four-Condition Test Result
1. Repeats? YES — every push to main triggers a deploy to verify
2. Clear done-state? YES — Railway ACTIVE + endpoint 200 + SHA matches
3. Token cost OK? YES — 3-4 Chrome MCP calls, LOW context
4. Tools available? YES — Chrome MCP navigate + screenshot + get_page_text

## Status: PLANNED (training mode not yet started)

## Method (when activated)
1. Wait 90 seconds after push (Railway build time)
2. Navigate to Railway dashboard, screenshot deploy status
3. Probe live endpoints:
   - Frontend /: expect 200
   - Frontend /sw.js: expect 200 (PWA)
   - Backend /openapi.json: expect 200
4. Confirm deployed SHA matches pushed SHA
5. Append run entry to docs/skills/logs/deploy_health.md

## Training Mode Checkpoints
CHECKPOINT 1/3: "About to navigate Railway dashboard. Tokens: ~[N]. Confirm?"
CHECKPOINT 2/3: "Dashboard shows [status]. About to probe endpoints. Confirm?"
CHECKPOINT 3/3: "Endpoints green. About to write log entry. Confirm?"

## Gotchas
- Railway build takes 60-120 seconds — poll, don't check immediately
- Frontend and backend are separate Railway services — check both
- A green build ≠ green migration — check pre-deploy step specifically
- /sw.js only exists if vite-plugin-pwa built correctly (Node 20 required)
