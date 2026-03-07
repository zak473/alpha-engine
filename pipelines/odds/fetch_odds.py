"""
Fetch real market odds from The Odds API and store snapshots in market_odds.
Also updates CoreMatch.odds_home/away/draw with the sharpest available line.

Free tier: 500 requests/month. We fetch once per 30-min scheduler cycle,
prioritising sports with upcoming/live matches to conserve quota.

Register at https://the-odds-api.com to get your free API key.
Set ODDS_API_KEY in .env.

Usage:
    python -m pipelines.odds.fetch_odds
    python -m pipelines.odds.fetch_odds --dry-run
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from config.settings import settings
from db.models.mvp import CoreMatch
from db.models.odds import MarketOdds
from db.session import SessionLocal

log = logging.getLogger(__name__)

BASE_URL = "https://api.the-odds-api.com/v4"

# The Odds API sport keys → our sport slugs
SPORT_MAP: dict[str, str] = {
    # Soccer
    "soccer_epl":                    "soccer",
    "soccer_spain_la_liga":          "soccer",
    "soccer_germany_bundesliga":     "soccer",
    "soccer_italy_serie_a":          "soccer",
    "soccer_france_ligue_one":       "soccer",
    "soccer_uefa_champs_league":     "soccer",
    "soccer_uefa_europa_league":     "soccer",
    "soccer_uefa_conference_league": "soccer",
    "soccer_netherlands_eredivisie": "soccer",
    "soccer_portugal_primeira_liga": "soccer",
    "soccer_turkey_super_league":    "soccer",
    # Basketball
    "basketball_nba":                "basketball",
    "basketball_euroleague":         "basketball",
    "basketball_nbl":                "basketball",
    # Baseball
    "baseball_mlb":                  "baseball",
    # Tennis — Grand Slams
    "tennis_atp_aus_open":           "tennis",
    "tennis_wta_aus_open":           "tennis",
    "tennis_atp_french_open":        "tennis",
    "tennis_wta_french_open":        "tennis",
    "tennis_atp_wimbledon":          "tennis",
    "tennis_wta_wimbledon":          "tennis",
    "tennis_atp_us_open":            "tennis",
    "tennis_wta_us_open":            "tennis",
    # Tennis — Masters / WTA 1000
    "tennis_atp_miami_open":         "tennis",
    "tennis_wta_miami_open":         "tennis",
    "tennis_atp_madrid_open":        "tennis",
    "tennis_wta_madrid_open":        "tennis",
    "tennis_atp_rome":               "tennis",
    "tennis_wta_rome":               "tennis",
    "tennis_atp_monte_carlo":        "tennis",
    "tennis_atp_canadian_open":      "tennis",
    "tennis_wta_canadian_open":      "tennis",
    "tennis_atp_cincinnati":         "tennis",
    "tennis_wta_cincinnati":         "tennis",
    "tennis_atp_paris":              "tennis",
    "tennis_atp_vienna":             "tennis",
    "tennis_atp_basel":              "tennis",
    "tennis_atp_stockholm":          "tennis",
}

# Preferred bookmakers for sharpest lines (in priority order)
SHARP_BOOKS = ["pinnacle", "betfair_ex_eu", "draftkings", "fanduel", "betmgm", "bet365"]


# ── API helpers ────────────────────────────────────────────────────────────────

def _get(path: str, params: dict | None = None) -> Any:
    url = f"{BASE_URL}{path}"
    resp = httpx.get(
        url,
        params={"apiKey": settings.ODDS_API_KEY, **(params or {})},
        timeout=15,
    )
    resp.raise_for_status()
    remaining = resp.headers.get("x-requests-remaining", "?")
    log.info("  Odds API — %s requests remaining this month", remaining)
    return resp.json()


# ── Match fuzzy-linking ────────────────────────────────────────────────────────

def _norm(name: str) -> str:
    """Normalise team name for fuzzy matching."""
    return name.lower().replace("-", " ").replace(".", "").strip()


def _find_match(db, home: str, away: str, sport: str, kickoff: datetime) -> CoreMatch | None:
    """Find CoreMatch by team name + sport + kickoff window (±6 hours)."""
    window_lo = kickoff - timedelta(hours=6)
    window_hi = kickoff + timedelta(hours=6)

    candidates = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == sport,
            CoreMatch.kickoff_utc >= window_lo,
            CoreMatch.kickoff_utc <= window_hi,
            CoreMatch.status.in_(["scheduled", "live"]),
        )
        .all()
    )

    nh, na = _norm(home), _norm(away)
    for m in candidates:
        from db.models.mvp import CoreTeam
        ht = db.get(CoreTeam, m.home_team_id)
        at = db.get(CoreTeam, m.away_team_id)
        if not ht or not at:
            continue
        if _norm(ht.name) == nh and _norm(at.name) == na:
            return m
        # Partial match — first word of team name
        if nh.split()[0] in _norm(ht.name) and na.split()[0] in _norm(at.name):
            return m
    return None


# ── Odds extraction ────────────────────────────────────────────────────────────

def _best_odds(bookmakers: list[dict], market_key: str) -> tuple[float | None, float | None, float | None]:
    """
    Extract home/draw/away decimal odds from the sharpest available bookmaker.
    Returns (home_odds, draw_odds, away_odds) — draw_odds is None for 2-way markets.
    """
    for preferred in SHARP_BOOKS:
        for bm in bookmakers:
            if bm.get("key") != preferred:
                continue
            for mkt in bm.get("markets", []):
                if mkt.get("key") != market_key:
                    continue
                outcomes = {o["name"].lower(): o["price"] for o in mkt.get("outcomes", [])}
                home = outcomes.get("home") or outcomes.get(list(outcomes.keys())[0] if outcomes else "")
                away = outcomes.get("away") or (list(outcomes.values())[1] if len(outcomes) >= 2 else None)
                draw = outcomes.get("draw")
                return home, draw, away

    # Fall back to first available bookmaker
    for bm in bookmakers:
        for mkt in bm.get("markets", []):
            if mkt.get("key") != market_key:
                continue
            outcomes = {o["name"].lower(): o["price"] for o in mkt.get("outcomes", [])}
            home = outcomes.get("home") or (list(outcomes.values())[0] if outcomes else None)
            away = outcomes.get("away") or (list(outcomes.values())[1] if len(outcomes) >= 2 else None)
            draw = outcomes.get("draw")
            return home, draw, away

    return None, None, None


def _bookmaker_name(bm_key: str) -> str:
    return bm_key.replace("_", " ").title()


# ── Core ingest ────────────────────────────────────────────────────────────────

def _ingest_event(db, event: dict, sport_slug: str, dry_run: bool) -> bool:
    """Process one event from The Odds API. Returns True if a match was found."""
    home_raw = event.get("home_team", "")
    away_raw = event.get("away_team", "")
    commence_raw = event.get("commence_time", "")
    bookmakers = event.get("bookmakers", [])

    if not home_raw or not away_raw or not commence_raw:
        return False

    try:
        kickoff = datetime.fromisoformat(commence_raw.replace("Z", "+00:00"))
    except ValueError:
        return False

    match = _find_match(db, home_raw, away_raw, sport_slug, kickoff)
    if not match:
        log.debug("  No DB match for %s vs %s (%s)", home_raw, away_raw, sport_slug)
        return False

    now = datetime.now(timezone.utc)
    is_closing = (kickoff - now).total_seconds() < 1800  # within 30 min of kickoff

    # Snapshot each bookmaker
    for bm in bookmakers:
        bm_key = bm.get("key", "unknown")
        for mkt in bm.get("markets", []):
            mkt_key = mkt.get("key", "")
            if mkt_key not in ("h2h", "spreads", "totals"):
                continue
            outcomes = {o["name"].lower(): o["price"] for o in mkt.get("outcomes", [])}
            home_o = outcomes.get("home") or (list(outcomes.values())[0] if outcomes else None)
            away_o = outcomes.get("away") or (list(outcomes.values())[1] if len(outcomes) >= 2 else None)
            draw_o = outcomes.get("draw")

            if not dry_run:
                snap = MarketOdds(
                    id=str(uuid.uuid4()),
                    match_id=match.id,
                    sport=sport_slug,
                    bookmaker=bm_key,
                    market=mkt_key,
                    home_odds=home_o,
                    draw_odds=draw_o,
                    away_odds=away_o,
                    recorded_at=now,
                    is_closing=is_closing,
                )
                db.add(snap)

    # Update CoreMatch.odds_* with sharpest h2h line
    h_odds, d_odds, a_odds = _best_odds(bookmakers, "h2h")
    if h_odds and a_odds and not dry_run:
        match.odds_home = h_odds
        match.odds_draw = d_odds
        match.odds_away = a_odds

    log.info(
        "  Matched: %s vs %s — h2h: %.2f / %s / %.2f (%s)",
        home_raw, away_raw,
        h_odds or 0, f"{d_odds:.2f}" if d_odds else "—", a_odds or 0,
        "CLOSING" if is_closing else "open",
    )
    return True


# ── Main fetch ─────────────────────────────────────────────────────────────────

def fetch_all(dry_run: bool = False) -> int:
    if not settings.ODDS_API_KEY:
        log.warning(
            "ODDS_API_KEY not set. Get a free key at https://the-odds-api.com "
            "and add it to .env as ODDS_API_KEY=your_key"
        )
        return 0

    db = SessionLocal()
    total_matched = 0

    try:
        for odds_sport_key, sport_slug in SPORT_MAP.items():
            try:
                log.info("Fetching odds for %s (%s) ...", odds_sport_key, sport_slug)
                events = _get(
                    f"/sports/{odds_sport_key}/odds",
                    params={
                        "regions": "eu,uk,us",
                        "markets": "h2h",
                        "oddsFormat": "decimal",
                        "dateFormat": "iso",
                    },
                )
                for event in events:
                    if _ingest_event(db, event, sport_slug, dry_run):
                        total_matched += 1

            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 422:
                    log.debug("  Sport %s not available on current plan, skipping.", odds_sport_key)
                else:
                    log.warning("  HTTP %s for %s: %s", exc.response.status_code, odds_sport_key, exc)
            except Exception as exc:
                log.warning("  Error for %s: %s", odds_sport_key, exc)

        if not dry_run:
            db.commit()
            log.info("Committed odds snapshots. %d matches updated.", total_matched)
        else:
            log.info("DRY RUN — %d matches would be updated.", total_matched)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return total_matched


# ── CLV settlement ─────────────────────────────────────────────────────────────

def settle_clv(db, pick_id: str, match_id: str) -> None:
    """
    After a pick is settled, compute CLV using the closing-line snapshot.
    closing_odds = last is_closing=True snapshot for this match's h2h market.
    clv = (closing_odds - pick_odds) / pick_odds  — positive = beat the close.
    """
    from db.models.picks import TrackedPick

    pick = db.get(TrackedPick, pick_id)
    if not pick or pick.closing_odds is not None:
        return  # already done

    # Find closing snapshot
    closing = (
        db.query(MarketOdds)
        .filter(
            MarketOdds.match_id == match_id,
            MarketOdds.market == "h2h",
            MarketOdds.is_closing == True,
        )
        .order_by(MarketOdds.recorded_at.desc())
        .first()
    )
    if not closing:
        return

    # Map selection to odds column
    sel = pick.selection_label.lower()
    if sel in ("home", "1", "h"):
        closing_price = closing.home_odds
    elif sel in ("away", "2", "a"):
        closing_price = closing.away_odds
    elif sel in ("draw", "x"):
        closing_price = closing.draw_odds
    else:
        return

    if not closing_price:
        return

    pick.closing_odds = closing_price
    pick.clv = round((closing_price - pick.odds) / pick.odds, 4)


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch real market odds from The Odds API")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run)
    print(f"Done. {n} matches updated.")


if __name__ == "__main__":
    main()
