# Skill: Alembic Migration Pattern

## Purpose
Create safe, deploy-ready Alembic migrations for this project's
hand-authored convention (no local Postgres to autogenerate from).

## When to Use
- Any database schema change (new table, new column, new constraint)
- Always requires HUMAN_VALIDATION_ZONES sign-off before writing

## Method
1. Read the previous migration to get down_revision value
2. Create new file: backend/alembic/versions/XXXX_short_name.py
3. Use this template:
   revision = "XXXX_short_name"   # MUST be under 32 characters
   down_revision = "<previous_revision_id>"
   branch_labels = None
   depends_on = None

   def upgrade():
       # your changes here

   def downgrade():
       # reverse your changes here
4. For de-duplication before adding unique constraint:
   op.execute("""
       DELETE FROM table_name
       WHERE id NOT IN (
           SELECT DISTINCT ON (column_name) id
           FROM table_name
           ORDER BY column_name, updated_at DESC NULLS LAST
       )
   """)
5. Railway runs alembic upgrade head automatically on deploy (pre-deploy command)

## Gotchas
- CRITICAL: revision ID must be under 32 chars — alembic_version VARCHAR(32)
  "0004_add_unique_constraint_user_stats" = 37 chars → deploy fails
  "0004_uq_stats" = 13 chars → safe
- No local Postgres available — cannot use alembic revision --autogenerate
  Hand-author migrations to exactly mirror model changes
- AsyncSession in this project — use async patterns, not db.query().first()
  Use: await db.execute(select(Model).filter(...)).scalars().first()
- user_stats uses updated_at not created_at for ordering (no created_at column)
- Test migration logic carefully — production data is real and irreversible
