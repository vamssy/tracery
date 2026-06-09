"""Shared API dependencies: auth gate, DB session, and the per-request Services
bundle the engine needs."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.engine.context import Services
from app.services.pgvector_store import PgVectorStore
from app.services.providers import ProviderLayer, get_provider
from app.services.retrieval import RetrievalService

# Provider layer is stateless — one process-wide instance is fine.
_providers: ProviderLayer = get_provider()


def get_providers() -> ProviderLayer:
    return _providers


async def require_auth(authorization: str | None = Header(default=None)) -> None:
    """Bearer-token gate. Blank API_KEY disables auth (single-user v1)."""
    if not settings.api_key:
        return
    if authorization != f"Bearer {settings.api_key}":
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")


def build_services(session: AsyncSession) -> Services:
    retrieval = RetrievalService(PgVectorStore(session), _providers)
    return Services(providers=_providers, retrieval=retrieval)


def get_services(session: AsyncSession = Depends(get_session)) -> Services:
    return build_services(session)
