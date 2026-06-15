"""Async SQLAlchemy engine, session factory, and FastAPI dependency."""
import os

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

load_dotenv()

# Railway provides DATABASE_URL at runtime. The fallback keeps the module
# importable locally (engine creation is lazy and does not open a connection
# until a session is actually used) for tooling, tests, and Alembic.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://user:pass@localhost:5432/fitness",
)

engine = create_async_engine(DATABASE_URL, echo=False, future=True)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncSession:
    """Yield a database session and ensure it is closed afterwards."""
    async with AsyncSessionLocal() as session:
        yield session
