"""Workout routes: paginated history plus the single active-workout slot.

Static ``/active`` routes are declared before the ``/{workout_id}`` route so
the literal segment is never swallowed by the path parameter.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import ActiveWorkout, User, WorkoutHistory
from app.schemas import (
    ActiveWorkoutResponse,
    ActiveWorkoutUpsert,
    WorkoutCreate,
    WorkoutListResponse,
    WorkoutResponse,
)

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


@router.get("", response_model=WorkoutListResponse)
async def list_workouts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkoutListResponse:
    total = await db.scalar(
        select(func.count())
        .select_from(WorkoutHistory)
        .where(WorkoutHistory.user_id == current_user.id)
    )
    result = await db.execute(
        select(WorkoutHistory)
        .where(WorkoutHistory.user_id == current_user.id)
        .order_by(WorkoutHistory.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = result.scalars().all()
    return WorkoutListResponse(
        total=total or 0,
        limit=limit,
        offset=offset,
        items=[WorkoutResponse.model_validate(item) for item in items],
    )


@router.post("", response_model=WorkoutResponse, status_code=status.HTTP_201_CREATED)
async def create_workout(
    payload: WorkoutCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkoutResponse:
    workout = WorkoutHistory(user_id=current_user.id, **payload.model_dump())
    db.add(workout)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # client_id already exists for this user — return the existing record
        # so re-syncs are idempotent instead of 500ing on the unique constraint.
        if payload.client_id:
            result = await db.execute(
                select(WorkoutHistory).where(
                    WorkoutHistory.user_id == current_user.id,
                    WorkoutHistory.client_id == payload.client_id,
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                return WorkoutResponse.model_validate(existing)
        raise  # unexpected constraint — re-raise
    await db.refresh(workout)
    return WorkoutResponse.model_validate(workout)


@router.get("/active", response_model=ActiveWorkoutResponse | None)
async def get_active_workout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveWorkoutResponse | None:
    result = await db.execute(
        select(ActiveWorkout).where(ActiveWorkout.user_id == current_user.id)
    )
    active = result.scalar_one_or_none()
    if active is None:
        return None
    return ActiveWorkoutResponse.model_validate(active)


@router.put("/active", response_model=ActiveWorkoutResponse)
async def upsert_active_workout(
    payload: ActiveWorkoutUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveWorkoutResponse:
    result = await db.execute(
        select(ActiveWorkout).where(ActiveWorkout.user_id == current_user.id)
    )
    active = result.scalar_one_or_none()
    if active is not None:
        active.workout_data = payload.workout_data
        await db.commit()
        await db.refresh(active)
        return ActiveWorkoutResponse.model_validate(active)

    # No row yet: insert, but tolerate a concurrent insert for the same user.
    # The unique constraint on active_workout.user_id guarantees one row.
    active = ActiveWorkout(user_id=current_user.id, workout_data=payload.workout_data)
    db.add(active)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        result = await db.execute(
            select(ActiveWorkout).where(ActiveWorkout.user_id == current_user.id)
        )
        active = result.scalar_one()
        active.workout_data = payload.workout_data
        await db.commit()

    await db.refresh(active)
    return ActiveWorkoutResponse.model_validate(active)


@router.delete("/active", status_code=status.HTTP_204_NO_CONTENT)
async def clear_active_workout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await db.execute(
        delete(ActiveWorkout).where(ActiveWorkout.user_id == current_user.id)
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    result = await db.execute(
        select(WorkoutHistory).where(
            WorkoutHistory.id == id,
            WorkoutHistory.user_id == current_user.id,
        )
    )
    workout = result.scalar_one_or_none()
    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found"
        )

    await db.delete(workout)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
