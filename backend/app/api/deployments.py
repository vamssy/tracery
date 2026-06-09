"""Deployments — freeze a workflow's graph spec and expose it as a stable HTTP
endpoint that runs through the same engine (spec §11).

  POST   /workflows/{id}/deploy   -> { deployment_key, endpoint_url, api_key, curl }
  POST   /deployments/{key}/invoke (x-api-key) -> { output, status }
  DELETE /deployments/{id}
"""
from __future__ import annotations

import copy
import hashlib
import secrets
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import build_services, require_auth
from app.api.persistence import build_run_row
from app.api.schemas import DeployOut, InvokeRequest, InvokeResult
from app.config import settings
from app.db import get_session
from app.engine.executor import run_workflow
from app.engine.graph import GraphValidationError
from app.models.tables import Deployment, Workflow

router = APIRouter(tags=["deployments"])


def _hash_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


@router.post("/workflows/{workflow_id}/deploy", response_model=DeployOut, dependencies=[Depends(require_auth)])
async def deploy_workflow(workflow_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    wf = await session.get(Workflow, workflow_id)
    if wf is None:
        raise HTTPException(status_code=404, detail="workflow not found")

    deployment_key = "dep_" + secrets.token_urlsafe(9)
    api_key = "mdk_" + secrets.token_urlsafe(24)

    dep = Deployment(
        workflow_id=wf.id,
        deployment_key=deployment_key,
        api_key_hash=_hash_key(api_key),
        frozen_graph_spec=copy.deepcopy(wf.graph_spec),  # frozen — later edits won't affect it
    )
    session.add(dep)
    await session.commit()
    await session.refresh(dep)

    endpoint_url = f"{settings.public_base_url}/deployments/{deployment_key}/invoke"
    curl = (
        f"curl -X POST {endpoint_url} \\\n"
        f"  -H 'x-api-key: {api_key}' \\\n"
        f"  -H 'content-type: application/json' \\\n"
        f"  -d '{{\"input\": {{}}}}'"
    )
    return DeployOut(
        deployment_id=dep.id,
        deployment_key=deployment_key,
        endpoint_url=endpoint_url,
        api_key=api_key,  # shown once
        curl=curl,
    )


@router.post("/deployments/{deployment_key}/invoke", response_model=InvokeResult)
async def invoke_deployment(
    deployment_key: str,
    body: InvokeRequest,
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
    session: AsyncSession = Depends(get_session),
):
    dep = (
        await session.execute(select(Deployment).where(Deployment.deployment_key == deployment_key))
    ).scalar_one_or_none()
    if dep is None:
        raise HTTPException(status_code=404, detail="deployment not found")
    if not x_api_key or _hash_key(x_api_key) != dep.api_key_hash:
        raise HTTPException(status_code=401, detail="invalid api key")

    services = build_services(session)
    try:
        result = await run_workflow(dep.frozen_graph_spec, body.input, services)
    except GraphValidationError as e:
        raise HTTPException(status_code=422, detail={"message": "frozen graph invalid", "errors": e.errors}) from e

    # persist the invocation for observability (linked to the original workflow)
    session.add(build_run_row(dep.workflow_id, body.input, result))
    await session.commit()

    if result.status != "completed":
        raise HTTPException(status_code=500, detail={"status": result.status, "error": result.error})
    return InvokeResult(output=result.output, status=result.status)


@router.delete("/deployments/{deployment_id}", status_code=204, dependencies=[Depends(require_auth)])
async def delete_deployment(deployment_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    dep = await session.get(Deployment, deployment_id)
    if dep is None:
        raise HTTPException(status_code=404, detail="deployment not found")
    await session.delete(dep)
    await session.commit()
