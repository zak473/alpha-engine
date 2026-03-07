"""
Ingest historical tennis matches from Jeff Sackmann's freely available ATP/WTA
GitHub repositories.

Sources (no API key required, MIT/CC0 licensed):
  ATP: https://github.com/JeffSackmann/tennis_atp
  WTA: https://github.com/JeffSackmann/tennis_wta

Files downloaded: atp_matches_YYYY.csv / wta_matches_YYYY.csv
Seasons: 2015-2024

Each row maps to a CoreMatch (finished) and two CoreTeam (player) records.
Surface is stored in match context via league name.

Usage:
    python -m pipelines.tennis.backfill_history
    python -m pipelines.tennis.backfill_history --dry-run
    python -m pipelines.tennis.backfill_history --start-year 2018 --end-year 2024
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import time
import uuid
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

from db.models.mvp import CoreLeague, CoreMatch, CoreTeam
from db.session import SessionLocal

log = logging.getLogger(__name__)

ATP_BASE = "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master"
WTA_BASE = "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master"

# Surface slug → full surface name
SURFACE_NAMES = {
    "Hard": "hard",
    "Clay": "clay",
    "Grass": "grass",
    "Carpet": "hard",  # carpet is effectively indoor hard
}

# tourney_level → importance hint (for league naming)
TOURNEY_LEVEL_NAME = {
    "G": "Grand Slam",
    "M": "Masters 1000",
    "A": "ATP 500",
    "250": "ATP 250",
    "D": "Davis Cup",
    "F": "Tour Finals",
    "C": "Challenger",
    "S": "Satellite / ITF",
    "": "Tour",
}


def _fetch_csv(url: str) -> list[dict]:
    log.info("  Fetching %s ...", url)
    try:
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        text = resp.text.lstrip("\ufeff")
        rows = list(csv.DictReader(io.StringIO(text)))
        # Filter to rows that have both player names and scores
        rows = [r for r in rows if r.get("winner_name") and r.get("loser_name") and r.get("score")]
        log.info("    %d valid rows", len(rows))
        return rows
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            log.info("    Not found (404) — skipping")
            return []
        log.warning("    HTTP %s: %s", e.response.status_code, url)
        return []
    except Exception as e:
        log.warning("    Error fetching %s: %s", url, e)
        return []


def _parse_date(s: str) -> datetime | None:
    """Parse tourney_date like '20231030'."""
    try:
        return datetime.strptime(s[:8], "%Y%m%d")
    except Exception:
        return None


def _upsert_league(db: Session, provider_id: str, name: str) -> str:
    league = db.query(CoreLeague).filter_by(provider_id=provider_id).first()
    if league is None:
        league = CoreLeague(
            name=name,
            provider_id=provider_id,
            sport="tennis",
            tier=1,
            is_active=True,
        )
        db.add(league)
        db.flush()
    return league.id


def _upsert_player(db: Session, provider_id: str, name: str, league_id: str) -> str:
    team = db.query(CoreTeam).filter_by(provider_id=provider_id).first()
    if team is None:
        team = CoreTeam(
            name=name,
            provider_id=provider_id,
            league_id=league_id,
            is_active=True,
        )
        db.add(team)
        db.flush()
    return team.id


def _score_to_sets(score: str) -> tuple[int, int]:
    """
    Convert score string like '6-3 7-5 6-4' to (winner_sets, loser_sets).
    Handles ret/W/O suffixes. Returns (0, 0) if unparseable.
    """
    if not score:
        return 0, 0
    # Strip retirement/walkover suffixes
    for suffix in ["RET", "W/O", "DEF", "ABN", "UNF", "AWA"]:
        score = score.replace(suffix, "").strip()

    winner_sets = loser_sets = 0
    for part in score.split():
        # Each part like "6-3" or "[7-5]" (tiebreak notation)
        part = part.strip("[]")
        if "-" in part:
            try:
                w, l = part.split("-", 1)
                # Strip superscript tiebreak like "7-6(4)"
                w = w.split("(")[0]
                l = l.split("(")[0]
                wi, li = int(w), int(l)
                if wi > li:
                    winner_sets += 1
                else:
                    loser_sets += 1
            except ValueError:
                pass
    return winner_sets, loser_sets


def run_tour(
    db: Session,
    base_url: str,
    file_prefix: str,  # "atp_matches" or "wta_matches"
    tour_tag: str,      # "atp" or "wta"
    years: list[int],
    dry_run: bool,
) -> int:
    total = 0

    for year in years:
        url = f"{base_url}/{file_prefix}_{year}.csv"
        rows = _fetch_csv(url)
        if not rows:
            time.sleep(0.5)
            continue

        inserted = skipped = 0

        for row in rows:
            winner = (row.get("winner_name") or "").strip()
            loser  = (row.get("loser_name")  or "").strip()
            if not winner or not loser:
                skipped += 1
                continue

            # Date
            dt = _parse_date(row.get("tourney_date", ""))
            if dt is None:
                skipped += 1
                continue

            # Tournament / surface
            tourney_id   = row.get("tourney_id", f"{tour_tag}-{year}")
            tourney_name = (row.get("tourney_name") or f"{tour_tag.upper()} Tour").strip()
            surface_raw  = (row.get("surface") or "Hard").strip()
            surface      = SURFACE_NAMES.get(surface_raw, "hard")
            level        = row.get("tourney_level", "")
            level_name   = TOURNEY_LEVEL_NAME.get(level, "Tour")

            # League: one per tournament/surface combo
            league_pid  = f"sackmann-{tour_tag}-{tourney_id}"
            league_name = f"{tourney_name} ({surface_raw})"

            match_num = row.get("match_num", "0")
            provider_id = f"sackmann-{tour_tag}-{tourney_id}-{year}-{match_num}-{winner.lower().replace(' ', '-')}-vs-{loser.lower().replace(' ', '-')}"

            if not dry_run:
                league_id = _upsert_league(db, league_pid, league_name)
                winner_id = _upsert_player(db, f"sackmann-{tour_tag}-player-{winner.lower().replace(' ', '-')}", winner, league_id)
                loser_id  = _upsert_player(db, f"sackmann-{tour_tag}-player-{loser.lower().replace(' ', '-')}", loser, league_id)

                existing = db.query(CoreMatch).filter_by(provider_id=provider_id).first()
                if existing is None:
                    winner_sets, loser_sets = _score_to_sets(row.get("score", ""))

                    match = CoreMatch(
                        id=str(uuid.uuid4()),
                        provider_id=provider_id,
                        league_id=league_id,
                        sport="tennis",
                        season=str(year),
                        home_team_id=winner_id,   # winner treated as "home"
                        away_team_id=loser_id,
                        kickoff_utc=dt,
                        status="finished",
                        home_score=winner_sets if winner_sets or loser_sets else None,
                        away_score=loser_sets  if winner_sets or loser_sets else None,
                        outcome="H",              # winner always wins
                        is_neutral=True,          # tennis has no home court
                    )
                    db.add(match)
                    db.flush()
                    inserted += 1

            total += 1

        if not dry_run:
            db.commit()

        log.info("  %s %d: %d inserted, %d skipped", file_prefix, year, inserted, skipped)
        time.sleep(0.4)

    return total


def run(start_year: int = 2015, end_year: int = 2024, dry_run: bool = False) -> int:
    db: Session = SessionLocal()
    years = list(range(start_year, end_year + 1))
    grand_total = 0
    try:
        log.info("=== ATP matches %d–%d ===", start_year, end_year)
        grand_total += run_tour(db, ATP_BASE, "atp_matches", "atp", years, dry_run)

        log.info("=== WTA matches %d–%d ===", start_year, end_year)
        grand_total += run_tour(db, WTA_BASE, "wta_matches", "wta", years, dry_run)

        log.info("Tennis history backfill complete. %d total rows.", grand_total)
    except Exception:
        db.rollback()
        log.exception("Tennis history backfill failed")
        raise
    finally:
        db.close()
    return grand_total


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Jeff Sackmann ATP/WTA historical data")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--start-year", type=int, default=2015)
    parser.add_argument("--end-year",   type=int, default=2024)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(start_year=args.start_year, end_year=args.end_year, dry_run=args.dry_run)
    print(f"Done. {n} match rows processed.")


if __name__ == "__main__":
    main()
