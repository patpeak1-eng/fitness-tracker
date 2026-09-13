"""Password hashing, JWT creation, and the auth dependency."""
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User

load_dotenv()

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # No key configured. Generate an ephemeral, unguessable one so the app and
    # tooling still boot locally. It is per-process (not shared across restarts
    # or workers), so production MUST set SECRET_KEY. Using a random value
    # instead of a hardcoded constant keeps any issued tokens unforgeable.
    SECRET_KEY = secrets.token_urlsafe(64)
    logger.warning(
        "SECRET_KEY is not set; generated an ephemeral key. "
        "Set SECRET_KEY in the environment for production deployments."
    )

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTPBearer extracts the "Authorization: Bearer <token>" header and powers the
# Swagger "Authorize" button. Applied as a dependency on every protected route.
# auto_error=False so a missing/malformed header yields None instead of a 403,
# letting get_current_user fall back to the HttpOnly session cookie below.
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a password, failing CLOSED on anything passlib cannot parse.

    Google accounts store the literal ``GOOGLE_OAUTH_SENTINEL`` in
    ``hashed_password`` — it satisfies the NOT NULL column and is not a hash.
    Handing it to passlib raises ``UnknownHashError``, which used to escape the
    login handler as a **500**: typing a password for a Google account returned
    a server error instead of "Invalid email or password". Every real account
    on this deployment is OAuth, so that was the common case, not the rare one.

    Fixed here rather than at each call site so ``login`` and ``delete_account``
    — the only two callers — are both covered, and so a future caller cannot
    reintroduce it by forgetting to special-case the sentinel.

    A stored value that is not a recognisable hash cannot match any password,
    so False is the correct answer as well as the safe one. Returning it early
    is measurably faster than a real bcrypt verify, which in principle lets an
    attacker distinguish OAuth-only accounts by timing; that is not a new leak,
    since the caller already short-circuits on an unknown email.
    """
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except UnknownHashError:
        return False


def create_access_token(
    subject: str, expires_delta: Optional[timedelta] = None
) -> str:
    """Build a signed JWT whose ``sub`` claim is the user id."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode = {"sub": str(subject), "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_token_expiry(token: str) -> Optional[datetime]:
    """Return a valid token's ``exp`` as an aware datetime, or None.

    Verifies the signature (and expiry) with the same parameters as
    get_current_user — an invalid or already-expired token yields None, so
    callers can never extend a token that would not authenticate.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    exp = payload.get("exp")
    if exp is None:
        return None
    return datetime.fromtimestamp(exp, tz=timezone.utc)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve and return the authenticated user, or raise 401.

    Accepts either auth mechanism: the ``Authorization: Bearer`` header
    (email/password users, who hold the JWT in localStorage) or the HttpOnly
    ``session_token`` cookie (Google OAuth users, whose JWT is never exposed to
    JS). The header takes precedence; the cookie is the fallback. Both carry the
    same signed JWT, so the decode/lookup below is identical for either source.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials if credentials else request.cookies.get("session_token")
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    try:
        user_uuid = UUID(str(user_id))
    except (ValueError, TypeError):
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user
