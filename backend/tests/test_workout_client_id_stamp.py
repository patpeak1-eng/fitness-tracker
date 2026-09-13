"""S32 Fix 1b — the server stamps a client_id on any upload that arrives without one.

Why this exists.

A workout row with client_id NULL has no durable identity. PostgreSQL treats
NULLs as distinct under the (user_id, client_id) unique constraint, so a
re-upload inserts a *fresh* row and can undo a deletion, and no client-side
deletion can name the row at all — the client's local id is unrelated to the
server's id for anything finished before commit 8b88b49, which is the commit
that first recorded client_id and backendId.

Three review rounds tried to repair that from the client by inferring the
missing identifier. Every attempt was destructive, because counting rows that
look alike establishes how many candidates exist, never that a candidate IS
this row.

So it is fixed where the information still exists: at insert. Stamping the
row's own id as its client_id is collision-free (it is a freshly minted UUID)
and permanent.

Note what is NOT done here: rejecting the upload. An earlier attempt returned
400, and SyncQueue dead-letters any non-auth 4xx, so that permanently
discarded the user's workout. Accepting and repairing loses nothing.

A production census taken before this shipped found ZERO rows with a NULL
client_id, so there is no backlog to migrate; this keeps the count at zero.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.auth import create_access_token, hash_password


async def _make_user(db, email: str):
    uid = uuid.uuid4()
    await db.execute(
        text(
            "INSERT INTO users (id, email, hashed_password, name) "
            "VALUES (:id, :e, :p, 'Stamper')"
        ),
        {"id": uid, "e": email, "p": hash_password("pw12345678")},
    )
    await db.commit()
    return uid


def _auth(uid) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=str(uid))}"}


def _payload(client_id=None, name="Session"):
    start = datetime.now(timezone.utc)
    body = {
        "name": name,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(minutes=40)).isoformat(),
        "status": "completed",
        "exercises": [{"id": "wt_squat", "sets": [{"reps": 5, "weight": 100}]}],
    }
    if client_id is not None:
        body["client_id"] = client_id
    return body


async def _null_client_id_count(db) -> int:
    return (
        await db.execute(
            text("SELECT count(*) FROM workout_history WHERE client_id IS NULL")
        )
    ).scalar_one()


async def test_an_upload_without_a_client_id_is_stamped_with_its_own_id(db, client):
    uid = await _make_user(db, "stamp@example.com")
    h = _auth(uid)

    r = await client.post("/api/workouts", json=_payload(), headers=h)
    assert r.status_code in (200, 201), r.text
    body = r.json()

    assert body["client_id"] is not None, "the row was stored with no identity"
    assert body["client_id"] == str(body["id"]), (
        "the stamp must be the row's own id — any other value is a second "
        "identifier nobody can rediscover"
    )


async def test_the_table_never_retains_a_null_client_id(db, client):
    """The property that actually matters, asserted against the table itself.

    The response could look right while the stored row did not.
    """
    uid = await _make_user(db, "nonull@example.com")
    h = _auth(uid)
    assert await _null_client_id_count(db) == 0

    for i in range(3):
        r = await client.post("/api/workouts", json=_payload(name=f"S{i}"), headers=h)
        assert r.status_code in (200, 201), r.text

    assert await _null_client_id_count(db) == 0, (
        "an identifierless row reached the table; it can be resurrected after "
        "deletion and no client can name it"
    )


async def test_a_stamped_row_is_deletable_by_client_id(db, client):
    """The whole purpose: an identifierless upload becomes deletable."""
    uid = await _make_user(db, "deletable@example.com")
    h = _auth(uid)

    created = (await client.post("/api/workouts", json=_payload(), headers=h)).json()
    assert (await client.get("/api/workouts", headers=h)).json()["total"] == 1

    r = await client.delete(
        "/api/workouts/deletions/by-client-id",
        params={"client_id": created["client_id"]},
        headers=h,
    )
    assert r.status_code == 204, r.text
    assert (await client.get("/api/workouts", headers=h)).json()["total"] == 0, (
        "before the stamp this row could not be named, so it survived deletion"
    )


async def test_two_identifierless_uploads_stay_distinct(db, client):
    """The stamp must not collapse genuinely different workouts.

    Each row is stamped with its OWN fresh id, so nothing can collide. A shared
    or derived value here would silently merge two of the user's workouts.
    """
    uid = await _make_user(db, "distinct@example.com")
    h = _auth(uid)

    a = (await client.post("/api/workouts", json=_payload(name="A"), headers=h)).json()
    b = (await client.post("/api/workouts", json=_payload(name="B"), headers=h)).json()

    assert a["client_id"] != b["client_id"]
    assert (await client.get("/api/workouts", headers=h)).json()["total"] == 2


async def test_deleting_one_stamped_row_leaves_the_other(db, client):
    uid = await _make_user(db, "onlyone@example.com")
    h = _auth(uid)
    a = (await client.post("/api/workouts", json=_payload(name="A"), headers=h)).json()
    (await client.post("/api/workouts", json=_payload(name="B"), headers=h)).json()

    await client.delete(
        "/api/workouts/deletions/by-client-id",
        params={"client_id": a["client_id"]},
        headers=h,
    )

    listed = (await client.get("/api/workouts", headers=h)).json()
    assert listed["total"] == 1
    assert listed["items"][0]["name"] == "B", "deleted the wrong workout"


async def test_a_supplied_client_id_is_never_overwritten(db, client):
    """Regression guard: the stamp must only fill a gap, never replace a value.

    Overwriting would break idempotent re-upload, which is the one property the
    whole deletion design rests on.
    """
    uid = await _make_user(db, "supplied@example.com")
    h = _auth(uid)
    cid = str(uuid.uuid4())

    r = await client.post("/api/workouts", json=_payload(cid), headers=h)
    assert r.json()["client_id"] == cid

    # And the re-upload still deduplicates against it rather than inserting again.
    again = await client.post("/api/workouts", json=_payload(cid), headers=h)
    assert again.status_code in (200, 201), again.text
    assert again.json()["id"] == r.json()["id"]
    assert (await client.get("/api/workouts", headers=h)).json()["total"] == 1
