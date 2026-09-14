"""Workout routes: paginated history plus the single active-workout slot.

Static ``/active`` routes are declared before the ``/{workout_id}`` route so
the literal segment is never swallowed by the path parameter.
"""
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import ActiveWorkout, User, WorkoutHistory
from app.schemas import (
    ActiveWorkoutConflict,
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
    # It is accepted and then REPAIRED. A row without a client_id has no
    # durable identity: PostgreSQL treats NULLs as distinct under the
    # (user_id, client_id) unique constraint, so a later re-upload inserts a
    # fresh row and can undo a deletion, and no client-side deletion can name
    # the row afterwards. Stamping the row's own id as its client_id closes
    # that permanently — the value is a fresh UUID, so it can never collide,
    # and every row in the table from here on carries an identifier.
    #
    # This is why it is done here rather than by rejecting the upload: an
    # earlier attempt returned 400, which SyncQueue dead-letters, permanently
    # discarding the user's workout. Accepting and stamping loses nothing.
    #
    # A production census found ZERO client_id-less rows, so there is no
    # backlog to migrate; this keeps the count at zero.

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
    if values.get("client_id") is None:
        values["client_id"] = str(values["id"])
    effective_client_id = values["client_id"]
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
    # when the insert was suppressed by a conflict. Use the EFFECTIVE client
    # id, not payload.client_id — a stamped row's payload value is None, and
    # matching on None would match every such row and blow up scalar_one().
    # (A stamped id is freshly minted and cannot conflict, so that fallback is
    # unreachable for it; keyed correctly anyway rather than relying on it.)
    lookup = (
        WorkoutHistory.id == inserted_id
        if inserted_id is not None
        else WorkoutHistory.client_id == effective_client_id
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
    # A soft-cleared slot returns the ROW with `workout_data: null` and its
    # `client_seq`, not JSON null. The sequence is what lets a client tell
    # "cleared at 7" from "never had one", which is the difference between
    # correctly staying empty and resurrecting a finished workout. Only a user
    # who has never saved at all gets null.
    #
    # Changing this contract was free: `getActiveWorkout` had no caller in
    # `src/` — which is itself the bug 3b fixes, since the cloud pull never
    # asked for the active workout and so nothing crossed devices.
    result = await db.execute(
        select(ActiveWorkout).where(ActiveWorkout.user_id == current_user.id)
    )
    active = result.scalar_one_or_none()
    if active is None:
        return None
    return ActiveWorkoutResponse.model_validate(active)


async def _write_active(db, user_id, workout_data, client_seq):
    """One statement, RETURNING the whole row. Returns the mapping, or None.

    None means a FENCED write was suppressed: the stored sequence was already
    at or above the incoming one.

    Everything comes back from the statement itself rather than a follow-up
    read. Two reasons, and the second was found by review:

    1. `except IntegrityError` -> rollback -> re-query raises MissingGreenlet
       under asyncpg (the rollback expires `current_user`), and the client
       retries 5xx forever. Third and last instance of a bug class already
       fixed in `create_workout` and `create_food_log`.
    2. Reading the row back AFTER the commit is itself a 500 window — a
       concurrent clear for the same user lands in between, the read finds
       nothing, `scalar_one()` raises, and the queue retries that forever too.
       Correct final data, wrong response; the contract is no 5xx.

    `updated_at` is set explicitly because its `onupdate=func.now()` is an
    ORM-side hook that does not fire for a Core insert.
    """
    stmt = pg_insert(ActiveWorkout).values(
        id=uuid4(),
        user_id=user_id,
        workout_data=workout_data,
        client_seq=1 if client_seq is None else client_seq,
        updated_at=func.now(),
    )

    if client_seq is None:
        # LEGACY branch, for clients deployed before the fence. No sequenced
        # WHERE, so it behaves exactly as today (last write wins by arrival)
        # and never sees a 409 — rejecting it would drop the user's
        # in-progress workout on a client we cannot update in the same deploy.
        # It still advances the high-water mark, so a sequenced client that
        # follows rebases above it rather than being stranded.
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id"],
            set_={
                "workout_data": stmt.excluded.workout_data,
                "client_seq": ActiveWorkout.client_seq + 1,
                "updated_at": func.now(),
            },
        )
    else:
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id"],
            set_={
                "workout_data": stmt.excluded.workout_data,
                "client_seq": stmt.excluded.client_seq,
                "updated_at": func.now(),
            },
            # The fence. PostgreSQL locks the conflicting row and re-evaluates
            # this predicate after waiting, so a stale save cannot win a race:
            # strictly lower is suppressed, equal yields one winner and one
            # 409. The conflict target is the unique index on user_id
            # (`ix_active_workout_user_id`, 0001).
            where=ActiveWorkout.client_seq < stmt.excluded.client_seq,
        )

    # Explicit COLUMNS, not the entity: `returning(ActiveWorkout)` yields an
    # ORM instance, and one obtained this way is expired by the commit below,
    # so touching an attribute afterwards triggers a lazy load with no greenlet
    # — the same MissingGreenlet failure by another route. Plain column values
    # survive the commit because they are already materialised.
    row = (
        await db.execute(
            stmt.returning(
                ActiveWorkout.id,
                ActiveWorkout.user_id,
                ActiveWorkout.workout_data,
                ActiveWorkout.client_seq,
                ActiveWorkout.updated_at,
            )
        )
    ).mappings().one_or_none()
    await db.commit()
    return row


async def _stale_seq_conflict(db, user_id) -> JSONResponse:
    """409 body, FLAT: {"detail": "stale client_seq", "client_seq": N}.

    Built as a JSONResponse from the declared model rather than raised as
    HTTPException(detail={...}), which would nest it one level deeper as
    {"detail": {"detail": ..., "client_seq": ...}} and disagree with the
    `ActiveWorkoutConflict` schema this route advertises. Review caught that:
    3b would have followed the OpenAPI model, read `body.client_seq`, got
    undefined, and been unable to rebase — losing the user's edit.

    RETURNING cannot report the current sequence when the fence suppressed the
    write, so it is read here. That read is NOT the post-commit window in
    `_write_active`: clearing is a SOFT clear, so the fence row is retained and
    a concurrent write can only move the bound HIGHER, which is still valid to
    rebase above. The row vanishing means account deletion, the ordinary
    authenticated-route race.
    """
    current = (
        await db.execute(
            select(ActiveWorkout.client_seq).where(ActiveWorkout.user_id == user_id)
        )
    ).scalar_one_or_none()
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content=ActiveWorkoutConflict(client_seq=current or 0).model_dump(mode="json"),
    )


@router.put(
    "/active",
    response_model=ActiveWorkoutResponse,
    responses={409: {"model": ActiveWorkoutConflict}},
)
async def upsert_active_workout(
    payload: ActiveWorkoutUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveWorkoutResponse:
    row = await _write_active(
        db, current_user.id, payload.workout_data, payload.client_seq
    )
    if row is not None:
        return ActiveWorkoutResponse.model_validate(dict(row))

    return await _stale_seq_conflict(db, current_user.id)


@router.delete(
    "/active",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={409: {"model": ActiveWorkoutConflict}},
)
async def clear_active_workout(
    client_seq: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    # SOFT clear: the row is RETAINED with `workout_data = NULL`, and the
    # clear takes a sequence like any other write.
    #
    # Deleting the row was the hole. A sequence written on a row that DELETE
    # removes fences nothing — a save still in flight simply re-inserts, and
    # the workout the user just finished comes back. Keeping the row means a
    # late save at a lower sequence is suppressed by the same fence as any
    # other stale write. A clear arriving before any save CREATES the fence
    # row, which closes the absent-row case too.
    #
    # `client_seq` is a query parameter so an old client's bare DELETE still
    # works: it takes the legacy branch, clears by arrival order exactly as
    # today, and advances the high-water mark.
    row = await _write_active(db, current_user.id, None, client_seq)
    if row is not None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return await _stale_seq_conflict(db, current_user.id)


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
