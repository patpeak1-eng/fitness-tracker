"""add nutrition tables (food_log, off_product_cache)

Revision ID: add_nutrition
Revises: add_experience_lvl
Create Date: 2026-07-14

Adds the two nutrition tables (spec: docs/nutrition_spec_s18.md):

- ``food_log`` — one row per logged food entry, scoped to a user and
  cascade-deleted with them. Mirrors ``workout_history`` conventions:
  UUID PK, nullable per-user-unique ``client_id`` for offline-first dedup
  (NULLs never collide in Postgres unique constraints, so legacy/local-only
  rows stay allowed), JSONB for the per-item vision breakdown.
- ``off_product_cache`` — shared (no user_id) cache of normalized Open Food
  Facts product data keyed by barcode, so the backend never spends OFF's
  15 req/min/IP budget twice on the same product.

Hand-authored to match app/models.py (the equivalent of ``alembic revision
--autogenerate``); the alembic CLI/local Postgres are not available in this
environment, following the same convention as 0001-0006. Railway runs
``alembic upgrade head`` on deploy.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic. Keep ``revision`` <= 32 chars:
# alembic_version.version_num is VARCHAR(32). "add_nutrition" = 13.
# down_revision is 0006's revision ID string ("add_experience_lvl"), NOT its
# filename — alembic chains on the identifier.
revision: str = "add_nutrition"
down_revision: Union[str, None] = "add_experience_lvl"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "food_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", sa.String(), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("calories", sa.Integer(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=True),
        sa.Column("carbs_g", sa.Float(), nullable=True),
        sa.Column("fat_g", sa.Float(), nullable=True),
        sa.Column(
            "source",
            sa.String(length=20),
            server_default=sa.text("'manual'"),
            nullable=False,
        ),
        sa.Column("confidence", sa.String(length=10), nullable=True),
        sa.Column("barcode", sa.String(length=32), nullable=True),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_food_log_user_id", "food_log", ["user_id"], unique=False)
    op.create_index("ix_food_log_client_id", "food_log", ["client_id"], unique=False)
    op.create_unique_constraint(
        "uq_food_log_user_client_id", "food_log", ["user_id", "client_id"]
    )

    op.create_table(
        "off_product_cache",
        sa.Column("barcode", sa.String(length=32), nullable=False),
        sa.Column("product", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("barcode"),
    )


def downgrade() -> None:
    op.drop_table("off_product_cache")
    op.drop_constraint("uq_food_log_user_client_id", "food_log", type_="unique")
    op.drop_index("ix_food_log_client_id", table_name="food_log")
    op.drop_index("ix_food_log_user_id", table_name="food_log")
    op.drop_table("food_log")
