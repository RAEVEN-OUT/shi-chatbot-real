import asyncio
import os
import sys
from collections import defaultdict

# Ensure backend directory is in the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.database import AsyncSessionLocal
from database.models import FAQQuestion
from sqlalchemy.future import select
from services.qdrant_service import qdrant_service
from qdrant_client.models import Filter, FieldCondition, MatchAny

REQUIRED_FIELDS = ["tenant_id", "category_id", "question_id", "source_type", "is_active"]

async def main():
    print("Starting read-only FAQ diagnostic health-check...")
    
    # 1. Fetch active FAQs from PostgreSQL
    async with AsyncSessionLocal() as db:
        stmt = select(FAQQuestion.id, FAQQuestion.question).where(FAQQuestion.status == "active")
        result = await db.execute(stmt)
        active_faqs = {row.id: row.question for row in result.all()}
    
    total_active_faqs = len(active_faqs)
    print(f"[PostgreSQL] Found {total_active_faqs} active FAQs.")

    # 2. Fetch FAQ vectors from Qdrant
    await qdrant_service.ensure_collection()
    client = qdrant_service.client
    collection_name = qdrant_service.collection_name

    scroll_filter = Filter(
        must=[
            FieldCondition(key="source_type", match=MatchAny(any=["FAQ", "faq"]))
        ]
    )

    offset = None
    qdrant_points = []

    print("[Qdrant] Fetching FAQ vectors...")
    while True:
        points, offset = await client.scroll(
            collection_name=collection_name,
            scroll_filter=scroll_filter,
            limit=500,
            offset=offset,
            with_payload=True,
            with_vectors=False
        )

        qdrant_points.extend(points)

        if offset is None:
            break

    total_faq_vectors = len(qdrant_points)
    print(f"[Qdrant] Found {total_faq_vectors} FAQ vectors.")

    # 3. Analyze Data
    points_by_qid = defaultdict(list)
    missing_payload_fields_count = 0

    for point in qdrant_points:
        payload = point.payload or {}
        q_id = payload.get("question_id")
        
        # Track by question_id
        if q_id:
            points_by_qid[q_id].append(point)
        else:
            # Vectors completely missing a question_id (these are extreme orphans)
            points_by_qid["UNKNOWN"].append(point)

        # Check payload compliance
        if any(field not in payload for field in REQUIRED_FIELDS):
            missing_payload_fields_count += 1

    # Missing vectors: Active in DB, but no associated vectors in Qdrant
    missing_vectors = [q_id for q_id in active_faqs if q_id not in points_by_qid]
    
    # Duplicate vectors: More than 1 vector for a single question_id
    duplicate_vectors = {q_id: len(pts) for q_id, pts in points_by_qid.items() if len(pts) > 1 and q_id != "UNKNOWN"}

    # Orphaned vectors: In Qdrant, but not active/present in PostgreSQL
    orphaned_qids = [q_id for q_id in points_by_qid if q_id != "UNKNOWN" and q_id not in active_faqs]
    orphaned_vectors_count = sum(len(points_by_qid[q_id]) for q_id in orphaned_qids) + len(points_by_qid.get("UNKNOWN", []))

    # 4. Generate Report
    print("\n" + "="*40)
    print(" FAQ DIAGNOSTIC HEALTH-CHECK REPORT ")
    print("="*40)
    print(f"Total active FAQs (PostgreSQL):       {total_active_faqs}")
    print(f"Total FAQ vectors (Qdrant):           {total_faq_vectors}")
    print("-" * 40)
    print(f"Missing vectors:                      {len(missing_vectors)}")
    print(f"Question IDs with duplicates:         {len(duplicate_vectors)} (Total redundant vectors: {sum(duplicate_vectors.values()) - len(duplicate_vectors) if duplicate_vectors else 0})")
    print(f"Vectors missing required payload:     {missing_payload_fields_count}")
    print(f"Orphaned vectors:                     {orphaned_vectors_count}")
    print("="*40)

if __name__ == "__main__":
    asyncio.run(main())
