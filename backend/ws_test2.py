import asyncio
import websockets
import json

async def test_ws():
    # Use the local-dev domain id that is hardcoded for test API keys
    # or just use a known domain id from the DB. I will just query the local-dev if possible.
    # Wait, the widget expects domain_id to be passed as a query param. 
    # Let's connect to ws://localhost:8000/api/widget/ws/chat
    # Wait, the URL path in widget_routes.py is /api/widget/ws/chat but domain_id and session_id are query params!
    # No, wait: @router.websocket("/ws/chat") but the function args are `domain_id: str, session_id: str`
    # FastAPI expects them as query params.
    uri = "ws://localhost:8000/api/widget/ws/chat?domain_id=4a08ea55-a352-4b08-afd6-3a9c021ca1bc&session_id=test_sess_llm_2"
    
    try:
        async with websockets.connect(uri) as ws:
            print("Connected.")
            # Send a question that would require LLM (not intent).
            await ws.send(json.dumps({"type": "message", "text": "How do I book a cleaning service?"}))
            
            while True:
                response = await ws.recv()
                print("Received:", response)
                data = json.loads(response)
                if data.get("type") in ["error", "stream_done"] or (data.get("type") == "message" and data.get("sender") == "ai"):
                    break
    except Exception as e:
        print(f"WS Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_ws())
