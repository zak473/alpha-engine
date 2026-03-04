"""
Esports-specific ELO engine.

Key esports specifics:
    - Map-specific ELO: teams have different strengths on different maps.
    - Side bias: CT-side advantage varies by map — modelled as a modifier.
    - Patch impact: major patches reset ELO confidence (increase uncertainty).
    - Roster instability: recent roster changes inflate K-factor.
    - LAN vs online: separate performance contexts.
    - Series format: bo1 / bo3 / bo5 maps determine how many ratings updates occur.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from core.types import MatchContext
from ratings.elo_engine import EloConfig, EloEngine


ESPORTS_ELO_CONFIG = EloConfig(
    base_rating=1500.0,
    scale=400.0,
    k_base=40.0,           # Higher K — esports results are more volatile
    k_decay_enabled=True,
    k_decay_rate=0.01,
    k_decay_power=0.5,
    k_min=12.0,
    home_advantage=0.0,    # LAN vs online handled separately
    surface_modifier_weight=1.0,  # reused for map-specific deltas
    mov_enabled=True,
    mov_weight=0.3,
    mov_cap=2.0,
    player_adjustment_weight=1.0,  # individual player rating aggregates
    time_decay_enabled=True,
    time_decay_rate=0.85,  # Fast decay — meta shifts and roster changes
    time_decay_min_days=45,
    rating_floor=800.0,
    rating_ceiling=2200.0,
)

# Tournament tier multipliers
TOURNAMENT_IMPORTANCE = {
    "major": 1.5,        # CS2 Majors
    "s_tier": 1.3,       # ESL Pro League, IEM Katowice
    "a_tier": 1.0,       # EPL group stage, etc.
    "b_tier": 0.7,
    "c_tier": 0.4,
    "online_qual": 0.3,
}

# LAN bonus — teams tend to perform differently on LAN
LAN_BONUS = 25.0   # rating points added for known LAN-performers

# Roster instability uncertainty boost
# When a team has had recent major roster changes, K is increased
# (results are less predictive of long-term strength)
ROSTER_INSTABILITY_K_BOOST = 1.4   # 40% K increase for unstable rosters


class EsportsEloEngine(EloEngine):
    """
    Esports ELO engine with map-specific ratings and roster instability modelling.

    Each team maintains:
        - A global (series-level) ELO
        - A map delta per map in the active pool

    Usage:
        engine = EsportsEloEngine()
        engine.update_ratings_on_map("team_a", "team_b", 16, 10, "mirage", context)
        p_a = engine.expected_score_on_map("team_a", "team_b", "inferno", context)
    """

    def __init__(self, config: EloConfig | None = None) -> None:
        super().__init__(config or ESPORTS_ELO_CONFIG)
        self._map_deltas: dict[str, dict[str, float]] = {}  # team_id → {map_name → delta}
        self._roster_change_dates: dict[str, list[datetime]] = {}  # team_id → [change_dates]

    def get_map_rating(self, team_id: str, map_name: str) -> float:
        """Effective rating on a specific map."""
        global_r = self.get_rating(team_id)
        delta = self._map_deltas.get(team_id, {}).get(map_name, 0.0)
        return global_r + delta

    def get_map_delta(self, team_id: str, map_name: str) -> float:
        return self._map_deltas.get(team_id, {}).get(map_name, 0.0)

    def expected_score_on_map(
        self,
        team_a_id: str,
        team_b_id: str,
        map_name: str,
        context: MatchContext,
    ) -> float:
        """
        Expected map win probability using map-specific effective ratings.
        Includes side bias and LAN modifier from context.
        """
        r_a = self.get_map_rating(team_a_id, map_name)
        r_b = self.get_map_rating(team_b_id, map_name)

        # Side bias: CT-side advantage on this map
        # context.extra["ct_bias"] = ELO points advantage for CT-starting team
        ct_bias = context.extra.get("ct_bias", 0.0)
        ct_team = context.extra.get("ct_team")  # "a" or "b"
        if ct_team == "a":
            r_a += ct_bias
        elif ct_team == "b":
            r_b += ct_bias

        # LAN modifier
        if context.extra.get("is_lan", False):
            lan_adv_a = context.extra.get("lan_delta_a", 0.0)
            lan_adv_b = context.extra.get("lan_delta_b", 0.0)
            r_a += lan_adv_a
            r_b += lan_adv_b

        # Player aggregate adjustment
        player_adj = context.extra.get("player_adjustment", 0.0)
        r_a += player_adj

        exponent = (r_b - r_a) / self.config.scale
        return 1.0 / (1.0 + 10.0 ** exponent)

    def update_ratings_on_map(
        self,
        team_a_id: str,
        team_b_id: str,
        rounds_a: int,
        rounds_b: int,
        map_name: str,
        context: MatchContext,
        is_major_patch: bool = False,
    ) -> tuple:
        """
        Update global and map-specific ELO after a single map result.

        Roster instability increases K-factor for uncertain teams.
        Major patches apply an additional K boost to both teams.
        """
        # Inject map deltas into context
        context.extra["surface_delta_a"] = self.get_map_delta(team_a_id, map_name)
        context.extra["surface_delta_b"] = self.get_map_delta(team_b_id, map_name)

        # Tournament importance
        tier = context.extra.get("tournament_tier", "a_tier")
        importance = TOURNAMENT_IMPORTANCE.get(tier, 1.0)

        # Patch instability
        if is_major_patch:
            importance *= 1.3

        context.extra["importance"] = importance

        # Apply roster instability K boost before parent update
        self._apply_roster_uncertainty(team_a_id, context.date)
        self._apply_roster_uncertainty(team_b_id, context.date)

        # Global update
        update_a, update_b = self.update_ratings(
            team_a_id, team_b_id, rounds_a, rounds_b, context
        )

        # Map-specific delta update (smaller K)
        map_k = self._k_factor(team_a_id) * importance * 0.6
        actual_a = self._outcome_to_score(rounds_a, rounds_b)

        r_a_map = self.get_map_rating(team_a_id, map_name)
        r_b_map = self.get_map_rating(team_b_id, map_name)
        exp_a_map = 1.0 / (1.0 + 10.0 ** ((r_b_map - r_a_map) / self.config.scale))

        delta_a_map = map_k * (actual_a - exp_a_map)
        delta_b_map = map_k * ((1 - actual_a) - (1 - exp_a_map))

        self._map_deltas.setdefault(team_a_id, {})
        self._map_deltas.setdefault(team_b_id, {})
        self._map_deltas[team_a_id][map_name] = (
            self._map_deltas[team_a_id].get(map_name, 0.0) + delta_a_map
        )
        self._map_deltas[team_b_id][map_name] = (
            self._map_deltas[team_b_id].get(map_name, 0.0) + delta_b_map
        )

        return update_a, update_b

    def register_roster_change(self, team_id: str, change_date: datetime, is_major: bool = False) -> None:
        """
        Record a roster change event for a team.
        Major changes (star player in/out) are stored with higher weight.
        """
        self._roster_change_dates.setdefault(team_id, [])
        # Major changes stored twice to amplify their K-boost effect
        self._roster_change_dates[team_id].append(change_date)
        if is_major:
            self._roster_change_dates[team_id].append(change_date)

    def roster_stability_score(self, team_id: str, as_of_date: datetime, window_days: int = 90) -> float:
        """
        Return a stability score [0, 1] where 1 = fully stable.
        Penalises teams with recent roster changes within the window.
        """
        changes = self._roster_change_dates.get(team_id, [])
        cutoff = as_of_date - timedelta(days=window_days)
        recent = [c for c in changes if c >= cutoff]
        # Each recent change reduces stability by 0.2, floored at 0.1
        score = max(0.1, 1.0 - len(recent) * 0.2)
        return score

    def map_pool_profile(self, team_id: str) -> dict[str, float]:
        """Return the full map delta profile for a team."""
        return dict(self._map_deltas.get(team_id, {}))

    def reset(self) -> None:
        super().reset()
        self._map_deltas.clear()
        self._roster_change_dates.clear()

    def _apply_roster_uncertainty(self, team_id: str, as_of_date: datetime) -> None:
        """
        Temporarily boost K for teams with recent roster instability.
        This is handled by storing a boost flag that _k_factor checks.
        (Simplified: mark teams with instability, parent _k_factor is overridden below.)
        """
        stability = self.roster_stability_score(team_id, as_of_date)
        # Store as extra state — checked in overridden _k_factor
        self._roster_stability_cache = getattr(self, "_roster_stability_cache", {})
        self._roster_stability_cache[team_id] = stability

    def _k_factor(self, entity_id: str) -> float:
        """Override to apply roster instability boost."""
        k = super()._k_factor(entity_id)
        cache = getattr(self, "_roster_stability_cache", {})
        stability = cache.get(entity_id, 1.0)
        # Unstable roster (stability < 0.7) gets K boost
        if stability < 0.7:
            boost = 1.0 + (1.0 - stability) * (ROSTER_INSTABILITY_K_BOOST - 1.0)
            k *= boost
        return k

    def _outcome_to_score(self, score_a: float, score_b: float) -> float:
        if score_a > score_b:
            return 1.0
        elif score_a < score_b:
            return 0.0
        return 0.5
