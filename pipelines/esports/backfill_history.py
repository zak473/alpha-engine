"""
Fetch historical esports match results from PandaScore for ELO cold-start.

Fetches up to 50 pages (5000 matches) of past matches per game,
going as far back as PandaScore's free tier allows.

Usage:
    python -m pipelines.esports.backfill_history
    python -m pipelines.esports.backfill_history --games cs-go valorant
    python -m pipelines.esports.backfill_history --dry-run
"""

from __future__ import annotations

import argparse
import logging
import time
from typing import Optional

import httpx

from config.settings import settings
from pipelines.esports.fetch_live import _get, _transform_match
from pipelines.soccer.ingest_matches import ingest_from_dicts

log = logging.getLogger(__name__)

BASE_URL = "https://api.pandascore.co"

# Games to backfill by default
GAME_SLUGS = ["csgo", "lol", "dota2", "valorant", "r6siege"]

# Seconds to sleep between page requests — free tier is 100 req/hour
_PAGE_SLEEP = 0.5


# ---------------------------------------------------------------------------
# Per-page fetch (does NOT use the auto-paginating _get from fetch_live)
# ---------------------------------------------------------------------------

def _get_page(path: str, params: dict) -> list:
    """
    Fetch a single page from PandaScore.
    Raises httpx.HTTPStatusError on non-2xx responses.
    """
    url = f"{BASE_URL}{path}"
    headers = {"Authorization": f"Bearer {settings.ESPORTS_API_KEY}"}
    resp = httpx.get(url, headers=headers, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Main backfill function
# ---------------------------------------------------------------------------

def fetch_all(
    games: Optional[list[str]] = None,
    max_pages: int = 50,
    dry_run: bool = False,
) -> int:
    """
    Deep-paginate PandaScore /matches/past for each game slug and ingest
    the results into the database.

    Args:
        games:     List of videogame slugs to fetch. Defaults to GAME_SLUGS.
        max_pages: Maximum number of pages to fetch per game (100 results/page).
        dry_run:   If True, skip database writes and return row count only.

    Returns:
        Total number of rows ingested (or fetched in dry-run mode).
    """
    if not settings.ESPORTS_API_KEY:
        log.error(
            "ESPORTS_API_KEY not set. "
            "Get a free token at https://pandascore.co (Dashboard → API token)"
        )
        return 0

    target_games = games if games is not None else GAME_SLUGS
    total_ingested = 0

    for game_slug in target_games:
        log.info("Backfilling historical matches for game: %s", game_slug)
        game_rows: list[dict] = []

        for page in range(1, max_pages + 1):
            params = {
                "per_page": 100,
                "page": page,
            }
            try:
                data = _get_page(f"/{game_slug}/matches/past", params)
            except httpx.HTTPStatusError as exc:
                log.warning(
                    "  HTTP %s on page %d for %s: %s",
                    exc.response.status_code, page, game_slug, exc,
                )
                break
            except Exception as exc:
                log.warning(
                    "  Error on page %d for %s: %s", page, game_slug, exc
                )
                break

            if not data:
                log.info("  Page %d: empty — stopping early.", page)
                break

            rows = [r for m in data if (r := _transform_match(m))]
            log.info("  Page %d: %d raw matches → %d valid rows", page, len(data), len(rows))
            game_rows.extend(rows)

            # Stop early if the page was not full (end of available data)
            if len(data) < 100:
                log.info("  Page %d returned %d results (< 100) — end of data.", page, len(data))
                break

            # Rate-limit courtesy sleep between pages
            time.sleep(_PAGE_SLEEP)

        log.info(
            "Game %s: %d total rows fetched across pages.", game_slug, len(game_rows)
        )

        if not game_rows:
            continue

        if dry_run:
            log.info("DRY RUN — skipping ingest for %s.", game_slug)
            total_ingested += len(game_rows)
        else:
            ingested = ingest_from_dicts(game_rows)
            log.info("Ingested %d rows for %s.", ingested, game_slug)
            total_ingested += ingested

    log.info("Backfill complete. Total rows processed: %d", total_ingested)
    return total_ingested


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill historical esports match results from PandaScore"
    )
    parser.add_argument(
        "--games",
        nargs="+",
        default=None,
        metavar="SLUG",
        help=(
            "Space-separated list of videogame slugs to fetch "
            f"(default: {' '.join(GAME_SLUGS)})"
        ),
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=50,
        help="Maximum pages to fetch per game (100 results/page, default: 50)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and transform matches but skip database writes",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(games=args.games, max_pages=args.max_pages, dry_run=args.dry_run)
    print(f"Done. {n} rows processed.")


if __name__ == "__main__":
    main()
