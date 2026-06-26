import asyncio
from sqlalchemy.future import select
from database.database import AsyncSessionLocal
from database.models import FAQQuestion, FAQCategory, DomainCategory

async def main():
    domain_id = "4a08ea55-a352-4b08-afd6-3a9c021ca1bc"
    async with AsyncSessionLocal() as session:
        stmt = (
            select(FAQQuestion.question)
            .join(FAQCategory, FAQQuestion.faq_id == FAQCategory.id)
            .join(DomainCategory, FAQCategory.id == DomainCategory.category_id)
            .where(DomainCategory.domain_id == domain_id)
            .limit(1)
        )
        res = await session.execute(stmt)
        q = res.scalar()
        print(f"Found question: {q}")

if __name__ == "__main__":
    asyncio.run(main())
