"""Workflow CRUD + validate + run."""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import build_services, require_auth
from app.api.persistence import build_run_row
from app.api.schemas import (
    RunOut,
    RunRequest,
    RunSummary,
    ValidateRequest,
    ValidateResult,
    WorkflowCreate,
    WorkflowOut,
    WorkflowSummary,
    WorkflowUpdate,
)
from app.config import settings
from app.db import get_session
from app.engine.executor import run_workflow
from app.engine.graph import GraphValidationError, validate_graph
from app.models.tables import Run, Workflow

router = APIRouter(prefix="/workflows", tags=["workflows"], dependencies=[Depends(require_auth)])


async def _get_or_404(session: AsyncSession, workflow_id: uuid.UUID) -> Workflow:
    wf = await session.get(Workflow, workflow_id)
    if wf is None:
        raise HTTPException(status_code=404, detail="workflow not found")
    return wf


@router.post("", response_model=WorkflowOut, status_code=201)
async def create_workflow(body: WorkflowCreate, session: AsyncSession = Depends(get_session)):
    wf = Workflow(name=body.name, graph_spec=body.graph_spec)
    session.add(wf)
    await session.commit()
    await session.refresh(wf)
    return wf


@router.get("", response_model=list[WorkflowSummary])
async def list_workflows(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Workflow).order_by(Workflow.updated_at.desc()))).scalars().all()
    return rows


@router.get("/{workflow_id}", response_model=WorkflowOut)
async def get_workflow(workflow_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    return await _get_or_404(session, workflow_id)


@router.put("/{workflow_id}", response_model=WorkflowOut)
async def update_workflow(
    workflow_id: uuid.UUID, body: WorkflowUpdate, session: AsyncSession = Depends(get_session)
):
    wf = await _get_or_404(session, workflow_id)
    if body.name is not None:
        wf.name = body.name
    if body.graph_spec is not None:
        wf.graph_spec = body.graph_spec
    await session.commit()
    await session.refresh(wf)
    return wf


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    wf = await _get_or_404(session, workflow_id)
    await session.delete(wf)
    await session.commit()


@router.post("/{workflow_id}/validate", response_model=ValidateResult)
async def validate_workflow(
    workflow_id: uuid.UUID,
    body: ValidateRequest | None = None,
    session: AsyncSession = Depends(get_session),
):
    spec = body.graph_spec if body and body.graph_spec is not None else None
    if spec is None:
        spec = (await _get_or_404(session, workflow_id)).graph_spec
    errors = validate_graph(spec)
    return ValidateResult(valid=not errors, errors=errors)


@router.post("/{workflow_id}/run", response_model=RunOut)
async def run_workflow_endpoint(
    workflow_id: uuid.UUID, body: RunRequest, session: AsyncSession = Depends(get_session)
):
    wf = await _get_or_404(session, workflow_id)

    if len(json.dumps(body.input)) > settings.max_input_chars:
        raise HTTPException(status_code=413, detail="input exceeds size limit")

    services = build_services(session)
    try:
        result = await run_workflow(wf.graph_spec, body.input, services)
    except GraphValidationError as e:
        raise HTTPException(status_code=422, detail={"message": "invalid graph", "errors": e.errors}) from e

    run = build_run_row(wf.id, body.input, result)
    session.add(run)
    await session.commit()
    await session.refresh(run)

    return RunOut(
        run_id=run.id,
        workflow_id=wf.id,
        status=result.status,
        output=result.output,
        error=result.error,
        created_at=run.created_at,
        trace={
            "total_latency_ms": result.total_latency_ms,
            "total_cost_usd": result.total_cost_usd,
            "spans": [s.to_dict() for s in result.spans],
        },
    )


@router.get("/{workflow_id}/runs", response_model=list[RunSummary])
async def list_runs(workflow_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    await _get_or_404(session, workflow_id)
    rows = (
        await session.execute(
            select(Run).where(Run.workflow_id == workflow_id).order_by(Run.created_at.desc()).limit(50)
        )
    ).scalars().all()
    return [
        RunSummary(
            run_id=r.id,
            status=r.status,
            total_latency_ms=r.total_latency_ms,
            total_cost_usd=r.total_cost_usd,
            created_at=r.created_at,
        )
        for r in rows
    ]
