"""
Fetch probable starting pitchers for upcoming MLB games.

Uses the free MLB Stats API to pull probablePitcher hydration and stores the
result in CoreMatch.extras_json under:
    probable_pitcher_home: {name, player_id, era_last_5, whip_last_5, k_last_5}
    probable_pitcher_away: {name, player_id, era_last_5, whip_last_5, k_last_5}

The era_last_5 / whip_last_5 are derived from recent BaseballTeamMatchStats
rows where pitcher_name matches (case-insensitive last name).

Usage:
    python -m pipelines.baseball.fetch_probable_pitchers
    python -m pipelines.baseball.fetch_probable_pitchers --days 7
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

import requests

from db.session import SessionLocal
from db.models.mvp import CoreMatch
from db.models.baseball import BaseballTeamMatchStats

log = logging.getLogger(__name__)

_MLB_SCHEDULE_URL = (
    "https://statsapi.mlb.com/api/v1/schedule"
    "?sportId=1&hydrate=probablePitcher&startDate={start}&endDate={end}"
)

_HEADERS = {"User-Agent": "AlphaEngine/1.0"}


def _pitcher_recent_stats(db, pitcher_name: str, team_id: str, before_date) -> dict:
    """
    Look up ERA / WHIP / K for pitcher's last 5 starts via BaseballTeamMatchStats.

    Matches on last name (case-insensitive) to handle display-name variations.
    """
    if not pitcher_name:
        return {}
    last_name = pitcher_name.strip().split()[-1].lower()

    rows = (
        db.query(BaseballTeamMatchStats)
        .join(CoreMatch, CoreMatch.id == BaseballTeamMatchStats.match_id)
        .filter(
            BaseballTeamMatchStats.team_id == team_id,
            BaseballTeamMatchStats.pitcher_name.isnot(None),
            CoreMatch.kickoff_utc < before_date,
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(50)
        .all()
    )

    # Filter to rows where last name matches
    matches = [r for r in rows if r.pitcher_name and r.pitcher_name.strip().split()[-1].lower() == last_name]
    matches = matches[:5]  # last 5 starts

    if not matches:
        return {}

    def _avg(vals):
        valid = [v for v in vals if v is not None]
        return round(sum(valid) / len(valid), 3) if valid else None

    return {
        "era_last_5":  _avg([r.era for r in matches]),
        "whip_last_5": _avg([r.whip for r in matches]),
        "k_last_5":    _avg([r.strikeouts_pitching for r in matches]),
    }


def _fetch_schedule(start_date: date, end_date: date) -> list[dict]:
    """Return list of raw game dicts from MLB Stats API."""
    url = _MLB_SCHEDULE_URL.format(
        start=start_date.isoformat(),
        end=end_date.isoformat(),
    )
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        log.error("[probable_pitchers] MLB API request failed: %s", exc)
        return []

    games = []
    for day in data.get("dates") or []:
        games.extend(day.get("games") or [])
    return games


def _team_name_key(name: str) -> str:
    """Normalise team name for fuzzy matching against CoreTeam names."""
    return name.strip().lower().replace(" ", "")


def run(days_ahead: int = 3) -> int:
    """
    Fetch probable pitchers for today + days_ahead days and persist to DB.

    Returns number of CoreMatch rows updated.
    """
    from datetime import datetime, timezone

    today = date.today()
    end = today + timedelta(days=days_ahead)
    games = _fetch_schedule(today, end)
    if not games:
        log.info("[probable_pitchers] No games returned from MLB API.")
        return 0

    db = SessionLocal()
    updated = 0
    try:
        for game in games:
            game_pk = game.get("gamePk")
            teams_block = game.get("teams") or {}
            home_block = teams_block.get("home") or {}
            away_block = teams_block.get("away") or {}
            home_team_name = (home_block.get("team") or {}).get("name", "")
            away_team_name = (away_block.get("team") or {}).get("name", "")

            # Find matching CoreMatch — look for baseball match on the same day
            # with team names that fuzzy-match (last word of team name)
            game_date_str = game.get("gameDate") or game.get("officialDate", "")
            if not game_date_str:
                continue
            try:
                game_dt = datetime.fromisoformat(game_date_str.replace("Z", "+00:00"))
            except ValueError:
                continue

            day_start = game_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)

            home_key = home_team_name.strip().split()[-1].lower() if home_team_name else ""
            away_key = away_team_name.strip().split()[-1].lower() if away_team_name else ""

            if not home_key or not away_key:
                continue

            # Query CoreMatch by sport + date range
            candidates = (
                db.query(CoreMatch)
                .filter(
                    CoreMatch.sport == "baseball",
                    CoreMatch.kickoff_utc >= day_start,
                    CoreMatch.kickoff_utc < day_end,
                )
                .all()
            )

            match: Optional[CoreMatch] = None
            for c in candidates:
                # Resolve team names via extras_json or CoreTeam (use provider display)
                extras = c.extras_json or {}
                ht_name = extras.get("home_team_name") or ""
                at_name = extras.get("away_team_name") or ""
                if not ht_name or not at_name:
                    continue
                if (ht_name.strip().split()[-1].lower() == home_key and
                        at_name.strip().split()[-1].lower() == away_key):
                    match = c
                    break

            if match is None:
                # Try a broader match — MLB gamePk sometimes stored in extras
                for c in candidates:
                    if (c.extras_json or {}).get("game_pk") == game_pk:
                        match = c
                        break

            if match is None:
                continue

            # Extract probable pitchers
            def _pitcher_info(side_block: dict, team_id: str, kickoff) -> Optional[dict]:
                pp = side_block.get("probablePitcher") or {}
                if not pp:
                    return None
                name = pp.get("fullName") or pp.get("lastName", "")
                if not name:
                    return None
                pid = str(pp.get("id") or "")
                stats = _pitcher_recent_stats(db, name, team_id, kickoff)
                return {"name": name, "player_id": pid, **stats}

            pp_home = _pitcher_info(home_block, match.home_team_id, match.kickoff_utc)
            pp_away = _pitcher_info(away_block, match.away_team_id, match.kickoff_utc)

            if not pp_home and not pp_away:
                continue

            extras = dict(match.extras_json or {})
            if pp_home:
                extras["probable_pitcher_home"] = pp_home
            if pp_away:
                extras["probable_pitcher_away"] = pp_away
            match.extras_json = extras
            updated += 1

        db.commit()
        log.info("[probable_pitchers] Updated %d CoreMatch rows.", updated)
    except Exception:
        db.rollback()
        log.exception("[probable_pitchers] Failed — rolled back")
        raise
    finally:
        db.close()

    return updated


def main() -> None:
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    parser = argparse.ArgumentParser(description="Fetch MLB probable pitchers")
    parser.add_argument("--days", type=int, default=3, help="Days ahead to fetch (default: 3)")
    args = parser.parse_args()
    n = run(days_ahead=args.days)
    log.info("Done — %d matches updated.", n)


if __name__ == "__main__":
    main()
