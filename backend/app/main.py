import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging, get_logger
from app.core.openapi_metadata import (
    CONTACT,
    DESCRIPTION,
    LICENSE,
    SERVERS,
    SUMMARY,
    TAGS_METADATA,
    TITLE,
    VERSION,
)

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log.info(
        "startup",
        env=settings.APP_ENV,
        version=VERSION,
        runs_dir=str(settings.runs_dir),
        db=settings.is_db_configured,
        storage=settings.is_storage_configured,
        llm=settings.is_llm_configured,
    )
    yield
    log.info("shutdown")


_docs_enabled = not settings.is_production

app = FastAPI(
    title=TITLE,
    summary=SUMMARY,
    description=DESCRIPTION,
    version=VERSION,
    contact=CONTACT,
    license_info=LICENSE,
    servers=SERVERS,
    openapi_tags=TAGS_METADATA,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
    swagger_ui_parameters={"displayRequestDuration": True, "filter": True},
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-Atlas-Cache"],
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    structlog.contextvars.bind_contextvars(request_id=request_id)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    structlog.contextvars.clear_contextvars()
    return response


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled_error", path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred.",
                "details": {},
            }
        },
    )


app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get("/health", tags=["health"], summary="Liveness probe")
async def health():
    return {"status": "ok", "version": VERSION}


@app.get("/health/ready", tags=["health"], summary="Readiness probe")
async def readiness():
    """What Atlas can currently do.

    Supabase and MinIO being absent is *not* unready — the hazard dashboard,
    the sweeps and the reviewed relief content all work without them, and only
    the community layer hides itself. They are reported as `not_configured` so
    an operator can see the difference between a service that is off and one
    that is broken.
    """
    import redis

    checks: dict[str, str] = {}

    try:
        redis.from_url(settings.REDIS_URL).ping()
        checks["redis"] = "ok"
    except Exception as exc:
        log.warning("readiness_redis_failed", error=str(exc))
        checks["redis"] = "unavailable"

    runs = settings.runs_dir
    checks["runs"] = "ok" if runs.is_dir() else "missing"

    checks["supabase"] = "configured" if settings.is_db_configured else "not_configured"
    checks["storage"] = "configured" if settings.is_storage_configured else "not_configured"

    # Only the pieces Atlas genuinely cannot run without gate readiness.
    required_ok = checks["redis"] == "ok" and checks["runs"] == "ok"
    return JSONResponse(
        status_code=200 if required_ok else 503,
        content={"status": "ready" if required_ok else "degraded", "checks": checks},
    )
