"""Fetch MLB team box score stats from statsapi.mlb.com and upsert into baseball_team_match_stats.

Run:
    docker compose exec api python -m pipelines.baseball.fetch_stats [--days-back 7] [--dry-run]
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

MLB_BASE = "https://statsapi.mlb.com/api/v1"


def _mlb_get(path: str, params: Optional[dict] = None, retries: int = 3) -> Optional[dict]:
    url = f"{MLB_BASE}{path}"
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            log.warning("MLB API attempt %d failed for %s: %s", attempt + 1, path, exc)
            time.sleep(2 ** attempt)
    return None


def _normalize(name: str) -> str:
    return name.lower().strip()


def _fetch_schedule(game_date: date) -> list[dict]:
    data = _mlb_get("/schedule", {"sportId": "1", "date": game_date.isoformat(), "hydrate": "linescore"})
    if not data:
        return []
    games = []
    for day in data.get("dates", []):
        games.extend(day.get("games", []))
    return games


def _fetch_boxscore(game_pk: int) -> Optional[dict]:
    return _mlb_get(f"/game/{game_pk}/boxscore")


def fetch_all(days_back: int = 7, dry_run: bool = False) -> int:
    import json as _json
    import os
    from db.models.mvp import CoreMatch, CoreTeam
    from db.models.baseball import BaseballTeamMatchStats, BaseballPlayerMatchStats, EventContext

    dsn = os.environ.get("POSTGRES_DSN", "postgresql://postgres:postgres@postgres:5432/alpha_engine")
    engine = create_engine(dsn)

    with Session(engine) as session:
        from db.models.baseball import BaseballPlayerMatchStats
        existing_match_ids = {
            row.match_id
            for row in session.query(BaseballTeamMatchStats.match_id).distinct()
        }
        matches = (
            session.query(CoreMatch)
            .filter(
                CoreMatch.sport == "baseball",
                CoreMatch.status == "finished",
            )
            .all()
        )
        cutoff = date.today() - timedelta(days=days_back)
        pending = [
            m for m in matches
            if m.kickoff_utc.date() >= cutoff and m.id not in existing_match_ids
        ]

        if not pending:
            log.info("No pending baseball matches to fetch stats for.")
            return 0

        by_date: dict[date, list] = {}
        for m in pending:
            d = m.kickoff_utc.date()
            by_date.setdefault(d, []).append(m)

        total_upserted = 0
        for game_date, day_matches in sorted(by_date.items()):
            log.info("Fetching MLB schedule for %s (%d pending matches)...", game_date, len(day_matches))
            mlb_games = _fetch_schedule(game_date)
            time.sleep(0.3)

            for mlb_game in mlb_games:
                game_pk = mlb_game.get("gamePk")
                teams = mlb_game.get("teams", {})
                home_name = _normalize(teams.get("home", {}).get("team", {}).get("name", "") or "")
                away_name = _normalize(teams.get("away", {}).get("team", {}).get("name", "") or "")

                if not game_pk:
                    continue

                matched_match = None
                for m in day_matches:
                    home_team = session.get(CoreTeam, m.home_team_id)
                    away_team = session.get(CoreTeam, m.away_team_id)
                    if not home_team or not away_team:
                        continue
                    h_norm = _normalize(home_team.name)
                    a_norm = _normalize(away_team.name)
                    if h_norm in home_name or home_name in h_norm:
                        if a_norm in away_name or away_name in a_norm:
                            matched_match = m
                            break

                if not matched_match:
                    log.debug("No CoreMatch found for MLB game %s on %s", game_pk, game_date)
                    continue

                log.info("Matched MLB game %s → CoreMatch %s", game_pk, matched_match.id)

                # Parse inning scores from the linescore (already in schedule response)
                linescore = mlb_game.get("linescore", {})
                innings_raw = linescore.get("innings", [])
                if innings_raw and not dry_run:
                    inning_list = [
                        {
                            "inning": inn.get("num"),
                            "home": inn.get("home", {}).get("runs"),
                            "away": inn.get("away", {}).get("runs"),
                        }
                        for inn in innings_raw
                        if inn.get("num") is not None
                    ]
                    if inning_list:
                        ctx = session.query(EventContext).filter_by(match_id=matched_match.id).first()
                        if ctx is None:
                            ctx = EventContext(match_id=matched_match.id)
                            session.add(ctx)
                        ctx.inning_scores_json = _json.dumps(inning_list)

                boxscore = _fetch_boxscore(game_pk)
                time.sleep(0.3)
                if not boxscore:
                    continue

                for side, is_home, core_team_id in [
                    ("home", True, matched_match.home_team_id),
                    ("away", False, matched_match.away_team_id),
                ]:
                    team_data = boxscore.get("teams", {}).get(side, {})
                    batting = team_data.get("teamStats", {}).get("batting", {})
                    pitching = team_data.get("teamStats", {}).get("pitching", {})
                    fielding = team_data.get("teamStats", {}).get("fielding", {})

                    # Starter: first pitcher in pitchers list
                    pitcher_name = None
                    pitcher_id_str = None
                    pitchers = team_data.get("pitchers", [])
                    if pitchers:
                        p_id = pitchers[0]
                        p_info = team_data.get("players", {}).get(f"ID{p_id}", {})
                        pitcher_name = p_info.get("person", {}).get("fullName")
                        pitcher_id_str = str(p_id)

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

                    existing = session.query(BaseballTeamMatchStats).filter_by(
                        match_id=matched_match.id, team_id=core_team_id
                    ).first()

                    if existing is None:
                        existing = BaseballTeamMatchStats(
                            match_id=matched_match.id,
                            team_id=core_team_id,
                        )
                        session.add(existing)

                    existing.is_home = is_home
                    existing.runs = _int(batting.get("runs"))
                    existing.hits = _int(batting.get("hits"))
                    existing.doubles = _int(batting.get("doubles"))
                    existing.triples = _int(batting.get("triples"))
                    existing.home_runs = _int(batting.get("homeRuns"))
                    existing.rbi = _int(batting.get("rbi"))
                    existing.walks = _int(batting.get("baseOnBalls"))
                    existing.strikeouts_batting = _int(batting.get("strikeOuts"))
                    existing.batting_avg = _float(batting.get("avg"))
                    existing.obp = _float(batting.get("obp"))
                    existing.slg = _float(batting.get("slg"))
                    existing.ops = _float(batting.get("ops"))
                    existing.left_on_base = _int(batting.get("leftOnBase"))
                    # Pitching
                    existing.era = _float(pitching.get("era"))
                    existing.innings_pitched = _float(pitching.get("inningsPitched"))
                    existing.hits_allowed = _int(pitching.get("hits"))
                    existing.earned_runs = _int(pitching.get("earnedRuns"))
                    existing.walks_allowed = _int(pitching.get("baseOnBalls"))
                    existing.strikeouts_pitching = _int(pitching.get("strikeOuts"))
                    existing.whip = _float(pitching.get("whip"))
                    existing.pitcher_name = pitcher_name
                    existing.pitcher_id = pitcher_id_str
                    # Fielding
                    existing.errors = _int(fielding.get("errors"))
                    existing.double_plays = _int(fielding.get("doublePlays"))

                    total_upserted += 1

                # Per-batter stats
                if not dry_run:
                    session.query(BaseballPlayerMatchStats).filter_by(match_id=matched_match.id).delete()
                    for side, is_home, core_team_id in [
                        ("home", True, matched_match.home_team_id),
                        ("away", False, matched_match.away_team_id),
                    ]:
                        team_data = boxscore.get("teams", {}).get(side, {})
                        players_dict = team_data.get("players", {})
                        batters_order = team_data.get("battingOrder", [])
                        for order_idx, pid in enumerate(batters_order):
                            p_info = players_dict.get(f"ID{pid}", {})
                            person = p_info.get("person", {})
                            stats = p_info.get("stats", {}).get("batting", {})
                            season_stats = p_info.get("seasonStats", {}).get("batting", {})
                            pos = p_info.get("position", {}).get("abbreviation")
                            if not person.get("fullName"):
                                continue
                            session.add(BaseballPlayerMatchStats(
                                match_id=matched_match.id,
                                team_id=core_team_id,
                                is_home=is_home,
                                player_id=str(pid),
                                player_name=person.get("fullName", ""),
                                position=pos,
                                batting_order=order_idx + 1,
                                is_starter=True,
                                at_bats=_int(stats.get("atBats")),
                                runs=_int(stats.get("runs")),
                                hits=_int(stats.get("hits")),
                                doubles=_int(stats.get("doubles")),
                                triples=_int(stats.get("triples")),
                                home_runs=_int(stats.get("homeRuns")),
                                rbi=_int(stats.get("rbi")),
                                walks=_int(stats.get("baseOnBalls")),
                                strikeouts=_int(stats.get("strikeOuts")),
                                stolen_bases=_int(stats.get("stolenBases")),
                                left_on_base=_int(stats.get("leftOnBase")),
                                batting_avg=_float(season_stats.get("avg")),
                                obp=_float(season_stats.get("obp")),
                                slg=_float(season_stats.get("slg")),
                                ops=_float(season_stats.get("ops")),
                            ))

                session.commit()

        log.info("fetch_stats (baseball): upserted %d team-match rows.", total_upserted)
        return total_upserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Fetch MLB box score stats")
    parser.add_argument("--days-back", type=int, default=7)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    fetch_all(days_back=args.days_back, dry_run=args.dry_run)
