import asyncio
import websockets
import json

async def test():
    uri = "ws://127.0.0.1:8000/api/widget/ws/chat?domain_id=39202541-126f-42b3-b0eb-967dfe381a86&session_id=sess_test2"
    try:
        async with websockets.connect(uri) as ws:
            await ws.send('{"type": "message", "text": "Hello"}')
            while True:
                res = await ws.recv()
                print("Received:", res)
                data = json.loads(res)
                if data.get("type") in ["error", "stream_done", "message"]:
                    break
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
