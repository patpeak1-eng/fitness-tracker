"""retire stale #bfff00 avatar color default, backfill existing rows

Revision ID: avatar_color_default
Revises: add_nutrition
Create Date: 2026-07-15

Per docs/avatar_color_spec_s21.md: users.color still defaults to #bfff00
(neon green from the retired pre-"Ember on Graphite" theme), and existing
rows hold the literal stale value because the server_default stamped it at
INSERT. Two-part fix:

1. New server_default '#ff5c2a' (Design Tokens v2 --primary hex) for
   future inserts.
2. One-time backfill of rows still on the literal old default. Safe by
   construction: no frontend code path has ever written ``color`` to the
   backend (the ProfileSelector picker is localStorage-only), so any row
   matching '#bfff00' holds the untouched default. NULL rows are left
   alone — the /me fallback covers them.

Hand-authored (no alembic CLI/local Postgres in this environment), same
convention as 0001-0007. Railway runs ``alembic upgrade head`` on deploy.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic. Keep ``revision`` <= 32 chars:
# alembic_version.version_num is VARCHAR(32). "avatar_color_default" = 20.
# down_revision is 0007's revision ID string ("add_nutrition"), NOT its
# filename — alembic chains on the identifier.
revision: str = "avatar_color_default"
down_revision: Union[str, None] = "add_nutrition"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "color", server_default=sa.text("'#ff5c2a'"))
    op.execute("UPDATE users SET color = '#ff5c2a' WHERE color = '#bfff00'")


def downgrade() -> None:
    op.alter_column("users", "color", server_default=sa.text("'#bfff00'"))
    # Deliberately no reverse backfill: rows the upgrade touched are
    # indistinguishable from rows that were already #ff5c2a — reverting
    # data would corrupt. Default-only downgrade.
