import asyncio
import urllib.request
import urllib.parse
import json
import uuid
from sqlalchemy import select
from database.database import AsyncSessionLocal
from database.models import Domain

TEST_SUITES = [
    {
        "name": "Installation",
        "expected_topic": "install",
        "queries": [
            "How do I install the widget?",
            "how to install widget",
            "install widget",
            "widget installation",
            "embed chatbot",
            "add chatbot to website"
        ]
    },
    {
        "name": "Definition",
        "expected_topic": "chatbot",
        "queries": [
            "What is SHI Chatbot?",
            "tell me abt shi chatbot",
            "what does shi chatbot do",
            "it uses wht"
        ]
    },
    {
        "name": "Trial & Pricing",
        "expected_topic": "trial",
        "queries": [
            "Do you provide free trial?",
            "u have free trial",
            "free trial",
            "trial period",
            "how many days"
        ]
    }
]

async def get_test_domain_info():
    async with AsyncSessionLocal() as db:
        stmt = select(Domain).limit(1)
        res = await db.execute(stmt)
        domain = res.scalar_one_or_none()
        if domain:
            fallback = (domain.settings or {}).get("fallback_message", "Sorry, we could not find an answer. Please contact support.")
            return domain.id, fallback
        return None, None

async def run_evaluation():
    domain_id, domain_fallback = await get_test_domain_info()
    if not domain_id:
        print("ERROR: No domains found in database to test against.")
        return

    print(f"Starting Retrieval Evaluation on Domain: {domain_id}")
    print("-" * 50)
    
    total_queries = 0
    successful_queries = 0

    for suite in TEST_SUITES:
        print(f"\nRunning Suite: {suite['name']}")
        session_id = str(uuid.uuid4())
        
        for query in suite["queries"]:
            total_queries += 1
            
            payload = {
                "domain_id": domain_id,
                "message": query,
                "session_id": session_id
            }
            
            req = urllib.request.Request(
                "http://127.0.0.1:8000/chat/ask",
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            try:
                with urllib.request.urlopen(req) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode('utf-8'))
                        answer = data.get("answer", "")
                        
                        is_fallback = (
                            "don't have enough information" in answer.lower()
                            or domain_fallback.lower() in answer.lower()
                            or not answer
                        )
                        if is_fallback:
                            print(f"  [FAILED] Query: '{query}' -> Fallback Triggered")
                        else:
                            successful_queries += 1
                            print(f"  [SUCCESS] Query: '{query}'")
                    else:
                        print(f"  [ERROR] Query: '{query}' -> HTTP {resp.status}")
            except Exception as e:
                print(f"  [EXCEPTION] Query: '{query}' -> {e}")
                
    print("\n" + "=" * 50)
    print("EVALUATION RESULTS")
    print("=" * 50)
    success_rate = (successful_queries / total_queries) * 100 if total_queries > 0 else 0
    print(f"Total Queries: {total_queries}")
    print(f"Successful Retrievals: {successful_queries}")
    print(f"Success Rate: {success_rate:.2f}%")
    
    if success_rate >= 90:
        print("PASSED: Retrieval meets >= 90% accuracy goal!")
    else:
        print("FAILED: Retrieval falls below 90% accuracy goal.")

if __name__ == "__main__":
    asyncio.run(run_evaluation())
