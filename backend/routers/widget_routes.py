from fastapi import APIRouter, Depends, HTTPException, Header, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import Optional, Dict
from pydantic import BaseModel
import datetime
import json
import logging
import uuid

from database.database import get_db, AsyncSessionLocal
from database.models import Domain, ChatSession, ChatMessage, Lead, FailedQuestion
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service
from utils.nlp_utils import normalize_query
import hashlib
import asyncio

logger = logging.getLogger("chatbot.routers.widget_routes")
router = APIRouter(prefix="/api/widget", tags=["Widget API"])

# Pydantic models for request bodies
class LeadCapture(BaseModel):
    session_id: str
    name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    message: Optional[str] = ""

@router.get("/config")
async def widget_config(request: Request, x_api_key: str = Header(..., alias="X-API-Key"), db: AsyncSession = Depends(get_db)):
    """Returns config JSON for the embeddable chat widget."""
    widget_key = x_api_key
    
    stmt = select(Domain).where(Domain.widget_key == widget_key)
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        # Check if local dev
        host_header = request.headers.get('host', '')
        if host_header.startswith('127.0.0.1') or host_header.startswith('localhost'):
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
    
    settings = domain.settings or {}
    
    forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    scheme = "wss" if forwarded_proto == "https" else "ws"
    host = request.headers.get("host", request.url.netloc)
    ws_url = f"{scheme}://{host}/api/widget/ws/chat"
    
    http_scheme = "https" if request.url.scheme == "https" else "http"
    base_url = f"{http_scheme}://{host}"
    
    logo_url = settings.get("widget_logo_url") or "/static/chatbot-logo.png"
    if logo_url.startswith("/static/"):
        logo_url = f"{base_url}{logo_url}"
        
    return {
        "domain_id": domain.id,
        "ws_url": ws_url,
        "widget_config": {
            "title": settings.get("widget_title", "Support Chat"),
            "placeholder": settings.get("widget_placeholder", "Type your question..."),
            "theme_color": settings.get("widget_theme_color", "#7C3AED"),
            "domain_name": domain.domain_name,
            "welcome_message": settings.get("widget_welcome_message", "Welcome to Support."),
            "fallback_message": settings.get("fallback_message", "Sorry, we could not find an answer. Please contact support."),
            "logo_url": logo_url,
            "session_persistence": True,
            "lead_collection": {
                "status": settings.get("lead_collection_status", True),
                "limit": settings.get("lead_collection_limit", 2),
                "fields": settings.get("lead_collection_fields", ["name", "email", "phone"])
            },
            "quick_replies": []
        }
    }

@router.post("/lead")
async def capture_lead(lead: LeadCapture, x_api_key: str = Header(..., alias="X-API-Key"), db: AsyncSession = Depends(get_db)):
    widget_key = x_api_key
    stmt = select(Domain).where(Domain.widget_key == widget_key)
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
        stmt_session = select(ChatSession).where(ChatSession.id == lead.session_id)
        res = await db.execute(stmt_session)
        chat_session = res.scalar_one_or_none()
        if chat_session:
            chat_session.customer_name = lead.name
            chat_session.customer_email = lead.email
    
    await db.commit()
    return {"status": "success", "lead_id": new_lead.id, "history_token": lead.session_id}

@router.get("/history")
async def get_history(history_token: str, last_created_at: Optional[str] = None, limit: int = 10, db: AsyncSession = Depends(get_db)):
    # history_token is just session_id in this flow
    session_id = history_token
    stmt = select(ChatSession).where(ChatSession.id == session_id).options(selectinload(ChatSession.messages))
    result = await db.execute(stmt)
    chat_session = result.scalar_one_or_none()
    
    if not chat_session:
        return {"messages": [], "has_more": False}
        
    messages = chat_session.messages
    messages.sort(key=lambda m: m.created_at, reverse=True)
    
    formatted_messages = []
    i = 0
    while i < len(messages):
        msg = messages[i]
        if msg.sender == "user":
            formatted_messages.append({
                "id": msg.id,
                "session_id": session_id,
                "query": msg.message,
                "response": "",
                "created_at": msg.created_at.isoformat() if msg.created_at else ""
            })
        elif msg.sender == "bot":
            if i + 1 < len(messages) and messages[i+1].sender == "user":
                formatted_messages.append({
                    "id": msg.id,
                    "session_id": session_id,
                    "query": messages[i+1].message,
                    "response": msg.message,
                    "created_at": msg.created_at.isoformat() if msg.created_at else ""
                })
                i += 1
            else:
                formatted_messages.append({
                    "id": msg.id,
                    "session_id": session_id,
                    "query": "",
                    "response": msg.message,
                    "created_at": msg.created_at.isoformat() if msg.created_at else ""
                })
        i += 1
        
    has_more = len(formatted_messages) > limit
    paginated = formatted_messages[:limit]
    
    return {
        "messages": paginated,
        "has_more": has_more
    }

@router.get("/session/{session_id}")
async def get_widget_session(session_id: str, history_token: str, limit: int = 50, x_api_key: str = Header(..., alias="X-API-Key"), db: AsyncSession = Depends(get_db)):
    widget_key = x_api_key
    stmt = select(Domain).where(Domain.widget_key == widget_key)
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Widget domain not found.")
        
    stmt_session = select(ChatSession).where(ChatSession.id == session_id).options(selectinload(ChatSession.messages))
    res = await db.execute(stmt_session)
    chat_session = res.scalar_one_or_none()
    
    if not chat_session or chat_session.domain_id != domain.id:
        return {"messages": [], "session_exists": False}
        
    chat_session.unread_customer = 0
    await db.commit()
    
    messages = chat_session.messages
    messages.sort(key=lambda m: m.created_at)
    
    # widget expects a certain json format
    messages_json = []
    for m in messages:
        sender_type = "customer" if m.sender == "user" else m.sender
        messages_json.append({
            "sender": sender_type,
            "text": m.message,
            "timestamp": m.created_at.isoformat() if m.created_at else ""
        })
        
    return {
        "messages": messages_json,
        "session_exists": True,
        "status": chat_session.status,
        "ai_enabled": chat_session.ai_enabled,
        "admin_joined": chat_session.admin_joined,
        "unread_customer_count": chat_session.unread_customer
    }

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
    """Handles saving AI message, updating session resolution, logging failures, caching, and summarization in background."""
    try:
        async with AsyncSessionLocal() as db:
            # 1. Save AI message if generated
            if ai_msg:
                ai_cm = ChatMessage(session_id=session_id, sender="bot", message=ai_msg)
                db.add(ai_cm)
                
                # Update session state: increment AI message count and last message time
                stmt = select(ChatSession).where(ChatSession.id == session_id)
                res = await db.execute(stmt)
                chat_session = res.scalar_one_or_none()
                if chat_session:
                    chat_session.message_count += 1
                    chat_session.last_message_at = datetime.datetime.utcnow()
                    
                    # Update resolution type based on outcome
                    if failure_reason in ("NO_MATCH", "LOW_CONFIDENCE", "LLM_FAILURE"):
                        chat_session.resolution_type = "UNRESOLVED"
                    elif not failure_reason and ai_msg:
                        chat_session.resolution_type = "AI"
                    
                    # 2. Trigger Summarization if message count reaches a multiple of 20
                    if do_summarize or (chat_session.message_count >= 20 and chat_session.message_count % 20 == 0):
                        # Fetch all messages in the session ordered by created_at asc
                        msg_stmt = select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc())
                        msg_res = await db.execute(msg_stmt)
                        all_msgs = msg_res.scalars().all()
                        
                        # Format messages
                        conversation_text = "\n".join([f"{'User' if m.sender == 'user' else 'Assistant'}: {m.message}" for m in all_msgs])
                        
                        try:
                            system_prompt = "You are an AI assistant. Summarize the following conversation history between the user and assistant in a single concise paragraph. Keep it to key facts and details, and keep it under 100 words."
                            summary = await ollama_service.generate_response(system_prompt, conversation_text)
                            if summary:
                                chat_session.summary = summary.strip()
                        except Exception as sum_err:
                            logger.error(f"Failed to generate session summary: {sum_err}")
                    
                    db.add(chat_session)

            # 3. Log Failed Question
            if failure_reason:
                fq = FailedQuestion(
                    domain_id=domain_id,
                    question=user_msg,
                    ai_response=ai_msg,
                    failure_reason=failure_reason
                )
                db.add(fq)
                
            await db.commit()
            
    except Exception as db_err:
        logger.error(f"Error in background DB chat updates: {db_err}")

    # 4. Cache Writes
    try:
        if cache_key and ai_msg and not failure_reason:
            await redis_service.set_cached_response(cache_key, {"answer": ai_msg}, 3600)
        if q_hash and query_vector:
            await redis_service.set_cached_embedding(q_hash, query_vector)
    except Exception as cache_err:
        logger.error(f"Error in background cache updates: {cache_err}")

@router.websocket("/ws/chat")
async def widget_chat_websocket(websocket: WebSocket, domain_id: str, session_id: str, db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    
    # We query domain by id or widget_key. The widget.min.js sends the X-API-Key as domain_id in WS query params
    # We allow both widget_key or domain_id just in case
    stmt = select(Domain).where((Domain.widget_key == domain_id) | (Domain.id == domain_id))
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        await websocket.send_json({"type": "error", "text": "Invalid domain"})
        await websocket.close()
        return

    # Check or create session
    stmt_session = select(ChatSession).where(ChatSession.id == session_id)
    res = await db.execute(stmt_session)
    chat_session = res.scalar_one_or_none()
    
    if not chat_session:
        chat_session = ChatSession(id=session_id, domain_id=domain.id)
        db.add(chat_session)
        await db.commit()
        await db.refresh(chat_session)

    client_ip = websocket.client.host if websocket.client else "unknown"

    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except:
                continue
                
            if payload.get("type") == "message":
                user_msg = payload.get("text", "").strip()
                if not user_msg:
                    continue
                    
                # 1. Rate Limiting Check
                is_limited = await redis_service.is_rate_limited(
                    widget_key=domain.widget_key or domain.id,
                    session_id=session_id,
                    ip=client_ip,
                    limit=100,
                    window=60
                )
                if is_limited:
                    await websocket.send_json({"type": "error", "text": "Too many requests. Please wait a moment."})
                    continue

                # Re-fetch session to get the latest DB state (for flags like status, ai_enabled, admin_joined)
                stmt_s = select(ChatSession).where(ChatSession.id == session_id)
                res_s = await db.execute(stmt_s)
                chat_session = res_s.scalar_one_or_none()
                if not chat_session:
                    chat_session = ChatSession(id=session_id, domain_id=domain.id)
                    db.add(chat_session)

                # 2. Save User Message Immediately
                user_cm = ChatMessage(session_id=session_id, sender="user", message=user_msg)
                db.add(user_cm)
                chat_session.message_count += 1
                chat_session.last_message_at = datetime.datetime.utcnow()
                await db.commit()

                # Check if AI should respond
                ai_active = chat_session.status == "open" and chat_session.ai_enabled and not chat_session.admin_joined
                if not ai_active:
                    continue

                # 3. Send Instant Typing Event
                await websocket.send_json({"type": "typing"})

                # Get Normalized Question
                normalized_q = normalize_query(user_msg)
                
                resolved_query = normalized_q
                
                # Retrieve last 6 messages for session memory BEFORE embedding
                stmt_mem = select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.desc()).limit(6)
                res_mem = await db.execute(stmt_mem)
                recent_messages = res_mem.scalars().all()
                recent_messages.reverse()
                
                chat_history_for_rewrite = [msg for msg in recent_messages if msg.id != user_cm.id]
                
                if chat_history_for_rewrite:
                    followup_words = ["how", "what", "when", "where", "why", "who", "it", "that", "this", "they", "those", "he", "she"]
                    is_short = len(normalized_q.split()) < 6
                    has_pronoun = any(word in normalized_q.lower().split() for word in followup_words)
                    
                    if is_short or has_pronoun:
                        try:
                            formatted_history = []
                            current_pair = {}
                            for msg in chat_history_for_rewrite:
                                if msg.sender == "user":
                                    current_pair["user"] = msg.message
                                elif msg.sender == "bot" and "user" in current_pair:
                                    current_pair["ai"] = msg.message
                                    if "don't have enough information" not in msg.message.lower() and "fallback" not in msg.message.lower():
                                        formatted_history.append(current_pair)
                                    current_pair = {}
                            
                            if formatted_history:
                                resolved_query = await ollama_service.rewrite_query(formatted_history, normalized_q)
                        except Exception as e:
                            logger.error(f"Query rewrite failed: {e}")
                            resolved_query = normalized_q

                q_hash = hashlib.md5(resolved_query.encode()).hexdigest()
                cache_key = f"chat:{domain.id}:{q_hash}"

                # 4. Answer Cache Check (Exact match)
                cached_response = await redis_service.get_cached_response(cache_key)
                if cached_response:
                    cached_answer = cached_response.get("answer")
                    await websocket.send_json({
                        "type": "message",
                        "text": cached_answer,
                        "sender": "ai",
                        "source": "faq",
                        "confidence": 1.0
                    })
                    # Log bot message saving in the background
                    asyncio.create_task(run_background_chat_updates(
                        domain_id=domain.id,
                        session_id=session_id,
                        user_msg=user_msg,
                        ai_msg=cached_answer,
                        do_summarize=False
                    ))
                    continue

                # 5. Embedding Cache Check
                query_vector = await redis_service.get_cached_embedding(q_hash)
                need_cache_embedding = False
                if not query_vector:
                    try:
                        query_vector = await ollama_service.generate_embedding(resolved_query)
                        need_cache_embedding = True
                    except Exception as embed_err:
                        logger.error(f"Embedding generation error: {embed_err}")
                        await websocket.send_json({"type": "error", "text": "Failed to process query embeddings."})
                        continue

                # 6. Fetch Domain Categories (Try cache first)
                category_ids = await redis_service.get_domain_categories(domain.id)
                if category_ids is None:
                    try:
                        from database.models import DomainCategory
                        cat_stmt = select(DomainCategory.category_id).where(DomainCategory.domain_id == domain.id)
                        cat_res = await db.execute(cat_stmt)
                        category_ids = cat_res.scalars().all()
                        asyncio.create_task(redis_service.set_domain_categories(domain.id, category_ids))
                    except Exception as cat_err:
                        logger.error(f"Failed to fetch categories: {cat_err}")
                        category_ids = []

                # 7. Search Qdrant and Postgres FTS
                from routers.chatbot_routes import search_faqs_fts
                
                async def run_qdrant():
                    try:
                        return await qdrant_service.search_chunks(
                            tenant_id=domain.organization_id,
                            query_vector=query_vector,
                            category_ids=category_ids,
                            limit=3
                        )
                    except Exception as search_err:
                        logger.error(f"Qdrant search error: {search_err}")
                        return []
                        
                qdrant_chunks, fts_chunks = await asyncio.gather(
                    run_qdrant(),
                    search_faqs_fts(db, domain.id, resolved_query, limit=3)
                )

                # Merge and deduplicate
                seen_texts = set()
                top_chunks = []
                
                for chunk in fts_chunks + qdrant_chunks:
                    payload = chunk.get("payload", {})
                    text_content = payload.get("question") or payload.get("text", "")
                    short_key = text_content[:100].lower()
                    if short_key not in seen_texts:
                        seen_texts.add(short_key)
                        top_chunks.append(chunk)
                        
                top_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
                top_chunks = top_chunks[:5]

                fallback = domain.settings.get("fallback_message", "I don't have enough information to answer that based on the current knowledge base.") if domain.settings else "I don't have enough information to answer that based on the current knowledge base."

                if not top_chunks:
                    logger.info({
                        "question": user_msg,
                        "score": 0.0,
                        "matched_question": None,
                        "matched_category": category_ids,
                        "path": "NO_MATCH"
                    })
                    # Early Exit: No match
                    await websocket.send_json({
                        "type": "message",
                        "text": fallback,
                        "sender": "ai",
                        "source": "fallback",
                        "confidence": 0.0
                    })
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

                # Score Check
                max_score = top_chunks[0].get("score", 0)

                # 8. Score Check: FAQ Fast Path (>= 0.95)
                if max_score >= 0.95:
                    fast_answer = top_chunks[0].get("payload", {}).get("answer")
                    if fast_answer:
                        logger.info({
                            "question": user_msg,
                            "score": max_score,
                            "matched_question": top_chunks[0].get("payload", {}).get("question"),
                            "matched_category": category_ids,
                            "path": "FAST_PATH"
                        })
                        await websocket.send_json({
                            "type": "message",
                            "text": fast_answer,
                            "sender": "ai",
                            "source": "faq",
                            "confidence": max_score
                        })
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

                # 9. Score Check: Early Exit Fallback (< 0.60)
                if max_score < 0.60:
                    logger.info({
                        "question": user_msg,
                        "score": max_score,
                        "matched_question": top_chunks[0].get("payload", {}).get("question"),
                        "matched_category": category_ids,
                        "path": "FALLBACK"
                    })
                    await websocket.send_json({
                        "type": "message",
                        "text": fallback,
                        "sender": "ai",
                        "source": "fallback",
                        "confidence": max_score
                    })
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

                # 10. Normal RAG Path (0.60 - 0.95): Build Context with Memory and Stream Response
                # Retrieve last 5 messages for session memory
                stmt_mem = select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.desc()).limit(5)
                res_mem = await db.execute(stmt_mem)
                recent_messages = res_mem.scalars().all()
                recent_messages.reverse()

                prompt_parts = []
                if chat_session.summary:
                    prompt_parts.append(f"Summary of previous conversation:\n{chat_session.summary}")
                
                if recent_messages:
                    history_text = "\n".join([f"{'User' if m.sender == 'user' else 'Assistant' if m.sender == 'bot' else m.sender}: {m.message}" for m in recent_messages])
                    prompt_parts.append(f"Recent Conversation History:\n{history_text}")
                    
                context_parts_list = []
                for chunk in top_chunks:
                    payload = chunk.get("payload", {})
                    if "answer" in payload:
                        context_parts_list.append(payload["answer"])
                    else:
                        text = payload.get("text", "")
                        if text.startswith("Q:"):
                            text = text.replace("Q:", "").replace("A:", "").strip()
                        context_parts_list.append(text)
                
                context_text = "\n\n".join(context_parts_list)
                prompt_parts.append(f"Context from Knowledge Base:\n{context_text}")
                
                prompt_history_context = "\n\n".join(prompt_parts)
                system_prompt = f"""You are a helpful and precise AI assistant for the website {domain.domain_name}.
You must answer the user's question relying ONLY on the provided Context.
You may correct minor spelling mistakes in the user's question to match the Context.
If the provided Context does not contain the information needed to answer the user's question, you must reply EXACTLY with the following string and nothing else: "{fallback}"
Do not guess, do not provide external knowledge, do not hallucinate, and do not provide any explanations if the context is insufficient.

{prompt_history_context}"""

                # 11. Stream Tokens
                full_answer = ""
                try:
                    async for chunk_text in ollama_service.generate_response_stream(
                        system_prompt=system_prompt,
                        user_query=user_msg
                    ):
                        if chunk_text:
                            full_answer += chunk_text
                            await websocket.send_json({"type": "stream_delta", "text": chunk_text})
                    
                    # Stream Done
                    await websocket.send_json({"type": "stream_done"})

                    # Check if response is a fallback/failure
                    failure_reason = None
                    path_type = "LLM_PATH"
                    if fallback.lower() in full_answer.lower() or "i don't have enough information" in full_answer.lower():
                        failure_reason = "LLM_FAILURE"
                        path_type = "LLM_FAILURE"

                    logger.info({
                        "question": user_msg,
                        "score": max_score,
                        "matched_question": top_chunks[0].get("payload", {}).get("question"),
                        "matched_category": category_ids,
                        "path": path_type
                    })

                    # Schedule background task to log message and cache response
                    asyncio.create_task(run_background_chat_updates(
                        domain_id=domain.id,
                        session_id=session_id,
                        user_msg=user_msg,
                        ai_msg=full_answer,
                        failure_reason=failure_reason,
                        cache_key=cache_key,
                        q_hash=q_hash if need_cache_embedding else None,
                        query_vector=query_vector if need_cache_embedding else None
                    ))

                except Exception as stream_err:
                    logger.error(f"Error during Ollama token streaming: {stream_err}")
                    await websocket.send_json({"type": "error", "text": "Error generating response from AI server."})
                    continue

    except WebSocketDisconnect:
        logger.info(f"Widget WS disconnected for session {session_id}")
