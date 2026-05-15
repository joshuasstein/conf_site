import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_settings
from app.routers import admin, auth, decisions, files, notifications, reviews, sessions, submissions
from app.workers.email_worker import run_worker

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    limiter = Limiter(key_func=get_remote_address)
    app = FastAPI(title="Conference Abstract Management System", version="1.0.0")
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(settings.frontend_url)],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    prefix = "/api/v1"
    app.include_router(auth.router, prefix=prefix)
    app.include_router(submissions.router, prefix=prefix)
    app.include_router(reviews.router, prefix=prefix)
    app.include_router(decisions.router, prefix=prefix)
    app.include_router(sessions.router, prefix=prefix)
    app.include_router(admin.router, prefix=prefix)
    app.include_router(files.router, prefix=prefix)
    app.include_router(notifications.router, prefix=prefix)

    _worker_task: asyncio.Task | None = None

    @app.on_event("startup")
    async def start_worker() -> None:
        nonlocal _worker_task
        _worker_task = asyncio.create_task(run_worker())
        logger.info("Email worker task started")

    @app.on_event("shutdown")
    async def stop_worker() -> None:
        if _worker_task:
            _worker_task.cancel()
            try:
                await _worker_task
            except asyncio.CancelledError:
                pass

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
