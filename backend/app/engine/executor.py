"""The run loop: validate → topologically order → execute node by node, threading
state through a RunContext and recording a span per node.

    function run(graph_spec, input):
        graph = parse_and_validate(graph_spec)
        order = topological_sort(graph)
        ctx   = RunContext(input)
        for node in order:
            inputs = ctx.gather_inputs(node)
            span   = ctx.start_span(node)
            try:    outputs = node.execute(inputs, ctx); span.ok(outputs)
            except: span.error(e); return failed_run
        return completed_run
"""
from __future__ import annotations

import asyncio
import time

from app.config import settings
from app.engine.context import RunContext, Services, truncate_for_trace
from app.engine.graph import GraphSpec, parse_and_validate
from app.engine.nodes.base import NODE_REGISTRY, NodeError, TransientNodeError
from app.engine.trace import RunResult, Span

_RETRY_BASE_DELAY_S = 0.2


def _finish(span: Span, t0: float) -> None:
    span.ended_at = time.time()
    span.latency_ms = int((time.perf_counter() - t0) * 1000)


def _totals(spans: list[Span]) -> tuple[int, float]:
    latency = sum(s.latency_ms or 0 for s in spans)
    cost = round(sum(s.cost_usd or 0.0 for s in spans), 6)
    return latency, cost


async def run_workflow(spec_like: GraphSpec | dict, input: dict, services: Services) -> RunResult:
    """Execute a workflow graph against an input. Raises GraphValidationError if
    the graph is invalid; otherwise always returns a RunResult (completed|failed)."""
    graph = parse_and_validate(spec_like)
    order = graph.topological_order()
    ctx = RunContext(input, services)

    for ordinal, node_spec in enumerate(order):
        node = NODE_REGISTRY[node_spec.type]
        inputs = ctx.gather_inputs(node_spec, graph.incoming_edges(node_spec.id))

        span = ctx.start_span(node_spec, ordinal)
        span.inputs = truncate_for_trace(inputs)
        t0 = time.perf_counter()
        timeout = node.timeout_s or settings.node_timeout_s

        for attempt in range(node.max_retries + 1):
            span.attempts = attempt + 1
            try:
                outputs = await asyncio.wait_for(
                    node.execute(inputs, node_spec.config, ctx), timeout=timeout
                )
                ctx.set_outputs(node_spec.id, outputs)
                span.outputs = truncate_for_trace(outputs)
                span.status = "ok"
                _finish(span, t0)
                break
            except TransientNodeError as e:
                if attempt < node.max_retries:
                    await asyncio.sleep(_RETRY_BASE_DELAY_S * (2**attempt))
                    continue
                span.status = "error"
                span.error = f"{e} (after {span.attempts} attempts)"
                _finish(span, t0)
                return _failed(ctx, node_spec.id, span.error)
            except TimeoutError:
                span.status = "error"
                span.error = f"node timed out after {timeout}s"
                _finish(span, t0)
                return _failed(ctx, node_spec.id, span.error)
            except NodeError as e:
                span.status = "error"
                span.error = str(e)
                _finish(span, t0)
                return _failed(ctx, node_spec.id, span.error)
            except Exception as e:  # noqa: BLE001 — unexpected node bug, still fail cleanly
                span.status = "error"
                span.error = f"{type(e).__name__}: {e}"
                _finish(span, t0)
                return _failed(ctx, node_spec.id, span.error)

    latency, cost = _totals(ctx.spans)
    return RunResult(
        status="completed",
        output=ctx.final_output,
        spans=ctx.spans,
        total_latency_ms=latency,
        total_cost_usd=cost,
    )


def _failed(ctx: RunContext, failed_node_id: str, error: str) -> RunResult:
    latency, cost = _totals(ctx.spans)
    return RunResult(
        status="failed",
        output=None,
        spans=ctx.spans,
        total_latency_ms=latency,
        total_cost_usd=cost,
        error=error,
        failed_node_id=failed_node_id,
    )
