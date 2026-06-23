from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import FAQCategory, FAQQuestion

router = APIRouter(prefix="/faq-categories", tags=["faq_categories"])

class FAQCategoryCreate(BaseModel):
    faq_title: str

class FAQCategoryUpdate(BaseModel):
    faq_title: Optional[str] = None
    status: Optional[str] = None

class BulkDeleteRequest(BaseModel):
    category_ids: List[str]

@router.get("")
async def list_faq_categories(
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FAQCategory).where(
        FAQCategory.organization_id == user["postgres_user"].organization_id,
        FAQCategory.status != "deleted" # soft delete status check
    )
    result = await db.execute(stmt)
    categories = result.scalars().all()
    
    return [
        {
            "id": c.id,
            "faq_title": c.faq_title,
            "status": c.status,
            "created_at": c.created_at
        }
        for c in categories
    ]

@router.post("")
async def create_faq_category(
    data: FAQCategoryCreate,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    if not user["postgres_user"].organization_id:
        raise HTTPException(status_code=400, detail="User must belong to an organization")
        
    new_cat = FAQCategory(
        faq_title=data.faq_title,
        organization_id=user["postgres_user"].organization_id,
        status="active"
    )
    db.add(new_cat)
    await db.commit()
    await db.refresh(new_cat)
    
    return {
        "status": "success",
        "category": {
            "id": new_cat.id,
            "faq_title": new_cat.faq_title,
            "status": new_cat.status
        }
    }

@router.put("/{category_id}")
async def update_faq_category(
    category_id: str,
    data: FAQCategoryUpdate,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FAQCategory).where(
        FAQCategory.id == category_id,
        FAQCategory.organization_id == user["postgres_user"].organization_id
    )
    result = await db.execute(stmt)
    cat = result.scalar_one_or_none()
    
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
        
    if data.faq_title is not None:
        cat.faq_title = data.faq_title
    if data.status is not None:
        cat.status = data.status
        
    await db.commit()
    return {"status": "success"}

@router.delete("/{category_id}")
async def delete_faq_category(
    category_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FAQCategory).where(
        FAQCategory.id == category_id,
        FAQCategory.organization_id == user["postgres_user"].organization_id
    )
    result = await db.execute(stmt)
    cat = result.scalar_one_or_none()
    
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
        
    # User constraint: use soft deletes
    cat.status = "inactive"
    await db.commit()
    return {"status": "success"}

@router.post("/bulk-delete")
async def bulk_delete_categories(
    data: BulkDeleteRequest,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FAQCategory).where(
        FAQCategory.id.in_(data.category_ids),
        FAQCategory.organization_id == user["postgres_user"].organization_id
    )
    result = await db.execute(stmt)
    cats = result.scalars().all()
    
    for c in cats:
        c.status = "inactive"
        
    await db.commit()
    return {"status": "success", "deleted_count": len(cats)}
