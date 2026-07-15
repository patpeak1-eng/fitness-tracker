"""SQLAlchemy ORM models for the fitness tracker backend."""
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    name = Column(String)
    color = Column(String, server_default="#ff5c2a")
    avatar = Column(String(1))
    theme = Column(String, server_default="dark")
    units = Column(String, server_default="metric")
    sound_enabled = Column(Boolean, server_default=text("true"))
    default_rest_time = Column(Integer, server_default=text("45"))
    default_work_time = Column(Integer, server_default=text("45"))
    coach_personality = Column(String(50), server_default="apex")
    coach_voice_id = Column(String(100), server_default="FxZjRiAEBESrb7srpme7")
    experience_level = Column(String(20), server_default="intermediate")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    stats = relationship(
        "UserStats",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    workouts = relationship(
        "WorkoutHistory",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    active_workout = relationship(
        "ActiveWorkout",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    assessments = relationship(
        "Assessment",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    weight_entries = relationship(
        "WeightHistory",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    templates = relationship(
        "CustomTemplate",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    exercises = relationship(
        "CustomExercise",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    coach_messages = relationship(
        "CoachMessage",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    food_entries = relationship(
        "FoodLog",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class UserStats(Base):
    __tablename__ = "user_stats"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_stats_user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    age = Column(String)
    height = Column(String)
    current_weight = Column(String)
    target_weight = Column(String)
    goal = Column(String, server_default="maintenance")
    motivation = Column(String)
    body_fat = Column(String)
    muscle_mass = Column(String)
    bone_density = Column(String)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", back_populates="stats")


class WorkoutHistory(Base):
    __tablename__ = "workout_history"
    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_workout_user_client_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Frontend-generated id so a workout keeps one canonical id across the
    # localStorage client and the backend UUID (prevents duplicate rows on
    # re-login). Nullable for legacy rows; unique per user (NULLs allowed).
    client_id = Column(String, nullable=True, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    status = Column(String, server_default="completed")
    notes = Column(Text)
    exercises = Column(JSONB)
    recommendations = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="workouts")


class ActiveWorkout(Base):
    __tablename__ = "active_workout"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    workout_data = Column(JSONB, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", back_populates="active_workout")


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assessment_data = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="assessments")


class WeightHistory(Base):
    __tablename__ = "weight_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    weight = Column(Float, nullable=False)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="weight_entries")


class CustomTemplate(Base):
    __tablename__ = "custom_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    template_data = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="templates")


class CustomExercise(Base):
    __tablename__ = "custom_exercises"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exercise_data = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="exercises")


class FoodLog(Base):
    __tablename__ = "food_log"
    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_food_log_user_client_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Frontend-generated id — same duplicate-prevention pattern as
    # workout_history.client_id (offline-first sync replays stay idempotent).
    client_id = Column(String, nullable=True, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    logged_at = Column(DateTime(timezone=True), nullable=False)  # when eaten
    description = Column(String, nullable=False)
    calories = Column(Integer, nullable=False)
    protein_g = Column(Float)  # macros nullable — manual quick-log may be
    carbs_g = Column(Float)    # calories-only
    fat_g = Column(Float)
    source = Column(String(20), nullable=False, server_default="manual")
    # "manual" | "photo" | "barcode" | "label"
    confidence = Column(String(10))  # "low"|"medium"|"high"; NULL for manual/barcode
    barcode = Column(String(32))     # EAN/UPC when source="barcode"
    items = Column(JSONB)            # per-item breakdown from vision analysis
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="food_entries")


class OffProductCache(Base):
    """Shared (no user_id) cache of normalized Open Food Facts products so the
    15 req/min/IP read budget is never spent twice on the same barcode."""

    __tablename__ = "off_product_cache"

    barcode = Column(String(32), primary_key=True)
    product = Column(JSONB, nullable=False)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())


class CoachMessage(Base):
    __tablename__ = "coach_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String, nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="coach_messages")
