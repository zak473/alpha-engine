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

    # Rebuild soccer features immediately so same-day predictions use fresh data
    _job_build_soccer_features()

    # Tennis (api-tennis.com: fixtures + live scores + set scores + serve stats)
    try:
        from pipelines.tennis.fetch_api_tennis import fetch_all as fetch_tennis_deep
        n = fetch_tennis_deep()
        total += n
        log.info("[scheduler] tennis (api-tennis): %d rows processed.", n)
    except Exception as exc:
        log.error("[scheduler] tennis api-tennis fetch failed: %s", exc, exc_info=True)

    # Tennis player form (rolling stats from match history)
    try:
        from pipelines.tennis.fetch_api_tennis import build_player_form
        n = build_player_form()
        log.info("[scheduler] tennis player form: %d rows upserted.", n)
    except Exception as exc:
        log.error("[scheduler] tennis build_player_form failed: %s", exc, exc_info=True)

    # Esports (PandaScore: CS2, LoL, Dota2, Valorant)
    try:
        from pipelines.esports.fetch_live import fetch_all as fetch_esports
        n = fetch_esports()
        total += n
        log.info("[scheduler] esports: %d rows ingested.", n)
    except Exception as exc:
        log.error("[scheduler] esports fetch failed: %s", exc, exc_info=True)

    # Baseball, Hockey — handled by Highlightly (_job_fetch_highlightly runs every 10m)

    # Horse racing
    try:
        from pipelines.horseracing.fetch_live import fetch_all as fetch_horseracing
        n = fetch_horseracing()
        total += n
        log.info("[scheduler] horseracing: %d races ingested.", n)
    except Exception as exc:
        log.error("[scheduler] horseracing fetch failed: %s", exc, exc_info=True)

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

    # Baseball (ELO)
    try:
        from pipelines.baseball.predict_baseball import run as run_baseball_pred
        run_baseball_pred()
        log.info("[scheduler] baseball predict done.")
    except Exception as exc:
        log.error("[scheduler] baseball predict failed: %s", exc, exc_info=True)

    # Hockey (ELO)
    try:
        from pipelines.hockey.predict_hockey import run as run_hockey_pred
        run_hockey_pred()
        log.info("[scheduler] hockey predict done.")
    except Exception as exc:
        log.error("[scheduler] hockey predict failed: %s", exc, exc_info=True)

    # Basketball (ML model or ELO fallback)
    try:
        from pipelines.basketball.predict_basketball import run as run_basketball_pred
        run_basketball_pred()
        log.info("[scheduler] basketball predict done.")
    except Exception as exc:
        log.error("[scheduler] basketball predict failed: %s", exc, exc_info=True)

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
        ("soccer",      "pipelines.soccer.backfill_elo",      "run_backfill"),
        ("tennis",      "pipelines.tennis.backfill_elo",      "run_backfill"),
        ("esports",     "pipelines.esports.backfill_elo",     "run_backfill"),
        ("baseball",    "pipelines.baseball.backfill_elo",    "run_backfill"),
        ("hockey",      "pipelines.hockey.backfill_elo",      "run_backfill"),
        ("basketball",  "pipelines.basketball.backfill_elo",  "run_backfill"),
    ]

    for sport, module_path, fn_name in sports:
        try:
            import importlib
            mod = importlib.import_module(module_path)
            fn = getattr(mod, fn_name)
            n = fn(incremental=True)
            log.info("[scheduler] %s ELO: %d rows written.", sport, n)
        except Exception as exc:
            log.error("[scheduler] %s ELO update failed: %s", sport, exc)

    log.info("[scheduler] update_elo done.")


def _job_fetch_stats() -> None:
    """Fetch real box score stats from NBA and MLB APIs."""
    log.info("[scheduler] Starting fetch_stats job ...")

    try:
        from pipelines.baseball.fetch_stats import fetch_all as baseball_stats
        n = baseball_stats()
        log.info("[scheduler] baseball stats: %d rows upserted.", n)
    except Exception as exc:
        log.error("[scheduler] baseball stats failed: %s", exc, exc_info=True)

    try:
        from pipelines.hockey.fetch_stats import fetch_all as hockey_stats
        n = hockey_stats()
        log.info("[scheduler] hockey stats: %d rows upserted.", n)
    except Exception as exc:
        log.error("[scheduler] hockey stats failed: %s", exc, exc_info=True)

    try:
        from pipelines.basketball.fetch_stats import fetch_all as basketball_stats
        n = basketball_stats(days_back=7)
        log.info("[scheduler] basketball stats: %d rows upserted.", n)
    except Exception as exc:
        log.error("[scheduler] basketball stats failed: %s", exc, exc_info=True)

    log.info("[scheduler] fetch_stats done.")


def _job_build_soccer_features() -> None:
    """Rebuild feat_soccer_match rows — required for soccer ML training."""
    log.info("[scheduler] Starting build_soccer_features job ...")
    try:
        from pipelines.soccer.build_soccer_features import run as build_features
        n = build_features()
        log.info("[scheduler] build_soccer_features: %d rows upserted.", n)
    except Exception as exc:
        log.error("[scheduler] build_soccer_features failed: %s", exc, exc_info=True)
    log.info("[scheduler] build_soccer_features done.")


def _job_fetch_player_profiles() -> None:
    """Refresh tennis player profiles from Jeff Sackmann dataset (no API key needed)."""
    log.info("[scheduler] Starting fetch_player_profiles job ...")
    try:
        from pipelines.tennis.fetch_player_profiles import run as fetch_profiles
        n = fetch_profiles()
        log.info("[scheduler] tennis player profiles: %d upserted.", n)
    except Exception as exc:
        log.error("[scheduler] fetch_player_profiles failed: %s", exc, exc_info=True)
    log.info("[scheduler] fetch_player_profiles done.")


def _job_fetch_xg() -> None:
    """Fetch xG data from Understat.com for all configured leagues/seasons."""
    log.info("[scheduler] Starting fetch_xg job ...")
    try:
        from pipelines.soccer.fetch_understat_xg import fetch_all as fetch_xg
        n = fetch_xg()
        log.info("[scheduler] fetch_xg: %d rows written.", n)
    except Exception as exc:
        log.error("[scheduler] fetch_xg failed: %s", exc, exc_info=True)
    log.info("[scheduler] fetch_xg done.")


def _job_fetch_injuries() -> None:
    """Fetch player injuries and suspensions from API-Football."""
    log.info("[scheduler] Starting fetch_injuries job ...")
    try:
        from pipelines.soccer.fetch_injuries import fetch_all as fetch_injuries
        n = fetch_injuries()
        log.info("[scheduler] fetch_injuries: %d rows upserted.", n)
    except Exception as exc:
        log.error("[scheduler] fetch_injuries failed: %s", exc, exc_info=True)
    log.info("[scheduler] fetch_injuries done.")


def _job_settle_pending_picks() -> None:
    """Batch-settle all pending moneyline picks whose match is now finished."""
    from datetime import datetime, timezone
    import uuid as _uuid
    from db.session import SessionLocal
    from db.models.mvp import CoreMatch
    from db.models.picks import TrackedPick
    from db.models.bankroll import BankrollSnapshot

    db = SessionLocal()
    settled = 0
    try:
        pending = db.query(TrackedPick).filter(TrackedPick.outcome.is_(None)).all()
        for pick in pending:
            match = db.query(CoreMatch).filter(CoreMatch.id == pick.match_id).first()
            if not match or match.status != "finished" or not match.outcome:
                continue

            market = pick.market_name.lower()
            if not any(kw in market for kw in ("moneyline", "match winner", "1x2", "to win")):
                continue

            label = pick.selection_label.lower()
            home_name = pick.match_label.split(" vs ")[0].lower() if " vs " in pick.match_label else ""
            away_name = pick.match_label.split(" vs ")[-1].lower() if " vs " in pick.match_label else ""

            is_home = label in ("home", "1") or (home_name and home_name in label)
            is_away = label in ("away", "2") or (away_name and away_name in label)
            is_draw = label in ("draw", "x")

            result = match.outcome
            if is_home:
                pick.outcome = "won" if result == "home_win" else "lost"
            elif is_away:
                pick.outcome = "won" if result == "away_win" else "lost"
            elif is_draw:
                pick.outcome = "won" if result == "draw" else "lost"

            if pick.outcome is not None:
                pick.settled_at = datetime.now(tz=timezone.utc)
                try:
                    stake = pick.stake_fraction or 1.0
                    pnl = round(stake * (pick.odds - 1.0), 4) if pick.outcome == "won" else round(-stake, 4)
                    last_snap = (
                        db.query(BankrollSnapshot)
                        .filter(BankrollSnapshot.user_id == pick.user_id)
                        .order_by(BankrollSnapshot.created_at.desc())
                        .first()
                    )
                    current_bal = last_snap.balance if last_snap else 0.0
                    db.add(BankrollSnapshot(
                        id=str(_uuid.uuid4()),
                        user_id=pick.user_id,
                        balance=round(current_bal + pnl, 4),
                        event_type="pick_settled",
                        pick_id=pick.id,
                        pnl=pnl,
                        notes=f"{pick.match_label} — {pick.selection_label} @ {pick.odds} ({pick.outcome})",
                    ))
                except Exception:
                    pass
                settled += 1
                try:
                    from api.routers.notifications import create_notification
                    outcome_emoji = "✅" if pick.outcome == "won" else "❌"
                    create_notification(
                        db,
                        user_id=pick.user_id,
                        type="pick_settled",
                        title=f"{outcome_emoji} Pick {pick.outcome}: {pick.match_label}",
                        message=f"{pick.selection_label} @ {pick.odds:.2f}",
                        data={"pick_id": pick.id, "outcome": pick.outcome, "odds": pick.odds},
                    )
                except Exception:
                    pass

        db.commit()
        if settled:
            log.info("[scheduler] settle_pending_picks: settled %d picks.", settled)
    except Exception as exc:
        db.rollback()
        log.error("[scheduler] settle_pending_picks failed: %s", exc)
    finally:
        db.close()


def _job_settle_challenge_entries() -> None:
    """Lock and settle challenge entries whose matches are now finished."""
    from db.session import SessionLocal
    from db.models.mvp import CoreMatch
    from db.models.challenges import ChallengeEntry

    db = SessionLocal()
    locked = 0
    settled = 0
    try:
        from api.services.entries import lock_due_entries, settle_entry

        # Step 1: lock any open entries whose event has started
        locked = lock_due_entries(db)

        # Step 2: settle locked entries where the match is finished
        pending = (
            db.query(ChallengeEntry)
            .filter(ChallengeEntry.status == "locked")
            .all()
        )
        for entry in pending:
            match = db.query(CoreMatch).filter(CoreMatch.id == entry.event_id).first()
            if not match or match.status != "finished" or not match.outcome:
                continue

            outcome = match.outcome  # "home_win" | "away_win" | "draw"
            correct = entry.pick_type == outcome
            try:
                settle_entry(
                    db,
                    entry.id,
                    outcome_payload={"outcome": outcome, "correct": correct},
                )
                settled += 1
            except Exception as exc:
                log.warning("[scheduler] settle_challenge_entry %s failed: %s", entry.id, exc)

        if locked or settled:
            log.info(
                "[scheduler] settle_challenge_entries: locked=%d settled=%d",
                locked, settled,
            )
    except Exception as exc:
        db.rollback()
        log.error("[scheduler] settle_challenge_entries failed: %s", exc)
    finally:
        db.close()


def _job_settle_ai_tipster_tips() -> None:
    """Settle pending TipsterTip rows for AI tipster accounts when matches finish."""
    from datetime import datetime, timezone
    from db.session import SessionLocal
    from db.models.mvp import CoreMatch
    from db.models.tipsters import TipsterTip
    from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

    ai_ids = set(AI_TIPSTER_IDS.values())
    # Maps selection_label → expected outcome string in CoreMatch.outcome
    outcome_map = {"home": "home_win", "away": "away_win", "draw": "draw"}

    db = SessionLocal()
    settled = 0
    try:
        pending = (
            db.query(TipsterTip)
            .filter(
                TipsterTip.user_id.in_(ai_ids),
                TipsterTip.outcome.is_(None),
                TipsterTip.match_id.isnot(None),
            )
            .all()
        )

        for tip in pending:
            match = db.query(CoreMatch).filter(CoreMatch.id == tip.match_id).first()
            if not match or match.status != "finished" or not match.outcome:
                continue

            expected = outcome_map.get(tip.selection_label)
            if expected is None:
                continue

            tip.outcome = "won" if match.outcome == expected else "lost"
            tip.settled_at = datetime.now(timezone.utc)
            settled += 1

        if settled:
            db.commit()
            log.info("[scheduler] settle_ai_tipster_tips: settled %d tips.", settled)
    except Exception as exc:
        db.rollback()
        log.error("[scheduler] settle_ai_tipster_tips failed: %s", exc)
    finally:
        db.close()


def _job_retrain_models() -> None:
    """Retrain ML models for all sports that have sufficient data. Runs weekly."""
    log.info("[scheduler] Starting retrain_models job ...")

    for sport, module_path, fn_name in [
        ("soccer",      "pipelines.soccer.train_soccer_lgb",           "main"),
        ("baseball",    "pipelines.baseball.train_baseball_model",      "main"),
        ("tennis",      "pipelines.tennis.train_tennis_model",          "main"),
        ("esports",     "pipelines.esports.train_esports_model",        "main"),
        ("hockey",      "pipelines.hockey.train_hockey_lgb",            "main"),
        ("basketball",  "pipelines.basketball.train_basketball_lgb",   "main"),
    ]:
        try:
            import importlib
            mod = importlib.import_module(module_path)
            getattr(mod, fn_name)()
            log.info("[scheduler] %s model retrained.", sport)
        except Exception as exc:
            log.error("[scheduler] %s retrain failed: %s", sport, exc, exc_info=True)

    log.info("[scheduler] retrain_models done.")


def _job_generate_weekly_challenges() -> None:
    """Auto-generate sport weekly challenges every Monday if fewer than 3 active ones exist."""
    from datetime import datetime, timedelta, timezone
    import uuid
    from db.session import SessionLocal
    from db.models.challenges import Challenge

    now = datetime.now(timezone.utc)
    # Week window: Mon 00:00 → Sun 23:59
    week_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)

    SYSTEM_USER = "system"
    TEMPLATES = [
        {
            "sport": "soccer",
            "name": "Weekly Soccer Challenge",
            "description": "Pick your best soccer bets this week and compete for the top spot on the leaderboard.",
        },
        {
            "sport": "tennis",
            "name": "Weekly Tennis Challenge",
            "description": "Submit your tennis match predictions and track your accuracy across the week.",
        },
        {
            "sport": "baseball",
            "name": "Weekly Baseball Challenge",
            "description": "MLB picks of the week — submit your top moneyline and run-line selections.",
        },
        {
            "sport": "basketball",
            "name": "Weekly Basketball Challenge",
            "description": "NBA picks of the week — predict game winners and track your accuracy.",
        },
        {
            "sport": "hockey",
            "name": "Weekly Hockey Challenge",
            "description": "NHL picks of the week — submit your moneyline selections and climb the leaderboard.",
        },
        {
            "sport": "esports",
            "name": "Weekly Esports Challenge",
            "description": "Esports predictions for the week — track your map-level accuracy.",
        },
        {
            "sport": None,
            "name": "Weekly All-Sports Challenge",
            "description": "Open challenge — submit picks from any sport and compete for the weekly crown.",
        },
    ]

    db = SessionLocal()
    try:
        # Count challenges that overlap this week
        active_count = (
            db.query(Challenge)
            .filter(
                Challenge.visibility == "public",
                Challenge.start_at <= week_end,
                Challenge.end_at >= week_start,
            )
            .count()
        )

        if active_count >= 3:
            log.info("[scheduler] generate_weekly_challenges: %d active challenges, skipping.", active_count)
            return

        created = 0
        for tmpl in TEMPLATES:
            if active_count + created >= 3:
                break
            # Check if a same-name challenge already covers this week
            existing = (
                db.query(Challenge)
                .filter(
                    Challenge.name == tmpl["name"],
                    Challenge.start_at <= week_end,
                    Challenge.end_at >= week_start,
                )
                .first()
            )
            if existing:
                continue

            challenge = Challenge(
                id=str(uuid.uuid4()),
                name=tmpl["name"],
                description=tmpl["description"],
                visibility="public",
                sport_scope=[tmpl["sport"]] if tmpl["sport"] else [],
                start_at=week_start,
                end_at=week_end,
                max_members=None,
                entry_limit_per_day=5,
                scoring_type="points",
                created_by=SYSTEM_USER,
            )
            db.add(challenge)
            created += 1

        db.commit()
        log.info("[scheduler] generate_weekly_challenges: created %d new challenges.", created)
    except Exception as exc:
        db.rollback()
        log.error("[scheduler] generate_weekly_challenges failed: %s", exc)
    finally:
        db.close()


def _job_highlightly_live() -> None:
    """
    10-minute live score refresh — scores only, no extras.
    Cost: 4 API calls per run × 144 runs/day = 576 calls/day.
    """
    from pipelines.highlightly.fetch_all import fetch_today
    try:
        n = fetch_today()
        if n:
            log.debug("[scheduler] highlightly_live: %d rows updated.", n)
    except Exception as exc:
        log.error("[scheduler] highlightly_live failed: %s", exc, exc_info=True)


def _job_fetch_highlightly() -> None:
    """
    30-minute sync — today + tomorrow with live extras (lineups/stats/events).
    Cost: ~38 API calls per run × 48 runs/day = ~1,800 calls/day.
    """
    from pipelines.highlightly.fetch_all import fetch_with_extras
    try:
        n = fetch_with_extras()
        log.info("[scheduler] highlightly_fetch: %d rows ingested.", n)
    except Exception as exc:
        log.error("[scheduler] highlightly_fetch failed: %s", exc, exc_info=True)


def _job_fetch_highlightly_historical() -> None:
    """
    Daily fixture sync — 90 days back for form/H2H. No extras.
    Cost: 4 × 93 = 372 API calls. Runs at 3 AM UTC.
    """
    from pipelines.highlightly.fetch_all import fetch_all as hl_fetch
    log.info("[scheduler] Starting highlightly_historical job ...")
    try:
        n = hl_fetch(days_back=90, days_ahead=3)
        log.info("[scheduler] highlightly_historical: %d rows ingested.", n)
    except Exception as exc:
        log.error("[scheduler] highlightly_historical failed: %s", exc, exc_info=True)
    log.info("[scheduler] highlightly_historical done.")


def _job_prematch_extras() -> None:
    """
    Enrich upcoming matches (next 24h) with lastfivegames, headtohead, players.
    Runs every 30 min. Cost: ~32 API calls/run × 48 runs/day = ~1,536 calls/day.
    """
    from pipelines.highlightly.fetch_all import fetch_prematch_extras
    try:
        n = fetch_prematch_extras()
        if n:
            log.info("[scheduler] prematch_extras: enriched %d matches.", n)
    except Exception as exc:
        log.error("[scheduler] prematch_extras failed: %s", exc, exc_info=True)


def _job_sync_standings() -> None:
    """Sync league standings for all active Highlightly leagues — runs every 6 hours."""
    from pipelines.highlightly.fetch_all import fetch_standings
    try:
        n = fetch_standings()
        log.info("[scheduler] sync_standings: %d rows synced.", n)
    except Exception as exc:
        log.error("[scheduler] sync_standings failed: %s", exc, exc_info=True)


def _job_run_backtest() -> None:
    """Run backtest across all live models and store results in model_registry.metrics."""
    log.info("[scheduler] Starting run_backtest job ...")
    try:
        from pipelines.backtest.run_backtest import run as run_backtest
        run_backtest()
        log.info("[scheduler] run_backtest done.")
    except Exception as exc:
        log.error("[scheduler] run_backtest failed: %s", exc, exc_info=True)


def _job_fetch_probable_pitchers() -> None:
    """Fetch MLB probable starting pitchers for upcoming games (next 3 days)."""
    log.info("[scheduler] Starting fetch_probable_pitchers job ...")
    try:
        from pipelines.baseball.fetch_probable_pitchers import run as fetch_pitchers
        n = fetch_pitchers(days_ahead=3)
        log.info("[scheduler] probable_pitchers: %d matches updated.", n)
    except Exception as exc:
        log.error("[scheduler] fetch_probable_pitchers failed: %s", exc, exc_info=True)


def _job_generate_reasoning() -> None:
    """
    Pre-generate AI reasoning for all upcoming scheduled matches.
    Skips matches that already have fresh reasoning (generated < 24h ago).
    Runs daily at 4:00 AM UTC so analysis is ready before users wake up.
    """
    from datetime import datetime, timedelta, timezone
    from config.settings import settings
    from db.session import SessionLocal
    from db.models.mvp import CoreMatch, MatchReasoning
    from api.routers.reasoning import (
        _team_name, _league_name, _elo_rating, _standing,
        _build_prompt, _call_claude, CACHE_TTL_HOURS,
    )
    try:
        from db.models.mvp import FeatSoccerMatch
    except ImportError:
        FeatSoccerMatch = None  # type: ignore

    if not settings.ANTHROPIC_API_KEY:
        log.info("[scheduler] generate_reasoning: ANTHROPIC_API_KEY not set — skipping.")
        return

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        cutoff_kickoff = now + timedelta(hours=48)
        cutoff_cache = now.replace(tzinfo=None) - timedelta(hours=CACHE_TTL_HOURS)

        # All upcoming matches in the next 48 hours
        upcoming = (
            db.query(CoreMatch)
            .filter(
                CoreMatch.status == "scheduled",
                CoreMatch.kickoff_utc >= now,
                CoreMatch.kickoff_utc <= cutoff_kickoff,
            )
            .all()
        )

        # Find which ones need (re-)generation
        existing = {
            r.match_id: r
            for r in db.query(MatchReasoning)
            .filter(MatchReasoning.match_id.in_([m.id for m in upcoming]))
            .all()
        }

        todo = [
            m for m in upcoming
            if m.id not in existing or existing[m.id].generated_at < cutoff_cache
        ]

        log.info("[scheduler] generate_reasoning: %d upcoming, %d need generation.", len(upcoming), len(todo))

        from db.models.mvp import PredMatch, ModelRegistry
        import math

        generated = 0
        for match in todo:
            try:
                home = _team_name(db, match.home_team_id)
                away = _team_name(db, match.away_team_id)
                league = _league_name(db, match.league_id)
                sport = match.sport or "soccer"

                pred_row = (
                    db.query(PredMatch, ModelRegistry)
                    .join(ModelRegistry, ModelRegistry.model_name == PredMatch.model_version)
                    .filter(PredMatch.match_id == match.id, ModelRegistry.is_live == True)
                    .order_by(ModelRegistry.trained_at.desc())
                    .first()
                )

                if pred_row:
                    pred, _ = pred_row
                    p_home, p_draw, p_away = pred.p_home, pred.p_draw, pred.p_away
                    confidence = pred.confidence / 100
                    fair_home, fair_draw, fair_away = pred.fair_odds_home, pred.fair_odds_draw, pred.fair_odds_away
                    key_drivers = pred.key_drivers or []
                else:
                    elo_h = _elo_rating(db, match.home_team_id, match.kickoff_utc) or 1500.0
                    elo_a = _elo_rating(db, match.away_team_id, match.kickoff_utc) or 1500.0
                    r_diff = elo_h - elo_a + 65.0
                    p_home = 1.0 / (1.0 + math.pow(10, -r_diff / 400.0))
                    p_away = 1.0 - p_home
                    p_draw = 0.0
                    confidence = abs(p_home - 0.5) * 2
                    fair_home = round(1 / p_home, 2) if p_home > 0 else 99.0
                    fair_away = round(1 / p_away, 2) if p_away > 0 else 99.0
                    fair_draw = 99.0
                    key_drivers = []

                elo_home = _elo_rating(db, match.home_team_id, match.kickoff_utc)
                elo_away = _elo_rating(db, match.away_team_id, match.kickoff_utc)

                feat = None
                if FeatSoccerMatch and sport == "soccer":
                    feat = db.query(FeatSoccerMatch).filter_by(match_id=match.id).first()

                standing_home = _standing(db, match.home_team_id, sport)
                standing_away = _standing(db, match.away_team_id, sport)

                prompt = _build_prompt(
                    sport=sport, league=league, home=home, away=away,
                    p_home=p_home, p_draw=p_draw, p_away=p_away,
                    confidence=confidence,
                    fair_home=fair_home, fair_draw=fair_draw, fair_away=fair_away,
                    market_home=match.odds_home, market_draw=match.odds_draw, market_away=match.odds_away,
                    elo_home=elo_home, elo_away=elo_away,
                    key_drivers=key_drivers, feat=feat,
                    standing_home=standing_home, standing_away=standing_away,
                )

                text = _call_claude(prompt)

                cached = existing.get(match.id)
                if cached:
                    cached.reasoning = text
                    cached.generated_at = datetime.utcnow()
                else:
                    db.add(MatchReasoning(match_id=match.id, reasoning=text))

                db.commit()
                generated += 1
                log.info("[scheduler] generate_reasoning: generated for %s vs %s", home, away)

            except Exception as exc:
                db.rollback()
                log.warning("[scheduler] generate_reasoning: failed for match %s: %s", match.id, exc)

        log.info("[scheduler] generate_reasoning: done. Generated %d / %d.", generated, len(todo))

    except Exception as exc:
        log.error("[scheduler] generate_reasoning failed: %s", exc, exc_info=True)
    finally:
        db.close()


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

    from datetime import datetime as _dt, timezone as _tz, timedelta as _timedelta
    from apscheduler.executors.pool import ThreadPoolExecutor as APThreadPoolExecutor
    _scheduler = BackgroundScheduler(
        executors={"default": APThreadPoolExecutor(max_workers=20)},
        job_defaults={"coalesce": True, "max_instances": 1},
    )

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

    # Re-score every hour (in case model is retrained mid-day) — run immediately on startup
    _scheduler.add_job(
        _job_predict_only,
        trigger=IntervalTrigger(hours=1),
        id="predict_only",
        name="Re-run prediction pipeline",
        replace_existing=True,
        next_run_time=_dt.now(_tz.utc) + _timedelta(minutes=15),
    )

    # Fetch real market odds + run auto-pick bot every 30 minutes (delay 8m on startup)
    _scheduler.add_job(
        _job_fetch_odds,
        trigger=IntervalTrigger(minutes=30),
        id="fetch_odds",
        name="Fetch real odds + auto-pick bot",
        replace_existing=True,
        next_run_time=_dt.now(_tz.utc) + _timedelta(minutes=8),
    )

    # Settle pending picks every 15 minutes
    _scheduler.add_job(
        _job_settle_pending_picks,
        trigger=IntervalTrigger(minutes=15),
        id="settle_pending_picks",
        name="Settle pending picks",
        replace_existing=True,
    )

    # Settle challenge entries every 15 minutes (lock on start, score on finish)
    _scheduler.add_job(
        _job_settle_challenge_entries,
        trigger=IntervalTrigger(minutes=15),
        id="settle_challenge_entries",
        name="Settle challenge entries",
        replace_existing=True,
    )

    # Settle AI tipster tips every 15 minutes
    _scheduler.add_job(
        _job_settle_ai_tipster_tips,
        trigger=IntervalTrigger(minutes=15),
        id="settle_ai_tipster_tips",
        name="Settle AI tipster tips",
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

    # Incremental ELO update nightly (3 AM UTC) — first run 30m after startup
    from apscheduler.triggers.cron import CronTrigger
    _scheduler.add_job(
        _job_update_elo,
        trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
        id="update_elo",
        name="Incremental ELO ratings update (all sports)",
        replace_existing=True,
        next_run_time=_dt.now(_tz.utc) + _timedelta(minutes=30),
    )

    # Build soccer features daily at 3:30 AM UTC (after ELO update at 3:00)
    # First run 40m after startup (after ELO at +30m)
    _scheduler.add_job(
        _job_build_soccer_features,
        trigger=CronTrigger(hour=3, minute=30, timezone="UTC"),
        id="build_soccer_features",
        name="Build feat_soccer_match feature table",
        replace_existing=True,
        next_run_time=_dt.now(_tz.utc) + _timedelta(minutes=40),
    )

    # Tennis player profiles refresh (weekly, Sunday 4 AM UTC)
    _scheduler.add_job(
        _job_fetch_player_profiles,
        trigger=CronTrigger(day_of_week="sun", hour=4, minute=0, timezone="UTC"),
        id="fetch_player_profiles",
        name="Tennis player profiles from Sackmann dataset",
        replace_existing=True,
    )

    # Fetch Understat xG data nightly (3 AM UTC — Understat updates within ~24h of match)
    _scheduler.add_job(
        _job_fetch_xg,
        trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
        id="fetch_xg",
        name="Fetch Understat xG data (soccer)",
        replace_existing=True,
    )

    # Fetch player injuries from API-Football (daily 6 AM UTC)
    _scheduler.add_job(
        _job_fetch_injuries,
        trigger=CronTrigger(hour=6, minute=0, timezone="UTC"),
        id="fetch_injuries",
        name="Fetch player injuries/suspensions (API-Football)",
        replace_existing=True,
    )

    # Retrain ML models weekly (Saturday 2 AM UTC — after ELO update)
    _scheduler.add_job(
        _job_retrain_models,
        trigger=CronTrigger(day_of_week="sat", hour=2, minute=0, timezone="UTC"),
        id="retrain_models",
        name="Weekly ML model retraining (soccer, baseball, tennis, esports)",
        replace_existing=True,
    )

    # Auto-generate weekly challenges every Monday at 00:05 UTC
    _scheduler.add_job(
        _job_generate_weekly_challenges,
        trigger=CronTrigger(day_of_week="mon", hour=0, minute=5, timezone="UTC"),
        id="generate_weekly_challenges",
        name="Auto-generate public weekly sport challenges",
        replace_existing=True,
    )

    # Highlightly live scores every 2 minutes — scores only, 4 calls/run
    # 720 runs/day × 4 calls = 2,880 calls/day
    _scheduler.add_job(
        _job_highlightly_live,
        trigger=IntervalTrigger(minutes=2),
        id="highlightly_live",
        name="Highlightly live scores (2m, scores only)",
        replace_existing=True,
        next_run_time=_dt.now(_tz.utc) + _timedelta(minutes=3),
    )

    # Highlightly full sync every 10 minutes — today+tomorrow with live extras + inline odds
    # 144 runs/day × ~38 calls = ~5,500 calls/day (fits Pro plan)
    _scheduler.add_job(
        _job_fetch_highlightly,
        trigger=IntervalTrigger(minutes=10),
        id="fetch_highlightly",
        name="Highlightly sync with live extras (10m)",
        replace_existing=True,
        next_run_time=_dt.now(_tz.utc) + _timedelta(minutes=6),
    )

    # Prematch extras (lastfivegames, headtohead, players) every 15 min
    _scheduler.add_job(
        _job_prematch_extras,
        trigger=IntervalTrigger(minutes=15),
        id="prematch_extras",
        name="Highlightly prematch extras (lastfivegames/h2h/players)",
        replace_existing=True,
        next_run_time=_dt.now(_tz.utc) + _timedelta(minutes=12),
    )

    # Standings sync every 12 hours
    _scheduler.add_job(
        _job_sync_standings,
        trigger=IntervalTrigger(hours=12),
        id="sync_standings",
        name="Highlightly standings sync (12h)",
        replace_existing=True,
        next_run_time=_dt.now(_tz.utc) + _timedelta(minutes=20),
    )

    # Historical fixture sync daily at 3:00 AM UTC — 90 days back, no extras
    _scheduler.add_job(
        _job_fetch_highlightly_historical,
        trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
        id="highlightly_historical",
        name="Highlightly 90-day historical sync (3 AM UTC)",
        replace_existing=True,
    )

    # Pre-match AI reasoning — generate for all upcoming matches daily at 4:00 AM UTC
    _scheduler.add_job(
        _job_generate_reasoning,
        trigger=CronTrigger(hour=4, minute=0, timezone="UTC"),
        id="generate_reasoning",
        name="AI pre-match reasoning generation (4 AM UTC)",
        replace_existing=True,
    )

    # Run backtest nightly at 5:00 AM UTC (after ELO + features + reasoning are fresh)
    _scheduler.add_job(
        _job_run_backtest,
        trigger=CronTrigger(hour=5, minute=0, timezone="UTC"),
        id="run_backtest",
        name="Nightly backtest across all live models (5 AM UTC)",
        replace_existing=True,
    )

    # Fetch MLB probable pitchers daily at 8 AM UTC (rosters finalised by then)
    _scheduler.add_job(
        _job_fetch_probable_pitchers,
        trigger=CronTrigger(hour=8, minute=0, timezone="UTC"),
        id="fetch_probable_pitchers",
        name="MLB probable starting pitchers (8 AM UTC)",
        replace_existing=True,
        next_run_time=_dt.now(_tz.utc) + _timedelta(minutes=10),
    )

    _scheduler.start()
    log.info(
        "[scheduler] Started. Jobs: expire_stale (5m), fetch_live (30m), fetch_odds (30m), "
        "highlightly_live (2m, scores only), fetch_highlightly (10m, extras+odds), prematch_extras (30m), "
        "highlightly_historical (daily 03:00), sync_standings (12h), "
        "settle_picks (15m), settle_challenges (15m), settle_ai_tips (15m), predict_only (1h), fetch_stats (6h), "
        "update_elo (nightly 03:00 UTC), build_soccer_features (nightly 03:30 UTC), "
        "fetch_player_profiles (weekly Sun), fetch_xg (nightly 03:00 UTC), "
        "retrain_models (weekly Sat), generate_weekly_challenges (weekly Mon 00:05), "
        "generate_reasoning (daily 04:00 UTC), run_backtest (daily 05:00 UTC), "
        "fetch_probable_pitchers (daily 08:00 UTC). "
        "Executor: ThreadPoolExecutor(20 workers)."
    )
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
