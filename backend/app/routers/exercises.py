"""Exercise routes: list and create custom exercises."""
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import CustomExercise, User
from app.schemas import ExerciseCreate, ExerciseResponse

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=List[ExerciseResponse])
async def list_exercises(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ExerciseResponse]:
    result = await db.execute(
        select(CustomExercise)
        .where(CustomExercise.user_id == current_user.id)
        .order_by(CustomExercise.created_at.desc())
    )
    return [ExerciseResponse.model_validate(e) for e in result.scalars().all()]


@router.post("", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    payload: ExerciseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResponse:
    exercise = CustomExercise(
        user_id=current_user.id, exercise_data=payload.exercise_data
    )
    db.add(exercise)
    await db.commit()
    await db.refresh(exercise)
    return ExerciseResponse.model_validate(exercise)
