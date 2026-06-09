"""Retrieval subsystem (RAG): ingestion (chunk → embed → store) and query-time
retrieval (embed query → vector search → top-k chunks).

The vector store is pluggable behind `RetrievalStore`:
  - InMemoryStore : headless CLI + tests (pure Python cosine).
  - PgVectorStore : Phase 2, backed by Postgres + pgvector.
The service and the Retrieval node are identical across both.
"""
from __future__ import annotations

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.config import settings
from app.services.providers import ProviderLayer


class KnowledgeBaseNotFound(Exception):
    def __init__(self, kb_id: str):
        super().__init__(f"unknown knowledge_base_id: {kb_id!r}")
        self.kb_id = kb_id


@dataclass
class ScoredChunk:
    text: str
    score: float
    metadata: dict = field(default_factory=dict)


# ─── Chunking ────────────────────────────────────────────────────────────────
def chunk_text(text: str, *, chunk_tokens: int = 800, overlap_tokens: int = 100) -> list[str]:
    """Fixed-size word-window chunker with overlap. Tokens are approximated by
    words (~1.3 words/token), which is plenty for v1 retrieval."""
    words = text.split()
    if not words:
        return []
    size = max(1, int(chunk_tokens / 1.3))
    overlap = max(0, int(overlap_tokens / 1.3))
    step = max(1, size - overlap)
    chunks = []
    for start in range(0, len(words), step):
        window = words[start : start + size]
        if window:
            chunks.append(" ".join(window))
        if start + size >= len(words):
            break
    return chunks


# ─── Cosine (vectors are L2-normalized by the embedder, but normalize anyway) ─
def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


# ─── Store interface ─────────────────────────────────────────────────────────
class RetrievalStore(ABC):
    @abstractmethod
    async def kb_exists(self, kb_id: str) -> bool: ...

    @abstractmethod
    async def add(self, kb_id: str, items: list[tuple[str, list[float], dict]]) -> None: ...

    @abstractmethod
    async def search(self, kb_id: str, embedding: list[float], top_k: int) -> list[ScoredChunk]: ...


class InMemoryStore(RetrievalStore):
    """Process-local store for the headless CLI and tests."""

    def __init__(self):
        # kb_id -> list of (text, embedding, metadata)
        self._kbs: dict[str, list[tuple[str, list[float], dict]]] = {}

    def create_kb(self, kb_id: str) -> None:
        self._kbs.setdefault(kb_id, [])

    async def kb_exists(self, kb_id: str) -> bool:
        return kb_id in self._kbs

    async def add(self, kb_id: str, items: list[tuple[str, list[float], dict]]) -> None:
        self._kbs.setdefault(kb_id, []).extend(items)

    async def search(self, kb_id: str, embedding: list[float], top_k: int) -> list[ScoredChunk]:
        rows = self._kbs.get(kb_id, [])
        scored = [
            ScoredChunk(text=t, score=cosine(embedding, emb), metadata=meta) for (t, emb, meta) in rows
        ]
        scored.sort(key=lambda s: s.score, reverse=True)
        return scored[:top_k]


# ─── Service ─────────────────────────────────────────────────────────────────
class RetrievalService:
    def __init__(self, store: RetrievalStore, providers: ProviderLayer, embedding_model: str | None = None):
        self.store = store
        self.providers = providers
        self.embedding_model = embedding_model or settings.default_embedding_model

    async def ingest(self, kb_id: str, text: str, metadata: dict | None = None) -> int:
        """Chunk → embed → store. Returns the number of chunks ingested."""
        chunks = chunk_text(text)
        if not chunks:
            return 0
        embeddings = await self.providers.embed(self.embedding_model, chunks)
        items = []
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings, strict=False)):
            meta = {**(metadata or {}), "chunk_index": i}
            items.append((chunk, emb, meta))
        await self.store.add(kb_id, items)
        return len(chunks)

    async def query(
        self,
        kb_id: str,
        query: str,
        *,
        top_k: int = 4,
        score_threshold: float = 0.0,
        embedding_model: str | None = None,
    ) -> list[dict]:
        if not await self.store.kb_exists(kb_id):
            raise KnowledgeBaseNotFound(kb_id)
        model = embedding_model or self.embedding_model
        embedding = (await self.providers.embed(model, [query]))[0]
        # over-fetch a little, then threshold-filter and cap at top_k
        scored = await self.store.search(kb_id, embedding, max(top_k, top_k * 2))
        out = [
            {"text": s.text, "score": round(s.score, 6), "metadata": s.metadata}
            for s in scored
            if s.score >= score_threshold
        ]
        return out[:top_k]
