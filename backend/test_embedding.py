import asyncio
from services.ollama_service import ollama_service

async def main():
    print("Testing generate_embedding...")
    try:
        vector = await ollama_service.generate_embedding("Hello world")
        print(f"Success! Vector length: {len(vector)}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
