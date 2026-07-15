"""add user_stats.date_of_birth for auto-computed age

Revision ID: add_date_of_birth
Revises: avatar_color_default
Create Date: 2026-07-15

Per docs/dob_age_spec_s21.md: nullable Date column, no default, no
backfill — NULL means "user hasn't opted in", which is the correct state
for every existing row. The legacy manual ``age`` String column is kept
untouched as the fallback for non-DOB users; the frontend computes the
displayed age from date_of_birth whenever it is set.

Hand-authored (no alembic CLI/local Postgres in this environment), same
convention as 0001-0008. Railway runs ``alembic upgrade head`` on deploy.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic. Keep ``revision`` <= 32 chars:
# alembic_version.version_num is VARCHAR(32). "add_date_of_birth" = 17.
# down_revision is 0008's revision ID string ("avatar_color_default"), NOT
# its filename — alembic chains on the identifier.
revision: str = "add_date_of_birth"
down_revision: Union[str, None] = "avatar_color_default"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_stats", sa.Column("date_of_birth", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_stats", "date_of_birth")
