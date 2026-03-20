"""
Generic configurable ELO rating engine.

This is the core of the rating system. Every sport uses this engine
with a sport-specific EloConfig. No hardcoded values anywhere.

Design decisions:
    - EloConfig is a dataclass, not a dict. Enforces typed configuration.
    - All modifiers are additive to the effective rating before expected score calc.
    - K-factor is dynamic: decreases as entity accumulates matches (stabilises ratings).
    - Margin of Victory uses log-dampening to prevent runaway inflation.
    - Time decay is a blend toward base_rating, not a simple percentage drop.
    - Player adjustment is applied symmetrically (A gains what B loses from lineup diff).
    - History is stored in-memory for backfill runs; production callers persist to DB.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from core.base_rating import RatingEngine
from core.types import MatchContext, RatingUpdate


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class EloConfig:
    """
    All parameters for the ELO engine. Pass this at construction time.
    Sport-specific subclasses set sensible defaults.
    """
    # Base rating assigned to every new entity
    base_rating: float = 1500.0

    # ELO scale factor (higher = flatter probability curves)
    # FiveThirtyEight uses 400. Chess uses 400. We default to 400.
    scale: float = 400.0

    # K-factor: maximum rating points exchanged per match
    k_base: float = 32.0

    # K-factor decay: K shrinks as n_matches grows (entity stabilises)
    # k_effective = k_base / (1 + k_decay_rate * n_matches)^k_decay_power
    k_decay_enabled: bool = True
    k_decay_rate: float = 0.01    # rate at which K shrinks per match
    k_decay_power: float = 0.5    # exponent on decay curve (0.5 = square root)
    k_min: float = 8.0            # floor — K never drops below this

    # Importance multiplier applied to K-factor
    # Set per-match via context["importance"] (e.g. 1.5 for a Grand Slam final)
    importance_default: float = 1.0

    # Home advantage bonus added to the home entity's effective rating
    home_advantage: float = 65.0   # ~65 rating points ≈ 55% win prob at equal ratings

    # Per-team home advantage learning
    # After each match, the home team's individual home advantage is nudged by:
    #   home_adv += home_adv_learning_rate * (actual - expected)
    # Set to 0.0 to disable (falls back to global home_advantage for all teams).
    home_adv_learning_rate: float = 1.5

    # Surface / map modifiers
    # Applied as additive deltas to effective rating.
    # Each sport provides a dict: {"hard": 0.0, "clay": -30.0, ...} per entity.
    # This field is the weight applied to the entity's surface delta.
    surface_modifier_weight: float = 1.0

    # Margin of Victory (MoV) multiplier
    # Prevents games being run up and rewards accurate score prediction.
    # Uses log-dampening: multiplier = log(1 + margin) * mov_weight
    mov_enabled: bool = True
    mov_weight: float = 0.5       # scales the log-dampened MoV effect
    mov_cap: float = 3.0          # maximum multiplier (prevents extreme results)

    # Player-level adjustment
    # When a strong team fields a weak lineup, their effective rating is penalised.
    # Applied as an additive term: player_adjustment (positive = stronger lineup)
    player_adjustment_weight: float = 1.0  # scales the incoming adjustment value

    # Time decay
    # Ratings blended toward base_rating when entity is inactive.
    # new_rating = rating * decay^(days/365) + base * (1 - decay^(days/365))
    time_decay_enabled: bool = True
    time_decay_rate: float = 0.95    # per year — 5% reversion toward base per year
    time_decay_min_days: int = 90    # decay only triggers after this many inactive days

    # Rating floor/ceiling
    rating_floor: float = 800.0
    rating_ceiling: float = 2500.0


# ---------------------------------------------------------------------------
# ELO Engine
# ---------------------------------------------------------------------------

class EloEngine(RatingEngine):
    """
    Generic ELO engine. Instantiate with an EloConfig.

    Example:
        config = EloConfig(base_rating=1500, k_base=32, home_advantage=65)
        engine = EloEngine(config)
        engine.update_ratings("team_a", "team_b", 2, 1, context)
    """

    def __init__(self, config: EloConfig | None = None) -> None:
        self.config = config or EloConfig()
        self._ratings: dict[str, float] = {}          # entity_id → current rating
        self._match_counts: dict[str, int] = {}        # entity_id → total matches processed
        self._last_active: dict[str, datetime] = {}    # entity_id → last match date
        self._history: dict[str, list[RatingUpdate]] = {}  # entity_id → update history
        self._home_advantages: dict[str, float] = {}  # entity_id → learned home advantage

    # ------------------------------------------------------------------
    # RatingEngine interface
    # ------------------------------------------------------------------

    def get_rating(self, entity_id: str) -> float:
        return self._ratings.get(entity_id, self.config.base_rating)

    def get_rating_history(self, entity_id: str) -> list[RatingUpdate]:
        return self._history.get(entity_id, [])

    def reset(self) -> None:
        self._ratings.clear()
        self._match_counts.clear()
        self._last_active.clear()
        self._history.clear()

    def expected_score(
        self,
        rating_a: float,
        rating_b: float,
        context: MatchContext,
    ) -> float:
        """
        E_a = 1 / (1 + 10^((R_b_eff - R_a_eff) / scale))

        Effective ratings include:
            - Home advantage (for home entity)
            - Surface / map modifier delta (from context)
            - Player lineup adjustment delta (from context)
        """
        r_a_eff = rating_a
        r_b_eff = rating_b

        # Home advantage (per-team if learned, else global default)
        if context.home_entity_id:
            r_a_eff += self._home_advantages.get(context.home_entity_id, self.config.home_advantage)

        # Surface / map modifier
        # context.extra["surface_delta_a"] = modifier for entity A on this surface
        surface_delta_a = context.extra.get("surface_delta_a", 0.0)
        surface_delta_b = context.extra.get("surface_delta_b", 0.0)
        r_a_eff += surface_delta_a * self.config.surface_modifier_weight
        r_b_eff += surface_delta_b * self.config.surface_modifier_weight

        # Player adjustment (lineup strength differential)
        player_adj = context.extra.get("player_adjustment", 0.0)
        r_a_eff += player_adj * self.config.player_adjustment_weight

        exponent = (r_b_eff - r_a_eff) / self.config.scale
        return 1.0 / (1.0 + 10.0 ** exponent)

    def update_ratings(
        self,
        entity_a_id: str,
        entity_b_id: str,
        score_a: float,
        score_b: float,
        context: MatchContext,
    ) -> tuple[RatingUpdate, RatingUpdate]:
        """
        Process a match and return RatingUpdate records for both entities.

        score_a / score_b are the match scores in natural units
        (goals, sets, rounds, maps won) used for MoV calculation.
        The actual win/loss/draw outcome is derived from these scores.
        """
        r_a = self.get_rating(entity_a_id)
        r_b = self.get_rating(entity_b_id)

        expected_a = self.expected_score(r_a, r_b, context)
        expected_b = 1.0 - expected_a

        # Actual outcome score: 1=win, 0.5=draw, 0=loss
        actual_a = self._outcome_to_score(score_a, score_b)
        actual_b = 1.0 - actual_a

        # OT/SO adjustment: games decided in extra time were effectively a draw
        # at regulation — dampen the outcome 25% toward 0.5 to reduce rating swing.
        # Only applies to hockey and basketball where OT is a known concept.
        period_type = context.extra.get("period_type")
        if period_type in ("overtime", "shootout"):
            actual_a = actual_a * 0.75 + 0.5 * 0.25
            actual_b = actual_b * 0.75 + 0.5 * 0.25

        # Dynamic K-factor
        # extra["importance"] takes precedence (sport engines inject it for per-match
        # overrides); otherwise fall back to context.importance which callers set
        # from a league/competition lookup.
        importance = context.extra.get("importance", context.importance)
        k_a = self._k_factor(entity_a_id) * importance
        k_b = self._k_factor(entity_b_id) * importance

        # Margin of Victory multiplier
        # Callers can supply alternative MoV signals (e.g. xG) via extra without
        # changing the outcome — xG home/away override raw scores for MoV only.
        # park_factor normalises MoV for baseball: 5-run win at Coors (PF=1.3)
        # ≈ 3.8-run win at a neutral park.
        mov_a = context.extra.get("xg_home", score_a)
        mov_b = context.extra.get("xg_away", score_b)
        park_factor = context.extra.get("park_factor", 1.0)
        if park_factor != 1.0:
            margin = abs(mov_a - mov_b)
            adj_margin = margin / park_factor
            if mov_a > mov_b:
                mov_a, mov_b = adj_margin, 0.0
            else:
                mov_a, mov_b = 0.0, adj_margin
        mov = self._mov_multiplier(mov_a, mov_b) if self.config.mov_enabled else 1.0

        # Rating deltas
        delta_a = k_a * mov * (actual_a - expected_a)
        delta_b = k_b * mov * (actual_b - expected_b)

        new_r_a = self._clamp(r_a + delta_a)
        new_r_b = self._clamp(r_b + delta_b)

        # Update per-team home advantage for the home entity
        if context.home_entity_id and self.config.home_adv_learning_rate > 0:
            current_adv = self._home_advantages.get(entity_a_id, self.config.home_advantage)
            new_adv = current_adv + self.config.home_adv_learning_rate * (actual_a - expected_a)
            # Clamp to a sane range: never below 0, never above 200 rating points
            self._home_advantages[entity_a_id] = max(0.0, min(200.0, new_adv))

        # Build update records
        now = context.date
        update_a = RatingUpdate(
            entity_id=entity_a_id,
            rating_before=r_a,
            rating_after=new_r_a,
            expected_score=expected_a,
            actual_score=actual_a,
            k_factor=k_a,
            timestamp=now,
        )
        update_b = RatingUpdate(
            entity_id=entity_b_id,
            rating_before=r_b,
            rating_after=new_r_b,
            expected_score=expected_b,
            actual_score=actual_b,
            k_factor=k_b,
            timestamp=now,
        )

        # Persist in-memory
        self._ratings[entity_a_id] = new_r_a
        self._ratings[entity_b_id] = new_r_b
        self._match_counts[entity_a_id] = self._match_counts.get(entity_a_id, 0) + 1
        self._match_counts[entity_b_id] = self._match_counts.get(entity_b_id, 0) + 1
        self._last_active[entity_a_id] = now
        self._last_active[entity_b_id] = now
        self._history.setdefault(entity_a_id, []).append(update_a)
        self._history.setdefault(entity_b_id, []).append(update_b)

        return update_a, update_b

    def season_revert(self, revert_fraction: float = 0.25) -> None:
        """
        Partial mean reversion at the start of a new season.

        Blends every rating `revert_fraction` of the way back toward base_rating.
        Prevents stale carry-forward advantage from prior seasons.

        new_rating = old_rating * (1 - revert_fraction) + base_rating * revert_fraction

        Typical values: 0.20–0.33 (FiveThirtyEight uses ~1/3 for NFL).
        """
        for entity_id in list(self._ratings):
            old = self._ratings[entity_id]
            self._ratings[entity_id] = self._clamp(
                old * (1.0 - revert_fraction) + self.config.base_rating * revert_fraction
            )

    def decay_ratings(self, as_of_date: datetime) -> dict[str, float]:
        """
        Blend all ratings toward base_rating proportionally to inactivity period.
        Only entities inactive beyond time_decay_min_days are affected.
        Returns the full dict of decayed ratings.
        """
        if not self.config.time_decay_enabled:
            return dict(self._ratings)

        decayed = {}
        for entity_id, rating in self._ratings.items():
            last = self._last_active.get(entity_id)
            if last is None:
                decayed[entity_id] = rating
                continue

            days_inactive = (as_of_date - last).days
            if days_inactive < self.config.time_decay_min_days:
                decayed[entity_id] = rating
                continue

            years_inactive = days_inactive / 365.0
            decay_factor = self.config.time_decay_rate ** years_inactive
            blended = rating * decay_factor + self.config.base_rating * (1.0 - decay_factor)
            decayed[entity_id] = self._clamp(blended)

        self._ratings.update(decayed)
        return decayed

    # ------------------------------------------------------------------
    # Utility methods
    # ------------------------------------------------------------------

    def win_probability(
        self,
        entity_a_id: str,
        entity_b_id: str,
        context: MatchContext,
    ) -> float:
        """
        Return entity A's win probability given current ratings and context.
        Convenience wrapper around expected_score().
        """
        r_a = self.get_rating(entity_a_id)
        r_b = self.get_rating(entity_b_id)
        return self.expected_score(r_a, r_b, context)

    def rating_diff(self, entity_a_id: str, entity_b_id: str) -> float:
        """Return raw rating differential A - B."""
        return self.get_rating(entity_a_id) - self.get_rating(entity_b_id)

    def set_rating(self, entity_id: str, rating: float) -> None:
        """Manually set a rating (used when loading from DB on startup)."""
        self._ratings[entity_id] = self._clamp(rating)

    def get_home_advantage(self, entity_id: str) -> float:
        """Return the learned home advantage for entity, or global default."""
        return self._home_advantages.get(entity_id, self.config.home_advantage)

    def set_home_advantage(self, entity_id: str, home_adv: float) -> None:
        """Manually set learned home advantage (for loading from DB on incremental run)."""
        self._home_advantages[entity_id] = max(0.0, min(200.0, home_adv))

    def bulk_load(self, ratings: dict[str, float]) -> None:
        """Load ratings from a dict (e.g. from DB snapshot). Used at startup."""
        for entity_id, rating in ratings.items():
            self.set_rating(entity_id, rating)

    def leaderboard(self, top_n: int = 20) -> list[tuple[str, float]]:
        """Return top N entities sorted by rating descending."""
        return sorted(self._ratings.items(), key=lambda x: x[1], reverse=True)[:top_n]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _k_factor(self, entity_id: str) -> float:
        """
        Dynamic K-factor.
        Starts at k_base, decays as entity accumulates matches.
        k = k_base / (1 + rate * n)^power, floored at k_min.
        """
        if not self.config.k_decay_enabled:
            return self.config.k_base

        n = self._match_counts.get(entity_id, 0)
        denominator = (1.0 + self.config.k_decay_rate * n) ** self.config.k_decay_power
        k = self.config.k_base / denominator
        return max(k, self.config.k_min)

    def _mov_multiplier(self, score_a: float, score_b: float) -> float:
        """
        Margin of Victory multiplier using log-dampening.
        multiplier = log(1 + |margin|) * weight, capped at mov_cap.

        Log-dampening ensures a 5-0 win isn't 5x more valuable than 1-0.
        """
        margin = abs(score_a - score_b)
        if margin == 0:
            return 1.0
        mult = math.log1p(margin) * self.config.mov_weight
        return min(mult + 1.0, self.config.mov_cap)

    def _outcome_to_score(self, score_a: float, score_b: float) -> float:
        """Convert raw scores to ELO outcome: 1=win, 0.5=draw, 0=loss."""
        if score_a > score_b:
            return 1.0
        elif score_a < score_b:
            return 0.0
        return 0.5

    def _clamp(self, rating: float) -> float:
        return max(self.config.rating_floor, min(self.config.rating_ceiling, rating))
