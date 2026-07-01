import asyncio
import sys
import os
from sqlalchemy.future import select

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database.database import AsyncSessionLocal
from database.models import Domain

async def main():
    async with AsyncSessionLocal() as db:
        stmt = select(Domain.widget_key).limit(1)
        r = await db.execute(stmt)
        key = r.scalar_one_or_none()
        print(f"Widget Key: {key}")

if __name__ == "__main__":
    asyncio.run(main())
