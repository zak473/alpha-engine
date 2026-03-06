"""
Shared feature engineering for all sports that don't have a dedicated
feat_* table (basketball, baseball, tennis, esports).

Features computed here use only data available BEFORE kickoff (no leakage):
  - elo_home, elo_away, elo_diff          (from rating_elo_team)
  - home_form_pts, away_form_pts          (last-5 results, 3pts/win, 1pt/draw)
  - home_win_pct_5, away_win_pct_5        (win rate in last 5)
  - home_days_rest, away_days_rest        (days since last match)
  - rest_diff                             (home - away)
  - h2h_home_win_pct                      (all prior meetings, this sport)
  - h2h_matches_played                    (count)
  - is_home_advantage                     (always 1 — canonical home team)

All functions return float vectors. Missing values → 0.0 (safe for LR).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch, RatingEloTeam

# Baseline ELO if no rating found
_DEFAULT_ELO = 1000.0

FEATURE_NAMES = [
    "elo_home",
    "elo_away",
    "elo_diff",
    "home_form_pts",
    "away_form_pts",
    "home_win_pct_5",
    "away_win_pct_5",
    "home_days_rest",
    "away_days_rest",
    "rest_diff",
    "h2h_home_win_pct",
    "h2h_matches_played",
    "is_home_advantage",
]

# Outcome labels (binary — no draw for these sports)
OUTCOME_LABELS = {"home_win": 0, "away_win": 1}
LABEL_OUTCOMES = {0: "home_win", 1: "away_win"}


# ── ELO helpers ───────────────────────────────────────────────────────────────

def _get_elo_before(
    db: Session,
    team_id: str,
    kickoff: datetime,
) -> float:
    """Latest rating_before recorded prior to this kickoff."""
    row = (
        db.query(RatingEloTeam)
        .join(CoreMatch, RatingEloTeam.match_id == CoreMatch.id)
        .filter(
            RatingEloTeam.team_id == team_id,
            CoreMatch.kickoff_utc < kickoff,
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .first()
    )
    return row.rating_after if row else _DEFAULT_ELO


# ── Form helpers ──────────────────────────────────────────────────────────────

def _last_n_matches(
    db: Session,
    team_id: str,
    kickoff: datetime,
    sport: str,
    n: int = 5,
) -> list[CoreMatch]:
    """Last n finished matches for a team (home or away) before kickoff."""
    from sqlalchemy import or_
    return (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == sport,
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
            CoreMatch.kickoff_utc < kickoff,
            or_(
                CoreMatch.home_team_id == team_id,
                CoreMatch.away_team_id == team_id,
            ),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(n)
        .all()
    )


def _form_points(matches: list[CoreMatch], team_id: str) -> float:
    """3pts/win, 1pt/draw, 0pt/loss. Max 15 for 5 matches."""
    pts = 0.0
    for m in matches:
        is_home = m.home_team_id == team_id
        outcome = m.outcome
        if outcome == "home_win":
            pts += 3 if is_home else 0
        elif outcome == "away_win":
            pts += 0 if is_home else 3
        elif outcome == "draw":
            pts += 1
    return pts


def _win_pct(matches: list[CoreMatch], team_id: str) -> float:
    if not matches:
        return 0.5
    wins = sum(
        1 for m in matches
        if (m.home_team_id == team_id and m.outcome == "home_win")
        or (m.away_team_id == team_id and m.outcome == "away_win")
    )
    return wins / len(matches)


def _days_rest(
    db: Session,
    team_id: str,
    kickoff: datetime,
    sport: str,
) -> float:
    """Days since last match. Returns 7.0 if no prior match found."""
    from sqlalchemy import or_
    last = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == sport,
            CoreMatch.kickoff_utc < kickoff,
            or_(
                CoreMatch.home_team_id == team_id,
                CoreMatch.away_team_id == team_id,
            ),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .first()
    )
    if not last:
        return 7.0
    tz = timezone.utc
    k = kickoff if kickoff.tzinfo else kickoff.replace(tzinfo=tz)
    l = last.kickoff_utc if last.kickoff_utc.tzinfo else last.kickoff_utc.replace(tzinfo=tz)
    return max(0.0, (k - l).total_seconds() / 86_400)


# ── H2H helpers ───────────────────────────────────────────────────────────────

def _h2h(
    db: Session,
    home_id: str,
    away_id: str,
    kickoff: datetime,
    sport: str,
) -> tuple[float, int]:
    """(home_win_pct, n_meetings) for all prior H2H meetings."""
    from sqlalchemy import or_, and_
    meetings = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == sport,
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
            CoreMatch.kickoff_utc < kickoff,
            or_(
                and_(CoreMatch.home_team_id == home_id, CoreMatch.away_team_id == away_id),
                and_(CoreMatch.home_team_id == away_id, CoreMatch.away_team_id == home_id),
            ),
        )
        .all()
    )
    if not meetings:
        return 0.5, 0
    home_wins = sum(
        1 for m in meetings
        if (m.home_team_id == home_id and m.outcome == "home_win")
        or (m.away_team_id == home_id and m.outcome == "away_win")
    )
    return home_wins / len(meetings), len(meetings)


# ── Main feature builder ──────────────────────────────────────────────────────

def build_feature_vector(
    db: Session,
    match: CoreMatch,
) -> tuple[list[float], dict]:
    """
    Compute feature vector for a match.
    Returns (vector, raw_dict) — both ordered to match FEATURE_NAMES.
    """
    sport = match.sport or "soccer"
    kickoff = match.kickoff_utc
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)

    home_id = match.home_team_id
    away_id = match.away_team_id

    elo_home = _get_elo_before(db, home_id, kickoff)
    elo_away = _get_elo_before(db, away_id, kickoff)
    elo_diff = elo_home - elo_away

    home_matches = _last_n_matches(db, home_id, kickoff, sport)
    away_matches = _last_n_matches(db, away_id, kickoff, sport)

    home_form_pts = _form_points(home_matches, home_id)
    away_form_pts = _form_points(away_matches, away_id)
    home_win_pct_5 = _win_pct(home_matches, home_id)
    away_win_pct_5 = _win_pct(away_matches, away_id)

    home_days_rest = _days_rest(db, home_id, kickoff, sport)
    away_days_rest = _days_rest(db, away_id, kickoff, sport)
    rest_diff = home_days_rest - away_days_rest

    h2h_win_pct, h2h_n = _h2h(db, home_id, away_id, kickoff, sport)

    raw = {
        "elo_home":            elo_home,
        "elo_away":            elo_away,
        "elo_diff":            elo_diff,
        "home_form_pts":       home_form_pts,
        "away_form_pts":       away_form_pts,
        "home_win_pct_5":      home_win_pct_5,
        "away_win_pct_5":      away_win_pct_5,
        "home_days_rest":      home_days_rest,
        "away_days_rest":      away_days_rest,
        "rest_diff":           rest_diff,
        "h2h_home_win_pct":    h2h_win_pct,
        "h2h_matches_played":  h2h_n,
        "is_home_advantage":   1.0,
    }
    vector = [raw[f] for f in FEATURE_NAMES]
    return vector, raw
