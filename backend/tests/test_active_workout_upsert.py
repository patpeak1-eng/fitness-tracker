"""`PUT /api/workouts/active` — the last IntegrityError-then-re-query site.

`create_workout` and `create_food_log` both 500'd on a plain duplicate: the
handler caught `IntegrityError` from `commit()`, rolled back, and re-queried,
and the re-query raised `MissingGreenlet` on an asyncpg session that the escaped
error had already made unusable. The client retries 5xx forever, so every
duplicate became a permanent retry loop. Both were replaced with
`INSERT … ON CONFLICT`, which raises nothing at all.

`PUT /active` had the original shape. The tests above the fence section pin
the behaviour that had to survive the repair — one row per user, no 5xx, last
write wins for an unversioned caller.

S32 Fix 3 then added the `client_seq` fence on top, and the fence section at
the bottom of this file covers what it must REJECT. Two contract changes are
deliberate and are asserted, not worked around: clearing is now a SOFT clear
that retains the row (a sequence on a deleted row fences nothing), and GET
returns `workout_data: null` with a sequence rather than JSON null.
"""
from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import text

from app.auth import create_access_token, hash_password

ACTIVE = "/api/workouts/active"


async def _make_user(db, email: str):
    uid = uuid.uuid4()
    await db.execute(
        text(
            "INSERT INTO users (id, email, hashed_password, name) "
            "VALUES (:id, :e, :p, 'Active Tester')"
        ),
        {"id": uid, "e": email, "p": hash_password("pw12345678")},
    )
    await db.commit()
    return uid


def _auth(uid) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=str(uid))}"}


def _body(name: str, client_seq: int | None = None) -> dict:
    body = {"workout_data": {"name": name, "exercises": [], "status": "active"}}
    if client_seq is not None:
        body["client_seq"] = client_seq
    return body


async def _row_count(db, uid) -> int:
    return (
        await db.execute(
            text("SELECT count(*) FROM active_workout WHERE user_id = :u"), {"u": uid}
        )
    ).scalar_one()


async def test_first_save_creates_the_row(db, client):
    uid = await _make_user(db, "active-first@example.com")
    r = await client.put(ACTIVE, json=_body("Leg Day"), headers=_auth(uid))
    assert r.status_code == 200, r.text
    assert r.json()["workout_data"]["name"] == "Leg Day"
    assert await _row_count(db, uid) == 1


async def test_repeated_saves_update_one_row(db, client):
    uid = await _make_user(db, "active-repeat@example.com")
    h = _auth(uid)
    for name in ("A", "B", "C"):
        r = await client.put(ACTIVE, json=_body(name), headers=h)
        assert r.status_code == 200, r.text

    assert await _row_count(db, uid) == 1
    got = await client.get(ACTIVE, headers=h)
    assert got.json()["workout_data"]["name"] == "C"


async def test_concurrent_first_saves_never_5xx(db, client):
    """The race the IntegrityError branch exists for.

    Two saves arrive before either has committed. The unique constraint on
    active_workout.user_id lets exactly one insert win; the other must resolve
    to an update rather than surfacing a 500 that the sync queue would retry
    for ever.
    """
    uid = await _make_user(db, "active-race@example.com")
    h = _auth(uid)

    results = await asyncio.gather(
        client.put(ACTIVE, json=_body("first"), headers=h),
        client.put(ACTIVE, json=_body("second"), headers=h),
        return_exceptions=True,
    )
    for r in results:
        assert not isinstance(r, Exception), f"a concurrent save raised: {r!r}"
        assert r.status_code < 500, f"concurrent save returned {r.status_code}: {r.text}"

    assert await _row_count(db, uid) == 1


async def test_a_save_after_a_concurrent_race_still_works(db, client):
    """The session must remain usable.

    This is what actually broke in create_workout: the failed request poisoned
    the session, so the NEXT request through it failed too.
    """
    uid = await _make_user(db, "active-after-race@example.com")
    h = _auth(uid)
    await asyncio.gather(
        client.put(ACTIVE, json=_body("x"), headers=h),
        client.put(ACTIVE, json=_body("y"), headers=h),
        return_exceptions=True,
    )

    r = await client.put(ACTIVE, json=_body("afterwards"), headers=h)
    assert r.status_code == 200, r.text
    got = await client.get(ACTIVE, headers=h)
    assert got.json()["workout_data"]["name"] == "afterwards"
    assert await _row_count(db, uid) == 1


async def test_active_workouts_are_owner_scoped(db, client):
    a = await _make_user(db, "active-a@example.com")
    b = await _make_user(db, "active-b@example.com")
    await client.put(ACTIVE, json=_body("A workout"), headers=_auth(a))
    await client.put(ACTIVE, json=_body("B workout"), headers=_auth(b))

    assert (await client.get(ACTIVE, headers=_auth(a))).json()["workout_data"]["name"] == "A workout"
    assert (await client.get(ACTIVE, headers=_auth(b))).json()["workout_data"]["name"] == "B workout"


async def test_clear_is_a_SOFT_clear_and_only_affects_the_caller(db, client):
    """Clearing RETAINS the row with workout_data NULL. Deliberate change.

    Deleting the row was the hole the fence exists to close: a sequence
    written on a row that DELETE removes cannot fence anything, so a save
    still in flight simply re-inserts and the workout the user just finished
    comes back. The retained row is what lets the same fence suppress a late
    save.
    """
    a = await _make_user(db, "active-clear-a@example.com")
    b = await _make_user(db, "active-clear-b@example.com")
    await client.put(ACTIVE, json=_body("A workout"), headers=_auth(a))
    await client.put(ACTIVE, json=_body("B workout"), headers=_auth(b))

    r = await client.delete(ACTIVE, headers=_auth(a))
    assert r.status_code == 204

    assert await _row_count(db, a) == 1, "the fence row must be retained"
    got = (await client.get(ACTIVE, headers=_auth(a))).json()
    assert got["workout_data"] is None, "cleared slot must read as empty"
    assert got["client_seq"] >= 1, "the clear must carry a sequence to fence with"

    # The other user is untouched, row and contents.
    assert await _row_count(db, b) == 1
    assert (await client.get(ACTIVE, headers=_auth(b))).json()["workout_data"]["name"] == "B workout"


async def test_clearing_twice_is_not_an_error(db, client):
    uid = await _make_user(db, "active-clear-twice@example.com")
    h = _auth(uid)
    await client.put(ACTIVE, json=_body("x"), headers=h)
    first = await client.delete(ACTIVE, headers=h)
    second = await client.delete(ACTIVE, headers=h)
    assert [first.status_code, second.status_code] == [204, 204]


async def test_get_with_no_active_workout_returns_null(db, client):
    uid = await _make_user(db, "active-none@example.com")
    r = await client.get(ACTIVE, headers=_auth(uid))
    assert r.status_code == 200
    assert r.json() is None


async def test_unauthenticated_access_is_rejected(db, client):
    for call in (
        client.get(ACTIVE),
        client.put(ACTIVE, json=_body("x")),
        client.delete(ACTIVE),
    ):
        r = await call
        assert r.status_code in (401, 403), r.text


async def test_a_later_save_advances_updated_at(db, client):
    """`updated_at` must move when the row is updated.

    Its `onupdate=func.now()` is an ORM-side hook and does NOT fire for the
    Core upsert this handler uses, so the DO UPDATE has to set it explicitly.
    Without that, a row's timestamp freezes at its first insert -- silently,
    since nothing else in the response changes shape.
    """
    uid = await _make_user(db, "active-touched@example.com")
    h = _auth(uid)

    first = await client.put(ACTIVE, json=_body("A"), headers=h)
    assert first.status_code == 200, first.text
    before = first.json()["updated_at"]

    # The column is timestamptz; make sure the clock has visibly moved.
    await asyncio.sleep(0.05)

    second = await client.put(ACTIVE, json=_body("B"), headers=h)
    assert second.status_code == 200, second.text
    after = second.json()["updated_at"]

    assert after > before, (
        f"updated_at did not advance ({before} -> {after}); the DO UPDATE is "
        "not setting it and the ORM onupdate hook does not fire here"
    )


# --------------------------------------------------------------------------- #
# S32 Fix 3 — the fence
#
# Everything above verifies the slot behaves; these verify it REJECTS the
# writes that used to win by arrival order and lose the user's workout.
# --------------------------------------------------------------------------- #

async def test_a_stale_save_is_rejected_rather_than_winning(db, client):
    """The core case. Without the fence, the delayed save wins by arriving."""
    uid = await _make_user(db, "fence-stale@example.com")
    h = _auth(uid)

    await client.put(ACTIVE, json=_body("newer", client_seq=5), headers=h)
    late = await client.put(ACTIVE, json=_body("older", client_seq=3), headers=h)

    assert late.status_code == 409, "a stale save was applied"
    assert (await client.get(ACTIVE, headers=h)).json()["workout_data"]["name"] == "newer"


async def test_the_409_reports_the_current_sequence_so_the_client_can_rebase(db, client):
    """A bare 409 would force the client to guess or discard the user's edit."""
    uid = await _make_user(db, "fence-rebase@example.com")
    h = _auth(uid)
    await client.put(ACTIVE, json=_body("newer", client_seq=9), headers=h)

    r = await client.put(ACTIVE, json=_body("older", client_seq=4), headers=h)
    assert r.status_code == 409
    assert r.json()["client_seq"] == 9

    # And rebasing above that bound succeeds — the edit is not lost.
    again = await client.put(ACTIVE, json=_body("rebased", client_seq=10), headers=h)
    assert again.status_code == 200
    assert (await client.get(ACTIVE, headers=h)).json()["workout_data"]["name"] == "rebased"


async def test_a_save_delayed_past_a_clear_does_not_resurrect_the_workout(db, client):
    """The resurrection case, and the reason clearing keeps the row.

    Finish a workout (clear at 6), then a save from before the finish arrives
    at 5. With a deleted row there is nothing to fence against and the
    finished workout comes back.
    """
    uid = await _make_user(db, "fence-resurrect@example.com")
    h = _auth(uid)
    await client.put(ACTIVE, json=_body("in progress", client_seq=4), headers=h)
    assert (await client.delete(f"{ACTIVE}?client_seq=6", headers=h)).status_code == 204

    late = await client.put(ACTIVE, json=_body("in progress", client_seq=5), headers=h)

    assert late.status_code == 409, "the finished workout was resurrected"
    assert (await client.get(ACTIVE, headers=h)).json()["workout_data"] is None


async def test_a_clear_arriving_before_any_save_still_fences(db, client):
    """A clear with no existing row CREATES the fence row.

    This is the absent-row hole: with no row, a late save had nothing to lose
    to and simply inserted itself.
    """
    uid = await _make_user(db, "fence-clear-first@example.com")
    h = _auth(uid)

    assert (await client.delete(f"{ACTIVE}?client_seq=8", headers=h)).status_code == 204
    late = await client.put(ACTIVE, json=_body("stale", client_seq=7), headers=h)

    assert late.status_code == 409
    assert (await client.get(ACTIVE, headers=h)).json()["workout_data"] is None


async def test_an_equal_sequence_yields_one_winner(db, client):
    """Two devices at the same sequence: one applies, one is told to rebase."""
    uid = await _make_user(db, "fence-equal@example.com")
    h = _auth(uid)
    await client.put(ACTIVE, json=_body("first", client_seq=3), headers=h)

    tie = await client.put(ACTIVE, json=_body("second", client_seq=3), headers=h)
    assert tie.status_code == 409
    assert (await client.get(ACTIVE, headers=h)).json()["workout_data"]["name"] == "first"


async def test_an_unversioned_client_keeps_todays_behaviour(db, client):
    """The legacy branch. A deployed old client must not be broken or 409'd.

    Rejecting it would drop the user's in-progress workout on a client we
    cannot update in the same deploy.
    """
    uid = await _make_user(db, "fence-legacy@example.com")
    h = _auth(uid)

    first = await client.put(ACTIVE, json=_body("legacy one"), headers=h)
    second = await client.put(ACTIVE, json=_body("legacy two"), headers=h)

    assert [first.status_code, second.status_code] == [200, 200]
    assert (await client.get(ACTIVE, headers=h)).json()["workout_data"]["name"] == "legacy two"
    assert await _row_count(db, uid) == 1


async def test_an_unversioned_write_advances_the_bound_so_new_clients_rebase(db, client):
    """An old client's write must not strand a sequenced client.

    It wins by arrival (the stated transition limitation), but it advances the
    high-water mark, so the new client learns a real bound and rebases above
    it rather than being rejected for ever.
    """
    uid = await _make_user(db, "fence-legacy-bound@example.com")
    h = _auth(uid)
    await client.put(ACTIVE, json=_body("sequenced", client_seq=4), headers=h)

    await client.put(ACTIVE, json=_body("legacy"), headers=h)          # -> 5
    stale = await client.put(ACTIVE, json=_body("stale", client_seq=5), headers=h)
    assert stale.status_code == 409
    bound = stale.json()["client_seq"]

    rebased = await client.put(ACTIVE, json=_body("rebased", client_seq=bound + 1), headers=h)
    assert rebased.status_code == 200


async def test_the_fence_is_owner_scoped(db, client):
    """One user's high sequence must not fence another user out."""
    a = await _make_user(db, "fence-owner-a@example.com")
    b = await _make_user(db, "fence-owner-b@example.com")
    await client.put(ACTIVE, json=_body("A", client_seq=99), headers=_auth(a))

    r = await client.put(ACTIVE, json=_body("B", client_seq=1), headers=_auth(b))
    assert r.status_code == 200
    assert (await client.get(ACTIVE, headers=_auth(b))).json()["workout_data"]["name"] == "B"


async def test_a_concurrent_clear_cannot_turn_a_successful_save_into_a_500(db, client):
    """Review found this shape, and then found the first version of this test
    could not prove it: two parallel requests may simply serialize, so it
    passed whether or not the window existed.

    Pinned deterministically instead. The row is hard-deleted from an
    INDEPENDENT connection at exactly the old read-back boundary — after the
    write has committed, before the response is built. A handler that reads the
    row back there finds nothing and raises, which the client queue then
    retries for ever. Building from RETURNING has no such window.
    """
    import psycopg
    from app.routers import workouts as workouts_router
    from tests.conftest import TEST_DATABASE_URL

    uid = await _make_user(db, "fence-save-vs-clear@example.com")
    h = _auth(uid)
    await client.put(ACTIVE, json=_body("seed", client_seq=1), headers=h)

    real = workouts_router._write_active
    fired = {"n": 0}

    async def _clear_in_the_window(*args, **kwargs):
        row = await real(*args, **kwargs)
        # Independent connection: the handler's own session must not be able to
        # see or serialize with this, or the window is not reproduced.
        with psycopg.connect(
            TEST_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"),
            autocommit=True,
        ) as c:
            c.execute("DELETE FROM active_workout WHERE user_id = %s", (uid,))
        fired["n"] += 1
        return row

    workouts_router._write_active = _clear_in_the_window
    try:
        r = await client.put(ACTIVE, json=_body("saved", client_seq=2), headers=h)
    finally:
        workouts_router._write_active = real

    assert fired["n"] == 1, "the interleaving never ran; this test proved nothing"
    assert r.status_code == 200, (
        f"a concurrent clear turned a successful save into {r.status_code} — "
        "the response is being read back after the commit"
    )
    assert r.json()["workout_data"]["name"] == "saved"
    assert r.json()["client_seq"] == 2


async def test_the_409_body_matches_the_schema_the_route_advertises(db, client):
    """The wire shape must equal `ActiveWorkoutConflict`, FLAT.

    Review caught these diverging: `HTTPException(detail={...})` nests the body
    one level deeper than the declared model, so 3b would follow the OpenAPI
    schema, read `body.client_seq`, get undefined, and be unable to rebase —
    losing the user's edit. The earlier tests read the nested shape, so they
    documented the bug instead of catching it.

    Asserted against the model itself rather than a hand-written dict, so the
    two cannot drift apart again.
    """
    from app.schemas import ActiveWorkoutConflict

    uid = await _make_user(db, "fence-409-shape@example.com")
    h = _auth(uid)
    await client.put(ACTIVE, json=_body("newer", client_seq=9), headers=h)

    r = await client.put(ACTIVE, json=_body("older", client_seq=2), headers=h)
    assert r.status_code == 409
    body = r.json()

    assert set(body) == set(ActiveWorkoutConflict.model_fields), (
        f"409 body {sorted(body)} does not match the advertised schema "
        f"{sorted(ActiveWorkoutConflict.model_fields)}"
    )
    assert isinstance(body["detail"], str), "detail must be a string, not a nested object"
    assert body["client_seq"] == 9
    # It must validate as the declared model — the contract 3b will code against.
    assert ActiveWorkoutConflict(**body).client_seq == 9


async def test_the_clear_409_uses_the_same_body_shape(db, client):
    uid = await _make_user(db, "fence-409-clear-shape@example.com")
    h = _auth(uid)
    await client.put(ACTIVE, json=_body("newer", client_seq=9), headers=h)

    r = await client.delete(f"{ACTIVE}?client_seq=2", headers=h)
    assert r.status_code == 409
    assert r.json()["client_seq"] == 9
    assert isinstance(r.json()["detail"], str)
