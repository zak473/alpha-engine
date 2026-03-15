"""
Fetch basketball team box score stats from Highlightly and upsert into
basketball_team_match_stats.

Reads the extras_json already stored on CoreMatch (populated by the
Highlightly fetch pipeline), then falls back to calling the Highlightly
statistics endpoint for older matches that don't have extras yet.

Usage:
    python -m pipelines.basketball.fetch_stats
    python -m pipelines.basketball.fetch_stats --days-back 30
    python -m pipelines.basketball.fetch_stats --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from db.session import SessionLocal

log = logging.getLogger(__name__)

_SPORT = "basketball"


# ── Statistics response parsing ───────────────────────────────────────────────

def _int(v: Any) -> Optional[int]:
    try:
        return int(v) if v is not None else None
    except (ValueError, TypeError):
        return None


def _float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        f = float(str(v).replace("%", ""))
        # Percentages stored as 0-100 → convert to 0-1
        return round(f / 100.0, 4) if f > 1.0 else round(f, 4)
    except (ValueError, TypeError):
        return None


def _get(d: dict, *keys: str) -> Any:
    """Try multiple field name variants, return first found value."""
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def _parse_team_stats(stat_obj: dict) -> dict:
    """
    Parse one team's statistics from a Highlightly basketball statistics response.
    Handles multiple response shapes:
      Shape A: {"statistics": {"points": 112, "fieldGoals": {"made": 42, ...}, ...}}
      Shape B: {"statistics": [{"type": "points", "value": 112}, ...]}
      Shape C: {"points": 112, "fieldGoalsMade": 42, ...}
    """
    stats: dict = {}

    raw = stat_obj.get("statistics") or stat_obj

    # Flatten list-of-type-value into dict
    if isinstance(raw, list):
        flat: dict = {}
        for item in raw:
            if isinstance(item, dict):
                t = str(item.get("type") or item.get("name") or "").lower().replace(" ", "_")
                v = item.get("value")
                if t and v is not None:
                    flat[t] = v
        raw = flat

    if not isinstance(raw, dict):
        return stats

    # Points
    stats["points"] = _int(_get(raw, "points", "totalPoints"))

    # Quarter scores
    quarters = raw.get("periods") or raw.get("quarters") or {}
    if isinstance(quarters, list):
        for q in quarters:
            n = _int(_get(q, "period", "quarter", "number"))
            v = _int(_get(q, "points", "score", "value"))
            if n and v is not None and 1 <= n <= 4:
                stats[f"points_q{n}"] = v
            elif n == 5:
                stats["points_ot"] = v
    elif isinstance(quarters, dict):
        stats["points_q1"] = _int(_get(quarters, "q1", "quarter1", "1"))
        stats["points_q2"] = _int(_get(quarters, "q2", "quarter2", "2"))
        stats["points_q3"] = _int(_get(quarters, "q3", "quarter3", "3"))
        stats["points_q4"] = _int(_get(quarters, "q4", "quarter4", "4"))
        stats["points_ot"] = _int(_get(quarters, "ot", "overtime", "5"))

    # Field goals
    fg = raw.get("fieldGoals") or raw.get("field_goals") or {}
    if isinstance(fg, dict):
        stats["fg_made"]      = _int(_get(fg, "made", "fieldGoalsMade"))
        stats["fg_attempted"] = _int(_get(fg, "attempted", "fieldGoalsAttempted"))
        stats["fg_pct"]       = _float(_get(fg, "percentage", "pct", "fieldGoalPercentage"))
    else:
        stats["fg_made"]      = _int(_get(raw, "fieldGoalsMade", "fgm", "fg_made"))
        stats["fg_attempted"] = _int(_get(raw, "fieldGoalsAttempted", "fga", "fg_attempted"))
        stats["fg_pct"]       = _float(_get(raw, "fieldGoalPercentage", "fg_pct", "fgPct"))

    # Three pointers
    tp = raw.get("threePointers") or raw.get("three_pointers") or raw.get("threePoint") or {}
    if isinstance(tp, dict):
        stats["fg3_made"]      = _int(_get(tp, "made", "threePointersMade"))
        stats["fg3_attempted"] = _int(_get(tp, "attempted", "threePoinersAttempted"))
        stats["fg3_pct"]       = _float(_get(tp, "percentage", "pct"))
    else:
        stats["fg3_made"]      = _int(_get(raw, "threePointersMade", "tpm", "fg3_made", "threePtMade"))
        stats["fg3_attempted"] = _int(_get(raw, "threePointersAttempted", "tpa", "fg3_attempted"))
        stats["fg3_pct"]       = _float(_get(raw, "threePointPercentage", "fg3_pct", "threePtPct"))

    # Free throws
    ft = raw.get("freeThrows") or raw.get("free_throws") or {}
    if isinstance(ft, dict):
        stats["ft_made"]      = _int(_get(ft, "made", "freeThrowsMade"))
        stats["ft_attempted"] = _int(_get(ft, "attempted", "freeThrowsAttempted"))
        stats["ft_pct"]       = _float(_get(ft, "percentage", "pct"))
    else:
        stats["ft_made"]      = _int(_get(raw, "freeThrowsMade", "ftm", "ft_made"))
        stats["ft_attempted"] = _int(_get(raw, "freeThrowsAttempted", "fta", "ft_attempted"))
        stats["ft_pct"]       = _float(_get(raw, "freeThrowPercentage", "ft_pct", "ftPct"))

    # Rebounds
    reb = raw.get("rebounds") or {}
    if isinstance(reb, dict):
        stats["rebounds_total"]     = _int(_get(reb, "total", "totalRebounds"))
        stats["rebounds_offensive"] = _int(_get(reb, "offensive", "offensiveRebounds"))
        stats["rebounds_defensive"] = _int(_get(reb, "defensive", "defensiveRebounds"))
    else:
        stats["rebounds_total"]     = _int(_get(raw, "rebounds", "totalRebounds", "reb"))
        stats["rebounds_offensive"] = _int(_get(raw, "offensiveRebounds", "oreb", "reboundsOffensive"))
        stats["rebounds_defensive"] = _int(_get(raw, "defensiveRebounds", "dreb", "reboundsDefensive"))

    # Playmaking / Defence
    stats["assists"]   = _int(_get(raw, "assists", "ast"))
    stats["turnovers"] = _int(_get(raw, "turnovers", "tov", "to"))
    stats["steals"]    = _int(_get(raw, "steals", "stl"))
    stats["blocks"]    = _int(_get(raw, "blocks", "blk"))
    stats["fouls"]     = _int(_get(raw, "fouls", "personalFouls", "pf"))
    stats["plus_minus"] = _int(_get(raw, "plusMinus", "plus_minus", "+/-"))

    # Assists-to-turnover ratio
    if stats.get("assists") and stats.get("turnovers") and stats["turnovers"] > 0:
        stats["assists_to_turnover"] = round(stats["assists"] / stats["turnovers"], 2)

    # Advanced (may not be present in all responses)
    stats["pace"]             = _float(_get(raw, "pace"))
    stats["offensive_rating"] = _float(_get(raw, "offensiveRating", "ortg", "offensive_rating"))
    stats["defensive_rating"] = _float(_get(raw, "defensiveRating", "drtg", "defensive_rating"))
    stats["net_rating"]       = _float(_get(raw, "netRating", "nrtg", "net_rating"))

    return stats


def _parse_statistics_response(data: Any, home_team_id: str, away_team_id: str) -> tuple[dict, dict]:
    """
    Parse a Highlightly /basketball/statistics/{matchId} response.
    Returns (home_stats, away_stats).
    """
    home_stats: dict = {}
    away_stats: dict = {}

    items = data if isinstance(data, list) else (data.get("statistics") or data.get("data") or [])
    if not isinstance(items, list):
        return home_stats, away_stats

    for item in items:
        if not isinstance(item, dict):
            continue
        team_id_raw = str(_get(item, "teamId", "team_id", "id") or "")
        # Try to match by provider team ID or by position (index 0 = home, 1 = away)
        # Highlightly uses their own numeric team IDs — match by position
        stats = _parse_team_stats(item)
        if not home_stats:
            home_stats = stats
        elif not away_stats:
            away_stats = stats

    return home_stats, away_stats


def _upsert_stats(session: Session, match_id: str, team_id: str, is_home: bool, stats: dict) -> None:
    from db.models.basketball import BasketballTeamMatchStats

    existing = (
        session.query(BasketballTeamMatchStats)
        .filter_by(match_id=match_id, team_id=team_id)
        .first()
    )
    if existing is None:
        existing = BasketballTeamMatchStats(
            match_id=match_id,
            team_id=team_id,
            is_home=is_home,
            created_at=datetime.now(timezone.utc),
        )
        session.add(existing)

    for k, v in stats.items():
        if hasattr(existing, k) and v is not None:
            setattr(existing, k, v)


def _extract_hl_match_id(provider_id: str) -> Optional[str]:
    """Extract numeric Highlightly match ID from provider_id like 'hl-basketball-12345'."""
    parts = provider_id.rsplit("-", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[1]
    return None


def fetch_all(days_back: int = 30, dry_run: bool = False) -> int:
    from db.models.mvp import CoreMatch
    from db.models.basketball import BasketballTeamMatchStats

    session = SessionLocal()
    total = 0

    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

        # All finished basketball matches in window
        matches = (
            session.query(CoreMatch)
            .filter(
                CoreMatch.sport == _SPORT,
                CoreMatch.status == "finished",
                CoreMatch.kickoff_utc >= cutoff,
                CoreMatch.provider_id.isnot(None),
            )
            .order_by(CoreMatch.kickoff_utc.desc())
            .all()
        )
        log.info("Found %d finished basketball matches in last %d days.", len(matches), days_back)

        # Pre-load match IDs that already have stats
        existing_match_ids = {
            row.match_id
            for row in session.query(BasketballTeamMatchStats.match_id).all()
        }

        for match in matches:
            if match.id in existing_match_ids:
                continue

            home_stats: dict = {}
            away_stats: dict = {}

            # Try extras_json first (already fetched by Highlightly pipeline)
            if match.extras_json:
                try:
                    extras = json.loads(match.extras_json) if isinstance(match.extras_json, str) else match.extras_json
                    if isinstance(extras, dict) and extras.get("statistics"):
                        home_stats, away_stats = _parse_statistics_response(
                            extras["statistics"], match.home_team_id, match.away_team_id
                        )
                except Exception as exc:
                    log.debug("extras_json parse failed for %s: %s", match.id[:8], exc)

            # Fall back to Highlightly API call
            if not home_stats:
                hl_id = _extract_hl_match_id(match.provider_id or "")
                if hl_id:
                    try:
                        from pipelines.highlightly import client as hl
                        extras = hl.get_extras(_SPORT, hl_id)
                        if extras.get("statistics"):
                            home_stats, away_stats = _parse_statistics_response(
                                extras["statistics"], match.home_team_id, match.away_team_id
                            )
                        time.sleep(0.5)
                    except Exception as exc:
                        log.warning("Highlightly stats fetch failed for match %s: %s", match.id[:8], exc)

            if not home_stats:
                log.debug("No stats available for match %s", match.id[:8])
                continue

            # Populate total points from score if not in stats
            if not home_stats.get("points") and match.home_score is not None:
                home_stats["points"] = match.home_score
            if not away_stats.get("points") and match.away_score is not None:
                away_stats["points"] = match.away_score

            if not dry_run:
                _upsert_stats(session, match.id, match.home_team_id, True, home_stats)
                if away_stats:
                    _upsert_stats(session, match.id, match.away_team_id, False, away_stats)
                session.commit()

            total += 1
            log.info("Upserted stats: %s (%s)", match.provider_id, match.kickoff_utc.date())

    except Exception:
        session.rollback()
        log.exception("fetch_stats failed")
        raise
    finally:
        session.close()

    log.info("fetch_stats complete. %d matches processed.", total)
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch basketball box score stats (Highlightly)")
    parser.add_argument("--days-back", type=int, default=30)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(days_back=args.days_back, dry_run=args.dry_run)
    print(f"Done. {n} matches processed.")


if __name__ == "__main__":
    main()
