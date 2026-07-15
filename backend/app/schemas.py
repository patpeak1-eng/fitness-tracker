"""Pydantic request/response schemas.

Response models set ``from_attributes=True`` so they can be built directly
from SQLAlchemy ORM instances. JSONB payloads are typed as ``Any`` because the
frontend owns their internal shape.
"""
from datetime import date, datetime
from typing import Any, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class AccountDeleteRequest(BaseModel):
    # Typed confirmation required for every account (must equal "DELETE").
    confirm: str
    # Required for local email/password accounts (re-verified server-side);
    # ignored for Google OAuth accounts, which have no usable password.
    password: Optional[str] = None


# --------------------------------------------------------------------------- #
# Profile / user stats
# --------------------------------------------------------------------------- #
class UserStatsUpdate(BaseModel):
    age: Optional[str] = None
    date_of_birth: Optional[date] = None
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
# Nutrition (spec: docs/nutrition_spec_s18.md Section 3)
# --------------------------------------------------------------------------- #
class FoodLogCreate(BaseModel):
    client_id: Optional[str] = None
    logged_at: datetime
    description: str = Field(..., min_length=1)
    calories: int = Field(..., ge=0)
    protein_g: Optional[float] = Field(None, ge=0)
    carbs_g: Optional[float] = Field(None, ge=0)
    fat_g: Optional[float] = Field(None, ge=0)
    # Literal types keep junk out of the String(20)/(10)/(32) columns —
    # an over-length or unknown value 422s here instead of 500ing at the DB.
    source: Literal["manual", "photo", "barcode", "label"] = "manual"
    confidence: Optional[Literal["low", "medium", "high"]] = None  # AI paths only
    barcode: Optional[str] = Field(None, max_length=32)
    items: Optional[Any] = None


class FoodLogUpdate(BaseModel):
    # All optional — AI-estimated entries stay user-correctable after save.
    logged_at: Optional[datetime] = None
    description: Optional[str] = None
    calories: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None


class FoodLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: Optional[str] = None
    user_id: UUID
    logged_at: datetime
    description: str
    calories: int
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    source: str
    confidence: Optional[str] = None
    barcode: Optional[str] = None
    items: Optional[Any] = None
    created_at: Optional[datetime] = None


class PhotoAnalyzeRequest(BaseModel):
    image: str  # base64-encoded image data (no data: URI prefix)
    media_type: str = "image/jpeg"
    hint: Optional[str] = None  # optional user hint, e.g. "half portion"


class PhotoAnalyzeResponse(BaseModel):
    # One endpoint for BOTH meal photos and nutrition labels — the model
    # classifies the image and sets source accordingly. Never persisted here;
    # the client reviews/edits, then POSTs /log.
    description: str
    calories: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    items: Optional[Any] = None
    confidence: str  # "low" | "medium" | "high"
    source: str  # "photo" (plate) | "label" (nutrition label)


class BarcodeProductResponse(BaseModel):
    barcode: str
    name: Optional[str] = None
    brand: Optional[str] = None
    serving_size: Optional[str] = None
    # Per 100 g/ml, straight from the label data (exact, not estimated).
    calories_per_100g: Optional[float] = None
    protein_g_per_100g: Optional[float] = None
    carbs_g_per_100g: Optional[float] = None
    fat_g_per_100g: Optional[float] = None
    cached: bool = False  # served from off_product_cache (no OFF call made)


class DailyNutritionSummary(BaseModel):
    date: str  # ISO date (UTC)
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    entries: int


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
