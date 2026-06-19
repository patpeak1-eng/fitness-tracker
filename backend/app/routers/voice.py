"""Voice routes: synthesize coach text to speech via ElevenLabs.

Markdown is stripped before synthesis so the model's formatting characters
(*, #, _, `) aren't read aloud. The audio is returned base64-encoded so the
frontend can play it without a second round-trip.
"""
import asyncio
import base64
import inspect
import json
import os
import re
from typing import Optional
from uuid import UUID

import httpx
import websockets
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import ALGORITHM, SECRET_KEY, get_current_user
from app.database import get_db
from app.models import User
from app.rate_limit import VOICE_LIMIT, VOICE_WINDOW, enforce_rate_limit, rate_limit

router = APIRouter(prefix="/api/voice", tags=["voice"])

DEFAULT_VOICE_ID = "FxZjRiAEBESrb7srpme7"
ELEVENLABS_MODEL = "eleven_flash_v2_5"
ELEVENLABS_STREAM_MODEL = "eleven_flash_v2_5"
# After the client signals end-of-input we let ElevenLabs flush its final audio,
# but never wait forever for it to close the socket.
AUDIO_DRAIN_TIMEOUT = 30.0


class VoiceSynthesizeRequest(BaseModel):
    text: str = Field(..., max_length=2000)
    voice_id: Optional[str] = DEFAULT_VOICE_ID


@router.post("/coach-synthesize")
async def coach_synthesize(
    payload: VoiceSynthesizeRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    # Cost guardrail: cap per-user synthesis calls (ElevenLabs bills per char).
    await rate_limit("voice_synth", VOICE_LIMIT, VOICE_WINDOW, current_user)

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


async def _authenticate_ws(
    websocket: WebSocket, db: AsyncSession
) -> Optional[User]:
    """Resolve the user for a websocket handshake, or None if unauthenticated.

    WebSockets can't carry an ``Authorization`` header from the browser, so this
    mirrors the HTTP ``get_current_user`` contract over the two transports a WS
    client can use: the HttpOnly ``session_token`` cookie (Google OAuth users)
    or a ``?token=`` query param (email/password users holding the JWT in
    localStorage). Both carry the same signed JWT.
    """
    token = (
        websocket.query_params.get("token")
        or websocket.cookies.get("session_token")
    )
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        user_uuid = UUID(str(user_id))
    except (JWTError, ValueError, TypeError):
        return None
    result = await db.execute(select(User).where(User.id == user_uuid))
    return result.scalar_one_or_none()


def _ws_connect(uri: str, headers: dict):
    """Open an ElevenLabs websocket, tolerant of the websockets API rename.

    websockets >= 14 renamed the client header kwarg from ``extra_headers`` to
    ``additional_headers`` on its asyncio implementation. Pick whichever the
    installed version's ``connect`` actually accepts so this works on the range
    pinned in requirements (>= 12.0).
    """
    try:
        params = inspect.signature(websockets.connect).parameters
    except (TypeError, ValueError):
        params = {}
    if "additional_headers" in params:
        return websockets.connect(uri, additional_headers=headers)
    return websockets.connect(uri, extra_headers=headers)


@router.websocket("/stream")
async def voice_stream_ws(
    websocket: WebSocket,
    voice_id: str = DEFAULT_VOICE_ID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Bridge the browser to ElevenLabs' streaming-input TTS websocket.

    The client sends ``{"type":"text","content":...,"flush":bool}`` frames as
    coach tokens arrive and a final ``{"type":"end"}``; we relay them to
    ElevenLabs and pipe the returned MP3 audio chunks straight back as binary
    websocket frames. Mounted at ``/api/voice/stream`` (router prefix +
    ``/stream``). Requires the same auth as every other route — via the
    ``session_token`` cookie or a ``?token=`` query param.
    """
    await websocket.accept()

    # Authenticate before proxying any paid ElevenLabs traffic.
    user = await _authenticate_ws(websocket, db)
    if user is None:
        await websocket.close(code=1008)  # 1008 = policy violation
        return

    # Cost guardrail: cap new stream connections per user. Can't raise
    # HTTPException over a WebSocket, so close with 1008 on the imperative check.
    allowed, _retry_after = await enforce_rate_limit(
        "voice_stream", VOICE_LIMIT, VOICE_WINDOW, user
    )
    if not allowed:
        await websocket.close(code=1008)
        return

    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        await websocket.send_text(
            json.dumps(
                {"type": "error", "content": "ELEVENLABS_API_KEY not configured"}
            )
        )
        await websocket.close(code=1011)
        return

    uri = (
        f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"
        f"?model_id={ELEVENLABS_STREAM_MODEL}&output_format=mp3_44100_128"
    )
    headers = {"xi-api-key": api_key}

    try:
        async with _ws_connect(uri, headers) as el_ws:
            # ElevenLabs requires an initial frame establishing voice settings.
            await el_ws.send(
                json.dumps(
                    {
                        "text": " ",
                        "voice_settings": {
                            "stability": 0.5,
                            "similarity_boost": 0.75,
                        },
                        "xi_api_key": api_key,
                    }
                )
            )

            async def forward_text():
                try:
                    async for message in websocket.iter_text():
                        data = json.loads(message)
                        if data.get("type") == "text":
                            content = data.get("content", "")
                            # Per-frame cap: an oversized frame is abuse — close.
                            if len(content) > 1000:
                                await websocket.close(code=1008)
                                return
                            await el_ws.send(
                                json.dumps(
                                    {
                                        "text": content,
                                        "flush": data.get("flush", False),
                                    }
                                )
                            )
                        elif data.get("type") == "end":
                            # Empty text signals end-of-stream to ElevenLabs.
                            await el_ws.send(json.dumps({"text": ""}))
                            return
                except WebSocketDisconnect:
                    # Client vanished mid-utterance — tell ElevenLabs to stop
                    # generating so it doesn't keep the upstream socket (and our
                    # credits) open, then re-raise to unwind the session.
                    try:
                        await el_ws.send(json.dumps({"text": ""}))
                    except Exception:  # noqa: BLE001
                        pass
                    raise

            async def forward_audio():
                async for message in el_ws:
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        parsed = json.loads(message)
                        if parsed.get("audio"):
                            await websocket.send_bytes(
                                base64.b64decode(parsed["audio"])
                            )

            # Run both directions as tasks. The text task ends when the client
            # sends {"type":"end"} (or disconnects); the audio task then drains
            # ElevenLabs' final frames under a bounded timeout so a slow or
            # never-closing upstream can't hang the connection. Whatever the
            # exit path, both tasks are cancelled and awaited so none is leaked.
            text_task = asyncio.create_task(forward_text())
            audio_task = asyncio.create_task(forward_audio())
            try:
                await asyncio.wait(
                    {text_task, audio_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if text_task.done():
                    # Re-raise a client disconnect; returns None on clean EOS.
                    text_task.result()
                    # Text side finished cleanly — drain ElevenLabs' final
                    # audio under a cap (wait_for cancels the task on timeout).
                    if not audio_task.done():
                        try:
                            await asyncio.wait_for(
                                audio_task, timeout=AUDIO_DRAIN_TIMEOUT
                            )
                        except Exception:  # noqa: BLE001
                            pass
                # else: audio side ended/errored first → fall to cleanup.
            finally:
                for task in (text_task, audio_task):
                    if not task.done():
                        task.cancel()
                await asyncio.gather(
                    text_task, audio_task, return_exceptions=True
                )
    except WebSocketDisconnect:
        # Browser hung up — nothing more to do.
        pass
    except Exception as err:  # noqa: BLE001 — report then close cleanly
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "content": str(err)})
            )
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass
