"""Postgres + pgvector implementation of RetrievalStore (spec §8).

The Retrieval node and RetrievalService are identical whether backed by this or
the in-memory store — only the store changes.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tables import Chunk, KnowledgeBase
from app.services.retrieval import RetrievalStore, ScoredChunk


def _as_uuid(kb_id: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(kb_id))
    except (ValueError, TypeError):
        return None


class PgVectorStore(RetrievalStore):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def kb_exists(self, kb_id: str) -> bool:
        kid = _as_uuid(kb_id)
        if kid is None:
            return False
        row = await self.session.get(KnowledgeBase, kid)
        return row is not None

    async def add(self, kb_id: str, items: list[tuple[str, list[float], dict]]) -> None:
        kid = _as_uuid(kb_id)
        if kid is None:
            raise ValueError(f"invalid kb_id: {kb_id!r}")
        self.session.add_all(
            [Chunk(kb_id=kid, text=text, embedding=emb, doc_metadata=meta) for (text, emb, meta) in items]
        )
        await self.session.flush()

    async def search(self, kb_id: str, embedding: list[float], top_k: int) -> list[ScoredChunk]:
        kid = _as_uuid(kb_id)
        if kid is None:
            return []
        # cosine_distance ∈ [0, 2]; similarity = 1 - distance
        distance = Chunk.embedding.cosine_distance(embedding)
        stmt = (
            select(Chunk.text, Chunk.doc_metadata, distance.label("distance"))
            .where(Chunk.kb_id == kid)
            .order_by(distance)
            .limit(top_k)
        )
        rows = (await self.session.execute(stmt)).all()
        return [
            ScoredChunk(text=text, score=1.0 - float(dist), metadata=meta or {})
            for (text, meta, dist) in rows
        ]
