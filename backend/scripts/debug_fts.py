import asyncio
from database.database import AsyncSessionLocal
from routers.chatbot_routes import search_faqs_fts
from database.models import Domain
from sqlalchemy import select

async def run():
    async with AsyncSessionLocal() as db:
        stmt = select(Domain).limit(1)
        domain = (await db.execute(stmt)).scalar_one_or_none()
        
        query = "How do I install the widget?"
        print(f"Testing FTS for: {query}")
        results = await search_faqs_fts(db, domain.id, query)
        print(f"Results: {results}")

if __name__ == "__main__":
    asyncio.run(run())
