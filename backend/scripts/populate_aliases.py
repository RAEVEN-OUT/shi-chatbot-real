import asyncio
from database.database import AsyncSessionLocal
from database.models import FAQQuestion
from sqlalchemy import select, update

async def run():
    async with AsyncSessionLocal() as db:
        # Install widget aliases
        await db.execute(
            update(FAQQuestion)
            .where(FAQQuestion.question == "How do I install the widget?")
            .values(aliases=["install widget", "widget installation", "embed chatbot", "add chatbot to website", "how to install widget"])
        )
        
        # What is SHI Chatbot aliases
        await db.execute(
            update(FAQQuestion)
            .where(FAQQuestion.question == "What is SHI Chatbot?")
            .values(aliases=["tell me abt shi chatbot", "what does shi chatbot do", "it uses wht"])
        )
        
        # Free trial aliases
        await db.execute(
            update(FAQQuestion)
            .where(FAQQuestion.question == "Is there a free trial?")
            .values(aliases=["free trial", "trial period", "how many days", "do you provide free trial", "you have free trial"])
        )
        
        await db.commit()
        print("Aliases updated successfully.")

if __name__ == "__main__":
    asyncio.run(run())
