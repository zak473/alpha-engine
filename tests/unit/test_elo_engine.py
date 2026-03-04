"""
Unit tests for the generic ELO engine and sport-specific subclasses.
"""

import pytest
from datetime import datetime, timezone

from core.types import MatchContext, Sport
from ratings.elo_engine import EloConfig, EloEngine
from ratings.soccer_elo import SoccerEloEngine
from ratings.tennis_elo import TennisEloEngine
from ratings.esports_elo import EsportsEloEngine


def _ctx(home_id="a", date=None, **extra) -> MatchContext:
    return MatchContext(
        match_id="test_match",
        sport=Sport.SOCCER,
        date=date or datetime(2024, 1, 15, tzinfo=timezone.utc),
        home_entity_id=home_id,
        away_entity_id="b",
        extra=extra,
    )


class TestEloEngine:
    def test_new_entity_gets_base_rating(self):
        engine = EloEngine(EloConfig(base_rating=1500))
        assert engine.get_rating("new_team") == 1500

    def test_winner_gains_rating(self):
        engine = EloEngine(EloConfig(home_advantage=0, mov_enabled=False))
        ctx = _ctx()
        update_a, update_b = engine.update_ratings("a", "b", 2, 0, ctx)
        assert update_a.rating_after > update_a.rating_before
        assert update_b.rating_after < update_b.rating_before

    def test_rating_sum_conserved_no_mov(self):
        """Total rating points should be approximately conserved (no MoV)."""
        engine = EloEngine(EloConfig(home_advantage=0, mov_enabled=False))
        before = engine.get_rating("a") + engine.get_rating("b")
        engine.update_ratings("a", "b", 1, 0, _ctx())
        after = engine.get_rating("a") + engine.get_rating("b")
        assert abs(after - before) < 1e-6

    def test_draw_moves_ratings_toward_expected(self):
        """A draw gives equal ratings update when both teams are equal."""
        engine = EloEngine(EloConfig(home_advantage=0, mov_enabled=False))
        engine.set_rating("a", 1600)
        engine.set_rating("b", 1600)
        update_a, update_b = engine.update_ratings("a", "b", 1, 1, _ctx())
        # Equal ratings + draw → expected score = 0.5, actual = 0.5 → no change
        assert abs(update_a.rating_after - 1600) < 1e-6

    def test_k_factor_decreases_with_experience(self):
        engine = EloEngine(EloConfig(k_base=32, k_decay_enabled=True, k_decay_rate=0.01))
        ctx = _ctx()
        for i in range(50):
            engine.update_ratings("a", f"opp_{i}", 1, 0, ctx)
        # After 50 matches, k for "a" should be less than k_base
        k_after = engine._k_factor("a")
        assert k_after < 32

    def test_time_decay_blends_toward_base(self):
        engine = EloEngine(EloConfig(
            base_rating=1500,
            time_decay_enabled=True,
            time_decay_rate=0.9,
            time_decay_min_days=90,
        ))
        engine.set_rating("a", 1800)
        engine._last_active["a"] = datetime(2022, 1, 1, tzinfo=timezone.utc)
        engine.decay_ratings(datetime(2024, 1, 1, tzinfo=timezone.utc))
        assert engine.get_rating("a") < 1800
        assert engine.get_rating("a") > 1500  # doesn't fully revert

    def test_rating_clamped_at_floor_ceiling(self):
        engine = EloEngine(EloConfig(rating_floor=1000, rating_ceiling=2000))
        engine.set_rating("a", 999)
        assert engine.get_rating("a") == 1000
        engine.set_rating("b", 2100)
        assert engine.get_rating("b") == 2000

    def test_history_recorded(self):
        engine = EloEngine()
        ctx = _ctx()
        engine.update_ratings("a", "b", 2, 1, ctx)
        assert len(engine.get_rating_history("a")) == 1
        assert engine.get_rating_history("a")[0].entity_id == "a"

    def test_win_probability_home_advantage(self):
        engine = EloEngine(EloConfig(home_advantage=100, scale=400))
        ctx = _ctx(home_id="a")
        # Equal ratings but "a" is home → should have >50% win prob
        p = engine.win_probability("a", "b", ctx)
        assert p > 0.5


class TestSoccerElo:
    def test_three_way_sums_to_one(self):
        engine = SoccerEloEngine()
        ctx = _ctx()
        p_h, p_d, p_a = engine.three_way_probability("a", "b", ctx)
        assert abs(p_h + p_d + p_a - 1.0) < 1e-6

    def test_draw_prob_higher_for_equal_teams(self):
        engine = SoccerEloEngine()
        ctx = _ctx(home_id=None)  # neutral venue
        # Equal ratings
        _, p_draw_equal, _ = engine.three_way_probability("a", "b", ctx)
        # Give A a massive advantage
        engine.set_rating("a", 2000)
        engine.set_rating("b", 1200)
        _, p_draw_mismatch, _ = engine.three_way_probability("a", "b", ctx)
        assert p_draw_equal > p_draw_mismatch


class TestTennisElo:
    def test_surface_rating_includes_delta(self):
        engine = TennisEloEngine()
        engine.set_rating("a", 1600)
        engine._surface_deltas["a"] = {"clay": 80.0}
        assert engine.get_surface_rating("a", "clay") == 1680.0
        assert engine.get_surface_rating("a", "hard") == 1600.0

    def test_surface_delta_updates_after_match(self):
        engine = TennisEloEngine()
        from core.types import Sport
        ctx = MatchContext(
            match_id="t1", sport=Sport.TENNIS,
            date=datetime(2024, 6, 1, tzinfo=timezone.utc),
            home_entity_id="a", away_entity_id="b",
            extra={"tournament_level": "grand_slam", "round": "final"},
        )
        engine.update_ratings_on_surface("a", "b", 2, 0, "clay", ctx)
        # Winner should gain clay delta
        assert engine.get_surface_delta("a", "clay") > 0


class TestEsportsElo:
    def test_map_rating_includes_delta(self):
        engine = EsportsEloEngine()
        engine.set_rating("team_a", 1700)
        engine._map_deltas["team_a"] = {"mirage": 50.0}
        assert engine.get_map_rating("team_a", "mirage") == 1750.0

    def test_roster_stability_decreases_with_changes(self):
        from datetime import timedelta
        engine = EsportsEloEngine()
        now = datetime(2024, 3, 1, tzinfo=timezone.utc)
        engine.register_roster_change("team_a", now - timedelta(days=10), is_major=True)
        engine.register_roster_change("team_a", now - timedelta(days=20))
        score = engine.roster_stability_score("team_a", now)
        assert score < 1.0

    def test_stable_team_has_full_stability(self):
        engine = EsportsEloEngine()
        now = datetime(2024, 3, 1, tzinfo=timezone.utc)
        score = engine.roster_stability_score("team_a", now)
        assert score == 1.0
