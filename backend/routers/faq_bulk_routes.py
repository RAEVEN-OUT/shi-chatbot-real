import logging
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from core.firebase_auth import require_subscriber
from database.database import get_db, AsyncSessionLocal
from database.models import Domain, FAQCategory, DomainCategory, FAQQuestion
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service
from services.audit_service import log_action
from routers.faq_question_routes import _build_embed_text

logger = logging.getLogger("chatbot.routers.faq_bulk")
router = APIRouter(prefix="/api/faq-hierarchy", tags=["FAQ Hierarchy"])


class BulkFAQRow(BaseModel):
    Domain: str
    Category: Optional[str] = "General"
    Question: Optional[str] = ""
    Answer: Optional[str] = ""


async def bulk_index_faqs(org_id: str, to_index: List[tuple]):
    """
    Background task to generate embeddings and add to Qdrant for bulk uploaded FAQs.
    to_index: list of tuples (question_id, category_id, question, answer, domain_id)
    """
    try:
        await qdrant_service.ensure_collection()
    except Exception as e:
        logger.error(f"Failed to ensure Qdrant collection: {e}")
        return

    for q_id, cat_id, question, answer, domain_id in to_index:
        try:
            text_to_embed = _build_embed_text(question, answer, [])
            vector = await ollama_service.generate_embedding(text_to_embed)

            await qdrant_service.add_chunk(
                tenant_id=org_id,
                domain_id=domain_id,
                text=text_to_embed,
                vector=vector,
                metadata={
                    "category_id": cat_id,
                    "question_id": q_id,
                    "source_type": "FAQ",
                    "question": question,
                    "answer": answer
                }
            )
        except Exception as e:
            logger.warning(f"[bulk_index_faqs] Failed to index FAQ {q_id}: {e}")


@router.post("/bulk")
async def bulk_upload_faq(
    rows: List[BulkFAQRow],
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_subscriber)
):
    if not user.get("postgres_user") or not user["postgres_user"].organization_id:
        raise HTTPException(status_code=400, detail="User must belong to an organization")

    org_id = user["postgres_user"].organization_id

    if len(rows) > 500:
        raise HTTPException(
            status_code=400,
            detail=f"Bulk upload is limited to 500 rows per request. Received {len(rows)}."
        )

    # 1. Prefetch caches to avoid N+1 queries
    try:
        # Prefetch domains for this organization
        domains_stmt = select(Domain).where(Domain.organization_id == org_id)
        domains_res = await db.execute(domains_stmt)
        domain_cache = {d.domain_name.lower(): d for d in domains_res.scalars().all()}

        # Prefetch active categories for this organization
        categories_stmt = select(FAQCategory).where(
            FAQCategory.organization_id == org_id,
            FAQCategory.status != "deleted"
        )
        categories_res = await db.execute(categories_stmt)
        category_cache = {c.faq_title.lower(): c for c in categories_res.scalars().all()}

        # Prefetch domain-category mappings for this organization
        mappings_stmt = select(DomainCategory).join(FAQCategory).where(
            FAQCategory.organization_id == org_id
        )
        mappings_res = await db.execute(mappings_stmt)
        mapping_cache = {(m.domain_id, m.category_id) for m in mappings_res.scalars().all()}

        # Prefetch active questions for this organization
        questions_stmt = select(FAQQuestion).join(FAQCategory).where(
            FAQCategory.organization_id == org_id,
            FAQQuestion.status != "deleted"
        )
        questions_res = await db.execute(questions_stmt)
        question_cache = {(q.faq_id, q.question.lower()) for q in questions_res.scalars().all()}

    except Exception as e:
        logger.error(f"Error during prefetching: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize prefetch cache.")

    errors: List[str] = []
    success_count = 0
    to_index: List[tuple] = []
    category_max_order = {}

    # 2. Process rows
    for i, row in enumerate(rows, start=1):
        domain_name = row.Domain.strip()
        cat_name = row.Category.strip() if row.Category else "General"
        question = row.Question.strip() if row.Question else ""
        answer = row.Answer.strip() if row.Answer else ""

        if not domain_name:
            errors.append(f"Row {i}: Domain name is missing")
            continue
        if question and not answer:
            errors.append(f"Row {i}: Answer is missing for question '{question}'")
            continue
        if answer and not question:
            errors.append(f"Row {i}: Question is missing for answer")
            continue

        # Nested transaction savepoint for row-by-row isolation
        try:
            async with db.begin_nested():
                # 2.1 Fetch or create Domain
                domain_key = domain_name.lower()
                domain = domain_cache.get(domain_key)
                if not domain:
                    # Check globally to prevent uniqueness constraint violation
                    stmt = select(Domain).where(func.lower(Domain.domain_name) == domain_key)
                    res = await db.execute(stmt)
                    global_d = res.scalar_one_or_none()
                    if global_d:
                        if global_d.organization_id != org_id:
                            errors.append(f"Row {i}: Domain '{domain_name}' already exists in another organization.")
                            continue
                        domain = global_d
                    else:
                        settings_dict = {
                            "name": domain_name,
                            "welcome_message": "Welcome to Acme Support.",
                            "fallback_message": "Sorry, we could not find an answer. Please contact support.",
                            "helpline_number": "",
                            "widget_title": "Support Assistant",
                            "widget_color": "#7C3AED",
                            "bot_avatar": "",
                            "is_active": True,
                            "widget_theme_color": "#7C3AED",
                            "widget_welcome_message": "Welcome to Acme Support.",
                            "widget_logo_url": "",
                            "widget_placeholder": "Type your question..."
                        }
                        domain = Domain(
                            domain_name=domain_name,
                            widget_key=str(uuid.uuid4()),
                            organization_id=org_id,
                            settings=settings_dict
                        )
                        db.add(domain)
                        await db.flush()
                    domain_cache[domain_key] = domain

                # 2.2 Fetch or create Category
                cat_key = cat_name.lower()
                cat = category_cache.get(cat_key)
                if not cat:
                    cat = FAQCategory(
                        faq_title=cat_name,
                        organization_id=org_id,
                        status="active"
                    )
                    db.add(cat)
                    await db.flush()
                    category_cache[cat_key] = cat

                # 2.3 Fetch or create DomainCategory mapping
                map_key = (domain.id, cat.id)
                if map_key not in mapping_cache:
                    new_map = DomainCategory(domain_id=domain.id, category_id=cat.id)
                    db.add(new_map)
                    await db.flush()
                    mapping_cache.add(map_key)

                # 2.4 Fetch or create FAQQuestion
                if question and answer:
                    q_key = (cat.id, question.lower())
                    if q_key not in question_cache:
                        if cat.id not in category_max_order:
                            max_stmt = select(func.max(FAQQuestion.display_order)).where(FAQQuestion.faq_id == cat.id)
                            max_res = await db.execute(max_stmt)
                            category_max_order[cat.id] = max_res.scalar() or 0
                            
                        category_max_order[cat.id] += 1
                        
                        new_q = FAQQuestion(
                            faq_id=cat.id,
                            question=question,
                            answer=answer,
                            status="active",
                            display_order=category_max_order[cat.id]
                        )
                        db.add(new_q)
                        await db.flush()
                        question_cache.add(q_key)
                        to_index.append((new_q.id, cat.id, question, answer, domain.id))

                success_count += 1
        except Exception as e:
            logger.error(f"Error processing row {i}: {e}")
            errors.append(f"Row {i}: Internal database error - {str(e)}")

    # 3. Commit session
    try:
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to commit transaction: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Database transaction commit failed")

    # 4. Trigger async indexing background task
    if to_index:
        background_tasks.add_task(
            bulk_index_faqs,
            org_id,
            to_index
        )
        
    for d in domain_cache.values():
        background_tasks.add_task(redis_service.clear_domain_cache, d.id)
        
    log_action(
        user_uid=user["uid"],
        action="CREATE",
        resource_type="FAQ Bulk Upload",
        resource_id="BULK",
        admin_message=f"Bulk uploaded FAQs. {success_count} successful, {len(errors)} errors.",
        developer_payload={"success_count": success_count, "error_count": len(errors), "errors": errors}
    )

    return {
        "success_count": success_count,
        "errors": errors,
        "message": "Bulk upload completed"
    }
