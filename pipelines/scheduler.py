"""
Background scheduler for the Alpha Engine data pipeline.

Runs inside the FastAPI process via APScheduler.  Two jobs:

  1. fetch_live   — every 6 h  — pulls fixtures + results from football-data.org
                                 and runs the prediction pipeline.
  2. predict_only — every 1 h  — re-scores scheduled matches with the live model
                                 (without fetching new fixtures).

Usage (standalone, for testing):
    python -m pipelines.scheduler
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Job functions (imported lazily so startup stays fast)
# ---------------------------------------------------------------------------

def _job_expire_stale() -> None:
    """Mark any 'live' match whose kickoff was >4 h ago as 'finished'.

    This is a safety net for when fetch pipelines haven't run or the API
    key is missing — prevents yesterday's matches showing as live forever.
    """
    from datetime import datetime, timedelta, timezone
    from db.session import SessionLocal
    from db.models.mvp import CoreMatch
    cutoff = datetime.now(timezone.utc) - timedelta(hours=4)
    db = SessionLocal()
    try:
        updated = (
            db.query(CoreMatch)
            .filter(CoreMatch.status.in_(["live", "scheduled"]), CoreMatch.kickoff_utc < cutoff)
            .update({"status": "finished"}, synchronize_session=False)
        )
        db.commit()
        if updated:
            log.info("[scheduler] expire_stale: marked %d stale matches as finished.", updated)
    except Exception as exc:
        db.rollback()
        log.error("[scheduler] expire_stale failed: %s", exc)
    finally:
        db.close()


def _job_fetch_live() -> None:
    """Fetch new fixtures + results for all sports, ingest, then run predictions."""
    log.info("[scheduler] Starting fetch_live job ...")
    total = 0

    # Soccer
    try:
        from pipelines.soccer.fetch_live import fetch_all as fetch_soccer
        n = fetch_soccer(run_predict=True)
        total += n
        log.info("[scheduler] soccer: %d rows ingested.", n)
    except Exception as exc:
        log.error("[scheduler] soccer fetch failed: %s", exc, exc_info=True)

    # Tennis (The Odds API for basic fixtures)
    try:
        from pipelines.tennis.fetch_live import fetch_all as fetch_tennis
        n = fetch_tennis()
        total += n
        log.info("[scheduler] tennis (odds): %d rows ingested.", n)
    except Exception as exc:
        log.error("[scheduler] tennis fetch failed: %s", exc, exc_info=True)

    # Tennis (api-tennis.com: set scores + serve stats)
    try:
        from pipelines.tennis.fetch_api_tennis import fetch_all as fetch_tennis_deep
        n = fetch_tennis_deep()
        total += n
        log.info("[scheduler] tennis (api-tennis): %d rows processed.", n)
    except Exception as exc:
        log.error("[scheduler] tennis api-tennis fetch failed: %s", exc, exc_info=True)

    # Esports
    try:
        from pipelines.esports.fetch_live import fetch_all as fetch_esports
        n = fetch_esports()
        total += n
        log.info("[scheduler] esports: %d rows ingested.", n)
    except Exception as exc:
        log.error("[scheduler] esports fetch failed: %s", exc, exc_info=True)

    # Basketball
    try:
        from pipelines.basketball.fetch_live import fetch_all as fetch_basketball
        n = fetch_basketball()
        total += n
        log.info("[scheduler] basketball: %d rows ingested.", n)
    except Exception as exc:
        log.error("[scheduler] basketball fetch failed: %s", exc, exc_info=True)

    # Baseball
    try:
        from pipelines.baseball.fetch_live import fetch_all as fetch_baseball
        n = fetch_baseball()
        total += n
        log.info("[scheduler] baseball: %d rows ingested.", n)
    except Exception as exc:
        log.error("[scheduler] baseball fetch failed: %s", exc, exc_info=True)

    log.info("[scheduler] fetch_live done — %d total rows.", total)


def _job_predict_only() -> None:
    """Re-run predictions against already-ingested fixtures (no API call)."""
    log.info("[scheduler] Starting predict_only job ...")

    # Soccer (ML model)
    try:
        from pipelines.soccer.predict_soccer import run as run_soccer_pred
        run_soccer_pred()
        log.info("[scheduler] soccer predict done.")
    except Exception as exc:
        log.error("[scheduler] soccer predict failed: %s", exc, exc_info=True)

    # Tennis (ELO)
    try:
        from pipelines.tennis.predict_tennis import run as run_tennis_pred
        run_tennis_pred()
        log.info("[scheduler] tennis predict done.")
    except Exception as exc:
        log.error("[scheduler] tennis predict failed: %s", exc, exc_info=True)

    # Esports (ELO)
    try:
        from pipelines.esports.predict_esports import run as run_esports_pred
        run_esports_pred()
        log.info("[scheduler] esports predict done.")
    except Exception as exc:
        log.error("[scheduler] esports predict failed: %s", exc, exc_info=True)

    # Basketball (ELO)
    try:
        from pipelines.basketball.predict_basketball import run as run_basketball_pred
        run_basketball_pred()
        log.info("[scheduler] basketball predict done.")
    except Exception as exc:
        log.error("[scheduler] basketball predict failed: %s", exc, exc_info=True)

    # Baseball (ELO)
    try:
        from pipelines.baseball.predict_baseball import run as run_baseball_pred
        run_baseball_pred()
        log.info("[scheduler] baseball predict done.")
    except Exception as exc:
        log.error("[scheduler] baseball predict failed: %s", exc, exc_info=True)

    log.info("[scheduler] predict_only done.")


def _job_fetch_odds() -> None:
    """Fetch real market odds from The Odds API and run auto-pick bot + CLV settlement."""
    log.info("[scheduler] Starting fetch_odds job ...")
    try:
        from pipelines.odds.fetch_odds import fetch_all as fetch_odds
        n = fetch_odds()
        log.info("[scheduler] odds: %d matches updated.", n)
    except Exception as exc:
        log.error("[scheduler] fetch_odds failed: %s", exc, exc_info=True)

    try:
        from pipelines.picks.auto_picks import run as run_auto_picks, settle_all_clv
        n = run_auto_picks()
        log.info("[scheduler] auto_picks: %d picks created.", n)
        c = settle_all_clv()
        log.info("[scheduler] clv_settle: %d picks updated.", c)
    except Exception as exc:
        log.error("[scheduler] auto_picks failed: %s", exc, exc_info=True)


def _job_update_elo() -> None:
    """Run incremental ELO backfill for all sports — only processes new finished matches."""
    log.info("[scheduler] Starting update_elo job ...")

    sports = [
        ("soccer",     "pipelines.soccer.backfill_elo",     "run_backfill"),
        ("tennis",     "pipelines.tennis.backfill_elo",     "run_backfill"),
        ("esports",    "pipelines.esports.backfill_elo",    "run_backfill"),
        ("basketball", "pipelines.basketball.backfill_elo", "run_backfill"),
        ("baseball",   "pipelines.baseball.backfill_elo",   "run_backfill"),
    ]

    for sport, module_path, fn_name in sports:
        try:
            import importlib
            mod = importlib.import_module(module_path)
            fn = getattr(mod, fn_name)
            n = fn(incremental=True)
            log.info("[scheduler] %s ELO: %d rows written.", sport, n)
        except Exception as exc:
            log.error("[scheduler] %s ELO update failed: %s", sport, exc, exc_info=True)

    log.info("[scheduler] update_elo done.")


def _job_fetch_stats() -> None:
    """Fetch real box score stats from NBA and MLB APIs."""
    log.info("[scheduler] Starting fetch_stats job ...")

    try:
        from pipelines.basketball.fetch_stats import fetch_all as bball_stats
        n = bball_stats()
        log.info("[scheduler] basketball stats: %d rows upserted.", n)
    except Exception as exc:
        log.error("[scheduler] basketball stats failed: %s", exc, exc_info=True)

    try:
        from pipelines.baseball.fetch_stats import fetch_all as baseball_stats
        n = baseball_stats()
        log.info("[scheduler] baseball stats: %d rows upserted.", n)
    except Exception as exc:
        log.error("[scheduler] baseball stats failed: %s", exc, exc_info=True)

    log.info("[scheduler] fetch_stats done.")


# ---------------------------------------------------------------------------
# Scheduler lifecycle
# ---------------------------------------------------------------------------

_scheduler: BackgroundScheduler | None = None


def start() -> BackgroundScheduler:
    """Create and start the background scheduler.  Call once on app startup."""
    global _scheduler
    if _scheduler and _scheduler.running:
        log.warning("[scheduler] Already running — skipping start().")
        return _scheduler

    _scheduler = BackgroundScheduler(job_defaults={"coalesce": True, "max_instances": 1})

    # Expire stale live matches every 5 minutes
    _scheduler.add_job(
        _job_expire_stale,
        trigger=IntervalTrigger(minutes=5),
        id="expire_stale",
        name="Expire stale live matches",
        replace_existing=True,
    )

    # Fetch live data every 30 minutes
    _scheduler.add_job(
        _job_fetch_live,
        trigger=IntervalTrigger(minutes=30),
        id="fetch_live",
        name="Fetch live fixtures + results",
        replace_existing=True,
    )

    # Re-score every hour (in case model is retrained mid-day)
    _scheduler.add_job(
        _job_predict_only,
        trigger=IntervalTrigger(hours=1),
        id="predict_only",
        name="Re-run prediction pipeline",
        replace_existing=True,
    )

    # Fetch real market odds + run auto-pick bot every 30 minutes
    _scheduler.add_job(
        _job_fetch_odds,
        trigger=IntervalTrigger(minutes=30),
        id="fetch_odds",
        name="Fetch real odds + auto-pick bot",
        replace_existing=True,
    )

    # Fetch real box score stats every 6 hours
    _scheduler.add_job(
        _job_fetch_stats,
        trigger=IntervalTrigger(hours=6),
        id="fetch_stats",
        name="Fetch NBA/MLB box score stats",
        replace_existing=True,
    )

    # Incremental ELO update nightly (3 AM UTC)
    from apscheduler.triggers.cron import CronTrigger
    _scheduler.add_job(
        _job_update_elo,
        trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
        id="update_elo",
        name="Incremental ELO ratings update (all sports)",
        replace_existing=True,
    )

    _scheduler.start()
    log.info("[scheduler] Started. Jobs: expire_stale (5m), fetch_live (30m), fetch_odds (30m), predict_only (1h), fetch_stats (6h), update_elo (nightly 03:00 UTC).")
    return _scheduler


def stop() -> None:
    """Gracefully shut down the scheduler.  Call on app shutdown."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("[scheduler] Stopped.")


# ---------------------------------------------------------------------------
# Standalone entry point (for manual testing)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import time
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
    sched = start()
    # Run fetch immediately on start
    _job_fetch_live()
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        stop()
