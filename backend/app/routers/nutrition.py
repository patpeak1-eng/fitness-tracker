"""Nutrition routes: food log CRUD, photo/label analysis, barcode lookup.

Spec: docs/nutrition_spec_s18.md Section 3. Design invariants:
- The AI analyze endpoint NEVER persists anything — the client reviews and
  edits the estimate, then POSTs /log with the final values.
- The frontend never calls Open Food Facts or the Anthropic API directly;
  all external calls and their throttles live here.
- ``client_id`` upserts are idempotent per user (same IntegrityError pattern
  as workout_history) so offline sync replays never duplicate rows.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

import httpx
from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import FoodLog, OffProductCache, User
from app.rate_limit import (
    NUTRITION_ANALYZE_LIMIT,
    NUTRITION_ANALYZE_WINDOW,
    OFF_OUTBOUND_LIMIT,
    OFF_OUTBOUND_WINDOW,
    enforce_rate_limit,
    rate_limit,
)
from app.schemas import (
    BarcodeProductResponse,
    DailyNutritionSummary,
    FoodLogCreate,
    FoodLogResponse,
    FoodLogUpdate,
    PhotoAnalyzeRequest,
    PhotoAnalyzeResponse,
)

router = APIRouter(prefix="/api/nutrition", tags=["nutrition"])

ANALYZE_MODEL = "claude-sonnet-4-6"  # same model family as COACH_MODEL
ANALYZE_MAX_TOKENS = 1024
# ~5 MB of binary image data is ~6.7M base64 chars; reject anything larger
# before it reaches the vision call. The client downscales before upload.
ANALYZE_MAX_IMAGE_CHARS = 7_000_000
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
# OFF requires an identifying User-Agent (app name + contact point).
OFF_USER_AGENT = "FitnessTracker/0.1 (https://github.com/patpeak1-eng/fitness-tracker)"
OFF_CACHE_MAX_AGE = timedelta(days=90)

ANALYZE_PROMPT = """Analyze this image for food logging. First decide whether it is:
(a) a photo of food / a meal / a drink -> source "photo"
(b) a photo of a nutrition-facts label -> source "label"

Return ONLY a single JSON object — no markdown fences, no commentary:
{"description": "<short human-readable description>",
 "calories": <integer for the whole visible serving>,
 "protein_g": <number or null>, "carbs_g": <number or null>, "fat_g": <number or null>,
 "items": [{"name": "<component>", "calories": <integer>}, ...],
 "confidence": "low" | "medium" | "high",
 "source": "photo" | "label"}

For labels: read the printed per-serving values exactly; confidence "high".
For meal photos: estimate the visible portion conservatively; portion size is
the main uncertainty, so report confidence honestly ("low" when ambiguous).
If the image contains no food and no nutrition label, return exactly:
{"error": "no_food_detected"}"""


# --------------------------------------------------------------------------- #
# Food log CRUD (no external calls)
# --------------------------------------------------------------------------- #
@router.post("/log", response_model=FoodLogResponse, status_code=status.HTTP_201_CREATED)
async def create_food_log(
    payload: FoodLogCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FoodLogResponse:
    entry = FoodLog(user_id=current_user.id, **payload.model_dump())
    db.add(entry)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # client_id already exists for this user — return the existing record
        # so re-syncs are idempotent instead of 500ing on the unique constraint.
        if payload.client_id:
            result = await db.execute(
                select(FoodLog).where(
                    FoodLog.user_id == current_user.id,
                    FoodLog.client_id == payload.client_id,
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                return FoodLogResponse.model_validate(existing)
        raise  # unexpected constraint — re-raise
    await db.refresh(entry)
    return FoodLogResponse.model_validate(entry)


@router.get("/log", response_model=List[FoodLogResponse])
async def list_food_log(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[FoodLogResponse]:
    if start is None:
        start = datetime.now(timezone.utc) - timedelta(days=30)
    query = (
        select(FoodLog)
        .where(FoodLog.user_id == current_user.id, FoodLog.logged_at >= start)
        .order_by(FoodLog.logged_at.asc())
    )
    if end is not None:
        query = query.where(FoodLog.logged_at <= end)
    result = await db.execute(query)
    return [FoodLogResponse.model_validate(e) for e in result.scalars().all()]


@router.put("/log/{entry_id}", response_model=FoodLogResponse)
async def update_food_log(
    entry_id: UUID,
    payload: FoodLogUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FoodLogResponse:
    result = await db.execute(
        select(FoodLog).where(
            FoodLog.id == entry_id, FoodLog.user_id == current_user.id
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Food log entry not found"
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    await db.commit()
    await db.refresh(entry)
    return FoodLogResponse.model_validate(entry)


@router.delete("/log/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_food_log(
    entry_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    result = await db.execute(
        select(FoodLog).where(
            FoodLog.id == entry_id, FoodLog.user_id == current_user.id
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Food log entry not found"
        )
    await db.delete(entry)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/summary", response_model=List[DailyNutritionSummary])
async def nutrition_summary(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[DailyNutritionSummary]:
    """Daily totals for the coach context and any future consumer. The
    frontend dashboard computes its own totals/EMA from local data."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(FoodLog)
        .where(FoodLog.user_id == current_user.id, FoodLog.logged_at >= since)
        .order_by(FoodLog.logged_at.asc())
    )
    by_day: dict = {}
    for e in result.scalars().all():
        day = e.logged_at.astimezone(timezone.utc).date().isoformat()
        agg = by_day.setdefault(
            day,
            {"calories": 0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "entries": 0},
        )
        agg["calories"] += e.calories
        agg["protein_g"] += e.protein_g or 0.0
        agg["carbs_g"] += e.carbs_g or 0.0
        agg["fat_g"] += e.fat_g or 0.0
        agg["entries"] += 1
    return [
        DailyNutritionSummary(date=day, **agg) for day, agg in sorted(by_day.items())
    ]


# --------------------------------------------------------------------------- #
# Photo / label analysis (Claude Vision — one endpoint for both)
# --------------------------------------------------------------------------- #
@router.post("/analyze", response_model=PhotoAnalyzeResponse)
async def analyze_photo(
    payload: PhotoAnalyzeRequest,
    current_user: User = Depends(get_current_user),
) -> PhotoAnalyzeResponse:
    # Cost guardrail before any Anthropic work (same discipline as coach chat).
    await rate_limit(
        "nutrition_analyze",
        NUTRITION_ANALYZE_LIMIT,
        NUTRITION_ANALYZE_WINDOW,
        current_user,
    )

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Nutrition analysis is not configured (missing ANTHROPIC_API_KEY).",
        )

    if payload.media_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported media_type; use one of {sorted(ALLOWED_IMAGE_TYPES)}.",
        )
    if len(payload.image) > ANALYZE_MAX_IMAGE_CHARS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image too large — downscale to under ~5 MB before upload.",
        )

    content = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": payload.media_type,
                "data": payload.image,
            },
        },
        {"type": "text", "text": ANALYZE_PROMPT},
    ]
    if payload.hint:
        content.append({"type": "text", "text": f"User hint: {payload.hint[:500]}"})

    client = AsyncAnthropic(api_key=api_key)
    try:
        message = await client.messages.create(
            model=ANALYZE_MODEL,
            max_tokens=ANALYZE_MAX_TOKENS,
            messages=[{"role": "user", "content": content}],
        )
    except Exception as err:  # noqa: BLE001 — surface upstream failure cleanly
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Vision analysis failed: {err}",
        )

    raw = "".join(
        block.text for block in message.content if getattr(block, "type", "") == "text"
    ).strip()
    # Defensive parse: the prompt demands bare JSON, but strip fences/prose
    # if the model wraps it anyway.
    if "{" in raw:
        raw = raw[raw.index("{") : raw.rindex("}") + 1]
    try:
        data = json.loads(raw)
    except (ValueError, IndexError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Vision analysis returned an unparseable result — try again.",
        )

    if data.get("error"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No food or nutrition label detected in the image.",
        )

    confidence = data.get("confidence")
    if confidence not in ("low", "medium", "high"):
        confidence = "low"
    source = data.get("source")
    if source not in ("photo", "label"):
        source = "photo"

    # Coerce calories defensively: the prompt demands an integer, but a
    # model returning e.g. 456.5 must not 500 the request.
    calories = data.get("calories")
    if calories is not None:
        try:
            calories = int(round(float(calories)))
        except (TypeError, ValueError):
            calories = None

    # NOTHING is persisted here — the client reviews/edits, then POSTs /log.
    return PhotoAnalyzeResponse(
        description=str(data.get("description") or "Unrecognized meal"),
        calories=calories,
        protein_g=data.get("protein_g"),
        carbs_g=data.get("carbs_g"),
        fat_g=data.get("fat_g"),
        items=data.get("items"),
        confidence=confidence,
        source=source,
    )


# --------------------------------------------------------------------------- #
# Barcode lookup (Open Food Facts, cache-first)
# --------------------------------------------------------------------------- #
def _normalize_off_product(barcode: str, product: dict) -> dict:
    nutriments = product.get("nutriments") or {}
    return {
        "barcode": barcode,
        "name": product.get("product_name") or None,
        "brand": product.get("brands") or None,
        "serving_size": product.get("serving_size") or None,
        "calories_per_100g": nutriments.get("energy-kcal_100g"),
        "protein_g_per_100g": nutriments.get("proteins_100g"),
        "carbs_g_per_100g": nutriments.get("carbohydrates_100g"),
        "fat_g_per_100g": nutriments.get("fat_100g"),
    }


@router.get("/barcode/{code}", response_model=BarcodeProductResponse)
async def barcode_lookup(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BarcodeProductResponse:
    if not code.isdigit() or not 6 <= len(code) <= 14:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Barcode must be 6-14 digits.",
        )

    cached_row = await db.get(OffProductCache, code)
    if cached_row is not None:
        age = datetime.now(timezone.utc) - (
            cached_row.fetched_at or datetime.now(timezone.utc)
        )
        if age < OFF_CACHE_MAX_AGE:
            return BarcodeProductResponse(**cached_row.product, cached=True)

    # GLOBAL outbound throttle (not per-user): OFF's limit is per-IP, and all
    # users share this backend's IP. Imperative variant so a stale cache row
    # can still be served when the budget is exhausted.
    allowed, retry_after = await enforce_rate_limit(
        "off_outbound", OFF_OUTBOUND_LIMIT, OFF_OUTBOUND_WINDOW
    )
    if not allowed:
        if cached_row is not None:  # stale beats nothing
            return BarcodeProductResponse(**cached_row.product, cached=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Barcode lookups are momentarily throttled — try again shortly, or enter the values manually.",
            headers={"Retry-After": str(retry_after)},
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                OFF_PRODUCT_URL.format(code=code),
                params={"fields": "product_name,brands,serving_size,nutriments"},
                headers={"User-Agent": OFF_USER_AGENT},
            )
    except httpx.HTTPError:
        if cached_row is not None:  # OFF down — serve stale
            return BarcodeProductResponse(**cached_row.product, cached=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Food database is unreachable — enter the values manually.",
        )

    try:
        body = resp.json() if resp.status_code == 200 else {}
    except ValueError:  # non-JSON body from OFF — treat as not found
        body = {}
    product = body.get("product")
    if resp.status_code != 200 or not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found for this barcode.",
        )

    normalized = _normalize_off_product(code, product)
    if cached_row is not None:
        cached_row.product = normalized
        cached_row.fetched_at = datetime.now(timezone.utc)
    else:
        db.add(OffProductCache(barcode=code, product=normalized))
    await db.commit()
    return BarcodeProductResponse(**normalized, cached=False)
