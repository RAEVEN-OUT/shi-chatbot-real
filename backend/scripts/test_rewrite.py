import asyncio
from services.ollama_service import ollama_service

async def run():
    hist = [{'user': 'for how many days', 'ai': "I don't have enough information to answer that based on the current knowledge base."}]
    q = 'what is shi chatbot'
    print('Rewritten:', await ollama_service.rewrite_query(hist, q))
    
    q2 = "tell me about your free trial"
    print('Rewritten 2:', await ollama_service.rewrite_query(hist, q2))

if __name__ == "__main__":
    asyncio.run(run())
