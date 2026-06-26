import asyncio
from services.ollama_service import ollama_service

async def main():
    history = [
        {"user": "how to contact customer support", "ai": "You can contact customer support through live chat on the website."}
    ]
    
    q1 = "can i contact via email"
    q2 = "can i add appliance cleaning"
    
    res1 = await ollama_service.rewrite_query(history, q1)
    res2 = await ollama_service.rewrite_query(history, q2)
    
    print(f"Original: {q1}\nRewritten: {res1}\n")
    print(f"Original: {q2}\nRewritten: {res2}\n")

if __name__ == "__main__":
    asyncio.run(main())
