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
    color = Column(String, server_default="#bfff00")
    avatar = Column(String(1))
    theme = Column(String, server_default="dark")
    units = Column(String, server_default="metric")
    sound_enabled = Column(Boolean, server_default=text("true"))
    default_rest_time = Column(Integer, server_default=text("45"))
    default_work_time = Column(Integer, server_default=text("45"))
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
