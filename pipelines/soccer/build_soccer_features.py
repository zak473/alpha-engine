"""
Feature engineering pipeline for soccer match prediction.

Reads from:
    core_matches, core_team_match_stats, rating_elo_team

Writes to:
    feat_soccer_match  (one row per match, upserted)

Features computed using only data available BEFORE kickoff (no leakage).
Run after backfill_elo.py and after match stats are ingested.

Usage:
    python -m pipelines.soccer.build_soccer_features
    python -m pipelines.soccer.build_soccer_features --match-id <uuid>
"""

from __future__ import annotations

import argparse
import logging
from datetime import timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models.mvp import (
    CoreMatch, CoreTeamMatchStats, FeatSoccerMatch, RatingEloTeam,
)
from db.session import SessionLocal

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

FORM_WINDOW = 5   # number of prior matches for rolling averages

# Normalise outcome codes — DB may store "H"/"D"/"A" or "home_win"/"draw"/"away_win"
_NORM_OUTCOME = {
    "H": "home_win", "D": "draw", "A": "away_win",
    "home_win": "home_win", "draw": "draw", "away_win": "away_win",
}
_FLIP_OUTCOME = {"home_win": "away_win", "away_win": "home_win", "draw": "draw"}


# ---------------------------------------------------------------------------
# Feature helpers
# ---------------------------------------------------------------------------

def _get_elo(session: Session, team_id: str, before_kickoff) -> Optional[float]:
    """Return the most recent ELO rating for team_id strictly before kickoff."""
    row = (
        session.query(RatingEloTeam)
        .filter(
            RatingEloTeam.team_id == team_id,
            RatingEloTeam.rated_at < before_kickoff,
        )
        .order_by(RatingEloTeam.rated_at.desc())
        .first()
    )
    return row.rating_after if row else None


def _get_team_form(session: Session, team_id: str, before_kickoff) -> dict:
    """
    Return rolling stats for team_id over last FORM_WINDOW matches before kickoff.
    Returns dict with: pts, w, d, l, gf_avg, ga_avg, xg_avg, xga_avg, last_kickoff
    """
    # Get last N finished matches involving this team
    recent_matches = (
        session.query(CoreMatch)
        .filter(
            CoreMatch.status == "finished",
            CoreMatch.kickoff_utc < before_kickoff,
            (CoreMatch.home_team_id == team_id) | (CoreMatch.away_team_id == team_id),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(FORM_WINDOW)
        .all()
    )

    if not recent_matches:
        return dict(pts=None, w=None, d=None, l=None, gf_avg=None, ga_avg=None,
                    xg_avg=None, xga_avg=None, last_kickoff=None)

    pts = w = d = l = 0
    gf_list, ga_list, xg_list, xga_list = [], [], [], []
    last_kickoff = None

    for m in recent_matches:
        is_home = (m.home_team_id == team_id)
        if last_kickoff is None:
            last_kickoff = m.kickoff_utc

        # Goals from match record
        if is_home:
            gf = m.home_score
            ga = m.away_score
            outcome = _NORM_OUTCOME.get(m.outcome or "", None)
        else:
            gf = m.away_score
            ga = m.home_score
            outcome = _FLIP_OUTCOME.get(_NORM_OUTCOME.get(m.outcome or "", ""), None)

        if gf is not None:
            gf_list.append(gf)
        if ga is not None:
            ga_list.append(ga)

        if outcome == "home_win":
            pts += 3; w += 1
        elif outcome == "draw":
            pts += 1; d += 1
        elif outcome == "away_win":
            l += 1

        # xG from stats table
        stats = (
            session.query(CoreTeamMatchStats)
            .filter_by(match_id=m.id, team_id=team_id)
            .first()
        )
        if stats:
            if stats.xg is not None:
                xg_list.append(stats.xg)
            if stats.xga is not None:
                xga_list.append(stats.xga)

    return dict(
        pts=float(pts),
        w=w, d=d, l=l,
        gf_avg=sum(gf_list) / len(gf_list) if gf_list else None,
        ga_avg=sum(ga_list) / len(ga_list) if ga_list else None,
        xg_avg=sum(xg_list) / len(xg_list) if xg_list else None,
        xga_avg=sum(xga_list) / len(xga_list) if xga_list else None,
        last_kickoff=last_kickoff,
    )


def _days_rest(kickoff, last_match_kickoff) -> Optional[float]:
    if last_match_kickoff is None:
        return None

    ko = kickoff
    lm = last_match_kickoff

    # Normalise timezones
    if ko.tzinfo is not None and lm.tzinfo is None:
        lm = lm.replace(tzinfo=timezone.utc)
    elif ko.tzinfo is None and lm.tzinfo is not None:
        ko = ko.replace(tzinfo=timezone.utc)

    delta = (ko - lm).total_seconds() / 86400.0
    return max(0.0, delta)


def _get_h2h(session: Session, home_team_id: str, away_team_id: str, before_kickoff) -> dict:
    """Head-to-head win percentage for the home team across all prior meetings."""
    h2h = (
        session.query(CoreMatch)
        .filter(
            CoreMatch.status == "finished",
            CoreMatch.kickoff_utc < before_kickoff,
            (
                (CoreMatch.home_team_id == home_team_id) & (CoreMatch.away_team_id == away_team_id)
                | (CoreMatch.home_team_id == away_team_id) & (CoreMatch.away_team_id == home_team_id)
            ),
        )
        .all()
    )

    if not h2h:
        return dict(home_win_pct=None, matches_played=0)

    wins = 0
    for m in h2h:
        norm = _NORM_OUTCOME.get(m.outcome or "", None)
        if m.home_team_id == home_team_id and norm == "home_win":
            wins += 1
        elif m.away_team_id == home_team_id and norm == "away_win":
            wins += 1

    return dict(
        home_win_pct=wins / len(h2h),
        matches_played=len(h2h),
    )


# ---------------------------------------------------------------------------
# Main feature computation
# ---------------------------------------------------------------------------

def build_features_for_match(session: Session, match: CoreMatch) -> None:
    """Compute and upsert feature row for a single match."""
    kickoff = match.kickoff_utc
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)

    elo_home = _get_elo(session, match.home_team_id, kickoff)
    elo_away = _get_elo(session, match.away_team_id, kickoff)
    elo_diff = (elo_home - elo_away) if (elo_home is not None and elo_away is not None) else None

    home_form = _get_team_form(session, match.home_team_id, kickoff)
    away_form = _get_team_form(session, match.away_team_id, kickoff)

    home_rest = _days_rest(kickoff, home_form["last_kickoff"])
    away_rest = _days_rest(kickoff, away_form["last_kickoff"])
    rest_diff = (home_rest - away_rest) if (home_rest is not None and away_rest is not None) else None

    h2h = _get_h2h(session, match.home_team_id, match.away_team_id, kickoff)

    # Target (filled only for finished matches) — normalise H/D/A → home_win/draw/away_win
    outcome = _NORM_OUTCOME.get(match.outcome or "", None)
    target_map = {"home_win": 1.0, "draw": 0.5, "away_win": 0.0}
    target = target_map.get(outcome) if outcome else None

    # Upsert
    feat = session.query(FeatSoccerMatch).filter_by(match_id=match.id).first()
    data = dict(
        elo_home=elo_home,
        elo_away=elo_away,
        elo_diff=elo_diff,
        home_form_pts=home_form["pts"],
        away_form_pts=away_form["pts"],
        home_form_w=home_form["w"],
        home_form_d=home_form["d"],
        home_form_l=home_form["l"],
        away_form_w=away_form["w"],
        away_form_d=away_form["d"],
        away_form_l=away_form["l"],
        home_gf_avg=home_form["gf_avg"],
        home_ga_avg=home_form["ga_avg"],
        away_gf_avg=away_form["gf_avg"],
        away_ga_avg=away_form["ga_avg"],
        home_xg_avg=home_form["xg_avg"],
        home_xga_avg=home_form["xga_avg"],
        away_xg_avg=away_form["xg_avg"],
        away_xga_avg=away_form["xga_avg"],
        home_days_rest=home_rest,
        away_days_rest=away_rest,
        rest_diff=rest_diff,
        h2h_home_win_pct=h2h["home_win_pct"],
        h2h_matches_played=h2h["matches_played"],
        is_home_advantage=1,
        outcome=outcome,
        target=target,
    )

    if feat is None:
        feat = FeatSoccerMatch(match_id=match.id, **data)
        session.add(feat)
        log.debug("  [+] feat  %s", match.id[:8])
    else:
        for k, v in data.items():
            setattr(feat, k, v)
        log.debug("  [~] feat  %s  updated", match.id[:8])


def run(match_id: Optional[str] = None) -> int:
    """Build features for all matches (or a single one). Returns count."""
    session: Session = SessionLocal()
    count = 0
    try:
        if match_id:
            matches = session.query(CoreMatch).filter(CoreMatch.id == match_id).all()
        else:
            matches = session.query(CoreMatch).order_by(CoreMatch.kickoff_utc.asc()).all()

        log.info("Building features for %d matches...", len(matches))
        for match in matches:
            build_features_for_match(session, match)
            count += 1

        session.commit()
        log.info("Feature pipeline complete. %d rows upserted.", count)
    except Exception:
        session.rollback()
        log.exception("Feature pipeline failed — rolled back")
        raise
    finally:
        session.close()

    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Build feat_soccer_match rows from core tables")
    parser.add_argument("--match-id", help="Build features for a single match UUID")
    args = parser.parse_args()
    run(match_id=args.match_id)


if __name__ == "__main__":
    main()
