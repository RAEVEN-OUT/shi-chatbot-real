from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from core.firebase_auth import get_current_user, require_subscriber
from database.database import get_db
from database.models import ChatSession, ChatMessage, Domain

router = APIRouter(prefix="/chat-sessions", tags=["chat_sessions"])
notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])

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
    # Get all domains user has access to
    if user["role"] == "admin":
        stmt = select(ChatSession).options(selectinload(ChatSession.domain))
    else:
        # Join with domain to filter by org
        stmt = select(ChatSession).join(Domain).where(Domain.organization_id == user["postgres_user"].organization_id).options(selectinload(ChatSession.domain))
        
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    
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
            "last_message_at": s.last_message_at,
            "created_at": s.created_at
        }
        for s in sessions
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
                "created_at": m.created_at
            }
            for m in sorted(session.messages, key=lambda x: x.created_at)
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
        
    msg = ChatMessage(
        session_id=session.id,
        sender=data.sender,
        message=data.message,
        type=data.type
    )
    db.add(msg)
    
    # Update session analytics
    session.message_count += 1
    # session.last_message_at will be updated by sqlalchemy logic or we set manually if needed. Let's let the DB defaults handle it or set it manually.
    
    if data.sender == 'user':
        session.unread_admin += 1
    elif data.sender == 'admin':
        session.unread_customer += 1
        
    await db.commit()
    return {"status": "success", "message_id": msg.id}

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
    # Sum unread_admin across all user's sessions
    if user["role"] == "admin":
        stmt = select(ChatSession)
    else:
        stmt = select(ChatSession).join(Domain).where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    
    total_unread = sum(s.unread_admin for s in sessions)
    return {"unread_count": total_unread}
