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

redis_service = RedisService()
