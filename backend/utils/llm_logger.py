from database.database import AsyncSessionLocal
from database.models import FailedQuestion

async def log_failed_question(domain_id: str, question: str, ai_response: str, reason: str):
    async with AsyncSessionLocal() as session:
        fq = FailedQuestion(
            domain_id=domain_id,
            question=question,
            ai_response=ai_response,
            failure_reason=reason
        )
        session.add(fq)
        await session.commit()
