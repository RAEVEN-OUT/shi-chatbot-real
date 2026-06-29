from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from database.database import get_db, AsyncSessionLocal
from database.models import Domain, FailedQuestion, DomainCategory, FAQQuestion, FAQCategory
from schemas.retrieval import KnowledgeSource
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service
from utils.nlp_utils import normalize_query
from utils.intent_utils import detect_intent
import hashlib
import logging
import asyncio
import re

def _strip_preamble(text: str) -> str:
    """Remove LLM thinking-out-loud preambles before the actual answer."""
    preamble_pattern = re.compile(
        r'^(you (want|are asking|would like|seem|mentioned)|'
        r'based on|according to|sure[,!]|of course[,!]|'
        r'certainly[,!]|great question[,!]|i see[,!])'
        r'[^\n]*\n+',
        re.IGNORECASE | re.MULTILINE
    )
    cleaned = preamble_pattern.sub('', text.strip())
    return cleaned.strip() or text.strip()

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
    """
    Full-text search over FAQQuestion.question + answer + aliases,
    scoped to the domain via domain_categories.
    FIX #11: coalesce aliases safely; use websearch_to_tsquery for robustness.
    """
    from sqlalchemy.sql import func, text

    search_text = (
        FAQQuestion.question
        + " "
        + FAQQuestion.answer
        + " "
        + func.coalesce(func.array_to_string(FAQQuestion.aliases, " "), "")
    )

    stmt = (
        select(FAQQuestion)
        .join(FAQCategory, FAQQuestion.faq_id == FAQCategory.id)
        .join(DomainCategory, FAQCategory.id == DomainCategory.category_id)
        .where(
            DomainCategory.domain_id == domain_id,
            FAQQuestion.status == "active"
        )
        .where(
            func.to_tsvector("english", search_text).op("@@")(
                func.websearch_to_tsquery("english", query)
            )
        )
        .order_by(
            func.ts_rank(
                func.to_tsvector("english", search_text),
                func.websearch_to_tsquery("english", query)
            ).desc()
        )
        .limit(limit)
    )

    res = await db.execute(stmt)
    faqs = res.scalars().all()

    return [
        {
            "payload": {
                "question": faq.question,
                "answer": faq.answer,
                "text": f"Q: {faq.question}\nA: {faq.answer}"
            },
            # FIX #12: FTS score 0.92 — above LLM threshold but below fast-path,
            # so FTS hits still go through LLM for natural phrasing
            "score": 0.92
        }
        for faq in faqs
    ]


@router.post("/ask")
async def ask_chatbot(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    normalized_q = normalize_query(request.message)

    # 1. Parallel domain lookup + category fetch
    async def get_domain():
        stmt = select(Domain).where(Domain.id == request.domain_id)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_categories():
        cats = await redis_service.get_domain_categories(request.domain_id)
        if cats is not None:
            return cats
        async with AsyncSessionLocal() as s:
            res = await s.execute(
                select(DomainCategory.category_id).where(DomainCategory.domain_id == request.domain_id)
            )
            cat_ids = list(res.scalars().all())
        if cat_ids:
            background_tasks.add_task(redis_service.set_domain_categories, request.domain_id, cat_ids)
        return cat_ids

    domain, category_ids = await asyncio.gather(get_domain(), get_categories())
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")

    fallback = (domain.settings or {}).get(
        "fallback_message",
        "Sorry, we could not find an answer. Please contact support."
    )

    # Chat history from Redis for query rewriting
    chat_history = []
    if request.session_id:
        raw = await redis_service.get_chat_history(request.session_id)
        if raw:
            chat_history = [
                m for m in raw
                if "don't have enough information" not in m.get("ai", "").lower()
                and fallback.lower() not in m.get("ai", "").lower()
            ]

    resolved_query = normalized_q
    if chat_history:
        followup_words = {"how", "what", "when", "where", "why", "who", "it", "that", "this", "they", "those", "he", "she"}
        words = set(normalized_q.lower().split())
        if len(words) < 6 or bool(words & followup_words):
            try:
                resolved_query = await ollama_service.rewrite_query(chat_history, normalized_q)
                logger.info(f"Query rewrite: '{normalized_q}' → '{resolved_query}'")
            except Exception as e:
                logger.error(f"Query rewrite failed: {e}")
                resolved_query = normalized_q

    q_hash = hashlib.md5(resolved_query.lower().encode()).hexdigest()
    cache_key = f"chat:{request.domain_id}:{q_hash}"

    # 2. Answer cache
    cached = await redis_service.get_cached_response(cache_key)
    if cached:
        return {"answer": cached["answer"], "cached": True}

    intent = detect_intent(normalized_q)
    if intent:
        domain_settings = domain.settings or {}
        if intent in ["greeting", "goodbye", "thanks", "human_request"]:
            if intent == "greeting":
                ans = domain_settings.get("welcome_message", "Hi! How can I help you today?")
            elif intent == "goodbye":
                ans = domain_settings.get("farewell_message", "Goodbye! Have a great day!")
            elif intent == "thanks":
                ans = "You're welcome! Let me know if you need anything else."
            elif intent == "human_request":
                ans = domain_settings.get("human_request_message", "Please contact our support team or use the available contact options on this website.")
            
            logger.info({"event": "INTENT_PATH", "intent": intent, "question": request.message})
            if request.session_id:
                background_tasks.add_task(redis_service.add_to_chat_history, request.session_id, request.message, ans)
            return {"answer": ans, "cached": False, "sources": 0}
            
        elif intent in ["bot_identity", "capabilities"]:
            bot_name = domain_settings.get("bot_name", "SHI Chatbot")
            bot_desc = domain_settings.get("bot_description", "An AI assistant that helps visitors using the knowledge base.")
            
            sys_prompt = f"Bot Name: {bot_name}\nBot Description: {bot_desc}\nRespond naturally in 1-2 sentences using the above details."
            try:
                ans = await ollama_service.generate_response(system_prompt=sys_prompt, user_query=request.message)
                ans = _strip_preamble(ans)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"LLM error: {e}")
                
            logger.info({"event": "INTENT_PATH", "intent": intent, "question": request.message})
            background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": ans}, 3600)
            if request.session_id:
                background_tasks.add_task(redis_service.add_to_chat_history, request.session_id, request.message, ans)
            return {"answer": ans, "cached": False, "sources": 0}

    # 3. Embedding cache
    query_vector = await redis_service.get_cached_embedding(q_hash)
    if not query_vector:
        try:
            query_vector = await ollama_service.generate_embedding(resolved_query)
            background_tasks.add_task(redis_service.set_cached_embedding, q_hash, query_vector)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Embedding error: {e}")

    # 4. Parallel Qdrant + FTS
    async def run_qdrant():
        try:
            return await qdrant_service.search_chunks(
                tenant_id=domain.organization_id,
                query_vector=query_vector,
                category_ids=category_ids,
                domain_id=request.domain_id,
                limit=3
            )
        except Exception as e:
            logger.error(f"Qdrant error: {e}")
            return []

    qdrant_chunks, fts_chunks = await asyncio.gather(
        run_qdrant(),
        search_faqs_fts(db, request.domain_id, resolved_query, limit=3)
    )

    # Merge and deduplicate — FTS first
    seen = set()
    knowledge_sources = []
    for chunk in fts_chunks + qdrant_chunks:
        p = chunk.get("payload", {})
        
        if p.get("question_id"):
            key = f"faq_{p['question_id']}"
        elif p.get("document_source_id") and p.get("chunk_index") is not None:
            key = f"doc_{p['document_source_id']}_{p['chunk_index']}"
        else:
            text = p.get("question") or p.get("text", "")
            key = hashlib.sha256(text.encode('utf-8')).hexdigest()
            
        if key not in seen:
            seen.add(key)
            if "answer" in p:
                content = f"Question:\n{p.get('question', '')}\nAnswer:\n{p['answer']}"
                source_type = "FAQ"
            else:
                content = p.get("text", "")
                source_type = "Document"
                
            knowledge_sources.append(KnowledgeSource(
                id=key,
                source_type=source_type,
                score=chunk.get("score", 0),
                content=content,
                metadata=p
            ))

    knowledge_sources.sort(key=lambda x: x.score, reverse=True)
    top_sources = knowledge_sources[:5]

    retrieval_summary = [{"type": src.source_type, "score": round(src.score, 4)} for src in top_sources]
    logger.info({
        "event": "RETRIEVAL_SUMMARY",
        "question": request.message,
        "results": retrieval_summary,
        "total": len(top_sources)
    })

    if not top_sources:
        logger.info({"event": "NO_MATCH", "question": request.message, "resolved": resolved_query})
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, fallback, "NO_MATCH")
        return {"answer": fallback, "cached": False, "sources": 0}

    max_score = top_sources[0].score

    # 5. Fast path
    if max_score >= 0.95:
        fast_answer = top_sources[0].metadata.get("answer")
        if fast_answer:
            logger.info({"event": "FAST_PATH", "question": request.message, "score": max_score})
            background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": fast_answer}, 3600)
            return {"answer": fast_answer, "cached": False, "sources": 1, "fast_path": True}

    # 6. Early exit
    if max_score < 0.60:
        logger.info({"event": "LOW_CONFIDENCE", "question": request.message, "score": max_score})
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, fallback, "LOW_CONFIDENCE")
        return {"answer": fallback, "cached": False, "sources": len(top_sources)}

    # 7. LLM path
    context_parts = []
    for i, item in enumerate(top_sources, 1):
        context_parts.append(f"Source {i} ({item.source_type})\n{item.content}")
    context_text = "\n\n".join(context_parts)

    history_text = ""
    if chat_history:
        lines = ["Conversation History:"]
        for m in chat_history:
            lines.append(f"User: {m['user']}\nAssistant: {m['ai']}")
        history_text = "\n\n" + "\n".join(lines)

    system_prompt = (
        f"You are a helpful AI assistant for {domain.domain_name}.\n"
        f"Use ONLY the supplied Knowledge Base.\n"
        f"The Knowledge Base is reference material.\n"
        f"Do NOT copy it verbatim.\n"
        f"Answer ONLY the user's question.\n"
        f"Extract only the information necessary.\n"
        f"If additional information exists in the Knowledge Base but was not requested, omit it.\n"
        f"Keep responses concise.\n"
        f"Do not invent information.\n"
        f"If the answer cannot be found in the Knowledge Base, return exactly:\n"
        f"\"{fallback}\"\n\n"
        f"Example\n\n"
        f"Knowledge Base\n\n"
        f"Question:\n"
        f"What is your name and age?\n\n"
        f"Answer:\n"
        f"I'm Raveen and I'm 20 years old.\n\n"
        f"User:\n"
        f"How old are you?\n\n"
        f"Assistant:\n"
        f"20 years old.\n\n"
        f"Second example\n\n"
        f"Knowledge Base\n\n"
        f"Question:\n"
        f"What is your name and age?\n\n"
        f"Answer:\n"
        f"I'm Raveen and I'm 20 years old.\n\n"
        f"User:\n"
        f"What is your name?\n\n"
        f"Assistant:\n"
        f"Raveen.\n\n"
        f"{history_text}\n\n"
        f"Knowledge Base:\n{context_text}"
    )

    try:
        answer = await ollama_service.generate_response(
            system_prompt=system_prompt,
            user_query=request.message
        )
        answer = _strip_preamble(answer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    if fallback.lower() in answer.lower() or "i don't have enough information" in answer.lower():
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, answer, "LLM_FAILURE")
        path = "LLM_FAILURE"
        answer = fallback
    else:
        background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": answer}, 3600)
        if request.session_id:
            background_tasks.add_task(redis_service.add_to_chat_history, request.session_id, request.message, answer)
        path = "LLM_PATH"

    logger.info({"event": path, "question": request.message, "score": max_score})
    return {"answer": answer, "cached": False, "sources": len(top_chunks)}
