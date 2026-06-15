"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-15

Creates all eight tables for the fitness tracker. Authored to match the
SQLAlchemy models in app/models.py (the equivalent of `alembic revision
--autogenerate` run against an empty database). Railway runs `alembic upgrade`
on deploy.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("color", sa.String(), server_default=sa.text("'#bfff00'"), nullable=True),
        sa.Column("avatar", sa.String(length=1), nullable=True),
        sa.Column("theme", sa.String(), server_default=sa.text("'dark'"), nullable=True),
        sa.Column("units", sa.String(), server_default=sa.text("'metric'"), nullable=True),
        sa.Column("sound_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=True),
        sa.Column("default_rest_time", sa.Integer(), server_default=sa.text("45"), nullable=True),
        sa.Column("default_work_time", sa.Integer(), server_default=sa.text("45"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "user_stats",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("age", sa.String(), nullable=True),
        sa.Column("height", sa.String(), nullable=True),
        sa.Column("current_weight", sa.String(), nullable=True),
        sa.Column("target_weight", sa.String(), nullable=True),
        sa.Column("goal", sa.String(), server_default=sa.text("'maintenance'"), nullable=True),
        sa.Column("motivation", sa.String(), nullable=True),
        sa.Column("body_fat", sa.String(), nullable=True),
        sa.Column("muscle_mass", sa.String(), nullable=True),
        sa.Column("bone_density", sa.String(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_stats_user_id", "user_stats", ["user_id"], unique=False)

    op.create_table(
        "workout_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), server_default=sa.text("'completed'"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("exercises", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("recommendations", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_history_user_id", "workout_history", ["user_id"], unique=False)

    op.create_table(
        "active_workout",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workout_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_active_workout_user_id", "active_workout", ["user_id"], unique=True)

    op.create_table(
        "assessments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assessment_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assessments_user_id", "assessments", ["user_id"], unique=False)

    op.create_table(
        "weight_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weight_history_user_id", "weight_history", ["user_id"], unique=False)

    op.create_table(
        "custom_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("template_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_custom_templates_user_id", "custom_templates", ["user_id"], unique=False)

    op.create_table(
        "custom_exercises",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("exercise_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_custom_exercises_user_id", "custom_exercises", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_custom_exercises_user_id", table_name="custom_exercises")
    op.drop_table("custom_exercises")
    op.drop_index("ix_custom_templates_user_id", table_name="custom_templates")
    op.drop_table("custom_templates")
    op.drop_index("ix_weight_history_user_id", table_name="weight_history")
    op.drop_table("weight_history")
    op.drop_index("ix_assessments_user_id", table_name="assessments")
    op.drop_table("assessments")
    op.drop_index("ix_active_workout_user_id", table_name="active_workout")
    op.drop_table("active_workout")
    op.drop_index("ix_workout_history_user_id", table_name="workout_history")
    op.drop_table("workout_history")
    op.drop_index("ix_user_stats_user_id", table_name="user_stats")
    op.drop_table("user_stats")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
