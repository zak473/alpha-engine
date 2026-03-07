"""
FastAPI application entrypoint.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.deps import get_db
from api.exceptions import register_exception_handlers
from api.middleware import RequestLoggingMiddleware
from api.routers import auth, challenges, esports, matches, picks, predictions, soccer, tennis, tipsters
from api.sports.soccer import routes as soccer_sport
from api.sports.tennis import routes as tennis_sport
from api.sports.esports import routes as esports_sport
from api.sports.basketball import routes as basketball_sport
from api.sports.baseball import routes as baseball_sport
from config.settings import settings

# ─── Logging setup ────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger("alpha_engine")


# ─── Lifespan (scheduler start/stop) ─────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background scheduler on startup; stop it on shutdown."""
    # Run stale-match cleanup + full fetch immediately on startup
    try:
        from pipelines.scheduler import _job_expire_stale
        _job_expire_stale()
        logger.info("Startup: stale live match cleanup done.")
    except Exception as exc:
        logger.warning("Startup stale cleanup failed: %s", exc)

    try:
        import threading
        from pipelines.scheduler import _job_fetch_live
        t = threading.Thread(target=_job_fetch_live, daemon=True, name="startup-fetch")
        t.start()
        logger.info("Startup: background fetch_live triggered.")
    except Exception as exc:
        logger.warning("Startup fetch_live failed to launch: %s", exc)

    if settings.SCHEDULER_ENABLED and settings.FOOTBALL_DATA_API_KEY:
        from pipelines.scheduler import start as start_scheduler
        start_scheduler()
        logger.info("Background data scheduler started.")
    else:
        if not settings.FOOTBALL_DATA_API_KEY:
            logger.warning(
                "FOOTBALL_DATA_API_KEY is not set — live data fetching disabled. "
                "Add your free key from football-data.org to .env to enable it."
            )
        else:
            logger.info("Scheduler disabled via SCHEDULER_ENABLED=false.")
    yield
    # Shutdown
    try:
        from pipelines.scheduler import stop as stop_scheduler
        stop_scheduler()
    except Exception:
        pass


# ─── App ──────────────────────────────────────────────────────────────────

app = FastAPI(
    lifespan=lifespan,
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

app.include_router(auth.router,        prefix=settings.API_PREFIX)
app.include_router(soccer.router,      prefix=settings.API_PREFIX)
app.include_router(tennis.router,      prefix=settings.API_PREFIX)
app.include_router(esports.router,     prefix=settings.API_PREFIX)
app.include_router(predictions.router, prefix=settings.API_PREFIX)
app.include_router(challenges.router,  prefix=settings.API_PREFIX)
app.include_router(matches.router,     prefix=settings.API_PREFIX)
app.include_router(picks.router,       prefix=settings.API_PREFIX)
app.include_router(tipsters.router,    prefix=settings.API_PREFIX)

from api.routers import bankroll
app.include_router(bankroll.router,    prefix=settings.API_PREFIX)

# ── Sport-specific match routes ────────────────────────────────────────────
app.include_router(soccer_sport.router,      prefix=settings.API_PREFIX)
app.include_router(tennis_sport.router,      prefix=settings.API_PREFIX)
app.include_router(esports_sport.router,     prefix=settings.API_PREFIX)
app.include_router(basketball_sport.router,  prefix=settings.API_PREFIX)
app.include_router(baseball_sport.router,    prefix=settings.API_PREFIX)

# ─── Health / readiness probes ────────────────────────────────────────────


@app.get("/health", tags=["Health"])
def health():
    """Liveness probe — always returns 200 if the process is running."""
    return {"status": "ok", "env": settings.ENV}


@app.post("/api/v1/admin/sync", tags=["Health"])
def trigger_sync(background_tasks=None):
    """
    Manually trigger a live-data fetch + prediction run.
    Useful for testing or forcing a refresh outside the 6h schedule.
    """
    import threading

    def _run():
        total = 0
        try:
            from pipelines.soccer.fetch_live import fetch_all as fetch_soccer
            total += fetch_soccer(run_predict=True)
        except Exception as exc:
            logger.error("[manual sync] Soccer failed: %s", exc, exc_info=True)
        try:
            from pipelines.tennis.fetch_live import fetch_all as fetch_tennis
            total += fetch_tennis()
        except Exception as exc:
            logger.error("[manual sync] Tennis failed: %s", exc, exc_info=True)
        try:
            from pipelines.esports.fetch_live import fetch_all as fetch_esports
            total += fetch_esports()
        except Exception as exc:
            logger.error("[manual sync] Esports failed: %s", exc, exc_info=True)
        try:
            from pipelines.basketball.fetch_live import fetch_all as fetch_basketball
            total += fetch_basketball()
        except Exception as exc:
            logger.error("[manual sync] Basketball failed: %s", exc, exc_info=True)
        try:
            from pipelines.baseball.fetch_live import fetch_all as fetch_baseball
            total += fetch_baseball()
        except Exception as exc:
            logger.error("[manual sync] Baseball failed: %s", exc, exc_info=True)
        logger.info("[manual sync] Done — %d total rows.", total)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return {"status": "sync started", "note": "Check server logs for progress."}


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
