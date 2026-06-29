from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import Lead, Domain

router = APIRouter(prefix="/api/leads", tags=["leads"])

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

from sqlalchemy import or_, func

@router.get("/table")
async def list_leads_table(
    domain_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1),
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Lead, Domain.domain_name).join(Domain, Lead.domain_id == Domain.id)
    count_stmt = select(func.count(Lead.id)).join(Domain, Lead.domain_id == Domain.id)
    
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        count_stmt = count_stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    if domain_id:
        stmt = stmt.where(Lead.domain_id == domain_id)
        count_stmt = count_stmt.where(Lead.domain_id == domain_id)
        
    if search:
        search_filter = f"%{search}%"
        search_cond = or_(
            Lead.name.ilike(search_filter),
            Lead.email.ilike(search_filter),
            Lead.phone.ilike(search_filter)
        )
        stmt = stmt.where(search_cond)
        count_stmt = count_stmt.where(search_cond)
        
    total_count = await db.scalar(count_stmt)
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
    
    stmt = stmt.order_by(Lead.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(stmt)
    
    data = [
        {
            "id": l.id,
            "domain_id": l.domain_id,
            "domain": domain_name,
            "name": l.name or "N/A",
            "email": l.email or "N/A",
            "phone": l.phone or "N/A",
            "message": l.message or "",
            "session_id": l.session_id,
            "created_at": l.created_at.isoformat() if l.created_at else None
        }
        for l, domain_name in result.all()
    ]
    
    return {
        "data": data,
        "pagination": {
            "page": page,
            "total_pages": total_pages,
            "total_items": total_count
        }
    }
