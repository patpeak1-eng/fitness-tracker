"""add coach_messages table

Revision ID: 0003_add_coach_messages
Revises: 0002_add_client_id
Create Date: 2026-06-16

Adds the ``coach_messages`` table backing the AI coach chat: one row per
user/assistant turn, scoped to a user and cascade-deleted with them. Authored
to match the SQLAlchemy model in app/models.py (the equivalent of
``alembic revision --autogenerate``); the alembic CLI/local Postgres are not
available in this environment, so the file follows the same hand-authored
convention as 0001/0002. Railway runs ``alembic upgrade head`` on deploy.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_add_coach_messages"
down_revision: Union[str, None] = "0002_add_client_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "coach_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_coach_messages_user_id", "coach_messages", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_coach_messages_user_id", table_name="coach_messages")
    op.drop_table("coach_messages")
