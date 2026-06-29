import asyncio
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from database.database import AsyncSessionLocal
from database.models import Domain, DomainCategory
from sqlalchemy import select
from routers.chatbot_routes import search_faqs_fts

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Domain).limit(1))
        domain = res.scalar_one_or_none()
        
        cat_res = await db.execute(
            select(DomainCategory.category_id).where(DomainCategory.domain_id == domain.id)
        )
        category_ids = list(cat_res.scalars().all())
        print(f"Category IDs for domain: {category_ids}")

        query = "Can I get a refund?"
        emb = await ollama_service.generate_embedding(query)
        chunks = await qdrant_service.search_chunks(
            tenant_id=domain.organization_id,
            query_vector=emb,
            category_ids=category_ids,
            domain_id=domain.id,
            limit=5
        )
        print(f"\n--- QDRANT Scores for '{query}' ---")
        for i, chunk in enumerate(chunks):
            print(f"{i+1}. Score: {chunk.score:.4f} | Type: {chunk.source_type}")
            print(f"Content: {chunk.content[:100]}...\n")
            
        print(f"\n--- FTS Scores for '{query}' ---")
        fts_chunks = await search_faqs_fts(db, domain.id, query, limit=5)
        for i, chunk in enumerate(fts_chunks):
            print(f"{i+1}. Score: {chunk.score:.4f} | Type: {chunk.source_type}")
            print(f"Content: {chunk.content[:100]}...\n")

if __name__ == "__main__":
    asyncio.run(main())
