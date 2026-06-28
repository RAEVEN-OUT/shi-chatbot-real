@echo off
echo Starting SHI Chatbot Backend in Production Mode...
call venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
