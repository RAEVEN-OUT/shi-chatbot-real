import asyncio
import json
from database.database import AsyncSessionLocal
from database.models import Domain
from sqlalchemy import select

async def run():
    db = AsyncSessionLocal()
    result = await db.execute(select(Domain))
    domains = result.scalars().all()
    print("Found", len(domains), "domains:")
    for d in domains:
        print(f"Name: {d.domain_name}, ID: {d.id}, WidgetKey: {d.widget_key}")
        print(f"Settings: {json.dumps(d.settings)}")
        print("-" * 40)
    await db.close()

if __name__ == "__main__":
    asyncio.run(run())
