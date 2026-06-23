from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel
import uuid

from core.firebase_auth import get_current_user, require_subscriber
from database.database import get_db
from database.models import Domain, RetrainingJob, DomainCategory, FAQCategory
from services.redis_service import redis_service

router = APIRouter(prefix="/domains", tags=["domains"])

class DomainCreate(BaseModel):
    name: str
    domain_url: str
    welcome_message: Optional[str] = "Welcome to Acme Support."
    fallback_message: Optional[str] = "Sorry, we could not find an answer. Please contact support."
    helpline_number: Optional[str] = ""
    widget_title: Optional[str] = "Support Assistant"
    widget_color: Optional[str] = "#7C3AED"
    bot_avatar: Optional[str] = ""
    is_active: Optional[bool] = True

class DomainUpdate(BaseModel):
    name: Optional[str] = None
    domain_url: Optional[str] = None
    welcome_message: Optional[str] = None
    fallback_message: Optional[str] = None
    helpline_number: Optional[str] = None
    widget_title: Optional[str] = None
    widget_color: Optional[str] = None
    bot_avatar: Optional[str] = None
    is_active: Optional[bool] = None

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
    
    # Fetch all category IDs for each domain
    domain_ids = [d.id for d in domains]
    category_map = {}
    if domain_ids:
        cat_stmt = select(DomainCategory.domain_id, DomainCategory.category_id).where(DomainCategory.domain_id.in_(domain_ids))
        cat_result = await db.execute(cat_stmt)
        for row in cat_result.all():
            category_map.setdefault(row.domain_id, []).append(row.category_id)
    
    return [
        {
            "id": d.id,
            "domain_name": d.domain_name,
            "domain_url": d.domain_name,
            "organization_id": d.organization_id,
            "name": (d.settings or {}).get("name", d.domain_name),
            "is_active": (d.settings or {}).get("is_active", True),
            "welcome_message": (d.settings or {}).get("welcome_message", "Welcome to Acme Support."),
            "fallback_message": (d.settings or {}).get("fallback_message", "Sorry, we could not find an answer. Please contact support."),
            "helpline_number": (d.settings or {}).get("helpline_number", ""),
            "widget_title": (d.settings or {}).get("widget_title", "Support Assistant"),
            "widget_color": (d.settings or {}).get("widget_color", "#7C3AED"),
            "bot_avatar": (d.settings or {}).get("bot_avatar", ""),
            "category_ids": category_map.get(d.id, []),
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
        
    settings_dict = {
        "name": data.name,
        "welcome_message": data.welcome_message,
        "fallback_message": data.fallback_message,
        "helpline_number": data.helpline_number,
        "widget_title": data.widget_title,
        "widget_color": data.widget_color,
        "bot_avatar": data.bot_avatar,
        "is_active": data.is_active,
        "widget_theme_color": data.widget_color,
        "widget_welcome_message": data.welcome_message,
        "widget_logo_url": data.bot_avatar,
        "widget_placeholder": "Type your question..."
    }
    
    new_domain = Domain(
        domain_name=data.domain_url,
        organization_id=user["postgres_user"].organization_id,
        settings=settings_dict
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
        
    if data.domain_url is not None:
        domain.domain_name = data.domain_url
        
    updated_settings = {**(domain.settings or {})}
    if data.name is not None:
        updated_settings["name"] = data.name
    if data.welcome_message is not None:
        updated_settings["welcome_message"] = data.welcome_message
    if data.fallback_message is not None:
        updated_settings["fallback_message"] = data.fallback_message
    if data.helpline_number is not None:
        updated_settings["helpline_number"] = data.helpline_number
    if data.widget_title is not None:
        updated_settings["widget_title"] = data.widget_title
    if data.widget_color is not None:
        updated_settings["widget_color"] = data.widget_color
        updated_settings["widget_theme_color"] = data.widget_color
    if data.bot_avatar is not None:
        updated_settings["bot_avatar"] = data.bot_avatar
        updated_settings["widget_logo_url"] = data.bot_avatar
    if data.is_active is not None:
        updated_settings["is_active"] = data.is_active

    domain.settings = updated_settings
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(domain, "settings")
        
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
    
    return [c.id for c in categories]

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
    
    # Invalidate Redis category cache
    await redis_service.delete_domain_categories(domain.id)
    
    # Note: In a complete implementation, this should trigger a Qdrant sync of all questions 
    # in these categories for this domain. For now, we update the DB.
    
    return {"status": "success"}
