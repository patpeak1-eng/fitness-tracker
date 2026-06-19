"""AI coach routes: a streaming chat endpoint plus message history.

The chat endpoint persists the user's message, replays recent turns to the
model, streams the assistant reply back over SSE, and persists the assembled
reply once the stream completes. The system prompt is split into two blocks so
the large, static coaching instructions (block 0) can be prompt-cached while
the per-request user context (block 1) stays dynamic.
"""
import json
import os
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import CoachMessage, User, UserStats, WorkoutHistory

router = APIRouter(prefix="/api/coach", tags=["coach"])

COACH_MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1024

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
- User's recent workout history (last 10 workouts)
- Current active workout if in session
- User stats and goals from their profile

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


class CoachChatRequest(BaseModel):
    message: str
    workout_context: Optional[dict] = None


class CoachStreamRequest(BaseModel):
    message: str
    workout_context: Optional[dict] = None
    personality: Optional[str] = "apex"


class CoachMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: str
    content: str
    created_at: Optional[datetime] = None


def _build_user_context(
    stats: Optional[UserStats],
    workouts: List[WorkoutHistory],
    workout_context: Optional[dict],
) -> str:
    """Assemble the dynamic (block 1) context string from the user's data."""
    parts: List[str] = []

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

    if not parts:
        return "No stored stats or workout history yet for this user."
    return "\n\n".join(parts)


def _build_user_context_dict(
    stats: Optional[UserStats],
    workouts: List[WorkoutHistory],
    workout_context: Optional[dict],
) -> dict:
    """JSON-serializable variant of the user context for the stream endpoint."""
    ctx: dict = {}

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
        stats_dict = {k: v for k, v in stats_dict.items() if v}
        if stats_dict:
            ctx["stats"] = stats_dict

    if workouts:
        ctx["recent_workouts"] = [
            {
                "name": w.name,
                "start_time": w.start_time.isoformat() if w.start_time else None,
                "status": w.status,
                "exercises": w.exercises,
                "recommendations": w.recommendations,
            }
            for w in workouts
        ]

    if workout_context:
        ctx["workout_context"] = workout_context

    return ctx


@router.post("/chat")
async def coach_chat(
    payload: CoachChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI coach is not configured (missing ANTHROPIC_API_KEY).",
        )

    message_text = (payload.message or "").strip()
    if not message_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message must not be empty.",
        )

    # 1. Persist the user's message so it's part of the replayed history.
    db.add(CoachMessage(user_id=current_user.id, role="user", content=message_text))
    await db.commit()

    # 2. Replay the last 10 turns (oldest first) — includes the message above.
    result = await db.execute(
        select(CoachMessage)
        .where(CoachMessage.user_id == current_user.id)
        .order_by(CoachMessage.created_at.desc())
        .limit(10)
    )
    recent = list(reversed(result.scalars().all()))
    conversation = [{"role": m.role, "content": m.content} for m in recent]
    # The Anthropic API requires the first message to be from the user and
    # roles to alternate. Trim any leading assistant turns the window caught.
    while conversation and conversation[0]["role"] != "user":
        conversation.pop(0)
    if not conversation:
        conversation = [{"role": "user", "content": message_text}]

    # 3. Pull the last 10 workouts and stats for the dynamic context block.
    wk_result = await db.execute(
        select(WorkoutHistory)
        .where(WorkoutHistory.user_id == current_user.id)
        .order_by(WorkoutHistory.created_at.desc())
        .limit(10)
    )
    workouts = wk_result.scalars().all()
    stats = (
        await db.execute(
            select(UserStats)
            .where(UserStats.user_id == current_user.id)
            .order_by(UserStats.updated_at.desc())
        )
    ).scalars().first()

    user_context = _build_user_context(stats, workouts, payload.workout_context)

    # 4. Two-block system prompt: block 0 cached, block 1 dynamic.
    system_blocks = [
        {
            "type": "text",
            "text": COACH_SYSTEM_PROMPT,
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
        try:
            stream = await client.messages.create(
                model=COACH_MODEL,
                max_tokens=MAX_TOKENS,
                system=system_blocks,
                messages=conversation,
                stream=True,
            )
            async for event in stream:
                if (
                    event.type == "content_block_delta"
                    and getattr(event.delta, "type", None) == "text_delta"
                ):
                    chunk = event.delta.text
                    full_text += chunk
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
        except Exception as err:  # noqa: BLE001 — surface to client, never 500 mid-stream
            yield f"data: {json.dumps({'type': 'error', 'content': str(err)})}\n\n"

        # 5. Persist the assembled assistant reply (best-effort, non-fatal).
        if full_text.strip():
            try:
                db.add(
                    CoachMessage(
                        user_id=user_id, role="assistant", content=full_text
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


@router.post("/chat/stream")
async def coach_chat_stream(
    payload: CoachStreamRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Personality-aware SSE chat.

    Mirrors /chat but selects the system prompt from PERSONALITY_PROMPTS and
    conveys prior turns as a JSON "RECENT HISTORY" block in the system context
    (the current message is the only entry in ``messages``). Uses the Anthropic
    async streaming helper so we emit token text as it arrives.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI coach is not configured (missing ANTHROPIC_API_KEY).",
        )

    message_text = (payload.message or "").strip()
    if not message_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message must not be empty.",
        )

    # Last 10 prior coach turns (oldest first) for the RECENT HISTORY block.
    result = await db.execute(
        select(CoachMessage)
        .where(CoachMessage.user_id == current_user.id)
        .order_by(CoachMessage.created_at.desc())
        .limit(10)
    )
    recent_rows = list(reversed(result.scalars().all()))
    recent_messages = [{"role": m.role, "content": m.content} for m in recent_rows]

    # Last 10 workouts + stats → JSON-serializable user context.
    wk_result = await db.execute(
        select(WorkoutHistory)
        .where(WorkoutHistory.user_id == current_user.id)
        .order_by(WorkoutHistory.created_at.desc())
        .limit(10)
    )
    workouts = wk_result.scalars().all()
    stats = (
        await db.execute(
            select(UserStats)
            .where(UserStats.user_id == current_user.id)
            .order_by(UserStats.updated_at.desc())
        )
    ).scalars().first()
    user_context = _build_user_context_dict(stats, workouts, payload.workout_context)

    personality = payload.personality or "apex"
    system_prompt = PERSONALITY_PROMPTS.get(personality, PERSONALITY_PROMPTS["apex"])

    # The current turn is the only conversation message; history lives in block 1.
    messages = [{"role": "user", "content": message_text}]

    client = AsyncAnthropic(api_key=api_key)
    user_id = current_user.id

    async def generate():
        full_text = ""
        try:
            async with client.messages.stream(
                model=COACH_MODEL,
                max_tokens=1000,
                system=[
                    {
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {
                        "type": "text",
                        "text": (
                            f"USER CONTEXT:\n{json.dumps(user_context, default=str)}"
                            f"\n\nRECENT HISTORY:\n"
                            f"{json.dumps(recent_messages, default=str)}"
                        ),
                    },
                ],
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    full_text += text
                    yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
        except Exception as err:  # noqa: BLE001 — surface to client, never 500 mid-stream
            yield f"data: {json.dumps({'type': 'error', 'content': str(err)})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

        # Persist the turn after streaming completes (best-effort, non-fatal).
        try:
            db.add(CoachMessage(user_id=user_id, role="user", content=message_text))
            if full_text.strip():
                db.add(
                    CoachMessage(
                        user_id=user_id, role="assistant", content=full_text
                    )
                )
            await db.commit()
        except Exception:  # noqa: BLE001
            await db.rollback()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # CRITICAL for Railway/nginx — no buffering
        },
    )


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
