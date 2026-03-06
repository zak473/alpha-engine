"""Fetch NBA team box score stats from stats.nba.com and upsert into basketball_team_match_stats.

Run:
    docker compose exec api python -m pipelines.basketball.fetch_stats [--days-back 7] [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import date, timedelta
from typing import Optional

import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

NBA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.nba.com/",
    "Host": "stats.nba.com",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
}
NBA_BASE = "https://stats.nba.com/stats"


def _rows_to_dicts(result_set: dict) -> list[dict]:
    headers = result_set["headers"]
    return [dict(zip(headers, row)) for row in result_set["rowSet"]]


def _nba_get(endpoint: str, params: dict, retries: int = 3) -> Optional[dict]:
    url = f"{NBA_BASE}/{endpoint}"
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=NBA_HEADERS, params=params, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            log.warning("NBA API attempt %d failed for %s: %s", attempt + 1, endpoint, exc)
            time.sleep(2 ** attempt)
    return None


def _normalize(name: str) -> str:
    return name.lower().strip()


def _fetch_scoreboard(game_date: date) -> list[dict]:
    date_str = game_date.strftime("%m/%d/%Y")
    data = _nba_get("scoreboardv2", {
        "DayOffset": "0",
        "LeagueID": "00",
        "gameDate": date_str,
    })
    if not data:
        return []
    try:
        return _rows_to_dicts(data["resultSets"][0])  # GameHeader
    except (KeyError, IndexError):
        return []


def _fetch_box_traditional(game_id: str) -> tuple[list[dict], list[dict]]:
    """Returns (player_rows, team_rows)."""
    data = _nba_get("boxscoretraditionalv2", {
        "GameID": game_id,
        "StartPeriod": "0",
        "EndPeriod": "0",
        "StartRange": "0",
        "EndRange": "0",
        "RangeType": "0",
    })
    if not data:
        return [], []
    try:
        player_rows = _rows_to_dicts(data["resultSets"][0])  # PlayerStats
        team_rows = _rows_to_dicts(data["resultSets"][1])    # TeamStats
        return player_rows, team_rows
    except (KeyError, IndexError):
        return [], []


def _parse_minutes(min_str: Optional[str]) -> Optional[float]:
    """Parse NBA minutes string 'MM:SS' → float minutes."""
    if not min_str:
        return None
    try:
        parts = str(min_str).split(":")
        return round(int(parts[0]) + int(parts[1]) / 60, 2) if len(parts) == 2 else float(parts[0])
    except (ValueError, IndexError):
        return None


def _fetch_box_advanced(game_id: str) -> list[dict]:
    data = _nba_get("boxscoreadvancedv2", {
        "GameID": game_id,
        "StartPeriod": "0",
        "EndPeriod": "0",
        "StartRange": "0",
        "EndRange": "0",
        "RangeType": "0",
    })
    if not data:
        return []
    try:
        # resultSets[1] = TeamStats
        return _rows_to_dicts(data["resultSets"][1])
    except (KeyError, IndexError):
        return []


def fetch_all(days_back: int = 7, dry_run: bool = False) -> int:
    import os
    from db.models.mvp import CoreMatch, CoreTeam
    from db.models.basketball import BasketballTeamMatchStats, BasketballPlayerMatchStats

    dsn = os.environ.get("POSTGRES_DSN", "postgresql://postgres:postgres@postgres:5432/alpha_engine")
    engine = create_engine(dsn)

    with Session(engine) as session:
        # Find finished basketball matches with no existing stats
        existing_match_ids = {
            row.match_id
            for row in session.query(BasketballTeamMatchStats.match_id).distinct()
        }
        matches = (
            session.query(CoreMatch)
            .filter(
                CoreMatch.sport == "basketball",
                CoreMatch.status == "finished",
            )
            .all()
        )
        # Filter to recent + no existing stats
        cutoff = date.today() - timedelta(days=days_back)
        pending = [
            m for m in matches
            if m.kickoff_utc.date() >= cutoff and m.id not in existing_match_ids
        ]

        if not pending:
            log.info("No pending basketball matches to fetch stats for.")
            return 0

        # Group by date
        by_date: dict[date, list] = {}
        for m in pending:
            d = m.kickoff_utc.date()
            by_date.setdefault(d, []).append(m)

        total_upserted = 0
        for game_date, day_matches in sorted(by_date.items()):
            log.info("Fetching NBA scoreboard for %s (%d pending matches)...", game_date, len(day_matches))
            scoreboard = _fetch_scoreboard(game_date)
            time.sleep(0.6)  # be polite

            for nba_game in scoreboard:
                game_id = nba_game.get("GAME_ID")
                home_team_name = _normalize(nba_game.get("HOME_TEAM_NAME", "") or "")
                visitor_team_name = _normalize(nba_game.get("VISITOR_TEAM_NAME", "") or "")

                if not game_id:
                    continue

                # Match to a CoreMatch by team names
                matched_match = None
                for m in day_matches:
                    home_team = session.get(CoreTeam, m.home_team_id)
                    away_team = session.get(CoreTeam, m.away_team_id)
                    if not home_team or not away_team:
                        continue
                    h_norm = _normalize(home_team.name)
                    a_norm = _normalize(away_team.name)
                    if h_norm in home_team_name or home_team_name in h_norm:
                        if a_norm in visitor_team_name or visitor_team_name in a_norm:
                            matched_match = m
                            break

                if not matched_match:
                    log.debug("No CoreMatch found for NBA game %s on %s", game_id, game_date)
                    continue

                log.info("Matched game %s → CoreMatch %s", game_id, matched_match.id)

                player_rows, trad_rows = _fetch_box_traditional(game_id)
                time.sleep(0.6)
                adv_rows = _fetch_box_advanced(game_id)
                time.sleep(0.6)

                # Index advanced by team abbreviation
                adv_by_team = {r.get("TEAM_ABBREVIATION"): r for r in adv_rows}

                # --- Ingest player stats ---
                if player_rows and not dry_run:
                    # Clear existing player rows for this match first
                    session.query(BasketballPlayerMatchStats).filter_by(match_id=matched_match.id).delete()
                    starters_by_team: dict[str, int] = {}
                    for p in player_rows:
                        p_name = (p.get("PLAYER_NAME") or "").strip()
                        if not p_name or p_name == "Team Totals":
                            continue
                        p_city = _normalize(p.get("TEAM_CITY", "") or "")
                        p_is_home = p_city in _normalize(nba_game.get("HOME_TEAM_NAME", "") or "") or \
                                    _normalize(nba_game.get("HOME_TEAM_NAME", "") or "") in p_city
                        core_tid = matched_match.home_team_id if p_is_home else matched_match.away_team_id
                        starters_by_team.setdefault(core_tid, 0)
                        is_starter = starters_by_team[core_tid] < 5
                        starters_by_team[core_tid] += 1

                        def _int(v):
                            try: return int(v) if v is not None else None
                            except: return None
                        def _float(v):
                            try: return float(v) if v is not None else None
                            except: return None

                        prow = BasketballPlayerMatchStats(
                            match_id=matched_match.id,
                            team_id=core_tid,
                            is_home=p_is_home,
                            player_id=str(p.get("PLAYER_ID", "")),
                            player_name=p_name,
                            position=p.get("START_POSITION") or None,
                            jersey=None,
                            is_starter=is_starter,
                            minutes=_parse_minutes(p.get("MIN")),
                            points=_int(p.get("PTS")),
                            rebounds_total=_int(p.get("REB")),
                            rebounds_offensive=_int(p.get("OREB")),
                            rebounds_defensive=_int(p.get("DREB")),
                            assists=_int(p.get("AST")),
                            steals=_int(p.get("STL")),
                            blocks=_int(p.get("BLK")),
                            turnovers=_int(p.get("TO")),
                            fouls=_int(p.get("PF")),
                            plus_minus=_int(p.get("PLUS_MINUS")),
                            fg_made=_int(p.get("FGM")),
                            fg_attempted=_int(p.get("FGA")),
                            fg_pct=_float(p.get("FG_PCT")),
                            fg3_made=_int(p.get("FG3M")),
                            fg3_attempted=_int(p.get("FG3A")),
                            fg3_pct=_float(p.get("FG3_PCT")),
                            ft_made=_int(p.get("FTM")),
                            ft_attempted=_int(p.get("FTA")),
                            ft_pct=_float(p.get("FT_PCT")),
                        )
                        session.add(prow)

                for row in trad_rows:
                    team_city = _normalize(row.get("TEAM_CITY", "") or "")
                    home_city = _normalize(nba_game.get("HOME_TEAM_NAME", "") or "")
                    is_home = team_city in home_city or home_city in team_city

                    # Determine team_id
                    core_team_id = matched_match.home_team_id if is_home else matched_match.away_team_id

                    adv = adv_by_team.get(row.get("TEAM_ABBREVIATION"), {})

                    def _int(v):
                        try:
                            return int(v) if v is not None else None
                        except (ValueError, TypeError):
                            return None

                    def _float(v):
                        try:
                            return float(v) if v is not None else None
                        except (ValueError, TypeError):
                            return None

                    if dry_run:
                        log.info("[dry-run] Would upsert stats for %s team_id=%s", matched_match.id, core_team_id)
                        total_upserted += 1
                        continue

                    existing = session.query(BasketballTeamMatchStats).filter_by(
                        match_id=matched_match.id, team_id=core_team_id
                    ).first()

                    if existing is None:
                        existing = BasketballTeamMatchStats(
                            match_id=matched_match.id,
                            team_id=core_team_id,
                        )
                        session.add(existing)

                    existing.is_home = is_home
                    existing.points = _int(row.get("PTS"))
                    existing.fg_made = _int(row.get("FGM"))
                    existing.fg_attempted = _int(row.get("FGA"))
                    existing.fg_pct = _float(row.get("FG_PCT"))
                    existing.fg3_made = _int(row.get("FG3M"))
                    existing.fg3_attempted = _int(row.get("FG3A"))
                    existing.fg3_pct = _float(row.get("FG3_PCT"))
                    existing.ft_made = _int(row.get("FTM"))
                    existing.ft_attempted = _int(row.get("FTA"))
                    existing.ft_pct = _float(row.get("FT_PCT"))
                    existing.rebounds_total = _int(row.get("REB"))
                    existing.rebounds_offensive = _int(row.get("OREB"))
                    existing.rebounds_defensive = _int(row.get("DREB"))
                    existing.assists = _int(row.get("AST"))
                    existing.turnovers = _int(row.get("TO"))
                    existing.steals = _int(row.get("STL"))
                    existing.blocks = _int(row.get("BLK"))
                    existing.fouls = _int(row.get("PF"))
                    existing.plus_minus = _int(row.get("PLUS_MINUS"))
                    # Advanced
                    existing.offensive_rating = _float(adv.get("OFF_RATING"))
                    existing.defensive_rating = _float(adv.get("DEF_RATING"))
                    existing.net_rating = _float(adv.get("NET_RATING"))
                    existing.pace = _float(adv.get("PACE"))

                    total_upserted += 1

                session.commit()

        log.info("fetch_stats (basketball): upserted %d team-match rows.", total_upserted)
        return total_upserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Fetch NBA box score stats")
    parser.add_argument("--days-back", type=int, default=7)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    fetch_all(days_back=args.days_back, dry_run=args.dry_run)
