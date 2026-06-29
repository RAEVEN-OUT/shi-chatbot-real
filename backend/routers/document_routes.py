"""
document_routes.py
------------------
REST API for the RAG document ingestion pipeline.

Endpoints:
  POST   /documents/upload          – upload & ingest a file
  GET    /documents                 – list all documents for the org
  DELETE /documents/{doc_id}        – delete document + its Qdrant vectors
  GET    /documents/{doc_id}/status – lightweight status poll for the frontend
"""
from __future__ import annotations

import asyncio
import logging
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import DocumentSource, Domain
from services.document_service import extract_text, ingest_document, _ext
from services.ollama_service import ollama_service
from services.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: str
    source_title: str
    filename: str
    file_type: str
    file_size: Optional[int]
    status: str
    chunk_count: int
    error_message: Optional[str]
    domain_id: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _doc_out(doc: DocumentSource) -> dict:
    return {
        "id": doc.id,
        "source_title": doc.source_title,
        "filename": doc.filename,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "status": doc.status,
        "chunk_count": doc.chunk_count,
        "error_message": doc.error_message,
        "domain_id": doc.domain_id,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


# ── Upload endpoint ───────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    domain_id: Optional[str] = Form(None),
    source_title: Optional[str] = Form(None),
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a .pdf, .txt, or .docx file and ingest it into the vector store.

    - `domain_id` (optional): scope the document to a specific domain.
      If omitted the document is org-wide and searches from any domain will surface it.
    - `source_title` (optional): human-readable name shown in the dashboard.
      Defaults to the original filename.
    """
    org_id: str = user["postgres_user"].organization_id
    if not org_id:
        raise HTTPException(status_code=403, detail="User has no organisation.")

    # Validate domain ownership if provided
    effective_domain_id: Optional[str] = None
    if domain_id and domain_id.strip():
        stmt = select(Domain).where(
            Domain.id == domain_id,
            Domain.organization_id == org_id,
        )
        result = await db.execute(stmt)
        domain = result.scalar_one_or_none()
        if not domain:
            raise HTTPException(status_code=404, detail="Domain not found or access denied.")
        effective_domain_id = domain_id

    # Validate extension before reading
    ext = _ext(file.filename or "")
    if ext not in {"pdf", "txt", "docx"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: pdf, txt, docx."
        )

    title = (source_title or "").strip() or (file.filename or "Untitled")
    file_size = None
    try:
        content = await file.read()
        file_size = len(content)
        await file.seek(0)
    except Exception:
        pass

    # Create a DB record immediately so the frontend can poll
    doc = DocumentSource(
        organization_id=org_id,
        domain_id=effective_domain_id,
        source_title=title,
        filename=file.filename or "upload",
        file_type=ext,
        file_size=file_size,
        status="processing",
        chunk_count=0,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    doc_id = doc.id

    # Run ingestion in background so the HTTP response returns immediately
    async def _run_ingestion():
        async with db.bind.connect() as conn:
            from database.database import AsyncSessionLocal
            async with AsyncSessionLocal() as bg_db:
                try:
                    n_chunks = await ingest_document(
                        file=file,
                        tenant_id=org_id,
                        domain_id=effective_domain_id,
                        document_source_id=doc_id,
                        source_title=title,
                        filename=file.filename or "upload",
                        ollama_service=ollama_service,
                        qdrant_service=qdrant_service,
                    )
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        record.status = "ready"
                        record.chunk_count = n_chunks
                        await bg_db.commit()
                    logger.info(f"[DocumentRoutes] Ingestion complete: {doc_id} ({n_chunks} chunks)")
                except HTTPException as e:
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        record.status = "failed"
                        record.error_message = e.detail
                        await bg_db.commit()
                    logger.error(f"[DocumentRoutes] Ingestion failed: {doc_id}: {e.detail}")
                except Exception as e:
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        record.status = "failed"
                        record.error_message = str(e)
                        await bg_db.commit()
                    logger.error(f"[DocumentRoutes] Ingestion unexpected error: {doc_id}: {e}")

    asyncio.create_task(_run_ingestion())

    return {
        "status": "processing",
        "document_id": doc_id,
        "message": f"Document '{title}' is being processed. Poll /documents/{doc_id}/status for updates.",
    }


# ── List endpoint ─────────────────────────────────────────────────────────────

@router.get("")
async def list_documents(
    domain_id: Optional[str] = Query(None),
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db),
):
    """Return all documents for the organisation, optionally filtered by domain."""
    org_id: str = user["postgres_user"].organization_id

    stmt = select(DocumentSource).where(DocumentSource.organization_id == org_id)
    if domain_id:
        stmt = stmt.where(DocumentSource.domain_id == domain_id)
    stmt = stmt.order_by(DocumentSource.created_at.desc())

    result = await db.execute(stmt)
    docs = result.scalars().all()
    return [_doc_out(d) for d in docs]


# ── Status poll ───────────────────────────────────────────────────────────────

@router.get("/{doc_id}/status")
async def get_document_status(
    doc_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db),
):
    """Lightweight poll endpoint used by the frontend upload progress indicator."""
    org_id: str = user["postgres_user"].organization_id

    stmt = select(DocumentSource).where(
        DocumentSource.id == doc_id,
        DocumentSource.organization_id == org_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    return {
        "id": doc.id,
        "status": doc.status,
        "chunk_count": doc.chunk_count,
        "error_message": doc.error_message,
    }


# ── Delete endpoint ───────────────────────────────────────────────────────────

@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a document and all its associated Qdrant vector chunks.
    This is irreversible — the file must be re-uploaded to restore it.
    """
    org_id: str = user["postgres_user"].organization_id

    stmt = select(DocumentSource).where(
        DocumentSource.id == doc_id,
        DocumentSource.organization_id == org_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Delete vector chunks first (best-effort; don't block DB delete on Qdrant errors)
    try:
        await qdrant_service.delete_chunks_by_document_id(doc_id)
    except Exception as e:
        logger.warning(f"[DocumentRoutes] Qdrant delete warning for {doc_id}: {e}")

    await db.delete(doc)
    await db.commit()

    return {"status": "deleted", "document_id": doc_id}
