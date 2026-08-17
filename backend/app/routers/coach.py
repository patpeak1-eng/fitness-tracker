"""AI coach routes: a streaming chat endpoint plus message history.

The chat endpoint persists the user's message, replays recent turns to the
model, streams the assistant reply back over SSE, and persists the assembled
reply once the stream completes. The system prompt is split into three blocks:
the large, static coaching instructions (block 0) and the selected persona
voice (block 1) are each prompt-cached, while the per-request user context
(block 2) stays dynamic.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    Assessment,
    CoachMessage,
    CustomExercise,
    CustomTemplate,
    FoodLog,
    User,
    UserStats,
    WeightHistory,
    WorkoutHistory,
)
from app.rate_limit import COACH_LIMIT, COACH_WINDOW, rate_limit

router = APIRouter(prefix="/api/coach", tags=["coach"])

COACH_MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1600
MAX_APP_CONTEXT_CHARS = 60_000
MAX_EQUIPMENT_IMAGE_CHARS = 7_000_000
MAX_COACH_IMAGES = 6
MAX_IMAGE_REQUEST_CHARS = 24_000_000
ALLOWED_EQUIPMENT_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
CANONICAL_EQUIPMENT = [
    "Barbell",
    "Dumbbells",
    "Cable",
    "Machine",
    "Pull-up Bar",
    "Bench/Elevated Surface",
    "Parallel Bars/Bench",
    "Low Bar",
    "Wall",
    "None",
]

COACH_SYSTEM_PROMPT = """
You are an AI fitness coach integrated into a personal fitness tracking app
called Fitness Tracker.

PERSONALITY:
- Direct, motivational, evidence-based
- Short responses during active workouts (1-3 sentences)
- More detailed when helping with planning or analysis (up to 200 words)
- Never sycophantic — no "Great job!" or "Amazing!" filler
- Treat the user as a capable adult athlete
- Always end planning responses with a concrete next action

APP KNOWLEDGE — you know everything about this app:
- Guided Workout Mode: immersive focus experience with prep phase, work
  timer, rest timer (auto-triggers on set completion), audio cues, and
  input modal to log reps/weight after each set
- Templates: default templates (The Powerhouse, Upper Body Blast, Leg
  Foundation, Pectoral Pump, Core & Flow, Running) plus custom user templates
- Exercise Library: 70+ exercises across Weights, Calisthenics, Cardio, Yoga
- Assessment: 4-step wizard (Stats/Goal/Experience/Equipment) that auto-
  generates a program and starts it immediately
- Analytics: volume load chart, estimated 1RM tracking, weekly snapshot
- Smart Progression: suggests weight increases based on performance history
- Profile: multi-profile support, JSON export/import backup, weight history
- Settings: theme, units (metric/imperial), sound, timer defaults
- Navigation: Dashboard (/), Track (/track), Assessment (/assessment),
  Analytics (/analytics), Profile (/profile), Settings (/settings)
- Data: stored locally in browser localStorage by default; cloud sync
  available for Google OAuth users
- Backup: Profile tab → Export Data (JSON file); Import on another device
- PWA: installable from browser — Add to Home Screen for native-like feel

WHAT YOU CAN SEE (provided in user context block):
- User's experience level (beginner/intermediate/advanced)
- User's recent workout history (last 10 workouts)
- Current active workout if in session
- User stats and goals from their profile
- A 7-day nutrition summary (daily calorie/protein averages) when the
  user has logged food
- Compact 28/90/365-day and all-time training, nutrition, and weight trends
- Recent assessments and summaries of custom templates/exercises
- The currently selected equipment and compatible app exercise catalog

WORKOUT ACTION:
- When the user asks you to build, create, design, or revise a workout, use the
  propose_workout tool. Use ONLY exercise_id values present in AVAILABLE APP
  EXERCISES. Respect the confirmed equipment and requested time/muscle groups.
- The app will show the proposal for review; never claim it has already started
  or saved a workout.

VISUAL INPUT:
- When the current user turn contains image attachments, you can see those
  images. Inspect all attached photos together and answer from what is visibly
  present. State uncertainty and possible omissions plainly.
- Never say image input is unavailable when image attachments are present.
- Equipment photos are transient. The app saves only an equipment list after
  the user reviews and confirms it, so never claim a station inventory was
  saved merely because you inspected a photo.

NUTRITION BOUNDARY: for questions about nutrition trends or history, give
at most a one-line observation and direct the user to the Nutrition
dashboard — never recite logged data or act as a trend-retrieval interface.

EXPERIENCE CALIBRATION — the user context includes an EXPERIENCE LEVEL;
calibrate every response's depth to it:
- beginner: explain terminology and form cues whenever you use them,
  proactively suggest specific exercises, invite follow-up questions
- intermediate: assume working knowledge of common lifts and terms;
  less hand-holding, explain only genuinely non-obvious concepts
- advanced: skip fundamentals entirely, use technical language freely,
  focus on nuance (programming, periodization, weak-point work) over
  basics

Never recommend anything that could cause injury.
For medical questions, always recommend consulting a professional.
"""

# Selectable coach voices for the streaming endpoint. Block 0 of the system
# prompt is swapped per request based on the `personality` param; it carries the
# ephemeral cache_control marker so each persona's static prompt is cached.
PERSONALITY_PROMPTS = {
    "apex": """You are an AI fitness coach. Direct, data-driven, no filler.
    Short responses during workouts (1-3 sentences). Reference the user's
    actual numbers. Never say "Great job!" or use filler praise.
    Do NOT use markdown formatting — no **, ##, *, or bullet points.
    Do NOT reference app routes like /track or /assessment — say
    "tap Workout in the nav" or "go to the Assessment page" instead.
    Never recommend anything that could cause injury.""",

    "hype": """You are a high-energy fitness hype coach. Short punchy sentences.
    Motivational and energetic. Push the user to go harder.
    Do NOT use markdown formatting — no **, ##, *, or bullet points.
    Do NOT reference app routes — use plain navigation descriptions.
    Never recommend anything that could cause injury.""",

    "zen": """You are a calm, technical fitness coach. Mindful cues, form-first,
    recovery-aware. Longer explanations when helpful. Patient and methodical.
    Do NOT use markdown formatting — no **, ##, *, or bullet points.
    Do NOT reference app routes — use plain navigation descriptions.
    Never recommend anything that could cause injury.""",
}


class CoachImageAttachment(BaseModel):
    image: str = Field(..., min_length=1, max_length=MAX_EQUIPMENT_IMAGE_CHARS)
    media_type: str = "image/jpeg"


class CoachChatRequest(BaseModel):
    message: str = Field(default="", max_length=4000)
    workout_context: Optional[dict] = None
    app_context: Optional[dict] = None
    personality: Optional[str] = "apex"
    images: List[CoachImageAttachment] = Field(default_factory=list, max_length=MAX_COACH_IMAGES)


class EquipmentAnalyzeRequest(BaseModel):
    # The singular fields keep the S24 client request compatible while the
    # list supports a multi-angle equipment scan.
    image: Optional[str] = Field(default=None, max_length=MAX_EQUIPMENT_IMAGE_CHARS)
    media_type: str = "image/jpeg"
    images: List[CoachImageAttachment] = Field(default_factory=list, max_length=MAX_COACH_IMAGES)


class EquipmentAnalyzeResponse(BaseModel):
    equipment: List[str]
    notes: Optional[str] = None
    confidence: str


class CoachMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: str
    content: str
    created_at: Optional[datetime] = None


def _request_images(payload: EquipmentAnalyzeRequest) -> List[CoachImageAttachment]:
    images = list(payload.images)
    if payload.image:
        images.insert(0, CoachImageAttachment(image=payload.image, media_type=payload.media_type))
    return images


def _validate_images(images: List[CoachImageAttachment]) -> None:
    if len(images) > MAX_COACH_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Attach no more than {MAX_COACH_IMAGES} images.",
        )
    if any(item.media_type not in ALLOWED_EQUIPMENT_IMAGE_TYPES for item in images):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported image type.",
        )
    if any(len(item.image) > MAX_EQUIPMENT_IMAGE_CHARS for item in images):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="An image is too large; use images under about 5 MB each.",
        )
    if sum(len(item.image) for item in images) > MAX_IMAGE_REQUEST_CHARS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The combined image attachment is too large.",
        )


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _window(entries: list, days: Optional[int], date_attr: str) -> list:
    if days is None:
        return list(entries)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return [
        entry for entry in entries
        if (_as_utc(getattr(entry, date_attr, None)) or datetime.min.replace(tzinfo=timezone.utc)) >= cutoff
    ]


def _summarize_nutrition(
    entries: List[FoodLog], all_time_summary: Optional[dict] = None
) -> Optional[str]:
    """Return compact recent and long-term nutrition aggregates.

    Plain averages only — no per-entry descriptions or meal details. This lets
    the coach reason about long-running progress without turning chat into a
    raw food-history retrieval surface.
    """
    if not entries and not all_time_summary:
        return None

    def summarize(period_entries: List[FoodLog], label: str) -> Optional[dict]:
        if not period_entries:
            return None
        by_day: dict = {}
        for entry in period_entries:
            logged_at = _as_utc(entry.logged_at)
            if logged_at is None:
                continue
            day = logged_at.date()
            agg = by_day.setdefault(day, {"calories": 0, "protein_g": 0.0})
            agg["calories"] += entry.calories
            agg["protein_g"] += entry.protein_g or 0.0
        if not by_day:
            return None
        return {
            "period": label,
            "logged_days": len(by_day),
            "entries": len(period_entries),
            "avg_logged_day_calories": round(
                sum(day["calories"] for day in by_day.values()) / len(by_day)
            ),
            "avg_logged_day_protein_g": round(
                sum(day["protein_g"] for day in by_day.values()) / len(by_day), 1
            ),
        }

    periods = []
    for days, label in ((7, "7d"), (28, "28d"), (90, "90d"), (365, "365d")):
        summary = summarize(_window(entries, days, "logged_at"), label)
        if summary:
            periods.append(summary)
    if all_time_summary:
        periods.append({"period": "all_time", **all_time_summary})

    today_entries = [
        entry for entry in entries
        if _as_utc(entry.logged_at)
        and _as_utc(entry.logged_at).date() == datetime.now(timezone.utc).date()
    ]
    today = {
        "entries": len(today_entries),
        "calories": sum(entry.calories for entry in today_entries),
        "protein_g": round(sum(entry.protein_g or 0.0 for entry in today_entries), 1),
    }
    return "NUTRITION TRENDS:\n" + json.dumps(
        {"periods": periods, "today": today}, default=str
    )


def _summarize_workouts(
    workouts: List[WorkoutHistory], all_time_completed: int = 0
) -> Optional[str]:
    if not workouts and not all_time_completed:
        return None

    def summarize(period_workouts: List[WorkoutHistory], label: str) -> Optional[dict]:
        completed = [w for w in period_workouts if w.status == "completed"]
        if not completed:
            return None
        exercise_count = 0
        completed_sets = 0
        volume = 0.0
        for workout in completed:
            for item in workout.exercises or []:
                exercise_count += 1
                for set_data in item.get("sets", []) if isinstance(item, dict) else []:
                    if not set_data.get("completed"):
                        continue
                    completed_sets += 1
                    weight = float(set_data.get("weight") or 0)
                    reps = float(set_data.get("reps") or 0)
                    volume += weight * reps
        return {
            "period": label,
            "completed_workouts": len(completed),
            "exercise_entries": exercise_count,
            "completed_sets": completed_sets,
            "logged_volume": round(volume, 1),
        }

    periods = []
    for days, label in ((28, "28d"), (90, "90d"), (365, "365d")):
        summary = summarize(_window(workouts, days, "start_time"), label)
        if summary:
            periods.append(summary)
    if all_time_completed:
        periods.append(
            {"period": "all_time", "completed_workouts": all_time_completed}
        )
    return "TRAINING TRENDS:\n" + json.dumps({"periods": periods}, default=str)


def _summarize_weight(entries: List[WeightHistory]) -> Optional[str]:
    if not entries:
        return None
    ordered = sorted(
        (entry for entry in entries if entry.recorded_at),
        key=lambda entry: _as_utc(entry.recorded_at),
    )
    if not ordered:
        return None
    latest = ordered[-1]
    changes = {}
    for days in (28, 90, 365):
        candidates = _window(ordered, days, "recorded_at")
        if candidates:
            changes[f"{days}d"] = round(latest.weight - candidates[0].weight, 1)
    changes["all_time"] = round(latest.weight - ordered[0].weight, 1)
    return "WEIGHT TREND:\n" + json.dumps(
        {
            "latest": latest.weight,
            "entries": len(ordered),
            "change": changes,
        }
    )


def _validate_workout_plan(raw: dict, catalog: dict[str, dict]) -> Optional[dict]:
    if not isinstance(raw, dict) or not isinstance(raw.get("exercises"), list):
        return None
    exercises = []
    for item in raw["exercises"][:12]:
        if not isinstance(item, dict):
            continue
        exercise_id = str(item.get("exercise_id") or "")
        exercise = catalog.get(exercise_id)
        if not exercise:
            continue
        sets = max(1, min(int(item.get("sets") or 3), 8))
        reps = max(0, min(int(item.get("reps") or 0), 100))
        duration = max(0, min(int(item.get("duration_seconds") or 0), 1800))
        rest = max(15, min(int(item.get("rest_seconds") or 60), 600))
        exercises.append(
            {
                "exercise_id": exercise_id,
                "name": exercise.get("name") or exercise_id,
                "sets": sets,
                "reps": reps,
                "duration_seconds": duration,
                "rest_seconds": rest,
                "notes": str(item.get("notes") or "")[:240],
            }
        )
    if not exercises:
        return None
    return {
        "name": str(raw.get("name") or "Coach Workout")[:80],
        "rationale": str(raw.get("rationale") or "")[:500],
        "exercises": exercises,
    }


PROPOSE_WORKOUT_TOOL = {
    "name": "propose_workout",
    "description": "Propose a reviewable workout made only from available app exercise ids.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "rationale": {"type": "string"},
            "exercises": {
                "type": "array",
                "minItems": 1,
                "maxItems": 12,
                "items": {
                    "type": "object",
                    "properties": {
                        "exercise_id": {"type": "string"},
                        "sets": {"type": "integer"},
                        "reps": {"type": "integer"},
                        "duration_seconds": {"type": "integer"},
                        "rest_seconds": {"type": "integer"},
                        "notes": {"type": "string"},
                    },
                    "required": ["exercise_id", "sets", "rest_seconds"],
                },
            },
        },
        "required": ["name", "rationale", "exercises"],
    },
}


def _build_user_context(
    user: User,
    stats: Optional[UserStats],
    workouts: List[WorkoutHistory],
    workout_context: Optional[dict],
    nutrition_summary: Optional[str] = None,
    workout_summary: Optional[str] = None,
    weight_summary: Optional[str] = None,
    assessments: Optional[List[Assessment]] = None,
    templates: Optional[List[CustomTemplate]] = None,
    custom_exercises: Optional[List[CustomExercise]] = None,
    app_context: Optional[dict] = None,
) -> str:
    """Assemble the dynamic (block 1) context string from the user's data."""
    parts: List[str] = []

    # Experience level calibrates response depth (see EXPERIENCE CALIBRATION
    # in the system prompt). The column is backfilled by migration 0006, but
    # fall back to intermediate defensively — NULL is still representable.
    parts.append(
        "EXPERIENCE LEVEL: "
        + (getattr(user, "experience_level", None) or "intermediate")
    )
    parts.append(
        "APP PROFILE & PREFERENCES:\n"
        + json.dumps(
            {
                "name": user.name,
                "units": user.units,
                "default_rest_seconds": user.default_rest_time,
                "default_work_seconds": user.default_work_time,
            },
            default=str,
        )
    )

    if stats is not None:
        stats_dict = {
            "age": stats.age,
            "height": stats.height,
            "current_weight": stats.current_weight,
            "target_weight": stats.target_weight,
            "goal": stats.goal,
            "motivation": stats.motivation,
            "body_fat": stats.body_fat,
            "muscle_mass": stats.muscle_mass,
            "bone_density": stats.bone_density,
        }
        # Drop empty fields so the model isn't told "age: null".
        stats_dict = {k: v for k, v in stats_dict.items() if v}
        if stats_dict:
            parts.append(
                "USER STATS & GOALS:\n" + json.dumps(stats_dict, default=str)
            )

    if workouts:
        recent = [
            {
                "name": w.name,
                "start_time": w.start_time.isoformat() if w.start_time else None,
                "status": w.status,
                "exercises": w.exercises,
                "recommendations": w.recommendations,
            }
            for w in workouts
        ]
        parts.append(
            "RECENT WORKOUT HISTORY (last 10, newest first):\n"
            + json.dumps(recent, default=str)
        )

    if workout_context:
        parts.append(
            "CURRENT WORKOUT CONTEXT (active session):\n"
            + json.dumps(workout_context, default=str)
        )

    # Nutrition summary line (S19) — omitted entirely when the user has no
    # food_log rows, same drop-empty-fields discipline as the stats dict.
    if nutrition_summary:
        parts.append(nutrition_summary)

    if workout_summary:
        parts.append(workout_summary)

    if weight_summary:
        parts.append(weight_summary)

    if assessments:
        parts.append(
            "RECENT ASSESSMENTS:\n"
            + json.dumps([a.assessment_data for a in assessments[:3]], default=str)
        )

    if templates:
        parts.append(
            "CUSTOM TEMPLATES:\n"
            + json.dumps(
                [{"name": t.name, "exercise_count": len((t.template_data or {}).get("exercises", []))}
                 for t in templates[:20]],
                default=str,
            )
        )

    if custom_exercises:
        parts.append(
            "CUSTOM EXERCISES:\n"
            + json.dumps(
                [(e.exercise_data or {}).get("name") for e in custom_exercises[:30]],
                default=str,
            )
        )

    if app_context:
        parts.append("CURRENT APP CONTEXT:\n" + json.dumps(app_context, default=str))

    # The experience line is always present, so "no data" now means
    # exactly one part — keep telling the model when history/stats are empty.
    if len(parts) == 1:
        parts.append("No stored stats or workout history yet for this user.")
    return "\n\n".join(parts)


@router.post("/chat")
async def coach_chat(
    payload: CoachChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    # Cost guardrail: cap AI-coach calls per user before any Anthropic work.
    # (Also covers the deprecated /chat/stream alias, which delegates here.)
    await rate_limit("coach", COACH_LIMIT, COACH_WINDOW, current_user)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI coach is not configured (missing ANTHROPIC_API_KEY).",
        )

    message_text = (payload.message or "").strip()
    images = list(payload.images)
    _validate_images(images)
    if not message_text and not images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add a message or at least one image.",
        )
    persisted_message = message_text or f"Shared {len(images)} equipment photo{'s' if len(images) != 1 else ''}."

    app_context = payload.app_context or None
    if app_context and len(json.dumps(app_context, default=str)) > MAX_APP_CONTEXT_CHARS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Coach app context is too large.",
        )

    # 1. Persist the user's message so it's part of the replayed history.
    user_message = CoachMessage(
        user_id=current_user.id, role="user", content=persisted_message
    )
    db.add(user_message)
    await db.commit()

    # 2. Replay the last 10 turns (oldest first) — includes the message above.
    result = await db.execute(
        select(CoachMessage)
        .where(CoachMessage.user_id == current_user.id)
        .order_by(CoachMessage.created_at.desc())
        .limit(10)
    )
    recent = list(reversed(result.scalars().all()))
    conversation = []
    for item in recent:
        content = item.content
        if item.id == user_message.id and images:
            content = [
                *[
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": image.media_type,
                            "data": image.image,
                        },
                    }
                    for image in images
                ],
                {"type": "text", "text": message_text or (
                    "Inspect these equipment photos together. Identify what is visibly "
                    "available, mention uncertainty, and ask what muscle groups or goal "
                    "I want to train next."
                )},
            ]
        conversation.append({"role": item.role, "content": content})
    # The Anthropic API requires the first message to be from the user and
    # roles to alternate. Trim any leading assistant turns the window caught.
    while conversation and conversation[0]["role"] != "user":
        conversation.pop(0)
    if not conversation:
        conversation = [{"role": "user", "content": persisted_message}]

    # 3. Pull durable history for compact long-term summaries. Only the newest
    # 10 workouts are included in detail; older rows feed aggregate trends.
    year_cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    wk_result = await db.execute(
        select(WorkoutHistory)
        .where(
            WorkoutHistory.user_id == current_user.id,
            WorkoutHistory.created_at >= year_cutoff,
        )
        .order_by(WorkoutHistory.created_at.desc())
    )
    year_workouts = list(wk_result.scalars().all())
    workouts = year_workouts[:10]
    all_time_completed = int(
        await db.scalar(
            select(func.count())
            .select_from(WorkoutHistory)
            .where(
                WorkoutHistory.user_id == current_user.id,
                WorkoutHistory.status == "completed",
            )
        )
        or 0
    )
    stats = (
        await db.execute(
            select(UserStats)
            .where(UserStats.user_id == current_user.id)
            .order_by(UserStats.updated_at.desc())
        )
    ).scalars().first()

    # Food and weight rows remain durable; send compact period summaries rather
    # than every raw row to the model.
    food_result = await db.execute(
        select(FoodLog).where(
            FoodLog.user_id == current_user.id,
            FoodLog.logged_at >= year_cutoff,
        )
    )
    year_food = list(food_result.scalars().all())
    food_day = func.date(FoodLog.logged_at).label("day")
    daily_food = (
        select(
            food_day,
            func.sum(FoodLog.calories).label("calories"),
            func.sum(func.coalesce(FoodLog.protein_g, 0.0)).label("protein_g"),
            func.count().label("entries"),
        )
        .where(FoodLog.user_id == current_user.id)
        .group_by(food_day)
        .subquery()
    )
    all_time_food_row = (
        await db.execute(
            select(
                func.count(daily_food.c.day),
                func.sum(daily_food.c.entries),
                func.avg(daily_food.c.calories),
                func.avg(daily_food.c.protein_g),
            )
        )
    ).one()
    all_time_food = None
    if all_time_food_row[0]:
        all_time_food = {
            "logged_days": int(all_time_food_row[0]),
            "entries": int(all_time_food_row[1] or 0),
            "avg_logged_day_calories": round(float(all_time_food_row[2] or 0)),
            "avg_logged_day_protein_g": round(float(all_time_food_row[3] or 0), 1),
        }
    nutrition_summary = _summarize_nutrition(year_food, all_time_food)
    weight_rows = list(
        (
            await db.execute(
                select(WeightHistory)
                .where(WeightHistory.user_id == current_user.id)
                .order_by(WeightHistory.recorded_at.asc())
            )
        ).scalars().all()
    )
    assessments = list(
        (
            await db.execute(
                select(Assessment)
                .where(Assessment.user_id == current_user.id)
                .order_by(Assessment.created_at.desc())
                .limit(3)
            )
        ).scalars().all()
    )
    templates = list(
        (
            await db.execute(
                select(CustomTemplate)
                .where(CustomTemplate.user_id == current_user.id)
                .order_by(CustomTemplate.created_at.desc())
                .limit(20)
            )
        ).scalars().all()
    )
    custom_exercises = list(
        (
            await db.execute(
                select(CustomExercise)
                .where(CustomExercise.user_id == current_user.id)
                .order_by(CustomExercise.created_at.desc())
                .limit(30)
            )
        ).scalars().all()
    )

    user_context = _build_user_context(
        current_user,
        stats,
        workouts,
        payload.workout_context,
        nutrition_summary,
        _summarize_workouts(year_workouts, all_time_completed),
        _summarize_weight(weight_rows),
        assessments,
        templates,
        custom_exercises,
        app_context,
    )

    catalog = {
        str(item.get("id")): item
        for item in (app_context or {}).get("available_exercises", [])
        if isinstance(item, dict) and item.get("id")
    }

    # 4. Select the requested coach voice (fall back to "apex"), then build the
    #    system prompt. The static coaching instructions and the persona voice
    #    are each prompt-cached; the per-request user context stays dynamic.
    #    Keeping the big knowledge block separate from the persona lets it stay
    #    cached across every personality.
    personality = payload.personality or "apex"
    persona_prompt = PERSONALITY_PROMPTS.get(personality, PERSONALITY_PROMPTS["apex"])
    system_blocks = [
        {
            "type": "text",
            "text": COACH_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": persona_prompt,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": user_context,
        },
    ]

    client = AsyncAnthropic(api_key=api_key)
    user_id = current_user.id

    async def event_stream():
        full_text = ""
        tool_buffers: dict[int, dict] = {}
        workout_plan = None
        try:
            stream = await client.messages.create(
                model=COACH_MODEL,
                max_tokens=MAX_TOKENS,
                system=system_blocks,
                messages=conversation,
                tools=[PROPOSE_WORKOUT_TOOL],
                stream=True,
            )
            async for event in stream:
                if event.type == "content_block_start":
                    block = getattr(event, "content_block", None)
                    if getattr(block, "type", None) == "tool_use":
                        tool_buffers[event.index] = {
                            "name": getattr(block, "name", ""),
                            "json": "",
                        }
                if (
                    event.type == "content_block_delta"
                    and getattr(event.delta, "type", None) == "text_delta"
                ):
                    chunk = event.delta.text
                    full_text += chunk
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
                elif (
                    event.type == "content_block_delta"
                    and getattr(event.delta, "type", None) == "input_json_delta"
                    and event.index in tool_buffers
                ):
                    tool_buffers[event.index]["json"] += event.delta.partial_json

            for buffer in tool_buffers.values():
                if buffer["name"] != "propose_workout":
                    continue
                try:
                    raw_plan = json.loads(buffer["json"] or "{}")
                except json.JSONDecodeError:
                    continue
                workout_plan = _validate_workout_plan(raw_plan, catalog)
                if workout_plan:
                    yield f"data: {json.dumps({'type': 'workout_plan', 'plan': workout_plan})}\n\n"
                    break
        except Exception as err:  # noqa: BLE001 — surface to client, never 500 mid-stream
            yield f"data: {json.dumps({'type': 'error', 'content': str(err)})}\n\n"

        # 5. Persist the assembled assistant reply (best-effort, non-fatal).
        persisted_text = full_text.strip()
        if not persisted_text and workout_plan:
            persisted_text = f"I prepared {workout_plan['name']} for your review."
        if persisted_text:
            try:
                db.add(
                    CoachMessage(
                        user_id=user_id, role="assistant", content=persisted_text
                    )
                )
                await db.commit()
            except Exception:  # noqa: BLE001
                await db.rollback()

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable proxy buffering so chunks flush
        },
    )


@router.post("/equipment/analyze", response_model=EquipmentAnalyzeResponse)
async def analyze_equipment(
    payload: EquipmentAnalyzeRequest,
    current_user: User = Depends(get_current_user),
) -> EquipmentAnalyzeResponse:
    await rate_limit("coach-equipment", COACH_LIMIT, COACH_WINDOW, current_user)
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Equipment analysis is not configured.",
        )
    images = _request_images(payload)
    if not images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add at least one equipment image.",
        )
    _validate_images(images)

    prompt = f"""Inspect all {len(images)} workout-area photo(s) together and identify
visible usable equipment across the full set. Deduplicate items that appear in
more than one angle.
Return ONLY JSON with this shape:
{{"equipment": [<values>], "notes": "<brief uncertainty or useful detail>",
"confidence": "low" | "medium" | "high"}}
Allowed values: {json.dumps(CANONICAL_EQUIPMENT)}.
Use only allowed values. Add "None" because bodyweight movements are always
available. Do not infer equipment hidden outside the image."""
    try:
        response = await AsyncAnthropic(api_key=api_key).messages.create(
            model=COACH_MODEL,
            max_tokens=500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        *[
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": image.media_type,
                                    "data": image.image,
                                },
                            }
                            for image in images
                        ],
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        text_content = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        data = json.loads(text_content.strip().removeprefix("```json").removesuffix("```").strip())
    except Exception as err:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Equipment analysis failed: {err}",
        ) from err

    allowed = set(CANONICAL_EQUIPMENT)
    equipment = [item for item in data.get("equipment", []) if item in allowed]
    if "None" not in equipment:
        equipment.append("None")
    confidence = data.get("confidence")
    if confidence not in {"low", "medium", "high"}:
        confidence = "low"
    return EquipmentAnalyzeResponse(
        equipment=list(dict.fromkeys(equipment)),
        notes=str(data.get("notes") or "")[:400] or None,
        confidence=confidence,
    )


@router.post("/chat/stream", deprecated=True)
async def coach_chat_stream(
    payload: CoachChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Deprecated alias for ``POST /api/coach/chat``.

    The two coach endpoints were merged: /chat now streams over SSE and accepts
    the ``personality`` field, so this route simply delegates to it. Kept so any
    client still posting to /chat/stream keeps working; drop it once none do.
    """
    return await coach_chat(payload, current_user, db)


@router.get("/history", response_model=List[CoachMessageResponse])
async def coach_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[CoachMessageResponse]:
    result = await db.execute(
        select(CoachMessage)
        .where(CoachMessage.user_id == current_user.id)
        .order_by(CoachMessage.created_at.desc())
        .limit(20)
    )
    messages = list(reversed(result.scalars().all()))
    return [CoachMessageResponse.model_validate(m) for m in messages]
