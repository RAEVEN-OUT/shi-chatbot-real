import asyncio
import os
import sys

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database.database import AsyncSessionLocal
from database.models import FAQQuestion, FAQCategory
from sqlalchemy.future import select
from services.ollama_service import ollama_service
from services.qdrant_service import qdrant_service

async def main():
    print("Starting Qdrant backfill...")
    async with AsyncSessionLocal() as db:
        # Fetch all active questions along with their categories to get the organization_id
        stmt = select(FAQQuestion, FAQCategory.organization_id).join(
            FAQCategory, FAQQuestion.faq_id == FAQCategory.id
        ).where(FAQQuestion.status == 'active')
        
        result = await db.execute(stmt)
        records = result.all()
        
        print(f"Found {len(records)} active FAQ questions to backfill.")
        
        for q, org_id in records:
            print(f"Embedding question {q.id}...")
            try:
                text_to_embed = q.question
                full_text = f"Q: {q.question}\nA: {q.answer}"
                vector = await ollama_service.generate_embedding(text_to_embed)
                # Pass q.faq_id as domain_id as per the fix in faq_question_routes.py
                await qdrant_service.add_chunk(
                    tenant_id=org_id,
                    domain_id=q.faq_id, 
                    text=full_text,
                    vector=vector,
                    metadata={
                        "category_id": q.faq_id, 
                        "question_id": q.id, 
                        "type": "faq", 
                        "question": q.question, 
                        "answer": q.answer
                    }
                )
                print(f"Successfully re-indexed question {q.id}.")
            except Exception as e:
                print(f"Failed to re-index question {q.id}: {e}")
                
    print("Backfill complete.")

if __name__ == "__main__":
    asyncio.run(main())
