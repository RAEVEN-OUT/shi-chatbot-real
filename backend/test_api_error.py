import asyncio
import sys
import os

sys.path.append(os.path.abspath('d:/Projects/shi-chatbot-real/backend'))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

response = client.post("/chat/ask", json={
    "domain_id": "8f17ef5e-cf5e-4ffa-bb1f-5d8f48dc52b0",
    "message": "hello test"
})

print(response.status_code)
print(response.text)
