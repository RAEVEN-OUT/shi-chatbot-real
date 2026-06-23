from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional
from database.database import get_db
from database.models import FailedQuestion, Domain
from core.firebase_auth import require_subscriber
from pydantic import BaseModel

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
    return {"success": True}

@router.post("/{failed_id}/promote")
async def promote_question(
    failed_id: str,
    payload: PromoteRequest,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    # Mock promotion for now as it depends on FAQ model which isn't fully connected here
    stmt = select(FailedQuestion).where(FailedQuestion.id == failed_id)
    result = await db.execute(stmt)
    q = result.scalar_one_or_none()
    
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    await db.delete(q)
    await db.commit()
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
    return {"success": True, "deleted_count": len(questions)}
