"""
Hockey-specific feature engineering.

Extends the shared feature_engineering module with rolling stats computed
from HockeyTeamMatchStats. All features are leak-free (only data
available strictly before kickoff is used).

Features:
  Base 13 (ELO + form + H2H + rest)  — from shared module helpers
  Hockey rolling averages (last 10 games):
    goals_avg, goals_allowed_avg, shots_avg, save_pct_avg,
    pp_pct_avg, faceoff_pct_avg, hits_avg, pim_avg
"""

from __future__ import annotations

from datetime import timezone

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch
from db.models.hockey import HockeyTeamMatchStats
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
    # Hockey rolling averages (last 10 games)
    "home_goals_avg", "away_goals_avg",
    "home_goals_allowed_avg", "away_goals_allowed_avg",
    "home_shots_avg", "away_shots_avg",
    "home_save_pct_avg", "away_save_pct_avg",
    "home_pp_pct_avg", "away_pp_pct_avg",
    "home_faceoff_pct_avg", "away_faceoff_pct_avg",
    "home_hits_avg", "away_hits_avg",
    "home_pim_avg", "away_pim_avg",
]

OUTCOME_LABELS = {"home_win": 0, "away_win": 1, "H": 0, "A": 1}
LABEL_OUTCOMES = {0: "home_win", 1: "away_win"}


def _rolling_hockey_stats(db: Session, team_id: str, kickoff, n: int = 10) -> dict:
    from sqlalchemy import or_

    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "hockey",
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
        "goals_avg": 0.0, "goals_allowed_avg": 0.0,
        "shots_avg": 0.0, "save_pct_avg": 0.0,
        "pp_pct_avg": 0.0, "faceoff_pct_avg": 0.0,
        "hits_avg": 0.0, "pim_avg": 0.0,
    }
    if not matches:
        return empty

    goals_list = []
    goals_allowed_list = []
    shots_list = []
    save_pct_list = []
    pp_pct_list = []
    faceoff_pct_list = []
    hits_list = []
    pim_list = []

    for match in matches:
        own = (
            db.query(HockeyTeamMatchStats)
            .filter_by(match_id=match.id, team_id=team_id)
            .first()
        )
        opp = (
            db.query(HockeyTeamMatchStats)
            .filter(
                HockeyTeamMatchStats.match_id == match.id,
                HockeyTeamMatchStats.team_id != team_id,
            )
            .first()
        )

        if own:
            if own.goals is not None:        goals_list.append(float(own.goals))
            if own.shots_on_goal is not None: shots_list.append(float(own.shots_on_goal))
            if own.save_pct is not None:      save_pct_list.append(float(own.save_pct))
            if own.power_play_pct is not None: pp_pct_list.append(float(own.power_play_pct))
            if own.faceoff_pct is not None:   faceoff_pct_list.append(float(own.faceoff_pct))
            if own.hits is not None:          hits_list.append(float(own.hits))
            if own.penalty_minutes is not None: pim_list.append(float(own.penalty_minutes))

        if opp and opp.goals is not None:
            goals_allowed_list.append(float(opp.goals))

    def _avg(lst):
        return float(sum(lst) / len(lst)) if lst else 0.0

    return {
        "goals_avg":         _avg(goals_list),
        "goals_allowed_avg": _avg(goals_allowed_list),
        "shots_avg":         _avg(shots_list),
        "save_pct_avg":      _avg(save_pct_list),
        "pp_pct_avg":        _avg(pp_pct_list),
        "faceoff_pct_avg":   _avg(faceoff_pct_list),
        "hits_avg":          _avg(hits_list),
        "pim_avg":           _avg(pim_list),
    }


def build_feature_vector(db: Session, match: CoreMatch) -> tuple[list[float], dict]:
    sport = "hockey"
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

    home_h = _rolling_hockey_stats(db, home_id, kickoff)
    away_h = _rolling_hockey_stats(db, away_id, kickoff)

    raw = {
        "elo_home":               elo_home,
        "elo_away":               elo_away,
        "elo_diff":               elo_diff,
        "home_form_pts":          home_form_pts,
        "away_form_pts":          away_form_pts,
        "home_win_pct_5":         home_win_pct_5,
        "away_win_pct_5":         away_win_pct_5,
        "home_days_rest":         home_days_rest,
        "away_days_rest":         away_days_rest,
        "rest_diff":              rest_diff,
        "h2h_home_win_pct":       h2h_win_pct,
        "h2h_matches_played":     h2h_n,
        "is_home_advantage":      1.0,
        "home_goals_avg":         home_h["goals_avg"],
        "away_goals_avg":         away_h["goals_avg"],
        "home_goals_allowed_avg": home_h["goals_allowed_avg"],
        "away_goals_allowed_avg": away_h["goals_allowed_avg"],
        "home_shots_avg":         home_h["shots_avg"],
        "away_shots_avg":         away_h["shots_avg"],
        "home_save_pct_avg":      home_h["save_pct_avg"],
        "away_save_pct_avg":      away_h["save_pct_avg"],
        "home_pp_pct_avg":        home_h["pp_pct_avg"],
        "away_pp_pct_avg":        away_h["pp_pct_avg"],
        "home_faceoff_pct_avg":   home_h["faceoff_pct_avg"],
        "away_faceoff_pct_avg":   away_h["faceoff_pct_avg"],
        "home_hits_avg":          home_h["hits_avg"],
        "away_hits_avg":          away_h["hits_avg"],
        "home_pim_avg":           home_h["pim_avg"],
        "away_pim_avg":           away_h["pim_avg"],
    }

    vector = [raw[f] for f in FEATURE_NAMES]
    return vector, raw
