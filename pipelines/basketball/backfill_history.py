"""
Basketball historical fixture backfill using BallDontLie API.

Fetches team game results from api.balldontlie.io for every regular season
and writes CoreMatch + BasketballTeamMatchStats rows.

Idempotent: uses provider_id = 'balldontlie-{GAME_ID}' for CoreMatch upsert.

Requires: BALLDONTLIE_API_KEY env var (set in Railway).

Usage:
    python -m pipelines.basketball.backfill_history
    python -m pipelines.basketball.backfill_history --season 2023
    python -m pipelines.basketball.backfill_history --from-season 2018
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import requests

from db.session import SessionLocal
from db.models.mvp import CoreMatch, CoreTeam, CoreLeague
from db.models.basketball import BasketballTeamMatchStats

log = logging.getLogger(__name__)

_BASE_URL = "https://api.balldontlie.io/v1"

# Seasons to backfill (BallDontLie uses calendar year of season start)
_DEFAULT_SEASONS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]

_NBA_LEAGUE_NAME = "NBA"
_NBA_LEAGUE_PROVIDER = "nba-league-00"


def _get_headers() -> dict:
    from config.settings import settings
    key = settings.BALLDONTLIE_API_KEY
    if not key:
        raise RuntimeError("BALLDONTLIE_API_KEY is not set")
    return {"Authorization": key}


# ---------------------------------------------------------------------------
# API fetch helpers
# ---------------------------------------------------------------------------

def _fetch_games(season: int, cursor: Optional[int] = None) -> dict:
    """Fetch one page of games for a season."""
    params = {"seasons[]": season, "per_page": 100}
    if cursor:
        params["cursor"] = cursor
    resp = requests.get(
        f"{_BASE_URL}/games",
        headers=_get_headers(),
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_box_scores(game_ids: list[int]) -> list[dict]:
    """Fetch team box scores for a list of game IDs."""
    if not game_ids:
        return []
    # BallDontLie v1 box_scores endpoint accepts game_ids[]
    params = [("game_ids[]", gid) for gid in game_ids]
    try:
        resp = requests.get(
            f"{_BASE_URL}/box_scores",
            headers=_get_headers(),
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("data") or []
    except Exception as exc:
        log.warning("[bball_backfill] box_scores fetch failed for %d games: %s", len(game_ids), exc)
        return []


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _upsert_league(session) -> str:
    lg = session.query(CoreLeague).filter_by(provider_id=_NBA_LEAGUE_PROVIDER).first()
    if lg:
        return lg.id
    import uuid
    lg = CoreLeague(
        id=str(uuid.uuid4()),
        name=_NBA_LEAGUE_NAME,
        sport="basketball",
        country="USA",
        provider_id=_NBA_LEAGUE_PROVIDER,
        logo_url=None,
    )
    session.add(lg)
    session.flush()
    return lg.id


def _upsert_team(session, bdl_team: dict) -> str:
    provider_id = f"balldontlie-team-{bdl_team['id']}"
    team = session.query(CoreTeam).filter_by(provider_id=provider_id).first()
    if team:
        return team.id
    import uuid
    full_name = f"{bdl_team.get('city', '')} {bdl_team.get('name', '')}".strip()
    team = CoreTeam(
        id=str(uuid.uuid4()),
        name=full_name,
        short_name=bdl_team.get("abbreviation") or bdl_team.get("name", "")[:5],
        sport="basketball",
        country="USA",
        provider_id=provider_id,
        logo_url=None,
    )
    session.add(team)
    session.flush()
    return team.id


# ---------------------------------------------------------------------------
# Per-season logic
# ---------------------------------------------------------------------------

def run_season(session, season: int, league_id: str) -> int:
    rows_written = 0
    cursor = None
    page = 0

    # Team cache to avoid repeated DB queries
    team_cache: dict[int, str] = {}

    def get_team_id(bdl_team: dict) -> str:
        tid = bdl_team["id"]
        if tid not in team_cache:
            team_cache[tid] = _upsert_team(session, bdl_team)
        return team_cache[tid]

    all_games = []

    # Paginate through all games for this season
    while True:
        page += 1
        try:
            data = _fetch_games(season, cursor)
        except Exception as exc:
            log.error("[bball_backfill] fetch_games failed season=%d page=%d: %s", season, page, exc)
            break

        games = data.get("data") or []
        all_games.extend(games)
        log.info("[bball_backfill]   page %d: %d games (total so far: %d)", page, len(games), len(all_games))

        meta = data.get("meta") or {}
        cursor = meta.get("next_cursor")
        if not cursor:
            break
        time.sleep(0.3)  # polite rate limiting

    log.info("[bball_backfill] Season %d: %d total games fetched", season, len(all_games))

    # Fetch box scores in batches of 20
    game_id_map: dict[int, dict] = {g["id"]: g for g in all_games}
    box_by_game: dict[int, list[dict]] = {}

    game_ids = list(game_id_map.keys())
    for i in range(0, len(game_ids), 20):
        batch = game_ids[i:i+20]
        boxes = _fetch_box_scores(batch)
        for box in boxes:
            gid = box.get("game", {}).get("id") or box.get("game_id")
            if gid:
                box_by_game.setdefault(gid, []).append(box)
        time.sleep(0.3)

    # Upsert games
    for game in all_games:
        # Only process finished games with scores
        status = str(game.get("status") or "").lower()
        if status not in ("final", "complete", "finished") and "final" not in status:
            continue

        home_score = game.get("home_team_score")
        away_score = game.get("visitor_team_score")
        if home_score is None or away_score is None:
            continue

        home_team_data = game.get("home_team") or {}
        away_team_data = game.get("visitor_team") or {}
        if not home_team_data or not away_team_data:
            continue

        home_team_id = get_team_id(home_team_data)
        away_team_id = get_team_id(away_team_data)

        provider_id = f"balldontlie-{game['id']}"
        existing = session.query(CoreMatch).filter_by(provider_id=provider_id).first()

        date_str = str(game.get("date") or "")
        try:
            game_dt = datetime.strptime(date_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue

        home_pts = int(home_score)
        away_pts = int(away_score)
        outcome = "H" if home_pts > away_pts else "A"

        if existing is None:
            import uuid
            match = CoreMatch(
                id=str(uuid.uuid4()),
                sport="basketball",
                league_id=league_id,
                season=str(season),
                provider_id=provider_id,
                home_team_id=home_team_id,
                away_team_id=away_team_id,
                kickoff_utc=game_dt,
                status="finished",
                home_score=home_pts,
                away_score=away_pts,
                outcome=outcome,
            )
            session.add(match)
            session.flush()
        else:
            match = existing
            if match.home_score is None:
                match.home_score = home_pts
            if match.away_score is None:
                match.away_score = away_pts
            if match.outcome is None:
                match.outcome = outcome
            session.flush()

        # Upsert team stats from box scores
        boxes = box_by_game.get(game["id"]) or []
        for box in boxes:
            # BallDontLie box score: {team: {...}, min, pts, reb, ast, ...}
            bt = box.get("team") or {}
            bt_id_raw = bt.get("id")
            if not bt_id_raw:
                continue
            is_home = (bt_id_raw == home_team_data.get("id"))
            team_id = home_team_id if is_home else away_team_id

            existing_stats = session.query(BasketballTeamMatchStats).filter_by(
                match_id=match.id, team_id=team_id
            ).first()
            if existing_stats:
                continue

            def _int(val):
                try: return int(val) if val is not None else None
                except (ValueError, TypeError): return None

            def _float(val):
                try: return float(val) if val is not None else None
                except (ValueError, TypeError): return None

            stats = BasketballTeamMatchStats(
                match_id=match.id,
                team_id=team_id,
                is_home=is_home,
                points=_int(box.get("pts")),
                fg_made=_int(box.get("fgm")),
                fg_attempted=_int(box.get("fga")),
                fg_pct=_float(box.get("fg_pct")),
                fg3_made=_int(box.get("fg3m")),
                fg3_attempted=_int(box.get("fg3a")),
                fg3_pct=_float(box.get("fg3_pct")),
                ft_made=_int(box.get("ftm")),
                ft_attempted=_int(box.get("fta")),
                ft_pct=_float(box.get("ft_pct")),
                rebounds_offensive=_int(box.get("oreb")),
                rebounds_defensive=_int(box.get("dreb")),
                rebounds_total=_int(box.get("reb")),
                assists=_int(box.get("ast")),
                steals=_int(box.get("stl")),
                blocks=_int(box.get("blk")),
                turnovers=_int(box.get("turnover")),
                fouls=_int(box.get("pf")),
            )
            session.add(stats)
            rows_written += 1

    session.commit()
    return rows_written


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run(seasons: list[int] | None = None, from_season: int | None = None) -> int:
    if seasons is None:
        seasons = list(_DEFAULT_SEASONS)
    if from_season:
        seasons = [s for s in seasons if s >= from_season]

    session = SessionLocal()
    total = 0
    try:
        league_id = _upsert_league(session)
        session.commit()

        for season in seasons:
            log.info("[bball_backfill] === Season %d ===", season)
            n = run_season(session, season, league_id)
            total += n
            log.info("[bball_backfill] Season %d: %d stats rows written.", season, n)
    except Exception:
        session.rollback()
        log.exception("[bball_backfill] Failed — rolled back")
        raise
    finally:
        session.close()

    log.info("[bball_backfill] Done. Total stats rows: %d", total)
    return total


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    parser = argparse.ArgumentParser(description="NBA historical fixture backfill via BallDontLie")
    parser.add_argument("--season", type=int, help="Single season e.g. 2023")
    parser.add_argument("--from-season", type=int, help="Start from this season e.g. 2020")
    args = parser.parse_args()

    seasons = [args.season] if args.season else None
    run(seasons=seasons, from_season=args.from_season)


if __name__ == "__main__":
    main()
