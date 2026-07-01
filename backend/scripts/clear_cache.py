import asyncio
import redis.asyncio as redis

async def main():
    r = redis.from_url('redis://localhost:6379/0')
    await r.delete('domain_cap:39202541-126f-42b3-b0eb-967dfe381a86')
    print("Deleted.")

if __name__ == "__main__":
    asyncio.run(main())
