"""
Hockey-specific ELO engine.

Key hockey specifics:
    - 82-game NHL season → moderate K factor.
    - No draws in ELO sense — OT/SO losses are treated as losses.
    - Home advantage is real (~55% home win rate historically).
    - Goals are a weak MoV signal compared to basketball points.
"""

from __future__ import annotations

from core.types import MatchContext
from ratings.elo_engine import EloConfig, EloEngine


HOCKEY_ELO_CONFIG = EloConfig(
    base_rating=1500.0,
    scale=400.0,
    k_base=20.0,
    k_decay_enabled=True,
    k_decay_rate=0.005,
    k_decay_power=0.5,
    k_min=8.0,
    home_advantage=30.0,    # ~30 ELO pts ≈ 55% home win rate
    mov_enabled=True,
    mov_weight=0.25,        # goals are a weak signal
    mov_cap=2.0,
    time_decay_enabled=True,
    time_decay_rate=0.97,
    time_decay_min_days=120,
    rating_floor=900.0,
    rating_ceiling=2100.0,
)

COMPETITION_IMPORTANCE = {
    "nhl_playoffs":    1.5,
    "nhl_finals":      1.8,
    "nhl":             1.0,
    "nhl_preseason":   0.3,
    "shl":             0.9,
    "liiga":           0.9,
    "khl":             0.85,
    "ahl":             0.7,
    "friendly":        0.2,
}


class HockeyEloEngine(EloEngine):
    def __init__(self, config: EloConfig | None = None) -> None:
        super().__init__(config or HOCKEY_ELO_CONFIG)

    def competition_k_multiplier(self, competition_slug: str) -> float:
        return COMPETITION_IMPORTANCE.get(competition_slug.lower(), 1.0)
