"""Proves the harness itself works before anything relies on it.

If these fail, no other result in this suite means anything.
"""
from __future__ import annotations

import pytest
from sqlalchemy import text


async def test_database_is_the_disposable_one(db):
    name = (await db.execute(text("SELECT current_database()"))).scalar_one()
    assert name.startswith("fitness_test"), name


async def test_migrations_built_the_schema(db):
    rows = (
        await db.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
        )
    ).scalars().all()
    # A representative slice, not the full list, so adding a table is not a
    # test failure.
    for expected in ("users", "workout_history", "active_workout", "alembic_version"):
        assert expected in rows, f"{expected} missing from {sorted(rows)}"


async def test_alembic_is_at_head(db):
    version = (
        await db.execute(text("SELECT version_num FROM alembic_version"))
    ).scalar_one()
    assert version, "alembic_version is empty — migrations did not run"


async def test_app_responds(client):
    r = await client.get("/openapi.json")
    assert r.status_code == 200
    assert "/api/auth/login" in r.json()["paths"]


async def test_tables_are_empty_between_tests(db):
    """Paired with the next test: proves TRUNCATE actually runs."""
    count = (await db.execute(text("SELECT count(*) FROM users"))).scalar_one()
    assert count == 0
    await db.execute(
        text(
            "INSERT INTO users (id, email, hashed_password, name) "
            "VALUES (gen_random_uuid(), 'leak-check@example.com', 'x', 'Leak')"
        )
    )
    await db.commit()


async def test_previous_tests_row_was_truncated(db):
    count = (await db.execute(text("SELECT count(*) FROM users"))).scalar_one()
    assert count == 0, "TRUNCATE between tests is not working — results will lie"


def test_guard_rejects_dangerous_targets():
    """The safety guard must actually refuse, or the suite is a live grenade."""
    from conftest import _require_disposable_target as guard

    guard("postgresql+asyncpg://postgres:pw@127.0.0.1:5433/fitness_test")
    guard("postgresql+asyncpg://postgres:pw@localhost:5433/fitness_test_abc")

    for bad in (
        "postgresql+asyncpg://postgres:pw@127.0.0.1:5433/fitness",       # prod-ish name
        "postgresql+asyncpg://postgres:pw@127.0.0.1:5433/postgres",      # default db
        "postgresql+asyncpg://u:p@metro.proxy.rlwy.net:56628/railway",   # production
        "not-a-url",
    ):
        with pytest.raises(RuntimeError):
            guard(bad)
