"""Pydantic request/response schemas.

Response models set ``from_attributes=True`` so they can be built directly
from SQLAlchemy ORM instances. JSONB payloads are typed as ``Any`` because the
frontend owns their internal shape.
"""
from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --------------------------------------------------------------------------- #
# Profile / user stats
# --------------------------------------------------------------------------- #
class UserStatsUpdate(BaseModel):
    age: Optional[str] = None
    height: Optional[str] = None
    current_weight: Optional[str] = None
    target_weight: Optional[str] = None
    goal: Optional[str] = None
    motivation: Optional[str] = None
    body_fat: Optional[str] = None
    muscle_mass: Optional[str] = None
    bone_density: Optional[str] = None


class UserStatsResponse(UserStatsUpdate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    updated_at: Optional[datetime] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    name: Optional[str] = None
    color: Optional[str] = None
    avatar: Optional[str] = None
    theme: Optional[str] = None
    units: Optional[str] = None
    sound_enabled: Optional[bool] = None
    default_rest_time: Optional[int] = None
    default_work_time: Optional[int] = None
    coach_personality: Optional[str] = None
    coach_voice_id: Optional[str] = None
    experience_level: Optional[str] = None
    created_at: Optional[datetime] = None


class ProfileResponse(BaseModel):
    user: UserResponse
    stats: Optional[UserStatsResponse] = None


class ProfileUpdate(BaseModel):
    # User-level profile fields and timer defaults.
    name: Optional[str] = None
    color: Optional[str] = None
    avatar: Optional[str] = None
    theme: Optional[str] = None
    units: Optional[str] = None
    sound_enabled: Optional[bool] = None
    default_rest_time: Optional[int] = None
    default_work_time: Optional[int] = None
    coach_personality: Optional[str] = None
    coach_voice_id: Optional[str] = None
    experience_level: Optional[str] = None
    # Optional nested body-stats update.
    stats: Optional[UserStatsUpdate] = None


# --------------------------------------------------------------------------- #
# Workouts
# --------------------------------------------------------------------------- #
class WorkoutCreate(BaseModel):
    client_id: Optional[str] = None
    name: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = "completed"
    notes: Optional[str] = None
    exercises: Optional[Any] = None
    recommendations: Optional[Any] = None


class WorkoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: Optional[str] = None
    user_id: UUID
    name: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    exercises: Optional[Any] = None
    recommendations: Optional[Any] = None
    created_at: Optional[datetime] = None


class WorkoutListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: List[WorkoutResponse]


class ActiveWorkoutUpsert(BaseModel):
    workout_data: Any


class ActiveWorkoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    workout_data: Any
    updated_at: Optional[datetime] = None


# --------------------------------------------------------------------------- #
# Assessments
# --------------------------------------------------------------------------- #
class AssessmentCreate(BaseModel):
    assessment_data: Any


class AssessmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    assessment_data: Any
    created_at: Optional[datetime] = None


# --------------------------------------------------------------------------- #
# Weight history
# --------------------------------------------------------------------------- #
class WeightCreate(BaseModel):
    weight: float
    recorded_at: Optional[datetime] = None


class WeightResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    weight: float
    recorded_at: Optional[datetime] = None


# --------------------------------------------------------------------------- #
# Custom templates
# --------------------------------------------------------------------------- #
class TemplateCreate(BaseModel):
    name: str
    template_data: Any


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    template_data: Any
    created_at: Optional[datetime] = None


# --------------------------------------------------------------------------- #
# Custom exercises
# --------------------------------------------------------------------------- #
class ExerciseCreate(BaseModel):
    exercise_data: Any


class ExerciseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    exercise_data: Any
    created_at: Optional[datetime] = None
