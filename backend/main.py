from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from contextlib import asynccontextmanager
import logging

logger = logging.getLogger("startup")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup Hardening: Clean up stranded background jobs ──
    try:
        from database.database import AsyncSessionLocal
        from database.models import DocumentSource
        from sqlalchemy import update
        
        async with AsyncSessionLocal() as db:
            # If the server crashed during an upload, mark stranded docs as failed
            stmt = (
                update(DocumentSource)
                .where(DocumentSource.status.in_(["queued", "processing", "embedding", "indexing"]))
                .values(
                    status="failed",
                    error_stage="System crash",
                    error_message="Server restarted during processing. Please try again."
                )
            )
            result = await db.execute(stmt)
            await db.commit()
            if result.rowcount > 0:
                logger.warning(f"Hardening: Cleaned up {result.rowcount} stranded documents.")
    except Exception as e:
        logger.error(f"Startup hardening failed: {e}")
        
    yield
    # ── Shutdown ──
    pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="SHI Chatbot Real API powered by FastAPI, PostgreSQL, Qdrant, and Ollama",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import (
    auth_routes, chatbot_routes, faq_routes, domain_routes, chat_session_routes,
    failed_question_routes, widget_routes, faq_category_routes, faq_question_routes,
    leads_routes, analytics_routes, settings_routes, faq_bulk_routes, audit_routes,
    upload_routes, document_routes
)
from fastapi.staticfiles import StaticFiles
import os

app.include_router(auth_routes.router)
app.include_router(chatbot_routes.router)
app.include_router(faq_routes.router)
app.include_router(domain_routes.router)
app.include_router(chat_session_routes.router)
app.include_router(chat_session_routes.notifications_router)
app.include_router(chat_session_routes.admin_ws_router)
app.include_router(failed_question_routes.router)
app.include_router(failed_question_routes.spam_router)
app.include_router(widget_routes.router)

# New API Routes
app.include_router(faq_category_routes.router)
app.include_router(faq_question_routes.router)
app.include_router(leads_routes.router)
app.include_router(analytics_routes.router)
app.include_router(settings_routes.router)
app.include_router(faq_bulk_routes.router)
app.include_router(audit_routes.router)
app.include_router(upload_routes.router)
app.include_router(document_routes.router)

public_dir = os.path.join(os.path.dirname(__file__), "public")
if os.path.exists(public_dir):
    app.mount("/public", StaticFiles(directory=public_dir), name="public")

@app.get("/healthz")
async def health_check():
    return {"status": "ok", "message": "FastAPI is running successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
