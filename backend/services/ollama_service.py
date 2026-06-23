import httpx
import json
from core.config import settings

class OllamaService:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.llm_model = settings.OLLAMA_LLM_MODEL
        self.embedding_model = settings.OLLAMA_EMBEDDING_MODEL
        self.client = httpx.AsyncClient(timeout=60.0)

    async def generate_embedding(self, text: str) -> list[float]:
        """Generate embedding using BGE-M3 via Ollama."""
        response = await self.client.post(
            f"{self.base_url}/api/embeddings",
            json={
                "model": self.embedding_model,
                "prompt": text
            }
        )
        response.raise_for_status()
        data = response.json()
        return data.get("embedding", [])

    async def generate_response(self, system_prompt: str, user_query: str) -> str:
        """Generate answer using configured LLM via Ollama."""
        response = await self.client.post(
            f"{self.base_url}/api/generate",
            json={
                "model": self.llm_model,
                "prompt": f"{system_prompt}\n\nUser: {user_query}\nAnswer:",
                "stream": False
            }
        )
        response.raise_for_status()
        data = response.json()
        return data.get("response", "")

    async def rewrite_query(self, chat_history: list[dict], current_query: str) -> str:
        """Rewrite a follow-up query into a standalone query based on chat history."""
        history_text = "\n".join([f"User: {msg['user']}\nBot: {msg['ai']}" for msg in chat_history])
        system_prompt = (
            "Given the following conversation history, rewrite the current user query into a standalone question "
            "that can be understood without the history. If the query is already standalone, output it exactly as is. "
            "Do not answer the question, just provide the rewritten query."
        )
        prompt = f"{system_prompt}\n\nConversation:\n{history_text}\n\nCurrent User:\n{current_query}\n\nRewritten Query:"
        
        response = await self.client.post(
            f"{self.base_url}/api/generate",
            json={
                "model": self.llm_model,
                "prompt": prompt,
                "stream": False
            }
        )
        response.raise_for_status()
        data = response.json()
        return data.get("response", current_query).strip()

    async def generate_response_stream(self, system_prompt: str, user_query: str):
        """Generate answer streaming configured LLM response via Ollama."""
        async with self.client.stream(
            "POST",
            f"{self.base_url}/api/generate",
            json={
                "model": self.llm_model,
                "prompt": f"{system_prompt}\n\nUser: {user_query}\nAnswer:",
                "stream": True
            }
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line:
                    try:
                        chunk = json.loads(line)
                        yield chunk.get("response", "")
                    except Exception as e:
                        print(f"Error parsing Ollama stream chunk: {e}")

ollama_service = OllamaService()

