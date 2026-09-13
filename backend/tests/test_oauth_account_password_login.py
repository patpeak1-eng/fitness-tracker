"""An OAuth-only account must reject a typed password cleanly, not 500.

Found in review of S32 Fix 2, but PRE-EXISTING — it has nothing to do with the
Token change. Google users are stored with the literal GOOGLE_OAUTH_SENTINEL in
`hashed_password`, which is not a bcrypt hash. `verify_password` hands it
straight to passlib, which raises on an unrecognisable hash, and the exception
escapes the handler as a 500.

This matters in practice because every real account on this deployment is
Google OAuth: anyone who types their email and a password into the sign-in form
instead of using the Google button gets a server error rather than "Invalid
email or password".
"""
from __future__ import annotations

import uuid

from sqlalchemy import text

from app.routers.auth import GOOGLE_OAUTH_SENTINEL

LOGIN = "/api/auth/login"


async def _make_oauth_user(db, email: str):
    """Create a user exactly as google_callback does — sentinel, not a hash."""
    uid = uuid.uuid4()
    await db.execute(
        text(
            "INSERT INTO users (id, email, hashed_password, name) "
            "VALUES (:id, :e, :p, 'OAuth User')"
        ),
        {"id": uid, "e": email, "p": GOOGLE_OAUTH_SENTINEL},
    )
    await db.commit()
    return uid


async def test_password_attempt_on_an_oauth_account_is_401_not_500(db, client):
    email = f"oauth-{uuid.uuid4().hex[:8]}@example.com"
    await _make_oauth_user(db, email)

    r = await client.post(LOGIN, json={"email": email, "password": "anything-at-all"})

    assert r.status_code != 500, (
        "typing a password for a Google account crashed the endpoint; "
        "every real account on this deployment is OAuth"
    )
    assert r.status_code == 401, r.text


async def test_the_sentinel_itself_is_not_accepted_as_a_password(db, client):
    """The obvious wrong fix is a string compare that lets the sentinel in."""
    email = f"oauth-sentinel-{uuid.uuid4().hex[:8]}@example.com"
    await _make_oauth_user(db, email)

    r = await client.post(LOGIN, json={"email": email, "password": GOOGLE_OAUTH_SENTINEL})

    assert r.status_code == 401, (
        "the sentinel value was accepted as a password — anyone who knows the "
        "constant could sign in as any Google user"
    )
    assert "access_token" not in r.json()


async def test_the_failure_is_indistinguishable_from_a_wrong_password(db, client):
    """Must not reveal which accounts are OAuth-only."""
    oauth_email = f"oauth-probe-{uuid.uuid4().hex[:8]}@example.com"
    await _make_oauth_user(db, oauth_email)
    unknown_email = f"nobody-{uuid.uuid4().hex[:8]}@example.com"

    a = await client.post(LOGIN, json={"email": oauth_email, "password": "wrong"})
    b = await client.post(LOGIN, json={"email": unknown_email, "password": "wrong"})

    assert a.status_code == b.status_code == 401
    assert a.json() == b.json(), "the response distinguishes an OAuth account"
