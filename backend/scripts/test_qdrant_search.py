import asyncio
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.qdrant_service import qdrant_service
from qdrant_client.models import Filter, FieldCondition, MatchValue

async def main():
    await qdrant_service.ensure_collection()
    
    dummy_vector = [0.0] * 768
    
    print("--- Searching with is_active=True ---")
    results_true = await qdrant_service.client.search(
        collection_name=qdrant_service.collection_name,
        query_vector=dummy_vector,
        query_filter=Filter(
            must=[
                FieldCondition(
                    key="document_source_id",
                    match=MatchValue(value="73399578-4018-444d-8924-4934002d9acf") # GoChat document
                ),
                FieldCondition(
                    key="is_active",
                    match=MatchValue(value=True)
                )
            ]
        ),
        limit=10
    )
    print(f"Results found: {len(results_true)}")

    print("\n--- Searching with is_active=False ---")
    results_false = await qdrant_service.client.search(
        collection_name=qdrant_service.collection_name,
        query_vector=dummy_vector,
        query_filter=Filter(
            must=[
                FieldCondition(
                    key="document_source_id",
                    match=MatchValue(value="73399578-4018-444d-8924-4934002d9acf")
                ),
                FieldCondition(
                    key="is_active",
                    match=MatchValue(value=False)
                )
            ]
        ),
        limit=10
    )
    print(f"Results found: {len(results_false)}")
    for r in results_false:
        print(f"ID: {r.id}, is_active: {r.payload.get('is_active')}")
        
    print("\n--- Checking chunks count via scroll for GoChat ---")
    res, _ = await qdrant_service.client.scroll(
        collection_name=qdrant_service.collection_name,
        scroll_filter=Filter(
            must=[
                FieldCondition(
                    key="document_source_id",
                    match=MatchValue(value="73399578-4018-444d-8924-4934002d9acf")
                )
            ]
        ),
        limit=100,
        with_payload=True
    )
    print(f"Total chunks for GoChat: {len(res)}")
    for p in res:
        print(f"Chunk index: {p.payload.get('chunk_index')}, is_active: {p.payload.get('is_active')}")

if __name__ == "__main__":
    asyncio.run(main())
