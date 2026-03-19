"""
Fetch player injury and suspension data.

Sources:
  - API-Football (RapidAPI): soccer leagues
  - API-Basketball (RapidAPI): NBA, EuroLeague
  - MLB Stats API (free, no key): MLB injured list
  - NHL API (free, no key): NHL injured reserve

Budget: ~20 RapidAPI calls per run (soccer + basketball). MLB/NHL are free.
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


def _fetch_mlb_il() -> list[dict]:
    """
    Fetch MLB injured list players via free statsapi.mlb.com.
    Returns list of dicts: {team_name, player_name, status, reason}.
    """
    try:
        # Get all active MLB teams
        teams_resp = requests.get(
            "https://statsapi.mlb.com/api/v1/teams",
            params={"sportId": 1, "season": 2025},
            timeout=15,
        )
        teams_resp.raise_for_status()
        teams = teams_resp.json().get("teams", [])
    except Exception as exc:
        log.warning("MLB teams fetch failed: %s", exc)
        return []

    results = []
    for team in teams:
        team_id = team.get("id")
        team_name = team.get("name", "")
        if not team_id:
            continue
        try:
            resp = requests.get(
                f"https://statsapi.mlb.com/api/v1/teams/{team_id}/roster",
                params={"rosterType": "injuredList", "season": 2025},
                timeout=15,
            )
            if not resp.ok:
                continue
            roster = resp.json().get("roster", [])
            for player in roster:
                name = (player.get("person") or {}).get("fullName", "")
                position = (player.get("position") or {}).get("abbreviation")
                status = player.get("status", {}).get("description", "IL")
                reason = None  # MLB IL doesn't expose injury reason
                results.append({
                    "team_name": team_name,
                    "player_name": name,
                    "position": position,
                    "status": status,
                    "reason": reason,
                })
        except Exception as exc:
            log.debug("MLB IL fetch failed for team %s: %s", team_name, exc)

    log.info("MLB IL: %d injured players fetched", len(results))
    return results


# NHL team abbreviations for all 32 franchises
_NHL_TEAMS = [
    "ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET",
    "EDM", "FLA", "LAK", "MIN", "MTL", "NJD", "NSH", "NYI", "NYR", "OTT",
    "PHI", "PIT", "SEA", "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK",
    "WPG", "WSH",
]


def _fetch_nhl_injuries() -> list[dict]:
    """
    Fetch NHL injured reserve players via free api-web.nhle.com.
    Uses the roster endpoint; marks players with injuryStatus as injured.
    Returns list of dicts: {team_name, player_name, position, status, reason}.
    """
    results = []
    for abbrev in _NHL_TEAMS:
        try:
            resp = requests.get(
                f"https://api-web.nhle.com/v1/roster/{abbrev}/current",
                timeout=15,
            )
            if not resp.ok:
                continue
            data = resp.json()
            team_name = data.get("teamName", {}).get("default", abbrev)
            # Combine all position groups
            all_players = (
                data.get("forwards", []) +
                data.get("defensemen", []) +
                data.get("goalies", [])
            )
            for p in all_players:
                injury_status = p.get("injuryStatus")
                if not injury_status:
                    continue
                first = (p.get("firstName") or {}).get("default", "")
                last = (p.get("lastName") or {}).get("default", "")
                name = f"{first} {last}".strip()
                position = p.get("positionCode")
                results.append({
                    "team_name": team_name,
                    "player_name": name,
                    "position": position,
                    "status": "Out",
                    "reason": str(injury_status),
                })
        except Exception as exc:
            log.debug("NHL roster fetch failed for %s: %s", abbrev, exc)

    log.info("NHL injuries: %d injured players fetched", len(results))
    return results


def _upsert_injuries(db, name_map: dict, entries: list[dict], now: datetime) -> int:
    """Generic upsert helper for injury entries from any source."""
    upserted = 0
    for entry in entries:
        player_name = (entry.get("player_name") or "").strip()
        team_name = (entry.get("team_name") or "").strip()
        if not player_name or not team_name:
            continue
        team_id = _match_team(team_name, name_map)
        if not team_id:
            log.debug("No CoreTeam match for '%s'", team_name)
            continue
        existing = (
            db.query(TeamInjury)
            .filter(TeamInjury.team_id == team_id, TeamInjury.player_name == player_name)
            .first()
        )
        if existing:
            existing.team_name = team_name
            existing.status = entry.get("status", "Out")
            existing.reason = entry.get("reason")
            existing.position = entry.get("position")
            existing.expected_return = entry.get("expected_return")
            existing.fetched_at = now
        else:
            db.add(TeamInjury(
                team_id=team_id,
                team_name=team_name,
                player_name=player_name,
                position=entry.get("position"),
                status=entry.get("status", "Out"),
                reason=entry.get("reason"),
                expected_return=entry.get("expected_return"),
                fetched_at=now,
            ))
        upserted += 1
    return upserted


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

        # Basketball injuries (API-Basketball via RapidAPI)
        for league_id, season in _BASKETBALL_LEAGUES.items():
            entries = _fetch_basketball_injuries(league_id, season)
            log.info("Basketball league %d: %d injury entries", league_id, len(entries))
            normalized = []
            for entry in entries:
                player = entry.get("player", {})
                team = entry.get("team", {})
                player_name = player.get("name", "").strip()
                team_name = team.get("name", "").strip()
                if not player_name or not team_name:
                    continue
                injury_type = player.get("type", "injury").lower()
                normalized.append({
                    "player_name": player_name,
                    "team_name": team_name,
                    "position": None,
                    "status": "Suspended" if injury_type == "suspension" else "Out",
                    "reason": player.get("reason") or None,
                    "expected_return": None,
                })
            upserted += _upsert_injuries(db, name_map, normalized, now)

        # MLB injured list (free MLB Stats API — no key required)
        try:
            mlb_entries = _fetch_mlb_il()
            upserted += _upsert_injuries(db, name_map, mlb_entries, now)
        except Exception as exc:
            log.warning("MLB IL fetch failed: %s", exc)

        # NHL injured reserve (free NHL API — no key required)
        try:
            nhl_entries = _fetch_nhl_injuries()
            upserted += _upsert_injuries(db, name_map, nhl_entries, now)
        except Exception as exc:
            log.warning("NHL injury fetch failed: %s", exc)

        db.commit()
        log.info("fetch_injuries: %d rows upserted.", upserted)
        return upserted

    except Exception as exc:
        db.rollback()
        log.error("fetch_injuries failed: %s", exc, exc_info=True)
        raise
    finally:
        db.close()
