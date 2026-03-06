"""
Ingest soccer matches from CSV (or dict payload) into:
  core_leagues, core_teams, core_matches

Idempotent: upserts on provider_id. Safe to re-run.

Usage:
    python -m pipelines.soccer.ingest_matches --csv data/soccer/sample_matches.csv
    python -m pipelines.soccer.ingest_matches --csv data/soccer/sample_matches.csv --dry-run
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from db.models.mvp import CoreLeague, CoreMatch, CoreTeam
from db.session import SessionLocal

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# upsert helpers
# ---------------------------------------------------------------------------

def _upsert_league(session: Session, provider_id: str, name: str, sport: str = "soccer") -> str:
    """Return CoreLeague.id for provider_id, inserting if missing."""
    league = session.query(CoreLeague).filter_by(provider_id=provider_id).first()
    if league is None:
        league = CoreLeague(name=name, provider_id=provider_id, sport=sport, tier=1, is_active=True)
        session.add(league)
        session.flush()
        log.info("  [+] league  %s (%s)", name, league.id)
    return league.id


def _upsert_team(session: Session, provider_id: str, name: str, league_id: str) -> str:
    """Return CoreTeam.id for provider_id, inserting if missing."""
    team = session.query(CoreTeam).filter_by(provider_id=provider_id).first()
    if team is None:
        team = CoreTeam(name=name, provider_id=provider_id, league_id=league_id, is_active=True)
        session.add(team)
        session.flush()
        log.info("  [+] team    %s (%s)", name, team.id)
    return team.id


def _upsert_match(session: Session, row: dict[str, Any], league_id: str, home_team_id: str, away_team_id: str) -> None:
    """Insert or update a CoreMatch. Upsert key = provider_id."""
    import json as _json

    match = session.query(CoreMatch).filter_by(provider_id=row["provider_id"]).first()

    kickoff = datetime.fromisoformat(row["kickoff_utc"])
    home_score = int(row["home_score"]) if row.get("home_score") else None
    away_score = int(row["away_score"]) if row.get("away_score") else None
    outcome = row.get("outcome") or None
    status = row.get("status", "scheduled")
    odds_home = float(row["odds_home"]) if row.get("odds_home") else None
    odds_away = float(row["odds_away"]) if row.get("odds_away") else None
    odds_draw = float(row["odds_draw"]) if row.get("odds_draw") else None

    # Live state fields — only meaningful when status is "live"
    raw_live_clock = row.get("live_clock") or None
    live_clock = raw_live_clock if (status == "live" and raw_live_clock) else None
    raw_period = row.get("current_period")
    current_period = int(raw_period) if (status == "live" and raw_period not in (None, "", "None")) else None

    # current_state_json may arrive as a dict (programmatic) or a JSON string (CSV round-trip)
    raw_state = row.get("current_state_json")
    if status == "live" and raw_state not in (None, "", "None"):
        if isinstance(raw_state, dict):
            current_state_json = raw_state
        else:
            try:
                current_state_json = _json.loads(raw_state)
            except Exception:
                current_state_json = None
    else:
        current_state_json = None

    if match is None:
        match = CoreMatch(
            provider_id=row["provider_id"],
            league_id=league_id,
            season=row.get("season"),
            sport=row.get("sport", "soccer"),
            home_team_id=home_team_id,
            away_team_id=away_team_id,
            kickoff_utc=kickoff,
            status=status,
            home_score=home_score,
            away_score=away_score,
            outcome=outcome,
            venue=row.get("venue") or None,
            is_neutral=False,
            odds_home=odds_home,
            odds_away=odds_away,
            odds_draw=odds_draw,
            live_clock=live_clock,
            current_period=current_period,
            current_state_json=current_state_json,
        )
        session.add(match)
        log.info("  [+] match   %s  %s vs %s  (%s)", row["provider_id"], row["home_team_name"], row["away_team_name"], status)
    else:
        # Update mutable fields
        match.status = status
        match.home_score = home_score
        match.away_score = away_score
        match.outcome = outcome
        if odds_home is not None:
            match.odds_home = odds_home
        if odds_away is not None:
            match.odds_away = odds_away
        if odds_draw is not None:
            match.odds_draw = odds_draw
        # Update live state — clear when not live, set when live
        match.live_clock = live_clock
        match.current_period = current_period
        match.current_state_json = current_state_json
        log.debug("  [~] match   %s  updated", row["provider_id"])


# ---------------------------------------------------------------------------
# main ingest function
# ---------------------------------------------------------------------------

def ingest_from_csv(csv_path: Path, dry_run: bool = False) -> int:
    """
    Load a CSV file and upsert all rows.
    Returns number of matches processed.
    """
    session: Session = SessionLocal()
    count = 0
    try:
        with open(csv_path, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                sport      = row.get("sport", "soccer")
                league_id  = _upsert_league(session, row["league_provider_id"], row["league_name"], sport)
                home_id    = _upsert_team(session, row["home_team_provider_id"], row["home_team_name"], league_id)
                away_id    = _upsert_team(session, row["away_team_provider_id"], row["away_team_name"], league_id)
                _upsert_match(session, row, league_id, home_id, away_id)
                count += 1

        if dry_run:
            log.info("DRY RUN — rolling back %d rows", count)
            session.rollback()
        else:
            session.commit()
            log.info("Committed %d matches.", count)
    except Exception:
        session.rollback()
        log.exception("Ingestion failed — rolled back")
        raise
    finally:
        session.close()

    return count


def ingest_from_dicts(rows: list[dict[str, Any]]) -> int:
    """Programmatic entry point — accepts a list of dicts with the same keys as the CSV."""
    import tempfile, csv as _csv
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="") as fh:
        writer = _csv.DictWriter(fh, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        tmp_path = Path(fh.name)
    return ingest_from_csv(tmp_path)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest soccer matches into core_* tables")
    parser.add_argument("--csv", required=True, help="Path to matches CSV")
    parser.add_argument("--dry-run", action="store_true", help="Parse & validate without writing")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        log.error("CSV not found: %s", csv_path)
        sys.exit(1)

    log.info("Ingesting matches from %s ...", csv_path)
    n = ingest_from_csv(csv_path, dry_run=args.dry_run)
    log.info("Done. %d matches processed.", n)


if __name__ == "__main__":
    main()
