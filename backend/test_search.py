import asyncio
from database.database import AsyncSessionLocal
from database.models import Domain
from routers.chatbot_routes import search_faqs_fts
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service

async def main():
    domain_id = "4a08ea55-a352-4b08-afd6-3a9c021ca1bc"
    query = "can i get a 14 days free trial"
    
    async with AsyncSessionLocal() as db:
        domain = await db.get(Domain, domain_id)
        
        category_ids = await redis_service.get_domain_categories(domain.id)
        print(f"Category IDs: {category_ids}")
        
        vector = await ollama_service.generate_embedding(query)
        
        qdrant_chunks = await qdrant_service.search_chunks(
            tenant_id=domain.organization_id,
            query_vector=vector,
            category_ids=category_ids,
            domain_id=domain.id,
            limit=3
        )
        
        fts_chunks = await search_faqs_fts(db, domain.id, query, limit=3)
        
        print(f"FTS Chunks: {len(fts_chunks)}")
        print(f"Qdrant Chunks: {len(qdrant_chunks)}")
        
        top_chunks = []
        for chunk in fts_chunks + qdrant_chunks:
            top_chunks.append(chunk)
            print(f"Chunk Score: {chunk.get('score')} | Q: {chunk.get('payload', {}).get('question')}")

if __name__ == "__main__":
    asyncio.run(main())
