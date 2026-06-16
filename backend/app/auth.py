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
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: str, expires_delta: Optional[timedelta] = None
) -> str:
    """Build a signed JWT whose ``sub`` claim is the user id."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode = {"sub": str(subject), "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


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
