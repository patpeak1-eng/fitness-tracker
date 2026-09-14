"""S32 Fix 3 — fence the active-workout slot with a per-user sequence.

Two changes, and the second is the one that is easy to miss.

`client_seq BIGINT NOT NULL DEFAULT 0` is the fence: an upsert applies only
when the incoming sequence is strictly higher than the stored one, so a save
delayed past a newer save (or past a clear) is rejected instead of silently
winning by arrival order.

`workout_data` becomes NULLABLE because clearing must become a SOFT clear.
A sequence number written on a row that DELETE removes cannot fence anything
— the next stale save just re-inserts, and the workout the user finished
comes back. Keeping the row with `workout_data = NULL` is what closes that
hole, and it is why the GET contract changes to `{workout_data: null,
client_seq}` rather than an absent row.

Existing rows take `client_seq = 0`, so the first sequenced write from any
client wins, and unversioned writes from deployed old clients keep working
through the legacy branch.

Revision ID: active_workout_client_seq
Revises: add_workout_deleted_at
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "active_workout_client_seq"
down_revision: Union[str, None] = "add_workout_deleted_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "active_workout",
        sa.Column(
            "client_seq",
            sa.BigInteger(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.alter_column("active_workout", "workout_data", nullable=True)


def downgrade() -> None:
    # A soft-cleared row has workout_data NULL, which the old NOT NULL column
    # cannot hold. Those rows mean "no active workout", which is exactly what
    # the pre-fence schema expressed by having no row at all — so drop them
    # rather than fail the downgrade or invent a placeholder workout.
    op.execute("DELETE FROM active_workout WHERE workout_data IS NULL")
    op.alter_column("active_workout", "workout_data", nullable=False)
    op.drop_column("active_workout", "client_seq")
