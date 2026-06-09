#!/usr/bin/env python
"""Headless workflow runner — drives the execution engine from a graph-spec JSON
file, with no HTTP and no database. This is the Phase 1 deliverable.

    python run_workflow.py sample_rag.json --input '{"question":"What is the refund policy?"}'
    python run_workflow.py sample_rag.json --input @input.json --kb sample_kb.json

By default it uses the deterministic mock provider (no API key). Set
LLM_PROVIDER=litellm (+ a key) in the environment for real model calls.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from app.engine.context import Services
from app.engine.executor import run_workflow
from app.engine.graph import GraphValidationError
from app.services.providers import get_provider
from app.services.retrieval import InMemoryStore, RetrievalService


def _load_json_arg(value: str) -> dict:
    if value.startswith("@"):
        return json.loads(Path(value[1:]).read_text())
    return json.loads(value)


async def _seed_kb(retrieval: RetrievalService, kb_path: Path) -> None:
    data = json.loads(kb_path.read_text())
    kb_id = data["kb_id"]
    n = 0
    for doc in data.get("documents", []):
        n += await retrieval.ingest(kb_id, doc["text"], doc.get("metadata"))
    print(f"• seeded KB {kb_id!r} with {n} chunk(s) from {len(data.get('documents', []))} document(s)\n")


def _print_trace(result) -> None:
    t = result
    print("─" * 72)
    print(f"status: {t.status.upper()}   total {t.total_latency_ms} ms   ${t.total_cost_usd:.6f}")
    if t.error:
        print(f"error : {t.error}  (node {t.failed_node_id})")
    print("─" * 72)
    print(f"{'#':<2} {'node':<22} {'status':<7} {'ms':>6}  {'tok_in':>6} {'tok_out':>7} {'cost':>9}")
    for s in t.spans:
        tin = "" if s.tokens_in is None else str(s.tokens_in)
        tout = "" if s.tokens_out is None else str(s.tokens_out)
        cost = "" if s.cost_usd is None else f"{s.cost_usd:.6f}"
        label = f"{s.node_id} ({s.node_type})"
        print(f"{s.ordinal:<2} {label:<22} {s.status:<7} {s.latency_ms or 0:>6}  {tin:>6} {tout:>7} {cost:>9}")
    print("─" * 72)


async def main() -> int:
    ap = argparse.ArgumentParser(description="Run a Mini-Dify workflow headless.")
    ap.add_argument("spec", help="path to a graph-spec JSON file")
    ap.add_argument("--input", default="{}", help='JSON object or @path/to/input.json')
    ap.add_argument("--kb", help="optional KB seed file (JSON: {kb_id, documents[]})")
    ap.add_argument("--json", action="store_true", help="print the full result as JSON")
    args = ap.parse_args()

    spec = json.loads(Path(args.spec).read_text())
    run_input = _load_json_arg(args.input)

    providers = get_provider()
    store = InMemoryStore()
    retrieval = RetrievalService(store, providers)
    services = Services(providers=providers, retrieval=retrieval)

    if args.kb:
        await _seed_kb(retrieval, Path(args.kb))

    try:
        result = await run_workflow(spec, run_input, services)
    except GraphValidationError as e:
        print("GRAPH INVALID:")
        for err in e.errors:
            print(f"  - {err}")
        return 2

    if args.json:
        print(json.dumps(result.to_dict(), indent=2, default=str))
        return 0 if result.status == "completed" else 1

    print("\n=== OUTPUT ===")
    print(result.output)
    print()
    _print_trace(result)
    return 0 if result.status == "completed" else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
