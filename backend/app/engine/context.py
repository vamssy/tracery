"""Run state: the object threaded through every node during a single run.

It holds (a) the per-port values produced so far, (b) the ordered trace spans,
and (c) the service handles a node may reach for (provider layer, retrieval).
Injecting services here keeps nodes free of global state and trivially testable.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from app.engine.trace import Span

if TYPE_CHECKING:
    from app.engine.graph import EdgeSpec, NodeSpec
    from app.services.providers import ProviderLayer
    from app.services.retrieval import RetrievalService

_MAX_TRACE_STR = 4000


def truncate_for_trace(value: Any, max_chars: int = _MAX_TRACE_STR) -> Any:
    """Cap large/sensitive values stored on a trace span (spec §14)."""
    if isinstance(value, str):
        return value if len(value) <= max_chars else value[:max_chars] + f"…(+{len(value) - max_chars} chars)"
    if isinstance(value, list):
        return [truncate_for_trace(v, max_chars) for v in value[:50]]
    if isinstance(value, dict):
        return {k: truncate_for_trace(v, max_chars) for k, v in value.items()}
    return value


@dataclass
class Services:
    """The external systems nodes may call. Mockable in tests."""

    providers: ProviderLayer
    retrieval: RetrievalService


class RunContext:
    def __init__(self, input: dict, services: Services):
        self.input: dict = input
        self.services = services
        self.values: dict[tuple[str, str], Any] = {}  # (node_id, port) -> value
        self.spans: list[Span] = []
        self.final_output: Any = None
        self.current_span: Span | None = None

    def gather_inputs(self, node: NodeSpec, incoming: list[EdgeSpec]) -> dict:
        """Resolve a node's inputs from upstream outputs, keyed by target port."""
        inputs: dict[str, Any] = {}
        for edge in incoming:
            key = (edge.source, edge.source_port)
            if key in self.values:
                inputs[edge.target_port] = self.values[key]
        return inputs

    def set_outputs(self, node_id: str, outputs: dict) -> None:
        for port, value in outputs.items():
            self.values[(node_id, port)] = value

    def start_span(self, node: NodeSpec, ordinal: int) -> Span:
        span = Span(
            node_id=node.id,
            node_type=node.type,
            ordinal=ordinal,
            status="running",
            started_at=time.time(),
        )
        self.current_span = span
        self.spans.append(span)
        return span

    def record_usage(self, tokens_in: int, tokens_out: int, cost_usd: float) -> None:
        """Called by the model node to attach token/cost data to its span."""
        if self.current_span is not None:
            self.current_span.tokens_in = tokens_in
            self.current_span.tokens_out = tokens_out
            self.current_span.cost_usd = cost_usd
