import asyncio
from database.database import AsyncSessionLocal
from database.models import Domain

async def main():
    async with AsyncSessionLocal() as db:
        domain = await db.get(Domain, "4a08ea55-a352-4b08-afd6-3a9c021ca1bc")
        print(f"Settings: {domain.settings}")

if __name__ == "__main__":
    asyncio.run(main())
