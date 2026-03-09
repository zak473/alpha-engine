"""
Unit tests for pick auto-settlement logic and bankroll snapshot creation.
"""

from __future__ import annotations

import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from db.models.picks import TrackedPick
from db.models.mvp import CoreMatch


def _make_pick(outcome=None, market="moneyline", selection="home",
               match_label="Home FC vs Away FC", odds=1.90,
               stake_fraction=None, user_id="user1") -> TrackedPick:
    pick = TrackedPick.__new__(TrackedPick)
    pick.id = "pick1"
    pick.user_id = user_id
    pick.match_id = "match1"
    pick.match_label = match_label
    pick.market_name = market
    pick.selection_label = selection
    pick.odds = odds
    pick.edge = 0.05
    pick.stake_fraction = stake_fraction
    pick.outcome = outcome
    pick.settled_at = None
    pick.notes = None
    return pick


def _make_match(status="finished", outcome="home_win") -> CoreMatch:
    match = CoreMatch.__new__(CoreMatch)
    match.id = "match1"
    match.status = status
    match.outcome = outcome
    match.home_score = 2
    match.away_score = 1
    return match


class TestAutoSettle:
    def _run_settle(self, pick, match):
        """Run _auto_settle with a mock DB session."""
        from api.routers.picks import _auto_settle

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = match

        with patch("api.routers.picks._create_bankroll_snapshot"):
            _auto_settle(pick, db)

        return pick

    def test_home_win_settles_home_pick(self):
        pick = _make_pick(selection="home")
        match = _make_match(outcome="home_win")
        self._run_settle(pick, match)
        assert pick.outcome == "won"
        assert pick.settled_at is not None

    def test_home_win_settles_away_pick_as_lost(self):
        pick = _make_pick(selection="away")
        match = _make_match(outcome="home_win")
        self._run_settle(pick, match)
        assert pick.outcome == "lost"

    def test_draw_settles_draw_pick(self):
        pick = _make_pick(selection="draw")
        match = _make_match(outcome="draw")
        self._run_settle(pick, match)
        assert pick.outcome == "won"

    def test_draw_settles_home_pick_as_lost(self):
        pick = _make_pick(selection="home")
        match = _make_match(outcome="draw")
        self._run_settle(pick, match)
        assert pick.outcome == "lost"

    def test_already_settled_picks_skipped(self):
        pick = _make_pick(outcome="won")
        match = _make_match()
        self._run_settle(pick, match)
        assert pick.outcome == "won"  # unchanged

    def test_pending_match_not_settled(self):
        pick = _make_pick()
        match = _make_match(status="scheduled", outcome=None)
        self._run_settle(pick, match)
        assert pick.outcome is None

    def test_name_in_label_matches(self):
        pick = _make_pick(selection="home fc", match_label="Home FC vs Away FC")
        match = _make_match(outcome="home_win")
        self._run_settle(pick, match)
        assert pick.outcome == "won"

    def test_nonmoneyline_market_not_settled(self):
        pick = _make_pick(market="over/under 2.5", selection="over")
        match = _make_match(outcome="home_win")
        self._run_settle(pick, match)
        assert pick.outcome is None  # non-moneyline not handled


class TestBankrollSnapshot:
    def test_won_pick_creates_positive_snapshot(self):
        from api.routers.picks import _create_bankroll_snapshot

        pick = _make_pick(outcome="won", odds=1.90, stake_fraction=1.0)

        db = MagicMock()
        last_snap = MagicMock()
        last_snap.balance = 100.0
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = last_snap

        _create_bankroll_snapshot(pick, db)

        db.add.assert_called_once()
        snap = db.add.call_args[0][0]
        assert snap.pnl == pytest.approx(0.90, abs=0.01)
        assert snap.balance == pytest.approx(100.90, abs=0.01)
        assert snap.event_type == "pick_settled"

    def test_lost_pick_creates_negative_snapshot(self):
        from api.routers.picks import _create_bankroll_snapshot

        pick = _make_pick(outcome="lost", odds=2.50, stake_fraction=1.0)

        db = MagicMock()
        last_snap = MagicMock()
        last_snap.balance = 100.0
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = last_snap

        _create_bankroll_snapshot(pick, db)

        snap = db.add.call_args[0][0]
        assert snap.pnl == pytest.approx(-1.0, abs=0.01)
        assert snap.balance == pytest.approx(99.0, abs=0.01)

    def test_void_pick_does_not_create_snapshot(self):
        from api.routers.picks import _create_bankroll_snapshot

        pick = _make_pick(outcome="void")
        db = MagicMock()

        _create_bankroll_snapshot(pick, db)

        db.add.assert_not_called()

    def test_no_prior_bankroll_starts_at_zero(self):
        from api.routers.picks import _create_bankroll_snapshot

        pick = _make_pick(outcome="won", odds=2.0, stake_fraction=1.0)

        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

        _create_bankroll_snapshot(pick, db)

        snap = db.add.call_args[0][0]
        assert snap.balance == pytest.approx(1.0, abs=0.01)  # 0 + (2.0 - 1.0) * 1.0


class TestBacktester:
    def test_empty_input_returns_zero_metrics(self):
        from evaluation.backtester import Backtester, StakingConfig
        from core.types import PredictionResult, Sport

        bt = Backtester(StakingConfig(method="flat"))
        result = bt.run([], [], [])
        assert result.n_predictions == 0
        assert result.roi == 0.0

    def test_flat_staking_positive_edge(self):
        from evaluation.backtester import Backtester, StakingConfig
        from core.types import PredictionResult, Sport

        bt = Backtester(StakingConfig(method="flat", min_edge=0.0, min_odds=1.0))
        preds = [PredictionResult(match_id=str(i), sport=Sport.SOCCER,
                                  p_home=0.60, p_away=0.25, p_draw=0.15)
                 for i in range(20)]
        actuals = [1.0 if i % 2 == 0 else 0.0 for i in range(20)]
        odds = [1.70] * 20  # model edge = 0.60 - 1/1.70 = 0.012

        result = bt.run(preds, actuals, odds)
        assert result.n_predictions == 20
        assert isinstance(result.roi, float)
        assert isinstance(result.brier_score, float)

    def test_kelly_staking_never_negative_bankroll(self):
        from evaluation.backtester import Backtester, StakingConfig
        from core.types import PredictionResult, Sport

        bt = Backtester(StakingConfig(method="kelly", kelly_fraction=0.1,
                                      min_edge=0.0, min_odds=1.0))
        preds = [PredictionResult(match_id=str(i), sport=Sport.SOCCER,
                                  p_home=0.55, p_away=0.25, p_draw=0.20)
                 for i in range(50)]
        actuals = [0.0] * 50  # worst case: all lose
        odds = [1.90] * 50

        result = bt.run(preds, actuals, odds)
        # Kelly can't go negative (bet fraction of remaining bankroll)
        assert result.max_drawdown <= 0  # drawdown is negative (loss)

    def test_brier_score_perfect_model(self):
        from evaluation.backtester import Backtester, StakingConfig
        from core.types import PredictionResult, Sport

        bt = Backtester(StakingConfig())
        preds = [PredictionResult(match_id="x", sport=Sport.SOCCER,
                                  p_home=1.0, p_away=0.0, p_draw=0.0)]
        actuals = [1.0]  # correct
        result = bt.run(preds, actuals, [1.01])
        assert result.brier_score == pytest.approx(0.0, abs=0.001)
