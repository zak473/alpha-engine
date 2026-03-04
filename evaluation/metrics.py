"""
Standalone metric functions for model evaluation.
Importable and usable outside the backtester context.
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score


def accuracy(y_true: list[int], y_pred_prob: list[float], threshold: float = 0.5) -> float:
    pred = [1 if p >= threshold else 0 for p in y_pred_prob]
    return sum(p == a for p, a in zip(pred, y_true)) / len(y_true)


def roi(pnl_list: list[float], stakes: list[float]) -> float:
    total_pnl = sum(pnl_list)
    total_staked = sum(stakes)
    return total_pnl / total_staked if total_staked > 0 else 0.0


def sharpe_ratio(returns: list[float], periods_per_year: float = 252) -> float:
    r = np.array(returns)
    if r.std() == 0:
        return 0.0
    return float(r.mean() / r.std() * np.sqrt(periods_per_year))


def max_drawdown(bankroll_series: list[float]) -> float:
    arr = np.array(bankroll_series)
    running_max = np.maximum.accumulate(arr)
    drawdown = arr - running_max
    return float(drawdown.min())


def brier(y_true: list[float], y_prob: list[float]) -> float:
    return float(brier_score_loss(y_true, y_prob))


def logloss(y_true: list[float], y_prob: list[float]) -> float:
    return float(log_loss(y_true, y_prob))


def auc(y_true: list[int], y_prob: list[float]) -> float:
    try:
        return float(roc_auc_score(y_true, y_prob))
    except Exception:
        return 0.0


def ece(y_prob: np.ndarray, y_true: np.ndarray, n_bins: int = 10) -> float:
    """Expected Calibration Error."""
    bins = np.linspace(0, 1, n_bins + 1)
    error = 0.0
    n = len(y_prob)
    for i in range(n_bins):
        mask = (y_prob >= bins[i]) & (y_prob < bins[i + 1])
        if mask.sum() == 0:
            continue
        bin_acc = y_true[mask].mean()
        bin_conf = y_prob[mask].mean()
        error += mask.sum() / n * abs(bin_acc - bin_conf)
    return float(error)


def clv(odds_at_publish: list[float], odds_at_close: list[float]) -> float:
    """
    Closing Line Value.
    Positive CLV means you beat the market consistently.
    """
    if not odds_at_publish or not odds_at_close:
        return 0.0
    values = [
        (1 / close - 1 / publish) / (1 / publish)
        for publish, close in zip(odds_at_publish, odds_at_close)
        if publish and close
    ]
    return float(np.mean(values)) if values else 0.0


def kelly_fraction(prob: float, odds: float) -> float:
    """
    Full Kelly criterion stake fraction.
    f* = (b*p - q) / b, where b = odds - 1, q = 1 - p
    """
    b = odds - 1.0
    q = 1.0 - prob
    f = (b * prob - q) / b
    return max(0.0, f)
