"""Per-node unit tests with mocked services."""
from __future__ import annotations

import pytest

from app.engine.context import RunContext
from app.engine.nodes.base import NODE_REGISTRY, NodeError


def _ctx(services, input=None):
    return RunContext(input or {}, services)


# ─── input ───────────────────────────────────────────────────────────────────
async def test_input_node_emits_fields(services):
    node = NODE_REGISTRY["input"]
    cfg = {"fields": [{"name": "question", "type": "string", "required": True}]}
    out = await node.execute({}, cfg, _ctx(services, {"question": "hello"}))
    assert out == {"question": "hello"}


async def test_input_node_missing_required_raises(services):
    node = NODE_REGISTRY["input"]
    cfg = {"fields": [{"name": "question", "type": "string", "required": True}]}
    with pytest.raises(NodeError):
        await node.execute({}, cfg, _ctx(services, {}))


async def test_input_node_default_used(services):
    node = NODE_REGISTRY["input"]
    cfg = {"fields": [{"name": "lang", "type": "string", "required": False, "default": "en"}]}
    out = await node.execute({}, cfg, _ctx(services, {}))
    assert out == {"lang": "en"}


def test_input_node_declares_one_port_per_field():
    node = NODE_REGISTRY["input"]
    ports = node.declare_ports({"fields": [{"name": "a", "type": "string"}, {"name": "b", "type": "number"}]})
    assert [p.name for p in ports.outputs] == ["a", "b"]
    assert ports.inputs == []


# ─── prompt ──────────────────────────────────────────────────────────────────
async def test_prompt_node_substitutes(services):
    node = NODE_REGISTRY["prompt"]
    out = await node.execute({"a": "x", "b": "y"}, {"template": "{{a}} - {{b}}"}, _ctx(services))
    assert out["prompt"] == "x - y"


async def test_prompt_node_renders_chunks_ordered(services):
    node = NODE_REGISTRY["prompt"]
    chunks = [
        {"text": "first", "score": 0.9, "metadata": {}},
        {"text": "second", "score": 0.5, "metadata": {}},
    ]
    out = await node.execute({"context": chunks}, {"template": "{{context}}"}, _ctx(services))
    assert "[1]" in out["prompt"] and "[2]" in out["prompt"]
    assert out["prompt"].index("first") < out["prompt"].index("second")


def test_prompt_node_declares_input_per_var():
    node = NODE_REGISTRY["prompt"]
    ports = node.declare_ports({"template": "{{x}} {{y}} {{x}}"})
    assert sorted(p.name for p in ports.inputs) == ["x", "y"]


# ─── retrieval ───────────────────────────────────────────────────────────────
async def test_retrieval_node_returns_relevant_chunks(seeded_services):
    node = NODE_REGISTRY["retrieval"]
    cfg = {"knowledge_base_id": "kb_123", "top_k": 2}
    out = await node.execute({"query": "refund within 30 days"}, cfg, _ctx(seeded_services))
    chunks = out["chunks"]
    assert 1 <= len(chunks) <= 2
    # the most relevant chunk should be the refund policy
    assert "refund" in chunks[0]["text"].lower()


async def test_retrieval_top_k_caps_count(seeded_services):
    node = NODE_REGISTRY["retrieval"]
    out = await node.execute({"query": "policy"}, {"knowledge_base_id": "kb_123", "top_k": 1}, _ctx(seeded_services))
    assert len(out["chunks"]) == 1


async def test_retrieval_unknown_kb_raises(services):
    node = NODE_REGISTRY["retrieval"]
    with pytest.raises(NodeError):
        await node.execute({"query": "x"}, {"knowledge_base_id": "nope"}, _ctx(services))


# ─── model ───────────────────────────────────────────────────────────────────
async def test_model_node_returns_completion_and_records_usage(services):
    node = NODE_REGISTRY["model"]
    ctx = _ctx(services)
    ctx.start_span(type("N", (), {"id": "m", "type": "model"})(), 0)  # give it a current span
    out = await node.execute({"prompt": "hello"}, {"model": "mock/x"}, ctx)
    assert out["completion"]
    assert ctx.current_span.tokens_in and ctx.current_span.tokens_out
    assert ctx.current_span.cost_usd is not None


async def test_model_node_needs_input(services):
    node = NODE_REGISTRY["model"]
    with pytest.raises(NodeError):
        await node.execute({}, {"model": "mock/x"}, _ctx(services))


# ─── output ──────────────────────────────────────────────────────────────────
async def test_output_node_sets_final_output(services):
    node = NODE_REGISTRY["output"]
    ctx = _ctx(services)
    await node.execute({"result": "the answer"}, {"format": "text"}, ctx)
    assert ctx.final_output == "the answer"


async def test_output_node_json_parses_string(services):
    node = NODE_REGISTRY["output"]
    ctx = _ctx(services)
    await node.execute({"result": '{"a": 1}'}, {"format": "json"}, ctx)
    assert ctx.final_output == {"a": 1}
