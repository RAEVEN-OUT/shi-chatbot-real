import asyncio
from services.ollama_service import ollama_service

async def main():
    history = [
        {"user": "how to contact customer support", "ai": "You can contact customer support through live chat on the website."},
        {"user": "can i contact via email", "ai": "You can contact customer support through live chat on the website."},
        {"user": "email?", "ai": "You can contact customer support through live chat on the website."}
    ]
    
    q3 = "can i add appliance cleaning"
    
    res = await ollama_service.rewrite_query(history, q3)
    
    print(f"Original: {q3}\nRewritten: {res}\n")

if __name__ == "__main__":
    asyncio.run(main())
