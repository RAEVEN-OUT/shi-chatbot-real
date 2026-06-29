import asyncio
import websockets

async def test():
    uri = "ws://127.0.0.1:8000/api/widget/ws/chat?domain_id=39202541-126f-42b3-b0eb-967dfe381a86&session_id=sess_test"
    try:
        async with websockets.connect(uri) as ws:
            await ws.send('{"type": "message", "text": "Hello"}')
            res = await ws.recv()
            print("Received:", res)
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
