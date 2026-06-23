from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import Lead, Domain

router = APIRouter(prefix="/leads", tags=["leads"])

@router.get("")
async def list_leads(
    domain_id: Optional[str] = Query(None),
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Lead).join(Domain)
    
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    if domain_id:
        stmt = stmt.where(Lead.domain_id == domain_id)
        
    stmt = stmt.order_by(Lead.created_at.desc())
    
    result = await db.execute(stmt)
    leads = result.scalars().all()
    
    return [
        {
            "id": l.id,
            "domain_id": l.domain_id,
            "session_id": l.session_id,
            "name": l.name,
            "email": l.email,
            "phone": l.phone,
            "message": l.message,
            "created_at": l.created_at
        }
        for l in leads
    ]

@router.get("/table")
async def list_leads_table(
    domain_id: Optional[str] = Query(None),
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Lead, Domain.domain_name).join(Domain, Lead.domain_id == Domain.id)
    
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    if domain_id:
        stmt = stmt.where(Lead.domain_id == domain_id)
        
    stmt = stmt.order_by(Lead.created_at.desc())
    
    result = await db.execute(stmt)
    
    return [
        {
            "id": l.id,
            "domain": domain_name,
            "name": l.name or "N/A",
            "email": l.email or "N/A",
            "phone": l.phone or "N/A",
            "message": l.message or "",
            "date": l.created_at
        }
        for l, domain_name in result.all()
    ]
