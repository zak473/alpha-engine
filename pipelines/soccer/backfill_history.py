"""
Ingest historical soccer seasons from football-data.co.uk CSVs.

Downloads multiple seasons per league and creates CoreMatch records,
fuzzy-matching team names to existing CoreTeam records in the DB.
Also populates CoreTeamMatchStats with shots/cards.

Seasons loaded: 2022-23, 2023-24, 2024-25 (in addition to current 2025-26)

Usage:
    python -m pipelines.soccer.backfill_history
    python -m pipelines.soccer.backfill_history --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import time
import uuid
from datetime import datetime, date
from difflib import SequenceMatcher
from typing import Any

import httpx
from sqlalchemy.orm import Session

from db.models.mvp import CoreLeague, CoreMatch, CoreTeam, CoreTeamMatchStats
from db.session import SessionLocal

log = logging.getLogger(__name__)

BASE_URL = "https://www.football-data.co.uk/mmz4281"

# (fdco_code, db_league_name, seasons_to_load)
LEAGUES = [
    ("E0",  "Premier League",    ["2324", "2425"]),
    ("SP1", "Primera Division",  ["2324", "2425"]),
    ("D1",  "Bundesliga",        ["2324", "2425"]),
    ("I1",  "Serie A",           ["2324", "2425"]),
    ("F1",  "Ligue 1",           ["2324", "2425"]),
]

# Outcome map
_NORM = {"H": "H", "D": "D", "A": "A"}


def _fetch_csv(code: str, season: str) -> list[dict]:
    url = f"{BASE_URL}/{season}/{code}.csv"
    log.info("  Fetching %s ...", url)
    try:
        resp = httpx.get(url, timeout=20, follow_redirects=True)
        resp.raise_for_status()
        text = resp.text.lstrip("\ufeff")
        rows = [r for r in csv.DictReader(io.StringIO(text)) if r.get("HomeTeam") and r.get("AwayTeam") and r.get("FTHG")]
        log.info("    %d rows", len(rows))
        return rows
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            log.info("    No CSV for %s/%s — skipping", code, season)
            return []
        raise


def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _find_team(name: str, candidates: list[tuple[str, str]]) -> str | None:
    """Find team_id for name from [(team_id, team_name)] candidates. Threshold 0.55."""
    best_score, best_id = 0.55, None
    for tid, tname in candidates:
        s = _sim(name, tname)
        if s > best_score:
            best_score, best_id = s, tid
    return best_id


def _parse_date(s: str) -> date | None:
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _safe_int(v: str) -> int | None:
    try:
        return int(v) if v and v.strip() else None
    except ValueError:
        return None


def _safe_float(v: str) -> float | None:
    try:
        return float(v) if v and v.strip() else None
    except ValueError:
        return None


def _season_label(fdco_season: str) -> str:
    """Convert '2324' → '2023-24'"""
    y1, y2 = fdco_season[:2], fdco_season[2:]
    return f"20{y1}-{y2}"


def run_league(
    db: Session,
    fdco_code: str,
    league_name: str,
    seasons: list[str],
    dry_run: bool,
) -> int:
    # Get or create league
    league = db.query(CoreLeague).filter(CoreLeague.name == league_name).first()
    if league is None:
        log.warning("League not found in DB: %s — skipping", league_name)
        return 0

    # Build team candidates from this league
    teams = db.query(CoreTeam).filter(CoreTeam.league_id == league.id).all()
    candidates = [(t.id, t.name) for t in teams]
    log.info("%s: %d teams available for matching", league_name, len(candidates))

    total = 0

    for fdco_season in seasons:
        rows = _fetch_csv(fdco_code, fdco_season)
        season_label = _season_label(fdco_season)
        inserted = skipped = stats_added = 0

        for row in rows:
            match_date = _parse_date(row.get("Date", ""))
            if match_date is None:
                skipped += 1
                continue

            home_name = row["HomeTeam"].strip()
            away_name = row["AwayTeam"].strip()

            home_id = _find_team(home_name, candidates)
            away_id = _find_team(away_name, candidates)

            if not home_id or not away_id or home_id == away_id:
                log.debug("  Unmatched/collision: %s vs %s", home_name, away_name)
                skipped += 1
                continue

            # Build kickoff datetime (assume 15:00 UTC if no time in CSV)
            time_str = row.get("Time", "").strip()
            if time_str:
                try:
                    hour, minute = map(int, time_str.split(":"))
                except Exception:
                    hour, minute = 15, 0
            else:
                hour, minute = 15, 0
            kickoff = datetime(match_date.year, match_date.month, match_date.day, hour, minute)

            # Build provider_id from CSV source
            provider_id = f"fdco-{fdco_code}-{fdco_season}-{home_name.lower().replace(' ', '-')}-vs-{away_name.lower().replace(' ', '-')}-{match_date.isoformat()}"

            # Check if match already exists
            existing = db.query(CoreMatch).filter_by(provider_id=provider_id).first()

            # Parse scores and outcome
            fthg = _safe_int(row.get("FTHG", ""))
            ftag = _safe_int(row.get("FTAG", ""))
            ftr = row.get("FTR", "").strip()  # H / D / A

            b365h = _safe_float(row.get("B365H", ""))
            b365d = _safe_float(row.get("B365D", ""))
            b365a = _safe_float(row.get("B365A", ""))

            if not dry_run:
                if existing is None:
                    match = CoreMatch(
                        id=str(uuid.uuid4()),
                        provider_id=provider_id,
                        league_id=league.id,
                        sport="soccer",
                        season=season_label,
                        home_team_id=home_id,
                        away_team_id=away_id,
                        kickoff_utc=kickoff,
                        status="finished",
                        home_score=fthg,
                        away_score=ftag,
                        outcome=ftr or None,
                        odds_home=b365h,
                        odds_draw=b365d,
                        odds_away=b365a,
                        is_neutral=False,
                    )
                    db.add(match)
                    db.flush()
                    match_id = match.id
                    inserted += 1
                else:
                    match_id = existing.id

                # Upsert stats
                hs = _safe_int(row.get("HS", ""))
                as_ = _safe_int(row.get("AS", ""))
                hst = _safe_int(row.get("HST", ""))
                ast = _safe_int(row.get("AST", ""))
                hf = _safe_int(row.get("HF", ""))
                af = _safe_int(row.get("AF", ""))
                hy = _safe_int(row.get("HY", ""))
                ay = _safe_int(row.get("AY", ""))
                hr = _safe_int(row.get("HR", ""))
                ar = _safe_int(row.get("AR", ""))

                for (tid, is_home, shots, sot, fouls, yc, rc) in [
                    (home_id, True,  hs,  hst, hf, hy, hr),
                    (away_id, False, as_, ast, af, ay, ar),
                ]:
                    s = db.query(CoreTeamMatchStats).filter_by(match_id=match_id, team_id=tid).first()
                    if s is None:
                        s = CoreTeamMatchStats(match_id=match_id, team_id=tid, is_home=is_home)
                        db.add(s)
                    s.shots = shots
                    s.shots_on_target = sot
                    s.fouls = fouls
                    s.yellow_cards = yc
                    s.red_cards = rc
                    stats_added += 1

            total += 1

        log.info("  %s %s: %d inserted, %d skipped, %d stats rows",
                 league_name, season_label, inserted, skipped, stats_added)
        if not dry_run:
            db.commit()
        time.sleep(0.3)

    return total


def run(dry_run: bool = False) -> int:
    db: Session = SessionLocal()
    grand_total = 0
    try:
        for fdco_code, league_name, seasons in LEAGUES:
            log.info("=== %s (%s) ===", league_name, fdco_code)
            n = run_league(db, fdco_code, league_name, seasons, dry_run)
            grand_total += n

        log.info("History backfill complete. %d total rows processed.", grand_total)
    except Exception:
        db.rollback()
        log.exception("History backfill failed")
        raise
    finally:
        db.close()
    return grand_total


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest historical soccer seasons")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(dry_run=args.dry_run)
    print(f"Done. {n} match rows processed.")


if __name__ == "__main__":
    main()
