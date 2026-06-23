import asyncio
import sys
import os

sys.path.append(os.path.abspath('d:/Projects/shi-chatbot-real/backend'))

from database.database import AsyncSessionLocal
from database.models import Domain
from sqlalchemy.future import select

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Domain).limit(1))
        domain = result.scalar_one_or_none()
        print(f"Domain ID: {domain.id if domain else 'None'}")

if __name__ == "__main__":
    asyncio.run(main())
