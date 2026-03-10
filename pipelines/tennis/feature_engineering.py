"""
Tennis-specific feature engineering for ML match prediction.

Features are computed using only data available BEFORE kickoff (no leakage):
  - elo_home, elo_away, elo_diff          (from rating_elo_team)
  - home_form_pts, away_form_pts          (points from last 5 matches, 3/win)
  - home_days_rest, away_days_rest        (days since last match)
  - h2h_home_win_pct, h2h_matches_played  (all prior H2H meetings)
  - surface_hard, surface_clay,
    surface_grass                         (one-hot from TennisMatch.surface)
  - home_ace_avg, away_ace_avg            (rolling 10-match avg aces)
  - home_df_avg, away_df_avg              (rolling 10-match avg double faults)
  - home_first_serve_pct_avg,
    away_first_serve_pct_avg              (rolling 10-match avg first_serve_in_pct)
  - home_first_serve_won_avg,
    away_first_serve_won_avg              (rolling 10-match avg first_serve_won_pct)
  - home_bp_conv_avg, away_bp_conv_avg    (rolling 10-match avg bp_conversion_pct)

All functions return float vectors. Missing values → 0.0 (safe for LR).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch, RatingEloTeam
from db.models.tennis import TennisMatch, TennisMatchStats

_SPORT = "tennis"
_DEFAULT_ELO = 1000.0

FEATURE_NAMES: list[str] = [
    "elo_home",
    "elo_away",
    "elo_diff",
    "home_form_pts",
    "away_form_pts",
    "home_days_rest",
    "away_days_rest",
    "h2h_home_win_pct",
    "h2h_matches_played",
    "surface_hard",
    "surface_clay",
    "surface_grass",
    "home_ace_avg",
    "away_ace_avg",
    "home_df_avg",
    "away_df_avg",
    "home_first_serve_pct_avg",
    "away_first_serve_pct_avg",
    "home_first_serve_won_avg",
    "away_first_serve_won_avg",
    "home_bp_conv_avg",
    "away_bp_conv_avg",
]

# Outcome labels (binary — no draws in tennis)
OUTCOME_LABELS: dict[str, int] = {"home_win": 0, "H": 0, "away_win": 1, "A": 1}
LABEL_OUTCOMES: dict[int, str] = {0: "home_win", 1: "away_win"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_float(val, default: float = 0.0) -> float:
    """Return float(val) or default if val is None."""
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ── ELO ───────────────────────────────────────────────────────────────────────

def _get_elo_before(db: Session, team_id: str, kickoff: datetime) -> float:
    """Latest ELO rating recorded prior to kickoff."""
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


# ── Form ──────────────────────────────────────────────────────────────────────

def _last_n_matches(
    db: Session,
    player_id: str,
    kickoff: datetime,
    n: int = 5,
) -> list[CoreMatch]:
    """Last n finished tennis matches for a player (home or away) before kickoff."""
    from sqlalchemy import or_
    return (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == _SPORT,
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
            CoreMatch.kickoff_utc < kickoff,
            or_(
                CoreMatch.home_team_id == player_id,
                CoreMatch.away_team_id == player_id,
            ),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(n)
        .all()
    )


def _form_points(matches: list[CoreMatch], player_id: str) -> float:
    """3 pts per win, 0 per loss. Tennis has no draws."""
    pts = 0.0
    for m in matches:
        is_home = m.home_team_id == player_id
        if m.outcome in ("home_win", "H"):
            pts += 3 if is_home else 0
        elif m.outcome in ("away_win", "A"):
            pts += 0 if is_home else 3
    return pts


def _days_rest(db: Session, player_id: str, kickoff: datetime) -> float:
    """Days since last tennis match. Returns 7.0 if no prior match found."""
    from sqlalchemy import or_
    last = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == _SPORT,
            CoreMatch.kickoff_utc < kickoff,
            or_(
                CoreMatch.home_team_id == player_id,
                CoreMatch.away_team_id == player_id,
            ),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .first()
    )
    if not last:
        return 7.0
    k = _ensure_utc(kickoff)
    l = _ensure_utc(last.kickoff_utc)
    return max(0.0, (k - l).total_seconds() / 86_400)


# ── H2H ───────────────────────────────────────────────────────────────────────

def _h2h(
    db: Session,
    home_id: str,
    away_id: str,
    kickoff: datetime,
) -> tuple[float, int]:
    """(home_win_pct, n_meetings) for all prior H2H tennis meetings."""
    from sqlalchemy import or_, and_
    meetings = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == _SPORT,
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
        if (m.home_team_id == home_id and m.outcome in ("home_win", "H"))
        or (m.away_team_id == home_id and m.outcome in ("away_win", "A"))
    )
    return home_wins / len(meetings), len(meetings)


# ── Surface one-hot ───────────────────────────────────────────────────────────

def _surface_features(surface: Optional[str]) -> tuple[float, float, float]:
    """Returns (surface_hard, surface_clay, surface_grass)."""
    s = (surface or "").lower()
    return (
        1.0 if s == "hard" else 0.0,
        1.0 if s == "clay" else 0.0,
        1.0 if s == "grass" else 0.0,
    )


# ── Rolling serve stats ───────────────────────────────────────────────────────

def _rolling_serve_stats(
    db: Session,
    player_id: str,
    kickoff: datetime,
    n: int = 10,
) -> dict[str, float]:
    """
    Average serve statistics over the last n TennisMatchStats rows before kickoff.
    Returns a dict with keys: ace_avg, df_avg, first_serve_pct_avg,
    first_serve_won_avg, bp_conv_avg.
    All values default to 0.0 if no data.
    """
    rows = (
        db.query(TennisMatchStats)
        .join(TennisMatch, TennisMatchStats.match_id == TennisMatch.match_id)
        .join(CoreMatch, TennisMatch.match_id == CoreMatch.id)
        .filter(
            TennisMatchStats.player_id == player_id,
            CoreMatch.kickoff_utc < kickoff,
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(n)
        .all()
    )

    if not rows:
        return {
            "ace_avg":              0.0,
            "df_avg":               0.0,
            "first_serve_pct_avg":  0.0,
            "first_serve_won_avg":  0.0,
            "bp_conv_avg":          0.0,
        }

    def _avg(attr: str) -> float:
        vals = [_safe_float(getattr(r, attr)) for r in rows if getattr(r, attr) is not None]
        return sum(vals) / len(vals) if vals else 0.0

    return {
        "ace_avg":              _avg("aces"),
        "df_avg":               _avg("double_faults"),
        "first_serve_pct_avg":  _avg("first_serve_in_pct"),
        "first_serve_won_avg":  _avg("first_serve_won_pct"),
        "bp_conv_avg":          _avg("bp_conversion_pct"),
    }


# ── Main feature builder ──────────────────────────────────────────────────────

def build_feature_vector(
    db: Session,
    match: CoreMatch,
) -> tuple[list[float], dict]:
    """
    Compute feature vector for a tennis match.
    Returns (vector, raw_dict) — both ordered to match FEATURE_NAMES.
    No data leakage: all queries filter by kickoff_utc < match.kickoff_utc.
    """
    kickoff = _ensure_utc(match.kickoff_utc)
    home_id = match.home_team_id
    away_id = match.away_team_id

    # ELO
    elo_home = _get_elo_before(db, home_id, kickoff)
    elo_away = _get_elo_before(db, away_id, kickoff)
    elo_diff = elo_home - elo_away

    # Form
    home_matches = _last_n_matches(db, home_id, kickoff, n=5)
    away_matches = _last_n_matches(db, away_id, kickoff, n=5)
    home_form_pts = _form_points(home_matches, home_id)
    away_form_pts = _form_points(away_matches, away_id)

    # Rest
    home_days_rest = _days_rest(db, home_id, kickoff)
    away_days_rest = _days_rest(db, away_id, kickoff)

    # H2H
    h2h_win_pct, h2h_n = _h2h(db, home_id, away_id, kickoff)

    # Surface — look up TennisMatch detail for surface; fall back to None
    tennis_detail: Optional[TennisMatch] = (
        db.query(TennisMatch)
        .filter(TennisMatch.match_id == match.id)
        .first()
    )
    surface = tennis_detail.surface if tennis_detail else None
    surface_hard, surface_clay, surface_grass = _surface_features(surface)

    # Rolling serve stats
    home_serve = _rolling_serve_stats(db, home_id, kickoff)
    away_serve = _rolling_serve_stats(db, away_id, kickoff)

    raw = {
        "elo_home":                  elo_home,
        "elo_away":                  elo_away,
        "elo_diff":                  elo_diff,
        "home_form_pts":             home_form_pts,
        "away_form_pts":             away_form_pts,
        "home_days_rest":            home_days_rest,
        "away_days_rest":            away_days_rest,
        "h2h_home_win_pct":          h2h_win_pct,
        "h2h_matches_played":        float(h2h_n),
        "surface_hard":              surface_hard,
        "surface_clay":              surface_clay,
        "surface_grass":             surface_grass,
        "home_ace_avg":              home_serve["ace_avg"],
        "away_ace_avg":              away_serve["ace_avg"],
        "home_df_avg":               home_serve["df_avg"],
        "away_df_avg":               away_serve["df_avg"],
        "home_first_serve_pct_avg":  home_serve["first_serve_pct_avg"],
        "away_first_serve_pct_avg":  away_serve["first_serve_pct_avg"],
        "home_first_serve_won_avg":  home_serve["first_serve_won_avg"],
        "away_first_serve_won_avg":  away_serve["first_serve_won_avg"],
        "home_bp_conv_avg":          home_serve["bp_conv_avg"],
        "away_bp_conv_avg":          away_serve["bp_conv_avg"],
    }
    vector = [raw[f] for f in FEATURE_NAMES]
    return vector, raw
