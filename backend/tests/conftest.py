"""Test harness for the FastAPI backend.

Runs against a REAL PostgreSQL: the models use ``postgresql.UUID`` and
``JSONB``, so SQLite cannot stand in.

Safety comes first here. The suite runs ``TRUNCATE ... CASCADE`` between
tests and ``alembic downgrade base`` at teardown, so pointing it at the
wrong database would be destructive. ``_require_disposable_target`` refuses
to run unless BOTH the host and the database NAME look like a throwaway --
a host allowlist alone is not enough, because a developer's own local
database would satisfy it.

Setup: see tests/README.md.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

ALLOWED_HOSTS = {"localhost", "127.0.0.1", "::1"}
ALLOWED_DB_RE = re.compile(r"^fitness_test(_[a-z0-9]+)?$")

_URL_RE = re.compile(
    r"^postgresql\+asyncpg://(?P<user>[^:]+):(?P<pw>[^@]*)@"
    r"(?P<host>[^:/]+):(?P<port>\d+)/(?P<db>[A-Za-z0-9_]+)$"
)


def _require_disposable_target(url: str) -> tuple[str, str]:
    """Refuse anything that is not an obvious throwaway. Returns (host, db)."""
    m = _URL_RE.match(url)
    if not m:
        raise RuntimeError(
            "TEST_DATABASE_URL must look like "
            "postgresql+asyncpg://user:pw@host:port/dbname"
        )
    host, db = m.group("host"), m.group("db")

    if host not in ALLOWED_HOSTS and os.getenv("TEST_DB_ALLOW_REMOTE") != "1":
        raise RuntimeError(
            f"refusing to run against non-local host {host!r}. "
            "Set TEST_DB_ALLOW_REMOTE=1 only if you are certain."
        )
    if not ALLOWED_DB_RE.match(db):
        raise RuntimeError(
            f"refusing to run against database {db!r}. This suite TRUNCATEs "
            "every table and runs 'alembic downgrade base'. The database name "
            "must match 'fitness_test' or 'fitness_test_<suffix>'."
        )
    # Belt and braces: never the production host, whatever the name says.
    if "rlwy.net" in host or "railway" in host:
        raise RuntimeError("refusing to run against a Railway host")
    return host, db


TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:fitdev_local_only@127.0.0.1:5433/fitness_test",
)
_HOST, _DB = _require_disposable_target(TEST_DATABASE_URL)

# Must be set BEFORE importing app.database or app.main: database.py builds its
# engine at import time, alembic/env.py imports that module, and load_dotenv()
# does not override an existing environment variable.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("SECRET_KEY", "test-only-secret-not-used-in-production")

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.database import Base, get_db  # noqa: E402
from main import app  # noqa: E402  (the FastAPI instance lives in backend/main.py)


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


SYNC_DSN = TEST_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


def _alembic(direction: str) -> None:
    """Run Alembic in a SUBPROCESS.

    alembic/env.py calls asyncio.run internally. Calling it in-process while
    pytest-asyncio holds a session event loop hangs the run -- that cost an
    afternoon, so it is isolated rather than worked around.
    """
    import subprocess

    env = dict(os.environ, DATABASE_URL=TEST_DATABASE_URL)
    proc = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", direction,
         "head" if direction == "upgrade" else "base"],
        cwd=str(BACKEND_DIR), env=env, capture_output=True, text=True, timeout=180,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"alembic {direction} failed\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )


def _terminate_other_connections() -> int:
    """Drop every other connection to the test database.

    Any transaction left open blocks TRUNCATE and blocks Alembic's DDL, and
    a blocked Alembic looks exactly like a broken migration. Safe only
    because _require_disposable_target has already proved this database is
    a throwaway.
    """
    import psycopg

    with psycopg.connect(SYNC_DSN, connect_timeout=15, autocommit=True) as conn:
        rows = conn.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = current_database() AND pid <> pg_backend_pid()"
        ).fetchall()
    return len(rows)


@pytest.fixture(scope="session", autouse=True)
def migrated_schema():
    """Build the schema with the real migrations, not metadata.create_all.

    Running them makes the migrations a tested artifact and catches
    model/migration drift, which is the point of a schema commit.
    """
    _terminate_other_connections()
    _alembic("upgrade")
    yield
    if os.getenv("TEST_KEEP_SCHEMA") == "1":
        return
    _terminate_other_connections()
    _alembic("downgrade")


@pytest.fixture
async def engine():
    """Function-scoped on purpose.

    A session-scoped async engine outlives the event loop on Windows: the
    ProactorEventLoop closes first and NullPool then tries to close asyncpg
    connections against a dead loop ("'NoneType' object has no attribute
    'send'"). One engine per test, disposed while its loop is still alive,
    removes the whole class of problem. NullPool means there is no pool to
    lose, so the cost is a connection per test.
    """
    eng = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool, future=True)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture(autouse=True)
def clean_tables(migrated_schema):
    """Empty every table between tests, leaving the schema in place.

    Deliberately SYNCHRONOUS (psycopg, not the async engine): an async
    autouse fixture is applied to sync tests too, and pytest-asyncio cannot
    resolve that -- it hangs rather than failing.
    """
    import psycopg

    names = [t.name for t in reversed(Base.metadata.sorted_tables)]
    with psycopg.connect(SYNC_DSN, connect_timeout=15, autocommit=True) as conn:
        # Never wait forever on a lock: if something left a transaction open,
        # fail loudly with a diagnosis instead of hanging the whole run.
        conn.execute("SET lock_timeout = '10s'")
        try:
            conn.execute(
                "TRUNCATE TABLE " + ", ".join(f'"{n}"' for n in names) + " CASCADE"
            )
        except psycopg.errors.LockNotAvailable as exc:  # pragma: no cover
            blockers = conn.execute(
                "SELECT pid, state, left(coalesce(query,''), 80) "
                "FROM pg_stat_activity WHERE datname = current_database() "
                "AND pid <> pg_backend_pid() AND xact_start IS NOT NULL"
            ).fetchall()
            raise RuntimeError(
                "TRUNCATE blocked — a previous run left a transaction open.\n"
                + "\n".join(f"  pid={p} state={s} query={q!r}" for p, s, q in blockers)
            ) from exc
    yield


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """The limiter is module-level and never evicts, so hits leak across tests.

    Without this the eleventh request in a session trips a 10/hour limit and
    an unrelated test fails -- or a 429 test passes for the wrong reason.
    """
    from app import rate_limit

    limiter = getattr(rate_limit, "_limiter", None)
    if limiter is not None and hasattr(limiter, "_windows"):
        limiter._windows.clear()
    yield
    if limiter is not None and hasattr(limiter, "_windows"):
        limiter._windows.clear()


@pytest.fixture
async def db(session_factory):
    """A session that ALWAYS rolls back.

    Without the explicit rollback a test that only reads still leaves the
    connection 'idle in transaction', and the next test's TRUNCATE blocks
    on its lock. That deadlocks the whole run and, once several processes
    pile up, blocks Alembic too.
    """
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.rollback()


@pytest.fixture
async def client(session_factory):
    """ASGI client with get_db overridden onto the test engine.

    Every router depends on the single get_db function object, and nothing
    uses AsyncSessionLocal directly outside database.py, so this one override
    covers all database access.
    """
    import httpx

    async def _override():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)
