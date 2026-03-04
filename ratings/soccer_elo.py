"""
Soccer-specific ELO engine.

Extends the generic EloEngine with soccer-appropriate defaults and
a draw probability model (Dixon-Coles inspired).

Key soccer specifics:
    - Draws are a real outcome (~25% of matches). We model them explicitly.
    - Home advantage is significant (~65 ELO points ≈ 55% win rate).
    - K-factor scales with competition importance (UCL > domestic cup > league).
    - Player adjustment uses lineup ELO average differential.
"""

from __future__ import annotations

import math

from core.types import MatchContext
from ratings.elo_engine import EloConfig, EloEngine


# Default soccer ELO config
SOCCER_ELO_CONFIG = EloConfig(
    base_rating=1500.0,
    scale=400.0,
    k_base=32.0,
    k_decay_enabled=True,
    k_decay_rate=0.005,   # slower decay — soccer teams play consistently
    k_decay_power=0.5,
    k_min=10.0,
    home_advantage=65.0,  # well-established in literature
    surface_modifier_weight=0.5,  # pitch type matters less than surface in tennis
    mov_enabled=True,
    mov_weight=0.4,
    mov_cap=2.5,
    player_adjustment_weight=1.0,
    time_decay_enabled=True,
    time_decay_rate=0.97,  # slower decay — squads have continuity
    time_decay_min_days=120,
    rating_floor=800.0,
    rating_ceiling=2200.0,
)

# Competition importance multipliers (applied to K-factor)
COMPETITION_IMPORTANCE = {
    "champions_league": 1.5,
    "europa_league": 1.2,
    "conference_league": 1.1,
    "world_cup": 1.6,
    "euros": 1.4,
    "copa_america": 1.4,
    "premier_league": 1.2,
    "la_liga": 1.2,
    "bundesliga": 1.2,
    "serie_a": 1.2,
    "ligue_1": 1.1,
    "domestic_cup": 0.9,
    "friendly": 0.4,
}


class SoccerEloEngine(EloEngine):
    """
    Soccer ELO engine with draw probability modelling.

    Usage:
        engine = SoccerEloEngine()
        home_win_prob, draw_prob, away_win_prob = engine.three_way_probability(
            "man_city", "arsenal", context
        )
    """

    def __init__(self, config: EloConfig | None = None) -> None:
        super().__init__(config or SOCCER_ELO_CONFIG)

    def three_way_probability(
        self,
        home_team_id: str,
        away_team_id: str,
        context: MatchContext,
    ) -> tuple[float, float, float]:
        """
        Return (p_home_win, p_draw, p_away_win) for a soccer match.

        Draw model: Dixon-Coles correction using the ELO rating differential.
        The closer the match-up, the higher the draw probability.

        Formula (approximation):
            p_draw = D_max * exp(-|rating_diff| / D_scale)
            where D_max ≈ 0.28 (empirical max draw rate in top leagues)
            and D_scale ≈ 200 (spread parameter)

        Remaining probability is split between home and away
        proportional to their two-way expected scores.
        """
        r_home = self.get_rating(home_team_id)
        r_away = self.get_rating(away_team_id)

        two_way_home = self.expected_score(r_home, r_away, context)
        two_way_away = 1.0 - two_way_home

        # Draw probability (peaks at even match-up, falls off with rating gap)
        rating_diff = abs(r_home + self.config.home_advantage - r_away)
        p_draw = 0.28 * math.exp(-rating_diff / 220.0)
        p_draw = max(0.05, min(p_draw, 0.35))  # empirical bounds

        # Allocate remaining probability
        remaining = 1.0 - p_draw
        p_home = two_way_home * remaining
        p_away = two_way_away * remaining

        return p_home, p_draw, p_away

    def competition_k_multiplier(self, competition_slug: str) -> float:
        """Return the K-factor multiplier for a given competition."""
        return COMPETITION_IMPORTANCE.get(competition_slug.lower(), 1.0)

    def lineup_adjustment(
        self,
        home_lineup_elo: float | None,
        away_lineup_elo: float | None,
        home_team_elo: float,
        away_team_elo: float,
    ) -> float:
        """
        Compute the player adjustment delta for home team.

        If the home team fields a lineup with average ELO of 1650
        but their team ELO is 1700, they're understrength → penalty.

        adjustment = (lineup_elo - team_elo) * weight
        Positive = stronger than normal lineup → home bonus
        Negative = weaker lineup → home penalty
        """
        if home_lineup_elo is None and away_lineup_elo is None:
            return 0.0

        adj = 0.0
        if home_lineup_elo is not None:
            adj += (home_lineup_elo - home_team_elo) * self.config.player_adjustment_weight
        if away_lineup_elo is not None:
            adj -= (away_lineup_elo - away_team_elo) * self.config.player_adjustment_weight

        return adj
