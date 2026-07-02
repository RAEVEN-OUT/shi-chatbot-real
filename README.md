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

🚀 Phase 4 — Evaluation & Continuous Improvement

This is the phase I'd do next.

Instead of making the chatbot work, this phase makes it continuously improve.

Task 1 — Retrieval Analytics Dashboard

Track:

FTS hit rate
Cache hit rate
Rewrite frequency
Embedding cache hit rate
Qdrant hit rate
Fast-path percentage
Average latency
Average prompt size
Average completion size

You'll finally know exactly how your RAG behaves.

Task 2 — User Feedback Pipeline

You already created

MessageFeedback

Now actually use it.

Collect

👍 Helpful

👎 Not Helpful

Store

question
answer
retrieval path
chunks
prompt length
model
latency

This becomes gold data.

Task 3 — Failed Question Analysis

Automatically cluster

Failed Questions

into

Groups

Example

Pricing

Pricing

Pricing

Refund

Refund

Refund

instead of

300 individual failures.

Then suggest

"These FAQs should be added."

Task 4 — Offline Evaluation Suite

Instead of manually asking questions,

run

500 test questions

↓

retrieval

↓

answer

↓

metrics

↓

report

Measure

precision
recall
hallucination rate
latency
FTS success
Qdrant success
Task 5 — Automatic Prompt A/B Testing

You already started this.

Finish it.

Run

Prompt A

↓

100 questions

Prompt B

↓

100 questions

Generate report

Winner

No manual work.

Task 6 — Model Benchmark Dashboard

You already have scripts.

Now produce

llama3.2

↓

1.2 s

Faithfulness

9.4

Cost

0

--------

gemma

↓

...

--------

phi

↓

...

One click.

Task 7 — Retrieval Visualizer

For every answer show

User

↓

Normalized

↓

FTS

↓

Qdrant

↓

Chunks

↓

Prompt

↓

Answer

This is probably the single most useful debugging tool.

Task 8 — Automatic Threshold Optimizer

Instead of

FTS_FAST_PATH = 0.35

learn it automatically.

After

1000 questions

recommend

0.42

because it minimizes false positives.

Task 9 — Knowledge Gap Detection

Automatically detect

Users asked this

42 times

No answer exists.

Recommend

Create FAQ

or

Upload document
Task 10 — Admin AI Insights

Every week

generate

Top unanswered topics

Most successful FAQs

Slowest responses

Frequently rewritten questions

Most common intents

Knowledge gaps

Suggested FAQ additions

This becomes an AI-powered analytics dashboard.

🌟 Phase 5 — Enterprise Features

After Phase 4, I'd stop optimizing the RAG itself and focus on product capabilities:

Multi-tenant analytics
A/B testing for prompts and models
Human-in-the-loop retraining
Conversation summaries
Agent handoff improvements
Versioned knowledge bases
Document version history
Semantic duplicate detection for FAQs
Advanced dashboard and reporting
Multi-model routing
Model fallback and failover
My recommendation

I would finish Phase 3 first by completing the remaining hardening tasks (retry coverage, health endpoint cleanup, logging, etc.). Once that's done, move directly into Phase 4. That's where your chatbot stops being just a functional RAG system and becomes a measurable, self-improving platform.


User
│
├── Redis
│      │
│      └── Hit → Return
│
├── Intent
│      │
│      └── Return
│
├── Compound?
│
├── FTS (FAQ only)
│      │
│      └── Hit → Return
│
├── Embedding
│
├── Qdrant
│
├── Semantic FAQ Fast Path
│      │
│      ├── Top result is FAQ
│      ├── Score ≥ 0.75
│      ├── No close competitor
│      │
│      └── Return
│
├── General Retrieval
│      │
│      ├── Top score < 0.35 ?
│      │
│      ├── YES → Fallback
│      │
│      └── NO → LLM
│
└── LLM