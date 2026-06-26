import asyncio
from database.database import AsyncSessionLocal
from database.models import FAQQuestion
from sqlalchemy.future import select

async def main():
    cat_ids = ['b247d0ae-ea13-45ca-8885-1c1f87ac29ab', 'd2d19328-ae54-4ca7-b81c-3b8ac24cfb4a', 'f0422a2c-2fb0-48c1-a0ce-f758269fa7d7', '5dc2f7d5-611f-43f2-be63-8079e637773f', 'a94c8628-c5cb-4f79-ad95-1b7cd08e38d4', '69bcb1f1-46a6-4302-8817-92e47d000f21', '454dc08b-1952-45b6-b09f-5d05fc79a5f0', '7a5e8067-4125-45b1-866a-8e73ddce9db4']
    
    async with AsyncSessionLocal() as db:
        stmt = select(FAQQuestion).where(FAQQuestion.faq_id.in_(cat_ids))
        res = await db.execute(stmt)
        faqs = res.scalars().all()
        
    print(f"Total FAQs in these categories: {len(faqs)}")
    for f in faqs:
        if "trial" in f.answer.lower() or "rag" in f.answer.lower():
            print(f"- Q: {f.question}\n  A: {f.answer[:150]}...")

if __name__ == "__main__":
    asyncio.run(main())
