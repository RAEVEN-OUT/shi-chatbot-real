from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
import uuid
import math

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import FAQQuestion, FAQCategory, DomainCategory
from services.ollama_service import ollama_service
from services.qdrant_service import qdrant_service

router = APIRouter(prefix="/faq-questions", tags=["faq_questions"])

class FAQQuestionCreate(BaseModel):
    faq_id: str
    question: str
    answer: str

class FAQQuestionUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    status: Optional[str] = None

class BulkDeleteRequest(BaseModel):
    question_ids: List[str]

@router.get("")
async def list_faq_questions(
    faq_id: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1),
    search: Optional[str] = Query(None),
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    print(f"DEBUG: list_faq_questions params: faq_id={faq_id}, category_id={category_id}, page={page}, page_size={page_size}, search={search}")
    
    # Determine the effective category ID, prioritizing category_id
    effective_cat_id = category_id if category_id is not None else faq_id

    # Build query
    if effective_cat_id not in [None, "", "all"]:
        # Verify category belongs to user's org
        cat_stmt = select(FAQCategory).where(
            FAQCategory.id == effective_cat_id,
            FAQCategory.organization_id == user["postgres_user"].organization_id
        )
        result = await db.execute(cat_stmt)
        cat = result.scalar_one_or_none()
        
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found or access denied")

        stmt = select(FAQQuestion).where(
            FAQQuestion.faq_id == effective_cat_id,
            FAQQuestion.status != "deleted"
        )
    else:
        # If no specific category is requested, fetch all questions under any category of the user's organization
        stmt = select(FAQQuestion).join(FAQCategory).where(
            FAQCategory.organization_id == user["postgres_user"].organization_id,
            FAQQuestion.status != "deleted"
        )

    # Apply search filter
    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            FAQQuestion.question.ilike(search_pattern) | 
            FAQQuestion.answer.ilike(search_pattern)
        )

    # Get total matching count using subquery
    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_result = await db.execute(count_stmt)
    total_items = count_result.scalar() or 0

    # Sort, paginate
    stmt = stmt.order_by(FAQQuestion.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    q_result = await db.execute(stmt)
    questions = q_result.scalars().all()

    total_pages = math.ceil(total_items / page_size) if page_size > 0 else 1

    return {
        "data": [
            {
                "id": q.id,
                "faq_id": q.faq_id,
                "question": q.question,
                "answer": q.answer,
                "status": q.status,
                "created_at": q.created_at
            }
            for q in questions
        ],
        "pagination": {
            "total_items": total_items,
            "total_pages": total_pages,
            "page": page,
            "page_size": page_size
        }
    }

@router.post("")
async def create_faq_question(
    data: FAQQuestionCreate,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    # Verify category
    cat_stmt = select(FAQCategory).where(
        FAQCategory.id == data.faq_id,
        FAQCategory.organization_id == user["postgres_user"].organization_id
    )
    result = await db.execute(cat_stmt)
    cat = result.scalar_one_or_none()
    
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    new_q = FAQQuestion(
        faq_id=data.faq_id,
        question=data.question,
        answer=data.answer,
        status="active"
    )
    db.add(new_q)
    await db.commit()
    await db.refresh(new_q)
    
    # Generate embedding and store in Qdrant
    try:
        text_to_embed = new_q.question
        # We still store the formatted text in Qdrant for reference, but we embed just the question
        full_text = f"Q: {new_q.question}\nA: {new_q.answer}"
        vector = await ollama_service.generate_embedding(text_to_embed)
        
        # In the new architecture, questions belong to a category, not a domain directly.
        # We store category_id in metadata. 
        await qdrant_service.add_chunk(
            tenant_id=user["postgres_user"].organization_id,
            domain_id=new_q.faq_id, # passing correct category ID
            text=full_text,
            vector=vector,
            metadata={"category_id": new_q.faq_id, "question_id": new_q.id, "type": "faq", "question": new_q.question, "answer": new_q.answer}
        )
    except Exception as e:
        print(f"Error embedding question {new_q.id}: {e}")
    
    return {
        "status": "success",
        "question": {
            "id": new_q.id,
            "question": new_q.question,
            "answer": new_q.answer,
            "status": new_q.status
        }
    }

@router.put("/{question_id}")
async def update_faq_question(
    question_id: str,
    data: FAQQuestionUpdate,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    # Retrieve question and verify category
    stmt = select(FAQQuestion).join(FAQCategory).where(
        FAQQuestion.id == question_id,
        FAQCategory.organization_id == user["postgres_user"].organization_id
    )
    result = await db.execute(stmt)
    q = result.scalar_one_or_none()
    
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    needs_reembed = False
    if data.question is not None and data.question != q.question:
        q.question = data.question
        needs_reembed = True
    if data.answer is not None and data.answer != q.answer:
        q.answer = data.answer
        needs_reembed = True
    if data.status is not None:
        q.status = data.status
        
    await db.commit()
    
    if needs_reembed:
        try:
            # We would ideally delete the old chunk or update it.
            # Qdrant upsert with ID requires point ID. Currently we don't store point_id.
            # For this MVP, we will just add a new chunk. A robust implementation needs `delete_chunks_by_metadata`.
            text_to_embed = q.question
            full_text = f"Q: {q.question}\nA: {q.answer}"
            vector = await ollama_service.generate_embedding(text_to_embed)
            await qdrant_service.add_chunk(
                tenant_id=user["postgres_user"].organization_id,
                domain_id=q.faq_id,
                text=full_text,
                vector=vector,
                metadata={"category_id": q.faq_id, "question_id": q.id, "type": "faq", "question": q.question, "answer": q.answer}
            )
        except Exception as e:
            print(f"Error re-embedding question {q.id}: {e}")

    return {"status": "success"}

@router.delete("/{question_id}")
async def delete_faq_question(
    question_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FAQQuestion).join(FAQCategory).where(
        FAQQuestion.id == question_id,
        FAQCategory.organization_id == user["postgres_user"].organization_id
    )
    result = await db.execute(stmt)
    q = result.scalar_one_or_none()
    
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    q.status = "deleted"
    await db.commit()
    
    return {"status": "success"}

@router.post("/bulk-delete")
async def bulk_delete_questions(
    data: BulkDeleteRequest,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FAQQuestion).join(FAQCategory).where(
        FAQQuestion.id.in_(data.question_ids),
        FAQCategory.organization_id == user["postgres_user"].organization_id
    )
    result = await db.execute(stmt)
    qs = result.scalars().all()
    
    for q in qs:
        q.status = "deleted"
        
    await db.commit()
    return {"status": "success", "deleted_count": len(qs)}
