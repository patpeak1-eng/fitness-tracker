# Skill: Railway Deploy Verification

## Purpose
Confirm a pushed commit has deployed successfully to Railway before
releasing dependent terminals or running integration tests.

## When to Use
- After every push to main that touches backend files
- After any Alembic migration
- Before releasing T2/T3/T4 to push dependent changes
- After any Railway env var change

## Method
1. After git push, note the SHA
2. Open Railway dashboard → Fitness Tracker Backend → Deployments tab
3. Wait for the SHA's deploy row to show ACTIVE / "Deployment successful"
4. Confirm pre-deploy command (alembic upgrade head) shows green checkmark
5. Optionally verify via /openapi.json: new schema fields appear if migration ran

## Gotchas
- Build success ≠ deploy success — the pre-deploy migration runs after build
- Alembic revision IDs must be under 32 chars (alembic_version VARCHAR(32) limit)
  Use short IDs like "0004_uq_stats" not "0004_add_unique_constraint_user_stats"
- Railway keeps serving the last good deploy if the new one fails — app stays live
- Frontend pushes also trigger backend redeploy — watch for migration failures
  on frontend-only commits if a pending migration exists
- Green deploy does not mean migration ran — check pre-deploy step specifically
