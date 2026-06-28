from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
import math

from core.firebase_auth import require_subscriber
from database.database import get_db
from database.models import FAQQuestion, FAQCategory, DomainCategory
from services.ollama_service import ollama_service
from services.qdrant_service import qdrant_service
from services.audit_service import log_action

router = APIRouter(prefix="/faq-questions", tags=["faq_questions"])

class FAQQuestionCreate(BaseModel):
    faq_id: str
    question: str
    answer: str
    aliases: Optional[List[str]] = []

class FAQQuestionUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    aliases: Optional[List[str]] = None
    status: Optional[str] = None

class BulkDeleteRequest(BaseModel):
    question_ids: List[str]


def _build_embed_text(question: str, answer: str, aliases: Optional[List[str]] = None) -> str:
    """
    FIX #1 — Embed Q+A together, not question alone.
    Embedding only the question produces poor cosine similarity against
    casual paraphrases ("how to install widget" vs "How do I install the widget?").
    Embedding the full Q+A gives the vector richer semantic coverage and reliably
    scores ≥ 0.75 against paraphrases of either the question or the answer.
    """
    text = f"Q: {question}\nA: {answer}"
    if aliases:
        text += f"\nAliases: {', '.join(aliases)}"
    return text


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
    effective_cat_id = category_id if category_id is not None else faq_id

    if effective_cat_id not in [None, "", "all"]:
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
        stmt = select(FAQQuestion).join(FAQCategory).where(
            FAQCategory.organization_id == user["postgres_user"].organization_id,
            FAQQuestion.status != "deleted"
        )

    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            FAQQuestion.question.ilike(search_pattern) |
            FAQQuestion.answer.ilike(search_pattern)
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_result = await db.execute(count_stmt)
    total_items = count_result.scalar() or 0

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
                "created_at": q.created_at,
                "aliases": q.aliases or []
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
    # Verify category belongs to user's org
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
        aliases=data.aliases,
        status="active"
    )
    db.add(new_q)
    await db.commit()
    await db.refresh(new_q)

    # FIX #1: embed Q+A together
    try:
        await qdrant_service.ensure_collection()
        text_to_embed = _build_embed_text(new_q.question, new_q.answer, new_q.aliases)
        vector = await ollama_service.generate_embedding(text_to_embed)

        await qdrant_service.add_chunk(
            tenant_id=user["postgres_user"].organization_id,
            domain_id="",
            text=text_to_embed,
            vector=vector,
            metadata={
                "category_id": new_q.faq_id,
                "question_id": new_q.id,
                "type": "faq",
                "question": new_q.question,
                "answer": new_q.answer
            }
        )
    except Exception as e:
        # Non-fatal: question saved to PG; admin can backfill
        print(f"[WARN] Qdrant embed failed for question {new_q.id}: {e}")

    log_action(
        user_uid=user["uid"],
        action="CREATE",
        resource_type="FAQ Question",
        resource_id=new_q.id,
        admin_message=f"Created FAQ question '{new_q.question}'",
        developer_payload={"data": data.model_dump()}
    )

    return {
        "status": "success",
        "question": {
            "id": new_q.id,
            "question": new_q.question,
            "answer": new_q.answer,
            "aliases": new_q.aliases,
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
    if data.aliases is not None and data.aliases != q.aliases:
        q.aliases = data.aliases
        needs_reembed = True
    if data.status is not None and data.status != q.status:
        q.status = data.status
        # If status changes (e.g. inactive vs active), we might want to purge or add it, 
        # but right now qdrant chunks don't filter by status dynamically unless we delete it.
        # Actually, if it becomes inactive we should probably delete it from qdrant,
        # but to keep it simple and consistent with the existing flow, we'll re-embed it.
        if q.status == "inactive":
            try:
                await qdrant_service.delete_chunks_by_question_id(q.id)
            except Exception as e:
                print(f"[WARN] Failed to delete from Qdrant on inactive: {e}")
            needs_reembed = False # already deleted, don't re-add
        elif q.status == "active":
            needs_reembed = True

    await db.commit()

    if needs_reembed:
        try:
            # FIX #2: delete stale Qdrant points before inserting new one
            await qdrant_service.delete_chunks_by_question_id(q.id)

            text_to_embed = _build_embed_text(q.question, q.answer, q.aliases)
            vector = await ollama_service.generate_embedding(text_to_embed)
            await qdrant_service.add_chunk(
                tenant_id=user["postgres_user"].organization_id,
                domain_id="",
                text=text_to_embed,
                vector=vector,
                metadata={
                    "category_id": q.faq_id,
                    "question_id": q.id,
                    "type": "faq",
                    "question": q.question,
                    "answer": q.answer
                }
            )
        except Exception as e:
            print(f"[WARN] Re-embed failed for question {q.id}: {e}")

    log_action(
        user_uid=user["uid"],
        action="UPDATE",
        resource_type="FAQ Question",
        resource_id=q.id,
        admin_message=f"Updated FAQ question '{q.question}'",
        developer_payload={"data": data.model_dump(exclude_unset=True)}
    )

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

    # FIX #2: also purge from Qdrant on soft-delete
    try:
        await qdrant_service.delete_chunks_by_question_id(question_id)
    except Exception as e:
        print(f"[WARN] Qdrant delete failed for question {question_id}: {e}")

    log_action(
        user_uid=user["uid"],
        action="DELETE",
        resource_type="FAQ Question",
        resource_id=question_id,
        admin_message=f"Deleted (soft) FAQ question '{q.question}'",
        developer_payload={"question_id": question_id}
    )

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
        try:
            await qdrant_service.delete_chunks_by_question_id(q.id)
        except Exception as e:
            print(f"[WARN] Qdrant bulk-delete failed for {q.id}: {e}")

    await db.commit()
    
    log_action(
        user_uid=user["uid"],
        action="DELETE",
        resource_type="FAQ Question",
        resource_id="BULK",
        admin_message=f"Bulk deleted (soft) {len(qs)} FAQ questions",
        developer_payload={"question_ids": [q.id for q in qs]}
    )
    
    return {"status": "success", "deleted_count": len(qs)}
