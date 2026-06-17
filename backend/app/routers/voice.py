"""Voice routes: synthesize coach text to speech via ElevenLabs.

Markdown is stripped before synthesis so the model's formatting characters
(*, #, _, `) aren't read aloud. The audio is returned base64-encoded so the
frontend can play it without a second round-trip.
"""
import base64
import os
import re
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/voice", tags=["voice"])

DEFAULT_VOICE_ID = "FxZjRiAEBESrb7srpme7"
ELEVENLABS_MODEL = "eleven_turbo_v2"


class VoiceSynthesizeRequest(BaseModel):
    text: str
    voice_id: Optional[str] = DEFAULT_VOICE_ID


@router.post("/coach-synthesize")
async def coach_synthesize(
    payload: VoiceSynthesizeRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice synthesis is not configured (missing ELEVENLABS_API_KEY).",
        )

    # Strip markdown so formatting characters aren't vocalized.
    text = re.sub(r"[*#_`]", "", payload.text).strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No text to synthesize.",
        )

    voice_id = payload.voice_id or DEFAULT_VOICE_ID
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {"xi-api-key": api_key, "Content-Type": "application/json"}
    body = {"text": text, "model_id": ELEVENLABS_MODEL}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=body)
    except httpx.RequestError as err:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Voice synthesis request failed: {err}",
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ElevenLabs error ({resp.status_code}): {resp.text[:200]}",
        )

    audio_base64 = base64.b64encode(resp.content).decode()
    return {"audio_base64": audio_base64}
