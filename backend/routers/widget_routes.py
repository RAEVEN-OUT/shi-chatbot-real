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

from database.database import get_db
from database.models import Domain, ChatSession, ChatMessage, Lead
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service

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

    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except:
                continue
                
            if payload.get("type") == "message":
                user_msg = payload.get("text")
                if not user_msg:
                    continue
                    
                # Save user message
                user_cm = ChatMessage(session_id=chat_session.id, sender="user", message=user_msg)
                db.add(user_cm)
                
                chat_session.message_count += 1
                chat_session.last_message_at = datetime.datetime.utcnow()
                await db.commit()

                await websocket.send_json({"type": "typing"})
                
                # RAG -> Ollama flow
                try:
                    # Fetch category IDs linked to this domain
                    from database.models import DomainCategory
                    cat_stmt = select(DomainCategory.category_id).where(DomainCategory.domain_id == domain.id)
                    cat_res = await db.execute(cat_stmt)
                    category_ids = cat_res.scalars().all()

                    query_vector = await ollama_service.generate_embedding(user_msg)
                    top_chunks = await qdrant_service.search_chunks(
                        tenant_id=domain.organization_id,
                        query_vector=query_vector,
                        category_ids=category_ids,
                        limit=3
                    )
                    
                    if top_chunks:
                        context_text = "\n\n".join([chunk.get("payload", {}).get("text", "") for chunk in top_chunks])
                    else:
                        context_text = ""
                    
                    system_prompt = f"You are a helpful AI assistant for the website {domain.domain_name}.\nUse the following context to answer the user's question.\n\nContext:\n{context_text}"
                    
                    answer = await ollama_service.generate_response(
                        system_prompt=system_prompt,
                        user_query=user_msg
                    )
                    
                    # Save bot message
                    bot_cm = ChatMessage(session_id=chat_session.id, sender="bot", message=answer)
                    db.add(bot_cm)
                    
                    chat_session.message_count += 1
                    chat_session.last_message_at = datetime.datetime.utcnow()
                    await db.commit()
                    
                    await websocket.send_json({"type": "message", "text": answer, "sender": "ai"})
                    
                except Exception as e:
                    logger.error(f"Error in RAG flow: {e}")
                    await websocket.send_json({"type": "error", "text": "Sorry, I am having trouble connecting to my knowledge base right now."})
                    
    except WebSocketDisconnect:
        logger.info(f"Widget WS disconnected for session {session_id}")
