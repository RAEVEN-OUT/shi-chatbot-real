import asyncio
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.qdrant_service import qdrant_service
from qdrant_client.models import Filter, FieldCondition, MatchValue

async def main():
    await qdrant_service.ensure_collection()
    
    print("--- Testing is_active=True ---")
    results_true, _ = await qdrant_service.client.scroll(
        collection_name=qdrant_service.collection_name,
        scroll_filter=Filter(
            must=[
                FieldCondition(
                    key="is_active",
                    match=MatchValue(value=True)
                )
            ]
        ),
        limit=10,
        with_payload=True
    )
    for point in results_true:
        print(f"Point {point.id} is_active: {point.payload.get('is_active')}")

    print("\n--- Testing is_active=False ---")
    results_false, _ = await qdrant_service.client.scroll(
        collection_name=qdrant_service.collection_name,
        scroll_filter=Filter(
            must=[
                FieldCondition(
                    key="is_active",
                    match=MatchValue(value=False)
                )
            ]
        ),
        limit=10,
        with_payload=True
    )
    for point in results_false:
        print(f"Point {point.id} is_active: {point.payload.get('is_active')}")

if __name__ == "__main__":
    asyncio.run(main())
