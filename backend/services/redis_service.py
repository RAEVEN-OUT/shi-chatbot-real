import redis.asyncio as redis
from core.config import settings
import json
import logging
from core.retry import redis_read_retry, redis_write_retry

logger = logging.getLogger("redis_service")

class RedisService:
    def __init__(self):
        self.redis = redis.from_url(settings.REDIS_URL, decode_responses=True)

    async def check_health(self) -> bool:
        """Check if Redis is available."""
        try:
            await self.redis.ping()
            return True
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            return False

    async def get_cached_response(self, cache_key: str):
        """Retrieve a cached LLM response."""
        @redis_read_retry
        async def _call():
            return await self.redis.get(cache_key)

        try:
            data = await _call()
            if data:
                return json.loads(data)
        except Exception as e:
            logger.warning(f"Redis cache retrieval failed: {e}")
        return None

    async def set_cached_response(self, cache_key: str, response: dict, expire: int = 3600):
        """Cache an LLM response."""
        data = json.dumps(response)
        
        @redis_write_retry
        async def _call():
            return await self.redis.set(cache_key, data, ex=expire)
            
        try:
            await _call()
        except Exception as e:
            logger.warning(f"Redis cache set failed: {e}")
        
    async def clear_domain_cache(self, domain_id: str):
        """Invalidate all LLM cached responses for a specific domain."""
        pattern = f"chat:{domain_id}:*"
        cursor = '0'
        
        @redis_write_retry
        async def _call_scan(cur):
            return await self.redis.scan(cursor=cur, match=pattern, count=100)
            
        @redis_write_retry
        async def _call_delete(k):
            return await self.redis.delete(*k)
            
        while True:
            cursor, keys = await _call_scan(cursor)
            if keys:
                await _call_delete(keys)
            if cursor == 0 or str(cursor) == '0':
                break
                
        # Also explicitly clear metadata caches for the domain
        try:
            await self.delete_domain_capabilities(domain_id)
            await self.delete_domain_categories(domain_id)
        except Exception as e:
            logger.warning(f"Failed to clear domain metadata cache for {domain_id}: {e}")

    async def purge_domain_cache(self, domain_id: str):
        """Completely remove all Redis cache keys associated with a deleted domain."""
        pattern = f"*{domain_id}*"
        cursor = '0'
        
        @redis_write_retry
        async def _call_scan(cur):
            return await self.redis.scan(cursor=cur, match=pattern, count=100)
            
        @redis_write_retry
        async def _call_delete(k):
            return await self.redis.delete(*k)
            
        while True:
            cursor, keys = await _call_scan(cursor)
            if keys:
                await _call_delete(keys)
            if cursor == 0 or str(cursor) == '0':
                break

    @redis_read_retry
    async def get_cached_embedding(self, text_hash: str):
        """Retrieve a cached embedding vector."""
        data = await self.redis.get(f"embed:{settings.OLLAMA_EMBEDDING_MODEL}:{text_hash}")
        if data:
            return json.loads(data)
        return None
        
    async def set_cached_embedding(self, text_hash: str, vector: list[float], expire: int = 86400 * 7):
        """Cache an embedding vector (1 week default)."""
        data = json.dumps(vector)
        @redis_write_retry
        async def _call():
            return await self.redis.set(f"embed:{settings.OLLAMA_EMBEDDING_MODEL}:{text_hash}", data, ex=expire)
        await _call()

    @redis_read_retry
    async def get_domain_categories(self, domain_id: str):
        """Retrieve cached domain category IDs."""
        data = await self.redis.get(f"domain_categories:{domain_id}")
        if data:
            return json.loads(data)
        return None

    async def set_domain_categories(self, domain_id: str, category_ids: list[str], expire: int = 86400):
        """Cache domain category IDs (24 hours default)."""
        data = json.dumps(category_ids)
        @redis_write_retry
        async def _call():
            return await self.redis.set(f"domain_categories:{domain_id}", data, ex=expire)
        await _call()

    async def delete_domain_categories(self, domain_id: str):
        """Invalidate cached domain category IDs."""
        @redis_write_retry
        async def _call():
            return await self.redis.delete(f"domain_categories:{domain_id}")
        await _call()

    @redis_read_retry
    async def get_domain_capabilities(self, domain_id: str):
        """Retrieve cached domain capabilities (has_faqs, has_docs)."""
        data = await self.redis.get(f"domain_cap:{domain_id}")
        if data:
            return json.loads(data)
        return None

    async def set_domain_capabilities(self, domain_id: str, capabilities: dict, expire: int = 3600):
        """Cache domain capabilities."""
        data = json.dumps(capabilities)
        @redis_write_retry
        async def _call():
            return await self.redis.set(f"domain_cap:{domain_id}", data, ex=expire)
        await _call()
        
    async def delete_domain_capabilities(self, domain_id: str):
        """Invalidate cached domain capabilities."""
        @redis_write_retry
        async def _call():
            return await self.redis.delete(f"domain_cap:{domain_id}")
        await _call()

    async def is_rate_limited(self, widget_key: str, session_id: str, ip: str, limit: int = 100, window: int = 60) -> bool:
        """Check if client is rate limited."""
        key = f"rate:{widget_key}:{session_id}:{ip}"
        
        @redis_write_retry
        async def _call_incr():
            return await self.redis.incr(key)
            
        @redis_write_retry
        async def _call_expire():
            return await self.redis.expire(key, window)
            
        count = await _call_incr()
        if count == 1:
            await _call_expire()
        return count > limit

    @redis_read_retry
    async def get_chat_history(self, session_id: str, limit: int = 5) -> list[dict]:
        """Retrieve recent chat history for a session."""
        if not session_id:
            return []
        data = await self.redis.lrange(f"chat_history:{session_id}", -limit, -1)
        return [json.loads(msg) for msg in data]

    async def add_to_chat_history(self, session_id: str, question: str, answer: str, topic: str = None, expire: int = 86400):
        """Add a Q&A pair to the session's chat history."""
        if not session_id:
            return
        key = f"chat_history:{session_id}"
        entry = {"user": question, "ai": answer, "topic": topic or question}
        data = json.dumps(entry)
        
        @redis_write_retry
        async def _call_rpush():
            return await self.redis.rpush(key, data)
            
        @redis_write_retry
        async def _call_ltrim():
            return await self.redis.ltrim(key, -20, -1)
            
        @redis_write_retry
        async def _call_expire():
            return await self.redis.expire(key, expire)
            
        await _call_rpush()
        # Keep only last 20 messages to prevent infinite growth
        await _call_ltrim()
        await _call_expire()

    async def publish_message(self, channel: str, message: dict):
        """Publish a JSON message to a Redis channel."""
        data = json.dumps(message)
        @redis_write_retry
        async def _call():
            return await self.redis.publish(channel, data)
        await _call()

    def get_pubsub(self):
        """Return a Redis pubsub object."""
        return self.redis.pubsub()

redis_service = RedisService()
