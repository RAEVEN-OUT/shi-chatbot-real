import asyncio
import time
import json
import uuid
from sqlalchemy import select
from database.database import AsyncSessionLocal
from database.models import Domain
from routers.chatbot_routes import PerformanceMetrics, ChatRequest, DomainContext
from routers.chatbot_routes import _semantic_retrieval
from services.ollama_service import ollama_service
from utils.nlp_utils import normalize_query
import hashlib

PROMPT_A = """You are a helpful support bot. Answer clearly using only the context below. 
Context: {context}"""

PROMPT_B = """You are a technical support agent. Answer strictly using the context below. Provide step-by-step formatting where applicable.
Context: {context}"""

TEST_QUESTIONS = [
    "How do I install the widget?",
    "What is SHI Chatbot?",
    "Do you provide a free trial?"
]

async def _mock_context(domain_id: str):
    async with AsyncSessionLocal() as db:
        stmt = select(Domain).where(Domain.id == domain_id)
        res = await db.execute(stmt)
        domain = res.scalar_one_or_none()
        return DomainContext(
            domain=domain,
            category_ids=[],
            has_faqs=False,
            has_docs=True,
            fallback="Sorry, I don't know."
        )

async def ask_llm_judge(question: str, context: str, answer_a: str, answer_b: str):
    eval_prompt = f"""
    You are an impartial judge. Evaluate two AI responses based on a Question and Context.
    
    Question: {question}
    Context: {context}
    
    Answer A: {answer_a}
    Answer B: {answer_b}
    
    Please rate Answer A and Answer B on Answer Quality (1-10) and verify if the Retrieval Quality (Context provided) was sufficient (Yes/No).
    Output JSON only in this format:
    {{
        "retrieval_sufficient": true,
        "score_a": 8,
        "score_b": 9,
        "winner": "B",
        "reasoning": "brief reason"
    }}
    """
    
    try:
        resp = await ollama_service.client.post(
            f"{ollama_service.base_url}/api/chat",
            json={
                "model": ollama_service.llm_model,
                "messages": [{"role": "user", "content": eval_prompt}],
                "stream": False,
                "format": "json"
            },
            timeout=30.0
        )
        if resp.status_code == 200:
            return json.loads(resp.json()["message"]["content"])
    except Exception as e:
        return {"error": str(e)}
    return {}

async def run_benchmark():
    print("="*60)
    print("PROMPT BENCHMARKING FRAMEWORK")
    print("="*60)
    
    async with AsyncSessionLocal() as db:
        domain = (await db.execute(select(Domain).limit(1))).scalar_one_or_none()
        if not domain:
            print("No domain found in DB.")
            return
        domain_id = domain.id

    ctx = await _mock_context(domain_id)

    for idx, q in enumerate(TEST_QUESTIONS):
        print(f"\n[{idx+1}/{len(TEST_QUESTIONS)}] Question: {q}")
        
        req = ChatRequest(domain_id=domain_id, message=q, session_id=str(uuid.uuid4()))
        metrics = PerformanceMetrics()
        normalized_q = normalize_query(q)
        q_hash = hashlib.md5(normalized_q.encode()).hexdigest()
        
        # Retrieval
        t_ret = time.perf_counter()
        ret_res, sem_resp = await _semantic_retrieval(req, normalized_q, q_hash, ctx, "test_cache", None, metrics)
        ret_latency = (time.perf_counter() - t_ret) * 1000
        
        context_str = "\n".join([c.content for c in ret_res.chunks]) if ret_res and ret_res.chunks else "No context found."
        ret_quality_docs = len(ret_res.chunks) if ret_res and ret_res.chunks else 0
        
        # Test Prompt A
        sys_a = PROMPT_A.replace("{context}", context_str)
        t0 = time.perf_counter()
        ans_a = await ollama_service.generate_response(sys_a, q)
        lat_a = (time.perf_counter() - t0) * 1000
        tok_a = len(ans_a) // 4
        
        # Test Prompt B
        sys_b = PROMPT_B.replace("{context}", context_str)
        t0 = time.perf_counter()
        ans_b = await ollama_service.generate_response(sys_b, q)
        lat_b = (time.perf_counter() - t0) * 1000
        tok_b = len(ans_b) // 4
        
        # Evaluate
        print("  Evaluating answers...")
        eval_res = await ask_llm_judge(q, context_str, ans_a, ans_b)
        
        print(f"  Prompt A -> Latency: {lat_a:.0f}ms | Tokens: {tok_a} | Score: {eval_res.get('score_a', '?')}")
        print(f"  Prompt B -> Latency: {lat_b:.0f}ms | Tokens: {tok_b} | Score: {eval_res.get('score_b', '?')}")
        print(f"  Retrieval -> Context Chunks: {ret_quality_docs} | Latency: {ret_latency:.0f}ms | Sufficient: {eval_res.get('retrieval_sufficient', '?')}")
        print(f"  Winner: {eval_res.get('winner', 'None')} ({eval_res.get('reasoning', '')})")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
