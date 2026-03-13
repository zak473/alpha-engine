"""
Fetch NHL team box score stats from the free NHL Stats API and upsert into
hockey_team_match_stats.

Source: https://api-web.nhle.com (no API key required, official NHL API)

Fetches schedule + boxscore for recent games and matches them to CoreMatch
records via team name normalization.

Usage:
    python -m pipelines.hockey.fetch_stats
    python -m pipelines.hockey.fetch_stats --days-back 7
    python -m pipelines.hockey.fetch_stats --dry-run
"""

from __future__ import annotations

import argparse
import logging
import re
import time
import unicodedata
from datetime import date, timedelta, datetime, timezone
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from db.session import SessionLocal

log = logging.getLogger(__name__)

NHL_BASE = "https://api-web.nhle.com/v1"


def _get(path: str) -> Any:
    url = f"{NHL_BASE}{path}"
    try:
        resp = httpx.get(url, timeout=20, follow_redirects=True)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        log.warning("NHL API error %s: %s", path, exc)
        return None


def _norm(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    return re.sub(r"[^a-z0-9]", "", nfkd.encode("ascii", "ignore").decode().lower())


def _fetch_schedule(game_date: date) -> list[dict]:
    data = _get(f"/schedule/{game_date.isoformat()}")
    if not data:
        return []
    games = []
    for week in data.get("gameWeek", []):
        games.extend(week.get("games", []))
    return games


def _fetch_boxscore(game_id: int) -> Optional[dict]:
    return _get(f"/gamecenter/{game_id}/boxscore")


def _upsert_stats(session: Session, match_id: str, team_id: str, is_home: bool, stats: dict) -> None:
    from db.models.hockey import HockeyTeamMatchStats
    from datetime import datetime, timezone

    existing = (
        session.query(HockeyTeamMatchStats)
        .filter_by(match_id=match_id, team_id=team_id)
        .first()
    )
    if existing is None:
        existing = HockeyTeamMatchStats(
            match_id=match_id,
            team_id=team_id,
            is_home=is_home,
            created_at=datetime.now(timezone.utc),
        )
        session.add(existing)

    for k, v in stats.items():
        if hasattr(existing, k) and v is not None:
            setattr(existing, k, v)


def _parse_team_stats(team_data: dict, period_scores: list[dict], is_home: bool) -> dict:
    stats = {}

    # Goals by period
    goals_by_period = {}
    for p in period_scores:
        pnum = p.get("periodDescriptor", {}).get("number", 0)
        key = "home" if is_home else "away"
        goals_by_period[pnum] = p.get(key, {}).get("goals", 0) if isinstance(p.get(key), dict) else 0

    stats["goals_p1"] = goals_by_period.get(1)
    stats["goals_p2"] = goals_by_period.get(2)
    stats["goals_p3"] = goals_by_period.get(3)
    stats["goals_ot"] = goals_by_period.get(4)

    # Team stats from boxscore
    ts = team_data.get("teamGameStats", [])
    stat_map: dict[str, Any] = {}
    for item in ts:
        cat = item.get("category", "")
        val = item.get("homeValue") if is_home else item.get("awayValue")
        stat_map[cat] = val

    def _int(v) -> Optional[int]:
        try:
            return int(v) if v is not None else None
        except (ValueError, TypeError):
            return None

    def _float(v) -> Optional[float]:
        try:
            f = float(str(v).replace("%", "")) if v is not None else None
            return round(f / 100.0, 4) if f is not None and f > 1.0 else f
        except (ValueError, TypeError):
            return None

    stats["shots_on_goal"] = _int(stat_map.get("sog"))
    stats["faceoff_pct"]   = _float(stat_map.get("faceoffWinningPctg"))
    stats["power_play_pct"] = _float(stat_map.get("powerPlayPctg"))
    stats["penalty_minutes"] = _int(stat_map.get("pim"))
    stats["hits"]          = _int(stat_map.get("hits"))
    stats["blocked_shots"] = _int(stat_map.get("blockedShots"))
    stats["giveaways"]     = _int(stat_map.get("giveaways"))
    stats["takeaways"]     = _int(stat_map.get("takeaways"))

    pp_raw = stat_map.get("powerPlay", "")
    if pp_raw and "/" in str(pp_raw):
        parts = str(pp_raw).split("/")
        stats["power_play_goals"]        = _int(parts[0].strip())
        stats["power_play_opportunities"] = _int(parts[1].strip())

    return stats


def fetch_all(days_back: int = 3, dry_run: bool = False) -> int:
    from db.models.mvp import CoreMatch, CoreTeam

    session = SessionLocal()
    total = 0

    try:
        today = date.today()
        dates = [today - timedelta(days=i) for i in range(days_back)]

        for game_date in dates:
            games = _fetch_schedule(game_date)
            log.info("NHL schedule %s: %d games", game_date, len(games))

            for game in games:
                game_id = game.get("id")
                if not game_id:
                    continue

                game_state = game.get("gameState", "")
                if game_state not in ("OFF", "FINAL", "LIVE", "CRIT"):
                    continue

                home_name = (game.get("homeTeam", {}).get("name", {}).get("default") or
                             game.get("homeTeam", {}).get("commonName", {}).get("default") or "").strip()
                away_name = (game.get("awayTeam", {}).get("name", {}).get("default") or
                             game.get("awayTeam", {}).get("commonName", {}).get("default") or "").strip()

                if not home_name or not away_name:
                    continue

                # Find matching CoreMatch by team name + date
                home_norm = _norm(home_name)
                away_norm = _norm(away_name)

                home_teams = [t for t in session.query(CoreTeam).filter(
                    CoreTeam.provider_id.like("odds-hockey-%")
                ).all() if _norm(t.name) == home_norm or home_norm in _norm(t.name)]

                away_teams = [t for t in session.query(CoreTeam).filter(
                    CoreTeam.provider_id.like("odds-hockey-%")
                ).all() if _norm(t.name) == away_norm or away_norm in _norm(t.name)]

                if not home_teams or not away_teams:
                    log.debug("No CoreTeam match for %s vs %s", home_name, away_name)
                    continue

                # Find CoreMatch for these teams around this date
                from sqlalchemy import or_, and_
                from datetime import datetime
                date_start = datetime(game_date.year, game_date.month, game_date.day, tzinfo=timezone.utc)
                date_end = date_start + timedelta(days=1)

                home_ids = [t.id for t in home_teams]
                away_ids = [t.id for t in away_teams]

                match = (
                    session.query(CoreMatch)
                    .filter(
                        CoreMatch.sport == "hockey",
                        CoreMatch.kickoff_utc >= date_start,
                        CoreMatch.kickoff_utc < date_end,
                        CoreMatch.home_team_id.in_(home_ids),
                        CoreMatch.away_team_id.in_(away_ids),
                    )
                    .first()
                )

                if not match:
                    log.debug("No CoreMatch found for %s vs %s on %s", home_name, away_name, game_date)
                    continue

                # Fetch boxscore
                boxscore = _fetch_boxscore(game_id)
                if not boxscore:
                    continue

                period_scores = boxscore.get("linescore", {}).get("byPeriod", [])

                home_score_total = game.get("homeTeam", {}).get("score")
                away_score_total = game.get("awayTeam", {}).get("score")

                home_stats = _parse_team_stats(boxscore, period_scores, is_home=True)
                home_stats["goals"] = home_score_total

                away_stats = _parse_team_stats(boxscore, period_scores, is_home=False)
                away_stats["goals"] = away_score_total

                # Compute save_pct: saves / shots_faced
                home_sog = home_stats.get("shots_on_goal")
                away_sog = away_stats.get("shots_on_goal")
                if home_sog and away_score_total is not None:
                    saves = home_sog - (away_score_total or 0)
                    home_stats["save_pct"] = round(saves / home_sog, 4) if home_sog > 0 else None
                if away_sog and home_score_total is not None:
                    saves = away_sog - (home_score_total or 0)
                    away_stats["save_pct"] = round(saves / away_sog, 4) if away_sog > 0 else None

                if not dry_run:
                    _upsert_stats(session, match.id, match.home_team_id, True, home_stats)
                    _upsert_stats(session, match.id, match.away_team_id, False, away_stats)
                    session.commit()

                total += 1
                log.info("Upserted stats: %s vs %s (%s)", home_name, away_name, game_date)
                time.sleep(0.2)

    except Exception:
        session.rollback()
        log.exception("fetch_stats failed")
        raise
    finally:
        session.close()

    log.info("fetch_stats complete. %d games processed.", total)
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch NHL box score stats")
    parser.add_argument("--days-back", type=int, default=3)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = fetch_all(days_back=args.days_back, dry_run=args.dry_run)
    print(f"Done. {n} games processed.")


if __name__ == "__main__":
    main()
