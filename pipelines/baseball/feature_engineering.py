"""
Baseball-specific feature engineering.

Extends the common base features (ELO, form, rest, H2H) with rolling
baseball stats computed from BaseballTeamMatchStats.

Features computed here use only data available BEFORE kickoff (no leakage).
Missing values return 0.0 (safe for tree models and logistic regression).
"""

from __future__ import annotations

from datetime import timezone
from typing import Optional

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch
from db.models.baseball import BaseballTeamMatchStats
from pipelines.baseball.compute_park_factors import load_park_factors
from pipelines.common.feature_engineering import (
    _get_elo_before,
    _last_n_matches,
    _form_points,
    _win_pct,
    _days_rest,
    _h2h,
)

# ---------------------------------------------------------------------------
# Feature metadata
# ---------------------------------------------------------------------------

FEATURE_NAMES = [
    # Base
    "elo_home", "elo_away", "elo_diff",
    "home_form_pts", "away_form_pts",
    "home_win_pct_5", "away_win_pct_5",
    "home_days_rest", "away_days_rest", "rest_diff",
    "h2h_home_win_pct", "h2h_matches_played",
    "is_home_advantage",
    # Park factor (venue scoring inflation — hitter vs pitcher's park)
    "home_park_factor",
    # Baseball rolling averages (last 10 games)
    "home_runs_avg", "away_runs_avg",
    "home_runs_allowed_avg", "away_runs_allowed_avg",
    "home_run_diff_avg", "away_run_diff_avg",   # run differential
    "home_hits_avg", "away_hits_avg",
    "home_era_avg", "away_era_avg",
    "home_whip_avg", "away_whip_avg",
    "home_ops_avg", "away_ops_avg",
    "home_obp_avg", "away_obp_avg",             # on-base percentage
    "home_slg_avg", "away_slg_avg",             # slugging percentage
    "home_ba_avg", "away_ba_avg",               # batting average
    # Pitching quality
    "home_k_avg", "away_k_avg",                 # strikeouts pitched (dominance)
    "home_bb_avg", "away_bb_avg",               # walks allowed (control)
    "home_k_bb_avg", "away_k_bb_avg",           # K/BB ratio (best single pitcher metric)
    # Offensive power
    "home_hr_avg", "away_hr_avg",               # home runs (power)
    "home_lob_avg", "away_lob_avg",             # left on base (clutch hitting / missed opportunities)
    # Probable starter ERA (last 5 starts) — 0.0 when unknown
    "home_starter_era", "away_starter_era",
]

OUTCOME_LABELS = {"home_win": 0, "away_win": 1, "H": 0, "A": 1}
LABEL_OUTCOMES = {0: "home_win", 1: "away_win"}

_SPORT = "baseball"


# ---------------------------------------------------------------------------
# Baseball rolling stats helper
# ---------------------------------------------------------------------------

def _rolling_baseball_stats(
    db: Session,
    team_id: str,
    kickoff,
    n: int = 10,
) -> dict:
    """
    Compute rolling averages over the last n finished baseball CoreMatch rows
    for this team before kickoff.

    Returns a dict with keys:
        runs_avg, runs_allowed_avg, run_diff_avg, hits_avg, era_avg, whip_avg,
        ops_avg, obp_avg, slg_avg, ba_avg, k_avg, bb_avg, k_bb_avg, hr_avg, lob_avg

    runs_allowed_avg is derived from the OPPONENT's BaseballTeamMatchStats.runs
    for those same match_ids.

    All values default to 0.0 when data is unavailable.
    """
    # Fetch last n finished matches for this team
    matches = _last_n_matches(db, team_id, kickoff, _SPORT, n=n)
    if not matches:
        return {
            "runs_avg": 0.0,
            "runs_allowed_avg": 0.0,
            "run_diff_avg": 0.0,
            "hits_avg": 0.0,
            "era_avg": 0.0,
            "whip_avg": 0.0,
            "ops_avg": 0.0,
            "obp_avg": 0.0,
            "slg_avg": 0.0,
            "ba_avg": 0.0,
            "k_avg": 0.0,
            "bb_avg": 0.0,
            "k_bb_avg": 0.0,
            "hr_avg": 0.0,
            "lob_avg": 0.0,
        }

    match_ids = [m.id for m in matches]

    # Fetch this team's stats rows for those matches
    team_stats: list[BaseballTeamMatchStats] = (
        db.query(BaseballTeamMatchStats)
        .filter(
            BaseballTeamMatchStats.match_id.in_(match_ids),
            BaseballTeamMatchStats.team_id == team_id,
        )
        .all()
    )

    # Fetch opponent stats for the same match_ids (different team_id)
    # Used to derive runs_allowed (opponent's runs scored against this team)
    opp_stats: list[BaseballTeamMatchStats] = (
        db.query(BaseballTeamMatchStats)
        .filter(
            BaseballTeamMatchStats.match_id.in_(match_ids),
            BaseballTeamMatchStats.team_id != team_id,
        )
        .all()
    )
    opp_runs_by_match: dict[str, int] = {
        s.match_id: s.runs for s in opp_stats if s.runs is not None
    }

    def _avg(values: list[float]) -> float:
        valid = [v for v in values if v is not None]
        return float(sum(valid) / len(valid)) if valid else 0.0

    runs_vals = [s.runs for s in team_stats]
    hits_vals = [s.hits for s in team_stats]
    era_vals  = [s.era  for s in team_stats]
    whip_vals = [s.whip for s in team_stats]
    ops_vals  = [s.ops  for s in team_stats]
    obp_vals  = [s.obp  for s in team_stats]
    slg_vals  = [s.slg  for s in team_stats]
    ba_vals   = [s.batting_avg for s in team_stats]
    k_vals    = [s.strikeouts_pitching for s in team_stats]
    bb_vals   = [s.walks_allowed for s in team_stats]
    hr_vals   = [s.home_runs for s in team_stats]
    lob_vals  = [s.left_on_base for s in team_stats]

    runs_allowed_vals = [
        opp_runs_by_match.get(s.match_id)
        for s in team_stats
    ]

    k_avg  = _avg(k_vals)
    bb_avg = _avg(bb_vals)
    k_bb_avg = round(k_avg / bb_avg, 3) if bb_avg > 0 else 0.0

    runs_avg         = _avg(runs_vals)
    runs_allowed_avg = _avg(runs_allowed_vals)

    return {
        "runs_avg":         runs_avg,
        "runs_allowed_avg": runs_allowed_avg,
        "run_diff_avg":     runs_avg - runs_allowed_avg,
        "hits_avg":         _avg(hits_vals),
        "era_avg":          _avg(era_vals),
        "whip_avg":         _avg(whip_vals),
        "ops_avg":          _avg(ops_vals),
        "obp_avg":          _avg(obp_vals),
        "slg_avg":          _avg(slg_vals),
        "ba_avg":           _avg(ba_vals),
        "k_avg":            k_avg,
        "bb_avg":           bb_avg,
        "k_bb_avg":         k_bb_avg,
        "hr_avg":           _avg(hr_vals),
        "lob_avg":          _avg(lob_vals),
    }


# ---------------------------------------------------------------------------
# Probable starter ERA helper
# ---------------------------------------------------------------------------

def _starter_era(db: Session, match: CoreMatch, side: str) -> float:
    """
    Return ERA from extras_json.probable_pitcher_{side}.era_last_5 if available.

    Falls back to 0.0 (neutral) when no pitcher data is stored.
    """
    extras = match.extras_json or {}
    data = extras.get(f"probable_pitcher_{side}")
    if not data or not isinstance(data, dict):
        return 0.0
    era = data.get("era_last_5")
    return float(era) if era is not None else 0.0


# ---------------------------------------------------------------------------
# Main feature builder
# ---------------------------------------------------------------------------

def build_feature_vector(
    db: Session,
    match: CoreMatch,
) -> tuple[list[float], dict]:
    """
    Compute feature vector for a baseball match.
    Returns (vector, raw_dict) — both ordered to match FEATURE_NAMES.
    """
    kickoff = match.kickoff_utc
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)

    home_id = match.home_team_id
    away_id = match.away_team_id

    # --- Base features ---
    elo_home = _get_elo_before(db, home_id, kickoff)
    elo_away = _get_elo_before(db, away_id, kickoff)
    elo_diff = elo_home - elo_away

    home_matches = _last_n_matches(db, home_id, kickoff, _SPORT)
    away_matches = _last_n_matches(db, away_id, kickoff, _SPORT)

    home_form_pts  = _form_points(home_matches, home_id)
    away_form_pts  = _form_points(away_matches, away_id)
    home_win_pct_5 = _win_pct(home_matches, home_id)
    away_win_pct_5 = _win_pct(away_matches, away_id)

    home_days_rest = _days_rest(db, home_id, kickoff, _SPORT)
    away_days_rest = _days_rest(db, away_id, kickoff, _SPORT)
    rest_diff      = home_days_rest - away_days_rest

    h2h_win_pct, h2h_n = _h2h(db, home_id, away_id, kickoff, _SPORT)

    # --- Park factor for this venue ---
    park_factors = load_park_factors(db)
    home_park_factor = park_factors.get(home_id, 1.0)

    # --- Baseball-specific rolling stats ---
    home_bb = _rolling_baseball_stats(db, home_id, kickoff)
    away_bb = _rolling_baseball_stats(db, away_id, kickoff)

    # --- Probable starter ERA (0.0 when not available) ---
    home_starter_era = _starter_era(db, match, "home")
    away_starter_era = _starter_era(db, match, "away")

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
        "h2h_matches_played":    h2h_n,
        "is_home_advantage":     1.0,
        "home_park_factor":      home_park_factor,
        # Rolling batting / pitching averages
        "home_runs_avg":         home_bb["runs_avg"],
        "away_runs_avg":         away_bb["runs_avg"],
        "home_runs_allowed_avg": home_bb["runs_allowed_avg"],
        "away_runs_allowed_avg": away_bb["runs_allowed_avg"],
        "home_run_diff_avg":     home_bb["run_diff_avg"],
        "away_run_diff_avg":     away_bb["run_diff_avg"],
        "home_hits_avg":         home_bb["hits_avg"],
        "away_hits_avg":         away_bb["hits_avg"],
        "home_era_avg":          home_bb["era_avg"],
        "away_era_avg":          away_bb["era_avg"],
        "home_whip_avg":         home_bb["whip_avg"],
        "away_whip_avg":         away_bb["whip_avg"],
        "home_ops_avg":          home_bb["ops_avg"],
        "away_ops_avg":          away_bb["ops_avg"],
        "home_obp_avg":          home_bb["obp_avg"],
        "away_obp_avg":          away_bb["obp_avg"],
        "home_slg_avg":          home_bb["slg_avg"],
        "away_slg_avg":          away_bb["slg_avg"],
        "home_ba_avg":           home_bb["ba_avg"],
        "away_ba_avg":           away_bb["ba_avg"],
        # Pitching quality
        "home_k_avg":            home_bb["k_avg"],
        "away_k_avg":            away_bb["k_avg"],
        "home_bb_avg":           home_bb["bb_avg"],
        "away_bb_avg":           away_bb["bb_avg"],
        "home_k_bb_avg":         home_bb["k_bb_avg"],
        "away_k_bb_avg":         away_bb["k_bb_avg"],
        # Offensive power
        "home_hr_avg":           home_bb["hr_avg"],
        "away_hr_avg":           away_bb["hr_avg"],
        "home_lob_avg":          home_bb["lob_avg"],
        "away_lob_avg":          away_bb["lob_avg"],
        # Probable starter ERA
        "home_starter_era":      home_starter_era,
        "away_starter_era":      away_starter_era,
    }

    vector = [raw[f] for f in FEATURE_NAMES]
    return vector, raw
