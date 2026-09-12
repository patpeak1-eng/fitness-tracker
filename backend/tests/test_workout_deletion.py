"""S32 Fix 1a — deleting a workout must actually delete it, and stay deleted.

Written BEFORE the implementation. Every test here encodes a failure mode
that a plan review found by reading code; the point of the harness is that
they can now fail out loud instead of being argued about on paper.

The defect: `deleteWorkout` in the frontend filters local state and never
calls the backend, so the row survives and the next pull merges it back.
Moving the record of the deletion to the SERVER is what makes it hold on
every device and across any backup restore.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.auth import create_access_token, hash_password


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

async def _make_user(db, email: str = "deleter@example.com"):
    uid = uuid.uuid4()
    await db.execute(
        text(
            "INSERT INTO users (id, email, hashed_password, name) "
            "VALUES (:id, :email, :pw, :name)"
        ),
        {"id": uid, "email": email, "pw": hash_password("pw12345678"), "name": "Del"},
    )
    await db.commit()
    return uid


def _auth(uid) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=str(uid))}"}


def _payload(name="Leg Day", client_id=None, minutes_ago=0):
    start = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    return {
        "client_id": client_id or str(uuid.uuid4()),
        "name": name,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(minutes=45)).isoformat(),
        "status": "completed",
        "exercises": [{"id": "wt_squat", "sets": [{"reps": 5, "weight": 100}]}],
    }


async def _create(client, headers, **kw):
    r = await client.post("/api/workouts", json=_payload(**kw), headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


async def _list(client, headers, **params):
    r = await client.get("/api/workouts", headers=headers, params=params or None)
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------- #
# the endpoint itself
# --------------------------------------------------------------------------- #

async def test_delete_removes_workout_from_the_list(db, client):
    uid = await _make_user(db)
    h = _auth(uid)
    w = await _create(client, h)

    r = await client.delete(f"/api/workouts/{w['id']}", headers=h)
    assert r.status_code == 204, r.text

    body = await _list(client, h)
    assert body["items"] == []


async def test_delete_is_idempotent(db, client):
    """A retry after a lost response must not be an error — the end state is
    the same, and the client's queue will retry."""
    uid = await _make_user(db)
    h = _auth(uid)
    w = await _create(client, h)

    first = await client.delete(f"/api/workouts/{w['id']}", headers=h)
    second = await client.delete(f"/api/workouts/{w['id']}", headers=h)
    assert first.status_code == 204
    # 204, not "204 or 404": the row is retained, so a repeat finds it and
    # succeeds. Accepting 404 here would let a hard delete pass this test.
    assert second.status_code == 204, second.text


async def test_delete_is_owner_scoped(db, client):
    """Deleting someone else's workout must not succeed."""
    owner = await _make_user(db, "owner@example.com")
    other = await _make_user(db, "other@example.com")
    w = await _create(client, _auth(owner))

    r = await client.delete(f"/api/workouts/{w['id']}", headers=_auth(other))
    assert r.status_code == 404, r.text

    body = await _list(client, _auth(owner))
    assert len(body["items"]) == 1, "owner's workout must survive"


# --------------------------------------------------------------------------- #
# list correctness — a review found that filtering only the rows, and not the
# count, yields an inflated total and an extra empty page probe
# --------------------------------------------------------------------------- #

async def test_deleted_rows_excluded_from_both_items_and_total(db, client):
    uid = await _make_user(db)
    h = _auth(uid)
    keep = await _create(client, h, name="Keep", minutes_ago=10)
    drop = await _create(client, h, name="Drop", minutes_ago=5)

    await client.delete(f"/api/workouts/{drop['id']}", headers=h)

    body = await _list(client, h)
    assert [i["name"] for i in body["items"]] == ["Keep"]
    assert body["total"] == 1, (
        f"total={body['total']} still counts the deleted row; pagination "
        "would report a page that never arrives"
    )
    assert keep["id"] in {i["id"] for i in body["items"]}


async def test_pagination_is_consistent_after_deletes(db, client):
    uid = await _make_user(db)
    h = _auth(uid)
    made = [await _create(client, h, name=f"W{i}", minutes_ago=60 - i) for i in range(6)]
    for w in made[:3]:
        await client.delete(f"/api/workouts/{w['id']}", headers=h)

    page = await _list(client, h, limit=2, offset=0)
    assert page["total"] == 3
    assert len(page["items"]) == 2
    tail = await _list(client, h, limit=2, offset=2)
    assert len(tail["items"]) == 1, "offset past the surviving rows must not repeat"


# --------------------------------------------------------------------------- #
# resurrection — the whole reason deletion moved to the server
# --------------------------------------------------------------------------- #

async def test_reupload_of_a_deleted_workout_does_not_resurrect_it(db, client):
    """The backfill re-uploads anything present locally and absent remotely.

    After restoring an old backup, or on a second device that still holds the
    row, that is exactly what happens. The re-upload must NOT bring it back.
    """
    uid = await _make_user(db)
    h = _auth(uid)
    payload = _payload(name="Deleted Then Restored")
    created = (await client.post("/api/workouts", json=payload, headers=h)).json()
    await client.delete(f"/api/workouts/{created['id']}", headers=h)

    again = await client.post("/api/workouts", json=payload, headers=h)
    assert again.status_code in (200, 201, 409), again.text

    body = await _list(client, h)
    assert body["items"] == [], "the deleted workout came back via re-upload"
    assert body["total"] == 0


async def test_reupload_response_tells_the_client_it_was_deleted(db, client):
    """The client has to be able to ACT on it.

    The list hides deleted rows, so the only place this fact can reach the
    client is the response to the re-upload attempt. Without it the row stays
    local forever and is offered for backfill on every boot.
    """
    uid = await _make_user(db)
    h = _auth(uid)
    payload = _payload(name="Tell Me")
    created = (await client.post("/api/workouts", json=payload, headers=h)).json()
    await client.delete(f"/api/workouts/{created['id']}", headers=h)

    again = await client.post("/api/workouts", json=payload, headers=h)
    if again.status_code == 409:
        return  # an explicit refusal is also actionable
    body = again.json()
    assert body.get("deleted_at") is not None, (
        "re-upload returned a row with no deletion marker, so the client "
        "cannot tell it was rejected and will keep retrying"
    )


async def test_a_genuinely_new_workout_still_saves_after_a_deletion(db, client):
    """Suppression must be per-identity, not a blanket block."""
    uid = await _make_user(db)
    h = _auth(uid)
    old = await _create(client, h, name="Old")
    await client.delete(f"/api/workouts/{old['id']}", headers=h)

    fresh = await _create(client, h, name="Brand New")
    body = await _list(client, h)
    assert [i["name"] for i in body["items"]] == ["Brand New"]
    assert fresh["id"] in {i["id"] for i in body["items"]}


async def test_legacy_row_without_client_id_can_be_deleted(db, client):
    """Legacy rows may have client_id = NULL (0002_add_client_id_to_
    workout_history says so explicitly). Deleting one must work."""
    uid = await _make_user(db)
    h = _auth(uid)
    row_id = uuid.uuid4()
    await db.execute(
        text(
            "INSERT INTO workout_history (id, user_id, client_id, name, status) "
            "VALUES (:id, :uid, NULL, 'Legacy', 'completed')"
        ),
        {"id": row_id, "uid": uid},
    )
    await db.commit()

    assert (await _list(client, h))["total"] == 1
    r = await client.delete(f"/api/workouts/{row_id}", headers=h)
    assert r.status_code == 204, r.text
    assert (await _list(client, h))["total"] == 0


async def test_client_id_less_upload_is_accepted_and_documents_a_known_gap(db, client):
    """A create with no client_id is ACCEPTED, on purpose.

    Rejecting it would be a data-loss regression: the shipped login backfill
    queues the raw local workout, a legacy or restored row may carry no
    client_id, and SyncQueue dead-letters any 4xx — so a 400 would discard
    that workout permanently on a client we cannot update in the same deploy.

    The cost is recorded here rather than hidden: such a row has no durable
    identity, so a re-upload after deletion DOES resurrect it. Production held
    zero client_id-less rows when this shipped. Fix 1b makes the client always
    send an identifier; when it does, this test should be changed to assert
    the row stays deleted, and the server can then require one.
    """
    uid = await _make_user(db)
    h = _auth(uid)
    payload = {"client_id": None, "name": "No Identity", "status": "completed"}

    created = await client.post("/api/workouts", json=payload, headers=h)
    assert created.status_code in (200, 201), (
        f"a client_id-less create was rejected ({created.status_code}); the "
        f"shipped backfill would dead-letter that workout: {created.text[:200]}"
    )
    assert (await _list(client, h))["total"] == 1

    await client.delete(f"/api/workouts/{created.json()['id']}", headers=h)
    assert (await _list(client, h))["total"] == 0

    again = await client.post("/api/workouts", json=payload, headers=h)
    assert again.status_code in (200, 201), again.text
    assert (await _list(client, h))["total"] == 1, (
        "KNOWN GAP CLOSED — a client_id-less re-upload no longer resurrects. "
        "Update this test and consider requiring client_id server-side."
    )


# --------------------------------------------------------------------------- #
# pre-existing bug, found while building the above
# --------------------------------------------------------------------------- #

async def test_duplicate_upload_returns_the_existing_row(db, client):
    """Re-uploading the same client_id must return the existing workout.

    This is NOT part of the deletion work — it was already broken. The
    handler caught IntegrityError from commit() and re-queried; the re-query
    raised MissingGreenlet and the request 500'd. The client queue retries
    5xx forever, so every duplicate sync was a permanent retry loop.

    What this test proves is the observable behaviour: the old route failed
    and the new one does not. It does NOT establish the mechanism — rollback
    expires current_user, so attribute access on it during the re-query is a
    likelier cause than the whole session being unusable. The fix removes the
    exception path rather than betting on either explanation.

    Found by this suite on its first run.
    """
    uid = await _make_user(db, "dup@example.com")
    h = _auth(uid)
    payload = _payload(name="Synced Twice")

    first = await client.post("/api/workouts", json=payload, headers=h)
    second = await client.post("/api/workouts", json=payload, headers=h)

    assert first.status_code in (200, 201), first.text
    assert second.status_code in (200, 201), (
        f"duplicate sync returned {second.status_code} — the idempotent "
        f"re-sync path is broken again: {second.text[:200]}"
    )
    assert second.json()["id"] == first.json()["id"], "a second row was created"

    body = await _list(client, h)
    assert body["total"] == 1


async def test_concurrent_duplicate_uploads_do_not_create_two_rows(db, client):
    """Two creates of the same client_id at once, resolved by ON CONFLICT.

    A savepoint was tried here first and this test rejected it.
    """
    import asyncio

    uid = await _make_user(db, "race@example.com")
    h = _auth(uid)
    payload = _payload(name="Raced")

    r1, r2 = await asyncio.gather(
        client.post("/api/workouts", json=payload, headers=h),
        client.post("/api/workouts", json=payload, headers=h),
        return_exceptions=True,
    )
    for r in (r1, r2):
        assert not isinstance(r, Exception), f"raced create raised: {r!r}"
        assert r.status_code in (200, 201), r.text

    body = await _list(client, h)
    assert body["total"] == 1, f"race created {body['total']} rows"


# --------------------------------------------------------------------------- #
# other readers must respect the deletion
# --------------------------------------------------------------------------- #

def test_coach_reads_filter_deleted_workouts():
    """The Coach queries workout_history directly, bypassing the list
    endpoint, so it needs its own filter or it will discuss deleted workouts
    and report inflated trends.

    This inspects the router's source rather than calling /api/coach/chat,
    which needs a live model. An earlier version of this test ran its own SQL
    with the filter hand-written in the test — which passed whether or not the
    real queries filtered anything, i.e. it could not fail. This one can:
    delete either filter and it goes red.
    """
    import ast
    import inspect

    from app.routers import coach

    src = inspect.getsource(coach)
    tree = ast.parse(src)

    reads = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = getattr(func, "id", None) or getattr(func, "attr", None)
        if name not in {"select", "select_from"}:
            continue
        seg = ast.get_source_segment(src, node) or ""
        if "WorkoutHistory" in seg:
            reads.append(seg)

    assert reads, "no WorkoutHistory reads found in coach.py — did it move?"

    enclosing = [
        ast.get_source_segment(src, n) or ""
        for n in ast.walk(tree)
        if isinstance(n, ast.Call)
        and (getattr(n.func, "attr", None) in {"execute", "scalar"})
        and "WorkoutHistory" in (ast.get_source_segment(src, n) or "")
    ]
    assert enclosing, "no executed WorkoutHistory queries found in coach.py"
    for q in enclosing:
        assert "deleted_at" in q, (
            "a Coach query reads workout_history without filtering "
            f"deleted_at:\n{q[:400]}"
        )


async def test_soft_deleted_row_is_invisible_to_filtered_reads(db, client):
    """Companion to the source check: the data really is excluded."""
    uid = await _make_user(db)
    h = _auth(uid)
    w = await _create(client, h, name="Should Not Be Coached")
    await client.delete(f"/api/workouts/{w['id']}", headers=h)

    visible = (
        await db.execute(
            text(
                "SELECT count(*) FROM workout_history "
                "WHERE user_id = :uid AND deleted_at IS NULL"
            ),
            {"uid": uid},
        )
    ).scalar_one()
    retained = (
        await db.execute(
            text("SELECT count(*) FROM workout_history WHERE user_id = :uid"),
            {"uid": uid},
        )
    ).scalar_one()
    assert visible == 0, "a filtered read still sees the deleted workout"
    assert retained == 1, "the row must be retained to block re-upload"


async def test_deleted_row_is_retained_not_physically_removed(db, client):
    """Soft delete is the mechanism: the row must survive so the server can
    recognise a later re-upload of the same identity."""
    uid = await _make_user(db)
    h = _auth(uid)
    w = await _create(client, h)
    await client.delete(f"/api/workouts/{w['id']}", headers=h)

    total_including_deleted = (
        await db.execute(
            text("SELECT count(*) FROM workout_history WHERE user_id = :uid"),
            {"uid": uid},
        )
    ).scalar_one()
    assert total_including_deleted == 1, "the row was hard-deleted; nothing " \
        "remains to recognise a re-upload against"
