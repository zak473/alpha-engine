"""
Backfill soccer match stats from football-data.co.uk free CSV files.

Populates core_team_match_stats with:
  shots, shots_on_target, fouls, yellow_cards, red_cards
Also fills odds_home/draw/away on core_matches if currently null.

Matching strategy: date (DD/MM/YYYY → date) + fuzzy team name within that day.

Leagues covered:
  Premier League  (E0)
  La Liga         (SP1)
  Bundesliga      (D1)
  Serie A         (I1)
  Ligue 1         (F1)

Season: 2024-25 (code "2425")

Usage:
    python -m pipelines.soccer.backfill_fdco
    python -m pipelines.soccer.backfill_fdco --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import time
from datetime import datetime, date
from difflib import SequenceMatcher
from typing import Any

import httpx
from sqlalchemy.orm import Session

from db.models.mvp import CoreLeague, CoreMatch, CoreTeam, CoreTeamMatchStats
from db.session import SessionLocal

log = logging.getLogger(__name__)

BASE_URL = "https://www.football-data.co.uk/mmz4281"

# Map our DB league name → (fdco_code, seasons_to_try)
LEAGUE_MAP = {
    "Premier League": ("E0", ["2526"]),
    "Primera Division": ("SP1", ["2526"]),
    "Bundesliga": ("D1", ["2526"]),
    "Serie A": ("I1", ["2526"]),
    "Ligue 1": ("F1", ["2526"]),
}


def _fetch_csv(code: str, season: str) -> list[dict]:
    url = f"{BASE_URL}/{season}/{code}.csv"
    log.info("Fetching %s ...", url)
    resp = httpx.get(url, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    # BOM handling
    text = resp.text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text))
    rows = [r for r in reader if r.get("HomeTeam") and r.get("AwayTeam")]
    log.info("  %d rows", len(rows))
    return rows


def _parse_date(s: str) -> date | None:
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _best_match(
    name: str, candidates: list[tuple[str, str]]  # [(team_id, team_name), ...]
) -> str | None:
    """Return the team_id whose name is most similar to `name`, if score > 0.55."""
    best_score = 0.55
    best_id = None
    for tid, tname in candidates:
        score = _similarity(name, tname)
        if score > best_score:
            best_score = score
            best_id = tid
    return best_id


def _safe_int(v: str) -> int | None:
    try:
        return int(v) if v.strip() else None
    except (ValueError, AttributeError):
        return None


def _safe_float(v: str) -> float | None:
    try:
        return float(v) if v.strip() else None
    except (ValueError, AttributeError):
        return None


def _build_team_name_map(db: Session, league_name: str) -> dict[str, str]:
    """Return {team_id: team_name} for all teams in the given league."""
    lg = db.query(CoreLeague).filter(CoreLeague.name == league_name).first()
    if not lg:
        return {}
    teams = db.query(CoreTeam).filter(CoreTeam.league_id == lg.id).all()
    return {t.id: t.name for t in teams}


def _matches_by_date(db: Session, league_name: str) -> dict[date, list[CoreMatch]]:
    """Return {date: [CoreMatch, ...]} for finished matches in the given league."""
    lg = db.query(CoreLeague).filter(CoreLeague.name == league_name).first()
    if not lg:
        return {}
    matches = (
        db.query(CoreMatch)
        .filter(CoreMatch.league_id == lg.id, CoreMatch.status == "finished")
        .all()
    )
    result: dict[date, list[CoreMatch]] = {}
    for m in matches:
        d = m.kickoff_utc.date()
        result.setdefault(d, []).append(m)
    return result


def _upsert_team_stats(
    db: Session,
    match_id: str,
    team_id: str,
    is_home: bool,
    shots: int | None,
    shots_on_target: int | None,
    fouls: int | None,
    yellow_cards: int | None,
    red_cards: int | None,
) -> None:
    row = (
        db.query(CoreTeamMatchStats)
        .filter(CoreTeamMatchStats.match_id == match_id, CoreTeamMatchStats.team_id == team_id)
        .first()
    )
    if row is None:
        row = CoreTeamMatchStats(
            match_id=match_id,
            team_id=team_id,
            is_home=is_home,
        )
        db.add(row)
    row.shots = shots
    row.shots_on_target = shots_on_target
    row.fouls = fouls
    row.yellow_cards = yellow_cards
    row.red_cards = red_cards


def process_league(
    db: Session, league_name: str, fdco_code: str, seasons: list[str], dry_run: bool
) -> int:
    team_map = _build_team_name_map(db, league_name)
    if not team_map:
        log.warning("No teams found for league: %s", league_name)
        return 0

    candidates = list(team_map.items())  # [(team_id, team_name)]
    matches_by_date = _matches_by_date(db, league_name)

    total_matched = 0

    for season in seasons:
        try:
            rows = _fetch_csv(fdco_code, season)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                log.info("  No CSV for %s/%s — skipping", fdco_code, season)
                continue
            raise

        for row in rows:
            match_date = _parse_date(row.get("Date", ""))
            if match_date is None:
                continue

            day_matches = matches_by_date.get(match_date, [])
            if not day_matches:
                continue

            home_csv = row.get("HomeTeam", "").strip()
            away_csv = row.get("AwayTeam", "").strip()

            # Find best-matching CoreMatch for this row
            best_match_obj: CoreMatch | None = None
            best_score = 0.0

            for m in day_matches:
                h_name = team_map.get(m.home_team_id, "")
                a_name = team_map.get(m.away_team_id, "")
                h_sim = _similarity(home_csv, h_name)
                a_sim = _similarity(away_csv, a_name)
                combined = (h_sim + a_sim) / 2
                if combined > best_score and combined > 0.55:
                    best_score = combined
                    best_match_obj = m

            if best_match_obj is None:
                log.debug(
                    "No DB match for %s %s vs %s", match_date, home_csv, away_csv
                )
                continue

            # Parse stats
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

            # B365 odds fallback
            b365h = _safe_float(row.get("B365H", ""))
            b365d = _safe_float(row.get("B365D", ""))
            b365a = _safe_float(row.get("B365A", ""))

            if not dry_run:
                _upsert_team_stats(
                    db, best_match_obj.id, best_match_obj.home_team_id, True,
                    hs, hst, hf, hy, hr
                )
                _upsert_team_stats(
                    db, best_match_obj.id, best_match_obj.away_team_id, False,
                    as_, ast, af, ay, ar
                )
                # Fill odds if missing
                if best_match_obj.odds_home is None and b365h:
                    best_match_obj.odds_home = b365h
                if best_match_obj.odds_draw is None and b365d:
                    best_match_obj.odds_draw = b365d
                if best_match_obj.odds_away is None and b365a:
                    best_match_obj.odds_away = b365a

            total_matched += 1
            log.debug(
                "  Matched %s %s vs %s (score=%.2f)",
                match_date, home_csv, away_csv, best_score
            )

    log.info("  %s: %d matches updated", league_name, total_matched)
    return total_matched


def run(dry_run: bool = False) -> int:
    db: Session = SessionLocal()
    total = 0
    try:
        for league_name, (fdco_code, seasons) in LEAGUE_MAP.items():
            log.info("Processing %s (%s) ...", league_name, fdco_code)
            n = process_league(db, league_name, fdco_code, seasons, dry_run)
            total += n
            if not dry_run:
                db.commit()
            time.sleep(0.5)  # be polite

        log.info("Total matched: %d rows", total)
    except Exception:
        db.rollback()
        log.exception("Backfill failed")
        raise
    finally:
        db.close()
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill soccer stats from football-data.co.uk")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(dry_run=args.dry_run)
    print(f"Done. {n} match rows updated.")


if __name__ == "__main__":
    main()
