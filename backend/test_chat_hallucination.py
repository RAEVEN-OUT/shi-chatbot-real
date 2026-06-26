import asyncio
import websockets
import json

async def test_chat_sequence():
    uri = "ws://localhost:8000/api/widget/ws/chat?domain_id=4a08ea55-a352-4b08-afd6-3a9c021ca1bc&session_id=test_hallucinate_1"
    
    questions = [
        "can i get a 14 days free trial"
    ]
    
    try:
        async with websockets.connect(uri) as ws:
            print("Connected.")
            
            for q in questions:
                print(f"\n--- Sending: {q}")
                await ws.send(json.dumps({"type": "message", "text": q}))
                
                full_text = ""
                while True:
                    response = await ws.recv()
                    data = json.loads(response)
                    
                    if data.get("type") == "stream_delta":
                        full_text += data.get("text", "")
                    elif data.get("type") == "stream_done":
                        print(f"Bot (Streamed): {full_text}")
                    elif data.get("type") == "message" and data.get("sender") == "ai":
                        if data.get("source") != "fallback":
                            print(f"Bot (Message): {data.get('text')}")
                        else:
                            print(f"Bot (Fallback): {data.get('text')}")
                        break
                    elif data.get("type") == "error":
                        print(f"Error: {data.get('text')}")
                        break
                        
    except Exception as e:
        print(f"WS Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_chat_sequence())
