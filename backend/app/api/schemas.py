"""Request/response models for the REST API."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ─── Workflows ───────────────────────────────────────────────────────────────
class WorkflowCreate(BaseModel):
    name: str
    graph_spec: dict = Field(default_factory=dict)


class WorkflowUpdate(BaseModel):
    name: str | None = None
    graph_spec: dict | None = None


class WorkflowSummary(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime


class WorkflowOut(WorkflowSummary):
    graph_spec: dict


class ValidateRequest(BaseModel):
    graph_spec: dict | None = None  # validate this if given, else the stored spec


class ValidateResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)


# ─── Runs ────────────────────────────────────────────────────────────────────
class RunRequest(BaseModel):
    input: dict = Field(default_factory=dict)


class SpanOut(BaseModel):
    node_id: str
    node_type: str
    ordinal: int
    status: str
    inputs: Any = None
    outputs: Any = None
    latency_ms: int | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    cost_usd: float | None = None
    error: str | None = None


class TraceOut(BaseModel):
    total_latency_ms: int
    total_cost_usd: float
    spans: list[SpanOut]


class RunOut(BaseModel):
    run_id: uuid.UUID
    workflow_id: uuid.UUID
    status: str
    output: Any = None
    error: str | None = None
    created_at: datetime | None = None
    trace: TraceOut


class RunSummary(BaseModel):
    run_id: uuid.UUID
    status: str
    total_latency_ms: int | None = None
    total_cost_usd: float | None = None
    created_at: datetime


# ─── Knowledge bases ─────────────────────────────────────────────────────────
class KBCreate(BaseModel):
    name: str


class KBOut(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    chunk_count: int = 0


class IngestResult(BaseModel):
    chunks_ingested: int
    total_chunks: int


# ─── Deployments (Phase 4) ───────────────────────────────────────────────────
class DeployOut(BaseModel):
    deployment_id: uuid.UUID
    deployment_key: str
    endpoint_url: str
    api_key: str  # shown once
    curl: str


class InvokeRequest(BaseModel):
    input: dict = Field(default_factory=dict)


class InvokeResult(BaseModel):
    output: Any = None
    status: str
