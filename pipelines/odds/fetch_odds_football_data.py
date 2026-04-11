"""
Import historical match odds from football-data.co.uk (free CSV downloads).

Downloads season CSVs for all major European leagues, matches records against
CoreMatch by date + fuzzy team names, and updates CoreMatch.odds_home/away/draw
with real Pinnacle odds (or Bet365 as fallback).

URL format:  https://www.football-data.co.uk/mmz4281/{SSYY}/{LEAGUE}.csv
  e.g.       https://www.football-data.co.uk/mmz4281/2425/E0.csv  (EPL 2024-25)

No API key required — fully free.

Usage:
    python -m pipelines.odds.fetch_odds_football_data
    python -m pipelines.odds.fetch_odds_football_data --seasons 2425 2324 --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from db.models.mvp import CoreMatch, CoreTeam, CoreLeague
from db.session import SessionLocal

log = logging.getLogger(__name__)

BASE_URL = "https://www.football-data.co.uk/mmz4281"

# League code → our league name fragment (for logging only)
LEAGUES: dict[str, str] = {
    "E0":  "Premier League",
    "SP1": "La Liga",
    "D1":  "Bundesliga",
    "I1":  "Serie A",
    "F1":  "Ligue 1",
    "N1":  "Eredivisie",
    "P1":  "Primeira Liga",
    "SC0": "Scottish Premiership",
    "B1":  "Belgian First Division",
    "T1":  "Super Lig",
    "G1":  "Super League Greece",
    "E1":  "Championship",
    "E2":  "League One",
}

# Season codes (most recent first)
DEFAULT_SEASONS = ["2425", "2324", "2223", "2122"]

# Bookmaker column priority: Pinnacle → Bet365 → market average
# Column format in CSVs: {prefix}H / {prefix}D / {prefix}A
BOOK_PRIORITY = [
    ("PSH",   "PSD",   "PSA"),    # Pinnacle
    ("B365H", "B365D", "B365A"),  # Bet365
    ("BWH",   "BWD",   "BWA"),    # Betway
    ("WHH",   "WHD",   "WHA"),    # William Hill
    ("BbAvH", "BbAvD", "BbAvA"), # Market average
]

# Team name normalisation — same strips as fetch_odds.py
_STRIP = {
    "fc", "cf", "ac", "sc", "sk", "bk", "fk", "if", "ik", "bv", "sv", "vv", "rv",
    "afc", "fbc", "utd", "united", "city", "town", "club", "sporting", "athletic",
    "atletico", "athletico", "deportivo", "real", "cd", "ud", "sd", "ca", "as", "us",
}

# Manual overrides: football-data name → normalised name
_NAME_FIXES: dict[str, str] = {
    "man united":        "manchester",
    "man city":          "manchester",
    "tottenham":         "tottenham hotspur",
    "spurs":             "tottenham hotspur",
    "sheffield united":  "sheffield",
    "sheffield weds":    "sheffield wednesday",
    "wolves":            "wolverhampton",
    "brighton":          "brighton hove albion",
    "west brom":         "west bromwich",
    "luton":             "luton",
    "nott'm forest":     "nottingham",
    "nottm forest":      "nottingham",
    "newcastle":         "newcastle",
    "west ham":          "west ham",
    "aston villa":       "aston villa",
    "barcelona":         "barcelona",
    "b. dortmund":       "dortmund",
    "ein frankfurt":     "eintracht frankfurt",
    "leverkusen":        "leverkusen",
    "paris sg":          "paris saint germain",
    "p.s.g.":            "paris saint germain",
    "inter":             "inter milan",
    "milan":             "ac milan",
    "verona":            "hellas verona",
}


def _norm(name: str) -> str:
    s = name.lower().strip()
    for ch in ("-", ".", "'", "&", "/"):
        s = s.replace(ch, " ")
    for a, b in [
        ("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ü","u"),
        ("ñ","n"),("ć","c"),("č","c"),("š","s"),("ž","z"),("ø","o"),("æ","ae"),
    ]:
        s = s.replace(a, b)
    # Apply manual fixes first
    for fix_from, fix_to in _NAME_FIXES.items():
        if fix_from in s:
            s = s.replace(fix_from, fix_to)
    words = [w for w in s.split() if w not in _STRIP]
    return " ".join(words).strip() or s.strip()


def _find_match(
    db,
    home_raw: str,
    away_raw: str,
    kickoff: datetime,
) -> Optional[CoreMatch]:
    """Find CoreMatch in DB by date (±36h window) + fuzzy team names."""
    window_lo = kickoff - timedelta(hours=36)
    window_hi = kickoff + timedelta(hours=36)

    candidates = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "soccer",
            CoreMatch.kickoff_utc >= window_lo,
            CoreMatch.kickoff_utc <= window_hi,
        )
        .all()
    )

    nh = _norm(home_raw)
    na = _norm(away_raw)
    nh_words = set(nh.split())
    na_words = set(na.split())

    best: Optional[CoreMatch] = None
    best_score = 0

    for m in candidates:
        ht = db.get(CoreTeam, m.home_team_id)
        at = db.get(CoreTeam, m.away_team_id)
        if not ht or not at:
            continue
        dh = _norm(ht.name)
        da = _norm(at.name)

        if dh == nh and da == na:
            return m  # exact match

        dh_words = set(dh.split())
        da_words = set(da.split())
        h_overlap = len(nh_words & dh_words)
        a_overlap = len(na_words & da_words)
        score = h_overlap + a_overlap

        if h_overlap >= 1 and a_overlap >= 1 and score > best_score:
            best_score = score
            best = m

    return best


def _parse_odds(row: dict) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Extract (home_odds, draw_odds, away_odds) from a CSV row, using sharpest available book."""
    for h_col, d_col, a_col in BOOK_PRIORITY:
        try:
            h = float(row.get(h_col, "") or "")
            a = float(row.get(a_col, "") or "")
            d_raw = row.get(d_col, "") or ""
            d = float(d_raw) if d_raw else None
            if h > 1.0 and a > 1.0:
                return h, d, a
        except (ValueError, TypeError):
            continue
    return None, None, None


def _parse_date(date_str: str) -> Optional[datetime]:
    """Parse DD/MM/YY or DD/MM/YYYY date string to UTC datetime (noon kickoff assumed)."""
    for fmt in ("%d/%m/%y", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.replace(hour=12, minute=0, tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def fetch_season(
    league_code: str,
    season: str,
    db,
    dry_run: bool = False,
) -> tuple[int, int]:
    """
    Fetch one CSV, match against CoreMatch, update odds.
    Returns (matched, updated).
    """
    url = f"{BASE_URL}/{season}/{league_code}.csv"
    try:
        resp = httpx.get(url, timeout=20, follow_redirects=True)
        resp.raise_for_status()
    except Exception as exc:
        log.warning("  Skip %s/%s — %s", season, league_code, exc)
        return 0, 0

    # football-data CSVs are Latin-1 encoded (not UTF-8)
    content = resp.content.decode("latin-1").strip()
    reader = csv.DictReader(io.StringIO(content))
    rows = [r for r in reader if r.get("HomeTeam") and r.get("AwayTeam")]

    matched = updated = 0
    for row in rows:
        home_raw = row["HomeTeam"].strip()
        away_raw = row["AwayTeam"].strip()
        date_raw = row.get("Date", "").strip()

        kickoff = _parse_date(date_raw)
        if not kickoff:
            continue

        h_odds, d_odds, a_odds = _parse_odds(row)
        if not h_odds or not a_odds:
            continue  # no usable odds in this row

        match = _find_match(db, home_raw, away_raw, kickoff)
        if not match:
            log.debug("    No match: %s vs %s on %s", home_raw, away_raw, date_raw)
            continue

        matched += 1

        # Only update if odds are missing or we have sharper odds
        if match.odds_home and match.odds_away:
            # Already has odds — skip (don't overwrite SGO odds with CSV odds)
            continue

        log.debug(
            "    Linked: %s vs %s → home=%.2f draw=%s away=%.2f",
            home_raw, away_raw, h_odds,
            f"{d_odds:.2f}" if d_odds else "N/A", a_odds,
        )
        updated += 1
        if not dry_run:
            match.odds_home = round(h_odds, 3)
            match.odds_away = round(a_odds, 3)
            if d_odds:
                match.odds_draw = round(d_odds, 3)

    return matched, updated


def fetch_all(
    seasons: list[str] | None = None,
    leagues: list[str] | None = None,
    dry_run: bool = False,
) -> dict[str, int]:
    """
    Download all league/season CSVs and update CoreMatch odds.
    Opens a fresh DB session per league/season to avoid holding connections too long.
    Returns summary dict with total matched/updated counts.
    """
    if seasons is None:
        seasons = DEFAULT_SEASONS
    if leagues is None:
        leagues = list(LEAGUES.keys())

    total_matched = total_updated = 0

    for season in seasons:
        for code in leagues:
            league_name = LEAGUES.get(code, code)
            log.info("  Fetching %s %s ...", season, league_name)
            # Fresh session per file — avoids holding connections for minutes
            db = SessionLocal()
            try:
                matched, updated = fetch_season(code, season, db, dry_run=dry_run)
                if not dry_run:
                    db.commit()
            except Exception as exc:
                db.rollback()
                log.error("  Error on %s/%s: %s", season, code, exc)
                matched = updated = 0
            finally:
                db.close()

            total_matched += matched
            total_updated += updated
            if matched:
                log.info(
                    "    %s %s: %d matched, %d odds updated",
                    season, league_name, matched, updated,
                )

    log.info(
        "%s: %d matches linked, %d odds updated.",
        "DRY RUN" if dry_run else "football-data import complete",
        total_matched, total_updated,
    )
    return {"matched": total_matched, "updated": total_updated}


def main() -> None:
    parser = argparse.ArgumentParser(description="Import historical odds from football-data.co.uk")
    parser.add_argument("--seasons", nargs="+", default=DEFAULT_SEASONS)
    parser.add_argument("--leagues", nargs="+", default=list(LEAGUES.keys()))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    result = fetch_all(seasons=args.seasons, leagues=args.leagues, dry_run=args.dry_run)
    print(f"Done. Matched: {result['matched']}, Updated: {result['updated']}")


if __name__ == "__main__":
    main()
