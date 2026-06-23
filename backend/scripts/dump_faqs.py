import asyncio
from database.database import AsyncSessionLocal
from database.models import FAQQuestion
from sqlalchemy import select

async def run():
    async with AsyncSessionLocal() as db:
        stmt = select(FAQQuestion)
        res = await db.execute(stmt)
        faqs = res.scalars().all()
        for f in faqs:
            print(f"ID: {f.id}")
            print(f"Q: {f.question}")
            print(f"Aliases: {f.aliases}")
            print("-" * 20)

if __name__ == "__main__":
    asyncio.run(run())
