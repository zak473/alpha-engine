"""
Basketball-specific feature engineering.

Extends the shared feature_engineering module with rolling stats computed
from BasketballTeamMatchStats. All features are leak-free (only data
available strictly before kickoff is used).

Features:
  Base 13 (ELO + form + H2H + rest)  — from shared module helpers
  Basketball rolling averages (last 10 games):
    pts_avg, pts_allowed_avg, fg_pct_avg, fg3_pct_avg,
    reb_avg, ast_avg, tov_avg, net_rating_avg
"""

from __future__ import annotations

from datetime import timezone

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch
from db.models.basketball import BasketballTeamMatchStats
import pipelines.common.feature_engineering as _shared

# Re-export shared helpers so callers can use this module directly
_get_elo_before   = _shared._get_elo_before
_last_n_matches   = _shared._last_n_matches
_form_points      = _shared._form_points
_win_pct          = _shared._win_pct
_days_rest        = _shared._days_rest
_h2h              = _shared._h2h

FEATURE_NAMES = [
    # Base (ELO + form + H2H + rest) - matches shared module
    "elo_home", "elo_away", "elo_diff",
    "home_form_pts", "away_form_pts",
    "home_win_pct_5", "away_win_pct_5",
    "home_days_rest", "away_days_rest", "rest_diff",
    "h2h_home_win_pct", "h2h_matches_played",
    "is_home_advantage",
    # Basketball-specific rolling averages (last 10 games)
    "home_pts_avg", "away_pts_avg",
    "home_pts_allowed_avg", "away_pts_allowed_avg",
    "home_fg_pct_avg", "away_fg_pct_avg",
    "home_fg3_pct_avg", "away_fg3_pct_avg",
    "home_reb_avg", "away_reb_avg",
    "home_ast_avg", "away_ast_avg",
    "home_tov_avg", "away_tov_avg",
    "home_net_rating_avg", "away_net_rating_avg",
]

OUTCOME_LABELS = {"home_win": 0, "away_win": 1, "H": 0, "A": 1}
LABEL_OUTCOMES = {0: "home_win", 1: "away_win"}


# ── Basketball rolling stats ───────────────────────────────────────────────────

def _rolling_bball_stats(
    db: Session,
    team_id: str,
    kickoff,
    n: int = 10,
) -> dict:
    """
    Compute rolling basketball stats for a team over its last n finished matches
    before kickoff.

    For each match, joins BasketballTeamMatchStats (this team) and the opponent's
    row to derive pts_allowed_avg.

    Returns a dict with keys:
        pts_avg, pts_allowed_avg, fg_pct_avg, fg3_pct_avg,
        reb_avg, ast_avg, tov_avg, net_rating_avg
    All values are float; missing/unavailable data → 0.0.
    """
    from sqlalchemy import or_

    # Fetch last n finished basketball matches for this team
    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "basketball",
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

    if not matches:
        return {
            "pts_avg": 0.0,
            "pts_allowed_avg": 0.0,
            "fg_pct_avg": 0.0,
            "fg3_pct_avg": 0.0,
            "reb_avg": 0.0,
            "ast_avg": 0.0,
            "tov_avg": 0.0,
            "net_rating_avg": 0.0,
        }

    pts_list          = []
    pts_allowed_list  = []
    fg_pct_list       = []
    fg3_pct_list      = []
    reb_list          = []
    ast_list          = []
    tov_list          = []
    net_rating_list   = []

    for match in matches:
        match_id = match.id

        # This team's stats row
        own_row = (
            db.query(BasketballTeamMatchStats)
            .filter(
                BasketballTeamMatchStats.match_id == match_id,
                BasketballTeamMatchStats.team_id == team_id,
            )
            .first()
        )

        # Opponent's stats row (different team_id, same match)
        opp_row = (
            db.query(BasketballTeamMatchStats)
            .filter(
                BasketballTeamMatchStats.match_id == match_id,
                BasketballTeamMatchStats.team_id != team_id,
            )
            .first()
        )

        if own_row is not None:
            if own_row.points is not None:
                pts_list.append(float(own_row.points))
            if own_row.fg_pct is not None:
                fg_pct_list.append(float(own_row.fg_pct))
            if own_row.fg3_pct is not None:
                fg3_pct_list.append(float(own_row.fg3_pct))
            if own_row.rebounds_total is not None:
                reb_list.append(float(own_row.rebounds_total))
            if own_row.assists is not None:
                ast_list.append(float(own_row.assists))
            if own_row.turnovers is not None:
                tov_list.append(float(own_row.turnovers))
            if own_row.net_rating is not None:
                net_rating_list.append(float(own_row.net_rating))

        # pts_allowed = opponent's points scored
        if opp_row is not None and opp_row.points is not None:
            pts_allowed_list.append(float(opp_row.points))

    def _avg(lst: list) -> float:
        return float(sum(lst) / len(lst)) if lst else 0.0

    return {
        "pts_avg":         _avg(pts_list),
        "pts_allowed_avg": _avg(pts_allowed_list),
        "fg_pct_avg":      _avg(fg_pct_list),
        "fg3_pct_avg":     _avg(fg3_pct_list),
        "reb_avg":         _avg(reb_list),
        "ast_avg":         _avg(ast_list),
        "tov_avg":         _avg(tov_list),
        "net_rating_avg":  _avg(net_rating_list),
    }


# ── Main feature builder ───────────────────────────────────────────────────────

def build_feature_vector(
    db: Session,
    match: CoreMatch,
) -> tuple[list[float], dict]:
    """
    Compute the full basketball feature vector for a match.

    1. Computes the base 13 shared features (ELO, form, H2H, rest).
    2. Appends basketball-specific rolling averages for home and away teams.

    Returns (vector, raw_dict) ordered to match FEATURE_NAMES.
    """
    sport = "basketball"
    kickoff = match.kickoff_utc
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)

    home_id = match.home_team_id
    away_id = match.away_team_id

    # ── Base features (shared helpers) ────────────────────────────────────────
    elo_home = _get_elo_before(db, home_id, kickoff)
    elo_away = _get_elo_before(db, away_id, kickoff)
    elo_diff = elo_home - elo_away

    home_matches = _last_n_matches(db, home_id, kickoff, sport)
    away_matches = _last_n_matches(db, away_id, kickoff, sport)

    home_form_pts  = _form_points(home_matches, home_id)
    away_form_pts  = _form_points(away_matches, away_id)
    home_win_pct_5 = _win_pct(home_matches, home_id)
    away_win_pct_5 = _win_pct(away_matches, away_id)

    home_days_rest = _days_rest(db, home_id, kickoff, sport)
    away_days_rest = _days_rest(db, away_id, kickoff, sport)
    rest_diff      = home_days_rest - away_days_rest

    h2h_win_pct, h2h_n = _h2h(db, home_id, away_id, kickoff, sport)

    # ── Basketball rolling stats ───────────────────────────────────────────────
    home_bball = _rolling_bball_stats(db, home_id, kickoff)
    away_bball = _rolling_bball_stats(db, away_id, kickoff)

    raw = {
        # Base 13
        "elo_home":             elo_home,
        "elo_away":             elo_away,
        "elo_diff":             elo_diff,
        "home_form_pts":        home_form_pts,
        "away_form_pts":        away_form_pts,
        "home_win_pct_5":       home_win_pct_5,
        "away_win_pct_5":       away_win_pct_5,
        "home_days_rest":       home_days_rest,
        "away_days_rest":       away_days_rest,
        "rest_diff":            rest_diff,
        "h2h_home_win_pct":     h2h_win_pct,
        "h2h_matches_played":   h2h_n,
        "is_home_advantage":    1.0,
        # Basketball rolling averages
        "home_pts_avg":         home_bball["pts_avg"],
        "away_pts_avg":         away_bball["pts_avg"],
        "home_pts_allowed_avg": home_bball["pts_allowed_avg"],
        "away_pts_allowed_avg": away_bball["pts_allowed_avg"],
        "home_fg_pct_avg":      home_bball["fg_pct_avg"],
        "away_fg_pct_avg":      away_bball["fg_pct_avg"],
        "home_fg3_pct_avg":     home_bball["fg3_pct_avg"],
        "away_fg3_pct_avg":     away_bball["fg3_pct_avg"],
        "home_reb_avg":         home_bball["reb_avg"],
        "away_reb_avg":         away_bball["reb_avg"],
        "home_ast_avg":         home_bball["ast_avg"],
        "away_ast_avg":         away_bball["ast_avg"],
        "home_tov_avg":         home_bball["tov_avg"],
        "away_tov_avg":         away_bball["tov_avg"],
        "home_net_rating_avg":  home_bball["net_rating_avg"],
        "away_net_rating_avg":  away_bball["net_rating_avg"],
    }

    vector = [raw[f] for f in FEATURE_NAMES]
    return vector, raw
