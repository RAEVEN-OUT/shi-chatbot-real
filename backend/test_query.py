import asyncio
from database.database import AsyncSessionLocal
from database.models import Domain
from sqlalchemy import select

async def run():
    db = AsyncSessionLocal()
    x_api_key = "4a08ea55-a352-4b08-afd6-3a9c021ca1bc"
    stmt = select(Domain).where(
        (Domain.widget_key == x_api_key) | (Domain.id == x_api_key)
    )
    try:
        result = await db.execute(stmt)
        domain = result.scalar_one_or_none()
        if domain:
            print(f"Found domain: {domain.domain_name}")
        else:
            print("Domain not found")
    except Exception as e:
        print(f"Exception: {e}")
    await db.close()

if __name__ == "__main__":
    asyncio.run(run())
