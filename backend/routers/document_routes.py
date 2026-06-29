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

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query, BackgroundTasks
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
from services.redis_service import redis_service

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
        "error_stage": doc.error_stage,
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

    # Create a DB record immediately so the frontend can poll, even if extraction fails
    doc = DocumentSource(
        organization_id=org_id,
        domain_id=effective_domain_id,
        source_title=title,
        filename=file.filename or "upload",
        file_type=ext,
        file_size=0,
        status="queued",
        chunk_count=0,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    doc_id = doc.id

    # Extract and validate text synchronously
    try:
        raw_text, file_type, file_size = await extract_text(file)
        doc.file_size = file_size
        await db.commit()
    except HTTPException as e:
        doc.status = "failed"
        doc.error_stage = "Extraction failed"
        doc.error_message = e.detail
        await db.commit()
        # Still return 202 to the user, as the background task pattern expects success immediately?
        # No, wait, currently it returns HTTPException which the user expects (400 for bad files).
        # We will still raise it so the frontend shows the immediate error, but it's recorded in DB too.
        raise
    except Exception as e:
        doc.status = "failed"
        doc.error_stage = "Extraction failed"
        doc.error_message = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))

    # Run ingestion in background so the HTTP response returns immediately
    async def _run_ingestion():
        async with db.bind.connect() as conn:
            from database.database import AsyncSessionLocal
            async with AsyncSessionLocal() as bg_db:
                
                async def update_status(new_status: str):
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        record.status = new_status
                        await bg_db.commit()

                try:
                    await update_status("processing")
                    n_chunks = await ingest_document(
                        raw_text=raw_text,
                        tenant_id=org_id,
                        domain_id=effective_domain_id,
                        document_source_id=doc_id,
                        source_title=title,
                        filename=file.filename or "upload",
                        ollama_service=ollama_service,
                        qdrant_service=qdrant_service,
                        status_callback=update_status,
                    )
                    await update_status("ready")
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        record.chunk_count = n_chunks
                        await bg_db.commit()
                        if effective_domain_id:
                            await redis_service.delete_domain_capabilities(effective_domain_id)
                    logger.info(f"[DocumentRoutes] Ingestion complete: {doc_id} ({n_chunks} chunks)")
                except HTTPException as e:
                    logger.error(f"[DocumentRoutes] Ingestion failed: {doc_id}: {e.detail}")
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        stage = record.status
                        if stage == "processing": record.error_stage = "Chunking failed"
                        elif stage == "embedding": record.error_stage = "Embedding failed"
                        elif stage == "indexing": record.error_stage = "Vector store failed"
                        else: record.error_stage = f"{stage.capitalize()} failed"
                        record.status = "failed"
                        record.error_message = e.detail
                        await bg_db.commit()
                except Exception as e:
                    logger.error(f"[DocumentRoutes] Ingestion unexpected error: {doc_id}: {e}")
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        stage = record.status
                        if stage == "processing": record.error_stage = "Chunking failed"
                        elif stage == "embedding": record.error_stage = "Embedding failed"
                        elif stage == "indexing": record.error_stage = "Vector store failed"
                        else: record.error_stage = f"{stage.capitalize()} failed"
                        record.status = "failed"
                        record.error_message = str(e)
                        await bg_db.commit()
                finally:
                    try:
                        stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                        r = await bg_db.execute(stmt)
                        record = r.scalar_one_or_none()
                        if record and record.status not in ["ready", "failed"]:
                            stage = record.status
                            if stage == "processing": record.error_stage = "Chunking failed"
                            elif stage == "embedding": record.error_stage = "Embedding failed"
                            elif stage == "indexing": record.error_stage = "Vector store failed"
                            else: record.error_stage = f"{stage.capitalize()} failed"
                            record.status = "failed"
                            record.error_message = record.error_message or "Process terminated unexpectedly."
                            await bg_db.commit()
                    except Exception as fatal_e:
                        logger.error(f"[DocumentRoutes] Final failsafe failed for {doc_id}: {fatal_e}")

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
    background_tasks: BackgroundTasks,
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

    # Delete vector chunks first. If this fails, abort the DB deletion to avoid orphan vectors!
    try:
        await qdrant_service.delete_chunks_by_document_id(doc_id)
    except Exception as e:
        logger.error(f"[DocumentRoutes] Qdrant delete failed for {doc_id}: {e}")
        raise HTTPException(status_code=502, detail="Failed to delete document from vector store. Aborting to prevent orphan vectors.")

    domain_id = doc.domain_id
    await db.delete(doc)
    await db.commit()

    if domain_id:
        background_tasks.add_task(redis_service.delete_domain_capabilities, domain_id)

    return {"status": "deleted", "document_id": doc_id}


# ── Update endpoint ───────────────────────────────────────────────────────────

class DocumentUpdateIn(BaseModel):
    source_title: str

@router.put("/{doc_id}")
async def update_document(
    doc_id: str,
    payload: DocumentUpdateIn,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db),
):
    """Update a document's details (e.g. source_title)."""
    org_id: str = user["postgres_user"].organization_id
    
    stmt = select(DocumentSource).where(
        DocumentSource.id == doc_id,
        DocumentSource.organization_id == org_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc.source_title = payload.source_title.strip() or doc.source_title
    await db.commit()
    await db.refresh(doc)
    
    return _doc_out(doc)


# ── Replace File endpoint ─────────────────────────────────────────────────────

@router.put("/{doc_id}/file")
async def replace_document_file(
    doc_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db),
):
    """
    Replace the underlying file for a document.
    Deletes old vectors and re-ingests the new file.
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

    # Validate extension before reading
    ext = _ext(file.filename or "")
    if ext not in {"pdf", "txt", "docx"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: pdf, txt, docx."
        )

    # Extract text synchronously
    try:
        raw_text, file_type, file_size = await extract_text(file)
    except HTTPException as e:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Delete old chunks
    try:
        await qdrant_service.delete_chunks_by_document_id(doc_id)
    except Exception as e:
        logger.error(f"[DocumentRoutes] Qdrant delete failed for {doc_id} during replacement: {e}")
        # Proceed anyway
    
    # Update document record
    doc.filename = file.filename or "upload"
    doc.file_type = ext
    doc.file_size = file_size
    doc.status = "queued"
    doc.chunk_count = 0
    doc.error_message = None
    doc.error_stage = None
    await db.commit()
    await db.refresh(doc)
    
    domain_id = doc.domain_id
    title = doc.source_title
    
    # Re-run ingestion in background
    async def _run_replacement_ingestion():
        async with db.bind.connect() as conn:
            from database.database import AsyncSessionLocal
            async with AsyncSessionLocal() as bg_db:
                async def update_status(new_status: str):
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        record.status = new_status
                        await bg_db.commit()

                try:
                    await update_status("processing")
                    n_chunks = await ingest_document(
                        raw_text=raw_text,
                        tenant_id=org_id,
                        domain_id=domain_id,
                        document_source_id=doc_id,
                        source_title=title,
                        filename=file.filename or "upload",
                        ollama_service=ollama_service,
                        qdrant_service=qdrant_service,
                        status_callback=update_status,
                    )
                    await update_status("ready")
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        record.chunk_count = n_chunks
                        await bg_db.commit()
                        if domain_id:
                            from services.redis_service import redis_service
                            await redis_service.delete_domain_capabilities(domain_id)
                    logger.info(f"[DocumentRoutes] Replacement ingestion complete: {doc_id} ({n_chunks} chunks)")
                except HTTPException as e:
                    logger.error(f"[DocumentRoutes] Replacement ingestion failed: {doc_id}: {e.detail}")
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        stage = record.status
                        if stage == "processing": record.error_stage = "Chunking failed"
                        elif stage == "embedding": record.error_stage = "Embedding failed"
                        elif stage == "indexing": record.error_stage = "Vector store failed"
                        else: record.error_stage = f"{stage.capitalize()} failed"
                        record.status = "failed"
                        record.error_message = e.detail
                        await bg_db.commit()
                except Exception as e:
                    logger.error(f"[DocumentRoutes] Replacement ingestion unexpected error: {doc_id}: {e}")
                    stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                    r = await bg_db.execute(stmt)
                    record = r.scalar_one_or_none()
                    if record:
                        stage = record.status
                        if stage == "processing": record.error_stage = "Chunking failed"
                        elif stage == "embedding": record.error_stage = "Embedding failed"
                        elif stage == "indexing": record.error_stage = "Vector store failed"
                        else: record.error_stage = f"{stage.capitalize()} failed"
                        record.status = "failed"
                        record.error_message = str(e)
                        await bg_db.commit()
                finally:
                    try:
                        stmt = select(DocumentSource).where(DocumentSource.id == doc_id)
                        r = await bg_db.execute(stmt)
                        record = r.scalar_one_or_none()
                        if record and record.status not in ["ready", "failed"]:
                            stage = record.status
                            if stage == "processing": record.error_stage = "Chunking failed"
                            elif stage == "embedding": record.error_stage = "Embedding failed"
                            elif stage == "indexing": record.error_stage = "Vector store failed"
                            else: record.error_stage = f"{stage.capitalize()} failed"
                            record.status = "failed"
                            record.error_message = record.error_message or "Process terminated unexpectedly."
                            await bg_db.commit()
                    except Exception as fatal_e:
                        pass

    asyncio.create_task(_run_replacement_ingestion())

    return {
        "status": "processing",
        "document_id": doc_id,
        "message": f"Document '{title}' replacement is being processed. Poll /documents/{doc_id}/status for updates.",
    }
