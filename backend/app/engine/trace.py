"""Trace primitives: a Span per node, and the RunResult that wraps a whole run.

The engine emits structured span data regardless of the storage/observability
backend, so a home-grown trace table (v1) or Langfuse (later) are both just
consumers of these dataclasses.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Span:
    """One node's execution record."""

    node_id: str
    node_type: str
    ordinal: int  # execution order, 0-based
    status: str = "running"  # running | ok | error
    started_at: float = 0.0  # epoch seconds
    ended_at: float | None = None
    latency_ms: int | None = None
    inputs: Any = None
    outputs: Any = None
    # model-node only:
    tokens_in: int | None = None
    tokens_out: int | None = None
    cost_usd: float | None = None
    error: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RunResult:
    """The outcome of executing a workflow against one input."""

    status: str  # completed | failed
    output: Any
    spans: list[Span] = field(default_factory=list)
    total_latency_ms: int = 0
    total_cost_usd: float = 0.0
    error: str | None = None
    failed_node_id: str | None = None

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "output": self.output,
            "error": self.error,
            "failed_node_id": self.failed_node_id,
            "trace": {
                "total_latency_ms": self.total_latency_ms,
                "total_cost_usd": self.total_cost_usd,
                "spans": [s.to_dict() for s in self.spans],
            },
        }
