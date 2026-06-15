"""Assessment routes: list and create fitness assessments."""
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Assessment, User
from app.schemas import AssessmentCreate, AssessmentResponse

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


@router.get("", response_model=List[AssessmentResponse])
async def list_assessments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[AssessmentResponse]:
    result = await db.execute(
        select(Assessment)
        .where(Assessment.user_id == current_user.id)
        .order_by(Assessment.created_at.desc())
    )
    return [AssessmentResponse.model_validate(a) for a in result.scalars().all()]


@router.post(
    "", response_model=AssessmentResponse, status_code=status.HTTP_201_CREATED
)
async def create_assessment(
    payload: AssessmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    assessment = Assessment(
        user_id=current_user.id, assessment_data=payload.assessment_data
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    return AssessmentResponse.model_validate(assessment)
