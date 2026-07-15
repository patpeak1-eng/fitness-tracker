"""In-process per-user rate limiting for cost-sensitive endpoints.

A pure-Python sliding-window limiter — no extra dependencies. Limits are keyed
by authenticated user id where available, falling back to a caller-supplied key
(e.g. client IP for the pre-auth login/register routes).

Storage is in-memory per process, which is correct for the current single-worker
deployment. If the backend is scaled to multiple uvicorn workers or replicas,
move the window store to a shared backend (e.g. Redis) so limits are enforced
globally rather than per process.
"""
import asyncio
import time

from fastapi import HTTPException


class RateLimiter:
    def __init__(self) -> None:
        self._windows: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    async def check(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Record a hit for ``key`` and report whether it's within the limit.

        Returns ``(allowed, retry_after_seconds)``. When denied, ``retry_after``
        is the whole seconds until the oldest hit ages out of the window.
        """
        async with self._lock:
            now = time.time()
            cutoff = now - window_seconds
            hits = [t for t in self._windows.get(key, []) if t > cutoff]
            if len(hits) >= limit:
                retry_after = int(hits[0] - cutoff) + 1
                self._windows[key] = hits
                return False, retry_after
            hits.append(now)
            self._windows[key] = hits
            return True, 0


_limiter = RateLimiter()


# Per-endpoint limits (named for easy tuning).
COACH_LIMIT = 20       # requests per window
COACH_WINDOW = 60      # seconds
VOICE_LIMIT = 30
VOICE_WINDOW = 60
LOGIN_LIMIT = 10
LOGIN_WINDOW = 60
REGISTER_LIMIT = 5
REGISTER_WINDOW = 60
NUTRITION_ANALYZE_LIMIT = 10   # per-user Claude Vision calls (cost guardrail)
NUTRITION_ANALYZE_WINDOW = 60
OFF_OUTBOUND_LIMIT = 10        # GLOBAL outbound Open Food Facts calls —
OFF_OUTBOUND_WINDOW = 60       # headroom under OFF's 15 req/min/IP read limit


def _scoped_key(key: str, current_user) -> str:
    """Prefix the key with the user id for per-user limiting; for pre-auth
    routes (no user) the caller-supplied key (e.g. an IP) is used as-is."""
    return f"{current_user.id}:{key}" if current_user is not None else key


async def rate_limit(key: str, limit: int, window: int, current_user=None) -> None:
    """Raise HTTP 429 if the key exceeds ``limit`` requests per ``window``
    seconds. For HTTP endpoints."""
    allowed, retry_after = await _limiter.check(_scoped_key(key, current_user), limit, window)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )


async def enforce_rate_limit(key: str, limit: int, window: int, current_user=None) -> tuple[bool, int]:
    """Imperative variant for contexts that can't raise HTTPException (e.g.
    WebSocket handlers, which must close the socket instead). Returns
    ``(allowed, retry_after_seconds)``."""
    return await _limiter.check(_scoped_key(key, current_user), limit, window)
