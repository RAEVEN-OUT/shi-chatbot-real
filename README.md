# SHI Chatbot Real - Quick Start Guide

This guide contains the exact sequence of commands and steps to start the application when you run it again.

---

## 🛠️ Step 1: Start External Services (Docker)
The backend requires **PostgreSQL**, **Redis**, and **Qdrant** to be active.

1. Ensure **Docker Desktop** is running.
2. In the project root (`d:\Projects\shi-chatbot-real`), run:
   ```powershell
   docker compose up -d
   ```

---

## 🦙 Step 2: Ensure Ollama is Running
The app relies on Ollama for LLM and text embeddings.
1. Make sure the **Ollama** desktop app is open and running.
2. If you haven't pulled the models yet:
   ```powershell
   ollama pull llama3.2:1b
   ollama pull nomic-embed-text
   ```

---

## 🐍 Step 3: Run the FastAPI Backend
1. Open a new terminal and run:
   ```powershell
   cd d:\Projects\shi-chatbot-real\backend
   ```
2. Activate the Python virtual environment:
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```
3. *(Optional - Run if code updates or packages change)* Install dependencies and run migrations:
   ```powershell
   pip install -r requirements.txt
   alembic upgrade head
   ```
4. Start the backend:
   ```powershell
   python main.py
   ```
   * Access API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## ⚡ Step 4: Run the Next.js Frontend
1. Open a new terminal and run:
   ```powershell
   cd d:\Projects\shi-chatbot-real\frontend
   ```
2. *(Optional - Run if package.json changes)* Install node modules:
   ```powershell
   npm install
   ```
3. Start the Next.js development server:
   ```powershell
   npm run dev
   ```
   * Access App: [http://localhost:3000](http://localhost:3000)


Complete deployment workflow

Whenever you make code changes:

On your PC
Edit code
↓
git add .
git commit -m "..."
git push origin main
On the server
cd /opt/shi-chatbot-real

git pull origin main

cd frontend
npm install          # if needed
npm run build

cd ../backend
source venv/bin/activate
pip install -r requirements.txt   # if needed

sudo systemctl restart shichatbot-frontend
sudo systemctl restart shichatbot-backend