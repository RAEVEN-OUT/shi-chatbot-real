import asyncio
import os
import sys

# Ensure backend directory is in the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.qdrant_service import qdrant_service
from qdrant_client.models import Filter, FieldCondition, MatchAny

async def main():
    print("Starting migration: setting is_active=True for legacy FAQ vectors...")
    
    await qdrant_service.ensure_collection()
    
    collection_name = qdrant_service.collection_name
    client = qdrant_service.client

    # Filter for all FAQ vectors (handling both cases just in case)
    scroll_filter = Filter(
        must=[
            FieldCondition(key="source_type", match=MatchAny(any=["FAQ", "faq"]))
        ]
    )

    offset = None
    total_processed = 0
    total_updated = 0

    while True:
        points, offset = await client.scroll(
            collection_name=collection_name,
            scroll_filter=scroll_filter,
            limit=100,
            offset=offset,
            with_payload=True,
            with_vectors=False
        )

        if not points:
            break

        points_to_update = []
        for point in points:
            total_processed += 1
            # Detect payload missing 'is_active'
            if "is_active" not in point.payload:
                points_to_update.append(point.id)

        if points_to_update:
            # Update payload in bulk using set_payload()
            await client.set_payload(
                collection_name=collection_name,
                payload={"is_active": True},
                points=points_to_update
            )
            total_updated += len(points_to_update)
            print(f"Updated {len(points_to_update)} missing is_active payloads in current batch.")

        if offset is None:
            break

    print(f"\nMigration complete.")
    print(f"Total FAQ vectors scanned: {total_processed}")
    print(f"Total vectors updated with is_active=True: {total_updated}")

if __name__ == "__main__":
    asyncio.run(main())
