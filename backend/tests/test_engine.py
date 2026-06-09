"""End-to-end engine behavior: topological execution, state threading, trace
completeness, and clean failure semantics."""
from __future__ import annotations

import pytest

from app.engine.executor import run_workflow
from app.engine.graph import GraphSpec, parse_and_validate


def _node(id, type, config=None):
    return {"id": id, "type": type, "config": config or {}}


def _edge(id, s, sp, t, tp):
    return {"id": id, "source": s, "source_port": sp, "target": t, "target_port": tp}


async def test_sample_rag_runs_end_to_end(sample_rag_spec, seeded_services):
    result = await run_workflow(sample_rag_spec, {"question": "What is the refund policy?"}, seeded_services)

    assert result.status == "completed"
    assert isinstance(result.output, str) and result.output

    # one span per node, in topological order
    types_in_order = [s.node_type for s in result.spans]
    assert types_in_order == ["input", "retrieval", "prompt", "model", "output"]
    assert all(s.status == "ok" for s in result.spans)

    # trace completeness: every node produced a span with a latency
    assert all(s.latency_ms is not None for s in result.spans)

    # retrieval produced chunks
    ret = next(s for s in result.spans if s.node_type == "retrieval")
    assert ret.outputs["chunks"], "retrieval returned no chunks"

    # model span carries token + cost metadata; run totals are populated
    model = next(s for s in result.spans if s.node_type == "model")
    assert model.tokens_in and model.tokens_out
    assert model.cost_usd is not None
    assert result.total_cost_usd == pytest.approx(model.cost_usd)
    assert result.total_latency_ms >= 0


def test_topological_order_fan_out_fan_in(sample_rag_spec):
    """n_input fans out to retrieval+prompt; both fan in. Order must respect deps."""
    graph = parse_and_validate(sample_rag_spec)
    order = [n.id for n in graph.topological_order()]
    assert order.index("n_input") < order.index("n_retrieval")
    assert order.index("n_input") < order.index("n_prompt")
    assert order.index("n_retrieval") < order.index("n_prompt")  # prompt needs chunks
    assert order.index("n_prompt") < order.index("n_model")
    assert order.index("n_model") < order.index("n_output")


async def test_state_threading_passes_right_value(services):
    """A two-field input feeds a template; each var must resolve to its own value."""
    nodes = [
        _node("in", "input", {"fields": [{"name": "a", "type": "string"}, {"name": "b", "type": "string"}]}),
        _node("p", "prompt", {"template": "{{a}} - {{b}}"}),
        _node("out", "output", {"format": "text"}),
    ]
    edges = [
        _edge("e1", "in", "a", "p", "a"),
        _edge("e2", "in", "b", "p", "b"),
        _edge("e3", "p", "prompt", "out", "result"),
    ]
    result = await run_workflow({"nodes": nodes, "edges": edges}, {"a": "x", "b": "y"}, services)
    assert result.status == "completed"
    assert result.output == "x - y"


async def test_missing_required_input_fails_run(services):
    nodes = [
        _node("in", "input", {"fields": [{"name": "q", "type": "string", "required": True}]}),
        _node("out", "output", {}),
    ]
    edges = [_edge("e", "in", "q", "out", "result")]
    result = await run_workflow({"nodes": nodes, "edges": edges}, {}, services)  # no `q`

    assert result.status == "failed"
    assert result.failed_node_id == "in"
    assert "required" in result.error
    # the failing node's span is preserved and marked error
    assert result.spans[-1].status == "error"


async def test_unknown_kb_fails_at_retrieval(sample_rag_spec, services):
    # services has an *empty* store -> kb_123 does not exist
    result = await run_workflow(sample_rag_spec, {"question": "hi"}, services)
    assert result.status == "failed"
    assert result.failed_node_id == "n_retrieval"
    assert "knowledge_base_id" in result.error


async def test_node_failure_preserves_prior_spans(services):
    """A failure midway keeps the spans recorded up to (and including) the failure."""
    nodes = [
        _node("in", "input", {"fields": [{"name": "q", "type": "string"}]}),
        _node("ret", "retrieval", {"knowledge_base_id": "missing_kb"}),
        _node("p", "prompt", {"template": "{{c}}"}),
        _node("out", "output", {}),
    ]
    edges = [
        _edge("e1", "in", "q", "ret", "query"),
        _edge("e2", "ret", "chunks", "p", "c"),
        _edge("e3", "p", "prompt", "out", "result"),
    ]
    result = await run_workflow({"nodes": nodes, "edges": edges}, {"q": "hello"}, services)
    assert result.status == "failed"
    assert result.failed_node_id == "ret"
    # input ran OK, retrieval errored, prompt/output never ran
    assert [s.node_id for s in result.spans] == ["in", "ret"]
    assert result.spans[0].status == "ok"
    assert result.spans[1].status == "error"


def test_graphspec_roundtrips(sample_rag_spec):
    spec = GraphSpec.model_validate(sample_rag_spec)
    assert len(spec.nodes) == 5
    assert len(spec.edges) == 5


# ─── Retries (spec §6.5) ─────────────────────────────────────────────────────
from app.engine.context import Services  # noqa: E402
from app.services.providers import MockProvider, ProviderError  # noqa: E402
from app.services.retrieval import InMemoryStore, RetrievalService  # noqa: E402


class _FlakyProvider(MockProvider):
    """Raises a transient provider error for the first `fails` calls, then succeeds."""

    def __init__(self, fails: int):
        self.fails = fails
        self.calls = 0

    async def complete(self, model, messages, **params):
        self.calls += 1
        if self.calls <= self.fails:
            raise ProviderError("rate limit exceeded (429)")
        return await super().complete(model, messages, **params)


def _model_services(provider):
    return Services(providers=provider, retrieval=RetrievalService(InMemoryStore(), provider))


_MODEL_GRAPH = {
    "nodes": [
        _node("in", "input", {"fields": [{"name": "prompt", "type": "string"}]}),
        _node("m", "model", {"model": "x"}),
        _node("out", "output", {}),
    ],
    "edges": [
        _edge("e1", "in", "prompt", "m", "prompt"),
        _edge("e2", "m", "completion", "out", "result"),
    ],
}


async def test_model_retries_transient_then_succeeds():
    provider = _FlakyProvider(fails=1)
    result = await run_workflow(_MODEL_GRAPH, {"prompt": "hi"}, _model_services(provider))
    assert result.status == "completed"
    model_span = next(s for s in result.spans if s.node_type == "model")
    assert model_span.attempts == 2  # failed once, retried, succeeded
    assert provider.calls == 2


async def test_model_fails_after_exhausting_retries():
    provider = _FlakyProvider(fails=99)  # always fails
    result = await run_workflow(_MODEL_GRAPH, {"prompt": "hi"}, _model_services(provider))
    assert result.status == "failed"
    assert result.failed_node_id == "m"
    model_span = next(s for s in result.spans if s.node_type == "model")
    assert model_span.attempts == 3  # 1 + max_retries(2)
    assert provider.calls == 3
