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


def _outcome_to_float(outcome: str | None) -> float | None:
    if outcome in ("H", "home_win"):
        return 1.0
    if outcome in ("D", "draw"):
        return 0.5
    if outcome in ("A", "away_win"):
        return 0.0
    return None


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

    predictions, actuals, odds_list = [], [], []
    for match, pred in rows:
        actual = _outcome_to_float(match.outcome)
        if actual is None:
            continue
        predictions.append(PredictionResult(
            match_id=match.id,
            sport=Sport(sport),
            p_home=pred.p_home or 0.0,
            p_away=pred.p_away or 0.0,
            p_draw=pred.p_draw or 0.0,
            confidence=(pred.confidence or 0) / 100.0,
        ))
        actuals.append(actual)
        if match.odds_home and match.odds_home > 1.0:
            odds_list.append(match.odds_home)
        else:
            odds_list.append(1.0 / pred.p_home if (pred.p_home or 0) > 0.05 else None)

    if not predictions:
        log.warning("  No valid predictions for %s after filtering.", sport)
        return None

    config = StakingConfig(method=staking, kelly_fraction=kelly_fraction, min_edge=min_edge)
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
