import asyncio
from services.qdrant_service import qdrant_service
from database.database import AsyncSessionLocal
from database.models import Domain

async def main():
    domain_id = "4a08ea55-a352-4b08-afd6-3a9c021ca1bc"
    
    async with AsyncSessionLocal() as db:
        domain = await db.get(Domain, domain_id)
        tenant_id = domain.organization_id
        
    print(f"Tenant ID: {tenant_id}")
    
    # We will search with a generic vector to get chunks
    vector = [0.1] * 768
    chunks = await qdrant_service.search_chunks(tenant_id, vector, domain_id=domain_id, limit=10)
    print(f"Found {len(chunks)} chunks.")
    for i, c in enumerate(chunks):
        print(f"{i}: {c.get('payload', {}).get('question')} (Score: {c.get('score')})")

if __name__ == "__main__":
    asyncio.run(main())
