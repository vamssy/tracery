"""Validation is the engine's first line of defense (spec §6.8, §15)."""
from __future__ import annotations

from app.engine.graph import validate_graph


def _node(id, type, config=None):
    return {"id": id, "type": type, "position": {"x": 0, "y": 0}, "config": config or {}}


def _edge(id, s, sp, t, tp):
    return {"id": id, "source": s, "source_port": sp, "target": t, "target_port": tp}


def _linear_input_output(extra_nodes=None, extra_edges=None):
    """A minimal valid input->output graph, extendable for negative tests."""
    nodes = [
        _node("in", "input", {"fields": [{"name": "q", "type": "string", "required": True}]}),
        _node("out", "output", {"format": "text"}),
    ]
    edges = [_edge("e", "in", "q", "out", "result")]
    return {"version": "1.0", "nodes": nodes + (extra_nodes or []), "edges": edges + (extra_edges or [])}


def test_sample_rag_is_valid(sample_rag_spec):
    assert validate_graph(sample_rag_spec) == []


def test_minimal_graph_is_valid():
    assert validate_graph(_linear_input_output()) == []


def test_cycle_is_rejected():
    # a <-> b is a pure 2-node cycle (a.x fed by b, b.y fed by a) — each input port
    # has exactly one incoming edge, so only the cycle rule should fire.
    nodes = [
        _node("in", "input", {"fields": [{"name": "q", "type": "string"}]}),
        _node("a", "prompt", {"template": "{{x}}"}),
        _node("b", "prompt", {"template": "{{y}}"}),
        _node("out", "output", {}),
    ]
    edges = [
        _edge("e1", "b", "prompt", "a", "x"),  # b -> a
        _edge("e2", "a", "prompt", "b", "y"),  # a -> b  (cycle)
        _edge("e3", "b", "prompt", "out", "result"),
    ]
    errors = validate_graph({"nodes": nodes, "edges": edges})
    assert any("cycle" in e for e in errors), errors


def test_dangling_edge_source_node():
    g = _linear_input_output(extra_edges=[_edge("bad", "ghost", "x", "out", "result")])
    errors = validate_graph(g)
    assert any("ghost" in e and "does not exist" in e for e in errors), errors


def test_unknown_port_is_rejected():
    g = _linear_input_output(extra_edges=[_edge("bad", "in", "nope", "out", "result")])
    errors = validate_graph(g)
    assert any("no output port" in e for e in errors), errors


def test_type_mismatch_is_rejected():
    # retrieval.chunks -> output... actually wire chunks into a model.prompt(string)
    nodes = [
        _node("in", "input", {"fields": [{"name": "q", "type": "string"}]}),
        _node("ret", "retrieval", {"knowledge_base_id": "kb"}),
        _node("model", "model", {"model": "x"}),
        _node("out", "output", {}),
    ]
    edges = [
        _edge("e1", "in", "q", "ret", "query"),
        _edge("e2", "ret", "chunks", "model", "prompt"),  # chunks -> string : mismatch
        _edge("e3", "model", "completion", "out", "result"),
    ]
    errors = validate_graph({"nodes": nodes, "edges": edges})
    assert any("type mismatch" in e for e in errors), errors


def test_unmapped_template_var_is_rejected():
    # prompt references {{missing}} with no incoming edge -> required input unmet
    nodes = [
        _node("in", "input", {"fields": [{"name": "q", "type": "string"}]}),
        _node("p", "prompt", {"template": "{{q}} and {{missing}}"}),
        _node("out", "output", {}),
    ]
    edges = [
        _edge("e1", "in", "q", "p", "q"),
        _edge("e2", "p", "prompt", "out", "result"),
    ]
    errors = validate_graph({"nodes": nodes, "edges": edges})
    assert any("missing" in e and "no incoming edge" in e for e in errors), errors


def test_requires_exactly_one_output():
    nodes = [_node("in", "input", {"fields": [{"name": "q", "type": "string"}]})]
    errors = validate_graph({"nodes": nodes, "edges": []})
    assert any("output" in e for e in errors), errors


def test_two_outputs_rejected():
    g = _linear_input_output(
        extra_nodes=[_node("out2", "output", {})],
        extra_edges=[_edge("e2", "in", "q", "out2", "result")],
    )
    errors = validate_graph(g)
    assert any("exactly one" in e for e in errors), errors


def test_unknown_node_type():
    nodes = [
        _node("in", "input", {"fields": [{"name": "q", "type": "string"}]}),
        _node("weird", "quantum_node", {}),
        _node("out", "output", {}),
    ]
    edges = [_edge("e", "in", "q", "out", "result")]
    errors = validate_graph({"nodes": nodes, "edges": edges})
    assert any("Unknown node type" in e for e in errors), errors


def test_port_over_connected():
    # two edges into output.result
    nodes = [
        _node("in", "input", {"fields": [{"name": "a", "type": "string"}, {"name": "b", "type": "string"}]}),
        _node("out", "output", {}),
    ]
    edges = [
        _edge("e1", "in", "a", "out", "result"),
        _edge("e2", "in", "b", "out", "result"),
    ]
    errors = validate_graph({"nodes": nodes, "edges": edges})
    assert any("incoming edges (max 1)" in e for e in errors), errors
