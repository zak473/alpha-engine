"""
Scrape recent CS2 match results from HLTV and link them to our CoreMatch rows.

Stores map scores, player stats (K-D, ADR, KAST%, Rating 2.0), and veto text
in the hltv_match_stats table.

Usage:
    python -m pipelines.esports.fetch_hltv
    python -m pipelines.esports.fetch_hltv --dry-run
    python -m pipelines.esports.fetch_hltv --days 7
"""

from __future__ import annotations

import argparse
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

from db.models.mvp import CoreMatch, CoreTeam
from db.models.hltv import HltvMatchStats
from db.session import SessionLocal

log = logging.getLogger(__name__)

HLTV_BASE = "https://www.hltv.org"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/122.0.0.0 Safari/537.36")

# Words stripped when normalising team names for fuzzy matching
_STRIP_WORDS = {"team", "esports", "gaming", "club", "org", "fc", "cs", "academy", "junior"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _norm(name: str) -> str:
    """Lowercase, remove punctuation, strip common filler words."""
    name = name.lower()
    name = re.sub(r"[^a-z0-9 ]", "", name)
    tokens = [t for t in name.split() if t not in _STRIP_WORDS]
    return " ".join(tokens).strip() or name.strip()


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _best_team_match(db, name: str, candidates: list) -> str | None:
    """Return CoreTeam.id for the best-matching team name, or None."""
    best_id, best_score = None, 0.0
    for team_id, team_name in candidates:
        score = _similarity(name, team_name)
        if score > best_score:
            best_score = score
            best_id = team_id
    return best_id if best_score >= 0.55 else None


def _parse_rating(val: str) -> float | None:
    try:
        return float(val.replace(",", "."))
    except (ValueError, AttributeError):
        return None


def _parse_kast(val: str) -> float | None:
    """'80.5%' → 0.805"""
    try:
        return float(val.replace("%", "").replace(",", ".")) / 100
    except (ValueError, AttributeError):
        return None


def _parse_kd(val: str) -> tuple[int | None, int | None]:
    """'46-24' → (46, 24)"""
    m = re.match(r"(\d+)-(\d+)", val)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


# ---------------------------------------------------------------------------
# Page fetching via Playwright (one shared browser instance per run)
# ---------------------------------------------------------------------------

class HltvScraper:
    def __init__(self):
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )

    def close(self):
        self._browser.close()
        self._pw.stop()

    def _get_soup(self, url: str, wait: float = 3.5) -> BeautifulSoup:
        """Open a fresh page for each request to avoid stale state between navigations."""
        page = self._browser.new_page()
        page.set_extra_http_headers({"User-Agent": UA})
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=25000)
            time.sleep(wait)
            return BeautifulSoup(page.content(), "lxml")
        finally:
            page.close()

    # ── Results list ────────────────────────────────────────────────────────

    def fetch_results(self, pages: int = 3) -> list[dict]:
        """Return a flat list of {hltv_id, team1, team2, score, event, date_str} dicts."""
        rows = []
        for page_n in range(pages):
            url = f"{HLTV_BASE}/results?offset={page_n * 100}"
            log.info("Fetching HLTV results page %d …", page_n + 1)
            try:
                soup = self._get_soup(url)
            except Exception as exc:
                log.warning("  Failed to fetch results page %d: %s", page_n + 1, exc)
                break

            cards = soup.find_all("div", class_="result-con")
            if not cards:
                break
            for card in cards:
                link = card.find("a", class_="a-reset")
                if not link:
                    continue
                href = link.get("href", "")
                m = re.search(r"/matches/(\d+)/", href)
                if not m:
                    continue
                hltv_id = int(m.group(1))
                teams = card.find_all("div", class_="team")
                score_el = card.find("td", class_="result-score")
                event_el = card.find("span", class_="event-name")
                rows.append({
                    "hltv_id": hltv_id,
                    "href": href,
                    "team1": teams[0].get_text(strip=True) if len(teams) > 0 else "",
                    "team2": teams[1].get_text(strip=True) if len(teams) > 1 else "",
                    "score": score_el.get_text(strip=True) if score_el else "",
                    "event": event_el.get_text(strip=True) if event_el else "",
                })
            log.info("  → %d results so far", len(rows))

        return rows

    # ── Match detail ────────────────────────────────────────────────────────

    def fetch_match_detail(self, href: str) -> dict[str, Any]:
        url = f"{HLTV_BASE}{href}"
        log.info("  Fetching match detail: %s", url)
        try:
            soup = self._get_soup(url)
        except Exception as exc:
            log.warning("    Failed: %s", exc)
            return {}

        detail: dict[str, Any] = {}

        # ── Format & LAN flag ──────────────────────────────────────────────
        veto_box = soup.find("div", class_="veto-box")
        veto_text = veto_box.get_text(separator="\n", strip=True) if veto_box else ""
        detail["veto_text"] = veto_text

        fmt = "bo3"
        if "best of 1" in veto_text.lower() or "bo1" in veto_text.lower():
            fmt = "bo1"
        elif "best of 5" in veto_text.lower() or "bo5" in veto_text.lower():
            fmt = "bo5"
        detail["format"] = fmt
        detail["is_lan"] = "(lan)" in veto_text.lower() or "lan event" in veto_text.lower()

        # ── Map scores ────────────────────────────────────────────────────
        maps_out = []
        for mh in soup.find_all("div", class_="mapholder"):
            map_name_el = mh.find("div", class_="mapname")
            map_name = map_name_el.get_text(strip=True) if map_name_el else "Unknown"
            if map_name.lower() in ("tba", "?", ""):
                continue
            scores = mh.find_all("div", class_="results-team-score")
            half_el = mh.find("div", class_="results-center-half-score")
            home_score = away_score = None
            if len(scores) >= 2:
                try:
                    home_score = int(scores[0].get_text(strip=True))
                    away_score = int(scores[1].get_text(strip=True))
                except ValueError:
                    pass
            winner = None
            if home_score is not None and away_score is not None:
                winner = "home" if home_score > away_score else "away" if away_score > home_score else "draw"
            maps_out.append({
                "map_name": map_name,
                "home_score": home_score,
                "away_score": away_score,
                "half_text": half_el.get_text(strip=True) if half_el else None,
                "winner": winner,
            })
        detail["maps"] = maps_out

        # ── Player stats ──────────────────────────────────────────────────
        # HLTV renders two totalstats tables: first = team1 (home), second = team2 (away)
        tables = soup.find_all("table", class_="totalstats")
        players_home: list[dict] = []
        players_away: list[dict] = []

        for tbl_idx, tbl in enumerate(tables[:2]):
            players: list[dict] = []
            for row in tbl.find_all("tr"):
                name_td = row.find("td", class_="players")
                if not name_td:
                    continue
                name_link = name_td.find("a")
                if not name_link:
                    continue
                player_name = name_link.get_text(strip=True)
                cells = row.find_all("td")
                # HLTV cell order: [player, K-D, +/-(count), +/-(%),  ADR,  KAST%,  Rating]
                #                     [0]     [1]    [2]        [3]    [4]    [5]     [6]
                try:
                    kd_raw     = cells[1].get_text(strip=True) if len(cells) > 1 else None
                    adr_raw    = cells[4].get_text(strip=True) if len(cells) > 4 else None
                    kast_raw   = cells[5].get_text(strip=True) if len(cells) > 5 else None
                    rating_raw = cells[6].get_text(strip=True) if len(cells) > 6 else None
                except IndexError:
                    continue

                kills, deaths = _parse_kd(kd_raw or "")
                players.append({
                    "name":      player_name,
                    "kills":     kills,
                    "deaths":    deaths,
                    "adr":       _parse_rating(adr_raw or ""),
                    "kast_pct":  _parse_kast(kast_raw or ""),
                    "rating_2":  _parse_rating(rating_raw or ""),
                })

            if tbl_idx == 0:
                players_home = players
            else:
                players_away = players

        detail["players_home"] = players_home
        detail["players_away"] = players_away
        return detail


# ---------------------------------------------------------------------------
# DB linkage
# ---------------------------------------------------------------------------

def _find_core_match(db, hltv_team1: str, hltv_team2: str,
                     approx_date: datetime | None) -> CoreMatch | None:
    """
    Find the CoreMatch for these two teams played within ±2 days of approx_date.
    Uses fuzzy name matching with a 0.55 similarity threshold.
    """
    date_lo = (approx_date - timedelta(days=2)) if approx_date else None
    date_hi = (approx_date + timedelta(days=2)) if approx_date else None

    q = db.query(CoreMatch).filter(CoreMatch.sport == "esports")
    if date_lo:
        q = q.filter(CoreMatch.kickoff_utc >= date_lo, CoreMatch.kickoff_utc <= date_hi)

    candidates = q.all()
    best_match = None
    best_score = 0.0

    for cm in candidates:
        hn = db.get(CoreTeam, cm.home_team_id)
        an = db.get(CoreTeam, cm.away_team_id)
        if not hn or not an:
            continue
        s1 = max(_similarity(hltv_team1, hn.name), _similarity(hltv_team2, hn.name))
        s2 = max(_similarity(hltv_team1, an.name), _similarity(hltv_team2, an.name))
        combined = (s1 + s2) / 2
        if combined > best_score and combined >= 0.55:
            best_score = combined
            best_match = cm

    return best_match


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def fetch_all(dry_run: bool = False, days: int = 3) -> int:
    db = SessionLocal()
    scraper = HltvScraper()
    ingested = 0

    try:
        # How many result pages to fetch (100 matches per page, ~3 days ≈ 1-2 pages)
        pages = max(1, min(days, 5))
        result_list = scraper.fetch_results(pages=pages)
        log.info("Found %d HLTV results", len(result_list))

        for res in result_list:
            hltv_id = res["hltv_id"]

            # Skip if already in DB
            existing = db.get(HltvMatchStats, None)  # will query by hltv_id below
            existing = db.query(HltvMatchStats).filter_by(hltv_match_id=hltv_id).first()
            if existing:
                log.debug("  Already have hltv_id=%d — skipping", hltv_id)
                continue

            # Find the CoreMatch
            core = _find_core_match(db, res["team1"], res["team2"], approx_date=None)
            if core is None:
                log.debug("  No CoreMatch for %s vs %s — skipping", res["team1"], res["team2"])
                continue

            log.info("  Matched HLTV %d → CoreMatch %s  (%s vs %s)",
                     hltv_id, core.id[:8], res["team1"], res["team2"])

            # Scrape detail
            detail = scraper.fetch_match_detail(res["href"])
            if not detail:
                continue

            if dry_run:
                log.info("    DRY RUN — maps=%d players_home=%d players_away=%d",
                         len(detail.get("maps", [])),
                         len(detail.get("players_home", [])),
                         len(detail.get("players_away", [])))
                continue

            row = HltvMatchStats(
                core_match_id=core.id,
                hltv_match_id=hltv_id,
                maps=detail.get("maps", []),
                players_home=detail.get("players_home", []),
                players_away=detail.get("players_away", []),
                veto_text=detail.get("veto_text"),
                format=detail.get("format", "bo3"),
                is_lan=detail.get("is_lan", False),
            )
            db.merge(row)
            db.commit()
            ingested += 1
            log.info("    Saved. maps=%d p_home=%d p_away=%d",
                     len(row.maps), len(row.players_home), len(row.players_away))

            # Throttle — be polite to HLTV
            time.sleep(1.5)

    except Exception:
        log.exception("fetch_hltv failed")
        db.rollback()
    finally:
        scraper.close()
        db.close()

    return ingested


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape HLTV CS2 match stats")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--days", type=int, default=3, help="Days of history to scrape")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(dry_run=args.dry_run, days=args.days)
    print(f"Done. {n} matches saved.")


if __name__ == "__main__":
    main()
