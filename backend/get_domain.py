import asyncio
from database.database import AsyncSessionLocal
from sqlalchemy import text

async def get_domain():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT id FROM domains LIMIT 1"))
        row = res.fetchone()
        print("Domain id:", row[0] if row else None)

asyncio.run(get_domain())
