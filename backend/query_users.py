import asyncio
from sqlalchemy.future import select
from database.database import AsyncSessionLocal
from database.models import User

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        print(f"Found {len(users)} users:")
        for u in users:
            print(f"- ID: {u.id}, Email: {u.email}, Name: {u.name}, Firebase UID: {u.firebase_uid}")

if __name__ == "__main__":
    asyncio.run(main())
