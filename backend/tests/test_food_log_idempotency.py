"""Food-log create must be idempotent on client_id.

Same defect as create_workout carried: the handler catches IntegrityError
from commit() and re-queries, which 500s instead of returning the existing
row. The client queue retries 5xx forever, so every duplicate food-log sync
was a permanent retry loop.

Written before the fix; both duplicate tests failed first.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import text

from app.auth import create_access_token, hash_password


async def _make_user(db, email: str):
    uid = uuid.uuid4()
    await db.execute(
        text(
            "INSERT INTO users (id, email, hashed_password, name) "
            "VALUES (:id, :e, :p, 'Eater')"
        ),
        {"id": uid, "e": email, "p": hash_password("pw12345678")},
    )
    await db.commit()
    return uid


def _auth(uid) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=str(uid))}"}


def _entry(client_id=None, name="Oatmeal"):
    return {
        "client_id": client_id or str(uuid.uuid4()),
        "description": name,
        "calories": 320,
        "protein_g": 12,
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "source": "manual",
    }


async def _list(client, headers):
    r = await client.get("/api/nutrition/log", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def test_single_food_log_entry_is_created(db, client):
    uid = await _make_user(db, "food1@example.com")
    h = _auth(uid)
    r = await client.post("/api/nutrition/log", json=_entry(), headers=h)
    assert r.status_code in (200, 201), r.text
    assert len(await _list(client, h)) == 1


async def test_duplicate_food_log_returns_the_existing_row(db, client):
    """The retry path. This 500'd before the fix."""
    uid = await _make_user(db, "food2@example.com")
    h = _auth(uid)
    payload = _entry(name="Logged Twice")

    first = await client.post("/api/nutrition/log", json=payload, headers=h)
    second = await client.post("/api/nutrition/log", json=payload, headers=h)

    assert first.status_code in (200, 201), first.text
    assert second.status_code in (200, 201), (
        f"duplicate food-log sync returned {second.status_code} — the "
        f"idempotent path is broken: {second.text[:200]}"
    )
    assert second.json()["id"] == first.json()["id"], "a second row was created"
    assert len(await _list(client, h)) == 1


async def test_concurrent_duplicate_food_logs_create_one_row(db, client):
    uid = await _make_user(db, "food3@example.com")
    h = _auth(uid)
    payload = _entry(name="Raced Meal")

    r1, r2 = await asyncio.gather(
        client.post("/api/nutrition/log", json=payload, headers=h),
        client.post("/api/nutrition/log", json=payload, headers=h),
        return_exceptions=True,
    )
    for r in (r1, r2):
        assert not isinstance(r, Exception), f"raced create raised: {r!r}"
        assert r.status_code in (200, 201), r.text

    assert len(await _list(client, h)) == 1


async def test_client_id_less_food_log_still_accepted(db, client):
    """Same compatibility rule as workouts: rejecting these would make the
    client queue dead-letter the entry permanently."""
    uid = await _make_user(db, "food4@example.com")
    h = _auth(uid)
    payload = _entry()
    payload["client_id"] = None

    r = await client.post("/api/nutrition/log", json=payload, headers=h)
    assert r.status_code in (200, 201), r.text
    assert len(await _list(client, h)) == 1


async def test_distinct_entries_are_not_collapsed(db, client):
    """Idempotency must key on client_id, not on content."""
    uid = await _make_user(db, "food5@example.com")
    h = _auth(uid)
    await client.post("/api/nutrition/log", json=_entry(name="Same Meal"), headers=h)
    await client.post("/api/nutrition/log", json=_entry(name="Same Meal"), headers=h)
    assert len(await _list(client, h)) == 2
