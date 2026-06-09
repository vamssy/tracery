"""FastAPI application entrypoint — wires the REST surface around the engine."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import knowledge_bases, runs, workflows
from app.api.schemas import ValidateRequest, ValidateResult
from app.config import settings
from app.engine.graph import validate_graph
from app.engine.nodes.base import NODE_REGISTRY

app = FastAPI(title="Mini-Dify API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workflows.router)
app.include_router(runs.router)
app.include_router(knowledge_bases.router)


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "provider": settings.llm_provider}


@app.post("/validate", response_model=ValidateResult, tags=["meta"])
async def validate_spec(body: ValidateRequest) -> ValidateResult:
    """Stateless graph validation — used by the editor before a workflow is saved."""
    errors = validate_graph(body.graph_spec or {})
    return ValidateResult(valid=not errors, errors=errors)


@app.get("/node-types", tags=["meta"])
async def node_types() -> dict:
    """Catalog of registered node types and their default ports (for the palette)."""
    out = []
    for type_name, node in sorted(NODE_REGISTRY.items()):
        ports = node.declare_ports({})
        out.append(
            {
                "type": type_name,
                "inputs": [{"name": p.name, "type": p.type, "required": p.required} for p in ports.inputs],
                "outputs": [{"name": p.name, "type": p.type} for p in ports.outputs],
            }
        )
    return {"node_types": out}
