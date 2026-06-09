"""Retrieval node — embed a query and fetch the top-k matching chunks from a
knowledge base via the retrieval service."""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.engine.nodes.base import Node, NodeError, Port, Ports, register
from app.services.retrieval import KnowledgeBaseNotFound

if TYPE_CHECKING:
    from app.engine.context import RunContext


@register
class RetrievalNode(Node):
    type = "retrieval"
    timeout_s = 30

    def declare_ports(self, config: dict) -> Ports:
        return Ports(
            inputs=[Port("query", "string")],
            outputs=[Port("chunks", "chunks")],
        )

    async def execute(self, inputs: dict, config: dict, ctx: RunContext) -> dict:
        query = inputs.get("query")
        if query is None:
            raise NodeError("retrieval: no query provided")
        kb_id = config.get("knowledge_base_id")
        if not kb_id:
            raise NodeError("retrieval: knowledge_base_id is not configured")
        top_k = int(config.get("top_k", 4))
        threshold = float(config.get("score_threshold", 0.0))
        try:
            chunks = await ctx.services.retrieval.query(
                kb_id,
                str(query),
                top_k=top_k,
                score_threshold=threshold,
                embedding_model=config.get("embedding_model"),
            )
        except KnowledgeBaseNotFound as e:
            raise NodeError(f"retrieval: {e}") from e
        return {"chunks": chunks}
