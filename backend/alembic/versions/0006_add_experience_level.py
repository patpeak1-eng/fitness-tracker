"""add experience_level to users

Revision ID: add_experience_lvl
Revises: add_coach_prefs
Create Date: 2026-07-15

Adds a user-level experience_level column ('beginner'|'intermediate'|
'advanced') so the AI coach can calibrate response depth. Nullable with a
TRUE database-level server default: Postgres backfills every existing row
to 'intermediate' at migration time — no row is left NULL (same shape as
0005's coach columns, spec: docs/experience_level_spec_s16.md).

Hand-authored to match app/models.py (User); the alembic CLI/local Postgres
are not available in this environment, following the same convention as
0001-0005. Railway runs ``alembic upgrade head`` on deploy.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic. Keep ``revision`` <= 32 chars:
# alembic_version.version_num is VARCHAR(32). "add_experience_lvl" = 18.
# down_revision is 0005's revision ID string ("add_coach_prefs"), NOT its
# filename — alembic chains on the identifier.
revision: str = "add_experience_lvl"
down_revision: Union[str, None] = "add_coach_prefs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "experience_level",
            sa.String(20),
            nullable=True,
            server_default="intermediate",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "experience_level")
