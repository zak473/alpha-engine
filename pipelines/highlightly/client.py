"""Highlightly sports data API client.

Auth: Direct API keys from https://highlightly.net/dashboard use the
`x-api-key` header. Do NOT use x-rapidapi-key — that is only for the
RapidAPI marketplace variant and will return 401 for dashboard keys.
"""
from __future__ import annotations
import logging
from typing import Any
import httpx
from config.settings import settings

log = logging.getLogger(__name__)

SPORT_HOSTS: dict[str, str] = {
    "soccer":     "soccer.highlightly.net",
    "basketball": "basketball.highlightly.net",
    "baseball":   "baseball.highlightly.net",
    "hockey":     "hockey.highlightly.net",
}


def _headers() -> dict[str, str]:
    """
    Auth headers for the Highlightly direct API (soccer.highlightly.net).
    Uses x-rapidapi-key — this is the correct header for both direct and RapidAPI access.
    Do NOT set x-rapidapi-host for the direct API (only needed for RapidAPI marketplace).
    """
    return {
        "x-rapidapi-key": settings.HIGHLIGHTLY_API_KEY,
        "Accept": "application/json",
    }


def get(sport: str, endpoint: str, params: dict | None = None, timeout: int = 15) -> dict[str, Any]:
    """Make a GET request to the Highlightly API for the given sport."""
    if not settings.HIGHLIGHTLY_API_KEY:
        raise RuntimeError("HIGHLIGHTLY_API_KEY is not set")
    host = SPORT_HOSTS[sport]
    url = f"https://{host}/{endpoint}"
    resp = httpx.get(url, params=params or {}, headers=_headers(), timeout=timeout)
    if resp.status_code == 401:
        raise RuntimeError(
            f"Highlightly 401 Unauthorized — check HIGHLIGHTLY_API_KEY is correct "
            f"and was obtained from highlightly.net/dashboard (not RapidAPI). "
            f"URL: {url}"
        )
    if resp.status_code == 403:
        raise RuntimeError(
            f"Highlightly 403 Forbidden — your plan may not include this endpoint. "
            f"URL: {url}"
        )
    if resp.status_code == 429:
        raise RuntimeError(
            f"Highlightly 429 Too Many Requests — rate limit hit. URL: {url}"
        )
    resp.raise_for_status()
    return resp.json()


def test_connection() -> dict[str, Any]:
    """
    Verify the API key works. Fetches one soccer match for today.
    Returns {"ok": True, "sport": "soccer", "sample_count": N} or raises.
    """
    from datetime import date
    today = date.today().isoformat()
    data = get("soccer", "matches", {"date": today, "limit": 1})
    count = len(data.get("data", []))
    total = data.get("pagination", {}).get("totalCount", 0)
    log.info("[highlightly:test] Connection OK — soccer matches today: %d total", total)
    return {"ok": True, "sport": "soccer", "sample_count": count, "total_today": total}


def get_matches(sport: str, date: str, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """Fetch matches for a sport on a given date (YYYY-MM-DD). Handles pagination."""
    all_matches: list[dict] = []
    current_offset = offset
    while True:
        data = get(sport, "matches", {"date": date, "limit": limit, "offset": current_offset})
        batch = data.get("data", [])
        all_matches.extend(batch)
        pagination = data.get("pagination", {})
        total = pagination.get("totalCount", 0)
        if len(all_matches) >= total or len(batch) < limit:
            break
        current_offset += limit
    return all_matches


def get_odds(sport: str, match_id: str | int) -> dict[str, Any]:
    """Fetch odds for a single match from the Highlightly odds endpoint."""
    data = get(sport, "odds", {"matchId": str(match_id)})
    return data


def get_extras(sport: str, match_id: str | int) -> dict[str, Any]:
    """
    Fetch lineups, statistics, and events for a single match.
    Returns a combined dict with keys "lineups", "statistics", "events".
    Each key is absent if the endpoint fails or returns no data.
    """
    extras: dict[str, Any] = {}
    for endpoint in ("lineups", "statistics", "events"):
        try:
            data = get(sport, endpoint, {"matchId": str(match_id)})
            payload = data.get("data") or data
            if payload:
                extras[endpoint] = payload
        except Exception as exc:
            log.warning("[highlightly:extras] %s %s/%s failed: %s", sport, endpoint, match_id, exc)
    return extras


def get_highlights(sport: str, match_id: str | int) -> list[dict[str, Any]]:
    """Fetch highlight clips for a single match. Returns list of clip dicts."""
    try:
        data = get(sport, "highlights", {"matchId": str(match_id)})
        payload = data.get("data") or data
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("highlights") or payload.get("clips") or []
    except Exception as exc:
        log.warning("[highlightly:highlights] %s match %s failed: %s", sport, match_id, exc)
    return []


def get_standings(sport: str, league_id: str | int, season: str | None = None) -> list[dict[str, Any]]:
    """
    Fetch league standings for a given league.
    Returns list of standing rows (each row = one team in the table).
    """
    params: dict[str, Any] = {"leagueId": str(league_id)}
    if season:
        params["season"] = season
    try:
        data = get(sport, "standings", params)
        payload = data.get("data") or data
        # Highlightly may return [{group_name, standings: [...]}, ...]  or flat list
        if isinstance(payload, list):
            rows: list[dict] = []
            for item in payload:
                if isinstance(item, dict):
                    if "standings" in item:
                        # grouped standings: [{group_name, standings: [...]}, ...]
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
        log.warning("[highlightly:standings] %s league %s failed: %s", sport, league_id, exc)
    return []


def get_leagues(sport: str) -> list[dict[str, Any]]:
    """Fetch all leagues (with logos) for a sport."""
    try:
        data = get(sport, "leagues", {})
        payload = data.get("data") or data
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("leagues") or []
    except Exception as exc:
        log.warning("[highlightly:leagues] %s failed: %s", sport, exc)
    return []


def get_countries(sport: str) -> list[dict[str, Any]]:
    """Fetch all countries (with flags) for a sport."""
    try:
        data = get(sport, "countries", {})
        payload = data.get("data") or data
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return payload.get("countries") or []
    except Exception as exc:
        log.warning("[highlightly:countries] %s failed: %s", sport, exc)
    return []


def extract_odds(
    match: dict[str, Any], sport: str
) -> tuple[float | None, float | None, float | None]:
    """
    Extract (home_odds, draw_odds, away_odds) from a Highlightly match or odds response.
    Handles multiple response shapes defensively and logs the raw structure on first encounter.

    Supported shapes (tried in order):
      1. match["odds"] = [{"bookmaker": ..., "outcomes": {"home": 1.8, "draw": 3.5, "away": 4.2}}]
      2. match["odds"] = [{"outcomes": [{"name": "home", "odd": 1.8}, ...]}]
      3. match["odds"] = {"1": 1.8, "X": 3.5, "2": 4.2}
      4. match["odds"] = {"home": 1.8, "draw": 3.5, "away": 4.2}
      5. match["odds"] = [{"1": 1.8, "X": 3.5, "2": 4.2}]  (list of bookmaker flat dicts)
      6. match["data"] = [...]  (raw /odds endpoint response, same structures inside)
    """
    raw = match.get("odds") or match.get("data")
    if not raw:
        return None, None, None

    # Log the structure once per sport so we can confirm the actual format
    _log_odds_structure(raw, sport)

    # --- Shape 3/4: top-level dict with numeric or named keys ---
    if isinstance(raw, dict):
        return _extract_from_dict(raw)

    # --- Shape 1/2/5: list of bookmaker objects ---
    if isinstance(raw, list):
        # Prefer pinnacle/bet365/betfair first; fall back to first bookmaker
        sorted_bms = _sort_bookmakers(raw)
        for bm in sorted_bms:
            if isinstance(bm, dict):
                result = _extract_from_bookmaker(bm)
                if result[0] is not None:
                    return result

    return None, None, None


# ── Shape-specific parsers ────────────────────────────────────────────────────

_SHARP_BOOKS = {"pinnacle", "betfair", "draftkings", "fanduel", "bet365", "betway"}


def _sort_bookmakers(bms: list) -> list:
    """Sort bookmakers: sharp books first, rest unchanged."""
    def _rank(bm: dict) -> int:
        name = str(bm.get("bookmaker") or bm.get("name") or "").lower()
        return 0 if any(s in name for s in _SHARP_BOOKS) else 1
    return sorted(bms, key=_rank)


def _extract_from_dict(d: dict) -> tuple[float | None, float | None, float | None]:
    """Parse a flat dict like {"1": 1.8, "X": 3.5, "2": 4.2} or {"home": 1.8, ...}."""
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
    """Parse a single bookmaker object. Tries outcomes dict, outcomes list, and flat keys."""
    outcomes = bm.get("outcomes") or bm.get("markets")

    # Shape 1: outcomes is a dict {"home": 1.8, "draw": 3.5, "away": 4.2}
    if isinstance(outcomes, dict):
        return _extract_from_dict(outcomes)

    # Shape 2: outcomes is a list [{"name": "home", "odd": 1.8}, ...]
    if isinstance(outcomes, list):
        # Could also be [{"name": "Match Winner", "outcomes": [...]}] (nested markets)
        if outcomes and isinstance(outcomes[0], dict):
            if "outcomes" in outcomes[0] or "odd" not in outcomes[0]:
                # Nested markets — find "Match Winner" / "1x2" / "moneyline"
                for mkt in outcomes:
                    mkt_name = str(mkt.get("name") or mkt.get("key") or "").lower()
                    if any(k in mkt_name for k in ("match winner", "1x2", "moneyline", "winner", "result")):
                        inner = mkt.get("outcomes") or []
                        return _parse_outcome_list(inner)
                # Fallback: try first market
                if outcomes:
                    inner = outcomes[0].get("outcomes") or []
                    return _parse_outcome_list(inner)
            else:
                return _parse_outcome_list(outcomes)

    # Shape 5: bookmaker is itself a flat dict {"1": 1.8, "X": 3.5, "2": 4.2}
    return _extract_from_dict(bm)


def _parse_outcome_list(lst: list) -> tuple[float | None, float | None, float | None]:
    """Parse [{"name": "home", "odd": 1.8}, {"name": "draw", "odd": 3.5}, ...]."""
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


# ── Debug logger (fires once per structure shape per sport) ───────────────────

_logged_shapes: set[str] = set()


def _log_odds_structure(raw: Any, sport: str) -> None:
    key = f"{sport}:{type(raw).__name__}"
    if key in _logged_shapes:
        return
    _logged_shapes.add(key)
    import json
    try:
        sample = raw if not isinstance(raw, list) else raw[:1]
        log.info("[highlightly:odds] %s raw structure sample: %s", sport, json.dumps(sample, default=str)[:500])
    except Exception:
        log.info("[highlightly:odds] %s raw structure: %s", sport, type(raw))
