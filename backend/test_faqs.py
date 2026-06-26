import asyncio
from database.database import AsyncSessionLocal
from database.models import DomainCategory, FAQCategory, FAQQuestion
from sqlalchemy.future import select

async def main():
    domain_id = "4a08ea55-a352-4b08-afd6-3a9c021ca1bc"
    
    async with AsyncSessionLocal() as db:
        stmt = (
            select(FAQQuestion)
            .join(FAQCategory, FAQQuestion.faq_id == FAQCategory.id)
            .join(DomainCategory, FAQCategory.id == DomainCategory.category_id)
            .where(DomainCategory.domain_id == domain_id)
        )
        res = await db.execute(stmt)
        faqs = res.scalars().all()
        
    print(f"Total FAQs in PG for domain: {len(faqs)}")
    for f in faqs:
        print(f"- Q: {f.question}\n  A: {f.answer[:50]}...")

if __name__ == "__main__":
    asyncio.run(main())
