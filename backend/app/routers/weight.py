"""Weight routes: full history and new entries."""
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User, WeightHistory
from app.schemas import WeightCreate, WeightResponse

router = APIRouter(prefix="/api/weight", tags=["weight"])


@router.get("", response_model=List[WeightResponse])
async def list_weight(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[WeightResponse]:
    result = await db.execute(
        select(WeightHistory)
        .where(WeightHistory.user_id == current_user.id)
        .order_by(WeightHistory.recorded_at.asc())
    )
    return [WeightResponse.model_validate(w) for w in result.scalars().all()]


@router.post("", response_model=WeightResponse, status_code=status.HTTP_201_CREATED)
async def create_weight(
    payload: WeightCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeightResponse:
    entry = WeightHistory(
        user_id=current_user.id,
        **payload.model_dump(exclude_unset=True),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return WeightResponse.model_validate(entry)
