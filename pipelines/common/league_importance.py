"""
Maps CoreLeague names to competition importance multipliers for ELO backfills.

Each sport engine defines a COMPETITION_IMPORTANCE dict whose keys are slugs
like "champions_league", "nba_playoffs", etc. This module normalises those
slugs into searchable keywords and matches them against the free-text league
names stored in core_leagues.

Usage:
    from pipelines.common.league_importance import build_league_importance_map
    from ratings.soccer_elo import COMPETITION_IMPORTANCE

    league_map = build_league_importance_map(session, sport="soccer",
                                             importance_map=COMPETITION_IMPORTANCE)
    # league_map: {league_id: float}

    importance = league_map.get(match.league_id, 1.0)
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from db.models.mvp import CoreLeague


def infer_importance(
    league_name: str | None,
    importance_map: dict[str, float],
    default: float = 1.0,
) -> float:
    """
    Match a league name string against an importance_map using substring search.

    Keys in importance_map are slugs like "nba_playoffs" — normalised to
    "nba playoffs" for matching. Longer keys are tested first so that
    "nba_playoffs" (score 1.5) wins over "nba" (score 1.0).

    Returns the multiplier of the first matching key, or `default`.
    """
    if not league_name:
        return default

    name_lower = league_name.lower()

    # Sort longest slug first so more-specific keys beat generic ones
    sorted_keys = sorted(importance_map.keys(), key=len, reverse=True)

    for key in sorted_keys:
        keyword = key.replace("_", " ")
        if keyword in name_lower:
            return importance_map[key]

    return default


def build_league_importance_map(
    session: Session,
    sport: str,
    importance_map: dict[str, float],
    default: float = 1.0,
) -> dict[str, float]:
    """
    Preload all CoreLeague rows for a sport and return a {league_id: multiplier} dict.

    Call this once before the per-match loop, then look up each match.league_id.
    """
    leagues: list[CoreLeague] = (
        session.query(CoreLeague)
        .filter(CoreLeague.sport == sport)
        .all()
    )
    result: dict[str, float] = {}
    for lg in leagues:
        mult = infer_importance(lg.name, importance_map, default)
        result[lg.id] = mult
    return result
