import asyncio
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.qdrant_service import qdrant_service
from qdrant_client.models import FilterSelector, Filter

async def main():
    print("Connecting to Qdrant...")
    await qdrant_service.ensure_collection()
    
    print("Setting is_active=True for all existing chunks...")
    try:
        await qdrant_service.client.set_payload(
            collection_name=qdrant_service.collection_name,
            payload={"is_active": True},
            points=FilterSelector(
                filter=Filter()
            )
        )
        print("Done!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
