"""
Basketball-specific ELO engine.

Extends the generic EloEngine with basketball-appropriate defaults.

Key basketball specifics:
    - Margin of Victory is a strong predictor — NBA average margin ~10 pts.
      We use a stronger MoV weight than soccer.
    - Home court advantage is significant but smaller than soccer (~3–4 pts = ~60% win rate).
    - Rest matters a lot: back-to-back games (0 days rest) meaningfully degrade performance.
    - No draws — two-way probability only (home_win / away_win).
    - K-factor stabilises quickly: teams play 82+ games/year.
"""

from __future__ import annotations

from core.types import MatchContext
from ratings.elo_engine import EloConfig, EloEngine


BASKETBALL_ELO_CONFIG = EloConfig(
    base_rating=1500.0,
    scale=400.0,
    k_base=20.0,            # lower base K — 82-game season means ratings stabilise quickly
    k_decay_enabled=True,
    k_decay_rate=0.008,     # faster decay than soccer (more games → faster stabilisation)
    k_decay_power=0.5,
    k_min=8.0,
    home_advantage=35.0,    # ~35 ELO pts ≈ 60% win rate — well-established for NBA
    surface_modifier_weight=0.0,   # court surface doesn't vary meaningfully
    mov_enabled=True,
    mov_weight=0.65,        # strong MoV signal — NBA margins are predictive
    mov_cap=2.8,
    player_adjustment_weight=0.8,  # star player absence matters
    time_decay_enabled=True,
    time_decay_rate=0.96,   # slightly faster decay — rosters change more between seasons
    time_decay_min_days=90,
    rating_floor=900.0,
    rating_ceiling=2200.0,
)

# Competition importance multipliers
COMPETITION_IMPORTANCE = {
    "nba_finals": 1.5,
    "nba_conference_finals": 1.3,
    "nba_conference_semifinals": 1.2,
    "nba_first_round": 1.1,
    "nba": 1.0,
    "nba_preseason": 0.4,
    "euroleague": 1.1,
    "eurocup": 1.0,
    "ncaab": 0.9,
    "nbl": 0.9,
    "friendly": 0.3,
}


class BasketballEloEngine(EloEngine):
    """
    Basketball ELO engine with strong MOV weighting and rest modifier.

    Usage:
        engine = BasketballEloEngine()
        p_home = engine.win_probability("lakers", "celtics", context)
    """

    def __init__(self, config: EloConfig | None = None) -> None:
        super().__init__(config or BASKETBALL_ELO_CONFIG)

    def win_probability(
        self,
        home_team_id: str,
        away_team_id: str,
        context: MatchContext,
    ) -> tuple[float, float]:
        """
        Return (p_home_win, p_away_win) for a basketball match.
        Basketball has no draws, so probabilities sum to 1.

        The context.extra dict can carry:
            - "home_days_rest": int (0 = back-to-back)
            - "away_days_rest": int
            - "importance": float (K multiplier)
        """
        r_home = self.get_rating(home_team_id)
        r_away = self.get_rating(away_team_id)

        # Apply rest penalty via surface_delta (reuses existing mechanism)
        rest_adj = self._rest_adjustment(context)
        ctx_with_rest = MatchContext(
            date=context.date,
            home_entity_id=context.home_entity_id,
            extra={**context.extra, "surface_delta_a": rest_adj},
        )

        p_home = self.expected_score(r_home, r_away, ctx_with_rest)
        p_away = 1.0 - p_home
        return p_home, p_away

    def competition_k_multiplier(self, competition_slug: str) -> float:
        return COMPETITION_IMPORTANCE.get(competition_slug.lower(), 1.0)

    def _rest_adjustment(self, context: MatchContext) -> float:
        """
        Compute ELO adjustment based on rest differential.
        Back-to-back (0 days rest) imposes a ~15-point ELO penalty.
        2+ days rest = neutral. 3+ days = slight positive.
        """
        home_rest = context.extra.get("home_days_rest", 2)
        away_rest = context.extra.get("away_days_rest", 2)

        def _rest_delta(days: int) -> float:
            if days == 0:
                return -15.0   # back-to-back penalty
            elif days == 1:
                return -7.0
            elif days >= 3:
                return 5.0     # well-rested bonus
            return 0.0         # neutral (2 days)

        return _rest_delta(home_rest) - _rest_delta(away_rest)
