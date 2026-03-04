"""
Generic Monte Carlo simulation engine.

Takes probability distributions as input and returns outcome distributions.
Sport-specific score models are injected as callables.

Design:
    - The core sampler is sport-agnostic.
    - Score distributions (goals, sets, rounds) are sport-specific functions.
    - All simulations are vectorised with NumPy for performance.
    - Results include confidence intervals from the simulation variance.
"""

from __future__ import annotations

from typing import Any, Callable

import numpy as np
from scipy import stats

from core.types import MatchContext, PredictionResult, SimulationResult


class MonteCarloEngine:
    """
    Generic Monte Carlo match simulator.

    Usage:
        engine = MonteCarloEngine()

        # Register a sport-specific score sampler
        engine.register_score_sampler("soccer", soccer_score_sampler)

        # Run simulation
        result = engine.simulate(prediction, context, sport="soccer", n=10_000)
    """

    def __init__(self, default_n: int = 10_000, random_seed: int | None = 42) -> None:
        self._n = default_n
        self._rng = np.random.default_rng(random_seed)
        self._score_samplers: dict[str, Callable] = {}
        # Register built-in samplers
        self._score_samplers["soccer"] = self._soccer_score_sampler
        self._score_samplers["tennis"] = self._tennis_score_sampler
        self._score_samplers["esports"] = self._esports_score_sampler

    def register_score_sampler(self, sport: str, sampler: Callable) -> None:
        """
        Register a custom score sampler for a sport.

        sampler signature:
            (p_home: float, context: MatchContext, rng: np.random.Generator, n: int)
            → np.ndarray of shape (n, 2): [[home_score, away_score], ...]
        """
        self._score_samplers[sport] = sampler

    def simulate(
        self,
        prediction: PredictionResult,
        context: MatchContext,
        sport: str,
        n: int | None = None,
    ) -> SimulationResult:
        """
        Run N simulations for a single match and return outcome distribution.
        """
        n = n or self._n
        sampler = self._score_samplers.get(sport)
        if sampler is None:
            raise ValueError(f"No score sampler registered for sport '{sport}'")

        # Sample scores: shape (n, 2)
        scores = sampler(prediction.p_home, context, self._rng, n)
        home_scores = scores[:, 0]
        away_scores = scores[:, 1]

        home_wins = (home_scores > away_scores).sum()
        away_wins = (home_scores < away_scores).sum()
        draws = (home_scores == away_scores).sum()

        p_home = home_wins / n
        p_away = away_wins / n
        p_draw = draws / n

        # 95% confidence intervals for p_home via normal approximation
        se = np.sqrt(p_home * (1 - p_home) / n)
        ci = (max(0.0, p_home - 1.96 * se), min(1.0, p_home + 1.96 * se))

        return SimulationResult(
            match_id=prediction.match_id,
            n_simulations=n,
            p_home_win=float(p_home),
            p_away_win=float(p_away),
            p_draw=float(p_draw),
            expected_home_score=float(home_scores.mean()),
            expected_away_score=float(away_scores.mean()),
            confidence_interval=ci,
        )

    def simulate_tournament(
        self,
        team_ids: list[str],
        bracket: dict[str, Any],
        prediction_fn: Callable[[str, str, MatchContext], PredictionResult],
        context_fn: Callable[[str, str], MatchContext],
        sport: str,
        n: int | None = None,
    ) -> dict[str, float]:
        """
        Simulate a full knockout tournament N times.
        Returns probability each team wins the tournament.

        bracket: {"rounds": [[(team_a, team_b), ...], ...]}
        Each round is simulated in sequence; winners advance.
        """
        n = n or self._n
        win_counts: dict[str, int] = {t: 0 for t in team_ids}

        for _ in range(n):
            remaining = list(team_ids)
            rounds = bracket.get("rounds", [])

            for round_matchups in rounds:
                winners = []
                for team_a, team_b in round_matchups:
                    if team_a not in remaining or team_b not in remaining:
                        continue
                    ctx = context_fn(team_a, team_b)
                    pred = prediction_fn(team_a, team_b, ctx)
                    # Sample single outcome
                    rand = self._rng.random()
                    if rand < pred.p_home:
                        winners.append(team_a)
                    elif rand < pred.p_home + pred.p_draw:
                        # Draw — flip coin (extra time/penalties)
                        winners.append(self._rng.choice([team_a, team_b]))
                    else:
                        winners.append(team_b)
                remaining = winners

            if remaining:
                win_counts[remaining[0]] += 1

        return {t: c / n for t, c in win_counts.items()}

    def scoreline_distribution(
        self,
        prediction: PredictionResult,
        context: MatchContext,
        sport: str,
        n: int | None = None,
        max_score: int = 8,
    ) -> dict[str, float]:
        """
        Return scoreline probability distribution for a match.
        e.g. {"2-1": 0.12, "1-0": 0.10, ...}

        Soccer: integer goals; Tennis: sets; Esports: rounds (simplified).
        """
        n = n or self._n
        sampler = self._score_samplers.get(sport)
        if sampler is None:
            raise ValueError(f"No score sampler for sport '{sport}'")

        scores = sampler(prediction.p_home, context, self._rng, n)
        home_scores = np.clip(scores[:, 0].astype(int), 0, max_score)
        away_scores = np.clip(scores[:, 1].astype(int), 0, max_score)

        dist: dict[str, float] = {}
        for h, a in zip(home_scores, away_scores):
            key = f"{h}-{a}"
            dist[key] = dist.get(key, 0) + 1

        return {k: v / n for k, v in sorted(dist.items(), key=lambda x: -x[1])}

    # ------------------------------------------------------------------
    # Built-in sport score samplers
    # ------------------------------------------------------------------

    def _soccer_score_sampler(
        self,
        p_home_win: float,
        context: MatchContext,
        rng: np.random.Generator,
        n: int,
    ) -> np.ndarray:
        """
        Dixon-Coles Poisson model for soccer scorelines.

        Expected goals are back-calculated from the ELO win probability.
        p_home_win → lambda_home and lambda_away via inverse logit scaling.

        Calibrated average: EPL avg ~2.7 goals/game, ~56% home win rate.
        """
        # Convert win prob to expected goal ratio
        # At p=0.5, lambda_home ≈ lambda_away ≈ 1.35 (EPL baseline)
        baseline_lambda = context.extra.get("xg_home", 1.35)
        baseline_lambda_away = context.extra.get("xg_away", 1.05)

        # Scale lambdas proportionally to win probability
        scaling = p_home_win / 0.45  # normalise around typical home prob
        lambda_home = baseline_lambda * scaling
        lambda_away = baseline_lambda_away / scaling

        lambda_home = np.clip(lambda_home, 0.3, 4.0)
        lambda_away = np.clip(lambda_away, 0.3, 4.0)

        home_goals = rng.poisson(lambda_home, n)
        away_goals = rng.poisson(lambda_away, n)

        return np.column_stack([home_goals, away_goals])

    def _tennis_score_sampler(
        self,
        p_player_a: float,
        context: MatchContext,
        rng: np.random.Generator,
        n: int,
    ) -> np.ndarray:
        """
        Tennis set-level simulation.
        Each set is a Bernoulli trial with probability p_player_a.
        best_of: 3 or 5 sets (from context).

        Returns sets won by each player.
        """
        best_of = context.extra.get("best_of", 3)
        sets_to_win = (best_of + 1) // 2

        a_sets = np.zeros(n, dtype=int)
        b_sets = np.zeros(n, dtype=int)

        for _ in range(best_of):
            # Only play if match not decided
            active = (a_sets < sets_to_win) & (b_sets < sets_to_win)
            set_outcomes = rng.random(n) < p_player_a
            a_sets += active & set_outcomes
            b_sets += active & ~set_outcomes

        return np.column_stack([a_sets, b_sets])

    def _esports_score_sampler(
        self,
        p_team_a: float,
        context: MatchContext,
        rng: np.random.Generator,
        n: int,
    ) -> np.ndarray:
        """
        CS2 round-level simulation (simplified to map outcomes).

        For series prediction: each map is a Bernoulli trial.
        Series format from context (bo1, bo3, bo5).
        """
        fmt = context.extra.get("format", "bo3")
        maps_to_win = {"bo1": 1, "bo3": 2, "bo5": 3}.get(fmt, 2)
        total_maps = {"bo1": 1, "bo3": 3, "bo5": 5}.get(fmt, 3)

        a_maps = np.zeros(n, dtype=int)
        b_maps = np.zeros(n, dtype=int)

        for _ in range(total_maps):
            active = (a_maps < maps_to_win) & (b_maps < maps_to_win)
            map_outcomes = rng.random(n) < p_team_a
            a_maps += active & map_outcomes
            b_maps += active & ~map_outcomes

        return np.column_stack([a_maps, b_maps])
