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
    logging.getLogger("alpha_engine").info("Rate limiting: enabled (slowapi)")
except ImportError:
    _rate_limiter = None
    logging.getLogger("alpha_engine").warning(
        "⚠️  Rate limiting DISABLED — install slowapi to enable: pip install slowapi"
    )
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from api.exceptions import register_exception_handlers
from api.middleware import RequestLoggingMiddleware
from api.routers import admin as admin_router, advisor, auth, backtest, baseball as baseball_router, billing, challenges, esports, matches, notifications, picks, predictions, reasoning, soccer, standings as standings_router, tennis, tipsters
from api.sports.soccer import routes as soccer_sport
from api.sports.tennis import routes as tennis_sport
from api.sports.esports import routes as esports_sport
from api.sports.baseball import routes as baseball_sport
from api.sports.basketball import routes as basketball_sport
from api.sports.hockey import routes as hockey_sport
from api.sports.horseracing import routes as horseracing_sport
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

        # Ensure ai_tokens column exists (idempotent; handles pre-migration deployments)
        def _ensure_ai_tokens(retries: int = 20, delay: float = 30.0):
            import time as _time
            from db.session import engine as _eng
            for _attempt in range(1, retries + 1):
                try:
                    with _eng.connect() as _conn:
                        _conn.execute(text(
                            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_tokens INTEGER NOT NULL DEFAULT 10"
                        ))
                        _conn.commit()
                    logger.info("Startup: ai_tokens column ensured (attempt %d).", _attempt)
                    return
                except Exception as _exc:
                    logger.warning("Startup: ai_tokens column check failed (attempt %d/%d): %s", _attempt, retries, _exc)
                    if _attempt < retries:
                        _time.sleep(delay)
            logger.error("Startup: ai_tokens column could not be ensured after %d attempts.", retries)
        import threading as _ai_th
        _ai_th.Thread(target=_ensure_ai_tokens, daemon=True, name="ai-tokens-migration").start()

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

        # Seed AI tipster accounts (idempotent)
        try:
            from pipelines.tipsters.seed_ai_tipsters import seed as seed_tipsters
            seed_tipsters()
            logger.info("Startup: AI tipster seed complete.")
        except Exception as exc:
            logger.warning("Startup: AI tipster seed failed: %s", exc)

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
app.include_router(admin_router.router, prefix=settings.API_PREFIX)
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
app.include_router(billing.router,     prefix=settings.API_PREFIX, tags=["billing"])
app.include_router(advisor.router,     prefix=settings.API_PREFIX)
app.include_router(standings_router.router)
app.include_router(backtest.router,    prefix=settings.API_PREFIX)
app.include_router(baseball_router.router,   prefix=settings.API_PREFIX)

# ── Sport-specific match routes ────────────────────────────────────────────
app.include_router(soccer_sport.router,      prefix=settings.API_PREFIX)
app.include_router(tennis_sport.router,      prefix=settings.API_PREFIX)
app.include_router(esports_sport.router,     prefix=settings.API_PREFIX)
app.include_router(baseball_sport.router,    prefix=settings.API_PREFIX)
app.include_router(basketball_sport.router,   prefix=settings.API_PREFIX)
app.include_router(hockey_sport.router,       prefix=settings.API_PREFIX)
app.include_router(horseracing_sport.router,  prefix=settings.API_PREFIX)

# ─── Shared endpoints ─────────────────────────────────────────────────────

@app.post("/api/v1/admin/refetch-hockey", tags=["Admin"])
def admin_refetch_hockey(secret: str, db: Session = Depends(get_db)):
    """Backfill outcomes for finished hockey matches with null outcome, then settle tips.
    Matches Highlightly (hl-hockey-*) matches to NHL API scores by home/away team name + date.
    """
    if secret != settings.ADMIN_SETTLE_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    import httpx
    from datetime import date, timedelta
    from db.models.mvp import CoreMatch, CoreTeam

    from pipelines.tipsters.settle_tips import run as settle

    # All finished hockey matches with null outcome
    null_matches = (
        db.query(CoreMatch)
        .filter(CoreMatch.sport == "hockey", CoreMatch.status == "finished", CoreMatch.outcome.is_(None))
        .all()
    )

    # Build lookup by (date_str, home_name_lower, away_name_lower) → CoreMatch
    by_teams: dict[tuple, CoreMatch] = {}
    for m in null_matches:
        home_team = db.get(CoreTeam, m.home_team_id)
        away_team = db.get(CoreTeam, m.away_team_id)
        if not home_team or not away_team:
            continue
        d_str = m.kickoff_utc.strftime("%Y-%m-%d")
        key = (d_str, home_team.name.lower(), away_team.name.lower())
        by_teams[key] = m

    updated = 0
    today = date.today()
    for delta in range(0, 14):
        d = today - timedelta(days=delta)
        try:
            r = httpx.get(f"https://api-web.nhle.com/v1/score/{d.isoformat()}", timeout=15)
            if r.status_code != 200:
                continue
            games = r.json().get("games", [])
            for game in games:
                game_state = (game.get("gameState") or "").upper()
                if game_state not in ("OFF", "FINAL"):
                    continue
                home_d = game.get("homeTeam", {})
                away_d = game.get("awayTeam", {})
                h_score = home_d.get("score")
                a_score = away_d.get("score")
                if h_score is None or a_score is None:
                    continue
                # Get team names from NHL API
                def _nhl_name(td: dict) -> str:
                    name = td.get("name", {})
                    if isinstance(name, dict):
                        return (name.get("default") or "").lower().strip()
                    place = td.get("placeName", {})
                    common = td.get("commonName", {})
                    p = (place.get("default") if isinstance(place, dict) else "").strip()
                    c = (common.get("default") if isinstance(common, dict) else "").strip()
                    return f"{p} {c}".lower().strip() if p else c.lower()
                h_name = _nhl_name(home_d)
                a_name = _nhl_name(away_d)
                key = (d.isoformat(), h_name, a_name)
                # Try exact match first, then fuzzy (team name contained in other)
                m = by_teams.get(key)
                if m is None:
                    for (dk, hk, ak), candidate in list(by_teams.items()):
                        if dk == d.isoformat() and (h_name in hk or hk in h_name) and (a_name in ak or ak in a_name):
                            m = candidate
                            key = (dk, hk, ak)
                            break
                if m is None:
                    continue
                m.outcome = "home_win" if int(h_score) > int(a_score) else "away_win"
                m.home_score = int(h_score)
                m.away_score = int(a_score)
                updated += 1
                by_teams.pop(key, None)
        except Exception:
            continue

    if updated:
        db.commit()

    settled = settle(dry_run=False, all_users=False)
    return {"outcomes_backfilled": updated, "tips_settled": settled, "still_null": len(by_teams)}



@app.post("/api/v1/admin/fix-baseball-outcomes", tags=["Admin"])
def admin_fix_baseball_outcomes(secret: str, db: Session = Depends(get_db)):
    """
    One-off: normalize 'H'/'A' outcomes to 'home_win'/'away_win' for baseball matches,
    then re-settle all AI tipster tips (including already-settled ones) to fix wrong results.
    """
    if secret != settings.ADMIN_SETTLE_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    from db.models.mvp import CoreMatch
    from pipelines.tipsters.settle_tips import run as settle

    # Fix stored 'H'/'A' outcomes
    fixed = 0
    bad_matches = (
        db.query(CoreMatch)
        .filter(CoreMatch.sport == "baseball", CoreMatch.outcome.in_(["H", "A"]))
        .all()
    )
    for m in bad_matches:
        m.outcome = "home_win" if m.outcome == "H" else "away_win"
        fixed += 1
    if fixed:
        db.commit()

    # Re-settle all tips (including already wrong ones)
    resettled = settle(dry_run=False, all_users=True, recheck=True)
    return {"outcomes_fixed": fixed, "tips_resettled": resettled}


@app.delete("/api/v1/admin/purge-unsettleable-tips", tags=["Admin"])
def admin_purge_unsettleable_tips(secret: str, db: Session = Depends(get_db)):
    """Delete AI tipster tips where the match is finished but has no outcome and no scores (orphaned)."""
    if secret != settings.ADMIN_SETTLE_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    from db.models.mvp import CoreMatch
    from db.models.tipsters import TipsterTip
    from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

    ai_ids = set(AI_TIPSTER_IDS.values())
    pending = db.query(TipsterTip).filter(
        TipsterTip.user_id.in_(ai_ids),
        TipsterTip.outcome.is_(None),
        TipsterTip.match_id.isnot(None),
    ).all()

    deleted = 0
    for tip in pending:
        match = db.query(CoreMatch).filter(CoreMatch.id == tip.match_id).first()
        if (match and match.status == "finished"
                and not match.outcome
                and match.home_score in (None, "", "None")
                and match.away_score in (None, "", "None")):
            db.delete(tip)
            deleted += 1

    if deleted:
        db.commit()
    return {"deleted": deleted}


@app.delete("/api/v1/admin/nuke-ai-tips", tags=["Admin"])
def admin_nuke_ai_tips(secret: str, db: Session = Depends(get_db)):
    """Delete ALL pending AI tipster tips regardless of age."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    from db.models.tipsters import TipsterTip
    from db.models.picks import TrackedPick
    from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

    ai_ids = list(AI_TIPSTER_IDS.values())
    deleted = (
        db.query(TipsterTip)
        .filter(
            TipsterTip.user_id.in_(ai_ids),
            TipsterTip.outcome.is_(None),
        )
        .delete(synchronize_session=False)
    )
    # Also clear pending TrackedPick rows so dedup doesn't block regeneration
    deleted_picks = (
        db.query(TrackedPick)
        .filter(
            TrackedPick.user_id == settings.AUTO_PICK_USER_ID,
            TrackedPick.outcome.is_(None),
            TrackedPick.auto_generated.is_(True),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted_tips": int(deleted), "deleted_picks": int(deleted_picks)}


@app.get("/api/v1/admin/debug-sgo-odds", tags=["Admin"])
def admin_debug_sgo_odds(secret: str, sport: str = "soccer", limit: int = 20):
    """
    Debug SGO odds matching: fetch live SGO events for a sport and show which DB matches
    they would/wouldn't match, and what the name differences look like.
    """
    if secret != settings.ADMIN_SETTLE_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    import httpx
    from datetime import datetime, timedelta, timezone
    from db.session import SessionLocal
    from db.models.mvp import CoreMatch, CoreTeam
    from pipelines.odds.fetch_odds_sgo import LEAGUE_SPORT, fetch_sgo_events, _teams_match, _normalize, _extract_odds

    leagues = [k for k, v in LEAGUE_SPORT.items() if v == sport]

    db2 = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        soon = now + timedelta(days=60)  # wide window to catch all SGO fixtures
        upcoming = db2.query(CoreMatch).filter(
            CoreMatch.sport == sport,
            CoreMatch.status.in_(["scheduled", "live"]),
            CoreMatch.kickoff_utc > now,
            CoreMatch.kickoff_utc < soon,
        ).all()
        team_ids = set()
        for m in upcoming:
            team_ids.update([m.home_team_id, m.away_team_id])
        teams = {t.id: t.name for t in db2.query(CoreTeam).filter(CoreTeam.id.in_(team_ids)).all()}
        # Sample DB matches (first 10, sorted by date)
        sample_db = sorted(
            [{"date": m.kickoff_utc.isoformat(), "match": f"{teams.get(m.home_team_id,'')} vs {teams.get(m.away_team_id,'')}"}
             for m in upcoming[:50]],
            key=lambda x: x["date"]
        )[:10]
    finally:
        db2.close()

    results = []
    sgo_dates = []
    per_league_counts: dict = {}
    raw_sample: dict = {}  # first raw event per league (keys only, to diagnose structure)
    with httpx.Client() as client:
        for league_id in leagues:  # all leagues, not just [:3]
            events = fetch_sgo_events(league_id, client)
            per_league_counts[league_id] = len(events)
            if events and league_id not in raw_sample:
                ev0 = events[0]
                h_dec, a_dec, d_dec = _extract_odds(ev0)
                raw_sample[league_id] = {
                    "teams_home": (ev0.get("teams") or {}).get("home", {}).get("names", {}),
                    "teams_away": (ev0.get("teams") or {}).get("away", {}).get("names", {}),
                    "status_keys": list((ev0.get("status") or {}).keys()),
                    "odds_keys": list((ev0.get("odds") or {}).keys())[:20],
                    "extracted_home": h_dec,
                    "extracted_away": a_dec,
                    "extracted_draw": d_dec,
                }
            for ev in events[:limit]:
                sgo_home = (ev.get("teams") or {}).get("home", {}).get("names", {}).get("long", "")
                sgo_away = (ev.get("teams") or {}).get("away", {}).get("names", {}).get("long", "")
                sgo_start = (ev.get("status") or {}).get("startsAt", "")
                sgo_dates.append(str(sgo_start))
                h_dec, a_dec, d_dec = _extract_odds(ev)
                has_odds = bool(h_dec and a_dec)
                # Try to find a match (no time constraint in debug)
                matched = None
                for m in upcoming:
                    hn = teams.get(m.home_team_id, "")
                    an = teams.get(m.away_team_id, "")
                    if _teams_match(sgo_home, hn) and _teams_match(sgo_away, an):
                        matched = f"{hn} vs {an} ({m.kickoff_utc.date()})"
                        break
                results.append({
                    "league": league_id,
                    "sgo": f"{sgo_home} vs {sgo_away}",
                    "sgo_date": str(sgo_start),
                    "sgo_norm": f"{_normalize(sgo_home)} vs {_normalize(sgo_away)}",
                    "has_odds": has_odds,
                    "odds": {"home": h_dec, "away": a_dec, "draw": d_dec},
                    "matched_to": matched,
                })

    return {
        "sport": sport,
        "db_upcoming_60d": len(upcoming),
        "sample_db_matches": sample_db,
        "leagues_queried": leagues,
        "per_league_event_counts": per_league_counts,
        "raw_sample_first_event": raw_sample,
        "sgo_events_checked": len(results),
        "sgo_date_range": f"{min(sgo_dates, default='?')} → {max(sgo_dates, default='?')}",
        "with_odds": sum(1 for r in results if r["has_odds"]),
        "matched": sum(1 for r in results if r["matched_to"]),
        "matched_with_odds": sum(1 for r in results if r["matched_to"] and r["has_odds"]),
        "unmatched": [r for r in results if not r["matched_to"]],
        "matched_list": [r for r in results if r["matched_to"]],
    }


@app.post("/api/v1/admin/post-manual-tip", tags=["Admin"])
def admin_post_manual_tip(
    secret: str,
    user_id: str,
    sport: str,
    match_label: str,
    market_name: str,
    selection_label: str,
    odds: float,
    note: str = "",
    start_time: str = "",
):
    """Post a tip directly as any user (admin use only — for manually adding live picks)."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    from datetime import datetime, timezone
    from db.session import SessionLocal
    from db.models.tipsters import TipsterTip
    db = SessionLocal()
    try:
        kickoff = (
            datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            if start_time
            else datetime.now(timezone.utc)
        )
        tip = TipsterTip(
            user_id=user_id,
            sport=sport,
            match_label=match_label,
            market_name=market_name,
            selection_label=selection_label,
            odds=odds,
            start_time=kickoff,
            note=note or None,
        )
        db.add(tip)
        db.commit()
        db.refresh(tip)
        return {"status": "ok", "id": tip.id}
    finally:
        db.close()


@app.post("/api/v1/admin/settle-tip", tags=["Admin"])
def admin_settle_tip(secret: str, tip_id: str, outcome: str):
    """Manually settle a tip by ID. outcome must be 'won' or 'lost'."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    if outcome not in ("won", "lost"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="outcome must be 'won' or 'lost'")
    from datetime import datetime, timezone
    from db.session import SessionLocal
    from db.models.tipsters import TipsterTip
    db = SessionLocal()
    try:
        tip = db.get(TipsterTip, tip_id)
        if not tip:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"Tip {tip_id} not found")
        tip.outcome = outcome
        tip.settled_at = datetime.now(timezone.utc)
        db.commit()
        return {"status": "ok", "tip_id": tip_id, "outcome": outcome}
    finally:
        db.close()


@app.post("/api/v1/admin/clear-tennis-odds", tags=["Admin"])
def admin_clear_tennis_odds(secret: str):
    """
    Null out odds_home/odds_away for all upcoming tennis CoreMatch rows.
    Use this once to purge stale api-tennis odds so only SGO odds remain.
    """
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    from datetime import datetime, timezone
    from db.session import SessionLocal
    from db.models.mvp import CoreMatch
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        rows = db.query(CoreMatch).filter(
            CoreMatch.sport == "tennis",
            CoreMatch.status.in_(["scheduled", "live"]),
            CoreMatch.kickoff_utc > now,
            CoreMatch.odds_home.isnot(None),
        ).all()
        cleared = 0
        for m in rows:
            m.odds_home = None
            m.odds_away = None
            cleared += 1
        db.commit()
        return {"cleared": cleared}
    finally:
        db.close()


@app.post("/api/v1/admin/run-auto-picks", tags=["Admin"])
def admin_run_auto_picks(secret: str):
    """Manually trigger the auto-picks bot to regenerate tips."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    from pipelines.picks.auto_picks import run as run_auto_picks
    created = run_auto_picks()
    return {"created": created}


@app.post("/api/v1/admin/backfill-all-picks", tags=["Admin"])
def admin_backfill_all_picks(secret: str, days: int = 60):
    """Backfill TrackedPick + TipsterTip rows for all sports, running in background."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    import threading

    def _run():
        try:
            from pipelines.picks.backfill_picks import run as backfill
            n = backfill(days=days)
            log.info("[admin] backfill-all-picks: created %d picks (last %d days)", n, days)
        except Exception as exc:
            log.error("[admin] backfill-all-picks failed: %s", exc, exc_info=True)

    threading.Thread(target=_run, daemon=True, name="backfill-all-picks").start()
    return {"status": "started", "days": days, "message": f"Backfilling last {days} days for all sports in background."}


@app.get("/api/v1/admin/backfill-picks-diag", tags=["Admin"])
def admin_backfill_picks_diag(secret: str, days: int = 3, dry_run: bool = True):
    """Synchronous diagnostic: run backfill for a short window and return results or errors."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        from pipelines.picks.backfill_picks import run as backfill
        n = backfill(days=days, dry_run=dry_run)
        return {"status": "ok", "dry_run": dry_run, "days": days, "created": n}
    except Exception as exc:
        import traceback
        return {"status": "error", "error": str(exc), "trace": traceback.format_exc()[-3000:]}


@app.post("/api/v1/admin/backfill-spread-picks", tags=["Admin"])
def admin_backfill_spread_picks(secret: str, days: int = 60, dry_run: bool = False):
    """
    Backfill historical spread + Asian Handicap tips.

    Two sources:
    - Real SpreadOdds rows (SGO) for any finished match that has stored spread/OU lines.
    - Asian Handicap 0 (Draw No Bet) synthetic picks for soccer, using PredMatch
      model probability and standard -110 juice (1.909 decimal). Settled immediately.
    """
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    from pipelines.picks.backfill_spread_picks import run as backfill_spread
    created = backfill_spread(days=days, dry_run=dry_run)
    return {"created": created, "dry_run": dry_run}


@app.get("/api/v1/admin/pick-outcome-stats", tags=["Admin"])
def admin_pick_outcome_stats(secret: str, db: Session = Depends(get_db)):
    """Outcome distribution for all auto-generated picks."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    from db.models.picks import TrackedPick
    from sqlalchemy import func
    rows = (
        db.query(TrackedPick.sport, TrackedPick.outcome, func.count().label("n"))
        .filter(TrackedPick.auto_generated.is_(True))
        .group_by(TrackedPick.sport, TrackedPick.outcome)
        .order_by(TrackedPick.sport, TrackedPick.outcome)
        .all()
    )
    return [{"sport": r.sport, "outcome": r.outcome, "count": r.n} for r in rows]


@app.get("/api/v1/admin/tip-history", tags=["Admin"])
def admin_tip_history(secret: str, sport: str = "", db: Session = Depends(get_db)):
    """All TipsterTip rows (settled + pending) for AI tipsters."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    from db.models.tipsters import TipsterTip
    from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS
    ai_ids = list(AI_TIPSTER_IDS.values())
    q = db.query(TipsterTip).filter(TipsterTip.user_id.in_(ai_ids))
    if sport:
        q = q.filter(TipsterTip.sport == sport)
    tips = q.order_by(TipsterTip.created_at.desc()).limit(200).all()
    return [
        {
            "sport": t.sport,
            "match": t.match_label,
            "selection": t.selection_label,
            "odds": t.odds,
            "outcome": t.outcome,
            "start_time": t.start_time.isoformat() if t.start_time else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "note": t.note,
        }
        for t in tips
    ]


@app.post("/api/v1/admin/force-settle-tips", tags=["Admin"])
def admin_force_settle_tips(secret: str, recheck: bool = False):
    """Force-run tip settlement immediately."""
    if secret != settings.ADMIN_SETTLE_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    from pipelines.tipsters.settle_tips import run as settle
    n = settle(dry_run=False, all_users=True, recheck=recheck)
    return {"settled": n}


@app.post("/api/v1/admin/fetch-recent-results", tags=["Admin"])
def admin_fetch_recent_results(secret: str):
    """Fetch recent MLB + NHL + Highlightly results to fill in missing outcomes, then re-settle."""
    if secret != settings.ADMIN_SETTLE_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    results = {}
    try:
        from pipelines.baseball.fetch_live import fetch_all as fetch_baseball
        results["baseball"] = fetch_baseball()
    except Exception as exc:
        results["baseball_error"] = str(exc)
    try:
        from pipelines.hockey.fetch_live import fetch_all as fetch_hockey
        results["hockey"] = fetch_hockey()
    except Exception as exc:
        results["hockey_error"] = str(exc)
    try:
        from pipelines.highlightly.fetch_all import fetch_today
        results["highlightly"] = fetch_today()
    except Exception as exc:
        results["highlightly_error"] = str(exc)

    # Re-settle
    from pipelines.tipsters.settle_tips import run as settle
    results["newly_settled"] = settle(dry_run=False, all_users=True, recheck=False)
    return results


@app.post("/api/v1/admin/fetch-tennis", tags=["Admin"])
def admin_fetch_tennis(secret: str):
    """Fetch tennis fixtures from api-tennis.com, run predictions, and generate auto-picks (background)."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    import threading

    def _run():
        try:
            from pipelines.tennis.fetch_api_tennis import fetch_all as fetch_tennis
            n = fetch_tennis()
            log.info("[admin] fetch-tennis: %d rows fetched", n)
        except Exception as exc:
            log.error("[admin] fetch-tennis fetch error: %s", exc)
        try:
            from pipelines.tennis.predict_tennis import run as predict_tennis
            predict_tennis()
            log.info("[admin] fetch-tennis: predictions done")
        except Exception as exc:
            log.error("[admin] fetch-tennis predict error: %s", exc)
        try:
            from pipelines.picks.auto_picks import run as auto_picks
            n = auto_picks()
            log.info("[admin] fetch-tennis: %d picks created", n)
        except Exception as exc:
            log.error("[admin] fetch-tennis auto-picks error: %s", exc)

    threading.Thread(target=_run, daemon=True, name="fetch-tennis").start()
    return {"status": "started", "message": "Tennis fetch running in background — check logs for results"}


@app.post("/api/v1/admin/run-backtest", tags=["Admin"])
def admin_run_backtest(secret: str, sport: str = "all", min_confidence: float = 0.0):
    """
    Run the backtest pipeline for all (or one) sport and save results to
    model_registry.metrics['backtest'] so the /backtest/summary endpoint
    (and the website performance page) reflects the latest numbers.

    min_confidence: 0.0–1.0 — only include predictions above this confidence.
    """
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    import threading

    def _run():
        try:
            from pipelines.backtest.run_backtest import run as bt_run
            bt_run(sport=sport if sport != "all" else None, min_confidence=min_confidence)
            log.info("[admin] run-backtest complete for sport=%s", sport)
        except Exception as exc:
            log.error("[admin] run-backtest failed: %s", exc, exc_info=True)

    threading.Thread(target=_run, daemon=True, name="run-backtest").start()
    return {"status": "started", "sport": sport, "min_confidence": min_confidence, "message": "Backtest running in background — results will appear on website once complete."}


@app.get("/api/v1/admin/backtest-sweep", tags=["Admin"])
def admin_backtest_sweep(secret: str, sport: str, thresholds: str = "0.50,0.55,0.60,0.65,0.70,0.75"):
    """
    Run the backtester at multiple confidence thresholds and return a comparison
    table — useful for picking the right confidence gate before committing.

    thresholds: comma-separated floats, e.g. "0.50,0.60,0.70"
    Results are NOT saved to model_registry — read-only sweep.
    """
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    from pipelines.backtest.run_backtest import _run_for_sport
    from db.session import SessionLocal

    try:
        levels = [float(t.strip()) for t in thresholds.split(",")]
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="thresholds must be comma-separated floats")

    db = SessionLocal()
    rows = []
    try:
        for conf in levels:
            result = _run_for_sport(db, sport, min_confidence=conf)
            if result:
                rows.append({
                    "min_confidence": conf,
                    "n_predictions": result["n_predictions"],
                    "n_bets_placed": result.get("n_bets_placed", 0),
                    "accuracy": result["accuracy"],
                    "roi": result["roi"],
                    "pnl_units": result["pnl_units"],
                    "sharpe_ratio": result["sharpe_ratio"],
                })
            else:
                rows.append({"min_confidence": conf, "error": "no data"})
    finally:
        db.close()

    return {"sport": sport, "sweep": rows}


@app.post("/api/v1/admin/backfill-tennis", tags=["Admin"])
def admin_backfill_tennis(secret: str, days: int = 60):
    """
    Fetch `days` days of historical tennis results from api-tennis.com, then run
    predictions on ALL tennis matches (including historical) so the backtest has data.
    Runs in background — check Railway logs for progress.
    """
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    import threading
    from datetime import date, timedelta

    def _run():
        try:
            import httpx as _httpx
            from db.session import engine as _engine
            from sqlalchemy.orm import Session as _Session
            from pipelines.tennis.fetch_api_tennis import _upsert_match

            total = 0
            today = date.today()
            for offset in range(1, days + 1):
                d = today - timedelta(days=offset)
                date_str = d.isoformat()
                try:
                    resp = _httpx.get(
                        "https://api.api-tennis.com/tennis/",
                        params={
                            "method": "get_fixtures",
                            "APIkey": settings.TENNIS_LIVE_API_KEY,
                            "date_start": date_str,
                            "date_stop": date_str,
                        },
                        timeout=20,
                    )
                    data = resp.json()
                    if not data.get("success"):
                        log.warning("[tennis-backfill] Day %s: success=0", date_str)
                        continue
                    events = data.get("result", [])
                    with _Session(_engine) as session:
                        day_count = 0
                        for ev in events:
                            fp = ev.get("event_first_player", "")
                            sp = ev.get("event_second_player", "")
                            if not fp or not sp or "/" in fp or "/" in sp:
                                continue
                            try:
                                mid = _upsert_match(session, ev)
                                if mid:
                                    day_count += 1
                                    session.commit()
                            except Exception as exc:
                                session.rollback()
                                log.warning("[tennis-backfill] upsert error %s: %s", ev.get("event_key"), exc)
                        total += day_count
                        log.info("[tennis-backfill] %s: %d matches", date_str, day_count)
                except Exception as exc:
                    log.error("[tennis-backfill] Day %s failed: %s", date_str, exc)
                import time as _time
                _time.sleep(0.4)

            log.info("[tennis-backfill] Fetch complete: %d total matches across %d days", total, days)
        except Exception as exc:
            log.error("[tennis-backfill] Fatal error: %s", exc, exc_info=True)

        # Run predictions on ALL tennis matches (historical + upcoming)
        try:
            from pipelines.tennis.predict_tennis import run as predict_tennis
            n = predict_tennis(all_matches=True)
            log.info("[tennis-backfill] Predictions complete: %d rows", n)
        except Exception as exc:
            log.error("[tennis-backfill] Predictions failed: %s", exc, exc_info=True)

    threading.Thread(target=_run, daemon=True, name="tennis-backfill").start()
    return {
        "status": "started",
        "days": days,
        "message": f"Fetching {days} days of tennis history then running all-match predictions. Check Railway logs.",
    }


@app.get("/api/v1/admin/tennis-diag", tags=["Admin"])
def admin_tennis_diag(secret: str):
    """Diagnostic: test api-tennis API and try a single DB write."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    result = {}
    # 1. Test API key
    try:
        import httpx as _httpx
        from datetime import date as _date
        today = _date.today().isoformat()
        resp = _httpx.get("https://api.api-tennis.com/tennis/", params={
            "method": "get_fixtures", "APIkey": settings.TENNIS_LIVE_API_KEY,
            "date_start": today, "date_stop": today,
        }, timeout=15)
        data = resp.json()
        events = data.get("result", [])
        singles = [e for e in events if isinstance(e, dict) and e.get("event_first_player") and "/" not in str(e.get("event_first_player", ""))]
        result["api_success"] = data.get("success")
        result["total_fixtures"] = len(events)
        result["singles"] = len(singles)
        result["sample"] = singles[0].get("event_first_player") + " vs " + singles[0].get("event_second_player") if singles else None
    except Exception as exc:
        result["api_error"] = str(exc)
    # 2. Test DB write via fetch
    try:
        from pipelines.tennis.fetch_api_tennis import fetch_all as fetch_tennis
        n = fetch_tennis()
        result["db_rows_written"] = n
    except Exception as exc:
        result["db_error"] = str(exc)
        import traceback
        result["db_trace"] = traceback.format_exc()[-500:]
    return result


@app.get("/api/v1/admin/pending-tips", tags=["Admin"])
def admin_pending_tips(secret: str, db: Session = Depends(get_db)):
    """Show all pending AI tips and their match status, to diagnose settlement failures."""
    if secret != settings.ADMIN_SETTLE_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")

    from db.models.mvp import CoreMatch
    from db.models.tipsters import TipsterTip
    from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

    ai_ids = set(AI_TIPSTER_IDS.values())
    pending = db.query(TipsterTip).filter(
        TipsterTip.user_id.in_(ai_ids),
        TipsterTip.outcome.is_(None),
        TipsterTip.match_id.isnot(None),
    ).all()

    rows = []
    for tip in pending:
        match = db.query(CoreMatch).filter(CoreMatch.id == tip.match_id).first()
        rows.append({
            "tip_id": str(tip.id),
            "sport": tip.sport,
            "match_label": tip.match_label,
            "selection": tip.selection_label,
            "start_time": tip.start_time.isoformat() if tip.start_time else None,
            "match_status": match.status if match else "NO_MATCH",
            "match_outcome": match.outcome if match else None,
            "match_kickoff": match.kickoff_utc.isoformat() if match and match.kickoff_utc else None,
        })

    rows.sort(key=lambda r: r["start_time"] or "")
    return {"pending_count": len(rows), "tips": rows}


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
            from pipelines.tennis.fetch_api_tennis import fetch_all as fetch_tennis
            total += fetch_tennis()
        except Exception as exc:
            logger.error("[manual sync] Tennis failed: %s", exc, exc_info=True)
        try:
            from pipelines.tennis.fetch_api_tennis import build_player_form
            build_player_form()
        except Exception as exc:
            logger.error("[manual sync] Tennis player form failed: %s", exc, exc_info=True)
        try:
            from pipelines.tennis.predict_tennis import run as predict_tennis
            predict_tennis()
        except Exception as exc:
            logger.error("[manual sync] Tennis predict failed: %s", exc, exc_info=True)
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


@app.post("/api/v1/admin/run-migrations", tags=["Admin"])
def admin_run_migrations(secret: str):
    """Run alembic upgrade head. Safe to call multiple times (idempotent)."""
    if secret != settings.ADMIN_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    import subprocess, sys
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
        cwd="/app",  # Railway working directory
    )
    return {
        "returncode": result.returncode,
        "stdout": result.stdout[-2000:] if result.stdout else "",
        "stderr": result.stderr[-2000:] if result.stderr else "",
    }


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
