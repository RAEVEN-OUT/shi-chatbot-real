[Unit]
Description=SHI Chatbot Backend
After=network.target

[Service]
User=chatuser
WorkingDirectory=/opt/shi-chatbot-real/backend

Environment="PATH=/opt/shi-chatbot-real/backend/venv/bin"

ExecStart=/opt/shi-chatbot-real/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target