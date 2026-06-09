"""FastAPI application entrypoint.

Phase 0/1: a health check + the node-type catalog (so the frontend can render a
palette). The full REST surface (workflows / runs / knowledge-bases / deployments)
is wired in Phase 2.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.engine.nodes.base import NODE_REGISTRY

app = FastAPI(title="Mini-Dify API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "provider": settings.llm_provider}


@app.get("/node-types")
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
