import asyncio
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database.database import AsyncSessionLocal
from database.models import DocumentSource
from sqlalchemy import update

async def main():
    async with AsyncSessionLocal() as s:
        await s.execute(update(DocumentSource).where(DocumentSource.is_active.is_(None)).values(is_active=True))
        await s.commit()
        print("Updated NULL to True")

if __name__ == "__main__":
    asyncio.run(main())
