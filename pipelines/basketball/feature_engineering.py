"""
Basketball-specific feature engineering for ML match prediction.

Base 13 (ELO + form + rest + H2H + home_advantage) + basketball rolling stats
computed from BasketballTeamMatchStats. All features are leak-free.

Basketball rolling averages (last 10 games):
    points_avg, points_allowed_avg
    fg_pct_avg, fg3_pct_avg, ft_pct_avg
    rebounds_avg, assists_avg, turnovers_avg
    steals_avg, blocks_avg
"""

from __future__ import annotations

from datetime import timezone

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch
from db.models.basketball import BasketballTeamMatchStats
import pipelines.common.feature_engineering as _shared

_get_elo_before = _shared._get_elo_before
_last_n_matches = _shared._last_n_matches
_form_points    = _shared._form_points
_win_pct        = _shared._win_pct
_days_rest      = _shared._days_rest
_h2h            = _shared._h2h

FEATURE_NAMES = [
    # Base 13
    "elo_home", "elo_away", "elo_diff",
    "home_form_pts", "away_form_pts",
    "home_win_pct_5", "away_win_pct_5",
    "home_days_rest", "away_days_rest", "rest_diff",
    "h2h_home_win_pct", "h2h_matches_played",
    "is_home_advantage",
    # Basketball rolling averages (last 10 games)
    "home_pts_avg", "away_pts_avg",
    "home_pts_allowed_avg", "away_pts_allowed_avg",
    "home_fg_pct_avg", "away_fg_pct_avg",
    "home_fg3_pct_avg", "away_fg3_pct_avg",
    "home_ft_pct_avg", "away_ft_pct_avg",
    "home_reb_avg", "away_reb_avg",
    "home_ast_avg", "away_ast_avg",
    "home_tov_avg", "away_tov_avg",
    "home_stl_avg", "away_stl_avg",
    "home_blk_avg", "away_blk_avg",
]

OUTCOME_LABELS = {"home_win": 0, "away_win": 1, "H": 0, "A": 1}
LABEL_OUTCOMES = {0: "home_win", 1: "away_win"}


def _rolling_basketball_stats(db: Session, team_id: str, kickoff, n: int = 10) -> dict:
    from sqlalchemy import or_

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

    empty = {
        "pts_avg": 0.0, "pts_allowed_avg": 0.0,
        "fg_pct_avg": 0.0, "fg3_pct_avg": 0.0, "ft_pct_avg": 0.0,
        "reb_avg": 0.0, "ast_avg": 0.0, "tov_avg": 0.0,
        "stl_avg": 0.0, "blk_avg": 0.0,
    }
    if not matches:
        return empty

    pts_list, pts_allowed_list = [], []
    fg_pct_list, fg3_pct_list, ft_pct_list = [], [], []
    reb_list, ast_list, tov_list, stl_list, blk_list = [], [], [], [], []

    for match in matches:
        own = db.query(BasketballTeamMatchStats).filter_by(match_id=match.id, team_id=team_id).first()
        opp = (
            db.query(BasketballTeamMatchStats)
            .filter(
                BasketballTeamMatchStats.match_id == match.id,
                BasketballTeamMatchStats.team_id != team_id,
            )
            .first()
        )

        if own:
            if own.points is not None:           pts_list.append(float(own.points))
            if own.fg_pct is not None:           fg_pct_list.append(float(own.fg_pct))
            if own.fg3_pct is not None:          fg3_pct_list.append(float(own.fg3_pct))
            if own.ft_pct is not None:           ft_pct_list.append(float(own.ft_pct))
            if own.rebounds_total is not None:   reb_list.append(float(own.rebounds_total))
            if own.assists is not None:          ast_list.append(float(own.assists))
            if own.turnovers is not None:        tov_list.append(float(own.turnovers))
            if own.steals is not None:           stl_list.append(float(own.steals))
            if own.blocks is not None:           blk_list.append(float(own.blocks))
        else:
            # Fall back to score from CoreMatch when no stats row exists
            is_home = match.home_team_id == team_id
            score = match.home_score if is_home else match.away_score
            if score is not None:
                pts_list.append(float(score))

        if opp and opp.points is not None:
            pts_allowed_list.append(float(opp.points))
        else:
            is_home = match.home_team_id == team_id
            opp_score = match.away_score if is_home else match.home_score
            if opp_score is not None:
                pts_allowed_list.append(float(opp_score))

    def _avg(lst):
        return float(sum(lst) / len(lst)) if lst else 0.0

    return {
        "pts_avg":         _avg(pts_list),
        "pts_allowed_avg": _avg(pts_allowed_list),
        "fg_pct_avg":      _avg(fg_pct_list),
        "fg3_pct_avg":     _avg(fg3_pct_list),
        "ft_pct_avg":      _avg(ft_pct_list),
        "reb_avg":         _avg(reb_list),
        "ast_avg":         _avg(ast_list),
        "tov_avg":         _avg(tov_list),
        "stl_avg":         _avg(stl_list),
        "blk_avg":         _avg(blk_list),
    }


def build_feature_vector(db: Session, match: CoreMatch) -> tuple[list[float], dict]:
    sport = "basketball"
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

    home_form_pts  = _form_points(home_matches, home_id)
    away_form_pts  = _form_points(away_matches, away_id)
    home_win_pct_5 = _win_pct(home_matches, home_id)
    away_win_pct_5 = _win_pct(away_matches, away_id)

    home_days_rest = _days_rest(db, home_id, kickoff, sport)
    away_days_rest = _days_rest(db, away_id, kickoff, sport)
    rest_diff      = home_days_rest - away_days_rest

    h2h_win_pct, h2h_n = _h2h(db, home_id, away_id, kickoff, sport)

    home_b = _rolling_basketball_stats(db, home_id, kickoff)
    away_b = _rolling_basketball_stats(db, away_id, kickoff)

    raw = {
        "elo_home":              elo_home,
        "elo_away":              elo_away,
        "elo_diff":              elo_diff,
        "home_form_pts":         home_form_pts,
        "away_form_pts":         away_form_pts,
        "home_win_pct_5":        home_win_pct_5,
        "away_win_pct_5":        away_win_pct_5,
        "home_days_rest":        home_days_rest,
        "away_days_rest":        away_days_rest,
        "rest_diff":             rest_diff,
        "h2h_home_win_pct":      h2h_win_pct,
        "h2h_matches_played":    float(h2h_n),
        "is_home_advantage":     1.0,
        "home_pts_avg":          home_b["pts_avg"],
        "away_pts_avg":          away_b["pts_avg"],
        "home_pts_allowed_avg":  home_b["pts_allowed_avg"],
        "away_pts_allowed_avg":  away_b["pts_allowed_avg"],
        "home_fg_pct_avg":       home_b["fg_pct_avg"],
        "away_fg_pct_avg":       away_b["fg_pct_avg"],
        "home_fg3_pct_avg":      home_b["fg3_pct_avg"],
        "away_fg3_pct_avg":      away_b["fg3_pct_avg"],
        "home_ft_pct_avg":       home_b["ft_pct_avg"],
        "away_ft_pct_avg":       away_b["ft_pct_avg"],
        "home_reb_avg":          home_b["reb_avg"],
        "away_reb_avg":          away_b["reb_avg"],
        "home_ast_avg":          home_b["ast_avg"],
        "away_ast_avg":          away_b["ast_avg"],
        "home_tov_avg":          home_b["tov_avg"],
        "away_tov_avg":          away_b["tov_avg"],
        "home_stl_avg":          home_b["stl_avg"],
        "away_stl_avg":          away_b["stl_avg"],
        "home_blk_avg":          home_b["blk_avg"],
        "away_blk_avg":          away_b["blk_avg"],
    }

    vector = [raw[f] for f in FEATURE_NAMES]
    return vector, raw
