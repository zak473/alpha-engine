"""
Fetch player injury and suspension data from API-Football and API-Basketball (via RapidAPI).

Calls GET /injuries?league={id}&season={year} for each tracked league.
Matches team names to CoreTeam rows, upserts into team_injuries table.

Budget: ~20 API calls per run (10 soccer + 10 basketball). Free tier allows 100/day.
Schedule: daily at 06:00 UTC (see pipelines/scheduler.py).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import requests

from config.settings import settings
from db.models.mvp import CoreTeam, TeamInjury
from db.session import SessionLocal

log = logging.getLogger(__name__)

_FOOTBALL_BASE = "https://api-football-v1.p.rapidapi.com/v3"
_FOOTBALL_HEADERS = {
    "X-RapidAPI-Key": settings.API_FOOTBALL_KEY,
    "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
}

_BASKETBALL_BASE = "https://api-basketball.p.rapidapi.com"
_BASKETBALL_HEADERS = {
    "X-RapidAPI-Key": settings.API_FOOTBALL_KEY,
    "X-RapidAPI-Host": "api-basketball.p.rapidapi.com",
}

# API-Football soccer league IDs → current season year
_SOCCER_LEAGUES: dict[int, int] = {
    39: 2024,   # Premier League
    140: 2024,  # La Liga
    78: 2024,   # Bundesliga
    135: 2024,  # Serie A
    61: 2024,   # Ligue 1
    2: 2024,    # UEFA Champions League
    3: 2024,    # UEFA Europa League
    40: 2024,   # Championship
    94: 2024,   # Primeira Liga
    88: 2024,   # Eredivisie
}

# API-Basketball league IDs → current season year
_BASKETBALL_LEAGUES: dict[int, int] = {
    12: 2024,   # NBA
    120: 2024,  # EuroLeague
    116: 2024,  # NCAA Men's
    13: 2024,   # NBA G-League
}

# Keep old alias for backward compat
_LEAGUES = _SOCCER_LEAGUES


def _fetch_injuries(league_id: int, season: int) -> list[dict]:
    """Call API-Football /injuries for one league/season. Returns response list."""
    try:
        resp = requests.get(
            f"{_FOOTBALL_BASE}/injuries",
            headers=_FOOTBALL_HEADERS,
            params={"league": league_id, "season": season},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", [])
    except Exception as exc:
        log.warning("API-Football /injuries?league=%d failed: %s", league_id, exc)
        return []


def _fetch_basketball_injuries(league_id: int, season: int) -> list[dict]:
    """Call API-Basketball /injuries for one league/season."""
    try:
        resp = requests.get(
            f"{_BASKETBALL_BASE}/injuries",
            headers=_BASKETBALL_HEADERS,
            params={"league": league_id, "season": season},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", [])
    except Exception as exc:
        log.warning("API-Basketball /injuries?league=%d failed: %s", league_id, exc)
        return []


def _build_team_name_map(db) -> dict[str, str]:
    """Return {lower_case_name: team_id} for all CoreTeam rows."""
    rows = db.query(CoreTeam.id, CoreTeam.name).all()
    return {r.name.lower(): r.id for r in rows if r.name}


def _match_team(name: str, name_map: dict[str, str]) -> str | None:
    """Exact lower-case match, then substring fallback."""
    key = name.lower()
    if key in name_map:
        return name_map[key]
    # Substring fallback: find first team whose name contains or is contained by the API name
    for db_name, team_id in name_map.items():
        if db_name in key or key in db_name:
            return team_id
    return None


def fetch_all() -> int:
    """Fetch injuries for all configured leagues and upsert into team_injuries. Returns row count."""
    if not settings.API_FOOTBALL_KEY:
        log.warning("API_FOOTBALL_KEY not set — skipping injury fetch.")
        return 0

    db = SessionLocal()
    try:
        name_map = _build_team_name_map(db)
        now = datetime.now(timezone.utc)
        upserted = 0

        # Soccer injuries
        for league_id, season in _SOCCER_LEAGUES.items():
            entries = _fetch_injuries(league_id, season)
            log.info("Soccer league %d: %d injury entries", league_id, len(entries))

            for entry in entries:
                player = entry.get("player", {})
                team = entry.get("team", {})

                player_name = player.get("name", "").strip()
                team_name = team.get("name", "").strip()
                if not player_name or not team_name:
                    continue

                team_id = _match_team(team_name, name_map)
                if not team_id:
                    log.debug("No CoreTeam match for '%s'", team_name)
                    continue

                injury_type = player.get("type", "injury").lower()  # "injury" | "suspension"
                status = "Suspended" if injury_type == "suspension" else "Out"
                reason = player.get("reason") or None

                # Derive expected_return from fixture date if available
                fixture = entry.get("fixture", {})
                expected_return: str | None = None
                fixture_date_str = fixture.get("date")
                if fixture_date_str:
                    try:
                        fixture_dt = datetime.fromisoformat(fixture_date_str.replace("Z", "+00:00"))
                        days_away = (fixture_dt.date() - now.date()).days
                        if days_away <= 0:
                            expected_return = "Unknown"
                        elif days_away == 1:
                            expected_return = "1 day"
                        elif days_away <= 14:
                            expected_return = f"{days_away} days"
                        else:
                            expected_return = f"{days_away // 7} week{'s' if days_away // 7 > 1 else ''}"
                    except Exception:
                        pass

                # Upsert: merge on (team_id, player_name)
                existing = (
                    db.query(TeamInjury)
                    .filter(TeamInjury.team_id == team_id, TeamInjury.player_name == player_name)
                    .first()
                )
                if existing:
                    existing.team_name = team_name
                    existing.status = status
                    existing.reason = reason
                    existing.expected_return = expected_return
                    existing.fetched_at = now
                else:
                    db.add(TeamInjury(
                        team_id=team_id,
                        team_name=team_name,
                        player_name=player_name,
                        position=None,
                        status=status,
                        reason=reason,
                        expected_return=expected_return,
                        fetched_at=now,
                    ))
                upserted += 1

        # Basketball injuries (same upsert logic, different API endpoint)
        for league_id, season in _BASKETBALL_LEAGUES.items():
            entries = _fetch_basketball_injuries(league_id, season)
            log.info("Basketball league %d: %d injury entries", league_id, len(entries))
            for entry in entries:
                player = entry.get("player", {})
                team = entry.get("team", {})
                player_name = player.get("name", "").strip()
                team_name = team.get("name", "").strip()
                if not player_name or not team_name:
                    continue
                team_id = _match_team(team_name, name_map)
                if not team_id:
                    continue
                injury_type = player.get("type", "injury").lower()
                status = "Suspended" if injury_type == "suspension" else "Out"
                reason = player.get("reason") or None
                existing = (
                    db.query(TeamInjury)
                    .filter(TeamInjury.team_id == team_id, TeamInjury.player_name == player_name)
                    .first()
                )
                if existing:
                    existing.team_name = team_name
                    existing.status = status
                    existing.reason = reason
                    existing.fetched_at = now
                else:
                    db.add(TeamInjury(
                        team_id=team_id,
                        team_name=team_name,
                        player_name=player_name,
                        position=None,
                        status=status,
                        reason=reason,
                        expected_return=None,
                        fetched_at=now,
                    ))
                upserted += 1

        db.commit()
        log.info("fetch_injuries: %d rows upserted.", upserted)
        return upserted

    except Exception as exc:
        db.rollback()
        log.error("fetch_injuries failed: %s", exc, exc_info=True)
        raise
    finally:
        db.close()
