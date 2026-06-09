"""Fetch a run + its full trace."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_auth
from app.api.schemas import RunOut, SpanOut
from app.db import get_session
from app.models.tables import Run

router = APIRouter(prefix="/runs", tags=["runs"], dependencies=[Depends(require_auth)])


@router.get("/{run_id}", response_model=RunOut)
async def get_run(run_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    # eager-load spans — accessing a lazy relationship in async raises MissingGreenlet
    run = (
        await session.execute(select(Run).options(selectinload(Run.spans)).where(Run.id == run_id))
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    # spans relationship is ordered by ordinal
    spans = [
        SpanOut(
            node_id=s.node_id,
            node_type=s.node_type,
            ordinal=s.ordinal,
            status=s.status,
            inputs=s.inputs,
            outputs=s.outputs,
            latency_ms=s.latency_ms,
            tokens_in=s.tokens_in,
            tokens_out=s.tokens_out,
            cost_usd=s.cost_usd,
            error=s.error,
        )
        for s in run.spans
    ]
    return RunOut(
        run_id=run.id,
        workflow_id=run.workflow_id,
        status=run.status,
        output=run.output,
        error=run.error,
        created_at=run.created_at,
        trace={
            "total_latency_ms": run.total_latency_ms or 0,
            "total_cost_usd": run.total_cost_usd or 0.0,
            "spans": spans,
        },
    )
