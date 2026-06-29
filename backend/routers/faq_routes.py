from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from database.database import get_db
from database.models import FAQ, Domain
from services.qdrant_service import qdrant_service
from services.ollama_service import ollama_service
from services.redis_service import redis_service

router = APIRouter(prefix="/api/faqs", tags=["faqs"])

class FAQCreate(BaseModel):
    domain_id: str
    question: str
    answer: str

@router.post("/")
async def create_faq(faq_data: FAQCreate, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    # 1. Verify Domain exists
    stmt = select(Domain).where(Domain.id == faq_data.domain_id)
    result = await db.execute(stmt)
    domain = result.scalar_one_or_none()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")

    tenant_id = domain.organization_id

    # 2. Store FAQ in Postgres
    new_faq = FAQ(
        domain_id=faq_data.domain_id,
        question=faq_data.question,
        answer=faq_data.answer
    )
    db.add(new_faq)
    await db.commit()
    await db.refresh(new_faq)

    # 3. Generate Embeddings using Ollama (nomic-embed-text)
    chunk_text = f"Question: {faq_data.question}\nAnswer: {faq_data.answer}"
    try:
        vector = await ollama_service.generate_embedding(chunk_text)
        
        # 4. Insert into Qdrant knowledge_chunks
        await qdrant_service.ensure_collection()
        await qdrant_service.add_chunk(
            tenant_id=tenant_id,
            domain_id=faq_data.domain_id,
            text=chunk_text,
            vector=vector,
            metadata={"source_type": "faq", "faq_id": new_faq.id, "question": faq_data.question, "answer": faq_data.answer}
        )
    except Exception as e:
        # If Qdrant/Ollama fails, rollback might be necessary, but for now we just return the error.
        raise HTTPException(status_code=500, detail=f"FAQ saved to DB, but Vector sync failed: {str(e)}")

    background_tasks.add_task(redis_service.delete_domain_capabilities, faq_data.domain_id)
    return {"status": "success", "faq": {"id": new_faq.id, "question": new_faq.question, "answer": new_faq.answer}}
