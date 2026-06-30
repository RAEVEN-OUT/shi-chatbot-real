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
    """Bypass OllamaService's fixed model and request a specific one."""
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
    You are an impartial evaluator. Evaluate this AI response.
    
    Question: {question}
    Context: {context}
    Answer: {answer}
    
    Evaluate the following on a scale of 1-10:
    1. Response Quality (Is it well formatted and accurate?)
    2. Hallucination Rate (10 = No hallucinations, completely faithful to context. 1 = Completely made up.)
    3. Retrieval Quality (Did the context contain the answer? 10 = Yes perfectly, 1 = Not at all)
    
    Output JSON only:
    {{
        "response_quality": 8,
        "hallucination_score": 9,
        "retrieval_quality": 10
    }}
    """
    
    try:
        resp = await ollama_service.client.post(
            f"{ollama_service.base_url}/api/chat",
            json={
                "model": ollama_service.llm_model, # Use the primary prod model as the judge
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
                "estimated_tokens": tok,
                "completion_length": len(answer),
                "response_quality": eval_res.get("response_quality", 0),
                "hallucination_score": eval_res.get("hallucination_score", 0),
                "retrieval_quality": eval_res.get("retrieval_quality", 0),
                "answer": answer
            }
            question_data["models"][model] = model_stats
            
            print(f"    -> Latency: {lat:.0f}ms | Tokens: {tok} | Qual: {model_stats['response_quality']} | Halluc: {model_stats['hallucination_score']}")
            
        results["questions"].append(question_data)

    # Save results
    os.makedirs("backend/scripts/results", exist_ok=True)
    filename = f"backend/scripts/results/model_benchmark_{int(time.time())}.json"
    with open(filename, "w") as f:
        json.dump(results, f, indent=2)
        
    print(f"\nBenchmarking complete! Results saved to {filename}")

if __name__ == "__main__":
    asyncio.run(run_model_benchmark())
