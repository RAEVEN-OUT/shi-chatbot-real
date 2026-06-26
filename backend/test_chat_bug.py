import asyncio
import websockets
import json
import uuid

async def test_chat():
    uri = "ws://localhost:8000/chat/ws/4a08ea55-a352-4b08-afd6-3a9c021ca1bc"
    session_id = str(uuid.uuid4())
    
    async with websockets.connect(uri, extra_headers={"Origin": "http://localhost:5500"}) as ws:
        # Initialize
        await ws.send(json.dumps({
            "type": "init",
            "session_id": session_id,
            "url": "http://localhost:5500/"
        }))
        
        resp1 = await ws.recv()
        print(f"Init resp: {resp1}")
        
        # Send query
        query = "can i get a 14 days free trial"
        await ws.send(json.dumps({
            "type": "message",
            "text": query
        }))
        
        while True:
            resp = await ws.recv()
            data = json.loads(resp)
            if data.get("type") == "message":
                print(f"Message: {data}")
                break
            elif data.get("type") == "stream_delta":
                print(data["text"], end="")
            elif data.get("type") == "stream_end":
                print("\nStream End")
                break
            else:
                print(f"Other: {data}")

if __name__ == "__main__":
    asyncio.run(test_chat())
