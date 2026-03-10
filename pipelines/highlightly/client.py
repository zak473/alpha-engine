"""Highlightly sports data API client."""
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


def get(sport: str, endpoint: str, params: dict | None = None, timeout: int = 15) -> dict[str, Any]:
    """Make a GET request to the Highlightly API for the given sport."""
    host = SPORT_HOSTS[sport]
    resp = httpx.get(
        f"https://{host}/{endpoint}",
        params=params or {},
        headers={
            "x-rapidapi-key": settings.HIGHLIGHTLY_API_KEY,
            "x-rapidapi-host": host,
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()


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
