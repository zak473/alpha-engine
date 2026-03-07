"""
Ingest historical MLB seasons from the Retrosheet game log files.

Source: https://www.retrosheet.org/gamelogs/
Format: GLYYYYMMDD.TXT (fixed-field CSV, 161 fields per game)
No API key required — data is free for non-commercial use.

Fields used (0-based index from Retrosheet spec):
  0  = Date (YYYYMMDD)
  3  = Visiting team abbrev
  6  = Home team abbrev
  9  = Visiting score (runs)
  10 = Home score (runs)
  159= Visiting league (A = AL, N = NL)
  160= Home league

Seasons loaded: 2015-2024

Usage:
    python -m pipelines.baseball.backfill_history
    python -m pipelines.baseball.backfill_history --dry-run
    python -m pipelines.baseball.backfill_history --start-year 2019 --end-year 2024
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import time
import uuid
import zipfile
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

from db.models.mvp import CoreLeague, CoreMatch, CoreTeam
from db.session import SessionLocal

log = logging.getLogger(__name__)

RETROSHEET_BASE = "https://www.retrosheet.org/gamelogs"

# MLB team abbreviation → full name
TEAM_NAMES: dict[str, str] = {
    "ANA": "Los Angeles Angels",
    "ARI": "Arizona Diamondbacks",
    "ATL": "Atlanta Braves",
    "BAL": "Baltimore Orioles",
    "BOS": "Boston Red Sox",
    "CHA": "Chicago White Sox",
    "CHN": "Chicago Cubs",
    "CIN": "Cincinnati Reds",
    "CLE": "Cleveland Guardians",
    "COL": "Colorado Rockies",
    "DET": "Detroit Tigers",
    "HOU": "Houston Astros",
    "KCA": "Kansas City Royals",
    "LAA": "Los Angeles Angels",
    "LAN": "Los Angeles Dodgers",
    "MIA": "Miami Marlins",
    "MIL": "Milwaukee Brewers",
    "MIN": "Minnesota Twins",
    "NYA": "New York Yankees",
    "NYN": "New York Mets",
    "OAK": "Oakland Athletics",
    "PHI": "Philadelphia Phillies",
    "PIT": "Pittsburgh Pirates",
    "SDN": "San Diego Padres",
    "SEA": "Seattle Mariners",
    "SFN": "San Francisco Giants",
    "SLN": "St. Louis Cardinals",
    "TBA": "Tampa Bay Rays",
    "TEX": "Texas Rangers",
    "TOR": "Toronto Blue Jays",
    "WAS": "Washington Nationals",
    # Old abbrevs that occasionally appear
    "FLO": "Miami Marlins",
    "MON": "Montreal Expos",
    "MFW": "Milwaukee Brewers",
}


def _fetch_gamelogs(year: int) -> list[list[str]]:
    """
    Download the game log zip for a given year, extract the .TXT and parse.
    Returns list of field lists (one per game).
    """
    url = f"{RETROSHEET_BASE}/gl{year}.zip"
    log.info("  Fetching %s ...", url)
    try:
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            # The file inside is typically GL{YEAR}.TXT or GLYYYYMMDD.TXT
            txt_files = [n for n in zf.namelist() if n.upper().endswith(".TXT")]
            if not txt_files:
                log.warning("    No .TXT files in zip")
                return []
            games = []
            for fname in txt_files:
                content = zf.read(fname).decode("latin-1")
                reader = csv.reader(io.StringIO(content))
                for row in reader:
                    if len(row) >= 11:  # need at least date + teams + scores
                        games.append(row)
            log.info("    %d game rows", len(games))
            return games
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            log.info("    Not found (404) — skipping %d", year)
            return []
        log.warning("    HTTP %s: %s", e.response.status_code, url)
        return []
    except zipfile.BadZipFile:
        log.warning("    Bad zip file for %d", year)
        return []
    except Exception as e:
        log.warning("    Error fetching %d: %s", year, e)
        return []


def _parse_date(s: str) -> datetime | None:
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
            sport="baseball",
            tier=1,
            is_active=True,
        )
        db.add(league)
        db.flush()
    return league.id


def _upsert_team(db: Session, provider_id: str, name: str, league_id: str) -> str:
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


def run_year(db: Session, year: int, league_id: str, dry_run: bool) -> tuple[int, int]:
    games = _fetch_gamelogs(year)
    inserted = skipped = 0

    for fields in games:
        try:
            date_str  = fields[0]   # YYYYMMDD
            vis_abbr  = fields[3].strip()
            home_abbr = fields[6].strip()

            if not vis_abbr or not home_abbr:
                skipped += 1
                continue

            # Scores
            try:
                vis_score  = int(fields[9])
                home_score = int(fields[10])
            except (ValueError, IndexError):
                skipped += 1
                continue

            dt = _parse_date(date_str)
            if dt is None:
                skipped += 1
                continue

            vis_name  = TEAM_NAMES.get(vis_abbr,  vis_abbr)
            home_name = TEAM_NAMES.get(home_abbr, home_abbr)

            provider_id = f"retrosheet-{year}-{date_str}-{vis_abbr}-vs-{home_abbr}"

            if not dry_run:
                vis_id  = _upsert_team(db, f"mlb-{vis_abbr}",  vis_name,  league_id)
                home_id = _upsert_team(db, f"mlb-{home_abbr}", home_name, league_id)

                existing = db.query(CoreMatch).filter_by(provider_id=provider_id).first()
                if existing is None:
                    outcome = (
                        "H" if home_score > vis_score else
                        "A" if vis_score > home_score else
                        "D"
                    )
                    match = CoreMatch(
                        id=str(uuid.uuid4()),
                        provider_id=provider_id,
                        league_id=league_id,
                        sport="baseball",
                        season=str(year),
                        home_team_id=home_id,
                        away_team_id=vis_id,
                        kickoff_utc=dt,
                        status="finished",
                        home_score=home_score,
                        away_score=vis_score,
                        outcome=outcome,
                        is_neutral=False,
                    )
                    db.add(match)
                    db.flush()
                    inserted += 1

        except Exception as exc:
            log.debug("  Skipping row: %s", exc)
            skipped += 1
            continue

    if not dry_run:
        db.commit()

    return inserted, skipped


def run(start_year: int = 2015, end_year: int = 2024, dry_run: bool = False) -> int:
    db: Session = SessionLocal()
    grand_total = 0

    try:
        # One MLB league record shared across all seasons
        league_pid  = "retrosheet-mlb"
        league_name = "MLB"
        if not dry_run:
            league_id = _upsert_league(db, league_pid, league_name)
            db.commit()
        else:
            league_id = "dry-run"

        for year in range(start_year, end_year + 1):
            log.info("=== MLB %d ===", year)
            inserted, skipped = run_year(db, year, league_id, dry_run)
            log.info("  inserted=%d  skipped=%d", inserted, skipped)
            grand_total += inserted
            time.sleep(0.5)

        log.info("Baseball history backfill complete. %d games ingested.", grand_total)
    except Exception:
        db.rollback()
        log.exception("Baseball history backfill failed")
        raise
    finally:
        db.close()

    return grand_total


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Retrosheet MLB historical game logs")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--start-year", type=int, default=2015)
    parser.add_argument("--end-year",   type=int, default=2024)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(start_year=args.start_year, end_year=args.end_year, dry_run=args.dry_run)
    print(f"Done. {n} games ingested.")


if __name__ == "__main__":
    main()
