"""S32 Fix 2a — password sign-in must return a stable identity.

`Token` carries only an access token today, so `Login.jsx` falls back to
`'cloud_' + Date.now()` and a password user gets a BRAND NEW local profile id
on every single sign-in. Everything stored under the previous id is orphaned.
Google users are unaffected: the OAuth callback sets a cookie and `/me` returns
the canonical id.

`getMe` cannot repair it either — it is cookie-only (`credentials: 'include'`,
no Authorization header), so a Bearer-only password session never learns who it
is. The identity has to come back with the token itself.

These tests pin the contract. They are written before the change, so they fail
against the current backend.
"""
from __future__ import annotations

import uuid

from jose import jwt
from sqlalchemy import text

from app.auth import ALGORITHM, SECRET_KEY

REGISTER = "/api/auth/register"
LOGIN = "/api/auth/login"


def _creds(tag: str) -> dict[str, str]:
    return {
        "email": f"{tag}-{uuid.uuid4().hex[:8]}@example.com",
        "password": "pw12345678",
        "name": "Identity Tester",
    }


async def _db_id(db, email: str):
    return (
        await db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": email})
    ).scalar_one()


async def test_register_returns_the_canonical_user_id(db, client):
    creds = _creds("reg")
    r = await client.post(REGISTER, json=creds)
    assert r.status_code == 201, r.text

    body = r.json()
    assert "user_id" in body, (
        "register did not return user_id, so the client has nothing to scope "
        "local data by and invents 'cloud_' + Date.now()"
    )
    assert body["user_id"] == str(await _db_id(db, creds["email"]))


async def test_login_returns_the_canonical_user_id(db, client):
    creds = _creds("log")
    await client.post(REGISTER, json=creds)

    r = await client.post(LOGIN, json={"email": creds["email"], "password": creds["password"]})
    assert r.status_code == 200, r.text
    assert r.json()["user_id"] == str(await _db_id(db, creds["email"]))


async def test_the_identity_is_the_same_on_every_sign_in(db, client):
    """The actual bug: today each sign-in produces a different local id."""
    creds = _creds("stable")
    reg = await client.post(REGISTER, json=creds)
    login_body = {"email": creds["email"], "password": creds["password"]}
    first = await client.post(LOGIN, json=login_body)
    second = await client.post(LOGIN, json=login_body)

    ids = {
        reg.json().get("user_id"),
        first.json().get("user_id"),
        second.json().get("user_id"),
    }
    assert len(ids) == 1, f"identity changed between sign-ins: {ids}"
    assert ids != {None}


async def test_user_id_matches_the_token_subject(db, client):
    """Identity and authorization must name the SAME user.

    If they could disagree, a client would scope its local data by one id while
    the server attributed its writes to another.
    """
    creds = _creds("subject")
    r = await client.post(REGISTER, json=creds)
    body = r.json()

    claims = jwt.decode(body["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert body["user_id"] == claims["sub"]


async def test_two_accounts_never_share_an_identity(db, client):
    a, b = _creds("a"), _creds("b")
    ra = await client.post(REGISTER, json=a)
    rb = await client.post(REGISTER, json=b)
    assert ra.json()["user_id"] != rb.json()["user_id"]


async def test_the_existing_token_contract_is_unchanged(db, client):
    """Additive only: an older client that ignores user_id must still work."""
    creds = _creds("compat")
    body = (await client.post(REGISTER, json=creds)).json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


async def test_a_failed_login_still_leaks_no_identity(db, client):
    creds = _creds("wrongpw")
    await client.post(REGISTER, json=creds)

    r = await client.post(LOGIN, json={"email": creds["email"], "password": "wrong-password"})
    assert r.status_code == 401
    assert "user_id" not in r.json()


async def test_login_for_an_unknown_email_is_unchanged(db, client):
    r = await client.post(
        LOGIN, json={"email": f"nobody-{uuid.uuid4().hex[:8]}@example.com", "password": "pw12345678"}
    )
    assert r.status_code == 401
    assert "user_id" not in r.json()
