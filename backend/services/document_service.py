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
import re
from typing import List, Tuple

from fastapi import UploadFile, HTTPException

logger = logging.getLogger(__name__)

# ── Text Extraction ──────────────────────────────────────────────────────────

ALLOWED_TYPES = {"pdf", "txt", "docx"}
MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB hard limit

def normalize_text(text: str) -> str:
    if not text:
        return ""
    
    # Remove zero-width spaces and control characters (keep \n, \t, \r)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b\u200c\u200d\ufeff]', '', text)
    
    # Replace multiple spaces/tabs with a single space
    text = re.sub(r'[ \t]+', ' ', text)
    
    # Replace 3 or more newlines (potentially with spaces between them) with exactly 2 newlines
    text = re.sub(r'(\n\s*){3,}', '\n\n', text)
    
    return text.strip()


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


async def extract_text(file: UploadFile) -> Tuple[str, str, int]:
    """
    Returns (raw_text, file_type, file_size).
    Raises HTTPException on unsupported type or extraction failure.
    """
    ext = _ext(file.filename)
    if ext not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: pdf, txt, docx."
        )

    raw = await file.read()
    file_size = len(raw)
    if file_size == 0:
        raise HTTPException(status_code=400, detail="File is empty (0 bytes).")
    if file_size > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit.")

    if ext == "txt":
        text = None
        for enc in ["utf-8", "utf-16", "latin-1"]:
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            text = raw.decode("utf-8", errors="replace")
            
        text = normalize_text(text)
        if not text:
            raise HTTPException(status_code=422, detail="Document contains no readable text.")
        return text, "txt", file_size

    elif ext == "pdf":
        try:
            full_text = ""
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(stream=raw, filetype="pdf")
                pages = []
                for page in doc:
                    pages.append(page.get_text() or "")
                full_text = "\n\n".join(pages)
            except ImportError:
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(raw))
                pages = []
                for page in reader.pages:
                    pages.append(page.extract_text() or "")
                full_text = "\n\n".join(pages)
            
            full_text = normalize_text(full_text)
            if not full_text:
                raise HTTPException(
                    status_code=422,
                    detail="PDF appears to be a scanned image — no text layer found. "
                           "Please upload a text-based PDF or convert it first."
                )
            return full_text, "pdf", file_size
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
            
            full_text = normalize_text(full_text)
            if not full_text:
                raise HTTPException(status_code=422, detail="DOCX file contains no readable text.")
            return full_text, "docx", file_size
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"DOCX extraction failed: {e}")

    raise HTTPException(status_code=400, detail="Unsupported file type.")


# ── Chunker ──────────────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    chunk_tokens: int = 400,
    overlap_tokens: int = 80,
    fallback_words: int = 350,
    fallback_overlap: int = 75,
) -> List[str]:
    """
    Splits *text* into overlapping token windows using tiktoken, preserving paragraph boundaries.
    Falls back to word chunking if tiktoken is not available.
    """
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    chunks: List[str] = []

    try:
        import tiktoken
        encoding = tiktoken.get_encoding("cl100k_base")
        sep_tokens = len(encoding.encode("\n\n"))
        
        current_paras = []
        current_tokens = 0
        
        for para in paragraphs:
            p_toks = encoding.encode(para)
            num_tokens = len(p_toks)
            
            # Hard-split if a single paragraph is too large
            if num_tokens > chunk_tokens:
                if current_paras:
                    chunks.append("\n\n".join(current_paras))
                    current_paras = []
                    current_tokens = 0
                
                start = 0
                while start < num_tokens:
                    end = min(start + chunk_tokens, num_tokens)
                    slice_toks = p_toks[start:end]
                    chunk_str = encoding.decode(slice_toks).strip()
                    if chunk_str:
                        chunks.append(chunk_str)
                    if end >= num_tokens:
                        break
                    start += max(chunk_tokens - overlap_tokens, 1)
                continue
                
            # If paragraph fits but exceeds current chunk window, emit and calculate overlap
            if current_tokens + num_tokens + (sep_tokens if current_paras else 0) > chunk_tokens and current_paras:
                chunks.append("\n\n".join(current_paras))
                
                overlap_paras = []
                overlap_tokens_count = 0
                for p in reversed(current_paras):
                    pt = len(encoding.encode(p))
                    if overlap_tokens_count + pt + (sep_tokens if overlap_paras else 0) <= overlap_tokens:
                        overlap_paras.insert(0, p)
                        overlap_tokens_count += pt + (sep_tokens if overlap_paras else 0)
                    else:
                        break
                
                current_paras = overlap_paras
                current_tokens = overlap_tokens_count

            current_paras.append(para)
            current_tokens += num_tokens + (sep_tokens if len(current_paras) > 1 else 0)
            
        if current_paras:
            chunks.append("\n\n".join(current_paras))
            
        return chunks

    except ImportError:
        current_paras = []
        current_words = 0
        
        for para in paragraphs:
            words = para.split()
            num_words = len(words)
            
            if num_words > fallback_words:
                if current_paras:
                    chunks.append("\n\n".join(current_paras))
                    current_paras = []
                    current_words = 0
                    
                start = 0
                while start < num_words:
                    end = min(start + fallback_words, num_words)
                    chunk_str = " ".join(words[start:end]).strip()
                    if chunk_str:
                        chunks.append(chunk_str)
                    if end >= num_words:
                        break
                    start += max(fallback_words - fallback_overlap, 1)
                continue
                
            if current_words + num_words > fallback_words and current_paras:
                chunks.append("\n\n".join(current_paras))
                
                overlap_paras = []
                overlap_words_count = 0
                for p in reversed(current_paras):
                    pw = len(p.split())
                    if overlap_words_count + pw <= fallback_overlap:
                        overlap_paras.insert(0, p)
                        overlap_words_count += pw
                    else:
                        break
                        
                current_paras = overlap_paras
                current_words = overlap_words_count

            current_paras.append(para)
            current_words += num_words
            
        if current_paras:
            chunks.append("\n\n".join(current_paras))
            
        return chunks


# ── Ingestion Pipeline ───────────────────────────────────────────────────────

async def ingest_document(
    *,
    raw_text: str,
    tenant_id: str,
    domain_id: str | None,
    document_source_id: str,
    source_title: str,
    filename: str,
    ollama_service,
    qdrant_service,
    chunk_tokens: int = 400,
    overlap_tokens: int = 80,
    status_callback = None,
) -> int:
    """
    Full pipeline: chunk → embed → store.
    Returns the number of chunks ingested.
    Raises HTTPException on any unrecoverable error.
    """
    # 1. Chunk
    chunks = chunk_text(raw_text, chunk_tokens=chunk_tokens, overlap_tokens=overlap_tokens)
    if not chunks:
        raise HTTPException(status_code=422, detail="Document produced no text chunks after extraction.")

    logger.info(
        f"[DocumentService] Ingesting '{filename}': "
        f"{len(raw_text.split())} words → {len(chunks)} chunks"
    )

    import datetime
    import asyncio
    import uuid
    from qdrant_client.models import PointStruct

    now_iso = datetime.datetime.utcnow().isoformat()
    total_chunks = len(chunks)

    points = []
    
    if status_callback:
        await status_callback("embedding")
        
    # 3. Embed all chunks and build PointStructs
    for idx, chunk in enumerate(chunks):
        vector = None
        for attempt in range(4):
            try:
                vector = await ollama_service.generate_embedding(chunk)
                break
            except Exception as e:
                if attempt < 3:
                    logger.warning(f"[DocumentService] Embedding error on chunk {idx}, retrying in {2**attempt}s: {e}")
                    await asyncio.sleep(2 ** attempt)
                else:
                    logger.error(f"[DocumentService] Embedding error on chunk {idx} after 3 retries: {e}")
                    raise HTTPException(status_code=502, detail=f"Embedding service error: {e}")

        payload = {
            "tenant_id": tenant_id,
            "domain_id": domain_id or "",
            "source_type": "document",
            "document_source_id": document_source_id,
            "chunk_index": idx,
            "chunk_count": total_chunks,
            "filename": filename,
            "source_title": source_title,
            "created_at": now_iso,
            "text": chunk
        }
        
        point_id = str(uuid.uuid4())
        points.append(PointStruct(id=point_id, vector=vector, payload=payload))

    if status_callback:
        await status_callback("indexing")

    # 4. Batch Qdrant Inserts (50 chunks per batch)
    batch_size = 50
    for i in range(0, len(points), batch_size):
        batch = points[i:i + batch_size]
        try:
            await qdrant_service.upsert_batch(batch)
        except Exception as e:
            logger.error(f"[DocumentService] Qdrant batch store error (chunks {i} to {i+len(batch)-1}): {e}")
            raise HTTPException(status_code=502, detail=f"Vector store batch error: {e}")

    return len(chunks)
