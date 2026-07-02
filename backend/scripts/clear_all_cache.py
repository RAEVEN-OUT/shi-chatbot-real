import asyncio
import redis.asyncio as redis

async def main():
    r = redis.from_url('redis://localhost:6379/0')
    await r.flushdb()
    print("Flushed all Redis caches.")

if __name__ == "__main__":
    asyncio.run(main())
