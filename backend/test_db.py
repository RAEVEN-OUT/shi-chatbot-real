import asyncio
from database.database import AsyncSessionLocal
from sqlalchemy import text
from database.models import ChatMessage

async def test():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT id, next_sequence FROM chat_sessions LIMIT 1"))
        row = res.fetchone()
        print("Session row:", row)
        if row:
            session_id = row[0]
            try:
                seq_res = await db.execute(
                    text("UPDATE chat_sessions SET next_sequence = next_sequence + 1 WHERE id = :id RETURNING next_sequence"),
                    {"id": session_id}
                )
                val = seq_res.scalar()
                print("Next seq:", val)
                
                # try to insert a message
                msg = ChatMessage(session_id=session_id, sender="test", message="test", sequence=val, status="completed")
                db.add(msg)
                await db.commit()
                print("Insert successful!")
            except Exception as e:
                print("Error:", e)

asyncio.run(test())
