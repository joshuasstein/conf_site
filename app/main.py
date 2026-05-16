import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_settings
from app.errors import Conflict, InvalidOperation, NotFound, PayloadTooLarge, PermissionDenied, Unauthorized
from app.routers import admin, auth, decisions, files, notifications, reviews, sessions, submissions
from app.workers.email_worker import run_worker

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    limiter = Limiter(key_func=get_remote_address)
    app = FastAPI(title="Conference Abstract Management System", version="1.0.0")
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.exception_handler(NotFound)
    async def not_found_handler(_: Request, exc: NotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(PermissionDenied)
    async def permission_denied_handler(_: Request, exc: PermissionDenied) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    @app.exception_handler(Unauthorized)
    async def unauthorized_handler(_: Request, exc: Unauthorized) -> JSONResponse:
        return JSONResponse(status_code=401, content={"detail": str(exc)})

    @app.exception_handler(InvalidOperation)
    async def invalid_operation_handler(_: Request, exc: InvalidOperation) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(Conflict)
    async def conflict_handler(_: Request, exc: Conflict) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(PayloadTooLarge)
    async def payload_too_large_handler(_: Request, exc: PayloadTooLarge) -> JSONResponse:
        return JSONResponse(status_code=413, content={"detail": str(exc)})

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(settings.frontend_url).rstrip("/")],
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
