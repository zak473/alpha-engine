"""
Basketball-specific ELO engine.

Key basketball specifics:
    - ~82 NBA games per season — same moderate K as hockey.
    - No draws — overtime losses still count as losses.
    - High scoring (100-130 pts) — point differential is meaningful signal.
    - Home advantage historically ~60% win rate in NBA.
    - MOV matters but diminishing returns beyond ~20 pts.
"""

from __future__ import annotations

from core.types import MatchContext
from ratings.elo_engine import EloConfig, EloEngine


BASKETBALL_ELO_CONFIG = EloConfig(
    base_rating=1500.0,
    scale=400.0,
    k_base=20.0,
    k_decay_enabled=True,
    k_decay_rate=0.005,
    k_decay_power=0.5,
    k_min=8.0,
    home_advantage=50.0,    # ~50 ELO pts ≈ 60% home win rate
    mov_enabled=True,
    mov_weight=0.35,        # points are a meaningful signal in basketball
    mov_cap=3.0,            # cap at ~25+ point margin
    time_decay_enabled=True,
    time_decay_rate=0.97,
    time_decay_min_days=120,
    rating_floor=900.0,
    rating_ceiling=2200.0,
)

COMPETITION_IMPORTANCE = {
    "nba finals":    1.8,
    "nba playoffs":  1.5,
    "nba preseason": 0.3,
    "nba":           1.0,
    "euroleague":    0.95,
    "eurocup":       0.9,
    "ncaa":          0.75,
    "nbl":           0.85,
    "friendly":      0.2,
}


class BasketballEloEngine(EloEngine):
    def __init__(self, config: EloConfig | None = None) -> None:
        super().__init__(config or BASKETBALL_ELO_CONFIG)

    def competition_k_multiplier(self, competition_slug: str) -> float:
        return COMPETITION_IMPORTANCE.get(competition_slug.lower(), 1.0)
