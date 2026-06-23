from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from database.database import get_db, AsyncSessionLocal
from database.models import Domain, FailedQuestion, DomainCategory, FAQQuestion, FAQCategory
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service
import hashlib
import json
import logging
import asyncio

logger = logging.getLogger("chatbot.routers.chatbot_routes")

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

async def search_faqs_fts(db: AsyncSession, domain_id: str, query: str, limit: int = 5):
    from sqlalchemy.sql import func
    # Combine question, answer, and aliases for FTS
    search_text = FAQQuestion.question + ' ' + FAQQuestion.answer + ' ' + func.coalesce(func.array_to_string(FAQQuestion.aliases, ' '), '')
    
    stmt = select(FAQQuestion).join(
        FAQCategory, FAQQuestion.faq_id == FAQCategory.id
    ).join(
        DomainCategory, FAQCategory.id == DomainCategory.category_id
    ).where(
        DomainCategory.domain_id == domain_id,
        FAQQuestion.status == 'active'
    ).where(
        func.to_tsvector('english', search_text).op('@@')(func.websearch_to_tsquery('english', query))
    ).order_by(
        func.ts_rank(func.to_tsvector('english', search_text), func.websearch_to_tsquery('english', query)).desc()
    ).limit(limit)
    
    res = await db.execute(stmt)
    faqs = res.scalars().all()
    
    results = []
    for faq in faqs:
        results.append({
            "payload": {
                "question": faq.question,
                "answer": faq.answer,
                "text": f"Q: {faq.question}\nA: {faq.answer}"
            },
            "score": 0.95 # High score but below fast-path threshold
        })
    return results

from utils.nlp_utils import normalize_query

@router.post("/ask")
async def ask_chatbot(request: ChatRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    normalized_q = normalize_query(request.message)
    
    chat_history = []
    if request.session_id:
        raw_history = await redis_service.get_chat_history(request.session_id)
        if raw_history:
            chat_history = [msg for msg in raw_history if "don't have enough information" not in msg.get("ai", "").lower()]
        
    resolved_query = normalized_q
    if chat_history:
        followup_words = ["how", "what", "when", "where", "why", "who", "it", "that", "this", "they", "those", "he", "she"]
        is_short = len(normalized_q.split()) < 6
        has_pronoun = any(word in normalized_q.lower().split() for word in followup_words)
        
        if is_short or has_pronoun:
            try:
                resolved_query = await ollama_service.rewrite_query(chat_history, normalized_q)
                print(f"Rewrote query: '{normalized_q}' -> '{resolved_query}'")
            except Exception as e:
                print(f"Query rewrite failed: {e}")
                resolved_query = normalized_q
        
    q_hash = hashlib.md5(resolved_query.lower().encode()).hexdigest()
    
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
            query_vector = await ollama_service.generate_embedding(resolved_query)
            background_tasks.add_task(redis_service.set_cached_embedding, q_hash, query_vector)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate embeddings: {str(e)}")

    # 4. Search Qdrant and Postgres FTS
    async def run_qdrant():
        try:
            return await qdrant_service.search_chunks(
                tenant_id=tenant_id,
                query_vector=query_vector,
                category_ids=category_ids,
                limit=3
            )
        except Exception as e:
            print(f"Qdrant search error: {e}")
            return []
            
    qdrant_chunks, fts_chunks = await asyncio.gather(
        run_qdrant(),
        search_faqs_fts(db, request.domain_id, resolved_query, limit=3)
    )

    # Merge and deduplicate
    seen_texts = set()
    top_chunks = []
    
    for chunk in fts_chunks + qdrant_chunks:
        payload = chunk.get("payload", {})
        text_content = payload.get("question") or payload.get("text", "")
        # Very simple deduplication by content
        short_key = text_content[:100].lower()
        if short_key not in seen_texts:
            seen_texts.add(short_key)
            top_chunks.append(chunk)
            
    # Sort by score descending
    top_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
    top_chunks = top_chunks[:5]

    fallback = domain.settings.get("fallback_message", "I don't have enough information to answer that based on the current knowledge base.") if domain.settings else "I don't have enough information to answer that based on the current knowledge base."

    if not top_chunks:
        logger.info({
            "question": request.message,
            "score": 0.0,
            "matched_question": None,
            "matched_category": category_ids,
            "path": "NO_MATCH"
        })
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, fallback, "NO_MATCH")
        return {"answer": fallback, "cached": False, "sources": 0}

    # Since chunks are returned sorted by score, the first is max_score
    max_score = top_chunks[0].get("score", 0)

    # 5. Score Check
    if max_score >= 0.95:
        # Ultimate Fast Path
        fast_answer = top_chunks[0].get("payload", {}).get("answer")
        if fast_answer:
            logger.info({
                "question": request.message,
                "score": max_score,
                "matched_question": top_chunks[0].get("payload", {}).get("question"),
                "matched_category": category_ids,
                "path": "FAST_PATH"
            })
            background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": fast_answer}, 3600)
            return {"answer": fast_answer, "cached": False, "sources": 1, "fast_path": True}

    if max_score < 0.60:
        # Early Exit
        logger.info({
            "question": request.message,
            "score": max_score,
            "matched_question": top_chunks[0].get("payload", {}).get("question"),
            "matched_category": category_ids,
            "path": "FALLBACK"
        })
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, fallback, "LOW_CONFIDENCE")
        return {"answer": fallback, "cached": False, "sources": len(top_chunks)}

    # 6. Build Context & Call LLM
    context_parts = []
    for chunk in top_chunks:
        payload = chunk.get("payload", {})
        if "answer" in payload:
            context_parts.append(payload["answer"])
        else:
            text = payload.get("text", "")
            # Remove Q: and A: prefixes if present
            if text.startswith("Q:"):
                text = text.replace("Q:", "").replace("A:", "").strip()
            context_parts.append(text)
    
    context_text = "\n\n".join(context_parts)
    
    history_text = ""
    if chat_history:
        history_parts = ["Conversation History:"]
        for msg in chat_history:
            history_parts.append(f"User: {msg['user']}\nAssistant: {msg['ai']}")
        history_text = "\n\n" + "\n".join(history_parts)

    system_prompt = f"""You are a helpful and precise AI assistant for the website {domain.domain_name}.
You must answer the user's question relying ONLY on the provided context.
You may correct minor spelling mistakes in the user's question to match the context.
If the context does not contain the information needed to answer the user's question, you must reply EXACTLY with the following string and nothing else: "{fallback}"
Do not guess, do not provide external knowledge, do not hallucinate, and do not provide any explanations if the context is insufficient.{history_text}

Context:
{context_text}"""

    try:
        print("SYSTEM PROMPT:")
        print(system_prompt)
        print("USER QUERY:", request.message)
        answer = await ollama_service.generate_response(
            system_prompt=system_prompt,
            user_query=request.message
        )
        print("LLM ANSWER:", answer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate LLM response: {str(e)}")

    if fallback.lower() in answer.lower() or "i don't have enough information" in answer.lower():
        path_type = "LLM_FAILURE"
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, answer, "LLM_FAILURE")
    else:
        path_type = "LLM_PATH"
        background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": answer}, 3600)

    logger.info({
        "question": request.message,
        "score": max_score,
        "matched_question": top_chunks[0].get("payload", {}).get("question"),
        "matched_category": category_ids,
        "path": path_type
    })

    if request.session_id:
        background_tasks.add_task(redis_service.add_to_chat_history, request.session_id, request.message, answer)

    return {"answer": answer, "cached": False, "sources": len(top_chunks), "debug_prompt": system_prompt, "debug_llm_answer": answer}
