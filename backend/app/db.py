"""Async SQLAlchemy engine, session factory, and declarative Base."""
from __future__ import annotations

from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# libpq-only query params that the asyncpg driver rejects (Neon/Supabase append these)
_LIBPQ_ONLY = {"sslmode", "channel_binding", "options", "target_session_attrs"}
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", ""}


def prepare_async_dsn(url: str) -> str:
    """Normalize a DSN for the asyncpg driver: ensure the async driver and strip
    libpq-only query params that asyncpg rejects (e.g. Neon's ?sslmode=require)."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    parts = urlsplit(url)
    if parts.query:
        kept = [(k, v) for k, v in parse_qsl(parts.query) if k not in _LIBPQ_ONLY]
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment))
    return url


def ssl_connect_args(url: str) -> dict:
    """Enable TLS for remote managed databases (Neon/Supabase); skip for localhost."""
    host = (urlsplit(url).hostname or "").lower()
    return {"ssl": True} if host not in _LOCAL_HOSTS else {}


engine = create_async_engine(
    prepare_async_dsn(settings.database_url),
    pool_pre_ping=True,
    connect_args=ssl_connect_args(settings.database_url),
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
