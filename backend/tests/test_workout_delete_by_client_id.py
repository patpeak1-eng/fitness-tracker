"""S32 Fix 1b (redesigned) — delete by client_id, recordable before the row exists.

Why this endpoint exists, from five rounds of review on the client-only
approach:

`DELETE /{id}` can only remove a row that is already on the server. When a
workout's upload is still in flight there is nothing to delete yet, so the
client has to INFER from an absent row whether the upload will land. That
inference cannot be made safe — a lost response or a crash leaves the outcome
unknown, and every client-side guard built to cover it turned out to have a
narrower version of the same hole.

Recording the deletion against the client's OWN identifier removes the
inference entirely: a create that lands afterwards collides with the recorded
deletion and comes back marked deleted, using the mechanism Fix 1a already
built. Absence never has to be interpreted.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.auth import create_access_token, hash_password


async def _make_user(db, email: str):
    uid = uuid.uuid4()
    await db.execute(
        text(
            "INSERT INTO users (id, email, hashed_password, name) "
            "VALUES (:id, :e, :p, 'Deleter')"
        ),
        {"id": uid, "e": email, "p": hash_password("pw12345678")},
    )
    await db.commit()
    return uid


def _auth(uid) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=str(uid))}"}


def _payload(client_id, name="Session"):
    start = datetime.now(timezone.utc)
    return {
        "client_id": client_id,
        "name": name,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(minutes=40)).isoformat(),
        "status": "completed",
        "exercises": [{"id": "wt_squat", "sets": [{"reps": 5, "weight": 100}]}],
    }


async def _list(client, headers):
    r = await client.get("/api/workouts", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------- #
# the ordering that motivated the redesign
# --------------------------------------------------------------------------- #

async def test_delete_before_the_workout_is_ever_uploaded(db, client):
    """The whole point: record the deletion FIRST, upload arrives second.

    This is the in-flight-create schedule. Previously the client had to guess;
    now the server simply knows.
    """
    uid = await _make_user(db, "before@example.com")
    h = _auth(uid)
    cid = str(uuid.uuid4())

    r = await client.delete(f"/api/workouts/by-client-id/{cid}", headers=h)
    assert r.status_code == 204, r.text
    assert (await _list(client, h))["total"] == 0

    # The upload finally lands. It must NOT resurrect the workout.
    late = await client.post("/api/workouts", json=_payload(cid), headers=h)
    assert late.status_code in (200, 201), late.text
    assert late.json().get("deleted_at") is not None, (
        "the late upload was accepted as a live workout — the client has no "
        "way to know it should drop its copy"
    )
    assert (await _list(client, h))["total"] == 0, "the deleted workout came back"


async def test_delete_after_upload_behaves_the_same(db, client):
    uid = await _make_user(db, "after@example.com")
    h = _auth(uid)
    cid = str(uuid.uuid4())
    await client.post("/api/workouts", json=_payload(cid), headers=h)
    assert (await _list(client, h))["total"] == 1

    r = await client.delete(f"/api/workouts/by-client-id/{cid}", headers=h)
    assert r.status_code == 204, r.text
    assert (await _list(client, h))["total"] == 0


async def test_repeat_delete_is_idempotent(db, client):
    """A retry after a lost response must not error — that is what makes the
    client's queued intent safe to keep until it succeeds."""
    uid = await _make_user(db, "repeat@example.com")
    h = _auth(uid)
    cid = str(uuid.uuid4())
    first = await client.delete(f"/api/workouts/by-client-id/{cid}", headers=h)
    second = await client.delete(f"/api/workouts/by-client-id/{cid}", headers=h)
    third = await client.delete(f"/api/workouts/by-client-id/{cid}", headers=h)
    assert [first.status_code, second.status_code, third.status_code] == [204, 204, 204]

    rows = (
        await db.execute(
            text("SELECT count(*) FROM workout_history WHERE user_id = :u"),
            {"u": uid},
        )
    ).scalar_one()
    assert rows == 1, f"repeat deletes created {rows} placeholder rows"


async def test_concurrent_deletes_create_one_record(db, client):
    uid = await _make_user(db, "race@example.com")
    h = _auth(uid)
    cid = str(uuid.uuid4())
    results = await asyncio.gather(
        client.delete(f"/api/workouts/by-client-id/{cid}", headers=h),
        client.delete(f"/api/workouts/by-client-id/{cid}", headers=h),
        return_exceptions=True,
    )
    for r in results:
        assert not isinstance(r, Exception), f"raced delete raised: {r!r}"
        assert r.status_code == 204, r.text
    rows = (
        await db.execute(
            text("SELECT count(*) FROM workout_history WHERE user_id = :u"),
            {"u": uid},
        )
    ).scalar_one()
    assert rows == 1


async def test_delete_then_upload_race(db, client):
    """Both directions at once — whichever wins, the workout stays deleted."""
    uid = await _make_user(db, "bothways@example.com")
    h = _auth(uid)
    cid = str(uuid.uuid4())
    await asyncio.gather(
        client.delete(f"/api/workouts/by-client-id/{cid}", headers=h),
        client.post("/api/workouts", json=_payload(cid), headers=h),
        return_exceptions=True,
    )
    assert (await _list(client, h))["total"] == 0, (
        "a concurrent upload beat the deletion and the workout survived"
    )


# --------------------------------------------------------------------------- #
# scoping and safety
# --------------------------------------------------------------------------- #

async def test_delete_is_owner_scoped(db, client):
    """One account's deletion must never touch another's identically-keyed row.

    client_id is client-generated, so a collision across accounts is possible
    in principle and must be harmless.
    """
    a = await _make_user(db, "owner-a@example.com")
    b = await _make_user(db, "owner-b@example.com")
    cid = str(uuid.uuid4())
    await client.post("/api/workouts", json=_payload(cid, "A's workout"), headers=_auth(a))
    await client.post("/api/workouts", json=_payload(cid, "B's workout"), headers=_auth(b))

    r = await client.delete(f"/api/workouts/by-client-id/{cid}", headers=_auth(a))
    assert r.status_code == 204

    assert (await _list(client, _auth(a)))["total"] == 0
    kept = await _list(client, _auth(b))
    assert kept["total"] == 1, "deleting A's workout also removed B's"
    assert kept["items"][0]["name"] == "B's workout"


async def test_unauthenticated_delete_is_rejected(db, client):
    r = await client.delete(f"/api/workouts/by-client-id/{uuid.uuid4()}")
    assert r.status_code in (401, 403), r.text


async def test_other_workouts_are_untouched(db, client):
    uid = await _make_user(db, "others@example.com")
    h = _auth(uid)
    keep_cid, drop_cid = str(uuid.uuid4()), str(uuid.uuid4())
    await client.post("/api/workouts", json=_payload(keep_cid, "Keep"), headers=h)
    await client.post("/api/workouts", json=_payload(drop_cid, "Drop"), headers=h)

    await client.delete(f"/api/workouts/by-client-id/{drop_cid}", headers=h)
    body = await _list(client, h)
    assert [i["name"] for i in body["items"]] == ["Keep"]
    assert body["total"] == 1


async def test_placeholder_row_is_never_listed_or_counted(db, client):
    """A pre-emptive deletion writes a placeholder row. It must be invisible
    everywhere a user-facing count is produced."""
    uid = await _make_user(db, "placeholder@example.com")
    h = _auth(uid)
    await client.delete(f"/api/workouts/by-client-id/{uuid.uuid4()}", headers=h)

    body = await _list(client, h)
    assert body["items"] == []
    assert body["total"] == 0

    visible = (
        await db.execute(
            text(
                "SELECT count(*) FROM workout_history "
                "WHERE user_id = :u AND deleted_at IS NULL"
            ),
            {"u": uid},
        )
    ).scalar_one()
    assert visible == 0
