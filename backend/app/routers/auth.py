"""Authentication routes: register, login, Google OAuth, session (/me), logout."""
import base64
import hashlib
import os
import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.rate_limit import (
    LOGIN_LIMIT,
    LOGIN_WINDOW,
    REGISTER_LIMIT,
    REGISTER_WINDOW,
    rate_limit,
)
from app.schemas import AccountDeleteRequest, Token, UserLogin, UserRegister

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Sentinel hash stored for Google OAuth users (they have no local password).
# Must match the value written in google_callback below.
GOOGLE_OAUTH_SENTINEL = "google_oauth_no_password"


def _client_ip(request: Request) -> str:
    """Client IP for rate-limit keying on the unauthenticated auth routes.

    Behind Railway's reverse proxy the socket peer is the proxy, so prefer the
    leftmost ``X-Forwarded-For`` entry (the original client) — otherwise every
    client collapses into one bucket. XFF can be spoofed if the edge doesn't
    strip a client-supplied header, so this slows casual brute-force but is not
    a substitute for account lockout. Falls back to the socket peer when no
    header is present (e.g. local/dev).
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Token:
    # Brute-force / abuse guardrail, keyed by client IP (no user yet).
    await rate_limit(
        f"register:{_client_ip(request)}",
        REGISTER_LIMIT,
        REGISTER_WINDOW,
    )

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
async def login(
    payload: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Token:
    # Brute-force guardrail, keyed by client IP (no user yet).
    await rate_limit(
        f"login:{_client_ip(request)}",
        LOGIN_LIMIT,
        LOGIN_WINDOW,
    )

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

    state = secrets.token_hex(32)

    # PKCE (S256): bind the authorization code to this login attempt so an
    # intercepted code is useless without the verifier (RFC 7636 / RFC 9700
    # recommends PKCE even for confidential clients like this one).
    # token_urlsafe(64) yields ~86 chars — inside the RFC's 43-128 range.
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest())
        .rstrip(b"=")
        .decode("ascii")
    )

    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
        f"&state={state}"
        f"&code_challenge={code_challenge}"
        "&code_challenge_method=S256"
    )

    response = RedirectResponse(url=google_auth_url)
    response.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        max_age=600,        # 10 minutes — more than enough for a login flow
        samesite="lax",     # same-origin redirect chain, lax is correct here
        secure=True,
    )
    # Verifier rides its own cookie with attributes IDENTICAL to oauth_state —
    # that exact pair is proven to survive the Google redirect chain in prod.
    response.set_cookie(
        key="oauth_verifier",
        value=code_verifier,
        httponly=True,
        max_age=600,
        samesite="lax",
        secure=True,
    )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle Google's OAuth callback: exchange the code for the user's profile,
    find or create the user, and redirect to the frontend with a JWT."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # CSRF check — state must match the cookie set in google_login
    cookie_state = request.cookies.get("oauth_state")
    if not state or not cookie_state or state != cookie_state:
        return RedirectResponse(url=f"{frontend_url}/login?error=auth_failed")

    # PKCE — the verifier cookie must have survived the redirect chain; a
    # missing verifier is treated exactly like a state mismatch. (A *wrong*
    # verifier fails closed at Google's token endpoint below.)
    code_verifier = request.cookies.get("oauth_verifier")
    if not code_verifier:
        return RedirectResponse(url=f"{frontend_url}/login?error=auth_failed")

    # Google redirects here with ?error=... and no code when the user cancels
    # or denies consent; handle it gracefully instead of returning a 422.
    if error or not code:
        return RedirectResponse(url=f"{frontend_url}/login?error=auth_failed")

    if not client_id or not client_secret or not redirect_uri:
        return RedirectResponse(url=f"{frontend_url}/login?error=auth_failed")

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
                "code_verifier": code_verifier,
            },
        )
    token_data = token_response.json()

    google_access_token = token_data.get("access_token")
    if not google_access_token:
        return RedirectResponse(url=f"{frontend_url}/login?error=auth_failed")

    # Fetch the user's profile from Google.
    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
    userinfo = userinfo_response.json()

    google_email = userinfo.get("email")
    if not google_email:
        return RedirectResponse(url=f"{frontend_url}/login?error=auth_failed")

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
            hashed_password=GOOGLE_OAUTH_SENTINEL,
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

    # Store the JWT in an HttpOnly session cookie (never in the URL/JS), then
    # send the user to the app. The frontend learns who they are by calling
    # GET /api/auth/me with credentials; it never reads this cookie directly.
    #
    # SameSite=None (with Secure) is REQUIRED: the backend and frontend are on
    # different domains, so the /api/me call is a cross-site request. A Lax
    # cookie would be withheld on that cross-site fetch and /api/me would 401.
    response = RedirectResponse(url=f"{frontend_url}/", status_code=302)
    response.set_cookie(
        key="session_token",
        value=jwt_token,
        httponly=True,
        max_age=2592000,  # 30 days
        samesite="none",
        secure=True,
    )
    response.delete_cookie(key="oauth_state", samesite="lax", secure=True)
    response.delete_cookie(key="oauth_verifier", samesite="lax", secure=True)
    return response


@router.get("/me")
async def get_current_user_info(user: User = Depends(get_current_user)):
    """Return the current user's info.

    Auth goes through the shared get_current_user dependency, so this accepts
    either transport: the Bearer header or the HttpOnly session cookie (Google
    OAuth users hit this with the cookie only).
    """
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "color": user.color or "#ff5c2a",
        "avatar": user.avatar or (user.name[0].upper() if user.name else "U"),
    }


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    payload: AccountDeleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Permanently delete the authenticated user and ALL their data.

    Irreversible. Re-confirmation is enforced server-side, not just in the UI:

    - Every account must send the literal typed string ``confirm == "DELETE"``.
    - Local (email/password) accounts must additionally re-enter their
      ``password``, verified here — a stolen session alone cannot delete them.
    - Google OAuth accounts have no usable password (sentinel hash), so the
      typed confirmation is the strongest server-checkable factor available.

    Deletion is a single transaction: every table with a ``user_id`` FK has
    DB-level ``ON DELETE CASCADE`` (migrations 0001/0003), so removing the user
    row removes all child rows (stats, workouts, active workout, assessments,
    weight history, custom templates/exercises, coach messages) atomically.
    """
    # Rate-limit per user, like login, to blunt abuse of the password oracle.
    await rate_limit("delete_account", LOGIN_LIMIT, LOGIN_WINDOW, current_user=user)

    if payload.confirm != "DELETE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Type DELETE to confirm',
        )

    is_oauth = user.hashed_password == GOOGLE_OAUTH_SENTINEL
    if not is_oauth:
        if not payload.password or not verify_password(
            payload.password, user.hashed_password
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password",
            )

    await db.delete(user)
    await db.commit()

    # 204 with no body; clear the OAuth session cookie (match set attributes so
    # the browser actually drops it). Bearer users just discard their token.
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(key="session_token", samesite="none", secure=True)
    return response


@router.post("/logout")
async def logout() -> RedirectResponse:
    """Clear the session cookie."""
    response = RedirectResponse(url="/login", status_code=302)
    # Match the attributes used when setting the cookie so the browser clears it.
    response.delete_cookie(key="session_token", samesite="none", secure=True)
    return response
