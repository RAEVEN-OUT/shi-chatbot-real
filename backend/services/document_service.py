"""
document_service.py
-------------------
Full RAG document ingestion pipeline:
  1. Extract raw text from .pdf / .docx / .txt
  2. Chunk into overlapping windows (~500 words, 100-word overlap)
  3. Generate embeddings via Ollama
  4. Bulk-insert into Qdrant with source_type="document" metadata
"""
from __future__ import annotations

import io
import logging

from typing import List, Tuple

from fastapi import UploadFile, HTTPException

logger = logging.getLogger(__name__)

# ── Text Extraction ──────────────────────────────────────────────────────────

ALLOWED_TYPES = {"pdf", "txt", "docx"}
MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB hard limit


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


async def extract_text(file: UploadFile) -> Tuple[str, str]:
    """
    Returns (raw_text, file_type).
    Raises HTTPException on unsupported type or extraction failure.
    """
    ext = _ext(file.filename)
    if ext not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: pdf, txt, docx."
        )

    raw = await file.read()
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit.")

    if ext == "txt":
        try:
            return raw.decode("utf-8", errors="replace"), "txt"
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not read text file: {e}")

    elif ext == "pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            pages = []
            for page in reader.pages:
                text = page.extract_text() or ""
                pages.append(text)
            full_text = "\n\n".join(pages)
            if not full_text.strip():
                raise HTTPException(
                    status_code=422,
                    detail="PDF appears to be a scanned image — no text layer found. "
                           "Please upload a text-based PDF or convert it first."
                )
            return full_text, "pdf"
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"PDF extraction failed: {e}")

    elif ext == "docx":
        try:
            import docx as python_docx
            doc = python_docx.Document(io.BytesIO(raw))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            full_text = "\n\n".join(paragraphs)
            if not full_text.strip():
                raise HTTPException(status_code=422, detail="DOCX file contains no readable text.")
            return full_text, "docx"
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"DOCX extraction failed: {e}")

    raise HTTPException(status_code=400, detail="Unsupported file type.")


# ── Chunker ──────────────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    chunk_words: int = 500,
    overlap_words: int = 100,
) -> List[str]:
    """
    Splits *text* into overlapping word windows.
    Returns a list of chunk strings (non-empty only).

    Strategy:
      - Tokenise on whitespace (preserves punctuation in words).
      - Slide a window of *chunk_words* forward by (chunk_words - overlap_words).
      - Last window is always included, even if shorter than chunk_words.
    """
    words = text.split()
    if not words:
        return []

    step = max(chunk_words - overlap_words, 1)
    chunks: List[str] = []

    start = 0
    while start < len(words):
        end = min(start + chunk_words, len(words))
        chunk = " ".join(words[start:end]).strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(words):
            break
        start += step

    return chunks


# ── Ingestion Pipeline ───────────────────────────────────────────────────────

async def ingest_document(
    *,
    file: UploadFile,
    tenant_id: str,
    domain_id: str | None,
    document_source_id: str,
    source_title: str,
    filename: str,
    ollama_service,
    qdrant_service,
    chunk_words: int = 500,
    overlap_words: int = 100,
) -> int:
    """
    Full pipeline: extract → chunk → embed → store.
    Returns the number of chunks ingested.
    Raises HTTPException on any unrecoverable error.
    """
    # 1. Extract text
    raw_text, _ = await extract_text(file)

    # 2. Chunk
    chunks = chunk_text(raw_text, chunk_words=chunk_words, overlap_words=overlap_words)
    if not chunks:
        raise HTTPException(status_code=422, detail="Document produced no text chunks after extraction.")

    logger.info(
        f"[DocumentService] Ingesting '{filename}': "
        f"{len(raw_text.split())} words → {len(chunks)} chunks"
    )

    # 3. Embed + store each chunk
    for idx, chunk in enumerate(chunks):
        try:
            vector = await ollama_service.generate_embedding(chunk)
        except Exception as e:
            logger.error(f"[DocumentService] Embedding error on chunk {idx}: {e}")
            raise HTTPException(status_code=502, detail=f"Embedding service error: {e}")

        metadata = {
            "source_type": "document",
            "document_source_id": document_source_id,
            "chunk_index": idx,
            "source_filename": filename,
            "source_title": source_title,
            # No 'question' / 'answer' keys — widget_routes handles this via
            # the 'text' field already present in add_chunk payload.
        }

        try:
            await qdrant_service.add_chunk(
                tenant_id=tenant_id,
                domain_id=domain_id or "",
                text=chunk,
                vector=vector,
                metadata=metadata,
            )
        except Exception as e:
            logger.error(f"[DocumentService] Qdrant store error on chunk {idx}: {e}")
            raise HTTPException(status_code=502, detail=f"Vector store error: {e}")

    return len(chunks)
