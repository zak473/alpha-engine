"""
Esports-specific feature engineering.

Differences from common:
  - is_home_advantage = 0.0  (online esports has no home/away venue)
  - form window extended to 10 matches (teams play more frequently)
  - adds form_diff and win_pct_diff as explicit signal features
  - adds elo_diff_norm (ELO diff / 400, stable scale)
  - adds home/away win_streak_last3 (hot-hand signal)
"""

from __future__ import annotations

from datetime import timezone

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch
from pipelines.common.feature_engineering import (
    _get_elo_before,
    _last_n_matches,
    _form_points,
    _win_pct,
    _days_rest,
    _h2h,
)

_SPORT = "esports"

FEATURE_NAMES = [
    "elo_home", "elo_away", "elo_diff", "elo_diff_norm",
    "home_form_pts", "away_form_pts", "form_diff",
    "home_win_pct_10", "away_win_pct_10", "win_pct_diff",
    "home_win_streak3", "away_win_streak3",
    "home_days_rest", "away_days_rest", "rest_diff",
    "h2h_home_win_pct", "h2h_matches_played",
]

OUTCOME_LABELS = {"home_win": 0, "away_win": 1, "H": 0, "A": 1}
LABEL_OUTCOMES = {0: "home_win", 1: "away_win"}


def _win_streak(matches: list[CoreMatch], team_id: str, n: int = 3) -> float:
    """Fraction of last n matches won (recent hot-hand signal)."""
    recent = matches[:n]
    if not recent:
        return 0.5
    wins = sum(
        1 for m in recent
        if (m.home_team_id == team_id and m.outcome in ("home_win", "H"))
        or (m.away_team_id == team_id and m.outcome in ("away_win", "A"))
    )
    return wins / len(recent)


def build_feature_vector(
    db: Session,
    match: CoreMatch,
) -> tuple[list[float], dict]:
    kickoff = match.kickoff_utc
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)

    home_id = match.home_team_id
    away_id = match.away_team_id

    elo_home = _get_elo_before(db, home_id, kickoff)
    elo_away = _get_elo_before(db, away_id, kickoff)
    elo_diff = elo_home - elo_away
    elo_diff_norm = elo_diff / 400.0

    home_matches = _last_n_matches(db, home_id, kickoff, _SPORT, n=10)
    away_matches = _last_n_matches(db, away_id, kickoff, _SPORT, n=10)

    home_form_pts = _form_points(home_matches, home_id)
    away_form_pts = _form_points(away_matches, away_id)
    form_diff = home_form_pts - away_form_pts

    home_win_pct = _win_pct(home_matches, home_id)
    away_win_pct = _win_pct(away_matches, away_id)
    win_pct_diff = home_win_pct - away_win_pct

    home_streak3 = _win_streak(home_matches, home_id, 3)
    away_streak3 = _win_streak(away_matches, away_id, 3)

    home_days_rest = _days_rest(db, home_id, kickoff, _SPORT)
    away_days_rest = _days_rest(db, away_id, kickoff, _SPORT)
    rest_diff = home_days_rest - away_days_rest

    h2h_win_pct, h2h_n = _h2h(db, home_id, away_id, kickoff, _SPORT)

    raw = {
        "elo_home":          elo_home,
        "elo_away":          elo_away,
        "elo_diff":          elo_diff,
        "elo_diff_norm":     elo_diff_norm,
        "home_form_pts":     home_form_pts,
        "away_form_pts":     away_form_pts,
        "form_diff":         form_diff,
        "home_win_pct_10":   home_win_pct,
        "away_win_pct_10":   away_win_pct,
        "win_pct_diff":      win_pct_diff,
        "home_win_streak3":  home_streak3,
        "away_win_streak3":  away_streak3,
        "home_days_rest":    home_days_rest,
        "away_days_rest":    away_days_rest,
        "rest_diff":         rest_diff,
        "h2h_home_win_pct":  h2h_win_pct,
        "h2h_matches_played": h2h_n,
    }

    vector = [raw[f] for f in FEATURE_NAMES]
    return vector, raw
