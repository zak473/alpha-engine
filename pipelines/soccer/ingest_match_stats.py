"""
Ingest per-team match statistics into core_team_match_stats.

Expects the match rows to already be present (run ingest_matches.py first).
Upsert key: (match_id, team_id).

Usage:
    python -m pipelines.soccer.ingest_match_stats --csv data/soccer/sample_match_stats.csv
    python -m pipelines.soccer.ingest_match_stats --csv data/soccer/sample_match_stats.csv --dry-run
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch, CoreTeam, CoreTeamMatchStats
from db.session import SessionLocal

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _float(val: str) -> Optional[float]:
    return float(val) if val not in ("", None) else None


def _int(val: str) -> Optional[int]:
    return int(val) if val not in ("", None) else None


def _bool(val: str) -> bool:
    return val.strip() in ("1", "true", "True", "yes")


def _resolve_ids(session: Session, match_provider_id: str, team_provider_id: str) -> tuple[str, str]:
    """Resolve provider IDs → internal UUIDs. Raises ValueError if not found."""
    match = session.query(CoreMatch).filter_by(provider_id=match_provider_id).first()
    if match is None:
        raise ValueError(f"Match not found: {match_provider_id!r}. Run ingest_matches.py first.")

    team = session.query(CoreTeam).filter_by(provider_id=team_provider_id).first()
    if team is None:
        raise ValueError(f"Team not found: {team_provider_id!r}. Run ingest_matches.py first.")

    return match.id, team.id


def _upsert_stats(session: Session, match_id: str, team_id: str, row: dict[str, Any]) -> None:
    """Insert or update CoreTeamMatchStats row."""
    stats = (
        session.query(CoreTeamMatchStats)
        .filter_by(match_id=match_id, team_id=team_id)
        .first()
    )

    data = dict(
        is_home=_bool(row["is_home"]),
        goals=_int(row.get("goals")),
        goals_conceded=_int(row.get("goals_conceded")),
        shots=_int(row.get("shots")),
        shots_on_target=_int(row.get("shots_on_target")),
        xg=_float(row.get("xg")),
        xga=_float(row.get("xga")),
        np_xg=_float(row.get("np_xg")),
        possession_pct=_float(row.get("possession_pct")),
        passes_completed=_int(row.get("passes_completed")),
        pass_accuracy_pct=_float(row.get("pass_accuracy_pct")),
        ppda=_float(row.get("ppda")),
        fouls=_int(row.get("fouls")),
        yellow_cards=_int(row.get("yellow_cards")),
        red_cards=_int(row.get("red_cards")),
    )

    if stats is None:
        stats = CoreTeamMatchStats(match_id=match_id, team_id=team_id, **data)
        session.add(stats)
        log.debug("  [+] stats  match=%s  team=%s", match_id[:8], team_id[:8])
    else:
        for k, v in data.items():
            setattr(stats, k, v)
        log.debug("  [~] stats  match=%s  team=%s  updated", match_id[:8], team_id[:8])


# ---------------------------------------------------------------------------
# main ingest function
# ---------------------------------------------------------------------------

def ingest_from_csv(csv_path: Path, dry_run: bool = False) -> int:
    session: Session = SessionLocal()
    count = 0
    errors = 0
    try:
        with open(csv_path, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                try:
                    match_id, team_id = _resolve_ids(
                        session,
                        row["match_provider_id"],
                        row["team_provider_id"],
                    )
                    _upsert_stats(session, match_id, team_id, row)
                    count += 1
                except ValueError as exc:
                    log.warning("  SKIP  %s", exc)
                    errors += 1

        if dry_run:
            log.info("DRY RUN — rolling back %d rows (%d skipped)", count, errors)
            session.rollback()
        else:
            session.commit()
            log.info("Committed %d stat rows. Skipped: %d.", count, errors)
    except Exception:
        session.rollback()
        log.exception("Ingestion failed — rolled back")
        raise
    finally:
        session.close()

    return count


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest match stats into core_team_match_stats")
    parser.add_argument("--csv", required=True, help="Path to match stats CSV")
    parser.add_argument("--dry-run", action="store_true", help="Parse & validate without writing")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        log.error("CSV not found: %s", csv_path)
        sys.exit(1)

    log.info("Ingesting match stats from %s ...", csv_path)
    n = ingest_from_csv(csv_path, dry_run=args.dry_run)
    log.info("Done. %d stat rows processed.", n)


if __name__ == "__main__":
    main()
