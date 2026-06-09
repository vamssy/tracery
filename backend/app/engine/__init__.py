"""The execution engine — the heart of Mini-Dify.

Public surface:
    run_workflow(spec, input, services) -> RunResult
    parse_and_validate(spec) -> ParsedGraph   (raises GraphValidationError)
    validate_graph(spec) -> list[str]          (never raises; returns errors)
"""
from app.engine.executor import run_workflow
from app.engine.graph import (
    EdgeSpec,
    GraphSpec,
    GraphValidationError,
    NodeSpec,
    ParsedGraph,
    parse_and_validate,
    validate_graph,
)
from app.engine.trace import RunResult, Span

__all__ = [
    "run_workflow",
    "parse_and_validate",
    "validate_graph",
    "GraphSpec",
    "NodeSpec",
    "EdgeSpec",
    "ParsedGraph",
    "GraphValidationError",
    "RunResult",
    "Span",
]
