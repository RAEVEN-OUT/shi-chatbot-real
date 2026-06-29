import asyncio
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from database.database import AsyncSessionLocal
from database.models import Domain
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Domain).limit(1))
        domain = res.scalar_one_or_none()
        query = "What is Go Ride?"
        emb = await ollama_service.generate_embedding(query)
        chunks = await qdrant_service.search_chunks(
            tenant_id=domain.organization_id,
            query_vector=emb,
            domain_id=domain.id,
            limit=5
        )
        print(f"Scores for '{query}':")
        for i, chunk in enumerate(chunks):
            print(f"{i+1}. Score: {chunk.score:.4f} | Type: {chunk.source_type}")

if __name__ == "__main__":
    asyncio.run(main())
