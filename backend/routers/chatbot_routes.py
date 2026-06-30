from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from database.database import get_db, AsyncSessionLocal
from database.models import Domain, FailedQuestion, DomainCategory, FAQQuestion, FAQCategory, FAQ, DocumentSource
from schemas.retrieval import KnowledgeSource
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service
from utils.nlp_utils import normalize_query
from utils.intent_utils import detect_intent
from utils.llm_logger import log_failed_question
import hashlib
import logging
import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

def _strip_preamble(text: str) -> str:
    """Remove LLM thinking-out-loud preambles."""
    preamble_pattern = re.compile(
        r'^(you (want|are asking|would like|seem|mentioned)|'
        r'based on|according to|sure[,!]|of course[,!]|'
        r'certainly[,!]|great question[,!]|i see[,!])'
        r'[^\n]*\n+',
        re.IGNORECASE | re.MULTILINE
    )
    cleaned = preamble_pattern.sub('', text.strip())
    return cleaned.strip() or text.strip()

def _estimate_tokens(text: str) -> int:
    return len(text) // 4

logger = logging.getLogger("chatbot.routers.chatbot_routes")
router = APIRouter(prefix="/api/chat", tags=["chatbot"])

# --------------------------------------------------------------------------
# Tuning constants
# --------------------------------------------------------------------------
FTS_FAST_PATH_RANK = 0.35        
SEMANTIC_FAST_PATH_SCORE = 0.95  
LOW_CONFIDENCE_SCORE = 0.60
TOKEN_BUDGET = 3000

FOLLOWUP_PRONOUNS = {"it", "that", "this", "they", "those", "he", "she", "them", "these", "his", "hers"}
FOLLOWUP_CONJUNCTIONS = ("and ", "but ", "so ", "because ", "or ", "then ", "what about ", "how about ")

class ChatRequest(BaseModel):
    domain_id: str
    message: str
    session_id: str = None

# --- Dataclasses ---
@dataclass
class PerformanceMetrics:
    req_start_t: float = field(default_factory=time.perf_counter)
    metrics: Dict[str, float] = field(default_factory=dict)
    analytics: Dict[str, Any] = field(default_factory=lambda: {
        "cache_hit": False,
        "fts_hit": False,
        "semantic_hit": False,
        "fts_fast_path": False,
        "semantic_fast_path": False,
        "rewrite_used": False,
        "retrieved_chunks": 0,
        "prompt_size": 0,
        "completion_length": 0
    })
    
    def record(self, key: str, start_t: float):
        self.metrics[key] = round((time.perf_counter() - start_t) * 1000, 2)
        
    def get_total_duration(self) -> float:
        return round((time.perf_counter() - self.req_start_t) * 1000, 2)
        
    def to_dict(self) -> dict:
        out = dict(self.metrics)
        out.update(self.analytics)
        out["total_duration"] = self.get_total_duration()
        return out

@dataclass
class DomainContext:
    domain: Domain
    category_ids: List[str]
    has_faqs: bool
    has_docs: bool
    fallback: str

@dataclass
class ChatResponse:
    answer: str
    cached: bool
    sources: int = 0
    fast_path: bool = False

@dataclass
class RetrievalResult:
    sources: List[KnowledgeSource]
    max_score: float
    used_fast_path: bool = False
    faq_count: int = 0
    doc_count: int = 0

# --- Helpers ---
def _looks_like_followup(normalized_q: str, chat_history: list) -> bool:
    if not chat_history:
        return False
        
    q_lower = normalized_q.lower()
    words = set(q_lower.split())
    
    if bool(words & FOLLOWUP_PRONOUNS):
        return True
        
    if q_lower.startswith(FOLLOWUP_CONJUNCTIONS):
        return True
        
    if len(words) <= 3:
        return True
        
    last_msg = chat_history[-1]
    prev_ai = set(re.findall(r'\b\w+\b', last_msg.get("ai", "").lower()))
    prev_user = set(re.findall(r'\b\w+\b', last_msg.get("user", "").lower()))
    
    overlap = words & (prev_ai | prev_user)
    if any(len(w) > 4 for w in overlap) and len(words) < 7:
        return True
        
    return False

def _validate_and_clean_response(text: str, fallback: str) -> str:
    if not text or not text.strip():
        return fallback

    if text.count("```") % 2 != 0:
        text += "\n```"

    lines = text.split('\n')
    cleaned_lines = []
    seen_p = set()
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            cleaned_lines.append(line)
            continue
            
        if re.match(r'^([-*]|\d+\.)\s*$', stripped):
            continue 

        norm = re.sub(r'[\W_]+', '', stripped.lower())
        if len(norm) > 10:
            if norm in seen_p:
                continue
            seen_p.add(norm)
            
        if not re.match(r'^([-*#|>`]|\d+\.)', stripped):
            sentences = re.split(r'(?<=[.!?]) +', line)
            seen_s = set()
            unique_s = []
            for s in sentences:
                snorm = re.sub(r'[\W_]+', '', s.lower())
                if len(snorm) > 5:
                    if snorm in seen_s:
                        continue
                    seen_s.add(snorm)
                unique_s.append(s)
            line = " ".join(unique_s)
            
        cleaned_lines.append(line)
        
    cleaned_text = "\n".join(cleaned_lines).strip()
    
    if cleaned_text:
        last_line = cleaned_text.split('\n')[-1].strip()
        if re.match(r'^([-*]|\d+\.)', last_line):
            if not re.search(r'[.!?`*"\])]$', last_line):
                if last_line.endswith((" and", " the", " to", " with", " a", " of")):
                    cleaned_text = cleaned_text[:cleaned_text.rfind('\n')].strip() if '\n' in cleaned_text else ""
                else:
                    cleaned_text += "."

    if not cleaned_text.strip():
        return fallback
        
    return cleaned_text

async def search_faqs_fts(db: AsyncSession, domain_id: str, query: str, limit: int = 5) -> list[KnowledgeSource]:
    """
    Full-text search over FAQQuestion.question + answer + aliases,
    scoped to the domain via domain_categories.
    """
    from sqlalchemy.sql import func

    search_text = (
        FAQQuestion.question
        + " "
        + FAQQuestion.answer
        + " "
        + func.coalesce(func.array_to_string(FAQQuestion.aliases, " "), "")
    )

    tsvector = func.to_tsvector("english", search_text)
    tsquery = func.websearch_to_tsquery("english", query)
    rank = func.ts_rank(tsvector, tsquery, 32).label("rank")

    stmt = (
        select(FAQQuestion, rank)
        .join(FAQCategory, FAQQuestion.faq_id == FAQCategory.id)
        .join(DomainCategory, FAQCategory.id == DomainCategory.category_id)
        .where(
            DomainCategory.domain_id == domain_id,
            FAQQuestion.status == "active"
        )
        .where(tsvector.op("@@")(tsquery))
        .order_by(rank.desc())
        .limit(limit)
    )

    res = await db.execute(stmt)
    rows = res.all()

    return [
        KnowledgeSource(
            id=f"faq_{faq.id}",
            source_type="FAQ",
            score=float(rank_value),
            content=f"{faq.question}\n\n{faq.answer}",
            metadata={
                "question_id": faq.id,
                "question": faq.question,
                "answer": faq.answer,
            }
        )
        for faq, rank_value in rows
    ]


async def _load_domain_and_caps(domain_id: str, db: AsyncSession, background_tasks: BackgroundTasks) -> DomainContext:
    async def get_domain():
        res = await db.execute(select(Domain).where(Domain.id == domain_id))
        return res.scalar_one_or_none()

    async def get_categories():
        cats = await redis_service.get_domain_categories(domain_id)
        if cats is not None:
            return cats
        async with AsyncSessionLocal() as s:
            res = await s.execute(select(DomainCategory.category_id).where(DomainCategory.domain_id == domain_id))
            cat_ids = list(res.scalars().all())
        if cat_ids:
            background_tasks.add_task(redis_service.set_domain_categories, domain_id, cat_ids)
        return cat_ids

    async def get_capabilities():
        caps = await redis_service.get_domain_capabilities(domain_id)
        if caps is not None:
            return caps
        async with AsyncSessionLocal() as s:
            from sqlalchemy import func
            faq_count = await s.scalar(select(func.count(FAQ.id)).where(FAQ.domain_id == domain_id))
            doc_count = await s.scalar(select(func.count(DocumentSource.id)).where(DocumentSource.domain_id == domain_id))
            caps = {"has_faqs": (faq_count or 0) > 0, "has_docs": (doc_count or 0) > 0}
        background_tasks.add_task(redis_service.set_domain_capabilities, domain_id, caps)
        return caps

    domain, category_ids, caps = await asyncio.gather(get_domain(), get_categories(), get_capabilities())
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")

    fallback = (domain.settings or {}).get("fallback_message", "Sorry, we could not find an answer. Please contact support.")
    
    return DomainContext(
        domain=domain,
        category_ids=category_ids,
        has_faqs=caps.get("has_faqs", True),
        has_docs=caps.get("has_docs", True),
        fallback=fallback
    )

async def _load_chat_history(session_id: str, fallback: str) -> list:
    if not session_id:
        return []
    raw = await redis_service.get_chat_history(session_id)
    if not raw:
        return []
    return [
        m for m in raw
        if "don't have enough information" not in m.get("ai", "").lower()
        and fallback.lower() not in m.get("ai", "").lower()
    ]

async def _try_cache(cache_key: str, metrics: PerformanceMetrics, metric_key: str = "cache_lookup") -> Optional[ChatResponse]:
    """Attempt to retrieve a cached LLM response to bypass full retrieval."""
    t0 = time.perf_counter()
    cached = await redis_service.get_cached_response(cache_key)
    metrics.record(metric_key, t0)
    if cached:
        metrics.analytics["cache_hit"] = True
        return ChatResponse(answer=cached["answer"], cached=True)
    return None

async def _handle_intent(request: ChatRequest, normalized_q: str, ctx: DomainContext, cache_key: str, background_tasks: BackgroundTasks, metrics: PerformanceMetrics) -> Optional[ChatResponse]:
    """Fast-path for conversational intents (greetings, thanks) that don't require RAG."""
    t0 = time.perf_counter()
    intent = detect_intent(normalized_q)
    metrics.record("intent_detection", t0)
    
    if not intent:
        return None
        
    domain_settings = ctx.domain.settings or {}
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
        return ChatResponse(answer=ans, cached=False, sources=0)

    elif intent in ["bot_identity", "capabilities"]:
        bot_name = domain_settings.get("bot_name", "SHI Chatbot")
        bot_desc = domain_settings.get("bot_description", "An AI assistant that helps visitors using the knowledge base.")
        ans = f"I am {bot_name}. {bot_desc}"

        logger.info({"event": "INTENT_PATH", "intent": intent, "question": request.message})
        background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": ans}, 3600)
        if request.session_id:
            background_tasks.add_task(redis_service.add_to_chat_history, request.session_id, request.message, ans, normalized_q)
        return ChatResponse(answer=ans, cached=False, sources=0)

    return None

async def _maybe_rewrite_query(normalized_q: str, chat_history: list, metrics: PerformanceMetrics) -> str:
    """Resolve follow-up references using either local heuristics or LLM rewriting."""
    if not _looks_like_followup(normalized_q, chat_history):
        return normalized_q
        
    last_topic = chat_history[-1].get("topic", chat_history[-1].get("user", ""))
    q_lower = normalized_q.lower()
    words = set(q_lower.split())
    
    pronouns = {"it", "this", "that", "they", "those", "these", "he", "she", "them", "its", "their"}
    prefixes = ("and ", "also ", "what about ", "how about ", "then ", "so ")
    
    has_pronoun = bool(words & pronouns)
    has_prefix = q_lower.startswith(prefixes)
    
    if has_pronoun or has_prefix:
        t0 = time.perf_counter()
        resolved_query = f"{last_topic} {normalized_q}"
        logger.info(f"Local query rewrite: '{normalized_q}' → '{resolved_query}'")
        metrics.record("rewrite_query", t0)
        metrics.analytics["rewrite_used"] = True
        return resolved_query

    t0 = time.perf_counter()
    try:
        resolved_query = await ollama_service.rewrite_query(chat_history, normalized_q)
        logger.info(f"LLM query rewrite: '{normalized_q}' → '{resolved_query}'")
        metrics.analytics["rewrite_used"] = True
    except Exception as e:
        logger.error(f"Query rewrite failed: {e}")
        resolved_query = normalized_q
    metrics.record("rewrite_query", t0)
    return resolved_query

async def _try_fts_fast_path(request: ChatRequest, resolved_query: str, current_topic: str, ctx: DomainContext, cache_key: str, db: AsyncSession, background_tasks: BackgroundTasks, metrics: PerformanceMetrics) -> Optional[ChatResponse]:
    """Execute a lightweight Postgres Full-Text Search and return early if confidence is very high."""
    if not ctx.has_faqs:
        return None
        
    t0 = time.perf_counter()
    try:
        fts_chunks = await search_faqs_fts(db, request.domain_id, resolved_query, limit=5)
    except Exception as e:
        logger.error(f"FTS error: {e}")
        fts_chunks = []
    metrics.record("fts_retrieval", t0)
    
    if fts_chunks:
        metrics.analytics["fts_hit"] = True
        logger.info({
            "event": "FTS_EVALUATION",
            "question": resolved_query,
            "ts_rank": fts_chunks[0].score,
            "fast_path_triggered": fts_chunks[0].score >= FTS_FAST_PATH_RANK,
            "faq_id": fts_chunks[0].metadata.get("question_id"),
            "duration_ms": metrics.metrics.get("fts_retrieval")
        })

    if fts_chunks and fts_chunks[0].score >= FTS_FAST_PATH_RANK:
        metrics.analytics["fts_fast_path"] = True
        top = fts_chunks[0]
        fast_answer = top.metadata.get("answer")
        if fast_answer:
            logger.info({
                "event": "RETRIEVAL_SUMMARY",
                "question": request.message,
                "reason": "FTS_FAST_PATH",
                "score": top.score,
                "merged": 1
            })
            background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": fast_answer}, 3600)
            if request.session_id:
                background_tasks.add_task(redis_service.add_to_chat_history, request.session_id, request.message, fast_answer, current_topic)
            return ChatResponse(answer=fast_answer, cached=False, sources=1, fast_path=True)
            
    return None

async def _semantic_retrieval(request: ChatRequest, resolved_query: str, q_hash: str, ctx: DomainContext, cache_key: str, background_tasks: BackgroundTasks, metrics: PerformanceMetrics) -> tuple[Optional[RetrievalResult], Optional[ChatResponse]]:
    """Perform embedding generation, Qdrant vector search, chunk expansion, and result deduplication."""
    t0 = time.perf_counter()
    query_vector = await redis_service.get_cached_embedding(q_hash)
    if not query_vector:
        try:
            query_vector = await ollama_service.generate_embedding(resolved_query)
            background_tasks.add_task(redis_service.set_cached_embedding, q_hash, query_vector)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Embedding error: {e}")
    metrics.record("embedding_generation", t0)

    t0 = time.perf_counter()
    try:
        qdrant_chunks = await qdrant_service.search_chunks(
            tenant_id=ctx.domain.organization_id,
            query_vector=query_vector,
            category_ids=ctx.category_ids,
            domain_id=request.domain_id,
            limit=3,
            skip_faq=not ctx.has_faqs,
            skip_docs=not ctx.has_docs
        )
    except Exception as e:
        logger.error(f"Qdrant error: {e}")
        qdrant_chunks = []
    metrics.record("qdrant_retrieval", t0)

    def _normalize_for_dedup(t: str) -> str:
        return re.sub(r'[\W_]+', '', (t or "").lower())

    seen = set()
    knowledge_sources = []
    for chunk in qdrant_chunks:
        raw_text = chunk.metadata.get("question", "") if chunk.source_type == "FAQ" else chunk.metadata.get("text", "")
        key = _normalize_for_dedup(raw_text)
        if not key:
            key = chunk.id

        if key not in seen:
            seen.add(key)
            knowledge_sources.append(chunk)

    knowledge_sources.sort(key=lambda x: x.score, reverse=True)
    
    t0 = time.perf_counter()
    try:
        expansion_map = await qdrant_service.expand_document_chunks(
            tenant_id=ctx.domain.organization_id,
            sources=knowledge_sources
        )
    except Exception as e:
        logger.error(f"Chunk expansion error: {e}")
        expansion_map = {}
    metrics.record("chunk_expansion", t0)
    
    top_sources = []
    current_tokens = 0
    
    for item in knowledge_sources:
        formatted_source = f"[Source: {item.source_type}]\n{item.content}"
        source_tokens = _estimate_tokens(formatted_source)
        
        if current_tokens + source_tokens > TOKEN_BUDGET:
            break
            
        if item.source_type == "Document" and expansion_map:
            doc_id = item.metadata.get("document_source_id")
            idx = item.metadata.get("chunk_index")
            if doc_id and idx is not None:
                prev_text = expansion_map.get((doc_id, idx - 1))
                next_text = expansion_map.get((doc_id, idx + 1))
                
                expanded_content = item.content
                if prev_text:
                    prev_tokens = _estimate_tokens(prev_text)
                    if current_tokens + source_tokens + prev_tokens <= TOKEN_BUDGET:
                        expanded_content = f"{prev_text}\n\n{expanded_content}"
                        source_tokens += prev_tokens
                        
                if next_text:
                    next_tokens = _estimate_tokens(next_text)
                    if current_tokens + source_tokens + next_tokens <= TOKEN_BUDGET:
                        expanded_content = f"{expanded_content}\n\n{next_text}"
                        source_tokens += next_tokens
                        
                item.content = expanded_content
                
        top_sources.append(item)
        current_tokens += source_tokens

    faq_count = sum(1 for src in top_sources if src.source_type == "FAQ")
    doc_count = sum(1 for src in top_sources if src.source_type == "Document")

    metrics.analytics["retrieved_chunks"] = len(top_sources)
    if top_sources:
        metrics.analytics["semantic_hit"] = True

    base_log = {
        "event": "RETRIEVAL_SUMMARY",
        "question": request.message,
        "faq_results": faq_count,
        "document_results": doc_count,
        "merged": len(top_sources)
    }

    if not top_sources:
        if not ctx.has_faqs and not ctx.has_docs:
            fail_reason = "no context"
        elif not ctx.has_faqs:
            fail_reason = "no FAQ"
        elif not ctx.has_docs:
            fail_reason = "no document"
        else:
            fail_reason = "no context"
            
        base_log["reason"] = fail_reason
        logger.info(base_log)
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, ctx.fallback, fail_reason)
        return None, ChatResponse(answer=ctx.fallback, cached=False, sources=0)

    max_score = top_sources[0].score

    if top_sources[0].source_type == "FAQ" and max_score >= SEMANTIC_FAST_PATH_SCORE:
        metrics.analytics["semantic_fast_path"] = True
        fast_answer = top_sources[0].metadata.get("answer")
        if fast_answer:
            base_log["reason"] = "SEMANTIC_FAST_PATH"
            base_log["score"] = max_score
            logger.info(base_log)
            background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": fast_answer}, 3600)
            return None, ChatResponse(answer=fast_answer, cached=False, sources=1, fast_path=True)

    if max_score < LOW_CONFIDENCE_SCORE:
        base_log["reason"] = "low semantic score"
        base_log["score"] = max_score
        logger.info(base_log)
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, ctx.fallback, "low semantic score")
        return None, ChatResponse(answer=ctx.fallback, cached=False, sources=len(top_sources))

    return RetrievalResult(
        sources=top_sources, 
        max_score=max_score, 
        faq_count=faq_count, 
        doc_count=doc_count
    ), None

def _detect_query_intent(query: str, top_source_type: str) -> str:
    """Classify the user's intent to choose the optimal prompt layout."""
    q_lower = query.lower().strip()
    if q_lower.startswith(("is ", "are ", "can ", "could ", "do ", "does ", "will ", "would ", "should ", "did ", "has ", "have ", "was ", "were ")):
        return "yes/no"
    if any(kw in q_lower for kw in (" vs ", " versus ", " difference between ", " compare ", " better ", " best ")):
        return "comparison"
    if q_lower.startswith(("what is ", "define ", "meaning of ", "what does ")):
        return "definition"
    if q_lower.startswith(("how to ", "how do ", "how can ", "steps to ", "guide ")):
        return "procedural"
    if any(kw in q_lower for kw in ("error", "failed", "not working", "fix", "issue", "problem", "broken")):
        return "troubleshooting"
    if any(kw in q_lower for kw in ("list", "all the", "examples of", "what are the")):
        return "list"
    if top_source_type == "FAQ":
        return "FAQ"
    return "general"

async def _build_context_and_call_llm(request: ChatRequest, current_topic: str, ctx: DomainContext, chat_history: list, result: RetrievalResult, cache_key: str, background_tasks: BackgroundTasks, metrics: PerformanceMetrics) -> ChatResponse:
    """Assemble final context, apply intent-based templates, and generate the final LLM output."""
    t0 = time.perf_counter()
    
    seen_paragraphs = set()
    context_parts = []
    
    for i, item in enumerate(result.sources, 1):
        if item.source_type == "FAQ":
            # Keep FAQs intact but remove extra whitespace
            cleaned_content = re.sub(r'\n{2,}', '\n', item.content.strip())
            # Prevent Documents from repeating FAQ information
            for p in cleaned_content.split('\n'):
                seen_paragraphs.add(re.sub(r'[\W_]+', '', p.lower()))
            context_parts.append(f"[Source {i}: {item.source_type}]\n{cleaned_content}")
        else:
            # Compress repeated paragraphs in Documents (e.g. overlap in chunks)
            paragraphs = [p.strip() for p in item.content.split('\n') if p.strip()]
            unique_paragraphs = []
            for p in paragraphs:
                norm_p = re.sub(r'[\W_]+', '', p.lower())
                if norm_p and norm_p not in seen_paragraphs:
                    seen_paragraphs.add(norm_p)
                    unique_paragraphs.append(p)
            
            if unique_paragraphs:
                cleaned_content = "\n".join(unique_paragraphs)
                context_parts.append(f"[Source {i}: {item.source_type}]\n{cleaned_content}")
                
    context_text = "\n\n".join(context_parts)

    history_text = ""
    if chat_history:
        lines = ["Conversation History:"]
        for m in chat_history:
            lines.append(f"User: {m['user']}\nAssistant: {m['ai']}")
        history_text = "\n\n" + "\n".join(lines)

    top_source_type = result.sources[0].source_type if result.sources else "Document"
    intent = _detect_query_intent(request.message, top_source_type)
    
    templates = {
        "yes/no": "4. Start with 'Yes.' or 'No.', then write a 1-sentence explanation in a single paragraph.",
        "comparison": "4. Compare the items requested using a Markdown table. Do not add conversational text.",
        "definition": "4. Provide a 1-2 sentence definition in a single paragraph.",
        "procedural": "4. Provide step-by-step instructions using a numbered list. Do not use bold/italics unnecessarily.",
        "troubleshooting": "4. Identify the cause and provide a solution using a numbered list.",
        "list": "4. Extract the requested items into a bullet list.",
        "FAQ": "4. Answer directly and concisely in a single paragraph.",
        "general": "4. Answer naturally and concisely (1-5 sentences) in a single paragraph."
    }
    specific_rule = templates.get(intent, templates["general"])

    system_prompt = (
        f"You are the AI assistant for {ctx.domain.domain_name}.\n\n"
        f"RULES:\n"
        f"1. Answer ONLY using the Knowledge Base below. If the answer is missing, reply EXACTLY:\n"
        f"\"{ctx.fallback}\"\n"
        f"2. Never mention the 'Knowledge Base', 'Sources', or say 'According to...'. Do NOT copy verbatim.\n"
        f"3. Correct user spelling silently.\n"
        f"{specific_rule}\n\n"
        f"{history_text}\n\n"
        f"KNOWLEDGE BASE:\n"
        f"{context_text}"
    )
    metrics.record("prompt_construction", t0)

    start_time = time.time()
    t0 = time.perf_counter()
    try:
        answer = await ollama_service.generate_response(
            system_prompt=system_prompt,
            user_query=request.message
        )
        answer = _validate_and_clean_response(_strip_preamble(answer), ctx.fallback)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")
    metrics.record("llm_generation", t0)

    duration = time.time() - start_time

    if not answer.strip():
        path = "empty generation"
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, answer, path)
        answer = ctx.fallback
    elif any(refusal in answer.lower() for refusal in ["as an ai", "i cannot", "i am unable", "i apologize, but"]):
        path = "model refusal"
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, answer, path)
        answer = ctx.fallback
    elif ctx.fallback.lower() in answer.lower() or "i don't have enough information" in answer.lower():
        path = "hallucination prevented"
        background_tasks.add_task(log_failed_question, request.domain_id, request.message, answer, path)
        answer = ctx.fallback
    else:
        background_tasks.add_task(redis_service.set_cached_response, cache_key, {"answer": answer}, 3600)
        if request.session_id:
            background_tasks.add_task(redis_service.add_to_chat_history, request.session_id, request.message, answer, current_topic)
        path = "LLM_PATH"

    metrics.analytics["prompt_size"] = _estimate_tokens(system_prompt) + _estimate_tokens(request.message)
    metrics.analytics["completion_length"] = _estimate_tokens(answer)

    base_log = {
        "event": "RETRIEVAL_SUMMARY",
        "question": request.message,
        "faq_results": result.faq_count,
        "document_results": result.doc_count,
        "merged": len(result.sources),
        "prompt_tokens": metrics.analytics["prompt_size"],
        "llm_response_time": f"{duration:.1f}s",
        "reason": path,
        "score": result.max_score
    }
    logger.info(base_log)

    return ChatResponse(answer=answer, cached=False, sources=len(result.sources))

# --- Orchestrator ---

@router.post("/ask")
async def ask_chatbot(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    metrics = PerformanceMetrics()
    
    t0 = time.perf_counter()
    normalized_q = normalize_query(request.message)
    metrics.record("normalization", t0)

    ctx = await _load_domain_and_caps(request.domain_id, db, background_tasks)
    history = await _load_chat_history(request.session_id, ctx.fallback)

    q_hash = hashlib.md5(normalized_q.lower().encode()).hexdigest()
    cache_key = f"chat:{request.domain_id}:{q_hash}"
    
    cached_resp = await _try_cache(cache_key, metrics)
    if cached_resp:
        logger.info({"event": "PERFORMANCE_PROFILE", "domain_id": request.domain_id, "metrics": metrics.to_dict()})
        return cached_resp.__dict__

    intent_resp = await _handle_intent(request, normalized_q, ctx, cache_key, background_tasks, metrics)
    if intent_resp:
        logger.info({"event": "PERFORMANCE_PROFILE", "domain_id": request.domain_id, "metrics": metrics.to_dict()})
        return intent_resp.__dict__

    resolved_query = await _maybe_rewrite_query(normalized_q, history, metrics)
    
    if resolved_query != normalized_q:
        current_topic = history[-1].get("topic", history[-1].get("user", "")) if history else normalized_q
    else:
        current_topic = normalized_q
    
    if resolved_query != normalized_q:
        q_hash = hashlib.md5(resolved_query.lower().encode()).hexdigest()
        cache_key = f"chat:{request.domain_id}:{q_hash}"
        cached_resp = await _try_cache(cache_key, metrics, metric_key="cache_lookup_after_rewrite")
        if cached_resp:
            logger.info({"event": "PERFORMANCE_PROFILE", "domain_id": request.domain_id, "metrics": metrics.to_dict()})
            return cached_resp.__dict__

    fts_resp = await _try_fts_fast_path(request, resolved_query, current_topic, ctx, cache_key, db, background_tasks, metrics)
    if fts_resp:
        logger.info({"event": "PERFORMANCE_PROFILE", "domain_id": request.domain_id, "metrics": metrics.to_dict()})
        return fts_resp.__dict__

    retrieval_res, semantic_resp = await _semantic_retrieval(request, resolved_query, q_hash, ctx, cache_key, background_tasks, metrics)
    if semantic_resp:
        logger.info({"event": "PERFORMANCE_PROFILE", "domain_id": request.domain_id, "metrics": metrics.to_dict()})
        return semantic_resp.__dict__

    final_resp = await _build_context_and_call_llm(request, current_topic, ctx, history, retrieval_res, cache_key, background_tasks, metrics)
    
    logger.info({"event": "PERFORMANCE_PROFILE", "domain_id": request.domain_id, "metrics": metrics.to_dict()})
    return final_resp.__dict__