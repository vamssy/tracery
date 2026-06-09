"""Shared fixtures: a Services bundle backed by the mock provider + an in-memory
vector store, with a small KB seeded for retrieval tests."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.engine.context import Services
from app.services.providers import MockProvider
from app.services.retrieval import InMemoryStore, RetrievalService

_BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture
def providers() -> MockProvider:
    return MockProvider()


@pytest.fixture
def store() -> InMemoryStore:
    return InMemoryStore()


@pytest.fixture
def retrieval(store: InMemoryStore, providers: MockProvider) -> RetrievalService:
    return RetrievalService(store, providers)


@pytest.fixture
def services(retrieval: RetrievalService, providers: MockProvider) -> Services:
    return Services(providers=providers, retrieval=retrieval)


@pytest.fixture
async def seeded_services(services: Services) -> Services:
    """Services with kb_123 ingested from sample_kb.json."""
    data = json.loads((_BACKEND / "sample_kb.json").read_text())
    for doc in data["documents"]:
        await services.retrieval.ingest(data["kb_id"], doc["text"], doc.get("metadata"))
    return services


@pytest.fixture
def sample_rag_spec() -> dict:
    return json.loads((_BACKEND / "sample_rag.json").read_text())


# ─── Integration (DB-backed API) fixtures ────────────────────────────────────
import os  # noqa: E402

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://tracery:tracery@localhost:5433/tracery_test",
)

_TABLES = ["spans", "runs", "deployments", "workflows", "chunks", "knowledge_bases"]


@pytest.fixture
async def db_engine():
    """Function-scoped engine on the test DB (function scope avoids the pytest-asyncio
    cross-loop / ScopeMismatch trap). Skips the test if the DB is unreachable."""
    import app.models  # noqa: F401 — populate metadata
    from app.db import Base

    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"test database not available: {e}")
    yield engine
    await engine.dispose()


@pytest.fixture
async def api_client(db_engine):
    """httpx client bound to the app with get_session overridden to the test DB."""
    from httpx import ASGITransport, AsyncClient

    from app.db import get_session
    from app.main import app

    async with db_engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {', '.join(_TABLES)} RESTART IDENTITY CASCADE"))

    TestSession = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override_get_session():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
