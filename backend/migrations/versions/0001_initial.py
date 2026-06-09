"""initial schema (workflows, runs, spans, knowledge_bases, chunks, deployments)

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-10
"""
from __future__ import annotations

from alembic import op

from app.config import settings

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

DIM = settings.embedding_dim


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(
        """
        CREATE TABLE workflows (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name        text NOT NULL,
            graph_spec  jsonb NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE runs (
            id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            workflow_id      uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            status           text NOT NULL,
            input            jsonb NOT NULL,
            output           jsonb,
            total_latency_ms integer,
            total_cost_usd   double precision,
            error            text,
            created_at       timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_runs_workflow_id ON runs(workflow_id)")

    op.execute(
        """
        CREATE TABLE spans (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            run_id      uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
            node_id     text NOT NULL,
            node_type   text NOT NULL,
            status      text NOT NULL,
            inputs      jsonb,
            outputs     jsonb,
            latency_ms  integer,
            tokens_in   integer,
            tokens_out  integer,
            cost_usd    double precision,
            error       text,
            ordinal     integer NOT NULL
        )
        """
    )
    op.execute("CREATE INDEX ix_spans_run_id ON spans(run_id)")

    op.execute(
        """
        CREATE TABLE knowledge_bases (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name        text NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        f"""
        CREATE TABLE chunks (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            kb_id       uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
            text        text NOT NULL,
            embedding   vector({DIM}) NOT NULL,
            metadata    jsonb,
            created_at  timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_chunks_kb_id ON chunks(kb_id)")
    op.execute(
        "CREATE INDEX ix_chunks_embedding_hnsw ON chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    op.execute(
        """
        CREATE TABLE deployments (
            id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            workflow_id       uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            deployment_key    text NOT NULL UNIQUE,
            api_key_hash      text NOT NULL,
            frozen_graph_spec jsonb NOT NULL,
            created_at        timestamptz NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    for table in ("deployments", "chunks", "knowledge_bases", "spans", "runs", "workflows"):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
