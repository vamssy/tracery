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
