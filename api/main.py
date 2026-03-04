"""
FastAPI application entrypoint.
"""

import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.deps import get_db
from api.exceptions import register_exception_handlers
from api.middleware import RequestLoggingMiddleware
from api.routers import challenges, esports, predictions, soccer, tennis
from config.settings import settings

# ─── Logging setup ────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger("alpha_engine")

# ─── App ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Alpha Engine",
    description="Institutional-grade sports prediction API",
    version="1.0.0",
    openapi_tags=[
        {"name": "Soccer",      "description": "Soccer match predictions, ELO ratings, H2H"},
        {"name": "Tennis",      "description": "Tennis match predictions, ELO ratings, H2H"},
        {"name": "Esports",     "description": "Esports match predictions, ELO ratings, H2H"},
        {"name": "Predictions", "description": "Unified prediction list and model performance metrics"},
        {"name": "Challenges",  "description": "Create/join prediction challenges, leaderboards"},
        {"name": "Health",      "description": "Health and readiness probes"},
    ],
)

# ─── Middleware ────────────────────────────────────────────────────────────

app.add_middleware(RequestLoggingMiddleware)

# CORS: allow all origins in dev/staging; restrict to CORS_ORIGINS in production
cors_origins = settings.CORS_ORIGINS if settings.ENV == "production" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Exception handlers ───────────────────────────────────────────────────

register_exception_handlers(app)

# ─── Routers ──────────────────────────────────────────────────────────────

app.include_router(soccer.router,      prefix=settings.API_PREFIX)
app.include_router(tennis.router,      prefix=settings.API_PREFIX)
app.include_router(esports.router,     prefix=settings.API_PREFIX)
app.include_router(predictions.router, prefix=settings.API_PREFIX)
app.include_router(challenges.router,  prefix=settings.API_PREFIX)

# ─── Health / readiness probes ────────────────────────────────────────────


@app.get("/health", tags=["Health"])
def health():
    """Liveness probe — always returns 200 if the process is running."""
    return {"status": "ok", "env": settings.ENV}


@app.get("/ready", tags=["Health"])
def readiness_check(db: Session = Depends(get_db)):
    """
    Readiness probe — checks DB connectivity.
    Returns 200 if DB is reachable, 503 if not.
    """
    from fastapi.responses import JSONResponse

    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": True}
    except Exception as exc:
        logger.warning("DB not reachable during readiness check: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "db": False},
        )
