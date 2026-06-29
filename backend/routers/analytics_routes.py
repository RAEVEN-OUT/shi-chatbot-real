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
    
    # Resolutions
    res_stmt = select(ChatSession.resolution_type, func.count(ChatSession.id)).where(
        ChatSession.domain_id.in_(allowed_domains)
    ).group_by(ChatSession.resolution_type)
    res_result = await db.execute(res_stmt)
    
    ai_resolved = 0
    human_resolved = 0
    for res_type, count in res_result.all():
        if res_type == 'AI':
            ai_resolved += count
        elif res_type == 'HUMAN':
            human_resolved += count
            
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
    
    # Leads
    lead_stmt = select(func.count(Lead.id)).where(
        Lead.domain_id.in_(allowed_domains)
    )
    total_leads = await db.scalar(lead_stmt) or 0
    
    return {
        "totalQueries": total_queries,
        "faqResolved": human_resolved,
        "aiResolved": ai_resolved,
        "failedQsCount": failed_questions,
        "spamCount": int(spam_count),
        "totalLeads": total_leads,
        "utmSourceCounts": {},
        "utmMediumCounts": {},
        # Retain snake_case for backward compatibility
        "total_queries": total_queries,
        "ai_resolved": ai_resolved,
        "human_resolved": human_resolved,
        "failed_questions": failed_questions,
        "spam_count": int(spam_count),
        "total_leads": total_leads
    }
