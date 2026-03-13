"""
FastAPI application entrypoint.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

# Rate limiting (optional — degrades gracefully if slowapi not installed)
_rate_limiter = None
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    _rate_limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
except ImportError:
    pass
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.deps import get_db
from api.exceptions import register_exception_handlers
from api.middleware import RequestLoggingMiddleware
from api.routers import auth, backtest, basketball as basketball_router, baseball as baseball_router, challenges, esports, matches, notifications, picks, predictions, soccer, standings as standings_router, tennis, tipsters
from api.sports.soccer import routes as soccer_sport
from api.sports.tennis import routes as tennis_sport
from api.sports.esports import routes as esports_sport
from api.sports.basketball import routes as basketball_sport
from api.sports.baseball import routes as baseball_sport
from api.sports.hockey import routes as hockey_sport
from config.settings import settings

SECRET_KEY_IS_DEFAULT = (
    not __import__("os").environ.get("JWT_SECRET")
    or __import__("os").environ.get("JWT_SECRET") == "change-me-in-production-please"
)

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
    # Run DB migrations on startup
    try:
        from alembic.config import Config
        from alembic import command
        import os
        alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
        alembic_cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
        command.upgrade(alembic_cfg, "head")
        logger.info("Startup: DB migrations applied.")
    except Exception as exc:
        logger.warning("Startup: DB migration failed (continuing): %s", exc)

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

    # Highlightly historical backfill — runs only when DB has < 1000 finished matches
    # (first deploy or fresh DB). Skips on subsequent restarts.
    if settings.HIGHLIGHTLY_API_KEY:
        try:
            import threading as _th
            from db.session import SessionLocal
            from db.models.mvp import CoreMatch
            _db = SessionLocal()
            try:
                _finished = _db.query(CoreMatch).filter(CoreMatch.status == "finished").count()
            finally:
                _db.close()
            if _finished < 1000:
                logger.info("Startup: DB has %d finished matches — triggering historical backfill (730 days).", _finished)
                from pipelines.highlightly.fetch_all import fetch_historical
                _th.Thread(target=fetch_historical, kwargs={"days_back": 730}, daemon=True, name="hl-history").start()
            else:
                logger.info("Startup: DB has %d finished matches — skipping historical backfill.", _finished)
        except Exception as exc:
            logger.warning("Startup historical backfill failed to launch: %s", exc)

    # ── API key health report ──────────────────────────────────────────────
    KEY_MAP = {
        "FOOTBALL_DATA_API_KEY": ("Soccer fixtures/results",     settings.FOOTBALL_DATA_API_KEY),
        "TENNIS_API_KEY":        ("Tennis fixtures (Odds API)",   settings.TENNIS_API_KEY),
        "TENNIS_LIVE_API_KEY":   ("Tennis live scores",           settings.TENNIS_LIVE_API_KEY),
        "ESPORTS_API_KEY":       ("Esports (PandaScore)",         settings.ESPORTS_API_KEY),
        "ODDS_API_KEY":          ("Real market odds + auto-pick", settings.ODDS_API_KEY),
        "HIGHLIGHTLY_API_KEY":   ("Highlightly (soccer/basketball/baseball/hockey)", settings.HIGHLIGHTLY_API_KEY),
    }
    active   = [(k, desc) for k, (desc, val) in KEY_MAP.items() if val]
    inactive = [(k, desc) for k, (desc, val) in KEY_MAP.items() if not val]

    if active:
        logger.info(
            "Pipeline keys configured (%d/%d): %s",
            len(active), len(KEY_MAP),
            ", ".join(f"{k} ({desc})" for k, desc in active),
        )
    if inactive:
        logger.warning(
            "Pipeline keys missing (%d/%d) — those feeds disabled: %s",
            len(inactive), len(KEY_MAP),
            ", ".join(f"{k} ({desc})" for k, desc in inactive),
        )

    if settings.ENV == "production" and SECRET_KEY_IS_DEFAULT:
        logger.critical(
            "JWT_SECRET is set to the default value in production! "
            "Set a strong JWT_SECRET environment variable immediately."
        )

    if settings.SCHEDULER_ENABLED:
        from pipelines.scheduler import start as start_scheduler
        start_scheduler()
        logger.info("Background data scheduler started.")
        if not settings.FOOTBALL_DATA_API_KEY:
            logger.info(
                "FOOTBALL_DATA_API_KEY not set — football-data.org soccer feed disabled. "
                "Using Highlightly + other configured APIs instead."
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

# ─── Rate limiting ────────────────────────────────────────────────────────

if _rate_limiter is not None:
    app.state.limiter = _rate_limiter
    from slowapi.errors import RateLimitExceeded
    from slowapi import _rate_limit_exceeded_handler
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(notifications.router, prefix=settings.API_PREFIX)

from api.routers import bankroll
app.include_router(bankroll.router,    prefix=settings.API_PREFIX)
app.include_router(standings_router.router)
app.include_router(backtest.router,    prefix=settings.API_PREFIX)
app.include_router(basketball_router.router, prefix=settings.API_PREFIX)
app.include_router(baseball_router.router,   prefix=settings.API_PREFIX)

# ── Sport-specific match routes ────────────────────────────────────────────
app.include_router(soccer_sport.router,      prefix=settings.API_PREFIX)
app.include_router(tennis_sport.router,      prefix=settings.API_PREFIX)
app.include_router(esports_sport.router,     prefix=settings.API_PREFIX)
app.include_router(basketball_sport.router,  prefix=settings.API_PREFIX)
app.include_router(baseball_sport.router,    prefix=settings.API_PREFIX)
app.include_router(hockey_sport.router,      prefix=settings.API_PREFIX)

# ─── Shared endpoints ─────────────────────────────────────────────────────

@app.get("/api/v1/sports/elo-movers", tags=["ELO"])
def get_elo_movers(limit: int = 10, db: Session = Depends(get_db)):
    """Return top ELO rating movers (by absolute change) across all sports."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func
    from db.models.mvp import RatingEloTeam, CoreTeam, CoreMatch

    cutoff = datetime.now(timezone.utc) - timedelta(days=14)

    # Subquery: latest rating row per team within the window
    latest_subq = (
        db.query(
            RatingEloTeam.team_id,
            func.max(RatingEloTeam.rated_at).label("max_at"),
        )
        .filter(RatingEloTeam.context == "global", RatingEloTeam.rated_at >= cutoff)
        .group_by(RatingEloTeam.team_id)
        .subquery()
    )
    rows = (
        db.query(RatingEloTeam, CoreTeam)
        .join(latest_subq, (RatingEloTeam.team_id == latest_subq.c.team_id) & (RatingEloTeam.rated_at == latest_subq.c.max_at))
        .join(CoreTeam, CoreTeam.id == RatingEloTeam.team_id)
        .filter(RatingEloTeam.rating_before.isnot(None))
        .order_by(func.abs(RatingEloTeam.rating_after - RatingEloTeam.rating_before).desc())
        .limit(limit * 2)  # fetch extra to filter out player dupes
        .all()
    )

    # Build sport lookup from most recent CoreMatch per team
    team_ids = [team.id for _, team in rows]
    sport_subq = (
        db.query(CoreMatch.home_team_id, CoreMatch.sport, func.max(CoreMatch.kickoff_utc).label("latest"))
        .filter(CoreMatch.home_team_id.in_(team_ids))
        .group_by(CoreMatch.home_team_id, CoreMatch.sport)
        .subquery()
    )
    sport_map: dict[str, str] = {}
    for r in db.query(sport_subq).all():
        if r.home_team_id not in sport_map:
            sport_map[r.home_team_id] = r.sport

    result = []
    for elo, team in rows:
        if len(result) >= limit:
            break
        change = round(elo.rating_after - elo.rating_before, 1) if elo.rating_before else None
        sport = sport_map.get(team.id, "soccer")
        result.append({
            "entity_id": team.id,
            "name": team.name,
            "sport": sport,
            "rating": round(elo.rating_after, 1),
            "change": change,
            "context": elo.context,
        })
    return result


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


@app.post("/api/v1/admin/sync-odds", tags=["Health"])
def trigger_odds_sync(db: Session = Depends(get_db)):
    """Manually trigger fetch_odds and return how many matches were updated."""
    try:
        from pipelines.odds.fetch_odds import fetch_all as fetch_odds
        n = fetch_odds()
        from db.models.mvp import CoreMatch
        with_odds = db.query(CoreMatch).filter(CoreMatch.odds_home.isnot(None)).count()
        return {"status": "ok", "matches_updated": n, "total_matches_with_odds": with_odds}
    except Exception as exc:
        logger.error("[odds sync] failed: %s", exc, exc_info=True)
        return {"status": "error", "detail": str(exc)}


@app.get("/api/v1/admin/test-highlightly", tags=["Health"])
def test_highlightly_connection():
    """
    Test the Highlightly API key with a single request (avoids burning rate limit quota).
    429 = key is valid but rate limited. 200 = fully working.
    """
    try:
        from pipelines.highlightly.client import test_connection
        result = test_connection()
        return {"status": "ok", **result}
    except Exception as exc:
        logger.error("[highlightly test] %s", exc)
        return {"status": "error", "detail": str(exc)}


@app.post("/api/v1/admin/sync-highlightly", tags=["Health"])
def trigger_highlightly_sync(days_back: int = 90, db: Session = Depends(get_db)):
    """Manually trigger a Highlightly full sync and return row count."""
    try:
        from pipelines.highlightly.fetch_all import fetch_all as hl_fetch
        n = hl_fetch(days_back=days_back, days_ahead=14)
        from db.models.mvp import CoreMatch
        total = db.query(CoreMatch).filter(CoreMatch.provider_id.like("hl-%")).count()
        return {"status": "ok", "rows_ingested": n, "total_hl_matches_in_db": total}
    except Exception as exc:
        logger.error("[highlightly sync] failed: %s", exc, exc_info=True)
        return {"status": "error", "detail": str(exc)}


@app.post("/api/v1/admin/sync-standings", tags=["Health"])
def trigger_standings_sync():
    """Manually trigger a Highlightly standings sync for all active leagues."""
    import threading as _th
    def _run():
        try:
            from pipelines.highlightly.fetch_all import fetch_standings
            n = fetch_standings()
            logger.info("[standings sync] Done — %d rows synced.", n)
        except Exception as exc:
            logger.error("[standings sync] failed: %s", exc, exc_info=True)
    _th.Thread(target=_run, daemon=True, name="standings-sync").start()
    return {"status": "started", "note": "Check server logs for progress."}


@app.post("/api/v1/admin/sync-highlightly-history", tags=["Health"])
def trigger_highlightly_history(days_back: int = 730):
    """
    Trigger a one-time Highlightly historical backfill in the background.
    Fetches up to `days_back` days of past results for H2H data population.
    Default 730 days (≈ 2 years). Runs in background — check logs for progress.
    """
    import threading as _th
    def _run():
        try:
            from pipelines.highlightly.fetch_all import fetch_historical
            n = fetch_historical(days_back=days_back)
            logger.info("[history sync] Done — %d rows ingested.", n)
        except Exception as exc:
            logger.error("[history sync] failed: %s", exc, exc_info=True)
    _th.Thread(target=_run, daemon=True, name="highlightly-history").start()
    return {
        "status": "started",
        "days_back": days_back,
        "note": f"Fetching ~{days_back * 4} date/sport combinations. Check logs for progress.",
    }


@app.post("/api/v1/admin/rebuild-soccer-features", tags=["Health"])
def trigger_rebuild_soccer_features():
    """
    Rebuild feat_soccer_match rows from core_matches history.
    Run this after a historical sync to populate form data for all matches.
    """
    import threading as _th
    def _run():
        try:
            from pipelines.soccer.build_soccer_features import run as build_features
            n = build_features()
            logger.info("[soccer-features] Done — %d rows upserted.", n)
        except Exception as exc:
            logger.error("[soccer-features] failed: %s", exc, exc_info=True)
    _th.Thread(target=_run, daemon=True, name="soccer-features").start()
    return {"status": "started", "note": "Rebuilding feat_soccer_match. Check logs for progress."}


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
