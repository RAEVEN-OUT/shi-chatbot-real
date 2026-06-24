import redis.asyncio as redis
from core.config import settings
import json

class RedisService:
    def __init__(self):
        self.redis = redis.from_url(settings.REDIS_URL, decode_responses=True)

    async def get_cached_response(self, cache_key: str):
        """Retrieve a cached LLM response."""
        data = await self.redis.get(cache_key)
        if data:
            return json.loads(data)
        return None

    async def set_cached_response(self, cache_key: str, response: dict, expire: int = 3600):
        """Cache an LLM response."""
        await self.redis.set(cache_key, json.dumps(response), ex=expire)
        
    async def get_cached_embedding(self, text_hash: str):
        """Retrieve a cached embedding vector."""
        data = await self.redis.get(f"embed:{text_hash}")
        if data:
            return json.loads(data)
        return None
        
    async def set_cached_embedding(self, text_hash: str, vector: list[float], expire: int = 86400 * 7):
        """Cache an embedding vector (1 week default)."""
        await self.redis.set(f"embed:{text_hash}", json.dumps(vector), ex=expire)

    async def get_domain_categories(self, domain_id: str):
        """Retrieve cached domain category IDs."""
        data = await self.redis.get(f"domain_categories:{domain_id}")
        if data:
            return json.loads(data)
        return None

    async def set_domain_categories(self, domain_id: str, category_ids: list[str], expire: int = 86400):
        """Cache domain category IDs (24 hours default)."""
        await self.redis.set(f"domain_categories:{domain_id}", json.dumps(category_ids), ex=expire)

    async def delete_domain_categories(self, domain_id: str):
        """Invalidate cached domain category IDs."""
        await self.redis.delete(f"domain_categories:{domain_id}")

    async def is_rate_limited(self, widget_key: str, session_id: str, ip: str, limit: int = 100, window: int = 60) -> bool:
        """Check if client is rate limited."""
        key = f"rate:{widget_key}:{session_id}:{ip}"
        count = await self.redis.incr(key)
        if count == 1:
            await self.redis.expire(key, window)
        return count > limit

    async def get_chat_history(self, session_id: str, limit: int = 5) -> list[dict]:
        """Retrieve recent chat history for a session."""
        if not session_id:
            return []
        data = await self.redis.lrange(f"chat_history:{session_id}", -limit, -1)
        return [json.loads(msg) for msg in data]

    async def add_to_chat_history(self, session_id: str, question: str, answer: str, expire: int = 86400):
        """Add a Q&A pair to the session's chat history."""
        if not session_id:
            return
        key = f"chat_history:{session_id}"
        entry = {"user": question, "ai": answer}
        await self.redis.rpush(key, json.dumps(entry))
        # Keep only last 20 messages to prevent infinite growth
        await self.redis.ltrim(key, -20, -1)
        await self.redis.expire(key, expire)

    async def publish_message(self, channel: str, message: dict):
        """Publish a JSON message to a Redis channel."""
        await self.redis.publish(channel, json.dumps(message))

    def get_pubsub(self):
        """Return a Redis pubsub object."""
        return self.redis.pubsub()

redis_service = RedisService()
