from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Optional

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import ChatSession, ChatMessage, FailedQuestion, Lead, Domain

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/summary")
async def get_analytics_summary(
    domain_id: Optional[str] = Query(None),
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    # Base query for domains we have access to
    domain_stmt = select(Domain.id)
    if user["role"] != "admin":
        domain_stmt = domain_stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
    if domain_id:
        domain_stmt = domain_stmt.where(Domain.id == domain_id)
        
    domain_result = await db.execute(domain_stmt)
    allowed_domains = [row for row in domain_result.scalars().all()]
    
    if not allowed_domains:
        return {
            "total_queries": 0,
            "ai_resolved": 0,
            "human_resolved": 0,
            "failed_questions": 0,
            "spam_count": 0,
            "total_leads": 0
        }

    # Total Queries (from ChatMessage where sender == 'user')
    query_stmt = select(func.count(ChatMessage.id)).join(ChatSession).where(
        ChatSession.domain_id.in_(allowed_domains),
        ChatMessage.sender == 'user'
    )
    total_queries = await db.scalar(query_stmt) or 0
    
    from database.models import EvaluationMetadata
    
    # Resolutions based on actual query retrieval paths
    eval_stmt = select(EvaluationMetadata.retrieval_path, func.count(EvaluationMetadata.id)).where(
        EvaluationMetadata.domain_id.in_(allowed_domains)
    ).group_by(EvaluationMetadata.retrieval_path)
    eval_result = await db.execute(eval_stmt)
    
    faq_resolved = 0
    ai_resolved = 0
    for path, count in eval_result.all():
        if path in ['fts_fast_path', 'semantic_fast_path']:
            faq_resolved += count
        elif path == 'llm_generation':
            ai_resolved += count
            
    # Failed Questions
    fail_stmt = select(func.count(FailedQuestion.id)).where(
        FailedQuestion.domain_id.in_(allowed_domains),
        FailedQuestion.is_spam == False
    )
    failed_questions = await db.scalar(fail_stmt) or 0
    
    # Spam
    spam_stmt = select(func.sum(FailedQuestion.spam_count)).where(
        FailedQuestion.domain_id.in_(allowed_domains),
        FailedQuestion.is_spam == True
    )
    spam_count = await db.scalar(spam_stmt) or 0
    
    # Admin Messages (Human Responses)
    admin_msg_stmt = select(func.count(ChatMessage.id)).join(ChatSession).where(
        ChatSession.domain_id.in_(allowed_domains),
        ChatMessage.sender == 'admin'
    )
    human_resolved = await db.scalar(admin_msg_stmt) or 0
    
    # Leads
    lead_stmt = select(func.count(Lead.id)).where(
        Lead.domain_id.in_(allowed_domains)
    )
    total_leads = await db.scalar(lead_stmt) or 0
    
    return {
        "totalQueries": total_queries,
        "faqResolved": faq_resolved,
        "aiResolved": ai_resolved,
        "humanResolved": human_resolved,
        "failedQsCount": failed_questions,
        "spamCount": int(spam_count),
        "totalLeads": total_leads,
        "utmSourceCounts": {},
        "utmMediumCounts": {},
        # Retain snake_case for backward compatibility
        "total_queries": total_queries,
        "ai_resolved": ai_resolved,
        "human_resolved": faq_resolved,
        "failed_questions": failed_questions,
        "spam_count": int(spam_count),
        "total_leads": total_leads
    }

@router.get("/feedback")
async def get_feedback(
    domain_id: Optional[str] = Query(None),
    limit: int = 50,
    offset: int = 0,
    user: dict = Depends(require_subscriber),
    db: AsyncSession = Depends(get_db)
):
    from database.models import MessageFeedback
    
    # Verify domain access
    domain_stmt = select(Domain.id)
    if user["role"] != "admin":
        domain_stmt = domain_stmt.where(Domain.organization_id == user["postgres_user"].organization_id)
    if domain_id:
        domain_stmt = domain_stmt.where(Domain.id == domain_id)
        
    domain_result = await db.execute(domain_stmt)
    allowed_domains = [row for row in domain_result.scalars().all()]
    
    if not allowed_domains:
        return {"items": [], "total": 0}
        
    stmt = select(MessageFeedback).join(ChatSession, MessageFeedback.session_id == ChatSession.id).where(
        ChatSession.domain_id.in_(allowed_domains)
    ).order_by(MessageFeedback.created_at.desc()).limit(limit).offset(offset)
    
    result = await db.execute(stmt)
    feedback_items = result.scalars().all()
    
    count_stmt = select(func.count(MessageFeedback.id)).join(ChatSession, MessageFeedback.session_id == ChatSession.id).where(
        ChatSession.domain_id.in_(allowed_domains)
    )
    total = await db.scalar(count_stmt) or 0
    
    return {
        "items": [
            {
                "id": item.id,
                "session_id": item.session_id,
                "message_id": item.message_id,
                "is_helpful": item.is_helpful,
                "question": item.question,
                "answer": item.answer,
                "retrieval_metadata": item.retrieval_metadata,
                "created_at": item.created_at
            }
            for item in feedback_items
        ],
        "total": total
    }
