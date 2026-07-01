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

PROMPT_A = """You are the AI assistant for SHI Chatbot.

RULES:
1. Answer ONLY using the Knowledge Base below. If the answer is missing, reply EXACTLY:
"Sorry, I don't know."
2. Never mention the 'Knowledge Base', 'Sources', or say 'According to...'. Do NOT copy verbatim.
3. Correct user spelling silently.
4. Answer naturally and concisely (1-5 sentences) in a single paragraph.

KNOWLEDGE BASE:
{context}"""

PROMPT_B = """You are the AI assistant for SHI Chatbot.

<RULES>
1. You must base your answer strictly on the <KNOWLEDGE_BASE>. Do NOT use outside knowledge.
2. If the <KNOWLEDGE_BASE> lacks the answer, you MUST reply exactly: "Sorry, I don't know."
3. Do not use phrases like "According to the context" or "Based on the knowledge base".
4. Answer concisely (1-5 sentences) in a single paragraph. Keep formatting minimal.
</RULES>

<KNOWLEDGE_BASE>
{context}
</KNOWLEDGE_BASE>"""

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
        resp_text = await ollama_service.generate_response(
            system_prompt="You are an impartial judge. You must output valid JSON only.",
            user_query=eval_prompt
        )
        
        # Strip potential markdown formatting
        resp_text = resp_text.strip()
        if resp_text.startswith("```json"):
            resp_text = resp_text[7:-3].strip()
        elif resp_text.startswith("```"):
            resp_text = resp_text[3:-3].strip()
            
        return json.loads(resp_text)
    except Exception as e:
        return {"error": str(e)}

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
