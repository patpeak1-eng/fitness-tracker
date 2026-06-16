"""add client_id to workout_history

Revision ID: 0002_add_client_id
Revises: 0001_initial
Create Date: 2026-06-16

Adds a nullable, per-user-unique ``client_id`` to ``workout_history`` so a
frontend-generated id and the backend UUID share one canonical id, eliminating
duplicate workouts on re-login. Authored to match the SQLAlchemy model in
app/models.py (the equivalent of ``alembic revision --autogenerate``).

The unique constraint is scoped to ``(user_id, client_id)``. In PostgreSQL,
NULLs are never considered equal in a unique constraint, so any number of
legacy rows with ``client_id = NULL`` for the same user remain allowed.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_add_client_id"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workout_history",
        sa.Column("client_id", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_workout_history_client_id",
        "workout_history",
        ["client_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_workout_user_client_id",
        "workout_history",
        ["user_id", "client_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_workout_user_client_id", "workout_history", type_="unique"
    )
    op.drop_index("ix_workout_history_client_id", table_name="workout_history")
    op.drop_column("workout_history", "client_id")
