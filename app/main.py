import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.limiter import limiter
from app.errors import Conflict, InvalidOperation, NotFound, PayloadTooLarge, PermissionDenied, Unauthorized
from app.routers import admin, auth, decisions, files, notifications, reviews, sessions, submissions
from app.workers.email_worker import run_worker

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    # Error tracking. No-op unless SENTRY_DSN is set, so local/dev and tests are
    # unaffected. Errors-only (no performance tracing) to keep it free/lightweight.
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.sentry_environment,
            traces_sample_rate=0.0,
            send_default_pii=False,
        )
        logger.info("Sentry error tracking enabled (env=%s)", settings.sentry_environment)

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

    allowed_origin = str(settings.frontend_url).rstrip("/")

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        # Unhandled 500s are raised by Starlette's ServerErrorMiddleware, which sits
        # OUTSIDE CORSMiddleware — so without this, the response carries no CORS headers
        # and the browser reports a generic "Load failed" instead of the real error.
        # Log the full traceback server-side and echo CORS headers so the client can
        # read the 500 (and its status) in devtools.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        if settings.sentry_dsn:
            import sentry_sdk

            sentry_sdk.capture_exception(exc)
        headers: dict[str, str] = {}
        origin = request.headers.get("origin")
        if origin and origin == allowed_origin:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
            headers["Vary"] = "Origin"
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
            headers=headers,
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[allowed_origin],
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

    # Opt-in verification endpoint: raises on purpose so you can confirm errors
    # reach Sentry. Only registered when SENTRY_DEBUG_ENDPOINT is true; turn it off
    # once you've verified. The unhandled-exception handler will report it to Sentry.
    if settings.sentry_debug_endpoint:
        @app.get("/api/v1/debug/sentry-test")
        async def _sentry_test() -> dict:
            raise RuntimeError("Sentry test error — if you see this in Sentry, it works")

    return app


app = create_app()
