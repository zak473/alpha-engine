"""
Fetch live esports fixtures from PandaScore and ingest them.

Free tier: 100 req/hour — CS2, LoL, Dota 2, Valorant, R6 Siege, Overwatch, etc.
Register (no CC) at https://pandascore.co → Dashboard → Get API token.

Usage:
    python -m pipelines.esports.fetch_live
    python -m pipelines.esports.fetch_live --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
from typing import Any

import httpx

from config.settings import settings
from pipelines.soccer.ingest_matches import ingest_from_dicts

log = logging.getLogger(__name__)

BASE_URL = "https://api.pandascore.co"

# Game slug → display name
GAME_NAMES = {
    "cs-go":        "CS2",
    "league-of-legends": "League of Legends",
    "dota-2":       "Dota 2",
    "valorant":     "Valorant",
    "r6siege":      "Rainbow Six Siege",
    "overwatch":    "Overwatch",
    "rocket-league":"Rocket League",
    "starcraft-2":  "StarCraft 2",
}

STATUS_MAP = {
    "not_started": "scheduled",
    "running":     "live",
    "finished":    "finished",
    "cancelled":   "cancelled",
    "postponed":   "postponed",
}


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _get(path: str, params: dict | None = None) -> list:
    url = f"{BASE_URL}{path}"
    headers = {"Authorization": f"Bearer {settings.ESPORTS_API_KEY}"}
    all_results = []
    page = 1
    while True:
        p = {"per_page": 100, "page": page, **(params or {})}
        resp = httpx.get(url, headers=headers, params=p, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            break
        all_results.extend(data)
        # Stop after 3 pages (300 matches) to stay within rate limits
        if len(data) < 100 or page >= 3:
            break
        page += 1
    return all_results


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------

def _transform_match(match: dict[str, Any]) -> dict[str, Any] | None:
    opponents = match.get("opponents", [])
    if len(opponents) < 2:
        return None

    home = opponents[0].get("opponent", {})
    away = opponents[1].get("opponent", {})
    home_name = home.get("name", "").strip()
    away_name = away.get("name", "").strip()
    if not home_name or not away_name:
        return None

    game = match.get("videogame", {})
    game_slug  = game.get("slug", "unknown")
    game_name  = GAME_NAMES.get(game_slug, game.get("name", game_slug))

    league     = match.get("league", {})
    serie      = match.get("serie", {})
    tournament = match.get("tournament", {})

    league_name = f"{game_name} – {league.get('name', 'Unknown')}"
    league_key  = f"ps-league-{game_slug}-{league.get('id', 0)}"

    kickoff_raw = match.get("scheduled_at") or match.get("begin_at") or ""
    if not kickoff_raw:
        return None

    status_raw = match.get("status", "not_started")
    status     = STATUS_MAP.get(status_raw, "scheduled")

    # Series results (maps/games won)
    home_score = away_score = outcome = ""
    results = match.get("results", [])
    if results and len(results) >= 2:
        hs = results[0].get("score", 0)
        as_ = results[1].get("score", 0)
        home_score = str(hs)
        away_score = str(as_)
        if status == "finished":
            outcome = "H" if hs > as_ else ("A" if as_ > hs else "D")

    # Live in-progress game state — parse PandaScore `games` array
    live_clock = None
    current_period = None
    current_state_json = None

    if status == "live":
        home_id = home.get("id")
        away_id = away.get("id")
        games = match.get("games", [])
        running_games = [g for g in games if g.get("status") == "running"]
        finished_games = [g for g in games if g.get("status") == "finished"]
        if running_games:
            lg = running_games[0]
            map_num = lg.get("position", 1)
            map_name = (lg.get("map") or {}).get("name") or ""
            current_period = map_num
            live_clock = f"Map {map_num}"
            # Map team IDs to home/away round scores (available on paid tier only)
            round_a = round_b = None
            for r in (lg.get("results") or []):
                if r.get("team_id") == home_id:
                    round_a = r.get("score")
                elif r.get("team_id") == away_id:
                    round_b = r.get("score")
            current_state_json = {
                "current_map": map_num,
                "current_map_name": map_name or None,
                "round_a": round_a,
                "round_b": round_b,
                "maps_played": len(finished_games),
            }
        elif finished_games:
            # Between maps — infer from number of finished games
            map_num = len(finished_games) + 1
            current_period = map_num
            live_clock = f"Map {map_num}"
            current_state_json = {
                "current_map": map_num,
                "current_map_name": None,
                "round_a": None,
                "round_b": None,
                "maps_played": len(finished_games),
            }

    season = kickoff_raw[:4]

    return {
        "sport":                  "esports",
        "provider_id":            f"ps-{match['id']}",
        "league_provider_id":     league_key,
        "league_name":            league_name,
        "home_team_provider_id":  f"ps-team-{home.get('id', home_name)}",
        "home_team_name":         home_name,
        "away_team_provider_id":  f"ps-team-{away.get('id', away_name)}",
        "away_team_name":         away_name,
        "kickoff_utc":            kickoff_raw,
        "status":                 status,
        "home_score":             home_score,
        "away_score":             away_score,
        "outcome":                outcome,
        "season":                 season,
        "venue":                  "",
        "live_clock":             live_clock,
        "current_period":         current_period,
        # Serialize to JSON string so ingest_from_dicts CSV round-trip doesn't corrupt it
        "current_state_json":     json.dumps(current_state_json) if current_state_json is not None else None,
    }


# ---------------------------------------------------------------------------
# Main fetch
# ---------------------------------------------------------------------------

def fetch_all(dry_run: bool = False) -> int:
    if not settings.ESPORTS_API_KEY:
        log.error(
            "ESPORTS_API_KEY not set. "
            "Get a free token at https://pandascore.co (Dashboard → API token)"
        )
        return 0

    all_rows: list[dict] = []

    for endpoint, label in [
        ("/matches/upcoming", "upcoming"),
        ("/matches/running",  "live"),
        ("/matches/past",     "finished"),
    ]:
        try:
            log.info("Fetching esports %s matches ...", label)
            matches = _get(endpoint)
            rows = [r for m in matches if (r := _transform_match(m))]
            log.info("  → %d matches", len(rows))
            all_rows.extend(rows)
        except httpx.HTTPStatusError as exc:
            log.warning("  HTTP %s for %s: %s", exc.response.status_code, endpoint, exc)
        except Exception as exc:
            log.warning("  Error for %s: %s", endpoint, exc)

    log.info("Total esports rows fetched: %d", len(all_rows))

    if not all_rows:
        log.warning("No esports matches found.")
        return 0

    if dry_run:
        log.info("DRY RUN — skipping ingest.")
        return len(all_rows)

    ingested = ingest_from_dicts(all_rows)
    log.info("Ingested %d esports rows.", ingested)
    return ingested


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live esports fixtures")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
