"""Evaluator + Tool node tests (spec §5.6, §5.7)."""
from __future__ import annotations

import pytest

from app.engine.context import RunContext, Services
from app.engine.nodes.base import NODE_REGISTRY, NodeError
from app.services.providers import Completion, MockProvider
from app.services.retrieval import InMemoryStore, RetrievalService


def _ctx(services):
    ctx = RunContext({}, services)
    ctx.start_span(type("N", (), {"id": "x", "type": "x"})(), 0)  # give it a current span
    return ctx


# ─── evaluator ───────────────────────────────────────────────────────────────
async def test_evaluator_keyword_scores_presence(services):
    node = NODE_REGISTRY["evaluator"]
    cfg = {"strategy": "keyword", "criteria": "refund, 30 days", "pass_threshold": 0.5}
    out = await node.execute({"output": "Refunds within 30 days"}, cfg, _ctx(services))
    assert out["score"] == 1.0
    assert out["passed"]["passed"] is True


async def test_evaluator_keyword_below_threshold(services):
    node = NODE_REGISTRY["evaluator"]
    cfg = {"strategy": "keyword", "criteria": "refund, warranty, shipping", "pass_threshold": 0.9}
    out = await node.execute({"output": "We offer refunds."}, cfg, _ctx(services))
    assert out["score"] < 0.9
    assert out["passed"]["passed"] is False


async def test_evaluator_regex(services):
    node = NODE_REGISTRY["evaluator"]
    cfg = {"strategy": "regex", "criteria": r"\d+ days", "pass_threshold": 1.0}
    assert (await node.execute({"output": "30 days"}, cfg, _ctx(services)))["passed"]["passed"] is True
    assert (await node.execute({"output": "soon"}, cfg, _ctx(services)))["passed"]["passed"] is False


class _JudgeProvider(MockProvider):
    async def complete(self, model, messages, **params):
        return Completion(
            text='{"score": 0.9, "reason": "accurate"}', tokens_in=10, tokens_out=10, cost_usd=0.0001
        )


async def test_evaluator_llm_judge_parses_json():
    provider = _JudgeProvider()
    services = Services(providers=provider, retrieval=RetrievalService(InMemoryStore(), provider))
    node = NODE_REGISTRY["evaluator"]
    cfg = {"strategy": "llm_judge", "criteria": "accurate?", "pass_threshold": 0.7}
    out = await node.execute({"output": "an answer"}, cfg, _ctx(services))
    assert out["score"] == 0.9
    assert out["passed"]["passed"] is True


# ─── tool ────────────────────────────────────────────────────────────────────
async def test_tool_calculator(services):
    node = NODE_REGISTRY["tool"]
    out = await node.execute({"expression": "2 + 3 * 4"}, {"tool": "calculator"}, _ctx(services))
    assert out["result"]["value"] == 14


async def test_tool_calculator_rejects_non_arithmetic(services):
    node = NODE_REGISTRY["tool"]
    with pytest.raises(NodeError):
        await node.execute({"expression": "__import__('os')"}, {"tool": "calculator"}, _ctx(services))


async def test_tool_http_get_enforces_allowlist(services):
    node = NODE_REGISTRY["tool"]
    # no allow-list -> refuse
    with pytest.raises(NodeError):
        await node.execute(
            {"url": "https://evil.example.com/x"}, {"tool": "http_get", "allowed_domains": ["good.com"]}, _ctx(services)
        )


async def test_tool_unknown_rejected(services):
    node = NODE_REGISTRY["tool"]
    with pytest.raises(NodeError):
        await node.execute({}, {"tool": "rm_rf"}, _ctx(services))


def test_node_registry_has_seven_types():
    assert set(NODE_REGISTRY) == {"input", "retrieval", "prompt", "model", "output", "evaluator", "tool"}
