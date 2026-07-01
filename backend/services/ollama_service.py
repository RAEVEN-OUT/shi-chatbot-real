import json
import httpx
import logging
import asyncio
from core.config import settings
from core.retry import ollama_retry

logger = logging.getLogger("ollama_service")

class OllamaService:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.llm_model = settings.OLLAMA_LLM_MODEL
        self.embedding_model = settings.OLLAMA_EMBEDDING_MODEL
        self.client = httpx.AsyncClient(timeout=60.0)

    async def check_health(self) -> bool:
        """Check if Ollama is available."""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags", timeout=5.0)
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Ollama health check failed: {e}")
            return False

    @ollama_retry
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

    @ollama_retry
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

        @ollama_retry
        async def _call_api():
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

        try:
            return await _call_api()
        except Exception as e:
            logger.warning(f"Ollama rewrite failed after retries: {e}. Falling back to original query.")
            return current_query

    async def generate_response_stream(
        self,
        system_prompt: str,
        user_query: str
    ):
        """
        Generate a streaming response using the configured LLM.
        """
        payload = {
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

        @ollama_retry
        async def _open_stream():
            request = self.client.build_request(
                "POST",
                f"{self.base_url}/api/chat",
                json=payload
            )
            response = await self.client.send(request, stream=True)
            response.raise_for_status()
            return response

        try:
            response = await _open_stream()
        except Exception as e:
            logger.error(f"Failed to open Ollama stream: {e}")
            return

        try:
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    yield chunk.get("message", {}).get("content", "")
                except Exception as parse_e:
                    logger.error(f"Error parsing Ollama stream chunk: {parse_e}")
        except Exception as stream_e:
            logger.error(f"Ollama stream failed during iteration: {stream_e}")
            # Terminate cleanly without duplicating tokens
        finally:
            await response.aclose()


ollama_service = OllamaService()