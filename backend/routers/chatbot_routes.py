from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from database.database import get_db, AsyncSessionLocal
from database.models import Domain, FailedQuestion, DomainCategory
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service
import hashlib
import json
import asyncio

router = APIRouter(prefix="/chat", tags=["chatbot"])

class ChatRequest(BaseModel):
    domain_id: str
    message: str
    session_id: str = None

async def log_failed_question(domain_id: str, question: str, ai_response: str, reason: str):
    async with AsyncSessionLocal() as session:
        fq = FailedQuestion(
            domain_id=domain_id,
            question=question,
            ai_response=ai_response,
            failure_reason=reason
        )
        session.add(fq)
        await session.commit()

@router.post("/ask")
async def ask_chatbot(request: ChatRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    normalized_q = request.message.strip().lower()
    q_hash = hashlib.md5(normalized_q.encode()).hexdigest()
    
    # 1. Answer Cache (Exact match)
    cache_key = f"chat:{request.domain_id}:{q_hash}"
    cached_response = await redis_service.get_cached_response(cache_key)
    if cached_response:
        return {"answer": cached_response["answer"], "cached": True}

    # 2. Parallelize Domain Lookup + Get Categories
    async def get_domain():
        stmt = select(Domain).where(Domain.id == request.domain_id)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()
        
    async def get_categories():
        cats = await redis_service.get_domain_categories(request.domain_id)
        if cats is not None:
            return cats
        async with AsyncSessionLocal() as session:
            cat_stmt = select(DomainCategory.category_id).where(DomainCategory.domain_id == request.domain_id)
            cat_res = await session.execute(cat_stmt)
            cat_ids = cat_res.scalars().all()
        if cat_ids:
            background_tasks.add_task(redis_service.set_domain_categories, request.domain_id, cat_ids)
        return cat_ids

    domain, category_ids = await asyncio.gather(get_domain(), get_categories())
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    tenant_id = domain.organization_id

    # 3. Redis Embedding Cache -> Hit? Use. Else -> Generate & Cache
    query_vector = await redis_service.get_cached_embedding(q_hash)
    if not query_vector:
        try:
            query_vector = await ollama_service.generate_embedding(request.message)
            background_tasks.add_task(redis_service.set_cached_embedding, q_hash, query_vector)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate embeddings: {str(e)}")

    # 4. Search Qdrant
    try:
        top_chunks = await qdrant_service.search_chunks(
            tenant_id=tenant_id,
            query_vector=query_vector,
            category_ids=category_ids,
            limit=3
        )
    except Exception as e:
        print(f"Qdrant search error: {e}")
        top_chunks = []

    fallback = domain.settings.get("fallback_message", "I don't have enough information to answer that based on the current knowledge base.") if domain.settings else "I don't have enough information to answer that based on the current knowledge base."

    if not top_chunks:
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, fallback, "NO_MATCH")
        return {"answer": fallback, "cached": False, "sources": 0}

    # Since chunks are returned sorted by score, the first is max_score
    max_score = top_chunks[0].get("score", 0)

    # 5. Score Check
    if max_score >= 0.97:
        # Ultimate Fast Path
        fast_answer = top_chunks[0].get("payload", {}).get("answer")
        if fast_answer:
            background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": fast_answer}, 3600)
            return {"answer": fast_answer, "cached": False, "sources": 1, "fast_path": True}

    if max_score < 0.75:
        # Early Exit
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, fallback, "LOW_CONFIDENCE")
        return {"answer": fallback, "cached": False, "sources": len(top_chunks)}

    # 6. Build Context & Call LLM
    context_text = "\n\n".join([chunk.get("payload", {}).get("text", "") for chunk in top_chunks])
    
    system_prompt = f"""You are a helpful and precise AI assistant for the website {domain.domain_name}.
You must answer the user's question relying ONLY on the provided context.
If the context does not contain the answer, or if you are unsure, you must reply EXACTLY with: "{fallback}"
Do not guess, do not provide external knowledge, and do not hallucinate.

Context:
{context_text}"""

    try:
        answer = await ollama_service.generate_response(
            system_prompt=system_prompt,
            user_query=request.message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate LLM response: {str(e)}")

    if fallback.lower() in answer.lower() or "i don't have enough information" in answer.lower():
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, answer, "LLM_FAILURE")
    else:
        background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": answer}, 3600)

    return {"answer": answer, "cached": False, "sources": len(top_chunks)}
