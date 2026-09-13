"""Workout routes: paginated history plus the single active-workout slot.

Static ``/active`` routes are declared before the ``/{workout_id}`` route so
the literal segment is never swallowed by the path parameter.
"""
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
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
    # `deleted_at IS NULL` must be on BOTH queries. Filtering only the rows
    # leaves an inflated total, so the client pages toward a result set that
    # never arrives.
    total = await db.scalar(
        select(func.count())
        .select_from(WorkoutHistory)
        .where(
            WorkoutHistory.user_id == current_user.id,
            WorkoutHistory.deleted_at.is_(None),
        )
    )
    result = await db.execute(
        select(WorkoutHistory)
        .where(
            WorkoutHistory.user_id == current_user.id,
            WorkoutHistory.deleted_at.is_(None),
        )
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
    # A create without client_id is ACCEPTED, deliberately.
    #
    # Rejecting it would be a data-loss regression: the shipped login backfill
    # queues `payload: w` — the raw local workout (WorkoutContext.jsx
    # ~1036-1048) — and a legacy or restored row may carry no client_id.
    # SyncQueue dead-letters any 4xx (SyncQueue.js ~131-137), so a 400 would
    # permanently discard that workout on a client we cannot update in the
    # same deploy.
    #
    # Known gap, tracked to Fix 1b: such a row has no durable identity, and
    # because PostgreSQL treats NULLs as distinct under the
    # (user_id, client_id) unique constraint, a later re-upload inserts a
    # fresh row and can undo a deletion. Production held ZERO client_id-less
    # rows when this shipped. 1b makes the client always send an identifier;
    # only after that can the server require one.

    # Let PostgreSQL resolve the conflict; never let one reach the session.
    #
    # This previously caught IntegrityError from commit() and re-queried. A
    # regression test shows that path 500'd on a plain sequential duplicate:
    # the re-query raised MissingGreenlet, and the client queue retries 5xx
    # forever, so every duplicate sync became a permanent retry loop. The
    # precise trigger was not isolated — rollback expires current_user, so
    # attribute access on it during the re-query is the likeliest cause. A
    # savepoint was tried and the concurrency test still failed.
    #
    # ON CONFLICT DO NOTHING raises nothing at all, so one statement covers
    # the first write, a sequential duplicate, and a genuine race. Both
    # regression tests cover it.
    values = {"user_id": current_user.id, **payload.model_dump()}
    values.setdefault("id", uuid4())
    inserted_id = (
        await db.execute(
            pg_insert(WorkoutHistory)
            .values(**values)
            .on_conflict_do_nothing(index_elements=["user_id", "client_id"])
            .returning(WorkoutHistory.id)
        )
    ).scalar_one_or_none()
    await db.commit()

    # Read back by the id we actually inserted; only fall back to client_id
    # when the insert was suppressed by a conflict, which can only happen when
    # client_id is non-null. Looking up by client_id unconditionally would
    # match EVERY client_id-less row for this user and blow up scalar_one().
    lookup = (
        WorkoutHistory.id == inserted_id
        if inserted_id is not None
        else WorkoutHistory.client_id == payload.client_id
    )
    # A soft-deleted row is returned WITH deleted_at set — the list hides
    # deleted rows, so this response is the only channel through which a
    # client learns its re-upload was rejected.
    workout = (
        await db.execute(
            select(WorkoutHistory).where(
                WorkoutHistory.user_id == current_user.id, lookup
            )
        )
    ).scalar_one()
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


@router.delete("/deletions/by-client-id", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout_by_client_id(
    client_id: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Record that a workout is deleted, whether or not it has been uploaded.

    ``DELETE /{id}`` can only remove a row that already exists. While an
    upload is in flight there is nothing to delete, so a client is forced to
    infer from an absent row whether that upload will land — an inference no
    amount of local bookkeeping makes safe across a lost response or a crash.

    Keying the deletion on the client's OWN identifier removes the inference.
    If the row exists it is soft-deleted; if it does not, a placeholder is
    written already deleted, so a create arriving later collides with it and
    comes back marked ``deleted_at`` instead of resurrecting the workout.

    Idempotent: a repeat is 204 and never adds a second row, which is what
    lets a client keep the intent queued until it succeeds.

    ``client_id`` is a QUERY parameter, not a path segment, deliberately. It is
    client-generated and therefore an arbitrary string; one containing ``/``
    survives ``encodeURIComponent`` as ``%2F``, which the ASGI server decodes
    before routing, so the request 404s and the client dead-letters a deletion
    it can never retry. A query parameter carries any string safely.

    This endpoint never 404s for an unknown ``client_id`` — that case is a
    normal 204. A 404 from it therefore means the route is missing, which is
    what an older backend returns while a deploy is still rolling over; the
    client treats it as retryable for exactly that reason.
    """
    now = datetime.now(timezone.utc)
    # One statement so a concurrent create or a second delete cannot interleave
    # between a check and a write. COALESCE keeps the ORIGINAL deletion time on
    # a repeat rather than sliding it forward.
    await db.execute(
        pg_insert(WorkoutHistory)
        .values(
            id=uuid4(),
            user_id=current_user.id,
            client_id=client_id,
            # name is NOT NULL; this row is never shown, since every read
            # filters deleted_at IS NULL.
            name="(deleted)",
            status="deleted",
            deleted_at=now,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "client_id"],
            set_={"deleted_at": func.coalesce(WorkoutHistory.deleted_at, now)},
        )
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

    # Soft delete: retain the row so a later re-upload of the same client_id
    # collides with it instead of inserting a fresh copy. Already-deleted is
    # success — a retry after a lost response must not error.
    if workout.deleted_at is None:
        workout.deleted_at = datetime.now(timezone.utc)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
