"""Authentication routes: register, login, and Google OAuth (all public)."""
import os
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.schemas import Token, UserLogin, UserRegister

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)) -> Token:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        name=payload.name,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # Lost a race against a concurrent registration with the same email;
        # the unique constraint on users.email is the source of truth.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    await db.refresh(user)

    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)


@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> Token:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)


# --------------------------------------------------------------------------- #
# Google OAuth
#
# Routes resolve to /api/auth/google and /api/auth/google/callback (the router
# prefix already contributes /api/auth). GOOGLE_REDIRECT_URI must equal the full
# public URL of the callback, e.g. https://<backend>/api/auth/google/callback,
# and be registered as an authorized redirect URI in the Google Cloud console.
# --------------------------------------------------------------------------- #
@router.get("/google")
async def google_login() -> RedirectResponse:
    """Redirect the user to Google's OAuth consent screen."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
    # Validate the full OAuth config up front so misconfiguration is caught
    # before the user is sent to Google (the secret is needed by the callback).
    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth is not configured",
        )

    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
    )
    return RedirectResponse(url=google_auth_url)


@router.get("/google/callback")
async def google_callback(
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle Google's OAuth callback: exchange the code for the user's profile,
    find or create the user, and redirect to the frontend with a JWT."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Google redirects here with ?error=... and no code when the user cancels
    # or denies consent; handle it gracefully instead of returning a 422.
    if error or not code:
        return RedirectResponse(
            url=f"{frontend_url}/login?error=google_auth_cancelled"
        )

    if not client_id or not client_secret or not redirect_uri:
        return RedirectResponse(
            url=f"{frontend_url}/login?error=google_not_configured"
        )

    # Exchange the authorization code for an access token.
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    token_data = token_response.json()

    google_access_token = token_data.get("access_token")
    if not google_access_token:
        return RedirectResponse(
            url=f"{frontend_url}/login?error=google_auth_failed"
        )

    # Fetch the user's profile from Google.
    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
    userinfo = userinfo_response.json()

    google_email = userinfo.get("email")
    if not google_email:
        return RedirectResponse(url=f"{frontend_url}/login?error=no_email")

    # Compute the display name only after confirming we have an email (the email
    # prefix is the fallback), so a missing email can't raise here.
    google_name = userinfo.get("name") or google_email.split("@")[0]

    # Find or create the user. Google accounts have no usable local password;
    # the sentinel keeps the NOT NULL column satisfied and never verifies.
    result = await db.execute(select(User).where(User.email == google_email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            email=google_email,
            hashed_password="google_oauth_no_password",
            name=google_name,
            avatar=(google_name[:1].upper() or "U"),
        )
        db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            # Concurrent first login for the same account; re-read the winner.
            await db.rollback()
            result = await db.execute(
                select(User).where(User.email == google_email)
            )
            user = result.scalar_one()
        else:
            await db.refresh(user)

    jwt_token = create_access_token(subject=str(user.id))

    # Hand the JWT back via the URL fragment (kept out of server logs / Referer).
    # Values are URL-encoded; the frontend should decode them (URLSearchParams
    # does this automatically).
    fragment = (
        f"token={quote(jwt_token)}"
        f"&name={quote(google_name)}"
        f"&email={quote(google_email)}"
        f"&user_id={quote(str(user.id))}"
    )
    return RedirectResponse(url=f"{frontend_url}/auth/callback#{fragment}")
