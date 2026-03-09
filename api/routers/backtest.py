"""
Backtest API — /api/v1/backtest

Exposes the evaluation/backtester.py engine via HTTP.
Queries historical predictions + outcomes from the DB and runs a simulation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db
from core.types import PredictionResult, Sport

router = APIRouter(prefix="/backtest", tags=["Backtest"])


def _outcome_to_float(outcome: str | None) -> float | None:
    """Map CoreMatch.outcome string to Backtester float convention."""
    if outcome == "home_win":
        return 1.0
    if outcome == "draw":
        return 0.5
    if outcome == "away_win":
        return 0.0
    return None


@router.get("/run")
def run_backtest(
    sport: Optional[str] = Query(None, description="soccer | tennis | esports | basketball | baseball | all"),
    staking: str = Query("flat", description="flat | kelly | fractional"),
    kelly_fraction: float = Query(0.25, ge=0.05, le=1.0),
    min_edge: float = Query(0.02, ge=0.0, le=0.5),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Run a backtest over all historical predictions with known outcomes.

    Returns accuracy, ROI, Sharpe, max drawdown, Brier score, ECE.
    Uses market odds from CoreMatch when available; falls back to model fair odds.
    """
    from evaluation.backtester import Backtester, StakingConfig
    from db.models.mvp import CoreMatch, PredMatch, ModelRegistry

    # Load finished matches with model predictions
    query = (
        db.query(CoreMatch, PredMatch)
        .join(PredMatch, PredMatch.match_id == CoreMatch.id)
        .filter(CoreMatch.status == "finished", CoreMatch.outcome.isnot(None))
    )
    if sport and sport != "all":
        query = query.filter(CoreMatch.sport == sport)
    if date_from:
        query = query.filter(CoreMatch.kickoff_utc >= date_from)
    if date_to:
        query = query.filter(CoreMatch.kickoff_utc <= date_to)

    rows = query.order_by(CoreMatch.kickoff_utc.asc()).all()

    if not rows:
        return {
            "sport": sport or "all",
            "staking": staking,
            "n_predictions": 0,
            "message": "No finished predictions found for the given filters.",
        }

    predictions: list[PredictionResult] = []
    actuals: list[float] = []
    odds_list: list[float | None] = []

    for match, pred in rows:
        actual = _outcome_to_float(match.outcome)
        if actual is None:
            continue

        predictions.append(PredictionResult(
            match_id=match.id,
            sport=Sport(match.sport or "soccer"),
            p_home=pred.p_home or 0.0,
            p_away=pred.p_away or 0.0,
            p_draw=pred.p_draw or 0.0,
            confidence=(pred.confidence or 0) / 100.0,
        ))
        actuals.append(actual)

        # Use sharpest bookmaker odds when available
        if match.odds_home and match.odds_home > 1.0:
            odds_list.append(match.odds_home)
        else:
            odds_list.append(1.0 / pred.p_home if (pred.p_home or 0) > 0.05 else None)

    if not predictions:
        return {
            "sport": sport or "all",
            "staking": staking,
            "n_predictions": 0,
            "message": "No valid predictions after filtering.",
        }

    config = StakingConfig(
        method=staking,
        kelly_fraction=kelly_fraction,
        min_edge=min_edge,
    )
    backtester = Backtester(config)
    result = backtester.run(predictions, actuals, odds_list)

    return {
        "sport": sport or "all",
        "staking": staking,
        "kelly_fraction": kelly_fraction if staking == "kelly" else None,
        "min_edge": min_edge,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
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
        **result.metadata,
    }
