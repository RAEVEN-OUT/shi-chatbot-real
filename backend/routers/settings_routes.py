from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional, List
from pydantic import BaseModel

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import Domain

router = APIRouter(prefix="/api", tags=["settings"])

class StyleConfig(BaseModel):
    theme_color: Optional[str] = None
    title: Optional[str] = None
    placeholder: Optional[str] = None
    position: Optional[str] = None
    logo_url: Optional[str] = None
    border_radius: Optional[str] = None
    font_color: Optional[str] = None
    
    bot_name: Optional[str] = None
    bot_description: Optional[str] = None
    welcome_message: Optional[str] = None
    farewell_message: Optional[str] = None
    human_request_message: Optional[str] = None

    # Legacy camelCase fields for client compatibility
    primaryColor: Optional[str] = None
    chatBubbleColor: Optional[str] = None
    welcomeMessage: Optional[str] = None
    placeholderText: Optional[str] = None
    botName: Optional[str] = None
    botAvatar: Optional[str] = None
    widgetIcon: Optional[str] = None

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
    style = settings.get("style", {})
    
    # Merge nested style fields with flat settings fields to avoid showing blank editors
    result_style = {
        "theme_color": style.get("theme_color") or settings.get("widget_theme_color") or settings.get("widget_color") or "#7C3AED",
        "title": style.get("title") or settings.get("widget_title") or "Support Chat",
        "placeholder": style.get("placeholder") or settings.get("widget_placeholder") or "Type your question...",
        "position": style.get("position") or settings.get("widget_position") or "right",
        "welcome_message": style.get("welcome_message") or settings.get("widget_welcome_message") or settings.get("welcome_message") or "Hi! How can I help you today?",
        "logo_url": style.get("logo_url") or settings.get("widget_logo_url") or settings.get("bot_avatar") or "",
        "border_radius": style.get("border_radius") or settings.get("widget_border_radius") or "12px",
        "font_color": style.get("font_color") or settings.get("widget_font_color") or "#ffffff",
        "bot_name": style.get("bot_name") or settings.get("bot_name") or "SHI Chatbot",
        "bot_description": style.get("bot_description") or settings.get("bot_description") or "An AI assistant that helps visitors using the knowledge base.",
        "farewell_message": style.get("farewell_message") or settings.get("farewell_message") or "Goodbye! Have a great day!",
        "human_request_message": style.get("human_request_message") or settings.get("human_request_message") or "Please contact our support team or use the available contact options on this website."
    }
    return result_style

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
    
    # Extract deserialized values (ignoring unprovided fields)
    update_data = data.model_dump(exclude_unset=True)
    
    # Save flat key mappings for backend compatibility (e.g. widget config, intents)
    if "theme_color" in update_data:
        settings["widget_theme_color"] = update_data["theme_color"]
        settings["widget_color"] = update_data["theme_color"]
    if "title" in update_data:
        settings["widget_title"] = update_data["title"]
    if "placeholder" in update_data:
        settings["widget_placeholder"] = update_data["placeholder"]
    if "logo_url" in update_data:
        settings["widget_logo_url"] = update_data["logo_url"]
        settings["bot_avatar"] = update_data["logo_url"]
    if "border_radius" in update_data:
        settings["widget_border_radius"] = update_data["border_radius"]
    if "font_color" in update_data:
        settings["widget_font_color"] = update_data["font_color"]
    if "position" in update_data:
        settings["widget_position"] = update_data["position"]

    # Chatbot Personality flat mappings
    if "bot_name" in update_data:
        settings["bot_name"] = update_data["bot_name"]
    if "bot_description" in update_data:
        settings["bot_description"] = update_data["bot_description"]
    if "welcome_message" in update_data:
        settings["welcome_message"] = update_data["welcome_message"]
        settings["widget_welcome_message"] = update_data["welcome_message"]
    if "farewell_message" in update_data:
        settings["farewell_message"] = update_data["farewell_message"]
    if "human_request_message" in update_data:
        settings["human_request_message"] = update_data["human_request_message"]

    # Backward compatible camelCase mappings
    if "primaryColor" in update_data:
        settings["widget_theme_color"] = update_data["primaryColor"]
        settings["widget_color"] = update_data["primaryColor"]
    if "welcomeMessage" in update_data:
        settings["welcome_message"] = update_data["welcomeMessage"]
        settings["widget_welcome_message"] = update_data["welcomeMessage"]
    if "placeholderText" in update_data:
        settings["widget_placeholder"] = update_data["placeholderText"]
    if "botName" in update_data:
        settings["bot_name"] = update_data["botName"]
    if "botAvatar" in update_data:
        settings["bot_avatar"] = update_data["botAvatar"]
        settings["widget_logo_url"] = update_data["botAvatar"]

    # Mirror updates in legacy nested object for compatibility
    style = settings.get("style", {})
    style.update(update_data)
    settings["style"] = style
    
    domain.settings = settings
    
    # SQLAlchemy JSON column modification flag
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
