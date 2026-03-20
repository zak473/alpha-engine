"""
Compute baseball park factors from historical CoreMatch data.

Park Factor (PF) measures how much a ballpark inflates or deflates run scoring.
PF > 1.0 = hitter's park (e.g. Coors Field), PF < 1.0 = pitcher's park.

Formula:
    PF_team = avg_total_runs_at_home / avg_total_runs_in_all_games

This is the single-season raw park factor. We average across all seasons
for a stable estimate.

Used by the baseball ELO backfill to normalise MoV:
    adjusted_margin = margin / park_factor

So a 5-run win at a hitter's park (PF=1.3) ≈ 3.8-run win at a neutral park.

Usage:
    from pipelines.baseball.compute_park_factors import load_park_factors
    pf = load_park_factors(session)   # {team_id: float}
"""

from __future__ import annotations

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch

log = logging.getLogger(__name__)


def load_park_factors(session: Session, min_games: int = 20) -> dict[str, float]:
    """
    Compute park factors for all baseball home teams.

    Returns dict mapping team_id → park_factor.
    Teams with < min_games home games return 1.0 (neutral).
    """
    matches = (
        session.query(CoreMatch)
        .filter(
            CoreMatch.sport == "baseball",
            CoreMatch.status == "finished",
            CoreMatch.home_score.isnot(None),
            CoreMatch.away_score.isnot(None),
        )
        .all()
    )

    if not matches:
        return {}

    # League-wide average total runs per game
    total_runs_sum = sum((m.home_score or 0) + (m.away_score or 0) for m in matches)
    league_avg_runs = total_runs_sum / len(matches) if matches else 9.0

    # Home totals per team
    home_runs_by_team: dict[str, list[float]] = defaultdict(list)
    for m in matches:
        total = (m.home_score or 0) + (m.away_score or 0)
        home_runs_by_team[m.home_team_id].append(total)

    park_factors: dict[str, float] = {}
    for team_id, home_totals in home_runs_by_team.items():
        if len(home_totals) < min_games:
            park_factors[team_id] = 1.0
            continue
        avg_home = sum(home_totals) / len(home_totals)
        pf = avg_home / league_avg_runs if league_avg_runs > 0 else 1.0
        # Clamp to sane range (0.7 to 1.5 covers all known MLB parks)
        park_factors[team_id] = max(0.7, min(1.5, pf))

    log.info(
        "Computed park factors for %d teams (league avg %.2f runs/game).",
        len(park_factors), league_avg_runs,
    )

    # Log extremes for debugging
    sorted_pf = sorted(park_factors.items(), key=lambda x: x[1], reverse=True)
    for team_id, pf in sorted_pf[:3]:
        log.debug("  Hitter's park: %s  PF=%.3f", team_id, pf)
    for team_id, pf in sorted_pf[-3:]:
        log.debug("  Pitcher's park: %s  PF=%.3f", team_id, pf)

    return park_factors
