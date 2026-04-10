"""
Backtest pipeline — runs the evaluation engine against all historical predictions
and stores results back into model_registry.metrics["backtest"].

Usage:
    python -m pipelines.backtest.run_backtest               # all live models
    python -m pipelines.backtest.run_backtest --sport soccer
    python -m pipelines.backtest.run_backtest --sport soccer --staking kelly
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from core.types import PredictionResult, Sport
from db.models.mvp import CoreMatch, ModelRegistry, PredMatch
from db.session import SessionLocal
from evaluation.backtester import Backtester, StakingConfig

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"]

# Thresholds for the handicap simulation (mirrors backfill_picks.py)
HC_MIN_CONFIDENCE: float = 0.25
HC_MIN_ODDS: float = 1.4
HC_MAX_ODDS: float = 4.0


def _outcome_to_float(outcome: str | None) -> float | None:
    if outcome in ("H", "home_win"):
        return 1.0
    if outcome in ("D", "draw"):
        return 0.5
    if outcome in ("A", "away_win"):
        return 0.0
    return None


def _run_tennis_handicap(session: Session) -> dict | None:
    """
    Simulate set handicap (-1.5 sets) betting on tennis predictions.

    For each finished tennis match with a PredMatch and set scores:
    - Compute P(favourite wins 2-0) using BO3 formula W = p²(3-2p)
    - Only place the favourite's -1.5 bet if fair odds pass MIN/MAX range
    - Apply a confidence gate of HC_MIN_CONFIDENCE
    - Flat 1u staking (no Kelly — we have no market odds reference, just fair odds)

    Returns a summary dict stored as metrics["backtest"]["set_handicap"].
    """
    import numpy as np
    from sqlalchemy import func
    from db.models.mvp import CoreMatch, PredMatch
    from pipelines.picks.auto_picks import _solve_per_set_prob

    subq = (
        session.query(PredMatch.match_id, func.max(PredMatch.id).label("latest_id"))
        .join(CoreMatch, CoreMatch.id == PredMatch.match_id)
        .filter(CoreMatch.sport == "tennis")
        .group_by(PredMatch.match_id)
        .subquery()
    )
    rows = (
        session.query(CoreMatch, PredMatch)
        .join(subq, subq.c.match_id == CoreMatch.id)
        .join(PredMatch, PredMatch.id == subq.c.latest_id)
        .filter(
            CoreMatch.sport == "tennis",
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
            CoreMatch.home_score.isnot(None),
            CoreMatch.away_score.isnot(None),
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if not rows:
        log.warning("  Tennis handicap: no finished matches with set scores.")
        return None

    bets = []
    skipped_conf = 0
    skipped_odds = 0
    skipped_sets = 0

    for match, pred in rows:
        p_home = pred.p_home or 0.0
        p_away = pred.p_away or 0.0
        if p_home <= 0 or p_away <= 0:
            continue

        confidence = (pred.confidence or 0) / 100.0
        if confidence < HC_MIN_CONFIDENCE:
            skipped_conf += 1
            continue

        # Identify the favourite (higher match win prob)
        fav_is_home = p_home >= p_away
        fav_prob = p_home if fav_is_home else p_away

        # Compute per-set probability for the favourite
        p_set = _solve_per_set_prob(fav_prob)
        p_clean = p_set ** 2          # P(favourite wins 2-0)
        hc_odds = round(1.0 / p_clean, 3) if p_clean > 0.01 else None
        if hc_odds is None or hc_odds < HC_MIN_ODDS or hc_odds > HC_MAX_ODDS:
            skipped_odds += 1
            continue

        try:
            h_sets = int(match.home_score)
            a_sets = int(match.away_score)
        except (ValueError, TypeError):
            skipped_sets += 1
            continue

        if fav_is_home:
            won = (h_sets - a_sets) >= 2   # home wins 2-0
        else:
            won = (a_sets - h_sets) >= 2   # away wins 2-0

        pnl = (hc_odds - 1.0) if won else -1.0
        bets.append({
            "match_id": match.id,
            "fav_prob": fav_prob,
            "p_clean": p_clean,
            "hc_odds": hc_odds,
            "won": won,
            "pnl": pnl,
            "date": match.kickoff_utc,
        })

    if not bets:
        log.warning("  Tennis handicap: no bets survived filters (conf_skip=%d odds_skip=%d sets_skip=%d).",
                    skipped_conf, skipped_odds, skipped_sets)
        return None

    pnl_arr = np.array([b["pnl"] for b in bets])
    won_arr = np.array([b["won"] for b in bets])
    odds_arr = np.array([b["hc_odds"] for b in bets])
    n_bets = len(bets)
    n_won = int(won_arr.sum())
    total_pnl = float(pnl_arr.sum())
    roi = total_pnl / n_bets   # flat 1u per bet

    # Sharpe (per-bet returns as % of stake)
    ret_std = float(pnl_arr.std())
    sharpe = float(pnl_arr.mean() / ret_std * (n_bets ** 0.5)) if ret_std > 0 else 0.0

    # Max drawdown on cumulative P/L curve
    cum = np.cumsum(pnl_arr)
    running_max = np.maximum.accumulate(cum)
    max_dd = float((cum - running_max).min())

    date_from = bets[0]["date"]
    date_to = bets[-1]["date"]

    result = {
        "n_bets": n_bets,
        "n_won": n_won,
        "hit_rate": round(n_won / n_bets, 4),
        "pnl_units": round(total_pnl, 2),
        "roi": round(roi, 4),
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown_units": round(max_dd, 2),
        "avg_odds": round(float(odds_arr.mean()), 3),
        "skipped_conf": skipped_conf,
        "skipped_odds": skipped_odds,
        "staking": "flat_1u",
        "market": "Set Handicap -1.5",
        "side": "favourite_only",
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "run_at": datetime.now(tz=timezone.utc).isoformat(),
    }

    log.info(
        "  tennis-handicap  n=%d  hit=%.1f%%  pnl=%+.1fu  roi=%+.1f%%  sharpe=%.2f  dd=%.1fu",
        n_bets, n_won / n_bets * 100, total_pnl, roi * 100, sharpe, max_dd,
    )
    return result


def _run_for_sport(
    session: Session,
    sport: str,
    staking: str = "flat",
    kelly_fraction: float = 0.25,
    min_edge: float = 0.02,
) -> dict | None:
    """Run backtester for one sport using all historical predictions."""
    registry = (
        session.query(ModelRegistry)
        .filter_by(sport=sport, is_live=True)
        .order_by(ModelRegistry.trained_at.desc())
        .first()
    )
    if not registry:
        log.warning("  No live model for %s — skipping.", sport)
        return None

    # Use all finished predictions for this sport (any model version).
    # We deduplicate by match_id keeping the latest prediction.
    from sqlalchemy import func
    subq = (
        session.query(PredMatch.match_id, func.max(PredMatch.id).label("latest_id"))
        .join(CoreMatch, CoreMatch.id == PredMatch.match_id)
        .filter(CoreMatch.sport == sport)
        .group_by(PredMatch.match_id)
        .subquery()
    )
    rows = (
        session.query(CoreMatch, PredMatch)
        .join(subq, subq.c.match_id == CoreMatch.id)
        .join(PredMatch, PredMatch.id == subq.c.latest_id)
        .filter(
            CoreMatch.sport == sport,
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if not rows:
        log.warning("  No finished predictions for %s (%s).", sport, registry.model_name)
        return None

    # Per-sport confidence gates (mirror auto_picks.py SPORT_MIN_CONFIDENCE)
    CONF_GATE: dict[str, float] = {
        "soccer": 0.50,
        "baseball": 0.50,
    }
    conf_gate = CONF_GATE.get(sport, 0.0)

    predictions, actuals, odds_list = [], [], []
    for match, pred in rows:
        actual = _outcome_to_float(match.outcome)
        if actual is None:
            continue

        confidence = (pred.confidence or 0) / 100.0
        if confidence < conf_gate:
            continue

        p_home = pred.p_home or 0.0
        p_away = pred.p_away or 0.0
        p_draw = pred.p_draw or 0.0

        # Determine the best outcome and pass ITS odds to the backtester.
        # Previously we always passed home odds, which broke draw/away P/L.
        best_p = max(p_home, p_draw, p_away)
        if best_p == p_draw and p_draw > 0:
            real_odds = match.odds_draw
            fair_odds = 1.0 / p_draw if p_draw > 0.05 else None
        elif best_p == p_away:
            real_odds = match.odds_away
            fair_odds = 1.0 / p_away if p_away > 0.05 else None
        else:
            real_odds = match.odds_home
            fair_odds = 1.0 / p_home if p_home > 0.05 else None

        bet_odds = (real_odds if real_odds and real_odds > 1.0 else fair_odds)

        predictions.append(PredictionResult(
            match_id=match.id,
            sport=Sport(sport),
            p_home=p_home,
            p_away=p_away,
            p_draw=p_draw,
            confidence=confidence,
        ))
        actuals.append(actual)
        odds_list.append(bet_odds)

    if not predictions:
        log.warning("  No valid predictions for %s after filtering.", sport)
        return None

    # Soccer uses fair odds (edge ≈ 0) — drop the edge gate so confident picks
    # aren't filtered out. Other sports keep the 2% edge gate for real odds.
    effective_min_edge = 0.0 if sport == "soccer" else min_edge
    config = StakingConfig(method=staking, kelly_fraction=kelly_fraction, min_edge=effective_min_edge)
    result = Backtester(config).run(predictions, actuals, odds_list)

    date_from = rows[0][0].kickoff_utc
    date_to = rows[-1][0].kickoff_utc

    summary = {
        "live_model": registry.model_name,
        "n_predictions": result.n_predictions,
        "n_correct": result.n_correct,
        "accuracy": round(result.accuracy, 4),
        "roi": round(result.roi, 4),
        "sharpe_ratio": round(result.sharpe_ratio, 3),
        "max_drawdown": round(result.max_drawdown, 4),
        "log_loss": round(result.log_loss, 4),
        "brier_score": round(result.brier_score, 4),
        "calibration_error": round(result.calibration_error, 4),
        "pnl_units": round(result.pnl_units, 2),
        "staking": staking,
        "kelly_fraction": kelly_fraction if staking == "kelly" else None,
        "min_edge": min_edge,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "run_at": datetime.now(tz=timezone.utc).isoformat(),
        **result.metadata,
    }

    dd_pct = result.max_drawdown / config.bankroll_start * 100  # convert units → %
    log.info(
        "  %-10s  n=%d  acc=%.1f%%  roi=%+.1f%%  sharpe=%.2f  drawdown=%.1f%%",
        sport,
        result.n_predictions,
        result.accuracy * 100,
        result.roi * 100,
        result.sharpe_ratio,
        dd_pct,
    )

    # Persist into model_registry.metrics["backtest"]
    metrics = dict(registry.metrics or {})
    metrics["backtest"] = summary

    # For tennis: also run set handicap simulation and embed the result
    if sport == "tennis":
        hc_result = _run_tennis_handicap(session)
        if hc_result:
            metrics["backtest"]["set_handicap"] = hc_result

    registry.metrics = metrics

    return summary


def run(sport: str | None = None, staking: str = "flat", kelly_fraction: float = 0.25, min_edge: float = 0.02) -> None:
    session: Session = SessionLocal()
    try:
        target_sports = [sport] if sport and sport != "all" else SPORTS
        log.info("Running backtest for: %s  staking=%s  min_edge=%.2f", target_sports, staking, min_edge)

        all_results = {}
        for s in target_sports:
            log.info("--- %s ---", s.upper())
            result = _run_for_sport(session, s, staking, kelly_fraction, min_edge)
            if result:
                all_results[s] = result

        session.commit()
        log.info("Backtest complete. Results stored in model_registry.metrics['backtest'].")

        if all_results:
            log.info("\n%-12s %-8s %-8s %-8s %-8s", "Sport", "Acc", "ROI", "Sharpe", "n")
            log.info("-" * 48)
            for s, r in all_results.items():
                log.info("%-12s %-8s %-8s %-8s %-8d",
                    s,
                    f"{r['accuracy']:.1%}",
                    f"{r['roi']:+.1%}",
                    f"{r['sharpe_ratio']:.2f}",
                    r['n_predictions'],
                )

    except Exception:
        session.rollback()
        log.exception("Backtest failed")
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run backtest across all live models")
    parser.add_argument("--sport", default=None, help="soccer|tennis|esports|basketball|baseball|hockey|all")
    parser.add_argument("--staking", default="flat", choices=["flat", "kelly", "fractional"])
    parser.add_argument("--kelly-fraction", type=float, default=0.25)
    parser.add_argument("--min-edge", type=float, default=0.02)
    args = parser.parse_args()
    run(sport=args.sport, staking=args.staking, kelly_fraction=args.kelly_fraction, min_edge=args.min_edge)


if __name__ == "__main__":
    main()
