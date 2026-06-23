from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional, List
from pydantic import BaseModel

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import Domain

router = APIRouter(tags=["settings"])

class StyleConfig(BaseModel):
    primaryColor: Optional[str] = None
    chatBubbleColor: Optional[str] = None
    welcomeMessage: Optional[str] = None
    placeholderText: Optional[str] = None
    botName: Optional[str] = None
    botAvatar: Optional[str] = None
    widgetIcon: Optional[str] = None
    position: Optional[str] = None

class LeadConfig(BaseModel):
    status: Optional[bool] = None
    limit: Optional[int] = None
    fields: Optional[List[str]] = None

@router.get("/style/{domain_id}")
async def get_style_config(
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
        raise HTTPException(status_code=404, detail="Domain not found")
        
    settings = domain.settings or {}
    return settings.get("style", {})

@router.post("/style/{domain_id}")
async def update_style_config(
    domain_id: str,
    data: StyleConfig,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(Domain.id == domain_id)
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    settings = domain.settings or {}
    style = settings.get("style", {})
    
    # Update fields that were provided
    update_data = data.model_dump(exclude_unset=True)
    style.update(update_data)
    
    settings["style"] = style
    domain.settings = settings
    
    # SQLAlchemy JSON column requires this to detect changes
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(domain, "settings")
    
    await db.commit()
    return {"status": "success", "style": style}

@router.get("/lead-config/{domain_id}")
async def get_lead_config(
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
        raise HTTPException(status_code=404, detail="Domain not found")
        
    domain_settings = domain.settings or {}
    return domain_settings.get("leadConfig", {
        "status": False,
        "limit": 2,
        "fields": ["name", "email"]
    })

@router.post("/lead-config/{domain_id}")
async def update_lead_config(
    domain_id: str,
    data: LeadConfig,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Domain).where(Domain.id == domain_id)
    if user["role"] != "admin":
        stmt = stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
        
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    domain_settings = domain.settings or {}
    leadConfig = domain_settings.get("leadConfig", {})
    
    update_data = data.model_dump(exclude_unset=True)
    leadConfig.update(update_data)
    
    domain_settings["leadConfig"] = leadConfig
    domain.settings = domain_settings
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(domain, "settings")
    
    await db.commit()
    return {"status": "success", "leadConfig": leadConfig}
