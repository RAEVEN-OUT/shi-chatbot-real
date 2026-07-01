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
from database.models import Domain, ChatSession, ChatMessage, Lead, FailedQuestion, DomainCategory, DocumentSource
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

class FeedbackRequest(BaseModel):
    session_id: str
    message_id: str
    is_helpful: bool
    question: Optional[str] = ""
    answer: Optional[str] = ""
    retrieval_metadata: Optional[dict] = {}


# ---------------------------------------------------------------------------
# Validation Helper
# ---------------------------------------------------------------------------
import os
from urllib.parse import urlparse

def verify_domain_origin(headers, expected_domain_url: str, widget_key: str, client_ip: str) -> bool:
    origin = headers.get("origin")
    
    if not origin:
        logger.warning(f"Widget Validation Failed: Missing Origin header. Key: {widget_key}, IP: {client_ip}")
        return False
        
    try:
        parsed_origin = urlparse(origin)
        origin_host = parsed_origin.netloc.split(":")[0].lower() if parsed_origin.netloc else parsed_origin.path.split("/")[0].split(":")[0].lower()
        
        allow_localhost = os.getenv("ALLOW_LOCALHOST_WIDGETS", "true").lower() == "true"
        if allow_localhost and origin_host in ["localhost", "127.0.0.1"]:
            return True
            
        if not expected_domain_url:
            return False
            
        if not expected_domain_url.startswith("http://") and not expected_domain_url.startswith("https://"):
            expected_domain_url = "https://" + expected_domain_url
            
        parsed_expected = urlparse(expected_domain_url)
        expected_host = parsed_expected.netloc.split(":")[0].lower()
        
        if origin_host == expected_host:
            return True
            
        allow_subdomains = os.getenv("ALLOW_WIDGET_SUBDOMAINS", "true").lower() == "true"
        if allow_subdomains and origin_host.endswith("." + expected_host):
            return True
            
        logger.warning(f"Widget Validation Failed: Origin '{origin_host}' does not match '{expected_host}'. Key: {widget_key}, IP: {client_ip}")
        return False
        
    except Exception as e:
        logger.warning(f"Widget Validation Error: {e}. Key: {widget_key}, IP: {client_ip}")
        return False

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

    client_ip = request.client.host if request.client else "unknown"
    if not verify_domain_origin(request.headers, domain.domain_name, x_api_key, client_ip):
        raise HTTPException(status_code=403, detail="Origin not authorized for this widget key.")

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
    request: Request,
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

    client_ip = request.client.host if request.client else "unknown"
    if not verify_domain_origin(request.headers, domain.domain_name, x_api_key, client_ip):
        raise HTTPException(status_code=403, detail="Origin not authorized for this widget key.")

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


@router.post("/{domain_id}/feedback")
async def submit_feedback(
    domain_id: str,
    payload: FeedbackRequest,
    db: AsyncSession = Depends(get_db)
):
    """Store thumbs-up or thumbs-down feedback for a response."""
    from database.models import MessageFeedback
    
    # Verify domain exists
    domain = await db.scalar(select(Domain).where(Domain.id == domain_id))
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    feedback = MessageFeedback(
        session_id=payload.session_id,
        message_id=payload.message_id,
        is_helpful=payload.is_helpful,
        question=payload.question,
        answer=payload.answer,
        retrieval_metadata=payload.retrieval_metadata
    )
    db.add(feedback)
    await db.commit()
    
    return {"status": "success", "message": "Feedback stored"}


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

        client_ip = websocket.client.host if websocket.client else "unknown"
        if not verify_domain_origin(websocket.headers, domain.domain_name, domain_id, client_ip):
            await websocket.send_json({"type": "error", "text": "Origin not authorized"})
            await websocket.close(code=4003)
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
                from routers.chatbot_routes import ask_chatbot_stream, ChatRequest
                from fastapi import BackgroundTasks
                
                bg_tasks = BackgroundTasks()
                req = ChatRequest(
                    domain_id=domain.id,
                    session_id=session_id,
                    message=user_msg
                )
                
                resp_dict = None
                streamed = False
                
                # Fetch DB again to pass to ask_chatbot
                async with AsyncSessionLocal() as chat_db:
                    async for chunk in ask_chatbot_stream(req, bg_tasks, chat_db):
                        if chunk.get("type") == "token":
                            streamed = True
                            try:
                                await websocket.send_json({"type": "stream_delta", "text": chunk.get("content", "")})
                            except Exception:
                                pass
                        elif chunk.get("type") == "result":
                            resp_dict = chunk.get("content")
                
                final_answer = resp_dict.get("answer", "") if resp_dict else ""
                
                if streamed:
                    await websocket.send_json({"type": "stream_done"})
                else:
                    source = "cache" if resp_dict and resp_dict.get("cached") else "intent"
                    if resp_dict and resp_dict.get("fast_path"):
                        source = "fast_path"
                    
                    await websocket.send_json({
                        "type": "message",
                        "text": final_answer,
                        "sender": "ai",
                        "source": source,
                        "confidence": 1.0
                    })
                
                # Run the background tasks created by ask_chatbot
                for task in bg_tasks.tasks:
                    asyncio.create_task(task())
                
                # Run widget's background update to save DB
                asyncio.create_task(run_background_chat_updates(
                    domain_id=domain.id,
                    session_id=session_id,
                    user_msg=user_msg,
                    ai_msg=final_answer,
                    failure_reason=None,
                    cache_key=None,
                    q_hash=None,
                    query_vector=None
                ))
            except Exception as e:
                logger.error(f"Chatbot pipeline error: {e}")
                await websocket.send_json({"type": "error", "text": "AI response error. Please try again."})

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: session={session_id}")
        manager.disconnect(websocket, session_id)
