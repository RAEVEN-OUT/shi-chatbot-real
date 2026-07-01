"""
Backfill script — re-indexes all active FAQ questions into Qdrant.
Run this once after deploying the fix that changes embedding text from
question-only to Q+A combined text.

Usage:
    cd backend
    python scripts/backfill_qdrant.py
"""
import asyncio
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.database import AsyncSessionLocal
from database.models import FAQQuestion, FAQCategory, DomainCategory
from sqlalchemy.future import select
from services.ollama_service import ollama_service
from services.qdrant_service import qdrant_service
from routers.faq_question_routes import _build_embed_text

async def main():
    print("Starting Qdrant backfill (Q+A combined embedding, multi-domain mapping)...")
    await qdrant_service.ensure_collection()

    async with AsyncSessionLocal() as db:
        # Fetch active FAQs and their associated domain IDs through DomainCategory
        stmt = (
            select(FAQQuestion, FAQCategory.organization_id, DomainCategory.domain_id)
            .join(FAQCategory, FAQQuestion.faq_id == FAQCategory.id)
            .join(DomainCategory, FAQCategory.id == DomainCategory.category_id)
            .where(FAQQuestion.status == "active")
        )
        result = await db.execute(stmt)
        records = result.all()

    # Group records by question to avoid re-embedding the same question multiple times
    questions = {}
    domain_mapping = defaultdict(list)
    
    for q, org_id, domain_id in records:
        if q.id not in questions:
            questions[q.id] = (q, org_id)
        domain_mapping[q.id].append(domain_id)

    print(f"Found {len(questions)} active questions mapped across {len(records)} domain linkages.")

    ok = 0
    fail = 0
    
    for q_id, (q, org_id) in questions.items():
        try:
            # Delete stale points for this question before re-inserting
            await qdrant_service.delete_chunks_by_question_id(q_id)

            # Generate embedding ONCE per question
            text_to_embed = _build_embed_text(q.question, q.answer, q.aliases or [])
            vector = await ollama_service.generate_embedding(text_to_embed)

            domains = domain_mapping[q_id]
            
            # Insert a Qdrant point for each linked domain
            for d_id in domains:
                await qdrant_service.add_chunk(
                    tenant_id=org_id,
                    domain_id=d_id,
                    text=text_to_embed,
                    vector=vector,
                    metadata={
                        "category_id": q.faq_id,
                        "question_id": q.id,
                        "source_type": "FAQ",
                        "question": q.question,
                        "answer": q.answer,
                        "aliases": q.aliases or []
                    }
                )
            print(f"  ✓ [{org_id[:8]}] {q.question[:60]} ({len(domains)} domains)")
            ok += 1
        except Exception as e:
            print(f"  ✗ [{q.id}] {q.question[:40]} — {e}")
            fail += 1

    print(f"\nDone. {ok} questions indexed successfully, {fail} failed.")


if __name__ == "__main__":
    asyncio.run(main())
