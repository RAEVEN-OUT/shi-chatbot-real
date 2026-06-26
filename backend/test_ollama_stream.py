import asyncio
from services.ollama_service import ollama_service

async def main():
    print("Testing generate_response_stream...")
    try:
        async for chunk in ollama_service.generate_response_stream("You are a helpful assistant.", "Hello, how are you?"):
            print(chunk, end='', flush=True)
        print("\nDone.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
