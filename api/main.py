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

from api.deps import get_db, get_current_user
from api.exceptions import register_exception_handlers
from api.middleware import RequestLoggingMiddleware
from api.routers import auth, backtest, baseball as baseball_router, challenges, esports, matches, notifications, picks, predictions, reasoning, soccer, standings as standings_router, tennis, tipsters
from api.sports.soccer import routes as soccer_sport
from api.sports.tennis import routes as tennis_sport
from api.sports.esports import routes as esports_sport
from api.sports.baseball import routes as baseball_sport
from api.sports.basketball import routes as basketball_sport
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

def _wait_for_db(max_attempts: int = 10, delay: float = 3.0) -> bool:
    """Block until the DB accepts a connection, or give up after max_attempts."""
    import time
    from sqlalchemy import text
    from db.session import engine
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Startup: DB ready (attempt %d).", attempt)
            return True
        except Exception as exc:
            logger.warning("Startup: DB not ready (attempt %d/%d): %s", attempt, max_attempts, exc)
            if attempt < max_attempts:
                time.sleep(delay)
    logger.error("Startup: DB never became ready after %d attempts.", max_attempts)
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background scheduler on startup; stop it on shutdown."""

    def _background_startup():
        """All slow startup work runs here so uvicorn can respond to health checks immediately."""
        # Wait for DB
        _wait_for_db()

        # DB migrations: skipped at startup to avoid stale advisory lock hangs.
        # Migrations are applied manually via `alembic upgrade head` when needed.
        # create_all() below handles any missing tables as a safety net.

        # Safety net: create any missing tables
        try:
            from db.base import Base
            from db.session import engine
            import db.models  # noqa
            Base.metadata.create_all(bind=engine)
            logger.info("Startup: create_all safety net complete.")
        except Exception as exc:
            logger.warning("Startup: create_all failed: %s", exc)

        # Ensure live ML models are registered in model_registry
        try:
            import os as _os, joblib as _jl
            from db.session import SessionLocal as _SL
            from db.models.mvp import ModelRegistry as _MR
            from datetime import datetime, timezone
            _LIVE_MODELS = {
                "soccer":     "soccer_lgb_v18",
                "tennis":     "tennis_lr_v7",
                "esports":    "esports_lr_v3",
                "baseball":   "baseball_lr_v3",
                "basketball": "basketball_lr_v4",
                "hockey":     "hockey_lr_v4",
            }
            _artefacts_dir = "/app/artefacts"
            import glob as _glob
            _found = [_os.path.basename(f) for f in _glob.glob(_os.path.join(_artefacts_dir, "*.joblib"))]
            logger.info("Startup: artefacts in image: %s", _found)
            _sess = _SL()
            try:
                for _sport, _mname in _LIVE_MODELS.items():
                    _path = _os.path.join(_artefacts_dir, f"{_mname}.joblib")
                    if not _os.path.exists(_path):
                        continue
                    _existing = _sess.query(_MR).filter_by(sport=_sport, is_live=True).first()
                    # Register if missing, or update if the registered path no longer exists
                    _needs_update = (
                        _existing is None or
                        not _os.path.exists(_existing.artifact_path)
                    )
                    if _needs_update:
                        _payload = _jl.load(_path)
                        _feat_names = _payload.get("feature_names", [])
                        if _existing:
                            _existing.model_name = _mname
                            _existing.artifact_path = _path
                            _existing.feature_names = _feat_names
                            _existing.trained_at = datetime.now(timezone.utc)
                            logger.info("Startup: updated %s model → %s in model_registry.", _sport, _mname)
                        else:
                            _reg = _MR(
                                sport=_sport,
                                model_name=_mname,
                                artifact_path=_path,
                                feature_names=_feat_names,
                                is_live=True,
                                trained_at=datetime.now(timezone.utc),
                            )
                            _sess.add(_reg)
                            logger.info("Startup: registered %s model %s in model_registry.", _sport, _mname)
                _sess.commit()
            except Exception as _exc:
                _sess.rollback()
                logger.warning("Startup: model registry check failed: %s", _exc)
            finally:
                _sess.close()
        except Exception as exc:
            logger.warning("Startup: model registry auto-register failed: %s", exc)

        # Expire stale live matches
        try:
            from pipelines.scheduler import _job_expire_stale
            _job_expire_stale()
            logger.info("Startup: stale live match cleanup done.")
        except Exception as exc:
            logger.warning("Startup stale cleanup failed: %s", exc)

        # Per-sport backfill checks
        from db.session import SessionLocal
        from db.models.mvp import CoreMatch
        import threading as _th

        def _sport_count(sport: str) -> int:
            _db = SessionLocal()
            try:
                return _db.query(CoreMatch).filter(
                    CoreMatch.sport == sport, CoreMatch.status == "finished"
                ).count()
            finally:
                _db.close()

        # Tennis backfill
        try:
            _tennis_finished = _sport_count("tennis")
            if _tennis_finished < 500:
                logger.info("Startup: %d finished tennis matches — triggering Sackmann backfill.", _tennis_finished)
                def _run_tennis_backfill():
                    try:
                        from pipelines.tennis.backfill_history import run as bh_run
                        n = bh_run()
                        logger.info("Startup: tennis backfill complete (%d matches).", n)
                        from pipelines.tennis.backfill_elo import run_backfill as elo_run
                        elo_run()
                        logger.info("Startup: tennis ELO backfill complete.")
                        from pipelines.tennis.fetch_api_tennis import build_player_form
                        n2 = build_player_form()
                        logger.info("Startup: tennis player form built (%d rows).", n2)
                        from pipelines.tennis.fetch_player_profiles import run as prof_run
                        prof_run()
                        logger.info("Startup: tennis player profiles linked.")
                    except Exception as _exc:
                        logger.error("Startup tennis backfill chain failed: %s", _exc, exc_info=True)
                _th.Thread(target=_run_tennis_backfill, daemon=True, name="tennis-history").start()
            else:
                logger.info("Startup: %d finished tennis matches — skipping Sackmann backfill.", _tennis_finished)
        except Exception as exc:
            logger.warning("Startup tennis backfill check failed: %s", exc)

        # Soccer backfill
        if settings.HIGHLIGHTLY_API_KEY:
            try:
                _soccer_finished = _sport_count("soccer")
                if _soccer_finished < 1000:
                    logger.info("Startup: %d finished soccer matches — triggering Highlightly backfill.", _soccer_finished)
                    def _run_soccer_backfill():
                        try:
                            from pipelines.highlightly.fetch_all import fetch_historical
                            fetch_historical(days_back=730)
                            logger.info("Startup: soccer Highlightly backfill complete.")
                            from pipelines.soccer.backfill_elo import run_backfill as _elo
                            _elo()
                            logger.info("Startup: soccer ELO backfill complete.")
                            from pipelines.soccer.build_soccer_features import run as _feat
                            _feat()
                            logger.info("Startup: soccer features built.")
                        except Exception as _exc:
                            logger.error("Startup soccer backfill failed: %s", _exc, exc_info=True)
                    _th.Thread(target=_run_soccer_backfill, daemon=True, name="soccer-history").start()
                else:
                    logger.info("Startup: %d finished soccer matches — skipping backfill.", _soccer_finished)
            except Exception as exc:
                logger.warning("Startup soccer backfill check failed: %s", exc)

        # Baseball backfill
        try:
            _baseball_finished = _sport_count("baseball")
            if _baseball_finished < 500:
                logger.info("Startup: %d finished baseball matches — triggering Retrosheet backfill.", _baseball_finished)
                def _run_baseball_backfill():
                    try:
                        from pipelines.baseball.backfill_history import run as bh_run
                        n = bh_run()
                        logger.info("Startup: baseball backfill complete (%d matches).", n)
                        from pipelines.baseball.backfill_elo import run_backfill as _elo
                        _elo()
                        logger.info("Startup: baseball ELO backfill complete.")
                    except Exception as _exc:
                        logger.error("Startup baseball backfill failed: %s", _exc, exc_info=True)
                _th.Thread(target=_run_baseball_backfill, daemon=True, name="baseball-history").start()
            else:
                logger.info("Startup: %d finished baseball matches — skipping backfill.", _baseball_finished)
        except Exception as exc:
            logger.warning("Startup baseball backfill check failed: %s", exc)

        # Hockey backfill
        try:
            _hockey_finished = _sport_count("hockey")
            if _hockey_finished < 200:
                logger.info("Startup: %d finished hockey matches — triggering NHL backfill.", _hockey_finished)
                def _run_hockey_backfill():
                    try:
                        from pipelines.hockey.fetch_stats import fetch_all as stats_run
                        stats_run(days_back=30)
                        logger.info("Startup: hockey stats fetch complete.")
                        from pipelines.hockey.backfill_elo import run_backfill as _elo
                        _elo()
                        logger.info("Startup: hockey ELO backfill complete.")
                    except Exception as _exc:
                        logger.error("Startup hockey backfill failed: %s", _exc, exc_info=True)
                _th.Thread(target=_run_hockey_backfill, daemon=True, name="hockey-history").start()
            else:
                logger.info("Startup: %d finished hockey matches — skipping backfill.", _hockey_finished)
        except Exception as exc:
            logger.warning("Startup hockey backfill check failed: %s", exc)

        # API key health report
        KEY_MAP = {
            "TENNIS_LIVE_API_KEY":   ("Tennis live scores (api-tennis.com)", settings.TENNIS_LIVE_API_KEY),
            "ODDS_API_KEY":          ("Real market odds + auto-pick", settings.ODDS_API_KEY),
            "HIGHLIGHTLY_API_KEY":   ("Highlightly (soccer/basketball/baseball/hockey)", settings.HIGHLIGHTLY_API_KEY),
            "RACING_API_USERNAME":   ("Horse racing (theracingapi.com)", settings.RACING_API_USERNAME),
        }
        active   = [(k, desc) for k, (desc, val) in KEY_MAP.items() if val]
        inactive = [(k, desc) for k, (desc, val) in KEY_MAP.items() if not val]
        if active:
            logger.info("Pipeline keys configured (%d/%d): %s", len(active), len(KEY_MAP),
                        ", ".join(f"{k} ({desc})" for k, desc in active))
        if inactive:
            logger.warning("Pipeline keys missing (%d/%d) — those feeds disabled: %s",
                           len(inactive), len(KEY_MAP),
                           ", ".join(f"{k} ({desc})" for k, desc in inactive))

    # Launch all slow startup work in the background so uvicorn can answer health checks immediately
    import threading as _th_main
    _th_main.Thread(target=_background_startup, daemon=True, name="startup-bg").start()

    if settings.ENV == "production" and SECRET_KEY_IS_DEFAULT:
        logger.critical(
            "JWT_SECRET is set to the default value in production! "
            "Set a strong JWT_SECRET environment variable immediately."
        )

    if settings.SCHEDULER_ENABLED:
        from pipelines.scheduler import start as start_scheduler
        start_scheduler()
        logger.info("Background data scheduler started.")
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
app.include_router(reasoning.router,   prefix=settings.API_PREFIX)
app.include_router(challenges.router,  prefix=settings.API_PREFIX)
app.include_router(matches.router,     prefix=settings.API_PREFIX)
app.include_router(picks.router,       prefix=settings.API_PREFIX)
app.include_router(tipsters.router,    prefix=settings.API_PREFIX)
app.include_router(notifications.router, prefix=settings.API_PREFIX)

from api.routers import bankroll
app.include_router(bankroll.router,    prefix=settings.API_PREFIX)
app.include_router(standings_router.router)
app.include_router(backtest.router,    prefix=settings.API_PREFIX)
app.include_router(baseball_router.router,   prefix=settings.API_PREFIX)

# ── Sport-specific match routes ────────────────────────────────────────────
app.include_router(soccer_sport.router,      prefix=settings.API_PREFIX)
app.include_router(tennis_sport.router,      prefix=settings.API_PREFIX)
app.include_router(esports_sport.router,     prefix=settings.API_PREFIX)
app.include_router(baseball_sport.router,    prefix=settings.API_PREFIX)
app.include_router(basketball_sport.router,  prefix=settings.API_PREFIX)
app.include_router(hockey_sport.router,      prefix=settings.API_PREFIX)

# ─── Shared endpoints ─────────────────────────────────────────────────────

@app.get("/api/v1/sports/elo-movers", tags=["ELO"], dependencies=[Depends(get_current_user)])
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


@app.post("/api/v1/admin/sync", tags=["Admin"], dependencies=[Depends(get_current_user)])
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
            from pipelines.baseball.fetch_live import fetch_all as fetch_baseball
            total += fetch_baseball()
        except Exception as exc:
            logger.error("[manual sync] Baseball failed: %s", exc, exc_info=True)
        logger.info("[manual sync] Done — %d total rows.", total)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return {"status": "sync started", "note": "Check server logs for progress."}


@app.post("/api/v1/admin/sync-odds", tags=["Admin"], dependencies=[Depends(get_current_user)])
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


@app.get("/api/v1/admin/test-highlightly", tags=["Admin"], dependencies=[Depends(get_current_user)])
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


@app.post("/api/v1/admin/sync-highlightly", tags=["Admin"], dependencies=[Depends(get_current_user)])
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


@app.post("/api/v1/admin/sync-standings", tags=["Admin"], dependencies=[Depends(get_current_user)])
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


@app.post("/api/v1/admin/sync-highlightly-history", tags=["Admin"], dependencies=[Depends(get_current_user)])
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


@app.post("/api/v1/admin/rebuild-tennis-data", tags=["Admin"], dependencies=[Depends(get_current_user)])
def trigger_rebuild_tennis_data():
    """
    Trigger full tennis data pipeline in background:
    backfill_history (Sackmann 2015-2024) → backfill_elo → build_player_form → fetch_player_profiles.
    Safe to call multiple times (idempotent). Check Railway logs for progress.
    """
    import threading as _th
    def _run():
        try:
            from pipelines.tennis.backfill_history import run as bh_run
            n = bh_run()
            logger.info("[tennis-rebuild] backfill_history: %d matches.", n)
            from pipelines.tennis.backfill_elo import run_backfill as elo_run
            elo_run()
            logger.info("[tennis-rebuild] backfill_elo done.")
            from pipelines.tennis.fetch_api_tennis import build_player_form
            n2 = build_player_form()
            logger.info("[tennis-rebuild] build_player_form: %d rows.", n2)
            from pipelines.tennis.fetch_player_profiles import run as prof_run
            prof_run()
            logger.info("[tennis-rebuild] fetch_player_profiles done.")
        except Exception as exc:
            logger.error("[tennis-rebuild] failed: %s", exc, exc_info=True)
    _th.Thread(target=_run, daemon=True, name="tennis-rebuild").start()
    return {"status": "started", "note": "Tennis full data rebuild running in background. Check Railway logs."}


@app.post("/api/v1/admin/rebuild-soccer-features", tags=["Admin"], dependencies=[Depends(get_current_user)])
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



@app.post("/api/v1/admin/rebuild-baseball-data", tags=["Admin"], dependencies=[Depends(get_current_user)])
def trigger_rebuild_baseball_data():
    """Full baseball data rebuild: backfill_history (MLB 2015-2025) → backfill_elo."""
    import threading as _th
    def _run():
        try:
            from pipelines.baseball.backfill_history import run as bh_run
            n = bh_run()
            logger.info("[baseball-rebuild] backfill_history: %d matches.", n)
            from pipelines.baseball.backfill_elo import run_backfill as elo_run
            elo_run()
            logger.info("[baseball-rebuild] backfill_elo done.")
        except Exception as exc:
            logger.error("[baseball-rebuild] failed: %s", exc, exc_info=True)
    _th.Thread(target=_run, daemon=True, name="baseball-rebuild").start()
    return {"status": "started", "note": "Baseball data rebuild running. Check Railway logs."}


@app.post("/api/v1/admin/rebuild-esports-data", tags=["Admin"], dependencies=[Depends(get_current_user)])
def trigger_rebuild_esports_data():
    """Esports ELO backfill (recalculates ratings from existing match history)."""
    import threading as _th
    def _run():
        try:
            from pipelines.esports.backfill_elo import run_backfill as elo_run
            elo_run()
            logger.info("[esports-rebuild] backfill_elo done.")
        except Exception as exc:
            logger.error("[esports-rebuild] failed: %s", exc, exc_info=True)
    _th.Thread(target=_run, daemon=True, name="esports-rebuild").start()
    return {"status": "started", "note": "Esports data rebuild running. Check Railway logs."}


@app.post("/api/v1/admin/rebuild-soccer-data", tags=["Admin"], dependencies=[Depends(get_current_user)])
def trigger_rebuild_soccer_data():
    """Full soccer data rebuild: highlightly history → backfill_elo → build_soccer_features."""
    import threading as _th
    def _run():
        try:
            from pipelines.highlightly.fetch_all import fetch_historical
            n = fetch_historical(days_back=730)
            logger.info("[soccer-rebuild] highlightly history: %d rows.", n)
            from pipelines.soccer.backfill_elo import run_backfill as elo_run
            elo_run()
            logger.info("[soccer-rebuild] backfill_elo done.")
            from pipelines.soccer.build_soccer_features import run as feat_run
            n2 = feat_run()
            logger.info("[soccer-rebuild] build_soccer_features: %d rows.", n2)
        except Exception as exc:
            logger.error("[soccer-rebuild] failed: %s", exc, exc_info=True)
    _th.Thread(target=_run, daemon=True, name="soccer-rebuild").start()
    return {"status": "started", "note": "Soccer data rebuild running. Check Railway logs."}


@app.post("/api/v1/admin/rebuild-hockey-data", tags=["Admin"], dependencies=[Depends(get_current_user)])
def trigger_rebuild_hockey_data():
    """Full hockey data rebuild: fetch_stats (NHL API, 30 days) → backfill_elo → train model."""
    import threading as _th
    def _run():
        try:
            from pipelines.hockey.fetch_stats import fetch_all as stats_run
            n = stats_run(days_back=30)
            logger.info("[hockey-rebuild] fetch_stats: %d games.", n)
            from pipelines.hockey.backfill_elo import run_backfill as elo_run
            elo_run()
            logger.info("[hockey-rebuild] backfill_elo done.")
            from pipelines.hockey.train_hockey_model import train
            train()
            logger.info("[hockey-rebuild] model trained.")
        except Exception as exc:
            logger.error("[hockey-rebuild] failed: %s", exc, exc_info=True)
    _th.Thread(target=_run, daemon=True, name="hockey-rebuild").start()
    return {"status": "started", "note": "Hockey data rebuild running. Check Railway logs."}


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
