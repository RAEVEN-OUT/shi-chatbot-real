from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from database.database import get_db
from database.models import Domain, FailedQuestion
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service
import hashlib
import json

router = APIRouter(prefix="/chat", tags=["chatbot"])

class ChatRequest(BaseModel):
    domain_id: str
    message: str
    session_id: str = None

@router.post("/ask")
async def ask_chatbot(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    # 1. Verify Domain exists
    stmt = select(Domain).where(Domain.id == request.domain_id)
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    tenant_id = domain.organization_id

    # 2. Check Cache
    cache_key = f"chat:{request.domain_id}:{hashlib.md5(request.message.encode()).hexdigest()}"
    cached_response = await redis_service.get_cached_response(cache_key)
    if cached_response:
        return {"answer": cached_response["answer"], "cached": True}

    # 3. Generate Embedding for the User Query using nomic-embed-text
    try:
        query_vector = await ollama_service.generate_embedding(request.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate embeddings: {str(e)}")

    # 4. Search Qdrant for similar chunks
    try:
        from database.models import DomainCategory
        cat_stmt = select(DomainCategory.category_id).where(DomainCategory.domain_id == request.domain_id)
        cat_res = await db.execute(cat_stmt)
        category_ids = cat_res.scalars().all()

        top_chunks = await qdrant_service.search_chunks(
            tenant_id=tenant_id,
            query_vector=query_vector,
            category_ids=category_ids,
            limit=3
        )
    except Exception as e:
        print(f"Qdrant search error: {e}")
        top_chunks = []

    # 5. Construct Context
    if top_chunks:
        context_text = "\n\n".join([chunk.get("payload", {}).get("text", "") for chunk in top_chunks])
        max_score = max(chunk.get("score", 0) for chunk in top_chunks)
    else:
        context_text = ""
        max_score = 0.0
    
    system_prompt = f"""You are a helpful AI assistant for the website {domain.domain_name}.
Use the following context to answer the user's question. If the answer is not in the context, say "I don't have enough information to answer that based on the current knowledge base." Do not hallucinate.

Context:
{context_text}"""

    # 6. Generate Response using configured LLM
    try:
        answer = await ollama_service.generate_response(
            system_prompt=system_prompt,
            user_query=request.message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate LLM response: {str(e)}")

    # Auto-log Failed Question
    is_failed = False
    failure_reason = ""
    if not top_chunks:
        is_failed = True
        failure_reason = "NO_MATCH"
    elif max_score < 0.75:
        is_failed = True
        failure_reason = "LOW_CONFIDENCE"
    elif "I don't have enough information" in answer:
        is_failed = True
        failure_reason = "LLM_FAILURE"

    if is_failed:
        failed_q = FailedQuestion(
            domain_id=request.domain_id,
            question=request.message,
            ai_response=answer,
            failure_reason=failure_reason
        )
        db.add(failed_q)
        await db.commit()

    # 7. Cache Response (1 hour)
    await redis_service.set_cached_response(cache_key, {"answer": answer}, expire=3600)

    return {"answer": answer, "cached": False, "sources": len(top_chunks)}
