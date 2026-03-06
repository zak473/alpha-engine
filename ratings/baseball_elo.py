"""
Baseball-specific ELO engine.

Extends the generic EloEngine with baseball-appropriate defaults.

Key baseball specifics:
    - Starting pitcher quality is the single biggest game-level predictor.
      We model this as a pitcher adjustment on effective ELO.
    - Park factor: some parks strongly favour hitters/pitchers.
    - MoV is a weaker signal than basketball (runs don't scale linearly with quality).
    - 162-game season → ratings stabilise quickly, low K.
    - Home field advantage is real but modest (~54% for home team historically).
    - No draws.
"""

from __future__ import annotations

from core.types import MatchContext
from ratings.elo_engine import EloConfig, EloEngine


BASEBALL_ELO_CONFIG = EloConfig(
    base_rating=1500.0,
    scale=400.0,
    k_base=16.0,            # very low — 162-game season, variance is high
    k_decay_enabled=True,
    k_decay_rate=0.006,
    k_decay_power=0.5,
    k_min=6.0,
    home_advantage=24.0,    # ~24 ELO pts ≈ 54% home win rate (baseball is lower than basketball)
    surface_modifier_weight=1.0,   # repurposed for park factor
    mov_enabled=True,
    mov_weight=0.3,         # weak MoV signal — a 10-run blowout isn't that informative
    mov_cap=2.0,
    player_adjustment_weight=0.9,  # pitcher adjustment injected here
    time_decay_enabled=True,
    time_decay_rate=0.97,
    time_decay_min_days=120,
    rating_floor=900.0,
    rating_ceiling=2100.0,
)

# Competition importance multipliers
COMPETITION_IMPORTANCE = {
    "mlb_world_series": 1.5,
    "mlb_lcs": 1.3,
    "mlb_lds": 1.2,
    "mlb_wildcard": 1.1,
    "mlb": 1.0,
    "mlb_preseason": 0.3,
    "ncaa_baseball": 0.8,
    "college_world_series": 1.1,
    "friendly": 0.2,
}

# Park factor constants — positive = hitter-friendly, negative = pitcher-friendly
# Applied as surface_delta_a (home team benefits from their park)
PARK_FACTORS: dict[str, float] = {
    "coors_field": 30.0,        # highest elevation, extreme hitter park
    "great_american_ball_park": 15.0,
    "yankee_stadium": 10.0,
    "fenway_park": 5.0,
    "oracle_park": -10.0,       # pitcher-friendly, sea air
    "petco_park": -15.0,
    "dodger_stadium": -5.0,
}


class BaseballEloEngine(EloEngine):
    """
    Baseball ELO engine with pitcher adjustment and park factor.

    Usage:
        engine = BaseballEloEngine()
        p_home = engine.win_probability("yankees", "redsox", context)

    The context.extra dict can carry:
        - "pitcher_adj": float  — adjustment for starting pitcher quality differential
                                   positive = home pitcher is better than expected
        - "park_name": str      — venue name to look up park factor
        - "importance": float   — K multiplier for playoffs
    """

    def __init__(self, config: EloConfig | None = None) -> None:
        super().__init__(config or BASEBALL_ELO_CONFIG)

    def win_probability(
        self,
        home_team_id: str,
        away_team_id: str,
        context: MatchContext,
    ) -> tuple[float, float]:
        """
        Return (p_home_win, p_away_win) for a baseball game.
        Incorporates pitcher adjustment and park factor.
        """
        r_home = self.get_rating(home_team_id)
        r_away = self.get_rating(away_team_id)

        # Build effective context with pitcher + park modifiers
        pitcher_adj = context.extra.get("pitcher_adj", 0.0)
        park_name = context.extra.get("park_name", "")
        park_delta = PARK_FACTORS.get(park_name.lower().replace(" ", "_"), 0.0)

        ctx_adjusted = MatchContext(
            date=context.date,
            home_entity_id=context.home_entity_id,
            extra={
                **context.extra,
                # pitcher_adj goes through player_adjustment (home pitcher quality)
                "player_adjustment": pitcher_adj,
                # park_delta goes through surface_delta_a (home team benefits)
                "surface_delta_a": park_delta,
            },
        )

        p_home = self.expected_score(r_home, r_away, ctx_adjusted)
        p_away = 1.0 - p_home
        return p_home, p_away

    def competition_k_multiplier(self, competition_slug: str) -> float:
        return COMPETITION_IMPORTANCE.get(competition_slug.lower(), 1.0)

    def park_factor(self, venue_name: str) -> float:
        """Return the ELO adjustment for a given park. 0.0 if unknown."""
        return PARK_FACTORS.get(venue_name.lower().replace(" ", "_"), 0.0)
