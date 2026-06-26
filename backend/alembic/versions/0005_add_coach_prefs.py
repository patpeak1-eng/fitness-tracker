"""add coach_personality + coach_voice_id to users

Revision ID: add_coach_prefs
Revises: 0004_uq_stats
Create Date: 2026-06-26

Adds two user-level coach preference columns so the coach personality and the
ElevenLabs voice id sync to the backend alongside the other profile settings
(theme, units, sound, timer defaults). Both are nullable with server defaults so
existing rows backfill on upgrade and never read as NULL for the client.

Hand-authored to match app/models.py (User); the alembic CLI/local Postgres are
not available in this environment, following the same convention as 0001-0004.
Railway runs ``alembic upgrade head`` on deploy.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic. Keep ``revision`` <= 32 chars:
# alembic_version.version_num is VARCHAR(32), so a longer id fails the
# "alembic upgrade head" that runs on Railway deploy. "add_coach_prefs" = 15.
revision: str = "add_coach_prefs"
down_revision: Union[str, None] = "0004_uq_stats"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "coach_personality",
            sa.String(50),
            nullable=True,
            server_default="apex",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "coach_voice_id",
            sa.String(100),
            nullable=True,
            server_default="FxZjRiAEBESrb7srpme7",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "coach_voice_id")
    op.drop_column("users", "coach_personality")
