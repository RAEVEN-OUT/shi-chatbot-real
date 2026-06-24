import asyncio
import json
import logging
from typing import Dict, List
from fastapi import WebSocket

from services.redis_service import redis_service

logger = logging.getLogger("chatbot.ws_manager")

class ConnectionManager:
    def __init__(self):
        # Maps session_id -> list of tuples (websocket, role)
        self.active_connections: Dict[str, List[tuple[WebSocket, str]]] = {}
        self.pubsub = redis_service.get_pubsub()
        self.task = None

    async def connect(self, websocket: WebSocket, session_id: str, role: str = "widget"):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append((websocket, role))
        
        if not self.task:
            self.task = asyncio.create_task(self._listen_to_redis())
            await self.pubsub.psubscribe("chat:*")

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_connections:
            self.active_connections[session_id] = [
                (ws, r) for (ws, r) in self.active_connections[session_id] if ws != websocket
            ]
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def _listen_to_redis(self):
        try:
            async for message in self.pubsub.listen():
                if message["type"] in ("message", "pmessage"):
                    channel = message["channel"]
                    if isinstance(channel, bytes):
                        channel = channel.decode("utf-8")
                    
                    if channel.startswith("chat:"):
                        session_id = channel.split(":")[1]
                        data_str = message["data"]
                        if isinstance(data_str, bytes):
                            data_str = data_str.decode("utf-8")
                        
                        await self._broadcast_to_session(session_id, data_str)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Redis PubSub listener error: {e}")
            await asyncio.sleep(5)
            self.task = asyncio.create_task(self._listen_to_redis())

    async def _broadcast_to_session(self, session_id: str, data_str: str):
        if session_id in self.active_connections:
            try:
                payload = json.loads(data_str)
            except Exception:
                return
                
            connections = list(self.active_connections[session_id])
            for (connection, role) in connections:
                try:
                    msg_data = payload.get("message", {})
                    sender = msg_data.get("sender")
                    
                    if role == "widget":
                        # Don't send user's own messages back to the widget to avoid duplication
                        if sender in ("user", "customer"):
                            continue
                            
                        # Format for widget
                        widget_payload = {
                            "type": "message",
                            "text": msg_data.get("message", ""),
                            "sender": sender,
                            "timestamp": msg_data.get("created_at", "")
                        }
                        await connection.send_json(widget_payload)
                    else:
                        # Send raw payload to admin
                        await connection.send_text(data_str)
                except Exception as e:
                    logger.warning(f"Failed to send to a websocket for session {session_id}: {e}")
                    self.disconnect(connection, session_id)

manager = ConnectionManager()
