"""Smoke tests for settings loading."""
from config.settings import settings


def test_settings_loads():
    assert settings is not None


def test_auto_pick_defaults():
    assert 0 < settings.AUTO_PICK_MIN_EDGE < 1
    assert 0 < settings.AUTO_PICK_MIN_CONFIDENCE < 1
    assert 0 < settings.AUTO_PICK_KELLY_FRACTION <= 1


def test_odds_bounds_sane():
    assert settings.MIN_ODDS >= 1.0
    assert settings.MAX_ODDS > settings.MIN_ODDS
