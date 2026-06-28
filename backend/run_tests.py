import asyncio
import httpx
from fastapi import FastAPI
from sqlalchemy.future import select
from main import app
from core.firebase_auth import get_current_user
from database.database import AsyncSessionLocal as async_session
from database.models import User, Domain, FAQCategory, FAQQuestion, FailedQuestion
from services.qdrant_service import qdrant_service

async def override_get_current_user():
    async with async_session() as db:
        # Find any user
        stmt = select(User).limit(1)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            raise Exception("No user found in DB to test with")
            
        return {
            "uid": user.firebase_uid,
            "email": user.email,
            "name": user.name,
            "role": user.role,

            "is_active": user.is_active,
            "postgres_user": user
        }

app.dependency_overrides[get_current_user] = override_get_current_user

async def run_tests():
    print("Starting tests...")
    
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        # 0. Get initial audit log count
        print("0. Getting initial audit log count...")
        resp = await client.get("/audit-logs")
        assert resp.status_code == 200, f"Failed to get audit logs: {resp.text}"
        initial_log_count = resp.json()["total"]
        print(f"   Initial audit log count: {initial_log_count}")
        
        # 1. Test Create Category
        print("1. Creating FAQ Category...")
        resp = await client.post("/faq-categories", json={"faq_title": "Test Category XYZ"})
        assert resp.status_code == 200, f"Failed to create category: {resp.text}"
        cat_data = resp.json()["category"]
        cat_id = cat_data["id"]
        print(f"   Success! Category ID: {cat_id}")
        
        # 2. Test Create FAQ
        print("2. Creating FAQ Question...")
        resp = await client.post("/faq-questions", json={
            "faq_id": cat_id,
            "question": "What is the test question?",
            "answer": "This is the test answer.",
            "aliases": ["Test alias 1", "Test alias 2"]
        })
        assert resp.status_code == 200, f"Failed to create FAQ: {resp.text}"
        faq_data = resp.json()["question"]
        faq_id = faq_data["id"]
        print(f"   Success! FAQ ID: {faq_id}")
        
        # Check Qdrant for this FAQ
        print("   Verifying Qdrant insertion...")
        # We can search Qdrant via qdrant_service directly
        async with async_session() as db:
            stmt = select(User).limit(1)
            result = await db.execute(stmt)
            user = result.scalar_one_or_none()
            org_id = user.organization_id
            
        # Search Qdrant for the exact text
        from services.ollama_service import ollama_service
        embed = await ollama_service.generate_embedding("What is the test question?")
        q_results = await qdrant_service.search_chunks(org_id, embed, limit=5)
        found = any(r.get("question_id") == faq_id for r in q_results)
        print(f"   Qdrant verification (Create): {'PASSED' if found else 'FAILED'}")
        
        # 3. Test Edit FAQ
        print("3. Editing FAQ Question...")
        resp = await client.put(f"/faq-questions/{faq_id}", json={
            "question": "What is the UPDATED test question?",
            "answer": "This is the UPDATED test answer.",
            "aliases": []
        })
        assert resp.status_code == 200, f"Failed to update FAQ: {resp.text}"
        print("   Success! FAQ Updated.")
        
        # Verify Qdrant update
        print("   Verifying Qdrant update...")
        embed2 = await ollama_service.generate_embedding("What is the UPDATED test question?")
        q_results2 = await qdrant_service.search_chunks(org_id, embed2, limit=5)
        found_update = any(r.get("question_id") == faq_id for r in q_results2)
        print(f"   Qdrant verification (Update): {'PASSED' if found_update else 'FAILED'}")
        
        # 4. Failed FAQ - Insert fake failed query manually
        print("4. Testing Failed FAQ flows...")
        async with async_session() as db:
            fake_failed = FailedQuestion(
                domain_id=(await db.execute(select(Domain).limit(1))).scalar_one_or_none().id,
                question="Why did the test fail?",
                ai_response="I don't know.",
                failure_reason="NO_MATCH",
                is_spam=False
            )
            db.add(fake_failed)
            await db.commit()
            await db.refresh(fake_failed)
            failed_id = fake_failed.id
        print(f"   Inserted fake FailedQuestion ID: {failed_id}")
        
        # Promote to Spam
        print("   Promoting to spam...")
        resp = await client.post(f"/failed-questions/{failed_id}/spam")
        assert resp.status_code == 200, f"Failed to mark as spam: {resp.text}"
        print("   Success! Marked as spam.")
        
        # Verify in DB
        async with async_session() as db:
            stmt = select(FailedQuestion).where(FailedQuestion.id == failed_id)
            res = await db.execute(stmt)
            fq = res.scalar_one()
            assert fq.is_spam == True, "Failed question not marked as spam in DB"
            
        # Delete Spam
        print("   Deleting spam question...")
        resp = await client.delete(f"/spam-questions/{failed_id}")
        assert resp.status_code == 200, f"Failed to delete spam: {resp.text}"
        print("   Success! Spam deleted.")
        
        # Clean up category and FAQ
        print("Cleaning up test data...")
        await client.delete(f"/faq-questions/{faq_id}")
        await client.delete(f"/faq-categories/{cat_id}")
        print("Done!")

        # 5. Test Analytics
        print("5. Testing Analytics Summary...")
        resp = await client.get("/analytics/summary")
        assert resp.status_code == 200, f"Failed to get analytics: {resp.text}"
        data = resp.json()
        assert "totalQueries" in data, "Missing totalQueries in analytics"
        assert "failedQsCount" in data, "Missing failedQsCount in analytics"
        print("   Success! Analytics fetched successfully.")
        
        # 6. Test System Logs (Audit Logs)
        print("6. Testing Audit Logs...")
        resp = await client.get("/audit-logs")
        assert resp.status_code == 200, f"Failed to get audit logs: {resp.text}"
        data = resp.json()
        final_log_count = data["total"]
        
        print(f"   Success! Fetched {len(data['data'])} audit logs.")
        print(f"   Initial count: {initial_log_count}, Final count: {final_log_count}")
        assert final_log_count >= initial_log_count + 7, f"Expected at least 7 new audit logs (Create Cat, Create FAQ, Update FAQ, Promote to Spam, Delete Spam, Delete FAQ, Delete Cat), but got {final_log_count - initial_log_count}"
        print("   Audit Log Verification: PASSED")
        
        print("All Tests Completed Successfully!")

if __name__ == "__main__":
    asyncio.run(run_tests())
