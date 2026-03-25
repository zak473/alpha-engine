"""
Fetch real market odds from SportsGameOdds (SGO) and update CoreMatch.odds_home/away/draw.

Covers all sports we track: soccer, basketball, baseball, hockey, tennis.
Runs as part of the _job_fetch_odds scheduler cycle so auto_picks.py gets real odds.

Usage:
    python -m pipelines.odds.fetch_odds_sgo
    python -m pipelines.odds.fetch_odds_sgo --dry-run
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from config.settings import settings
from db.models.mvp import CoreMatch, CoreTeam
from db.session import SessionLocal

log = logging.getLogger(__name__)

BASE_URL = "https://api.sportsgameodds.com/v2"

# SGO leagueID → our sport slug
LEAGUE_SPORT: dict[str, str] = {
    # Soccer
    "EPL":                   "soccer",
    "LA_LIGA":               "soccer",
    "BUNDESLIGA":            "soccer",
    "FR_LIGUE_1":            "soccer",
    "IT_SERIA_A":            "soccer",
    "UEFA_CHAMPIONS_LEAGUE": "soccer",
    "UEFA_EUROPA_LEAGUE":    "soccer",
    "MLS":                   "soccer",
    # Basketball
    "NBA":                   "basketball",
    # Baseball
    "MLB":                   "baseball",
    # Hockey
    "NHL":                   "hockey",
    # Tennis
    "ATP":                   "tennis",
    "WTA":                   "tennis",
}

# SGO oddID keys for main market lines
HOME_ODD_KEYS = [
    "points-home-reg-ml3way-home",  # soccer 1X2
    "points-home-game-ml-home",     # moneyline (basketball/baseball/hockey/tennis)
]
AWAY_ODD_KEYS = [
    "points-away-reg-ml3way-away",
    "points-away-game-ml-away",
]
DRAW_ODD_KEY = "points-all-reg-ml3way-draw"


def _american_to_decimal(american: str) -> Optional[float]:
    """Convert American odds string to decimal odds."""
    try:
        n = int(american.replace("+", ""))
    except (ValueError, AttributeError):
        return None
    if n == 0:
        return None
    if n > 0:
        return round(n / 100 + 1, 4)
    return round(100 / abs(n) + 1, 4)


def _extract_odds(event: dict) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Extract (home, away, draw) decimal odds from an SGO event dict."""
    odds: dict = event.get("odds") or {}
    home_dec = None
    away_dec = None
    draw_dec = None

    for key in HOME_ODD_KEYS:
        o = odds.get(key)
        if o and o.get("bookOddsAvailable"):
            home_dec = _american_to_decimal(o.get("bookOdds", ""))
            if home_dec:
                break

    for key in AWAY_ODD_KEYS:
        o = odds.get(key)
        if o and o.get("bookOddsAvailable"):
            away_dec = _american_to_decimal(o.get("bookOdds", ""))
            if away_dec:
                break

    o = odds.get(DRAW_ODD_KEY)
    if o and o.get("bookOddsAvailable"):
        draw_dec = _american_to_decimal(o.get("bookOdds", ""))

    return home_dec, away_dec, draw_dec


def _normalize(name: str) -> str:
    import re
    import unicodedata
    # Strip accents (e.g. é→e, ü→u, ñ→n)
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = nfkd.encode("ascii", "ignore").decode("ascii")
    # Expand common abbreviations before stripping
    expanded = re.sub(r"\butd\b", "united", ascii_name, flags=re.IGNORECASE)
    expanded = re.sub(r"\bspurs\b", "tottenham", expanded, flags=re.IGNORECASE)
    expanded = re.sub(r"\bpsg\b", "paris saint germain", expanded, flags=re.IGNORECASE)
    expanded = re.sub(r"\bman\s+utd\b", "manchester united", expanded, flags=re.IGNORECASE)
    expanded = re.sub(r"\bman\s+city\b", "manchester city", expanded, flags=re.IGNORECASE)
    # Strip club suffixes
    stripped = re.sub(r"\b(fc|afc|cf|ac|as|sc|cd|rsc|fk|sk|bk|hc|sfc|rfc|bfc|united kingdom)\b", "", expanded, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]", " ", stripped.lower())).strip()


def _acronym_matches(short: str, long_name: str) -> bool:
    """Check if `short` is an acronym of words in `long_name` (e.g. 'mcfc' ~ 'manchester city')."""
    words = [w for w in long_name.split() if len(w) > 1]
    if not words:
        return False
    acronym = "".join(w[0] for w in words)
    return short == acronym or short == acronym[:len(short)]


def _teams_match(a: str, b: str) -> bool:
    na, nb = _normalize(a), _normalize(b)
    if na == nb:
        return True
    # Substring match (longer must contain shorter)
    if len(na) > 3 and nb.find(na) >= 0:
        return True
    if len(nb) > 3 and na.find(nb) >= 0:
        return True
    # Acronym match (e.g. "PSG" vs "Paris Saint Germain")
    if len(na) >= 2 and len(na) <= 5 and _acronym_matches(na, nb):
        return True
    if len(nb) >= 2 and len(nb) <= 5 and _acronym_matches(nb, na):
        return True
    # Word overlap — for tennis: last name is the key signal
    wa = [w for w in na.split() if len(w) > 2]
    wb = set(nb.split())
    if bool(wa) and any(w in wb for w in wa):
        return True
    # Tennis last-name match: compare last word of each name
    a_parts = na.split()
    b_parts = nb.split()
    if a_parts and b_parts and a_parts[-1] == b_parts[-1] and len(a_parts[-1]) > 3:
        return True
    # Fuzzy fallback via SequenceMatcher (handles typos + minor differences)
    from difflib import SequenceMatcher
    ratio = SequenceMatcher(None, na, nb).ratio()
    return ratio >= 0.82


def fetch_sgo_events(league_id: str, client: httpx.Client) -> list[dict]:
    """Fetch upcoming events with odds for a single league from SGO."""
    try:
        resp = client.get(
            f"{BASE_URL}/events/",
            params={
                "apiKey": settings.SGO_API_KEY,
                "leagueID": league_id,
                "oddsAvailable": "true",
            },
            timeout=15,
        )
        if resp.status_code != 200:
            log.warning("[sgo_odds] %s returned HTTP %s", league_id, resp.status_code)
            return []
        data = resp.json()
        return data.get("data") or []
    except Exception as exc:
        log.warning("[sgo_odds] %s fetch error: %s", league_id, exc)
        return []


def fetch_all(dry_run: bool = False) -> int:
    """
    Fetch SGO odds for all leagues, match events to CoreMatch rows by team name + date,
    and update odds_home/away/draw. Returns number of matches updated.
    """
    if not settings.SGO_API_KEY:
        log.info("[sgo_odds] SGO_API_KEY not set — skipping.")
        return 0

    db = SessionLocal()
    updated = 0
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(days=7)

    try:
        # Pre-load all upcoming/live CoreMatch rows with their team names
        upcoming = (
            db.query(CoreMatch)
            .filter(
                CoreMatch.status.in_(["scheduled", "live"]),
                CoreMatch.kickoff_utc >= now - timedelta(hours=2),
                CoreMatch.kickoff_utc <= window_end,
            )
            .all()
        )
        if not upcoming:
            log.info("[sgo_odds] No upcoming matches in DB — nothing to update.")
            return 0

        # Build lookup: match_id → (home_team_name, away_team_name)
        team_ids = set()
        for m in upcoming:
            team_ids.add(m.home_team_id)
            team_ids.add(m.away_team_id)
        teams = {t.id: t.name for t in db.query(CoreTeam).filter(CoreTeam.id.in_(team_ids)).all()}

        with httpx.Client() as client:
            for league_id, sport in LEAGUE_SPORT.items():
                events = fetch_sgo_events(league_id, client)
                if not events:
                    time.sleep(0.3)
                    continue

                sport_matches = [m for m in upcoming if m.sport == sport]

                for event in events:
                    sgo_status = event.get("status") or {}
                    # Skip finished/cancelled
                    if sgo_status.get("ended") or sgo_status.get("cancelled"):
                        continue

                    starts_at_raw = sgo_status.get("startsAt")
                    try:
                        n = int(starts_at_raw)
                        sgo_kickoff = datetime.fromtimestamp(n, tz=timezone.utc)
                    except (TypeError, ValueError):
                        try:
                            sgo_kickoff = datetime.fromisoformat(str(starts_at_raw).replace("Z", "+00:00"))
                        except Exception:
                            continue

                    sgo_home = (event.get("teams") or {}).get("home", {}).get("names", {}).get("long", "")
                    sgo_away = (event.get("teams") or {}).get("away", {}).get("names", {}).get("long", "")
                    if not sgo_home or not sgo_away:
                        continue

                    home_dec, away_dec, draw_dec = _extract_odds(event)
                    if not home_dec or not away_dec:
                        continue

                    # Find matching CoreMatch within ±12h
                    best: Optional[CoreMatch] = None
                    for m in sport_matches:
                        home_name = teams.get(m.home_team_id, "")
                        away_name = teams.get(m.away_team_id, "")
                        if not _teams_match(sgo_home, home_name):
                            continue
                        if not _teams_match(sgo_away, away_name):
                            continue
                        diff = abs((m.kickoff_utc.replace(tzinfo=timezone.utc) - sgo_kickoff).total_seconds())
                        if diff <= 43200:  # 12h
                            best = m
                            break

                    if not best:
                        log.debug(
                            "[sgo_odds] NO MATCH for %s | %s vs %s (norm: %s vs %s)",
                            league_id, sgo_home, sgo_away,
                            _normalize(sgo_home), _normalize(sgo_away),
                        )
                        continue

                    changed = (
                        best.odds_home != home_dec or
                        best.odds_away != away_dec or
                        best.odds_draw != draw_dec
                    )
                    if changed:
                        log.info(
                            "[sgo_odds] %s %s vs %s — home=%.2f away=%.2f draw=%s",
                            league_id,
                            teams.get(best.home_team_id, best.home_team_id),
                            teams.get(best.away_team_id, best.away_team_id),
                            home_dec, away_dec,
                            f"{draw_dec:.2f}" if draw_dec else "n/a",
                        )
                        if not dry_run:
                            best.odds_home = home_dec
                            best.odds_away = away_dec
                            best.odds_draw = draw_dec
                        updated += 1

                time.sleep(0.3)  # polite rate-limiting between league calls

        if not dry_run and updated:
            db.commit()

        log.info("[sgo_odds] Done. %d matches %s.", updated, "would be updated" if dry_run else "updated")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return updated


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} matches {'would be ' if args.dry_run else ''}updated.")
