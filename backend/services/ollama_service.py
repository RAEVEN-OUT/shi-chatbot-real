import json
import httpx
from core.config import settings


class OllamaService:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.llm_model = settings.OLLAMA_LLM_MODEL
        self.embedding_model = settings.OLLAMA_EMBEDDING_MODEL
        self.client = httpx.AsyncClient(timeout=60.0)

    async def generate_embedding(self, text: str) -> list[float]:
        """Generate embedding using the configured embedding model."""
        response = await self.client.post(
            f"{self.base_url}/api/embeddings",
            json={
                "model": self.embedding_model,
                "prompt": text
            }
        )
        response.raise_for_status()
        return response.json().get("embedding", [])

    async def generate_response(self, system_prompt: str, user_query: str) -> str:
        """Generate a non-streaming response using the configured LLM."""

        response = await self.client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.llm_model,
                "messages": [
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": user_query
                    }
                ],
                "stream": False,
                "think": False,
                "options": {
    "num_ctx": 8192,
    "temperature": 0.05,
    "top_p": 0.8,
    "repeat_penalty": 1.15,
    "num_predict": 128,
    "seed": 42,
    "stop": [
        "\nUser:",
        "\nQuestion:",
        "\nHuman:",
        "\nAssistant:"
    ]
}
            }
        )

        response.raise_for_status()

        data = response.json()
        return data.get("message", {}).get("content", "").strip()

    async def rewrite_query(
        self,
        chat_history: list[dict],
        current_query: str
    ) -> str:
        """
        Rewrite a follow-up query into a standalone query.
        """

        history_text = "\n".join(
            f"User: {msg['user']}\nAssistant: {msg['ai']}"
            for msg in chat_history
        )

        system_prompt = (
            "Rewrite the user's latest message into a standalone search query.\n"
            "Use the conversation history only to resolve references such as "
            "'it', 'they', 'that', 'there', or similar.\n"
            "Do NOT answer the question.\n"
            "Do NOT explain anything.\n"
            "Return ONLY the rewritten query.\n"
            "If the query is already standalone, return it unchanged."
        )

        prompt = (
            f"Conversation:\n"
            f"{history_text}\n\n"
            f"Current User Message:\n"
            f"{current_query}"
        )

        response = await self.client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.llm_model,
                "messages": [
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "stream": False,
                "think": False,
                "options": {
    "num_ctx": 4096,
    "temperature": 0.0,
    "top_p": 0.8,
    "repeat_penalty": 1.05,
    "num_predict": 64,
    "seed": 42
}
            }
        )

        response.raise_for_status()

        data = response.json()
        return data.get("message", {}).get("content", current_query).strip()

    async def generate_response_stream(
        self,
        system_prompt: str,
        user_query: str
    ):
        """
        Generate a streaming response using the configured LLM.
        """

        async with self.client.stream(
            "POST",
            f"{self.base_url}/api/chat",
            json={
                "model": self.llm_model,
                "messages": [
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": user_query
                    }
                ],
                "stream": True,
                "think": False,
                "options": {
    "num_ctx": 8192,
    "temperature": 0.05,
    "top_p": 0.8,
    "repeat_penalty": 1.15,
    "num_predict": 128,
    "seed": 42,
    "stop": [
        "\nUser:",
        "\nQuestion:",
        "\nHuman:",
        "\nAssistant:"
    ]
}
            }
        ) as response:

            response.raise_for_status()

            async for line in response.aiter_lines():
                if not line:
                    continue

                try:
                    chunk = json.loads(line)
                    yield chunk.get("message", {}).get("content", "")
                except Exception as e:
                    print(f"Error parsing Ollama stream chunk: {e}")


ollama_service = OllamaService()