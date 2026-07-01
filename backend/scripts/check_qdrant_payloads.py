import asyncio
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.qdrant_service import qdrant_service

async def main():
    await qdrant_service.ensure_collection()
    
    res = await qdrant_service.client.scroll(
        collection_name=qdrant_service.collection_name,
        limit=5,
        with_payload=True
    )
    for point in res[0]:
        print(f"Point ID: {point.id}")
        print(f"Payload: {point.payload}")
        print("-" * 40)

if __name__ == "__main__":
    asyncio.run(main())
