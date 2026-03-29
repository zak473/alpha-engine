"""Unit tests for auto_picks Kelly maths and edge calculation."""
import pytest
from pipelines.picks.auto_picks import kelly_fraction, edge_pct


def test_kelly_positive_edge():
    # 60% win probability at 2.0 odds → Kelly = (1*0.6 - 0.4) / 1 = 0.2
    k = kelly_fraction(prob=0.6, decimal_odds=2.0)
    assert abs(k - 0.2) < 0.001


def test_kelly_zero_edge():
    # Implied prob = 50%, model prob = 50% → no edge → Kelly = 0
    k = kelly_fraction(prob=0.5, decimal_odds=2.0)
    assert k == 0.0


def test_kelly_negative_edge():
    # Model says 40%, book implies 50% → negative edge → Kelly = 0 (clamped)
    k = kelly_fraction(prob=0.4, decimal_odds=2.0)
    assert k == 0.0


def test_kelly_bad_odds():
    # Odds <= 1 (invalid) → 0
    k = kelly_fraction(prob=0.9, decimal_odds=1.0)
    assert k == 0.0


def test_edge_positive():
    # Model 60%, implied 50% → edge = +10%
    e = edge_pct(model_prob=0.6, decimal_odds=2.0)
    assert abs(e - 0.1) < 0.001


def test_edge_negative():
    # Model 40%, implied 50% → edge = -10%
    e = edge_pct(model_prob=0.4, decimal_odds=2.0)
    assert abs(e - (-0.1)) < 0.001


def test_edge_zero():
    e = edge_pct(model_prob=0.5, decimal_odds=2.0)
    assert e == 0.0
