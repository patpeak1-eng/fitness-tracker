"""add cloud-synced confirmed equipment environments

Revision ID: equipment_env_cloud
Revises: add_date_of_birth
Create Date: 2026-08-17

Existing users intentionally receive NULL rather than an empty array. NULL is
the migration marker that lets the first upgraded device backfill any named
S24 environments that currently exist only in profile-scoped local storage.
Once a JSON array is stored, including [], the cloud value is authoritative so
cross-device deletions are preserved.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "equipment_env_cloud"
down_revision: Union[str, None] = "add_date_of_birth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "equipment_environments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "equipment_environments")
