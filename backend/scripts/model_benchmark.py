import asyncio
import time
import json
import uuid
import os
from datetime import datetime
from sqlalchemy import select
from database.database import AsyncSessionLocal
from database.models import Domain
from routers.chatbot_routes import PerformanceMetrics, ChatRequest, DomainContext
from routers.chatbot_routes import _semantic_retrieval
from services.ollama_service import ollama_service
from utils.nlp_utils import normalize_query
import hashlib

TEST_MODELS = [
    "llama3",
    "mistral",
    "phi3"
]

TEST_QUESTIONS = [
    "How do I install the widget?",
    "What is SHI Chatbot?",
    "Do you provide a free trial?"
]

SYSTEM_PROMPT = """You are a helpful assistant. Answer based on the context. Context: {context}"""

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

async def generate_with_model(model_name: str, system_prompt: str, user_query: str):
    """
    EXCEPTION: Bypassing the production service layer here.
    Reason: We are intentionally testing multiple different models simultaneously,
    whereas the production ollama_service is hardcoded to a single prod model.
    """
    try:
        resp = await ollama_service.client.post(
            f"{ollama_service.base_url}/api/chat",
            json={
                "model": model_name,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_query}
                ],
                "stream": False
            },
            timeout=60.0
        )
        if resp.status_code == 200:
            return resp.json()["message"]["content"]
    except Exception as e:
        return f"Error: {str(e)}"
    return ""

async def ask_llm_judge(question: str, context: str, answer: str):
    eval_prompt = f"""
    You are an impartial evaluator.
    Evaluate ONLY according to the provided context.
    Do NOT prefer longer responses.
    Do NOT prefer more detailed responses.
    Ignore writing style unless it affects correctness.
    
    Question: {question}
    Context: {context}
    Answer: {answer}
    
    Score independently:
    1. Faithfulness to context (1-10)
    2. Completeness (1-10)
    3. Correctness (1-10)
    4. Conciseness (1-10)
    
    Return JSON only in this format:
    {{
        "faithfulness": 9,
        "completeness": 8,
        "correctness": 10,
        "conciseness": 7
    }}
    """
    
    try:
        resp_text = await ollama_service.generate_response(
            system_prompt="You are an impartial evaluator. You must output valid JSON only.",
            user_query=eval_prompt
        )
        
        resp_text = resp_text.strip()
        
        # Find first { and last } to handle preamble text or markdown
        start_idx = resp_text.find('{')
        end_idx = resp_text.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx >= start_idx:
            resp_text = resp_text[start_idx:end_idx+1]
            
        return json.loads(resp_text)
    except Exception as e:
        return {"error": str(e)}

async def run_model_benchmark():
    print("="*60)
    print("MODEL BENCHMARKING FRAMEWORK")
    print("="*60)
    
    async with AsyncSessionLocal() as db:
        domain = (await db.execute(select(Domain).limit(1))).scalar_one_or_none()
        if not domain:
            print("No domain found in DB.")
            return
        domain_id = domain.id

    ctx = await _mock_context(domain_id)

    results = {
        "timestamp": datetime.utcnow().isoformat(),
        "models_tested": TEST_MODELS,
        "questions": []
    }

    for idx, q in enumerate(TEST_QUESTIONS):
        print(f"\n[{idx+1}/{len(TEST_QUESTIONS)}] Question: {q}")
        
        req = ChatRequest(domain_id=domain_id, message=q, session_id=str(uuid.uuid4()))
        metrics = PerformanceMetrics()
        normalized_q = normalize_query(q)
        q_hash = hashlib.md5(normalized_q.encode()).hexdigest()
        
        # Retrieval
        t_ret = time.perf_counter()
        ret_res, sem_resp = await _semantic_retrieval(req, normalized_q, q_hash, ctx, "test_cache", None, metrics)
        
        context_str = "\n".join([c.content for c in ret_res.chunks]) if ret_res and ret_res.chunks else "No context found."
        sys_prompt = SYSTEM_PROMPT.replace("{context}", context_str)
        
        question_data = {
            "question": q,
            "models": {}
        }
        
        for model in TEST_MODELS:
            print(f"  Testing Model: {model}...")
            t0 = time.perf_counter()
            answer = await generate_with_model(model, sys_prompt, q)
            lat = (time.perf_counter() - t0) * 1000
            tok = len(answer) // 4
            
            # Evaluate
            print(f"    Evaluating {model}...")
            eval_res = await ask_llm_judge(q, context_str, answer)
            
            model_stats = {
                "latency_ms": round(lat, 2),
                "completion_tokens": tok,
                "retrieved_chunks": len(ret_res.chunks) if ret_res and ret_res.chunks else 0,
                "cache_hit": False,
                "fts_hit": False,
                "faithfulness": eval_res.get("faithfulness", 0),
                "completeness": eval_res.get("completeness", 0),
                "correctness": eval_res.get("correctness", 0),
                "conciseness": eval_res.get("conciseness", 0),
                "answer": answer
            }
            question_data["models"][model] = model_stats
            
            print(f"    -> Latency: {lat:.0f}ms | Tokens: {tok} | Chunks: {model_stats['retrieved_chunks']} | Faithfulness: {model_stats['faithfulness']} | Correctness: {model_stats['correctness']}")
            
        results["questions"].append(question_data)

    # Save results
    os.makedirs("backend/scripts/results", exist_ok=True)
    filename = f"backend/scripts/results/model_benchmark_{int(time.time())}.json"
    with open(filename, "w") as f:
        json.dump(results, f, indent=2)
        
    print(f"\nBenchmarking complete! Results saved to {filename}")

if __name__ == "__main__":
    asyncio.run(run_model_benchmark())
