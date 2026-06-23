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

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.database import AsyncSessionLocal
from database.models import FAQQuestion, FAQCategory
from sqlalchemy.future import select
from services.ollama_service import ollama_service
from services.qdrant_service import qdrant_service


async def main():
    print("Starting Qdrant backfill (Q+A combined embedding)...")
    await qdrant_service.ensure_collection()

    async with AsyncSessionLocal() as db:
        stmt = (
            select(FAQQuestion, FAQCategory.organization_id)
            .join(FAQCategory, FAQQuestion.faq_id == FAQCategory.id)
            .where(FAQQuestion.status == "active")
        )
        result = await db.execute(stmt)
        records = result.all()

    print(f"Found {len(records)} active questions.")

    ok = 0
    fail = 0
    for q, org_id in records:
        try:
            # FIX: delete stale points before re-inserting
            await qdrant_service.delete_chunks_by_question_id(q.id)

            # FIX: embed Q+A together
            text_to_embed = f"Q: {q.question}\nA: {q.answer}"
            vector = await ollama_service.generate_embedding(text_to_embed)

            await qdrant_service.add_chunk(
                tenant_id=org_id,
                domain_id=q.faq_id,
                text=text_to_embed,
                vector=vector,
                metadata={
                    "category_id": q.faq_id,
                    "question_id": q.id,
                    "type": "faq",
                    "question": q.question,
                    "answer": q.answer,
                    "aliases": q.aliases or []
                }
            )
            print(f"  ✓ [{org_id[:8]}] {q.question[:60]}")
            ok += 1
        except Exception as e:
            print(f"  ✗ [{q.id}] {q.question[:40]} — {e}")
            fail += 1

    print(f"\nDone. {ok} indexed, {fail} failed.")


if __name__ == "__main__":
    asyncio.run(main())
