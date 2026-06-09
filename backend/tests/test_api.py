"""Integration tests: the full Phase-1 flow over HTTP with persistence (spec §15).

build → save → run → fetch trace, plus KB create + ingest + retrieval.
Requires a Postgres+pgvector test DB (skipped automatically if unavailable).
"""
from __future__ import annotations

import copy


def _spec_with_kb(sample_rag_spec: dict, kb_id: str) -> dict:
    spec = copy.deepcopy(sample_rag_spec)
    for node in spec["nodes"]:
        if node["type"] == "retrieval":
            node["config"]["knowledge_base_id"] = kb_id
    return spec


async def test_health_and_node_types(api_client):
    r = await api_client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    r = await api_client.get("/node-types")
    types = {n["type"] for n in r.json()["node_types"]}
    assert {"input", "retrieval", "prompt", "model", "output"} <= types


async def test_workflow_crud(api_client):
    r = await api_client.post("/workflows", json={"name": "wf1", "graph_spec": {"nodes": [], "edges": []}})
    assert r.status_code == 201, r.text
    wf_id = r.json()["id"]

    assert (await api_client.get(f"/workflows/{wf_id}")).json()["name"] == "wf1"
    assert any(w["id"] == wf_id for w in (await api_client.get("/workflows")).json())

    r = await api_client.put(f"/workflows/{wf_id}", json={"name": "wf1-renamed"})
    assert r.json()["name"] == "wf1-renamed"

    assert (await api_client.delete(f"/workflows/{wf_id}")).status_code == 204
    assert (await api_client.get(f"/workflows/{wf_id}")).status_code == 404


async def test_validate_reports_errors(api_client):
    bad = {"nodes": [{"id": "in", "type": "input", "config": {"fields": []}}], "edges": []}
    r = await api_client.post("/workflows", json={"name": "bad", "graph_spec": bad})
    wf_id = r.json()["id"]
    out = (await api_client.post(f"/workflows/{wf_id}/validate")).json()
    assert out["valid"] is False
    assert any("output" in e for e in out["errors"])


async def test_full_rag_flow_with_persistence(api_client, sample_rag_spec):
    # 1. create a knowledge base + ingest a document
    kb = (await api_client.post("/knowledge-bases", json={"name": "policies"})).json()
    kb_id = kb["id"]
    ingest = await api_client.post(
        f"/knowledge-bases/{kb_id}/documents",
        data={
            "text": (
                "Refund policy. Customers may request a full refund within 30 days of purchase. "
                "Refunds are processed within 5 to 7 business days to the original payment method."
            ),
            "metadata": '{"source": "refund_policy"}',
        },
    )
    assert ingest.status_code == 200, ingest.text
    assert ingest.json()["chunks_ingested"] >= 1

    # 2. create the workflow pointing at the new KB
    spec = _spec_with_kb(sample_rag_spec, kb_id)
    wf = (await api_client.post("/workflows", json={"name": "rag", "graph_spec": spec})).json()
    wf_id = wf["id"]
    assert (await api_client.post(f"/workflows/{wf_id}/validate")).json()["valid"] is True

    # 3. run it
    run = await api_client.post(f"/workflows/{wf_id}/run", json={"input": {"question": "What is the refund policy?"}})
    assert run.status_code == 200, run.text
    body = run.json()
    assert body["status"] == "completed"
    assert body["output"]
    span_types = [s["node_type"] for s in body["trace"]["spans"]]
    assert span_types == ["input", "retrieval", "prompt", "model", "output"]
    # retrieval actually returned chunks from pgvector
    ret_span = next(s for s in body["trace"]["spans"] if s["node_type"] == "retrieval")
    assert ret_span["outputs"]["chunks"]

    # 4. fetch the persisted run + full trace
    run_id = body["run_id"]
    fetched = (await api_client.get(f"/runs/{run_id}")).json()
    assert fetched["status"] == "completed"
    assert len(fetched["trace"]["spans"]) == 5
    model_span = next(s for s in fetched["trace"]["spans"] if s["node_type"] == "model")
    assert model_span["tokens_in"] and model_span["cost_usd"] is not None

    # 5. run shows up in the workflow's run list
    runs = (await api_client.get(f"/workflows/{wf_id}/runs")).json()
    assert any(r["run_id"] == run_id for r in runs)


async def test_run_invalid_graph_returns_422(api_client):
    wf = (await api_client.post("/workflows", json={"name": "empty", "graph_spec": {"nodes": [], "edges": []}})).json()
    r = await api_client.post(f"/workflows/{wf['id']}/run", json={"input": {}})
    assert r.status_code == 422
