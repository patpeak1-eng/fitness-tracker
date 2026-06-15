"""Profile routes: read and update the current user plus their body stats."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User, UserStats
from app.schemas import ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/api/profile", tags=["profile"])


async def _get_stats(db: AsyncSession, user_id) -> UserStats | None:
    # user_stats.user_id is not unique in the schema, so read the most recent
    # row with first() rather than scalar_one_or_none() (which would raise if
    # more than one row ever existed for a user).
    result = await db.execute(
        select(UserStats)
        .where(UserStats.user_id == user_id)
        .order_by(UserStats.updated_at.desc())
        .limit(1)
    )
    return result.scalars().first()


@router.get("", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    stats = await _get_stats(db, current_user.id)
    return ProfileResponse.model_validate(
        {"user": current_user, "stats": stats}
    )


@router.put("", response_model=ProfileResponse)
async def update_profile(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    data = payload.model_dump(exclude_unset=True)
    stats_data = data.pop("stats", None)

    # Update user-level profile fields and timer defaults.
    for field, value in data.items():
        setattr(current_user, field, value)

    # Upsert the related stats row when stats fields were provided.
    stats = await _get_stats(db, current_user.id)
    if stats_data is not None:
        if stats is None:
            stats = UserStats(user_id=current_user.id)
            db.add(stats)
        for field, value in stats_data.items():
            setattr(stats, field, value)

    await db.commit()
    await db.refresh(current_user)
    if stats is not None:
        await db.refresh(stats)

    return ProfileResponse.model_validate({"user": current_user, "stats": stats})
