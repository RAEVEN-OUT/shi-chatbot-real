import httpx
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

ollama_service = OllamaService()
