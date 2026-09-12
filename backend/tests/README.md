# Backend test harness

Runs the real FastAPI app against a real PostgreSQL, with the schema built
by the real Alembic migrations.

## Setup (once)

PostgreSQL **18.6** locally, matching production exactly:

```powershell
winget install --id PostgreSQL.PostgreSQL.18 --silent --override `
  "--mode unattended --unattendedmodeui none --superpassword <pw> `
   --servicename postgresql-18 --serverport 5433 `
   --enable-components server,commandlinetools --disable-components pgAdmin,stackbuilder"
```

Port **5433** deliberately — production is 5432, and nothing here should
ever be one typo away from it.

```powershell
psql -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE fitness_test;"
python -m pip install -r requirements.txt -r requirements-dev.txt
```

## Running

```bash
cd backend
python -m pytest -q
```

Override the target with `TEST_DATABASE_URL`. The default is
`postgresql+asyncpg://postgres:fitdev_local_only@127.0.0.1:5433/fitness_test`.

`TEST_KEEP_SCHEMA=1` skips the teardown downgrade when you want to inspect
the database afterwards.

## Safety

The suite runs `TRUNCATE ... CASCADE` between tests and
`alembic downgrade base` at the end, so pointing it at the wrong database
would be destructive. `_require_disposable_target` refuses to start unless
**both** hold:

- host is `localhost` / `127.0.0.1` (override with `TEST_DB_ALLOW_REMOTE=1`)
- database name matches `fitness_test` or `fitness_test_<suffix>`

A host allowlist alone is not enough — a developer's own local database
would pass it. Railway hosts are rejected outright.
`test_guard_rejects_dangerous_targets` asserts the guard actually refuses.

## Four things that cost real time — do not undo them

1. **Alembic runs in a subprocess.** `alembic/env.py` calls `asyncio.run`
   internally; calling it in-process under pytest-asyncio hangs the run
   with no output.
2. **Fixture and test loop scopes must match** (`function` for both).
   Mismatched scopes build the engine on one event loop and close it on
   another; on Windows that surfaces at teardown as
   `'NoneType' object has no attribute 'send'`.
3. **The engine is function-scoped and disposed explicitly.** A
   session-scoped async engine outlives its loop.
4. **The `db` session always rolls back, and autouse fixtures are
   synchronous.** A leaked `idle in transaction` connection blocks the next
   `TRUNCATE`, and once several pile up they block Alembic too — which
   looks exactly like a broken migration but is not. `clean_tables` sets a
   10-second `lock_timeout` and reports the blocking pids rather than
   hanging. An async autouse fixture also silently hangs *sync* tests.

## What the harness gives you

- `client` — httpx `AsyncClient` over ASGI, with `get_db` overridden onto
  the test database. Every router depends on that one function, and
  nothing uses `AsyncSessionLocal` directly outside `database.py`, so the
  single override covers all database access.
- `db` — an `AsyncSession` on the same database.
- `engine`, `session_factory` — if you need them directly.
- Automatic per-test truncation and rate-limiter reset. The limiter is
  module-level and never evicts, so without the reset the eleventh request
  in a session trips a 10/hour limit and an unrelated test fails.
