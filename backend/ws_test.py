import asyncio
import websockets
import json

async def test_ws():
    uri = "ws://localhost:8000/api/widget/ws/chat?domain_id=ef3fb367-ffaa-479a-8aa5-00e0c648f7e2&session_id=test_sess_1"
    try:
        async with websockets.connect(uri) as ws:
            print("Connected!")
            await ws.send(json.dumps({"type": "message", "text": "hello"}))
            while True:
                try:
                    resp = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    print("Received:", resp)
                except asyncio.TimeoutError:
                    print("Timeout waiting for response")
                    break
    except Exception as e:
        print("WS Error:", e)

asyncio.run(test_ws())
