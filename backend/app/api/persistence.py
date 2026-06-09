"""Translate an engine RunResult into ORM rows."""
from __future__ import annotations

import json
import uuid
from typing import Any

from app.engine.trace import RunResult
from app.models.tables import Run, Span


def _jsonable(value: Any) -> Any:
    """Force JSON-serializable values for JSONB columns (trace I/O may hold odd types)."""
    if value is None:
        return None
    return json.loads(json.dumps(value, default=str, ensure_ascii=False))


def build_run_row(workflow_id: uuid.UUID, run_input: dict, result: RunResult) -> Run:
    run = Run(
        workflow_id=workflow_id,
        status=result.status,
        input=_jsonable(run_input),
        output=_jsonable(result.output),
        total_latency_ms=result.total_latency_ms,
        total_cost_usd=result.total_cost_usd,
        error=result.error,
    )
    for s in result.spans:
        run.spans.append(
            Span(
                node_id=s.node_id,
                node_type=s.node_type,
                status=s.status,
                inputs=_jsonable(s.inputs),
                outputs=_jsonable(s.outputs),
                latency_ms=s.latency_ms,
                tokens_in=s.tokens_in,
                tokens_out=s.tokens_out,
                cost_usd=s.cost_usd,
                error=s.error,
                ordinal=s.ordinal,
            )
        )
    return run
