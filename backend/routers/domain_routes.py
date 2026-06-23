from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel
import uuid

from core.firebase_auth import get_current_user, require_subscriber
from database.database import get_db
from database.models import Domain, RetrainingJob, DomainCategory, FAQCategory

router = APIRouter(prefix="/domains", tags=["domains"])

class DomainCreate(BaseModel):
    domain_name: str
    settings: Optional[dict] = {}

class DomainUpdate(BaseModel):
    domain_name: Optional[str] = None
    settings: Optional[dict] = None

class BulkDeleteRequest(BaseModel):
    domain_ids: List[str]

@router.get("")
async def list_domains(
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    if user["role"] == "admin":
        stmt = select(Domain)
    else:
        stmt = select(Domain).where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    domains = result.scalars().all()
    
    return [
        {
            "id": d.id,
            "domain_name": d.domain_name,
            "organization_id": d.organization_id,
            "settings": d.settings,
            "created_at": d.created_at
        }
        for d in domains
    ]

@router.get("/names")
async def list_domain_names(
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    if user["role"] == "admin":
        stmt = select(Domain.id, Domain.domain_name)
    else:
        stmt = select(Domain.id, Domain.domain_name).where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    
    return [
        {"id": row.id, "domain_name": row.domain_name}
        for row in result.all()
    ]

@router.post("")
async def create_domain(
    data: DomainCreate,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    # Ensure user has an organization
    if not user["postgres_user"] or not user["postgres_user"].organization_id:
        raise HTTPException(status_code=400, detail="User must belong to an organization to create domains")
        
    new_domain = Domain(
        domain_name=data.domain_name,
        organization_id=user["postgres_user"].organization_id,
        settings=data.settings
    )
    db.add(new_domain)
    await db.commit()
    await db.refresh(new_domain)
    
    return {"status": "success", "domain": new_domain.id}

@router.put("/{domain_id}")
async def update_domain(
    domain_id: str,
    data: DomainUpdate,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(Domain.id == domain_id)
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found or access denied")
        
    if data.domain_name is not None:
        domain.domain_name = data.domain_name
    if data.settings is not None:
        # Merge settings
        domain.settings = {**(domain.settings or {}), **data.settings}
        
    await db.commit()
    return {"status": "success"}

@router.delete("/{domain_id}")
async def delete_domain(
    domain_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(Domain.id == domain_id)
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found or access denied")
        
    await db.delete(domain)
    await db.commit()
    return {"status": "success"}

@router.post("/bulk-delete")
async def bulk_delete_domains(
    data: BulkDeleteRequest,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(Domain.id.in_(data.domain_ids))
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    domains = result.scalars().all()
    
    for d in domains:
        await db.delete(d)
        
    await db.commit()
    return {"status": "success", "deleted_count": len(domains)}

@router.post("/{domain_id}/retrain")
async def retrain_domain(
    domain_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(Domain.id == domain_id)
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found or access denied")
        
    job = RetrainingJob(domain_id=domain.id, status="pending")
    db.add(job)
    await db.commit()
    await db.refresh(job)
    
    return {
        "status": "success",
        "message": "Retraining job started",
        "job_id": job.id
    }

class DomainCategoriesUpdate(BaseModel):
    category_ids: List[str]

@router.get("/{domain_id}/categories")
async def get_domain_categories(
    domain_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(Domain.id == domain_id)
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found or access denied")
        
    cat_stmt = select(FAQCategory).join(DomainCategory).where(DomainCategory.domain_id == domain.id)
    cat_result = await db.execute(cat_stmt)
    categories = cat_result.scalars().all()
    
    return [
        {
            "id": c.id,
            "faq_title": c.faq_title,
            "status": c.status
        }
        for c in categories
    ]

@router.put("/{domain_id}/categories")
async def update_domain_categories(
    domain_id: str,
    data: DomainCategoriesUpdate,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(Domain.id == domain_id)
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found or access denied")
        
    # Delete existing categories mapping
    del_stmt = select(DomainCategory).where(DomainCategory.domain_id == domain.id)
    del_result = await db.execute(del_stmt)
    existing_links = del_result.scalars().all()
    for link in existing_links:
        await db.delete(link)
        
    # Add new ones
    for cat_id in data.category_ids:
        new_link = DomainCategory(domain_id=domain.id, category_id=cat_id)
        db.add(new_link)
        
    await db.commit()
    
    # Note: In a complete implementation, this should trigger a Qdrant sync of all questions 
    # in these categories for this domain. For now, we update the DB.
    
    return {"status": "success"}
