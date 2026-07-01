import asyncio
import httpx
import json

BASE_URL = "http://localhost:8000/api/chat/ask"
DOMAIN_ID = "39202541-126f-42b3-b0eb-967dfe381a86" # Used in GoChat document
TOKEN = "" # We might not need a token if it's public widget chat, wait chat/ask is for widget
# Oh wait, the widget chat uses widget_key. What is the widget_key for this domain?
# Let's get it from the database first.
