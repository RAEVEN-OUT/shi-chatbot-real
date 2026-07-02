from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import FAQCategory, FAQQuestion, DomainCategory
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.audit_service import log_action
from routers.faq_question_routes import _build_embed_text

async def _reembed_category_background(category_id: str, organization_id: str):
    from database.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        stmt = select(FAQQuestion).where(
            FAQQuestion.faq_id == category_id,
            FAQQuestion.status == "active"
        )
        result = await db.execute(stmt)
        questions = result.scalars().all()
        
        if not questions:
            return
            
        await qdrant_service.ensure_collection()
        for q in questions:
            try:
                text_to_embed = _build_embed_text(q.question, q.answer, q.aliases)
                vector = await ollama_service.generate_embedding(text_to_embed)
                await qdrant_service.add_chunk(
                    tenant_id=organization_id,
                    domain_id="",
                    text=text_to_embed,
                    vector=vector,
                    metadata={
                        "category_id": q.faq_id,
                        "question_id": q.id,
                        "source_type": "FAQ",
                        "question": q.question,
                        "answer": q.answer
                    }
                )
            except Exception as e:
                print(f"[WARN] Failed to re-embed question {q.id} in background: {e}")

router = APIRouter(prefix="/api/faq-categories", tags=["faq_categories"])

class FAQCategoryCreate(BaseModel):
    faq_title: str

class FAQCategoryUpdate(BaseModel):
    faq_title: Optional[str] = None
    status: Optional[str] = None

class BulkDeleteRequest(BaseModel):
    category_ids: List[str]

from sqlalchemy import func, delete

@router.get("")
async def list_faq_categories(
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(
        FAQCategory,
        func.count(FAQQuestion.id).filter(FAQQuestion.status == 'active').label("active_questions")
    ).outerjoin(
        FAQQuestion, FAQCategory.id == FAQQuestion.faq_id
    ).where(
        FAQCategory.organization_id == user["postgres_user"].organization_id,
        FAQCategory.status != "deleted"
    ).group_by(FAQCategory.id).order_by(FAQCategory.faq_title.asc())

    result = await db.execute(stmt)
    categories = result.all()
    
    return [
        {
            "id": row.FAQCategory.id,
            "faq_title": row.FAQCategory.faq_title,
            "status": row.FAQCategory.status,
            "created_at": row.FAQCategory.created_at,
            "active_question_count": row.active_questions
        }
        for row in categories
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
    
    log_action(
        user_uid=user["uid"],
        action="CREATE",
        resource_type="FAQ Category",
        resource_id=new_cat.id,
        admin_message=f"Created FAQ category '{data.faq_title}'",
        developer_payload={"data": data.model_dump()}
    )
    
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
    background_tasks: BackgroundTasks,
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
        if data.status == "deleted":
            try:
                await qdrant_service.delete_chunks_by_category_id(cat.id)
            except Exception as e:
                print(f"[WARN] Failed to delete Qdrant chunks for category {cat.id}: {e}")
                raise HTTPException(status_code=500, detail="Failed to delete category in vector store.")
        elif data.status == "inactive":
            try:
                await qdrant_service.set_chunks_active_by_category_id(cat.id, False)
            except Exception as e:
                print(f"[WARN] Failed to update Qdrant chunks for category {cat.id}: {e}")
                raise HTTPException(status_code=500, detail="Failed to disable category in vector store.")
        elif data.status == "active":
            try:
                await qdrant_service.set_chunks_active_by_category_id(cat.id, True)
            except Exception as e:
                print(f"[WARN] Failed to update Qdrant chunks for category {cat.id}: {e}")
                raise HTTPException(status_code=500, detail="Failed to enable category in vector store.")
        
    await db.commit()
    
    # Invalidate cache for any domain using this category
    from database.models import DomainCategory
    from services.redis_service import redis_service
    stmt = select(DomainCategory.domain_id).where(DomainCategory.category_id == cat.id)
    r = await db.execute(stmt)
    for d_id in r.scalars().all():
        await redis_service.clear_domain_cache(d_id)
    
    log_action(
        user_uid=user["uid"],
        action="UPDATE",
        resource_type="FAQ Category",
        resource_id=cat.id,
        admin_message=f"Updated FAQ category '{cat.faq_title}'",
        developer_payload={"data": data.model_dump(exclude_unset=True)}
    )
    
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
        
    # Manually delete DomainCategory mappings to prevent foreign key violation
    await db.execute(delete(DomainCategory).where(DomainCategory.category_id == cat.id))
    
    # Hard delete category (cascades to questions)
    await db.delete(cat)
    await db.commit()

    try:
        await qdrant_service.delete_chunks_by_category_id(cat.id)
    except Exception as e:
        print(f"[WARN] Failed to delete Qdrant chunks for category {cat.id}: {e}")

    log_action(
        user_uid=user["uid"],
        action="DELETE",
        resource_type="FAQ Category",
        resource_id=cat.id,
        admin_message=f"Hard deleted FAQ category '{cat.faq_title}'",
        developer_payload={"category_id": cat.id, "faq_title": cat.faq_title}
    )

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
        await db.execute(delete(DomainCategory).where(DomainCategory.category_id == c.id))
        await db.delete(c)
        try:
            await qdrant_service.delete_chunks_by_category_id(c.id)
        except Exception as e:
            print(f"[WARN] Failed to delete Qdrant chunks for category {c.id}: {e}")
        
    await db.commit()
    
    log_action(
        user_uid=user["uid"],
        action="DELETE",
        resource_type="FAQ Category",
        resource_id="BULK",
        admin_message=f"Bulk hard deleted {len(cats)} FAQ categories",
        developer_payload={"category_ids": [c.id for c in cats]}
    )
    
    return {"status": "success", "deleted_count": len(cats)}
