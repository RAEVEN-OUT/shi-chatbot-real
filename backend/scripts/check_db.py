import asyncio
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database.database import AsyncSessionLocal
from database.models import DocumentSource
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as s:
        res = await s.execute(select(DocumentSource.filename, DocumentSource.is_active).where(DocumentSource.domain_id=='39202541-126f-42b3-b0eb-967dfe381a86'))
        print(res.all())

if __name__ == "__main__":
    asyncio.run(main())
