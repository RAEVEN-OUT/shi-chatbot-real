import asyncio
from services.ollama_service import ollama_service

async def main():
    system_prompt = (
        "You are a helpful AI assistant for example.com.\n"
        "Answer using ONLY the information in the Knowledge base below.\n"
        "You may fix obvious spelling mistakes in the user's question.\n"
        "If the Knowledge base does not contain the answer, reply EXACTLY with:\n"
        "\"Sorry, I don't know.\"\n"
        "Do not guess or use outside knowledge.\n\n"
        "Knowledge base:\nQ: What is your name?\nA: My name is Bot."
    )
    user_msg = "What is your name?"
    
    print("Testing generate_response_stream with full prompt...")
    try:
        async for chunk in ollama_service.generate_response_stream(system_prompt, user_msg):
            print(chunk, end='', flush=True)
        print("\nDone.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
