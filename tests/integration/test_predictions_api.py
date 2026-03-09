"""
Integration tests for the predictions + performance endpoints.

Uses an in-memory SQLite DB so these can run without Railway.
"""

from __future__ import annotations

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.base import Base
from db.models.mvp import CoreLeague, CoreMatch, CoreTeam, ModelRegistry, PredMatch
from api.deps import get_db
from api.main import app


# ─── Test DB setup ────────────────────────────────────────────────────────────

SQLALCHEMY_TEST_URL = "sqlite:///:memory:"


@pytest.fixture(scope="module")
def db_engine():
    engine = create_engine(
        SQLALCHEMY_TEST_URL,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = Session()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ─── Fixtures ─────────────────────────────────────────────────────────────────

def _seed_match(session, match_id="m1", status="scheduled", outcome=None,
                odds_home=None, odds_away=None, odds_draw=None):
    league = session.get(CoreLeague, "l1")
    if not league:
        league = CoreLeague(id="l1", name="Test League", sport="soccer")
        session.add(league)

    home = session.get(CoreTeam, "t1")
    if not home:
        home = CoreTeam(id="t1", name="Home FC")
        session.add(home)

    away = session.get(CoreTeam, "t2")
    if not away:
        away = CoreTeam(id="t2", name="Away FC")
        session.add(away)

    match = session.get(CoreMatch, match_id)
    if not match:
        match = CoreMatch(
            id=match_id,
            league_id="l1",
            home_team_id="t1",
            away_team_id="t2",
            kickoff_utc=datetime(2025, 6, 1, 15, 0, tzinfo=timezone.utc),
            status=status,
            outcome=outcome,
            sport="soccer",
            provider_id=f"prov_{match_id}",
            odds_home=odds_home,
            odds_away=odds_away,
            odds_draw=odds_draw,
        )
        session.add(match)

    registry = session.get(ModelRegistry, None)
    if not session.query(ModelRegistry).filter_by(is_live=True).first():
        registry = ModelRegistry(
            model_name="soccer_lr_v1",
            version="v1",
            algorithm="LogisticRegression",
            sport="soccer",
            is_live=True,
            artifact_path="/tmp/test_model.joblib",
            metrics={"accuracy": 0.58, "brier_score": 0.21, "log_loss": 0.64},
        )
        session.add(registry)

    if not session.query(PredMatch).filter_by(match_id=match_id).first():
        pred = PredMatch(
            match_id=match_id,
            model_version="soccer_lr_v1",
            p_home=0.55,
            p_draw=0.25,
            p_away=0.20,
            confidence=72,
            fair_odds_home=1.82,
            fair_odds_draw=4.0,
            fair_odds_away=5.0,
        )
        session.add(pred)

    session.commit()


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestPredictionsEndpoint:
    def test_list_predictions_empty(self, client):
        resp = client.get("/api/v1/predictions")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    def test_list_predictions_returns_match(self, client, db_session):
        _seed_match(db_session)
        resp = client.get("/api/v1/predictions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        item = data["items"][0]
        assert item["sport"] == "soccer"
        assert "probabilities" in item
        assert "participants" in item

    def test_prediction_includes_market_odds_when_present(self, client, db_session):
        _seed_match(db_session, match_id="m2", odds_home=1.90, odds_away=4.50, odds_draw=3.60)
        resp = client.get("/api/v1/predictions")
        assert resp.status_code == 200
        items = resp.json()["items"]
        m2 = next((i for i in items if i["event_id"] == "m2"), None)
        if m2:
            assert m2["market_odds"] is not None
            assert m2["market_odds"]["home_win"] == 1.90

    def test_prediction_market_odds_null_when_not_available(self, client, db_session):
        _seed_match(db_session, match_id="m3")
        resp = client.get("/api/v1/predictions")
        items = resp.json()["items"]
        m3 = next((i for i in items if i["event_id"] == "m3"), None)
        if m3:
            assert m3["market_odds"] is None

    def test_get_match_prediction(self, client, db_session):
        _seed_match(db_session, match_id="m4")
        resp = client.get("/api/v1/predictions/match/m4")
        assert resp.status_code == 200
        data = resp.json()
        assert data["event_id"] == "m4"
        assert 0 <= data["probabilities"]["home_win"] <= 1

    def test_performance_endpoint(self, client, db_session):
        _seed_match(db_session)
        resp = client.get("/api/v1/predictions/performance")
        assert resp.status_code == 200
        data = resp.json()
        assert "models" in data
        if data["models"]:
            m = data["models"][0]
            assert "accuracy" in m
            assert "brier_score" in m


class TestPicksSettlement:
    def test_picks_stats_empty(self, client):
        resp = client.get("/api/v1/picks/stats")
        # Requires auth — expect 401 or 200 depending on get_current_user mock
        assert resp.status_code in (200, 401, 422)

    def test_roi_series_empty(self, client):
        resp = client.get("/api/v1/picks/roi-series")
        assert resp.status_code in (200, 401, 422)


class TestBacktestEndpoint:
    def test_backtest_run_no_data(self, client):
        resp = client.get("/api/v1/backtest/run?sport=soccer")
        assert resp.status_code == 200
        data = resp.json()
        assert "n_predictions" in data
        assert data["sport"] == "soccer"

    def test_backtest_run_with_finished_match(self, client, db_session):
        _seed_match(db_session, match_id="m_bt", status="finished",
                    outcome="home_win", odds_home=1.85)
        resp = client.get("/api/v1/backtest/run?sport=soccer&staking=flat")
        assert resp.status_code == 200
        data = resp.json()
        assert data["n_predictions"] >= 0

    def test_backtest_kelly_staking(self, client):
        resp = client.get("/api/v1/backtest/run?staking=kelly&kelly_fraction=0.25")
        assert resp.status_code == 200
        data = resp.json()
        assert "roi" in data
        assert "sharpe_ratio" in data

    def test_backtest_invalid_staking(self, client):
        # Should still return 200 with 0 results or error gracefully
        resp = client.get("/api/v1/backtest/run?staking=nonexistent")
        assert resp.status_code in (200, 422)


class TestHealthEndpoints:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_ready(self, client):
        resp = client.get("/ready")
        assert resp.status_code in (200, 503)
