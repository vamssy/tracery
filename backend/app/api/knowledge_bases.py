"""Knowledge base CRUD + document ingestion (chunk → embed → store)."""
from __future__ import annotations

import io
import json
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import build_services, require_auth
from app.api.schemas import IngestResult, KBCreate, KBOut
from app.config import settings
from app.db import get_session
from app.models.tables import Chunk, KnowledgeBase

router = APIRouter(prefix="/knowledge-bases", tags=["knowledge-bases"], dependencies=[Depends(require_auth)])


def _extract_text(file: UploadFile, raw: bytes) -> str:
    name = (file.filename or "").lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        return "\n\n".join((page.extract_text() or "") for page in reader.pages)
    return raw.decode("utf-8", errors="replace")


async def _kb_or_404(session: AsyncSession, kb_id: uuid.UUID) -> KnowledgeBase:
    kb = await session.get(KnowledgeBase, kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="knowledge base not found")
    return kb


async def _chunk_count(session: AsyncSession, kb_id: uuid.UUID) -> int:
    return (await session.execute(select(func.count(Chunk.id)).where(Chunk.kb_id == kb_id))).scalar_one()


@router.get("", response_model=list[KBOut])
async def list_kbs(session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc()))
    ).scalars().all()
    return [
        KBOut(id=kb.id, name=kb.name, created_at=kb.created_at, chunk_count=await _chunk_count(session, kb.id))
        for kb in rows
    ]


@router.post("", response_model=KBOut, status_code=201)
async def create_kb(body: KBCreate, session: AsyncSession = Depends(get_session)):
    kb = KnowledgeBase(name=body.name)
    session.add(kb)
    await session.commit()
    await session.refresh(kb)
    return KBOut(id=kb.id, name=kb.name, created_at=kb.created_at, chunk_count=0)


@router.get("/{kb_id}", response_model=KBOut)
async def get_kb(kb_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    kb = await _kb_or_404(session, kb_id)
    return KBOut(id=kb.id, name=kb.name, created_at=kb.created_at, chunk_count=await _chunk_count(session, kb_id))


@router.delete("/{kb_id}", status_code=204)
async def delete_kb(kb_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    kb = await _kb_or_404(session, kb_id)
    await session.delete(kb)
    await session.commit()


@router.post("/{kb_id}/documents", response_model=IngestResult)
async def ingest_document(
    kb_id: uuid.UUID,
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    metadata: str | None = Form(default=None),
    session: AsyncSession = Depends(get_session),
):
    await _kb_or_404(session, kb_id)

    if file is not None:
        raw = await file.read()
        content = _extract_text(file, raw)
        meta = {"source": file.filename}
    elif text:
        content = text
        meta = {}
    else:
        raise HTTPException(status_code=400, detail="provide a `file` upload or `text` form field")

    if metadata:
        try:
            meta = {**meta, **json.loads(metadata)}
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"metadata is not valid JSON: {e}") from e

    if len(content) > settings.max_input_chars * 50:  # generous cap for documents
        raise HTTPException(status_code=413, detail="document exceeds size limit")

    services = build_services(session)
    n = await services.retrieval.ingest(str(kb_id), content, meta)
    await session.commit()

    return IngestResult(chunks_ingested=n, total_chunks=await _chunk_count(session, kb_id))
