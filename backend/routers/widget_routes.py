from fastapi import APIRouter, Depends, HTTPException, Header, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import text as sql_text
from typing import Optional
from pydantic import BaseModel
import datetime
import json
import logging
import asyncio
import hashlib
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

MAX_CONTEXT_TOKENS = 3000

def _estimate_tokens(text: str) -> int:
    return len(text) // 4

import time
from database.database import get_db, AsyncSessionLocal
from database.models import Domain, ChatSession, ChatMessage, Lead, FailedQuestion, DomainCategory
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service
from utils.llm_logger import log_failed_question
from schemas.retrieval import KnowledgeSource
from utils.nlp_utils import normalize_query
from utils.intent_utils import detect_intent
from utils.ws_manager import manager

logger = logging.getLogger("chatbot.routers.widget_routes")
router = APIRouter(prefix="/api/widget", tags=["Widget API"])


class LeadCapture(BaseModel):
    session_id: str
    name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    message: Optional[str] = ""


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@router.get("/config")
async def widget_config(
    request: Request,
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: AsyncSession = Depends(get_db)
):
    """Returns config JSON for the embeddable chat widget."""
    stmt = select(Domain).where(
        (Domain.widget_key == x_api_key) | (Domain.id == x_api_key)
    )
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()

    if not domain:
        host_header = request.headers.get("host", "")
        # Only fallback if the API key is explicitly missing or meant for local dev
        if (x_api_key in ["local-dev", "test", ""]) and (host_header.startswith("127.0.0.1") or host_header.startswith("localhost")):
            scheme = "wss" if request.url.scheme == "https" else "ws"
            return {
                "domain_id": "local-dev",
                "ws_url": f"{scheme}://{host_header}/api/widget/ws/chat",
                "widget_config": {
                    "title": "Local Dev Chat",
                    "placeholder": "Type your question...",
                    "theme_color": "#7C3AED",
                    "domain_name": "Localhost",
                    "welcome_message": "Welcome to the local development chat!",
                    "fallback_message": "Sorry, I couldn't find an answer.",
                    "helpline_number": "",
                    "logo_url": "/static/chatbot-logo.png",
                    "quick_replies": []
                }
            }
        raise HTTPException(status_code=404, detail="Widget domain not found.")

    settings_data = domain.settings or {}
    forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    scheme = "wss" if forwarded_proto == "https" else "ws"
    host = request.headers.get("host", request.url.netloc)
    ws_url = f"{scheme}://{host}/api/widget/ws/chat"

    http_scheme = "https" if forwarded_proto == "https" else "http"
    base_url = f"{http_scheme}://{host}"
    logo_url = settings_data.get("widget_logo_url") or "/static/chatbot-logo.png"
    if logo_url.startswith("/static/") or logo_url.startswith("/public/"):
        logo_url = f"{base_url}{logo_url}"

    lead_config = settings_data.get("leadConfig") or {}
    lead_status = lead_config.get("status")
    if lead_status is None:
        lead_status = settings_data.get("lead_collection_status", False)
        
    lead_limit = lead_config.get("limit")
    if lead_limit is None:
        lead_limit = settings_data.get("lead_collection_limit", 2)
        
    lead_fields = lead_config.get("fields")
    if lead_fields is None:
        lead_fields = settings_data.get("lead_collection_fields", ["name", "email", "phone"])

    return {
        "domain_id": domain.id,
        "ws_url": ws_url,
        "widget_config": {
            "title": settings_data.get("widget_title", "Support Chat"),
            "placeholder": settings_data.get("widget_placeholder", "Type your question..."),
            "theme_color": settings_data.get("widget_theme_color", "#7C3AED"),
            "domain_name": domain.domain_name,
            "welcome_message": settings_data.get("widget_welcome_message", "Welcome to Support."),
            "fallback_message": settings_data.get("fallback_message", "I don't have enough information to answer that based on the current knowledge base."),
            "logo_url": logo_url,
            "session_persistence": True,
            "lead_collection": {
                "status": lead_status,
                "limit": lead_limit,
                "fields": lead_fields
            },
            "quick_replies": []
        }
    }


@router.post("/lead")
async def capture_lead(
    lead: LeadCapture,
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(
        (Domain.widget_key == x_api_key) | (Domain.id == x_api_key)
    )
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=404, detail="Widget domain not found.")

    new_lead = Lead(
        domain_id=domain.id,
        session_id=lead.session_id,
        name=lead.name,
        email=lead.email,
        phone=lead.phone,
        message=lead.message
    )
    db.add(new_lead)

    if lead.session_id:
        stmt_s = select(ChatSession).where(ChatSession.id == lead.session_id)
        res = await db.execute(stmt_s)
        chat_session = res.scalar_one_or_none()
        if chat_session:
            chat_session.customer_name = lead.name
            chat_session.customer_email = lead.email

    await db.commit()
    return {"status": "success", "lead_id": new_lead.id, "history_token": lead.session_id}


@router.get("/history")
async def get_history(
    history_token: str,
    last_created_at: Optional[str] = None,
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == history_token).options(selectinload(ChatSession.messages))
    result = await db.execute(stmt)
    chat_session = result.scalar_one_or_none()
    if not chat_session:
        return {"messages": [], "has_more": False}

    messages = sorted(chat_session.messages, key=lambda m: m.sequence, reverse=True)

    # FIX #4: correct message pairing logic (was using reversed list indexing wrongly)
    formatted = []
    i = 0
    while i < len(messages):
        msg = messages[i]
        if msg.sender == "bot":
            # Look for the preceding user message (next in reversed list)
            user_q = messages[i + 1].message if (i + 1 < len(messages) and messages[i + 1].sender == "user") else ""
            formatted.append({
                "id": msg.id,
                "session_id": history_token,
                "query": user_q,
                "response": msg.message,
                "created_at": msg.created_at.isoformat() if msg.created_at else ""
            })
            if user_q:
                i += 1  # skip the consumed user message
        i += 1

    has_more = len(formatted) > limit
    return {"messages": formatted[:limit], "has_more": has_more}


@router.get("/session/{session_id}")
async def get_widget_session(
    session_id: str,
    history_token: str,
    limit: int = 50,
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(
        (Domain.widget_key == x_api_key) | (Domain.id == x_api_key)
    )
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=404, detail="Widget domain not found.")

    stmt_s = select(ChatSession).where(ChatSession.id == session_id).options(selectinload(ChatSession.messages))
    res = await db.execute(stmt_s)
    chat_session = res.scalar_one_or_none()

    if not chat_session or chat_session.domain_id != domain.id:
        return {"messages": [], "session_exists": False}

    chat_session.unread_customer = 0
    await db.commit()

    messages = sorted(chat_session.messages, key=lambda m: m.sequence)
    messages_json = [
        {
            "sender": "customer" if m.sender == "user" else m.sender,
            "text": m.message,
            "timestamp": m.created_at.isoformat() if m.created_at else ""
        }
        for m in messages
    ]

    return {
        "messages": messages_json,
        "session_exists": True,
        "status": chat_session.status,
        "ai_enabled": chat_session.ai_enabled,
        "admin_joined": chat_session.admin_joined,
        "unread_customer_count": chat_session.unread_customer
    }


# ---------------------------------------------------------------------------
# Background task
# ---------------------------------------------------------------------------

async def run_background_chat_updates(
    domain_id: str,
    session_id: str,
    user_msg: str,
    ai_msg: str = None,
    failure_reason: str = None,
    cache_key: str = None,
    q_hash: str = None,
    query_vector: list = None,
    do_summarize: bool = False
):
    """Save AI message, update session, log failures, write caches, summarize."""
    try:
        async with AsyncSessionLocal() as db:
            ai_cm = None
            if ai_msg:
                seq_res = await db.execute(sql_text("UPDATE chat_sessions SET next_sequence = next_sequence + 1 WHERE id = :id RETURNING next_sequence"), {"id": session_id})
                seq_val = seq_res.scalar()
                ai_cm = ChatMessage(session_id=session_id, sender="bot", message=ai_msg, sequence=seq_val, status="completed")
                db.add(ai_cm)

                stmt = select(ChatSession).where(ChatSession.id == session_id)
                res = await db.execute(stmt)
                chat_session = res.scalar_one_or_none()
                if chat_session:
                    chat_session.message_count = (chat_session.message_count or 0) + 1
                    chat_session.last_message_at = datetime.datetime.utcnow()
                    if failure_reason in ("NO_MATCH", "LOW_CONFIDENCE", "LLM_FAILURE"):
                        chat_session.resolution_type = "UNRESOLVED"
                    elif not failure_reason:
                        chat_session.resolution_type = "AI"

                    should_summarize = do_summarize or (
                        chat_session.message_count >= 20
                        and chat_session.message_count % 20 == 0
                    )
                    if should_summarize:
                        msg_res = await db.execute(
                            select(ChatMessage)
                            .where(ChatMessage.session_id == session_id)
                            .order_by(ChatMessage.sequence.asc())
                        )
                        all_msgs = msg_res.scalars().all()
                        convo = "\n".join([
                            f"{'User' if m.sender == 'user' else 'Assistant'}: {m.message}"
                            for m in all_msgs
                        ])
                        try:
                            summary = await ollama_service.generate_response(
                                "Summarize the following conversation in one concise paragraph under 100 words. Focus on key facts.",
                                convo
                            )
                            if summary:
                                chat_session.summary = summary.strip()
                        except Exception as sum_err:
                            logger.error(f"Summarization failed: {sum_err}")

                    db.add(chat_session)

            if failure_reason:
                db.add(FailedQuestion(
                    domain_id=domain_id,
                    question=user_msg,
                    ai_response=ai_msg,
                    failure_reason=failure_reason
                ))

            await db.commit()
            
            if ai_cm:
                await db.refresh(ai_cm)
                payload = {
                    "type": "message",
                    "message": {
                        "id": ai_cm.id,
                        "session_id": session_id,
                        "sender": "bot",
                        "message": ai_cm.message,
                        "type": "text",
                        "sequence": ai_cm.sequence,
                        "status": ai_cm.status,
                        "created_at": ai_cm.created_at.isoformat() if ai_cm.created_at else datetime.datetime.utcnow().isoformat()
                    }
                }
                await redis_service.publish_message(f"chat:{session_id}", payload)

    except Exception as db_err:
        logger.error(f"Background DB update error: {db_err}")

    # Cache writes happen outside the DB session
    try:
        if cache_key and ai_msg and not failure_reason:
            await redis_service.set_cached_response(cache_key, {"answer": ai_msg}, 3600)
        if q_hash and query_vector:
            await redis_service.set_cached_embedding(q_hash, query_vector)
    except Exception as cache_err:
        logger.error(f"Background cache write error: {cache_err}")


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

# Pronoun / follow-up words that signal a query needs context rewriting
_FOLLOWUP_WORDS = {
    "it", "that", "this", "they", "those", "he", "she", "we",
    "more", "else", "other", "another"
}


@router.websocket("/ws/chat")
async def widget_chat_websocket(
    websocket: WebSocket,
    domain_id: str,
    session_id: str
):
    await manager.connect(websocket, session_id, role="widget")

    async with AsyncSessionLocal() as db:
        # FIX #6: accept both widget_key and domain UUID so the JS client works
        # regardless of which value it sends as domain_id query param
        stmt = select(Domain).where(
            (Domain.widget_key == domain_id) | (Domain.id == domain_id)
        )
        result = await db.execute(stmt)
        domain = result.scalar_one_or_none()

        if not domain:
            await websocket.send_json({"type": "error", "text": "Invalid domain"})
            await websocket.close()
            return

        # Resolve fallback once per connection
        fallback = (domain.settings or {}).get(
            "fallback_message",
            "Sorry, we could not find an answer. Please contact support."
        )

        # Load or create session
        stmt_s = select(ChatSession).where(ChatSession.id == session_id)
        res_s = await db.execute(stmt_s)
        chat_session = res_s.scalar_one_or_none()
        if not chat_session:
            chat_session = ChatSession(id=session_id, domain_id=domain.id)
            db.add(chat_session)
            await db.commit()
            await db.refresh(chat_session)

        # Fetch and cache category_ids once per connection
        category_ids = await redis_service.get_domain_categories(domain.id)
        if category_ids is None:
            cat_res = await db.execute(
                select(DomainCategory.category_id).where(DomainCategory.domain_id == domain.id)
            )
            category_ids = list(cat_res.scalars().all())
            asyncio.create_task(redis_service.set_domain_categories(domain.id, category_ids))

    client_ip = websocket.client.host if websocket.client else "unknown"

    # Import once
    from routers.chatbot_routes import search_faqs_fts

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg_payload = json.loads(data)
            except Exception:
                continue

            if msg_payload.get("type") != "message":
                continue

            user_msg = msg_payload.get("text", "").strip()
            if not user_msg:
                continue

            # ── Rate limiting ──────────────────────────────────────────────
            if await redis_service.is_rate_limited(
                widget_key=domain.widget_key or domain.id,
                session_id=session_id,
                ip=client_ip,
                limit=100,
                window=60
            ):
                await websocket.send_json({"type": "error", "text": "Too many requests. Please wait a moment."})
                continue

            # ── Re-fetch session state and update DB ───────────────────────
            async with AsyncSessionLocal() as db:
                res_s2 = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
                chat_session = res_s2.scalar_one_or_none()
                if not chat_session:
                    chat_session = ChatSession(id=session_id, domain_id=domain.id)
                    db.add(chat_session)

                seq_res = await db.execute(sql_text("UPDATE chat_sessions SET next_sequence = next_sequence + 1 WHERE id = :id RETURNING next_sequence"), {"id": session_id})
                seq_val = seq_res.scalar()
                user_cm = ChatMessage(session_id=session_id, sender="user", message=user_msg, sequence=seq_val, status="completed")
                db.add(user_cm)
                chat_session.message_count = (chat_session.message_count or 0) + 1
                chat_session.unread_admin = (chat_session.unread_admin or 0) + 1
                chat_session.last_message_at = datetime.datetime.utcnow()
                if chat_session.status == "closed":
                    chat_session.status = "open"
                    chat_session.ai_enabled = True
                    chat_session.admin_joined = False
                await db.commit()
                await db.refresh(user_cm)
                
                ai_active = (
                    chat_session.status == "open"
                    and chat_session.ai_enabled
                    and not chat_session.admin_joined
                )
                chat_summary = chat_session.summary
                
                mem_res = await db.execute(
                    select(ChatMessage)
                    .where(ChatMessage.session_id == session_id)
                    .order_by(ChatMessage.sequence.desc())
                    .limit(8)
                )
                recent_messages = list(reversed(mem_res.scalars().all()))
            
            user_payload = {
                "type": "message",
                "message": {
                    "id": user_cm.id,
                    "session_id": session_id,
                    "sender": "user",
                    "message": user_cm.message,
                    "type": "text",
                    "sequence": user_cm.sequence,
                    "status": user_cm.status,
                    "created_at": user_cm.created_at.isoformat() if user_cm.created_at else datetime.datetime.utcnow().isoformat()
                }
            }
            await redis_service.publish_message(f"chat:{session_id}", user_payload)

            if not ai_active:
                continue

            # ── Typing indicator ───────────────────────────────────────────
            await websocket.send_json({"type": "typing"})
            try:

                # ── Normalize query ────────────────────────────────────────────
                normalized_q = normalize_query(user_msg)
                resolved_query = normalized_q

                # ── Generic Intent Detection (Fast-Path) ───────────────────────
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
                    
                        await websocket.send_json({
                            "type": "message",
                            "text": ans,
                            "sender": "ai",
                            "source": "intent",
                            "confidence": 1.0
                        })
                        asyncio.create_task(run_background_chat_updates(
                            domain_id=domain.id,
                            session_id=session_id,
                            user_msg=user_msg,
                            ai_msg=ans,
                            failure_reason=None,
                            q_hash=None,
                            query_vector=None
                        ))
                        continue
                    
                    elif intent in ["bot_identity", "capabilities"]:
                        bot_name = domain_settings.get("bot_name", "SHI Chatbot")
                        bot_desc = domain_settings.get("bot_description", "An AI assistant that helps visitors using the knowledge base.")
                        sys_prompt = f"Bot Name: {bot_name}\nBot Description: {bot_desc}\nRespond naturally in 1-2 sentences using the above details."
                    
                        full_answer = ""
                        try:
                            async for token in ollama_service.generate_response_stream(system_prompt=sys_prompt, user_query=user_msg):
                                if token:
                                    full_answer += token
                                    await websocket.send_json({"type": "stream_delta", "text": token})
                            await websocket.send_json({"type": "stream_done"})
                            full_answer = _strip_preamble(full_answer)
                        except Exception as e:
                            logger.error(f"Intent LLM error: {e}")
                            full_answer = "I am an AI assistant. How can I help you?"
                            await websocket.send_json({
                                "type": "message",
                                "text": full_answer,
                                "sender": "ai",
                                "source": "intent",
                                "confidence": 1.0
                            })
                        
                        asyncio.create_task(run_background_chat_updates(
                            domain_id=domain.id,
                            session_id=session_id,
                            user_msg=user_msg,
                            ai_msg=full_answer,
                            failure_reason=None,
                            q_hash=None,
                            query_vector=None
                        ))
                        continue

                # Exclude the message we just saved
                history_msgs = [m for m in recent_messages if m.id != user_cm.id]

                # ── FIX #7: context-aware query rewriting ──────────────────────
                # Only rewrite when query is short or contains pronouns/follow-ups.
                # Only use successful prior exchanges (skip fallback responses).
                if history_msgs:
                    words = set(normalized_q.lower().split())
                    is_short = len(words) < 4
                    has_followup = bool(words & _FOLLOWUP_WORDS)

                    if is_short or has_followup:
                        good_pairs = []
                        current_pair: dict = {}
                        for m in history_msgs:
                            if m.sender == "user":
                                current_pair = {"user": m.message}
                            elif m.sender == "bot" and "user" in current_pair:
                                ai_text = m.message
                                # Skip fallback turns — they add noise not signal
                                if (
                                    "don't have enough information" not in ai_text.lower()
                                    and fallback.lower() not in ai_text.lower()
                                ):
                                    current_pair["ai"] = ai_text
                                    good_pairs.append(current_pair)
                                current_pair = {}

                        if good_pairs:
                            try:
                                resolved_query = await ollama_service.rewrite_query(good_pairs, normalized_q)
                                logger.info(f"Query rewrite: '{normalized_q}' → '{resolved_query}'")
                            except Exception as rw_err:
                                logger.error(f"Query rewrite failed: {rw_err}")
                                resolved_query = normalized_q

                # ── Cache key uses resolved query ──────────────────────────────
                q_hash = hashlib.md5(resolved_query.encode()).hexdigest()
                cache_key = f"chat:{domain.id}:{q_hash}"

                # ── Answer cache (exact match) ──────────────────────────────────
                cached_response = await redis_service.get_cached_response(cache_key)
                if cached_response:
                    cached_answer = cached_response.get("answer", "")
                    await websocket.send_json({
                        "type": "message",
                        "text": cached_answer,
                        "sender": "ai",
                        "source": "cache",
                        "confidence": 1.0
                    })
                    asyncio.create_task(run_background_chat_updates(
                        domain_id=domain.id,
                        session_id=session_id,
                        user_msg=user_msg,
                        ai_msg=cached_answer
                    ))
                    continue

                # ── Embedding cache ────────────────────────────────────────────
                query_vector = await redis_service.get_cached_embedding(q_hash)
                need_cache_embedding = False
                if not query_vector:
                    try:
                        query_vector = await ollama_service.generate_embedding(resolved_query)
                        need_cache_embedding = True
                    except Exception as embed_err:
                        logger.error(f"Embedding error: {embed_err}")
                        await websocket.send_json({"type": "error", "text": "Failed to process query."})
                        continue

                # ── FIX #8: parallel Qdrant + FTS search ───────────────────────
                async def _qdrant():
                    try:
                        return await qdrant_service.search_chunks(
                            tenant_id=domain.organization_id,
                            query_vector=query_vector,
                            category_ids=category_ids,
                            domain_id=domain.id,
                            limit=15
                        )
                    except Exception as e:
                        logger.error(f"Qdrant search error: {e}")
                        return []

                async def _fts():
                    try:
                        return await search_faqs_fts(search_db, domain.id, resolved_query, limit=5)
                    except Exception as e:
                        logger.error(f"FTS search error: {e}")
                        return []

                async with AsyncSessionLocal() as search_db:
                    qdrant_chunks, fts_chunks = await asyncio.gather(
                        _qdrant(),
                        _fts()
                    )

                # Merge candidates and remove duplicates
                seen = set()
                candidates = []
                for source in fts_chunks + qdrant_chunks:
                    if source.id not in seen:
                        seen.add(source.id)
                        candidates.append(source)

                # Diversity Ranking (MMR-style penalty for chunks from the same document)
                top_sources = []
                selected_docs = {}
                
                while candidates and len(top_sources) < 5:
                    best_idx = 0
                    best_score = float('-inf')
                    
                    for i, src in enumerate(candidates):
                        current_score = src.score
                        
                        if src.source_type == "Document":
                            doc_id = src.metadata.get("document_source_id")
                            chunk_idx = src.metadata.get("chunk_index")
                            
                            if doc_id and doc_id in selected_docs:
                                current_score -= 0.05  # Base penalty for same document
                                
                                if chunk_idx is not None:
                                    for picked_idx in selected_docs[doc_id]:
                                        if abs(picked_idx - chunk_idx) <= 2:
                                            current_score -= 0.10  # Additional penalty for adjacent chunks
                                            break
                        
                        if current_score > best_score:
                            best_score = current_score
                            best_idx = i
                            
                    winner = candidates.pop(best_idx)
                    top_sources.append(winner)
                    
                    if winner.source_type == "Document":
                        doc_id = winner.metadata.get("document_source_id")
                        chunk_idx = winner.metadata.get("chunk_index")
                        if doc_id:
                            selected_docs.setdefault(doc_id, []).append(chunk_idx if chunk_idx is not None else -999)

                faq_count = sum(1 for src in top_sources if src.source_type == "FAQ")
                doc_count = sum(1 for src in top_sources if src.source_type == "Document")
                
                base_log = {
                    "event": "RETRIEVAL_SUMMARY",
                    "question": user_msg,
                    "embedding_generated": need_cache_embedding,
                    "faq_results": faq_count,
                    "document_results": doc_count,
                    "merged": len(top_sources)
                }

                # ── No match ───────────────────────────────────────────────────
                if not top_sources:
                    base_log["reason"] = "NO_MATCH"
                    logger.info(base_log)
                    await websocket.send_json({"type": "stream_delta", "text": fallback})
                    await websocket.send_json({"type": "stream_done"})
                    asyncio.create_task(run_background_chat_updates(
                        domain_id=domain.id,
                        session_id=session_id,
                        user_msg=user_msg,
                        ai_msg=fallback,
                        failure_reason="NO_MATCH",
                        q_hash=q_hash if need_cache_embedding else None,
                        query_vector=query_vector if need_cache_embedding else None
                    ))
                    continue

                max_score = top_sources[0].score

                # ── Fast path ≥ 0.95 ───────────────────────────────────────────
                if max_score >= 0.95:
                    fast_answer = top_sources[0].metadata.get("answer")
                    if fast_answer:
                        base_log["reason"] = "FAST_PATH"
                        base_log["score"] = max_score
                        logger.info(base_log)
                        await websocket.send_json({"type": "stream_delta", "text": fast_answer})
                        await websocket.send_json({"type": "stream_done"})
                        asyncio.create_task(run_background_chat_updates(
                            domain_id=domain.id,
                            session_id=session_id,
                            user_msg=user_msg,
                            ai_msg=fast_answer,
                            cache_key=cache_key,
                            q_hash=q_hash if need_cache_embedding else None,
                            query_vector=query_vector if need_cache_embedding else None
                        ))
                        continue

                # ── Early exit < 0.60 ──────────────────────────────────────────
                if max_score < 0.60:
                    base_log["reason"] = "LOW_CONFIDENCE"
                    base_log["score"] = max_score
                    logger.info(base_log)
                    await websocket.send_json({"type": "stream_delta", "text": fallback})
                    await websocket.send_json({"type": "stream_done"})
                    asyncio.create_task(run_background_chat_updates(
                        domain_id=domain.id,
                        session_id=session_id,
                        user_msg=user_msg,
                        ai_msg=fallback,
                        failure_reason="LOW_CONFIDENCE",
                        q_hash=q_hash if need_cache_embedding else None,
                        query_vector=query_vector if need_cache_embedding else None
                    ))
                    continue

                # ── LLM RAG path (0.60 – 0.95) ────────────────────────────────
                
                # Context Expansion
                try:
                    expansions = await qdrant_service.expand_document_chunks(domain.organization_id, top_sources)
                except Exception as e:
                    logger.error(f"Context expansion error: {e}")
                    expansions = {}

                context_parts = []
                current_tokens = 0
                
                for i, item in enumerate(top_sources, 1):
                    item_text = item.content
                    
                    if item.source_type == "Document":
                        doc_id = item.metadata.get("document_source_id")
                        chunk_idx = item.metadata.get("chunk_index")
                        
                        if doc_id and chunk_idx is not None:
                            prev_text = expansions.get((doc_id, chunk_idx - 1))
                            next_text = expansions.get((doc_id, chunk_idx + 1))
                            
                            if prev_text:
                                prev_tokens = _estimate_tokens(prev_text)
                                if current_tokens + _estimate_tokens(item_text) + prev_tokens <= MAX_CONTEXT_TOKENS:
                                    item_text = prev_text + "\n\n" + item_text
                                    
                            if next_text:
                                next_tokens = _estimate_tokens(next_text)
                                if current_tokens + _estimate_tokens(item_text) + next_tokens <= MAX_CONTEXT_TOKENS:
                                    item_text = item_text + "\n\n" + next_text
                                    
                    item_tokens = _estimate_tokens(item_text)
                    if current_tokens + item_tokens > MAX_CONTEXT_TOKENS and current_tokens > 0:
                        break
                        
                    current_tokens += item_tokens
                    context_parts.append(
                        f"--------------------------------\n"
                        f"Source {i}\n"
                        f"Type\n"
                        f"{item.source_type}\n"
                        f"Content\n"
                        f"{item_text}\n"
                        f"--------------------------------"
                    )
                    
                context_text = "\n".join(context_parts)

                # Build prompt with summary + recent history
                prompt_parts = []
                if chat_summary:
                    prompt_parts.append(f"Conversation summary so far:\n{chat_summary}")

                if history_msgs:
                    hist_lines = []
                    for m in history_msgs[-6:]:  # last 3 turns = 6 messages
                        role = "User" if m.sender == "user" else "Assistant"
                        hist_lines.append(f"{role}: {m.message}")
                    prompt_parts.append("Recent conversation:\n" + "\n".join(hist_lines))

                prompt_parts.append(f"Knowledge Base\n\n{context_text}")
                prompt_context = "\n\n".join(prompt_parts)

                system_prompt = (
                    f"You are a helpful AI assistant for {domain.domain_name}.\n"
                    f"Use ONLY the supplied Knowledge Base.\n"
                    f"The Knowledge Base is reference material.\n"
                    f"Extract only the information required to answer the user's question.\n"
                    f"Do NOT repeat entire FAQ answers or document chunks unless absolutely necessary.\n"
                    f"Do NOT mention where the information came from.\n"
                    f"If only part of the retrieved content answers the question, return only that part.\n"
                    f"Keep responses concise.\n"
                    f"Correct obvious spelling mistakes.\n"
                    f"If the Knowledge Base does not contain the answer, return EXACTLY:\n"
                    f"\"{fallback}\"\n"
                    f"Never guess.\n"
                    f"Never use outside knowledge.\n\n"
                    f"Example\n\n"
                    f"Knowledge Base\n\n"
                    f"--------------------------------\n"
                    f"Source 1\n"
                    f"Type\n"
                    f"FAQ\n"
                    f"Content\n"
                    f"What is your name and age?\n\n"
                    f"I'm Raveen and I'm 20 years old.\n"
                    f"--------------------------------\n\n"
                    f"User:\n"
                    f"How old are you?\n\n"
                    f"Assistant:\n"
                    f"20 years old.\n\n"
                    f"Second example\n\n"
                    f"Knowledge Base\n\n"
                    f"--------------------------------\n"
                    f"Source 1\n"
                    f"Type\n"
                    f"FAQ\n"
                    f"Content\n"
                    f"Where is your office?\n\n"
                    f"We are located in Chennai.\n"
                    f"--------------------------------\n\n"
                    f"User:\n"
                    f"Where are you located?\n\n"
                    f"Assistant:\n"
                    f"Chennai.\n\n"
                    f"{prompt_context}"
                )

                # ── Stream tokens ──────────────────────────────────────────────
                start_time = time.time()
                full_answer = ""
                try:
                    async for token in ollama_service.generate_response_stream(
                        system_prompt=system_prompt,
                        user_query=user_msg
                    ):
                        if token:
                            full_answer += token
                            await websocket.send_json({"type": "stream_delta", "text": token})

                    await websocket.send_json({"type": "stream_done"})
                    full_answer = _strip_preamble(full_answer)
                    duration = time.time() - start_time

                    failure_reason = None
                    if (
                        fallback.lower() in full_answer.lower()
                        or "i don't have enough information" in full_answer.lower()
                    ):
                        failure_reason = "LLM_FAILURE"
                        display_answer = fallback
                    else:
                        display_answer = full_answer

                    base_log["prompt_tokens"] = _estimate_tokens(system_prompt) + _estimate_tokens(user_msg)
                    base_log["llm_response_time"] = f"{duration:.1f}s"
                    base_log["reason"] = failure_reason or "LLM_PATH"
                    base_log["score"] = max_score
                    logger.info(base_log)

                    asyncio.create_task(run_background_chat_updates(
                        domain_id=domain.id,
                        session_id=session_id,
                        user_msg=user_msg,
                        ai_msg=display_answer,
                        failure_reason=failure_reason,
                        cache_key=cache_key if not failure_reason else None,
                        q_hash=q_hash if need_cache_embedding else None,
                        query_vector=query_vector if need_cache_embedding else None
                    ))

                except Exception as stream_err:
                    logger.error(f"Ollama streaming error: {stream_err}")
                    await websocket.send_json({"type": "error", "text": "AI response error. Please try again."})

            except Exception as loop_err:
                logger.error(f"Unexpected error processing message: {loop_err}")
                await websocket.send_json({"type": "error", "text": "An unexpected error occurred. Please try again."})

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: session={session_id}")
        manager.disconnect(websocket, session_id)
