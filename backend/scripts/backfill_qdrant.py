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
from qdrant_client.models import Filter, FieldCondition, MatchValue
from services.ollama_service import ollama_service
from services.qdrant_service import qdrant_service
from routers.faq_question_routes import _build_embed_text

async def main():
    print("Starting Qdrant reconciliation (PostgreSQL as source of truth)...")
    await qdrant_service.ensure_collection()

    async with AsyncSessionLocal() as db:
        # Fetch active FAQs and their associated organization ID
        # We do NOT join with DomainCategory, meaning we process FAQs 
        # even if their category isn't mapped to any domain yet.
        stmt = (
            select(FAQQuestion, FAQCategory.organization_id)
            .join(FAQCategory, FAQQuestion.faq_id == FAQCategory.id)
            .where(FAQQuestion.status == "active")
        )
        result = await db.execute(stmt)
        records = result.all()

    print(f"Found {len(records)} active FAQs in PostgreSQL.")

    ok = 0
    updated = 0
    deduped = 0
    created = 0
    fail = 0
    
    for q, org_id in records:
        try:
            expected_text = _build_embed_text(q.question, q.answer, q.aliases or [])
            
            # 1. Verify whether a vector already exists
            existing_points, _ = await qdrant_service.client.scroll(
                collection_name=qdrant_service.collection_name,
                scroll_filter=Filter(
                    must=[FieldCondition(key="question_id", match=MatchValue(value=q.id))]
                ),
                with_payload=True,
                limit=100
            )

            if not existing_points:
                # 2. If missing -> create it
                vector = await ollama_service.generate_embedding(expected_text)
                await qdrant_service.add_chunk(
                    tenant_id=org_id,
                    domain_id="",
                    text=expected_text,
                    vector=vector,
                    metadata={
                        "category_id": q.faq_id,
                        "question_id": q.id,
                        "source_type": "FAQ",
                        "question": q.question,
                        "answer": q.answer,
                        "aliases": q.aliases or [],
                        "is_active": True
                    }
                )
                print(f"  [CREATED] {q.question[:40]}...")
                created += 1
            else:
                # Sort points to prefer the one with the best payload and newest updated_at
                def score_point(p):
                    payload = p.payload or {}
                    score = 0
                    if "is_active" in payload: score += 10
                    if "aliases" in payload: score += 10
                    if "source_type" in payload: score += 5
                    updated_at = payload.get("updated_at", "")
                    return (score, updated_at)

                existing_points.sort(key=score_point, reverse=True)
                primary_point = existing_points[0]

                # 3. If present -> verify if content OR payload changed
                payload = primary_point.payload or {}
                actual_text = payload.get("text", "")
                actual_category = payload.get("category_id", "")
                actual_source = payload.get("source_type")
                actual_is_active = payload.get("is_active")
                actual_aliases = payload.get("aliases", [])
                
                needs_repair = False
                if actual_text != expected_text:
                    needs_repair = True
                elif actual_category != q.faq_id:
                    needs_repair = True
                elif actual_source is None:
                    needs_repair = True
                elif actual_is_active is None:
                    needs_repair = True
                elif actual_aliases != (q.aliases or []):
                    needs_repair = True
                
                if needs_repair:
                    # Content/Payload changed, need to rebuild
                    await qdrant_service.delete_chunks_by_question_id(q.id)
                    vector = await ollama_service.generate_embedding(expected_text)
                    await qdrant_service.add_chunk(
                        tenant_id=org_id,
                        domain_id="",
                        text=expected_text,
                        vector=vector,
                        metadata={
                            "category_id": q.faq_id,
                            "question_id": q.id,
                            "source_type": "FAQ",
                            "question": q.question,
                            "answer": q.answer,
                            "aliases": q.aliases or [],
                            "is_active": True
                        }
                    )
                    print(f"  [UPDATED] {q.question[:40]}... (Content or payload repaired)")
                    updated += 1
                else:
                    # Content matches perfectly. Check for duplicates.
                    if len(existing_points) > 1:
                        # 4. Delete duplicates if any
                        duplicate_ids = [p.id for p in existing_points[1:]]
                        await qdrant_service.client.delete(
                            collection_name=qdrant_service.collection_name,
                            points_selector=duplicate_ids
                        )
                        print(f"  [DEDUPED] {q.question[:40]}... (Removed {len(duplicate_ids)} duplicates)")
                        deduped += 1
                    else:
                        ok += 1

        except Exception as e:
            print(f"  [ERROR] [{q.id}] {q.question[:40]} — {e}")
            fail += 1

    print(f"\nDone. {created} created, {updated} updated, {deduped} deduplicated, {ok} verified ok, {fail} failed.")


if __name__ == "__main__":
    asyncio.run(main())
