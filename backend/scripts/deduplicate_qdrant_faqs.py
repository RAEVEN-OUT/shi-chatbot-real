import asyncio
import os
import sys
from collections import defaultdict

# Ensure backend directory is in the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.qdrant_service import qdrant_service
from qdrant_client.models import Filter, FieldCondition, MatchAny

def score_payload(point):
    """
    Assign a score to the payload to determine how 'new' or complete it is.
    We prefer keeping the vector with the newest payload schema.
    """
    score = 0
    payload = point.payload or {}
    
    # Give points for fields introduced in newer iterations
    if "is_active" in payload:
        score += 10
    if "aliases" in payload:
        score += 10
    if "source_type" in payload:
        score += 5
    if "question" in payload:
        score += 5
    if "answer" in payload:
        score += 5
        
    # Additional tie-breaker: overall payload length
    score += len(payload)
    return score

async def main():
    print("Starting deduplication of FAQ vectors in Qdrant...")
    
    await qdrant_service.ensure_collection()
    
    collection_name = qdrant_service.collection_name
    client = qdrant_service.client

    # Fetch all FAQ vectors
    scroll_filter = Filter(
        must=[
            FieldCondition(key="source_type", match=MatchAny(any=["FAQ", "faq"]))
        ]
    )

    offset = None
    points_by_qid = defaultdict(list)
    total_scanned = 0

    print("Fetching vectors from Qdrant...")
    while True:
        points, offset = await client.scroll(
            collection_name=collection_name,
            scroll_filter=scroll_filter,
            limit=500,
            offset=offset,
            with_payload=True,
            with_vectors=False
        )

        for p in points:
            total_scanned += 1
            q_id = p.payload.get("question_id")
            if q_id:
                points_by_qid[q_id].append(p)

        if offset is None:
            break

    print(f"Scanned {total_scanned} FAQ vectors across {len(points_by_qid)} unique question IDs.")

    total_deleted = 0
    deduped_questions = 0

    print("Analyzing for duplicates...")
    for q_id, grouped_points in points_by_qid.items():
        if len(grouped_points) == 1:
            # Only one vector exists: skip
            continue

        # Multiple vectors exist
        deduped_questions += 1
        
        # Sort points by payload score descending (highest score first)
        grouped_points.sort(key=score_payload, reverse=True)
        
        # Keep the first one, delete the rest
        points_to_delete = grouped_points[1:]
        ids_to_delete = [p.id for p in points_to_delete]
        
        # Delete from Qdrant
        await client.delete(
            collection_name=collection_name,
            points_selector=ids_to_delete
        )
        
        total_deleted += len(ids_to_delete)
        print(f"  [QID: {q_id}] Kept 1 vector, deleted {len(ids_to_delete)} duplicates.")

    print("\n=== Deduplication Summary ===")
    print(f"Total Unique Questions Processed: {len(points_by_qid)}")
    print(f"Questions Requiring Deduplication: {deduped_questions}")
    print(f"Total Duplicate Vectors Removed: {total_deleted}")

if __name__ == "__main__":
    asyncio.run(main())
