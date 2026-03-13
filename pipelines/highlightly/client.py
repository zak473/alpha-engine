"""Highlightly Sport API client.

Base URL: https://sports.highlightly.net
Auth:     x-rapidapi-key + x-rapidapi-host: sport-highlights-api.p.rapidapi.com

Endpoint paths follow /{sport}/{resource}, e.g.:
  /football/matches, /hockey/matches, /baseball/matches, /basketball/matches

Sport slug mapping (our internal name → API path prefix):
  soccer     → football
  basketball → basketball
  baseball   → baseball
  hockey     → hockey

Path-param endpoints (match_id goes in the URL, not query string):
  lineups/{matchId}, statistics/{matchId}, events/{id}

H2H params renamed: homeTeamId/awayTeamId → teamIdOne/teamIdTwo
Form endpoint renamed: lastfivegames → last-five-games
H2H endpoint renamed:  headtohead    → head-2-head
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any

import httpx

from config.settings import settings

# Global semaphore: only 1 Highlightly request in-flight at a time across all threads.
# Prevents the burst of parallel requests that triggers 429s on startup.
_HL_LOCK = threading.Semaphore(1)
_HL_REQUEST_INTERVAL = 1.2  # minimum seconds between requests

log = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

BASE_URL = "https://sports.highlightly.net"
RAPIDAPI_HOST = "sport-highlights-api.p.rapidapi.com"

# Internal slug → API path prefix
SPORT_PREFIX: dict[str, str] = {
    "soccer":     "football",
    "basketball": "basketball",
    "baseball":   "baseball",
    "hockey":     "hockey",
}

# Sports that have lineups/statistics/events endpoints under generic prefix
# (basketball uses /nba/, hockey has limited endpoints — handled in get_extras)
_EXTRAS_SPORT_OVERRIDE: dict[str, str] = {
    # no overrides yet — hockey/basketball generic endpoints lack lineups
    # so we skip those gracefully
}


def _headers() -> dict[str, str]:
    return {
        "x-rapidapi-key":  settings.HIGHLIGHTLY_API_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
        "Accept":          "application/json",
    }


def _prefix(sport: str) -> str:
    return SPORT_PREFIX.get(sport, sport)


# ── Core HTTP ─────────────────────────────────────────────────────────────────

def get(path: str, params: dict | None = None, timeout: int = 15) -> dict[str, Any]:
    """GET {BASE_URL}/{path}. Serialized via global semaphore; handles 429 with one retry."""
    if not settings.HIGHLIGHTLY_API_KEY:
        raise RuntimeError("HIGHLIGHTLY_API_KEY is not set")
    url = f"{BASE_URL}/{path.lstrip('/')}"

    with _HL_LOCK:
        resp = httpx.get(url, params=params or {}, headers=_headers(), timeout=timeout)

        if resp.status_code == 401:
            raise RuntimeError(
                f"Highlightly 401 Unauthorized — check HIGHLIGHTLY_API_KEY. URL: {url}"
            )
        if resp.status_code == 403:
            raise RuntimeError(
                f"Highlightly 403 Forbidden — plan may not include this endpoint. URL: {url}"
            )
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("retry-after", 60))
            log.warning("[highlightly] 429 on %s — retrying after %ds", url, retry_after)
            time.sleep(retry_after)
            resp = httpx.get(url, params=params or {}, headers=_headers(), timeout=timeout)

        resp.raise_for_status()
        time.sleep(_HL_REQUEST_INTERVAL)  # pace requests to avoid bursts
        return resp.json()


def _payload(data: dict[str, Any]) -> Any:
    """Extract the data payload from a Highlightly response."""
    return data.get("data") if "data" in data else data


# ── Public API functions ───────────────────────────────────────────────────────

def test_connection() -> dict[str, Any]:
    """Verify the API key works against the Sport API."""
    from datetime import date
    today = date.today().isoformat()
    data = get("football/matches", {"date": today, "limit": 1})
    batch = _payload(data)
    count = len(batch) if isinstance(batch, list) else 0
    log.info("[highlightly:test] Connection OK — football matches today: %d", count)
    return {"ok": True, "sport": "football", "sample_count": count}


def get_matches(sport: str, date: str, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """Fetch all matches for a sport on a given date (YYYY-MM-DD). Paginates automatically."""
    prefix = _prefix(sport)
    all_matches: list[dict] = []
    current_offset = offset
    while True:
        data = get(f"{prefix}/matches", {"date": date, "timezone": "UTC", "limit": limit, "offset": current_offset})
        batch = _payload(data)
        if not isinstance(batch, list):
            break
        all_matches.extend(batch)
        # Check pagination
        pagination = data.get("pagination") or {}
        total = pagination.get("totalCount") or pagination.get("total") or len(all_matches)
        if len(all_matches) >= total or len(batch) < limit:
            break
        current_offset += limit
    return all_matches


def get_odds(sport: str, match_id: str | int) -> dict[str, Any]:
    """Fetch odds for a single match."""
    prefix = _prefix(sport)
    return get(f"{prefix}/odds", {"matchId": str(match_id)})


def get_extras(sport: str, match_id: str | int, include_players: bool = False) -> dict[str, Any]:
    """
    Fetch lineups, statistics, events (and optionally players) for a single match.

    The Sport API uses path parameters for these endpoints:
      /{sport}/lineups/{matchId}
      /{sport}/statistics/{matchId}
      /{sport}/events/{matchId}

    Hockey has no lineups/statistics/events in the generic /hockey/ prefix
    (only under /nhl/). We try gracefully and skip on 403/404.
    """
    prefix = _prefix(sport)
    extras: dict[str, Any] = {}
    mid = str(match_id)

    # Endpoints that use path params
    path_param_endpoints = {
        "lineups":    f"{prefix}/lineups/{mid}",
        "statistics": f"{prefix}/statistics/{mid}",
        "events":     f"{prefix}/events/{mid}",
    }

    for key, path in path_param_endpoints.items():
        try:
            data = get(path)
            payload = _payload(data)
            if payload:
                extras[key] = payload
            time.sleep(0.15)
        except Exception as exc:
            msg = str(exc)
            if "403" in msg or "404" in msg:
                log.debug("[highlightly:extras] %s not available for %s", key, sport)
            else:
                log.warning("[highlightly:extras] %s/%s match %s: %s", sport, key, mid, exc)

    if include_players:
        try:
            data = get(f"{prefix}/players", {"matchId": mid})
            payload = _payload(data)
            if payload:
                extras["players"] = payload if isinstance(payload, list) else payload.get("players") or []
            time.sleep(0.15)
        except Exception as exc:
            log.debug("[highlightly:extras] players %s match %s: %s", sport, mid, exc)

    return extras


def get_last_five(sport: str, team_id: str | int) -> list[dict[str, Any]]:
    """Fetch last 5 games for a team from /{sport}/last-five-games?teamId={id}."""
    prefix = _prefix(sport)
    try:
        data = get(f"{prefix}/last-five-games", {"teamId": str(team_id)})
        payload = _payload(data)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("matches") or payload.get("games") or []
    except Exception as exc:
        log.warning("[highlightly:lastfive] %s team %s: %s", sport, team_id, exc)
    return []


def get_headtohead(sport: str, home_team_id: str | int, away_team_id: str | int) -> list[dict[str, Any]]:
    """Fetch head-to-head history. Uses teamIdOne/teamIdTwo (Sport API naming)."""
    prefix = _prefix(sport)
    try:
        data = get(f"{prefix}/head-2-head", {
            "teamIdOne": str(home_team_id),
            "teamIdTwo": str(away_team_id),
        })
        payload = _payload(data)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("matches") or payload.get("games") or []
    except Exception as exc:
        log.warning("[highlightly:h2h] %s %s vs %s: %s", sport, home_team_id, away_team_id, exc)
    return []


def get_players(sport: str, match_id: str | int) -> list[dict[str, Any]]:
    """Fetch player profiles/stats for a match."""
    prefix = _prefix(sport)
    try:
        data = get(f"{prefix}/players", {"matchId": str(match_id)})
        payload = _payload(data)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("players") or []
    except Exception as exc:
        log.warning("[highlightly:players] %s match %s: %s", sport, match_id, exc)
    return []


def get_highlights(sport: str, match_id: str | int) -> list[dict[str, Any]]:
    """Fetch highlight clips for a single match."""
    prefix = _prefix(sport)
    try:
        data = get(f"{prefix}/highlights", {"matchId": str(match_id)})
        payload = _payload(data)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("highlights") or payload.get("clips") or []
    except Exception as exc:
        log.warning("[highlightly:highlights] %s match %s: %s", sport, match_id, exc)
    return []


def get_standings(sport: str, league_id: str | int, season: str | None = None) -> list[dict[str, Any]]:
    """Fetch league standings."""
    prefix = _prefix(sport)
    params: dict[str, Any] = {"leagueId": str(league_id)}
    if season:
        params["season"] = season
    try:
        data = get(f"{prefix}/standings", params)
        payload = _payload(data)
        if isinstance(payload, list):
            rows: list[dict] = []
            for item in payload:
                if isinstance(item, dict):
                    if "standings" in item:
                        group = item.get("group") or item.get("group_name") or item.get("name") or ""
                        for row in (item.get("standings") or []):
                            if isinstance(row, dict):
                                row["_group"] = group
                                rows.append(row)
                    else:
                        rows.append(item)
            return rows
        if isinstance(payload, dict):
            return payload.get("standings") or []
    except Exception as exc:
        log.warning("[highlightly:standings] %s league %s: %s", sport, league_id, exc)
    return []


def get_leagues(sport: str) -> list[dict[str, Any]]:
    """Fetch all leagues for a sport."""
    prefix = _prefix(sport)
    try:
        data = get(f"{prefix}/leagues")
        payload = _payload(data)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("leagues") or []
    except Exception as exc:
        log.warning("[highlightly:leagues] %s: %s", sport, exc)
    return []


def get_countries(sport: str) -> list[dict[str, Any]]:
    """Fetch all countries for a sport."""
    prefix = _prefix(sport)
    try:
        data = get(f"{prefix}/countries")
        payload = _payload(data)
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("countries") or []
    except Exception as exc:
        log.warning("[highlightly:countries] %s: %s", sport, exc)
    return []


# ── Odds extraction (unchanged logic, handles all response shapes) ─────────────

def extract_odds(
    match: dict[str, Any], sport: str
) -> tuple[float | None, float | None, float | None]:
    """
    Extract (home_odds, draw_odds, away_odds) from a Highlightly match dict.

    Supported shapes:
      1. match["odds"] = [{"bookmaker": ..., "outcomes": {"home": 1.8, ...}}]
      2. match["odds"] = [{"outcomes": [{"name": "home", "odd": 1.8}, ...]}]
      3. match["odds"] = {"1": 1.8, "X": 3.5, "2": 4.2}
      4. match["odds"] = {"home": 1.8, "draw": 3.5, "away": 4.2}
      5. match["odds"] = [{"1": 1.8, "X": 3.5, "2": 4.2}]
    """
    raw = match.get("odds") or match.get("data")
    if not raw:
        return None, None, None
    _log_odds_structure(raw, sport)
    if isinstance(raw, dict):
        return _extract_from_dict(raw)
    if isinstance(raw, list):
        for bm in _sort_bookmakers(raw):
            if isinstance(bm, dict):
                result = _extract_from_bookmaker(bm)
                if result[0] is not None:
                    return result
    return None, None, None


_SHARP_BOOKS = {"pinnacle", "betfair", "draftkings", "fanduel", "bet365", "betway"}


def _sort_bookmakers(bms: list) -> list:
    def _rank(bm: dict) -> int:
        name = str(bm.get("bookmaker") or bm.get("name") or "").lower()
        return 0 if any(s in name for s in _SHARP_BOOKS) else 1
    return sorted(bms, key=_rank)


def _extract_from_dict(d: dict) -> tuple[float | None, float | None, float | None]:
    def _f(v: Any) -> float | None:
        try:
            f = float(v)
            return f if f > 1.0 else None
        except (TypeError, ValueError):
            return None
    home = _f(d.get("home") or d.get("1") or d.get("homeWin") or d.get("home_win"))
    draw = _f(d.get("draw") or d.get("X") or d.get("x") or d.get("tie"))
    away = _f(d.get("away") or d.get("2") or d.get("awayWin") or d.get("away_win"))
    return home, draw, away


def _extract_from_bookmaker(bm: dict) -> tuple[float | None, float | None, float | None]:
    outcomes = bm.get("outcomes") or bm.get("markets")
    if isinstance(outcomes, dict):
        return _extract_from_dict(outcomes)
    if isinstance(outcomes, list):
        if outcomes and isinstance(outcomes[0], dict):
            if "outcomes" in outcomes[0] or "odd" not in outcomes[0]:
                for mkt in outcomes:
                    mkt_name = str(mkt.get("name") or mkt.get("key") or "").lower()
                    if any(k in mkt_name for k in ("match winner", "1x2", "moneyline", "winner", "result")):
                        return _parse_outcome_list(mkt.get("outcomes") or [])
                if outcomes:
                    return _parse_outcome_list(outcomes[0].get("outcomes") or [])
            else:
                return _parse_outcome_list(outcomes)
    return _extract_from_dict(bm)


def _parse_outcome_list(lst: list) -> tuple[float | None, float | None, float | None]:
    home = draw = away = None
    for o in lst:
        if not isinstance(o, dict):
            continue
        name = str(o.get("name") or o.get("label") or "").lower()
        val = o.get("odd") or o.get("price") or o.get("odds") or o.get("value")
        try:
            f = float(val) if val is not None else None
            if f and f > 1.0:
                if name in ("home", "1", "home win", "home_win"):
                    home = f
                elif name in ("draw", "x", "tie"):
                    draw = f
                elif name in ("away", "2", "away win", "away_win"):
                    away = f
        except (TypeError, ValueError):
            pass
    return home, draw, away


_logged_shapes: set[str] = set()


def _log_odds_structure(raw: Any, sport: str) -> None:
    key = f"{sport}:{type(raw).__name__}"
    if key in _logged_shapes:
        return
    _logged_shapes.add(key)
    import json
    try:
        sample = raw if not isinstance(raw, list) else raw[:1]
        log.info("[highlightly:odds] %s shape sample: %s", sport, json.dumps(sample, default=str)[:500])
    except Exception:
        log.info("[highlightly:odds] %s shape: %s", sport, type(raw))
