"""Model provider abstraction — the ONLY place that talks to an LLM/embedding
provider. No node calls a provider SDK directly (spec §7).

Two backends behind one interface:
  - MockProvider   : deterministic, no API key — runs everything (CI/tests/dev).
  - LiteLLMProvider: real chat + embeddings via LiteLLM; `model` string picks the vendor.

Switching providers is therefore a config change, not a code change.
"""
from __future__ import annotations

import hashlib
import math
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.config import settings


@dataclass
class Completion:
    text: str
    tokens_in: int
    tokens_out: int
    cost_usd: float


class ProviderError(Exception):
    """A provider call failed (timeout, rate limit, auth, bad model, ...)."""


class ProviderLayer(ABC):
    @abstractmethod
    async def complete(self, model: str, messages: list[dict], **params) -> Completion: ...

    @abstractmethod
    async def embed(self, model: str, texts: list[str]) -> list[list[float]]: ...


# ─── Mock (deterministic, key-free) ──────────────────────────────────────────
def _approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _hash_embedding(text: str, dim: int) -> list[float]:
    """Deterministic bag-of-tokens hashing embedding, L2-normalized. Gives a real
    lexical-overlap similarity signal so mock retrieval returns relevant chunks."""
    vec = [0.0] * dim
    for tok in re.findall(r"[a-z0-9]+", text.lower()):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if (h // dim) % 2 == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class MockProvider(ProviderLayer):
    async def complete(self, model: str, messages: list[dict], **params) -> Completion:
        user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        snippet = " ".join(str(user).split())[:240]
        text = (
            "[mock-llm] Based on the provided context, here is a deterministic response. "
            f'Prompt preview: "{snippet}". '
            "Set LLM_PROVIDER=litellm with a model + API key for real completions."
        )
        tin = sum(_approx_tokens(str(m.get("content", ""))) for m in messages)
        tout = _approx_tokens(text)
        return Completion(text=text, tokens_in=tin, tokens_out=tout, cost_usd=round((tin + tout) * 1e-6, 6))

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        return [_hash_embedding(t, settings.embedding_dim) for t in texts]


# ─── LiteLLM (real) ──────────────────────────────────────────────────────────
class LiteLLMProvider(ProviderLayer):
    async def complete(self, model: str, messages: list[dict], **params) -> Completion:
        import litellm

        try:
            resp = await litellm.acompletion(model=model, messages=messages, **params)
        except Exception as e:  # noqa: BLE001 — normalize every provider error
            raise ProviderError(str(e)) from e

        text = resp.choices[0].message.content or ""
        usage = getattr(resp, "usage", None)
        tin = getattr(usage, "prompt_tokens", 0) or 0
        tout = getattr(usage, "completion_tokens", 0) or 0
        try:
            cost = float(litellm.completion_cost(completion_response=resp) or 0.0)
        except Exception:  # noqa: BLE001 — unknown model pricing
            cost = 0.0
        return Completion(text=text, tokens_in=tin, tokens_out=tout, cost_usd=round(cost, 6))

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        import litellm

        try:
            resp = await litellm.aembedding(model=model, input=texts)
        except Exception as e:  # noqa: BLE001
            raise ProviderError(str(e)) from e
        return [d["embedding"] for d in resp.data]


class HybridProvider(LiteLLMProvider):
    """Real chat via LiteLLM, deterministic local embeddings — so a chat-only
    provider (e.g. Groq) works for RAG without a separate embedding-model key,
    and stays consistent with KBs ingested by the mock embedder."""

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        return [_hash_embedding(t, settings.embedding_dim) for t in texts]


def get_provider() -> ProviderLayer:
    provider = settings.llm_provider.lower()
    if provider == "litellm":
        return LiteLLMProvider()
    if provider == "hybrid":
        return HybridProvider()
    return MockProvider()
