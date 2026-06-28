from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional
from database.database import get_db
from database.models import FailedQuestion, Domain
from core.firebase_auth import require_subscriber
from pydantic import BaseModel
from services.audit_service import log_action

router = APIRouter(prefix="/failed-questions", tags=["Failed Questions"])
spam_router = APIRouter(prefix="/spam-questions", tags=["Spam Questions"])

class BulkDeleteRequest(BaseModel):
    ids: list[str]

class PromoteRequest(BaseModel):
    action: str
    question: Optional[str] = None
    answer: Optional[str] = None
    category_id: Optional[str] = None
    status: Optional[str] = None

@router.get("")
async def list_failed_questions(
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    if user["role"] == "admin":
        stmt = select(FailedQuestion).where(FailedQuestion.is_spam == False)
    else:
        stmt = select(FailedQuestion).join(Domain).where(
            Domain.organization_id == user["postgres_user"].organization_id,
            FailedQuestion.is_spam == False
        )
        
    # We could add search filters here.
    
    stmt = stmt.order_by(FailedQuestion.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    questions = result.scalars().all()
    
    return [
        {
            "id": q.id,
            "domain_id": q.domain_id,
            "customer_question": q.question,
            "ai_response": q.ai_response,
            "failure_reason": q.failure_reason,
            "created_at": q.created_at
        }
        for q in questions
    ]

@router.delete("/{failed_id}")
async def delete_failed_question(
    failed_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FailedQuestion).where(FailedQuestion.id == failed_id)
    result = await db.execute(stmt)
    q = result.scalar_one_or_none()
    
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    await db.delete(q)
    await db.commit()
    
    log_action(
        user_uid=user["uid"],
        action="DELETE",
        resource_type="Failed Question",
        resource_id=failed_id,
        admin_message=f"Deleted failed question '{q.question}'",
        developer_payload={"question_id": failed_id}
    )
    
    return {"success": True}

@router.post("/bulk-delete")
async def bulk_delete_failed_questions(
    payload: BulkDeleteRequest,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FailedQuestion).where(FailedQuestion.id.in_(payload.ids))
    result = await db.execute(stmt)
    questions = result.scalars().all()
    
    for q in questions:
        await db.delete(q)
        
    await db.commit()
    
    log_action(
        user_uid=user["uid"],
        action="DELETE",
        resource_type="Failed Question",
        resource_id="BULK",
        admin_message=f"Bulk deleted {len(questions)} failed questions",
        developer_payload={"question_ids": payload.ids}
    )
    
    return {"success": True, "deleted_count": len(questions)}

@router.post("/{failed_id}/spam")
async def flag_as_spam(
    failed_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FailedQuestion).where(FailedQuestion.id == failed_id)
    result = await db.execute(stmt)
    q = result.scalar_one_or_none()
    
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    q.is_spam = True
    q.spam_count += 1
    q.failure_reason = "SPAM"
    
    await db.commit()
    
    log_action(
        user_uid=user["uid"],
        action="UPDATE",
        resource_type="Spam Question",
        resource_id=failed_id,
        admin_message=f"Flagged failed question as spam: '{q.question}'",
        developer_payload={"question_id": failed_id}
    )
    
    return {"success": True}

@router.post("/{failed_id}/promote")
async def promote_question(
    failed_id: str,
    payload: PromoteRequest,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FailedQuestion).where(FailedQuestion.id == failed_id)
    result = await db.execute(stmt)
    q = result.scalar_one_or_none()
    
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    if payload.action == 'new_faq':
        from database.models import FAQQuestion
        from services.ollama_service import ollama_service
        from services.qdrant_service import qdrant_service
        from routers.faq_question_routes import _build_embed_text
        
        new_faq = FAQQuestion(
            faq_id=payload.category_id,
            question=payload.question,
            answer=payload.answer,
            status=payload.status or "active"
        )
        db.add(new_faq)
        await db.flush()

        try:
            await qdrant_service.ensure_collection()
            text_to_embed = _build_embed_text(new_faq.question, new_faq.answer, [])
            vector = await ollama_service.generate_embedding(text_to_embed)

            await qdrant_service.add_chunk(
                tenant_id=user["postgres_user"].organization_id,
                domain_id="",
                text=text_to_embed,
                vector=vector,
                metadata={
                    "category_id": new_faq.faq_id,
                    "question_id": new_faq.id,
                    "type": "faq",
                    "question": new_faq.question,
                    "answer": new_faq.answer
                }
            )
        except Exception as e:
            print(f"[WARN] Qdrant embed failed for promoted question {new_faq.id}: {e}")
            
    await db.delete(q)
    await db.commit()
    
    log_action(
        user_uid=user["uid"],
        action="UPDATE",
        resource_type="Failed Question",
        resource_id=failed_id,
        admin_message=f"Promoted failed question to FAQ: '{q.question}'",
        developer_payload={"question_id": failed_id}
    )
    
    return {"success": True}

@spam_router.get("")
async def list_spam_questions(
    page: int = 1,
    page_size: int = 50,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    if user["role"] == "admin":
        stmt = select(FailedQuestion).where(FailedQuestion.is_spam == True)
    else:
        stmt = select(FailedQuestion).join(Domain).where(
            Domain.organization_id == user["postgres_user"].organization_id,
            FailedQuestion.is_spam == True
        )
        
    stmt = stmt.order_by(FailedQuestion.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    questions = result.scalars().all()
    
    return [
        {
            "id": q.id,
            "domain_id": q.domain_id,
            "customer_question": q.question,
            "spam_count": q.spam_count,
            "created_at": q.created_at
        }
        for q in questions
    ]

@spam_router.delete("/{spam_id}")
async def delete_spam_question(
    spam_id: str,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FailedQuestion).where(FailedQuestion.id == spam_id, FailedQuestion.is_spam == True)
    result = await db.execute(stmt)
    q = result.scalar_one_or_none()
    
    if not q:
        raise HTTPException(status_code=404, detail="Spam question not found")
        
    await db.delete(q)
    await db.commit()
    
    log_action(
        user_uid=user["uid"],
        action="DELETE",
        resource_type="Spam Question",
        resource_id=spam_id,
        admin_message=f"Deleted spam question '{q.question}'",
        developer_payload={"question_id": spam_id}
    )
    
    return {"success": True}

@spam_router.post("/bulk-delete")
async def bulk_delete_spam_questions(
    payload: BulkDeleteRequest,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(FailedQuestion).where(FailedQuestion.id.in_(payload.ids), FailedQuestion.is_spam == True)
    result = await db.execute(stmt)
    questions = result.scalars().all()
    
    for q in questions:
        await db.delete(q)
        
    await db.commit()
    
    log_action(
        user_uid=user["uid"],
        action="DELETE",
        resource_type="Spam Question",
        resource_id="BULK",
        admin_message=f"Bulk deleted {len(questions)} spam questions",
        developer_payload={"question_ids": payload.ids}
    )
    
    return {"success": True, "deleted_count": len(questions)}
