from fastapi import FastAPI, Response
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
        
        from core.retry import db_write_execute, db_write_commit
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
            result = await db_write_execute(db, stmt)
            await db_write_commit(db)
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
async def health_check(response: Response):
    import asyncio
    from services.redis_service import redis_service
    from services.qdrant_service import qdrant_service
    from services.ollama_service import ollama_service
    from database.database import AsyncSessionLocal
    from sqlalchemy import text
    
    health_status = {
        "status": "ok",
        "services": {
            "api": "up",
            "postgres": "down",
            "redis": "down",
            "qdrant": "down",
            "ollama": "down"
        },
        "metadata": {
            "version": settings.VERSION
        }
    }
    
    # Check Postgres
    try:
        async with AsyncSessionLocal() as db:
            from core.retry import db_read_execute
            await db_read_execute(db, text("SELECT 1"))
            health_status["services"]["postgres"] = "up"
    except Exception as e:
        logger.error(f"Postgres health check failed: {e}")

    # Check external services concurrently
    redis_up, qdrant_up, ollama_up = await asyncio.gather(
        redis_service.check_health(),
        qdrant_service.check_health(),
        ollama_service.check_health()
    )
    
    health_status["services"]["redis"] = "up" if redis_up else "down"
    health_status["services"]["qdrant"] = "up" if qdrant_up else "down"
    health_status["services"]["ollama"] = "up" if ollama_up else "down"
    
    if not (health_status["services"]["postgres"] == "up" and 
            health_status["services"]["redis"] == "up" and 
            health_status["services"]["qdrant"] == "up" and 
            health_status["services"]["ollama"] == "up"):
        health_status["status"] = "degraded"
        response.status_code = 503
        
    return health_status

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
