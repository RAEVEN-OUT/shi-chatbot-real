import asyncio
import json
import logging
from typing import Dict, List, Set
from fastapi import WebSocket

from services.redis_service import redis_service

logger = logging.getLogger("chatbot.ws_manager")


class ConnectionManager:
    def __init__(self):
        # Maps session_id -> list of tuples (websocket, role)
        self.active_connections: Dict[str, List[tuple[WebSocket, str]]] = {}
        # Dashboard websockets (for conversation list updates)
        self.dashboard_connections: Set[WebSocket] = set()
        self.pubsub = redis_service.get_pubsub()
        self.task = None

    async def connect(self, websocket: WebSocket, session_id: str, role: str = "widget"):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append((websocket, role))
        await self._ensure_listener()

    async def connect_dashboard(self, websocket: WebSocket):
        """Connect an admin dashboard websocket for conversation list updates."""
        await websocket.accept()
        self.dashboard_connections.add(websocket)
        await self._ensure_listener()

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_connections:
            self.active_connections[session_id] = [
                (ws, r) for (ws, r) in self.active_connections[session_id] if ws != websocket
            ]
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    def disconnect_dashboard(self, websocket: WebSocket):
        self.dashboard_connections.discard(websocket)

    async def _ensure_listener(self):
        if not self.task or self.task.done():
            self.task = asyncio.create_task(self._listen_to_redis())
            await self.pubsub.psubscribe("chat:*")

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

                        # Broadcast to session participants (widget + admin chat)
                        await self._broadcast_to_session(session_id, data_str)
                        # Broadcast conversation summary to all dashboard connections
                        await self._broadcast_to_dashboard(session_id, data_str)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Redis PubSub listener error: {e}")
            await asyncio.sleep(5)
            self.task = asyncio.create_task(self._listen_to_redis())

    async def _broadcast_to_session(self, session_id: str, data_str: str):
        if session_id not in self.active_connections:
            return
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
                    # Only broadcast admin messages to the widget via Redis.
                    # User messages, Bot streams, and System fallbacks are already
                    # handled directly by the websocket endpoint in widget_routes.py.
                    if sender != "admin":
                        continue
                    widget_payload = {
                        "type": "message",
                        "text": msg_data.get("message", ""),
                        "sender": sender,
                        "timestamp": msg_data.get("created_at", "")
                    }
                    await connection.send_json(widget_payload)
                else:
                    # Send full payload to admin chat view
                    await connection.send_text(data_str)
            except Exception as e:
                logger.warning(f"Failed to send to websocket for session {session_id}: {e}")
                self.disconnect(connection, session_id)

    async def _broadcast_to_dashboard(self, session_id: str, data_str: str):
        """Send a lightweight conversation summary event to all dashboard clients."""
        if not self.dashboard_connections:
            return
        try:
            payload = json.loads(data_str)
        except Exception:
            return

        msg_data = payload.get("message", {})
        dashboard_event = {
            "type": "conversation_update",
            "session_id": session_id,
            "last_message": msg_data.get("message", ""),
            "last_message_at": msg_data.get("created_at", ""),
            "sender": msg_data.get("sender", ""),
        }
        event_str = json.dumps(dashboard_event)

        dead = set()
        for ws in list(self.dashboard_connections):
            try:
                await ws.send_text(event_str)
            except Exception as e:
                logger.warning(f"Failed to send to dashboard websocket: {e}")
                dead.add(ws)
        self.dashboard_connections -= dead


manager = ConnectionManager()