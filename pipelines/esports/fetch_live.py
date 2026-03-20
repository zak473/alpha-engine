"""
Fetch esports fixtures + results from PandaScore.

Covers: CS2, League of Legends, Dota 2, Valorant.
Auth:   Bearer token via ESPORTS_API_KEY env var.
Source: https://developers.pandascore.co

Usage:
    python -m pipelines.esports.fetch_live
    python -m pipelines.esports.fetch_live --dry-run
    python -m pipelines.esports.fetch_live --days 7
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from config.settings import settings
from db.models.mvp import CoreMatch, CoreTeam, EsportsGameResult
from db.session import SessionLocal
from pipelines.soccer.ingest_matches import ingest_from_dicts

log = logging.getLogger(__name__)

PANDASCORE_BASE = "https://api.pandascore.co"

# PandaScore slugs → our display names + league label
GAMES = [
    ("csgo",     "CS2"),
    ("lol",      "LoL"),
    ("dota2",    "Dota 2"),
    ("valorant", "Valorant"),
]

# Status mapping: PandaScore → our CoreMatch.status
_STATUS_MAP = {
    "not_started": "scheduled",
    "running":     "live",
    "finished":    "finished",
    "canceled":    None,   # skip
    "postponed":   None,   # skip
}


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.ESPORTS_API_KEY}"}


def _get(path: str, params: dict | None = None) -> list[dict]:
    """Paginated GET — collects all pages (100 items each, up to 500 total)."""
    results: list[dict] = []
    page = 1
    while True:
        p = {"per_page": 100, "page": page, **(params or {})}
        try:
            resp = httpx.get(
                f"{PANDASCORE_BASE}{path}",
                headers=_headers(),
                params=p,
                timeout=20,
            )
            if resp.status_code == 429:
                log.warning("[pandascore] 429 — waiting 60s")
                time.sleep(60)
                continue
            resp.raise_for_status()
        except Exception as exc:
            log.warning("[pandascore] %s failed: %s", path, exc)
            break

        batch = resp.json()
        if not isinstance(batch, list) or not batch:
            break
        results.extend(batch)
        if len(batch) < 100:
            break          # last page
        page += 1
        time.sleep(0.3)    # polite rate limiting
    return results


def _transform(match: dict[str, Any], game_label: str) -> dict | None:
    """Convert a PandaScore match dict to an ingest row."""
    status_raw = match.get("status") or "not_started"
    status = _STATUS_MAP.get(status_raw)
    if status is None:
        return None   # canceled / postponed

    opponents = match.get("opponents") or []
    if len(opponents) < 2:
        return None

    home_data = opponents[0].get("opponent") or {}
    away_data = opponents[1].get("opponent") or {}
    home_name = home_data.get("name") or ""
    away_name = away_data.get("name") or ""
    home_ps_id = str(home_data.get("id") or "")
    away_ps_id = str(away_data.get("id") or "")
    if not home_name or not away_name:
        return None

    # Scores from results array (keyed by team_id)
    results = match.get("results") or []
    score_map: dict[str, int] = {}
    for r in results:
        tid = str(r.get("team_id") or r.get("id") or "")
        if tid:
            score_map[tid] = int(r.get("score") or 0)
    home_score = score_map.get(home_ps_id)
    away_score = score_map.get(away_ps_id)

    # Outcome
    outcome = ""
    winner = match.get("winner") or {}
    winner_id = str(winner.get("id") or "")
    if status == "finished" and winner_id:
        if winner_id == home_ps_id:
            outcome = "H"
        elif winner_id == away_ps_id:
            outcome = "A"

    # Kickoff — prefer begin_at, fall back to scheduled_at
    kickoff = match.get("begin_at") or match.get("scheduled_at") or ""

    # League / tournament name
    league_obj = match.get("league") or {}
    tournament_obj = match.get("tournament") or {}
    league_name = league_obj.get("name") or tournament_obj.get("name") or game_label
    league_id_raw = str(league_obj.get("id") or tournament_obj.get("id") or "")
    serie_obj = match.get("serie") or {}
    season = str(serie_obj.get("year") or "")[:4] or datetime.now().strftime("%Y")

    ps_id = str(match.get("id") or "")

    return {
        "sport":                  "esports",
        "provider_id":            f"ps-esports-{ps_id}",
        "league_provider_id":     f"ps-league-esports-{league_id_raw}",
        "league_name":            f"{game_label} — {league_name}" if league_name != game_label else game_label,
        "home_team_provider_id":  f"ps-esports-team-{home_ps_id}",
        "home_team_name":         home_name,
        "away_team_provider_id":  f"ps-esports-team-{away_ps_id}",
        "away_team_name":         away_name,
        "kickoff_utc":            kickoff,
        "status":                 status,
        "home_score":             str(home_score) if home_score is not None else "",
        "away_score":             str(away_score) if away_score is not None else "",
        "outcome":                outcome,
        "season":                 season,
        "venue":                  "",
        "odds_home":              "",
        "odds_away":              "",
        "_raw_ps_id":             ps_id,
        "_raw_home_ps_id":        home_ps_id,
        "_raw_away_ps_id":        away_ps_id,
        "_raw_games":             match.get("games") or [],
    }


def _persist_game_results(raw_rows: list[dict]) -> int:
    """
    For finished matches that have game-level data, persist EsportsGameResult rows.
    raw_rows are the dicts returned by _transform (with _raw_* private fields).
    """
    finished = [r for r in raw_rows if r.get("status") == "finished" and r.get("_raw_games")]
    if not finished:
        return 0

    session = SessionLocal()
    written = 0
    try:
        # Build provider_id → CoreMatch.id lookup
        provider_ids = [f"ps-esports-{r['_raw_ps_id']}" for r in finished]
        matches = (
            session.query(CoreMatch)
            .filter(CoreMatch.provider_id.in_(provider_ids))
            .all()
        )
        match_by_provider = {m.provider_id: m for m in matches}

        # Build ps_team_id → CoreTeam.id lookup for all teams in finished rows
        team_provider_ids = set()
        for r in finished:
            team_provider_ids.add(f"ps-esports-team-{r['_raw_home_ps_id']}")
            team_provider_ids.add(f"ps-esports-team-{r['_raw_away_ps_id']}")
        teams = (
            session.query(CoreTeam)
            .filter(CoreTeam.provider_id.in_(team_provider_ids))
            .all()
        )
        team_by_provider = {t.provider_id: t for t in teams}

        for r in finished:
            match = match_by_provider.get(f"ps-esports-{r['_raw_ps_id']}")
            if not match:
                continue
            home_team = team_by_provider.get(f"ps-esports-team-{r['_raw_home_ps_id']}")
            away_team = team_by_provider.get(f"ps-esports-team-{r['_raw_away_ps_id']}")
            if not home_team or not away_team:
                continue

            for game in r["_raw_games"]:
                if game.get("status") != "finished":
                    continue
                game_id = str(game.get("id") or "")
                provider_game_id = f"ps-game-{game_id}" if game_id else None

                # Skip if already stored (upsert via unique constraint)
                if provider_game_id:
                    existing = session.query(EsportsGameResult).filter(
                        EsportsGameResult.provider_game_id == provider_game_id
                    ).first()
                    if existing:
                        continue

                # Map name
                map_obj = game.get("map") or {}
                map_name = (map_obj.get("name") or "").lower().replace(" ", "_") or None

                # Winner
                winner_obj = game.get("winner") or {}
                winner_ps_id = str(winner_obj.get("id") or "")
                if winner_ps_id == r["_raw_home_ps_id"]:
                    winner_team_id = home_team.id
                elif winner_ps_id == r["_raw_away_ps_id"]:
                    winner_team_id = away_team.id
                else:
                    winner_team_id = None

                position = int(game.get("position") or 0) or (written + 1)

                row = EsportsGameResult(
                    match_id=match.id,
                    game_number=position,
                    map_name=map_name,
                    home_team_id=home_team.id,
                    away_team_id=away_team.id,
                    winner_team_id=winner_team_id,
                    provider_game_id=provider_game_id,
                )
                session.add(row)
                written += 1

        session.commit()
    except Exception:
        session.rollback()
        log.exception("[pandascore] Failed to persist game results")
    finally:
        session.close()

    return written


def fetch_all(dry_run: bool = False, days: int = 3) -> int:
    if not settings.ESPORTS_API_KEY:
        log.warning("[pandascore] ESPORTS_API_KEY not set — skipping")
        return 0

    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    date_to   = (now + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    all_rows: list[dict] = []

    for slug, label in GAMES:
        # Upcoming + running
        for endpoint in (f"/{slug}/matches/upcoming", f"/{slug}/matches/running"):
            matches = _get(endpoint)
            rows = [r for m in matches if (r := _transform(m, label))]
            log.info("[pandascore] %s %s: %d matches", label, endpoint.split("/")[-1], len(rows))
            all_rows.extend(rows)
            time.sleep(0.2)

        # Recent results
        matches = _get(f"/{slug}/matches/past", {
            "range[end_at]": f"{date_from},{date_to}",
            "sort": "-end_at",
        })
        rows = [r for m in matches if (r := _transform(m, label))]
        log.info("[pandascore] %s past: %d matches", label, len(rows))
        all_rows.extend(rows)
        time.sleep(0.2)

    if not all_rows:
        log.warning("[pandascore] No data returned — check API key")
        return 0

    if dry_run:
        for r in all_rows[:3]:
            log.info("  DRY RUN row: %s", r)
        return len(all_rows)

    # Strip private fields before ingest (ingest_from_dicts doesn't know about them)
    ingest_rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in all_rows]
    ingested = ingest_from_dicts(ingest_rows)
    log.info("[pandascore] Ingested %d esports rows", ingested)

    # Persist per-game (map) results for finished matches
    games_written = _persist_game_results(all_rows)
    if games_written:
        log.info("[pandascore] Stored %d esports game results", games_written)

    return ingested


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch PandaScore esports fixtures")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--days", type=int, default=3)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run, days=args.days)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
