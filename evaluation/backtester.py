"""
Backtesting and ROI evaluation engine.

Replays historical predictions against actual outcomes to evaluate:
    - Model accuracy (hit rate)
    - Calibration (Brier score, ECE, log-loss)
    - Profitability (ROI, Sharpe ratio, max drawdown)
    - Strategy performance under different staking rules

Staking strategies:
    - Flat: 1 unit per bet
    - Kelly: f* = (bp - q) / b  [full or fractional]
    - Fixed fractional: bet X% of current bankroll

Designed to be sport-agnostic — pass in any prediction list + actuals.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from core.types import BacktestResult, PredictionResult


@dataclass
class StakingConfig:
    """Configuration for a staking strategy."""
    method: str = "flat"           # "flat", "kelly", "fractional"
    unit_size: float = 1.0         # flat stake size
    kelly_fraction: float = 0.25   # fractional Kelly (0.25 = quarter Kelly)
    bankroll_start: float = 100.0
    min_odds: float = 1.4
    max_odds: float = 4.0
    min_edge: float = 0.02         # minimum model edge required to place bet
    max_bets_per_day: int = 20


class Backtester:
    """
    Replays predictions against historical outcomes.

    Usage:
        backtester = Backtester(StakingConfig(method="kelly", kelly_fraction=0.25))
        result = backtester.run(predictions, actuals, odds)
    """

    def __init__(self, config: StakingConfig | None = None) -> None:
        self.config = config or StakingConfig()

    def run(
        self,
        predictions: list[PredictionResult],
        actuals: list[float],
        odds: list[float] | None = None,
    ) -> BacktestResult:
        """
        Run backtest over a set of predictions.

        Args:
            predictions: Model predictions (must have match_id and probabilities).
            actuals: Actual outcomes. 1.0=home/A win, 0.5=draw, 0.0=away/B win.
            odds: Decimal odds available at bet time. If None, use model probabilities.

        Returns:
            BacktestResult with full performance metrics.
        """
        if len(predictions) != len(actuals):
            raise ValueError("predictions and actuals must have same length")

        if odds is None:
            # Use model probability as implied odds (upper bound)
            odds = [1.0 / p.p_home if p.p_home > 0 else None for p in predictions]

        records = self._run_simulation(predictions, actuals, odds)
        return self._compute_metrics(records, predictions, actuals)

    def _run_simulation(
        self,
        predictions: list[PredictionResult],
        actuals: list[float],
        odds: list[float],
    ) -> pd.DataFrame:
        """Run the staking simulation, return a DataFrame of bet records."""
        bankroll = self.config.bankroll_start
        records = []

        for pred, actual, odd in zip(predictions, actuals, odds):
            if odd is None:
                continue

            # Determine best bet outcome
            best_prob, best_actual = self._select_bet(pred, actual)
            if best_prob <= 0:
                continue

            implied_prob = 1.0 / odd
            edge = best_prob - implied_prob

            if edge < self.config.min_edge:
                continue
            if odd < self.config.min_odds or odd > self.config.max_odds:
                continue

            stake = self._calculate_stake(bankroll, best_prob, odd)
            if stake <= 0 or bankroll <= 0:
                continue

            won = best_actual == 1.0
            pnl = stake * (odd - 1.0) if won else -stake
            bankroll += pnl

            records.append({
                "match_id": pred.match_id,
                "model_prob": best_prob,
                "implied_prob": implied_prob,
                "edge": edge,
                "odds": odd,
                "stake": stake,
                "won": won,
                "pnl": pnl,
                "bankroll": bankroll,
            })

        return pd.DataFrame(records)

    def _select_bet(
        self, pred: PredictionResult, actual: float
    ) -> tuple[float, float]:
        """
        Choose which outcome to bet on (highest model probability).
        Returns (model_prob, actual_result_for_this_outcome).
        """
        options = [
            (pred.p_home, 1.0 if actual == 1.0 else 0.0),
        ]
        if pred.p_draw > 0:
            options.append((pred.p_draw, 1.0 if actual == 0.5 else 0.0))
        options.append((pred.p_away, 1.0 if actual == 0.0 else 0.0))

        # Bet on highest probability outcome
        return max(options, key=lambda x: x[0])

    def _calculate_stake(self, bankroll: float, prob: float, odds: float) -> float:
        """Calculate stake based on staking method."""
        if self.config.method == "flat":
            return self.config.unit_size

        elif self.config.method == "kelly":
            # Kelly formula: f* = (bp - q) / b
            b = odds - 1.0  # net odds
            q = 1.0 - prob
            kelly = (b * prob - q) / b
            kelly = max(0.0, kelly)
            fractional_kelly = kelly * self.config.kelly_fraction
            return bankroll * fractional_kelly

        elif self.config.method == "fractional":
            return bankroll * self.config.unit_size

        return self.config.unit_size

    def _compute_metrics(
        self,
        records: pd.DataFrame,
        predictions: list[PredictionResult],
        actuals: list[float],
    ) -> BacktestResult:
        """Compute full evaluation metrics from simulation records and raw predictions."""
        if records.empty:
            return BacktestResult(
                strategy_id=self.config.method,
                n_predictions=len(predictions),
                n_correct=0,
                accuracy=0.0,
                roi=0.0,
                sharpe_ratio=0.0,
                max_drawdown=0.0,
                log_loss=0.0,
                brier_score=0.0,
                calibration_error=0.0,
                pnl_units=0.0,
            )

        n_bets = len(records)
        n_won = records["won"].sum()
        total_staked = records["stake"].sum()
        total_pnl = records["pnl"].sum()
        roi = total_pnl / total_staked if total_staked > 0 else 0.0

        # Sharpe ratio (daily returns)
        returns = records["pnl"] / records["stake"]
        sharpe = (returns.mean() / returns.std() * np.sqrt(252)) if returns.std() > 0 else 0.0

        # Max drawdown
        cumulative = (records["bankroll"] - self.config.bankroll_start)
        running_max = cumulative.cummax()
        drawdown = (cumulative - running_max)
        max_dd = float(drawdown.min())

        # Calibration metrics on all predictions (not just bets)
        p_home = np.array([p.p_home for p in predictions])
        actual_arr = np.array(actuals)

        # Brier score
        brier = float(np.mean((p_home - (actual_arr == 1.0).astype(float)) ** 2))

        # Log-loss
        eps = 1e-7
        p_clipped = np.clip(p_home, eps, 1 - eps)
        actual_binary = (actual_arr == 1.0).astype(float)
        ll = float(-np.mean(
            actual_binary * np.log(p_clipped) + (1 - actual_binary) * np.log(1 - p_clipped)
        ))

        # Expected Calibration Error (10 bins)
        ece = self._compute_ece(p_home, actual_binary, n_bins=10)

        # Overall accuracy
        predicted = (p_home >= 0.5).astype(int)
        n_correct = int((predicted == actual_binary).sum())

        return BacktestResult(
            strategy_id=self.config.method,
            n_predictions=len(predictions),
            n_correct=n_correct,
            accuracy=n_correct / len(predictions),
            roi=roi,
            sharpe_ratio=float(sharpe),
            max_drawdown=max_dd,
            log_loss=ll,
            brier_score=brier,
            calibration_error=ece,
            pnl_units=total_pnl / self.config.unit_size,
            metadata={
                "n_bets_placed": n_bets,
                "n_bets_won": int(n_won),
                "total_staked": float(total_staked),
                "final_bankroll": float(records["bankroll"].iloc[-1]) if not records.empty else self.config.bankroll_start,
                "avg_odds": float(records["odds"].mean()),
                "avg_edge": float(records["edge"].mean()),
            },
        )

    @staticmethod
    def _compute_ece(probs: np.ndarray, actuals: np.ndarray, n_bins: int = 10) -> float:
        """
        Expected Calibration Error.
        Perfect calibration → ECE = 0.
        """
        bins = np.linspace(0, 1, n_bins + 1)
        ece = 0.0
        n = len(probs)

        for i in range(n_bins):
            mask = (probs >= bins[i]) & (probs < bins[i + 1])
            if mask.sum() == 0:
                continue
            bin_prob = probs[mask].mean()
            bin_actual = actuals[mask].mean()
            bin_weight = mask.sum() / n
            ece += bin_weight * abs(bin_prob - bin_actual)

        return float(ece)


class RollingBacktester(Backtester):
    """
    Walk-forward backtester.
    Trains on a rolling window, predicts on the next period.
    Prevents look-ahead bias.
    """

    def __init__(
        self,
        config: StakingConfig | None = None,
        train_window_days: int = 365,
        test_window_days: int = 30,
    ) -> None:
        super().__init__(config)
        self.train_window = train_window_days
        self.test_window = test_window_days

    def run_rolling(
        self,
        predictions: list[PredictionResult],
        actuals: list[float],
        dates: list[Any],
        odds: list[float] | None = None,
    ) -> list[BacktestResult]:
        """
        Run walk-forward backtest over the full date range.
        Returns a BacktestResult per test window.
        """
        import pandas as pd
        df = pd.DataFrame({
            "pred": predictions,
            "actual": actuals,
            "date": pd.to_datetime(dates),
            "odds": odds if odds else [None] * len(predictions),
        }).sort_values("date")

        results = []
        min_date = df["date"].min()
        max_date = df["date"].max()
        current = min_date + pd.Timedelta(days=self.train_window)

        while current < max_date:
            test_end = current + pd.Timedelta(days=self.test_window)
            test_mask = (df["date"] >= current) & (df["date"] < test_end)
            test_df = df[test_mask]

            if len(test_df) > 0:
                result = self.run(
                    list(test_df["pred"]),
                    list(test_df["actual"]),
                    list(test_df["odds"]) if odds else None,
                )
                result.metadata["period_start"] = str(current.date())
                result.metadata["period_end"] = str(test_end.date())
                results.append(result)

            current = test_end

        return results
