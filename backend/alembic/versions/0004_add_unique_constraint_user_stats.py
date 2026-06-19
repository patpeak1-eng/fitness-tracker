"""add unique constraint on user_stats.user_id

Revision ID: 0004_add_unique_constraint_user_stats
Revises: 0003_add_coach_messages
Create Date: 2026-06-19

Enforces one stats row per user. Without this, repeated profile edits (and
concurrent first-saves) could create multiple ``user_stats`` rows for the same
user, after which the coach endpoint's ``scalar_one_or_none()`` raised
``MultipleResultsFound`` and returned 500.

Before adding the constraint, existing duplicates are collapsed to the most
recently updated row per user. NOTE: ``user_stats`` has no ``created_at`` column
— it tracks ``updated_at`` (server_default now(), onupdate now()) — so the
de-dup orders by ``updated_at DESC NULLS LAST`` to keep the freshest row.

Hand-authored to match app/models.py (UserStats.__table_args__); the alembic
CLI/local Postgres are not available in this environment, following the same
convention as 0001-0003. Railway runs ``alembic upgrade head`` on deploy.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_add_unique_constraint_user_stats"
down_revision: Union[str, None] = "0003_add_coach_messages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Collapse any pre-existing duplicates: keep the most recently updated
    #    row per user_id, delete the rest. DISTINCT ON picks the first row per
    #    user under the ORDER BY, so updated_at DESC NULLS LAST keeps the
    #    freshest (NULL updated_at sorts last and only wins if it's the only row).
    op.execute(
        """
        DELETE FROM user_stats
        WHERE id NOT IN (
            SELECT DISTINCT ON (user_id) id
            FROM user_stats
            ORDER BY user_id, updated_at DESC NULLS LAST
        )
        """
    )

    # 2. Enforce one row per user going forward.
    op.create_unique_constraint(
        "uq_user_stats_user_id", "user_stats", ["user_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_user_stats_user_id", "user_stats", type_="unique")
