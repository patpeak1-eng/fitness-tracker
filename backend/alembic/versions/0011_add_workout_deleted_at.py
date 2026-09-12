"""add deleted_at to workout_history (soft delete)

Revision ID: add_workout_deleted_at
Revises: equipment_env_cloud
Create Date: 2026-09-12

Deleting a workout previously removed the row outright, which meant the
server had no memory of the deletion. Anything still holding a local copy —
a restored backup, or a second device — re-uploaded it on the next backfill
and the workout came back.

Retaining the row with ``deleted_at`` set gives the server a durable record
of the deletion, so a re-upload of the same ``client_id`` collides with the
existing (deleted) row instead of inserting a fresh one.

Reversible: dropping the column restores the previous behaviour. Rows that
were soft-deleted become visible again, which is the honest consequence of
undoing this and is preferable to destroying them on downgrade.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "add_workout_deleted_at"
down_revision: Union[str, None] = "equipment_env_cloud"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workout_history",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_workout_history_deleted_at", "workout_history", ["deleted_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_workout_history_deleted_at", table_name="workout_history")
    op.drop_column("workout_history", "deleted_at")
