#!/bin/bash
echo "Starting SHI Chatbot Backend in Production Mode..."
source venv/bin/activate
exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
