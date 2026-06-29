from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, text as sql_text
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
import datetime
import json
from fastapi import WebSocket, WebSocketDisconnect

from core.firebase_auth import get_current_user, require_subscriber
from database.database import get_db
from database.models import ChatSession, ChatMessage, Domain
from utils.ws_manager import manager
from services.redis_service import redis_service

router = APIRouter(prefix="/chat-sessions", tags=["chat_sessions"])
notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])
admin_ws_router = APIRouter(prefix="/api/ws/admin", tags=["admin_ws"])


class MessageCreate(BaseModel):
    message: str
    sender: str
    type: str = "text"


class SessionUpdate(BaseModel):
    status: Optional[str] = None
    ai_enabled: Optional[bool] = None
    admin_joined: Optional[bool] = None


class BulkDeleteRequest(BaseModel):
    session_ids: List[str]


@router.get("")
async def list_sessions(
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    # Auto-close sessions inactive for 1 hour
    cutoff_time = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
    await db.execute(
        update(ChatSession)
        .where(ChatSession.status.in_(["open", "active"]))
        .where(ChatSession.last_message_at < cutoff_time)
        .values(status="closed", ai_enabled=False)
    )
    await db.commit()

    # Correlated subquery to fetch only the text of the latest message for each session
    latest_msg_sub = (
        select(ChatMessage.message)
        .where(ChatMessage.session_id == ChatSession.id)
        .order_by(ChatMessage.sequence.desc())
        .limit(1)
        .correlate(ChatSession)
        .scalar_subquery()
    )

    if user["role"] == "admin":
        stmt = select(ChatSession, latest_msg_sub.label("last_message")).options(
            selectinload(ChatSession.domain)
        )
    else:
        stmt = (
            select(ChatSession, latest_msg_sub.label("last_message"))
            .join(Domain)
            .where(Domain.organization_id == user["postgres_user"].organization_id)
            .options(selectinload(ChatSession.domain))
        )

    result = await db.execute(stmt)
    sessions_data = result.all()

    return [
        {
            "id": s.id,
            "domain_id": s.domain_id,
            "domain_name": s.domain.domain_name if s.domain else None,
            "customer_name": s.customer_name,
            "status": s.status,
            "ai_enabled": s.ai_enabled,
            "admin_joined": s.admin_joined,
            "unread_admin": s.unread_admin,
            "message_count": s.message_count,
            "last_message": last_msg,
            "last_message_at": s.last_message_at,
            "created_at": s.created_at
        }
        for s, last_msg in sessions_data
    ]


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id).options(selectinload(ChatSession.messages))
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check access
    if user["role"] != "admin":
        domain_stmt = select(Domain).where(Domain.id == session.domain_id)
        d_result = await db.execute(domain_stmt)
        domain = d_result.scalar_one_or_none()
        if not domain or domain.organization_id != user["postgres_user"].organization_id:
            raise HTTPException(status_code=403, detail="Access denied")

    # Auto-clear notifications when admin opens the chat
    if session.unread_admin and session.unread_admin > 0:
        session.unread_admin = 0
        await db.commit()

    return {
        "id": session.id,
        "domain_id": session.domain_id,
        "customer_name": session.customer_name,
        "status": session.status,
        "ai_enabled": session.ai_enabled,
        "admin_joined": session.admin_joined,
        "unread_admin": session.unread_admin,
        "messages": [
            {
                "id": m.id,
                "sender": m.sender,
                "message": m.message,
                "type": m.type,
                "sequence": m.sequence,
                "status": m.status,
                "created_at": m.created_at
            }
            for m in sorted(session.messages, key=lambda x: x.sequence)
        ]
    }


@router.post("/{session_id}/messages")
async def send_message(
    session_id: str,
    data: MessageCreate,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    seq_res = await db.execute(
        sql_text("UPDATE chat_sessions SET next_sequence = next_sequence + 1 WHERE id = :id RETURNING next_sequence"),
        {"id": session.id}
    )
    seq_val = seq_res.scalar()

    now = datetime.datetime.utcnow()
    msg = ChatMessage(
        session_id=session.id,
        sender=data.sender,
        message=data.message,
        type=data.type,
        sequence=seq_val,
        status="completed"
    )
    db.add(msg)

    session.message_count += 1
    session.last_message_at = now

    if data.sender == 'user':
        session.unread_admin += 1
    elif data.sender == 'admin':
        session.unread_customer += 1

    await db.commit()
    await db.refresh(msg)

    # Publish to Redis — this triggers both session WebSocket and dashboard WebSocket
    created_at_str = msg.created_at.isoformat() if msg.created_at else now.isoformat()
    payload = {
        "type": "message",
        "message": {
            "id": msg.id,
            "session_id": session_id,
            "sender": msg.sender,
            "message": msg.message,
            "type": msg.type,
            "sequence": msg.sequence,
            "status": msg.status,
            "created_at": created_at_str
        }
    }
    await redis_service.publish_message(f"chat:{session_id}", payload)

    return {"status": "success", "message_id": msg.id}


# ─── Admin WebSocket: per-session chat stream ────────────────────────────────

@admin_ws_router.websocket("/chat/{session_id}")
async def admin_chat_websocket(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id, role="admin")
    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
                if data.get("type") in ["typing_started", "typing_stopped"]:
                    data["actor"] = "admin"
                    data["session_id"] = session_id
                    await redis_service.publish_message(f"chat:{session_id}", data)
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)
        await redis_service.publish_message(f"chat:{session_id}", {
            "type": "typing_stopped",
            "actor": "admin",
            "session_id": session_id
        })


# ─── Admin WebSocket: dashboard conversation-list stream ─────────────────────

@admin_ws_router.websocket("/dashboard")
async def admin_dashboard_websocket(websocket: WebSocket):
    """
    Streams lightweight conversation_update events to the admin dashboard.
    The frontend uses this to reorder the conversation list and update
    previews/unread counts without polling.
    """
    await manager.connect_dashboard(websocket)
    try:
        while True:
            # Keep alive; we only push, never read from this socket
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_dashboard(websocket)


# ─── REST endpoints ───────────────────────────────────────────────────────────

@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    data: SessionUpdate,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if data.status is not None:
        session.status = data.status
    if data.ai_enabled is not None:
        session.ai_enabled = data.ai_enabled
    if data.admin_joined is not None:
        session.admin_joined = data.admin_joined

    await db.commit()
    return {"status": "success"}


@router.post("/{session_id}/read")
async def mark_session_read(
    session_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if session:
        session.unread_admin = 0
        await db.commit()

    return {"status": "success"}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if session:
        await db.delete(session)
        await db.commit()

    return {"status": "success"}


@router.post("/bulk-delete")
async def bulk_delete_sessions(
    data: BulkDeleteRequest,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ChatSession).where(ChatSession.id.in_(data.session_ids))
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    for s in sessions:
        await db.delete(s)

    await db.commit()
    return {"status": "success", "deleted_count": len(sessions)}


@notifications_router.get("/unread-count")
async def get_unread_count(
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    if user["role"] == "admin":
        stmt = select(ChatSession)
    else:
        stmt = select(ChatSession).join(Domain).where(
            Domain.organization_id == user["postgres_user"].organization_id
        )

    result = await db.execute(stmt)
    sessions = result.scalars().all()

    total_unread = sum(1 for s in sessions if s.unread_admin and s.unread_admin > 0)
    return {"unread_count": total_unread}