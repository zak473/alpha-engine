"""
Tennis-specific ELO engine.

Key tennis specifics:
    - Surface matters enormously. Players have surface-specific deltas.
    - No home advantage (neutral venue by default, indoor/outdoor matters less).
    - Tournament importance tiers: Grand Slam > Masters > ATP 500 > 250 > Challenger.
    - Best-of-5 matches are weighted more (deeper signal).
    - Retirements are down-weighted (incomplete signal).
    - Inactivity decay is faster than soccer (player form is volatile).
"""

from __future__ import annotations

from core.types import MatchContext, Surface
from ratings.elo_engine import EloConfig, EloEngine


TENNIS_ELO_CONFIG = EloConfig(
    base_rating=1500.0,
    scale=250.0,           # Tighter scale — tennis outcomes are more decisive
    k_base=32.0,
    k_decay_enabled=True,
    k_decay_rate=0.02,    # Faster K decay — players have more stable careers
    k_decay_power=0.4,
    k_min=8.0,
    home_advantage=0.0,    # No home advantage in tennis
    surface_modifier_weight=1.0,
    mov_enabled=False,     # Sets won used for update but MoV not standard in tennis ELO
    player_adjustment_weight=0.0,  # Not applicable for tennis
    time_decay_enabled=True,
    time_decay_rate=0.92,  # Faster decay — player form is more volatile
    time_decay_min_days=60,
    rating_floor=900.0,
    rating_ceiling=2300.0,
)

# Tournament tier K-factor multipliers (also used for league name keyword matching)
# Keys with spaces are matched as substrings against CoreLeague.name (case-insensitive).
# Longer / more specific entries beat shorter ones (sorted by length in the resolver).
TOURNAMENT_IMPORTANCE = {
    # Grand Slams
    "australian open": 1.5,
    "roland garros": 1.5,
    "wimbledon": 1.5,
    "us open": 1.5,
    "grand slam": 1.5,
    # Masters 1000
    "indian wells": 1.2,
    "miami open": 1.2,
    "monte-carlo": 1.2,
    "madrid open": 1.2,
    "italian open": 1.2,
    "canadian open": 1.2,
    "cincinnati": 1.2,
    "shanghai": 1.2,
    "paris masters": 1.2,
    "masters 1000": 1.2,
    "atp masters": 1.2,
    # ATP Finals
    "atp finals": 1.4,
    "nitto atp": 1.4,
    # ATP 500
    "atp 500": 1.0,
    "500": 1.0,
    # ATP 250 / generic
    "atp 250": 0.8,
    "250": 0.8,
    # Lower tiers
    "challenger": 0.5,
    "itf": 0.3,
    "exhibition": 0.1,
    # Tier slug aliases used by update_ratings_on_surface via context.extra["tournament_level"]
    "grand_slam": 1.5,
    "masters_1000": 1.2,
    "atp_500": 1.0,
    "atp_250": 0.8,
}

# Round multipliers (later rounds carry more weight)
ROUND_IMPORTANCE = {
    "final": 1.3,
    "semi_final": 1.1,
    "quarter_final": 1.0,
    "round_of_16": 0.9,
    "round_of_32": 0.85,
    "round_of_64": 0.8,
    "round_of_128": 0.75,
}

# Surface-specific ELO delta storage
# Players maintain a global ELO + per-surface delta
# effective_rating(surface) = global_rating + surface_delta[surface]
SURFACES = [s.value for s in Surface]


class TennisEloEngine(EloEngine):
    """
    Tennis ELO engine with surface-specific rating system.

    Each player has:
        - A global ELO (cross-surface skill estimate)
        - A surface delta per surface (clay/hard/grass/carpet/indoor_hard)

    When computing expected scores on a specific surface:
        effective_rating = global_rating + surface_delta[surface]

    Surface deltas are updated independently after each match on that surface.
    """

    def __init__(self, config: EloConfig | None = None) -> None:
        super().__init__(config or TENNIS_ELO_CONFIG)
        # surface_ratings[player_id][surface] = delta from global
        self._surface_deltas: dict[str, dict[str, float]] = {}

    def get_surface_rating(self, player_id: str, surface: str) -> float:
        """Return the effective rating for a player on a specific surface."""
        global_r = self.get_rating(player_id)
        delta = self._surface_deltas.get(player_id, {}).get(surface, 0.0)
        return global_r + delta

    def get_surface_delta(self, player_id: str, surface: str) -> float:
        return self._surface_deltas.get(player_id, {}).get(surface, 0.0)

    def expected_score_on_surface(
        self,
        player_a_id: str,
        player_b_id: str,
        surface: str,
        context: MatchContext,
    ) -> float:
        """
        Expected score using surface-adjusted ratings.
        context.extra["surface"] should match the surface param.
        """
        r_a = self.get_surface_rating(player_a_id, surface)
        r_b = self.get_surface_rating(player_b_id, surface)
        exponent = (r_b - r_a) / self.config.scale
        return 1.0 / (1.0 + 10.0 ** exponent)

    def update_ratings_on_surface(
        self,
        player_a_id: str,
        player_b_id: str,
        score_a: float,
        score_b: float,
        surface: str,
        context: MatchContext,
        is_retirement: bool = False,
        best_of: int = 3,
    ) -> tuple:
        """
        Update both global rating and surface delta after a match.

        Global rating: uses surface-adjusted effective ratings.
        Surface delta: updated with a separate (smaller) K-factor.

        Retirements: K reduced to 20% — incomplete signal.
        Best-of-5: K multiplied by 1.2 — deeper sample.
        """
        # Importance
        tournament_level = context.extra.get("tournament_level", "atp_250")
        round_name = context.extra.get("round", "round_of_32")
        importance = (
            TOURNAMENT_IMPORTANCE.get(tournament_level, 1.0)
            * ROUND_IMPORTANCE.get(round_name, 0.9)
        )
        if is_retirement:
            importance *= 0.2
        if best_of == 5:
            importance *= 1.2

        # Inject surface deltas into context for expected_score
        context.extra["surface_delta_a"] = self.get_surface_delta(player_a_id, surface)
        context.extra["surface_delta_b"] = self.get_surface_delta(player_b_id, surface)
        context.extra["importance"] = importance

        # Global update
        update_a, update_b = self.update_ratings(
            player_a_id, player_b_id, score_a, score_b, context
        )

        # Surface delta update (separate smaller K)
        surface_k = self._k_factor(player_a_id) * importance * 0.5
        actual_a = self._outcome_to_score(score_a, score_b)

        r_a_surf = self.get_surface_rating(player_a_id, surface)
        r_b_surf = self.get_surface_rating(player_b_id, surface)
        surf_exp_a = 1.0 / (1.0 + 10.0 ** ((r_b_surf - r_a_surf) / self.config.scale))

        delta_a_surf = surface_k * (actual_a - surf_exp_a)
        delta_b_surf = surface_k * ((1 - actual_a) - (1 - surf_exp_a))

        self._surface_deltas.setdefault(player_a_id, {})
        self._surface_deltas.setdefault(player_b_id, {})
        self._surface_deltas[player_a_id][surface] = (
            self._surface_deltas[player_a_id].get(surface, 0.0) + delta_a_surf
        )
        self._surface_deltas[player_b_id][surface] = (
            self._surface_deltas[player_b_id].get(surface, 0.0) + delta_b_surf
        )

        return update_a, update_b

    def surface_specialisation(self, player_id: str) -> dict[str, float]:
        """
        Return the player's surface delta profile.
        Used as a feature in the prediction model.
        """
        return self._surface_deltas.get(player_id, {})

    def reset(self) -> None:
        super().reset()
        self._surface_deltas.clear()

    def _outcome_to_score(self, score_a: float, score_b: float) -> float:
        if score_a > score_b:
            return 1.0
        elif score_a < score_b:
            return 0.0
        return 0.5
