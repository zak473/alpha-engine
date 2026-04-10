"""
Fetch tennis fixtures, live scores, and point-by-point stats from api-tennis.com.

Provides real:
  - Fixtures + live scores (sets won)
  - Per-set game scores
  - Service hold %, break points faced/saved/converted (derived from point-by-point)
  - Surface and round info
  - H2H records (populated into CoreMatch history)

Register at https://api-tennis.com → API key → set TENNIS_LIVE_API_KEY in .env

Usage:
    docker compose exec api python -m pipelines.tennis.fetch_api_tennis
    docker compose exec api python -m pipelines.tennis.fetch_api_tennis --dry-run
    docker compose exec api python -m pipelines.tennis.fetch_api_tennis --days 3
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from config.settings import settings

log = logging.getLogger(__name__)

BASE_URL = "https://api.api-tennis.com/tennis/"

# Map api-tennis event_type_type → surface guess
SURFACE_HINTS = {
    "clay": "clay",
    "grass": "grass",
    "carpet": "carpet",
    "hard": "hard",
    "indoor hard": "hard",
    "outdoor hard": "hard",
    "aus open": "hard",
    "australian open": "hard",
    "us open": "hard",
    "wimbledon": "grass",
    "french open": "clay",
    "roland garros": "clay",
    "masters 1000": "hard",
    "masters": "hard",
}

TOURNAMENT_LEVEL_MAP = {
    "Grand Slam": "grand_slam",
    "ATP Finals": "atp_finals",
    "Masters": "masters",
    "ATP 500": "atp500",
    "ATP 250": "atp250",
    "Challenger": "challenger",
    "ITF": "itf",
    "WTA Finals": "wta_finals",
    "WTA 1000": "wta1000",
    "WTA 500": "wta500",
    "WTA 250": "wta250",
}


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _get(method: str, params: dict | None = None) -> Any:
    p = {
        "method": method,
        "APIkey": settings.TENNIS_LIVE_API_KEY,
        **(params or {}),
    }
    resp = httpx.get(BASE_URL, params=p, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        log.warning("api-tennis returned success=0 for %s: %s", method, data)
        return []
    return data.get("result", [])


# ---------------------------------------------------------------------------
# Point-by-point parsing → serve stats
# ---------------------------------------------------------------------------

def _parse_serve_stats(pointbypoint: list[dict], first_player: str, second_player: str) -> dict:
    """
    Derive serve/return stats for both players from point-by-point game data.

    Returns dict with keys: "first" and "second", each containing:
      service_games_played, service_games_held, break_points_faced,
      break_points_saved, break_points_created, break_points_converted,
      service_hold_pct, bp_conversion_pct
    """
    stats: dict[str, dict] = {
        "first":  {"svc_played": 0, "svc_held": 0, "bp_faced": 0, "bp_saved": 0,
                   "bp_created": 0, "bp_converted": 0},
        "second": {"svc_played": 0, "svc_held": 0, "bp_faced": 0, "bp_saved": 0,
                   "bp_created": 0, "bp_converted": 0},
    }

    for game in (pointbypoint or []):
        server = game.get("player_served", "")          # "First Player" | "Second Player"
        winner = game.get("serve_winner", "")            # "First Player" | "Second Player"

        if not server:
            continue

        srv_key = "first" if "First" in server else "second"
        ret_key = "second" if srv_key == "first" else "first"
        srv_won = winner and (
            ("First" in winner and srv_key == "first") or
            ("Second" in winner and srv_key == "second")
        )

        stats[srv_key]["svc_played"] += 1

        # Check for break points in this game's points list
        had_bp = any(
            p.get("break_point") is not None
            for p in game.get("points", [])
        )
        if had_bp:
            stats[srv_key]["bp_faced"] += 1
            stats[ret_key]["bp_created"] += 1

        if srv_won:
            stats[srv_key]["svc_held"] += 1
            if had_bp:
                stats[srv_key]["bp_saved"] += 1
        else:
            # Server lost = return won = break converted
            if had_bp:
                stats[ret_key]["bp_converted"] += 1

    result = {}
    for side, s in stats.items():
        played = s["svc_played"]
        held = s["svc_held"]
        bp_faced = s["bp_faced"]
        bp_saved = s["bp_saved"]
        bp_created = s["bp_created"]
        bp_converted = s["bp_converted"]
        result[side] = {
            "service_games_played": played,
            "service_games_held": held,
            "service_hold_pct": round(held / played, 3) if played > 0 else None,
            "break_points_faced": bp_faced,
            "break_points_saved": bp_saved,
            "break_points_created": bp_created,
            "break_points_converted": bp_converted,
            "bp_conversion_pct": round(bp_converted / bp_created, 3) if bp_created > 0 else None,
        }
    return result


# ---------------------------------------------------------------------------
# Set scores parsing
# ---------------------------------------------------------------------------

def _parse_sets(scores: list[dict]) -> tuple[Optional[int], Optional[int], str]:
    """
    Parse the scores array from api-tennis.
    Returns (player_a_sets_won, player_b_sets_won, sets_json_str).

    scores format: [
        {"score_first": "7", "score_second": "6", "score_set": "1",
         "tie_score_first": "7", "tie_score_second": "3"},
        ...
    ]
    """
    sets_detail = []
    a_sets = b_sets = 0
    for s in (scores or []):
        try:
            a_g = int(s.get("score_first") or 0)
            b_g = int(s.get("score_second") or 0)
        except (ValueError, TypeError):
            continue
        if a_g == 0 and b_g == 0:
            continue  # empty set slot

        entry: dict = {"set_num": len(sets_detail) + 1, "a": a_g, "b": b_g}

        # Tiebreak scores (api-tennis provides tie_score_first / tie_score_second)
        try:
            tb_a_raw = s.get("tie_score_first")
            tb_b_raw = s.get("tie_score_second")
            if tb_a_raw is not None and tb_b_raw is not None:
                entry["tb_a"] = int(tb_a_raw)
                entry["tb_b"] = int(tb_b_raw)
        except (ValueError, TypeError):
            pass

        sets_detail.append(entry)
        if a_g > b_g:
            a_sets += 1
        elif b_g > a_g:
            b_sets += 1

    sets_json = json.dumps(sets_detail) if sets_detail else None
    return (
        a_sets if sets_detail else None,
        b_sets if sets_detail else None,
        sets_json,
    )


# ---------------------------------------------------------------------------
# Surface detection
# ---------------------------------------------------------------------------

def _infer_surface(event_type: str, tournament_name: str) -> str:
    combined = (event_type + " " + tournament_name).lower()
    for hint, surface in SURFACE_HINTS.items():
        if hint in combined:
            return surface
    # Default: ATP hard
    return "hard"


def _infer_tournament_level(event_type: str) -> str:
    for key, level in TOURNAMENT_LEVEL_MAP.items():
        if key.lower() in event_type.lower():
            return level
    return "atp250"


def _infer_best_of(event_type: str, tournament_name: str) -> int:
    combined = (event_type + " " + tournament_name).lower()
    if "grand slam" in combined or "grand_slam" in combined:
        return 5
    return 3


# ---------------------------------------------------------------------------
# Main ingest logic
# ---------------------------------------------------------------------------

def _upsert_match(session: Session, event: dict, dry_run: bool = False) -> Optional[str]:
    """
    Upsert a CoreMatch from an api-tennis event dict.
    Returns the CoreMatch.id if successful, else None.
    """
    from db.models.mvp import CoreLeague, CoreMatch, CoreTeam
    from db.models.tennis import TennisMatch

    first_player = (event.get("event_first_player") or "").strip()
    second_player = (event.get("event_second_player") or "").strip()
    if not first_player or not second_player:
        return None

    # Skip doubles matches (player names contain "/" indicating a pair)
    if "/" in first_player or "/" in second_player:
        log.debug("Skipping doubles match: %s vs %s", first_player, second_player)
        return None

    event_key = str(event.get("event_key", ""))
    event_date = event.get("event_date", "")
    event_time = event.get("event_time", "")
    tournament_name = (event.get("tournament_name") or "").strip()
    tournament_key = str(event.get("tournament_key", ""))
    event_type = (event.get("event_type_type") or "").strip()
    season = event.get("tournament_season", "")[:4] if event.get("tournament_season") else ""
    event_live = str(event.get("event_live", "0"))
    event_status = (event.get("event_status") or "").strip()
    event_winner = event.get("event_winner")  # "First Player" | "Second Player" | null
    first_player_key = str(event.get("first_player_key", ""))
    second_player_key = str(event.get("second_player_key", ""))

    # Parse kickoff UTC
    kickoff_str = f"{event_date}T{event_time}:00"
    try:
        kickoff = datetime.fromisoformat(kickoff_str).replace(tzinfo=timezone.utc)
    except ValueError:
        kickoff = datetime.now(timezone.utc)

    # Determine status
    finished_statuses = {"Finished", "After Retirement", "Walkover", "Default"}
    if event_status in finished_statuses or event_winner:
        status = "finished"
    elif event_live == "1":
        status = "live"
    else:
        status = "scheduled"

    # Parse score
    final_result = (event.get("event_final_result") or "0 - 0").strip()
    try:
        parts = [p.strip() for p in final_result.split("-")]
        home_score_int = int(parts[0]) if parts[0].strip().isdigit() else None
        away_score_int = int(parts[1]) if len(parts) > 1 and parts[1].strip().isdigit() else None
    except (ValueError, IndexError):
        home_score_int = away_score_int = None

    home_score = str(home_score_int) if home_score_int is not None else ""
    away_score = str(away_score_int) if away_score_int is not None else ""

    # Outcome — normalise to home_win/away_win for consistency with other sports
    outcome = None
    if event_winner == "First Player":
        outcome = "home_win"
    elif event_winner == "Second Player":
        outcome = "away_win"
    elif status == "finished" and home_score_int is not None and away_score_int is not None:
        if home_score_int > away_score_int:
            outcome = "home_win"
        elif away_score_int > home_score_int:
            outcome = "away_win"

    provider_id = f"apitns-{event_key}"

    if dry_run:
        log.info("[dry-run] Would upsert: %s vs %s (%s) status=%s", first_player, second_player, tournament_name, status)
        return f"dry-{event_key}"

    # --- League ---
    league_provider_id = f"apitns-league-{tournament_key}"
    league = session.query(CoreLeague).filter_by(provider_id=league_provider_id).first()
    if league is None:
        from db.models.mvp import _uuid
        league = CoreLeague(
            id=_uuid(),
            provider_id=league_provider_id,
            name=tournament_name or "Tennis",
            sport="tennis",
            country=None,
        )
        session.add(league)
        session.flush()

    # --- Home player (first_player) ---
    home_logo = (event.get("event_first_player_logo") or "").strip() or None
    home_pid = f"apitns-player-{first_player_key}" if first_player_key else f"apitns-player-{first_player.lower().replace(' ', '-')}"
    home_team = session.query(CoreTeam).filter_by(provider_id=home_pid).first()
    if home_team is None:
        from db.models.mvp import _uuid
        home_team = CoreTeam(
            id=_uuid(),
            provider_id=home_pid,
            name=first_player,
            short_name=first_player.split(".")[-1].strip() if "." in first_player else first_player,
            logo_url=home_logo,
        )
        session.add(home_team)
        session.flush()
    elif home_logo and not home_team.logo_url:
        home_team.logo_url = home_logo

    # --- Away player (second_player) ---
    away_logo = (event.get("event_second_player_logo") or "").strip() or None
    away_pid = f"apitns-player-{second_player_key}" if second_player_key else f"apitns-player-{second_player.lower().replace(' ', '-')}"
    away_team = session.query(CoreTeam).filter_by(provider_id=away_pid).first()
    if away_team is None:
        from db.models.mvp import _uuid
        away_team = CoreTeam(
            id=_uuid(),
            provider_id=away_pid,
            name=second_player,
            short_name=second_player.split(".")[-1].strip() if "." in second_player else second_player,
            logo_url=away_logo,
        )
        session.add(away_team)
        session.flush()
    elif away_logo and not away_team.logo_url:
        away_team.logo_url = away_logo

    # Skip if both players resolved to the same entity (happens with some doubles formats)
    if home_team.id == away_team.id:
        log.debug("Skipping self-play match: %s vs %s → same entity", first_player, second_player)
        return None

    # --- CoreMatch upsert ---
    # First: try to find an existing match (e.g. from Odds API) with same players on same date
    # so we can attach TennisMatch data to it rather than creating a duplicate record
    match = session.query(CoreMatch).filter_by(provider_id=provider_id).first()
    if match is None:
        # Look for a match with same player names on the same date (any provider)
        from datetime import timedelta
        kickoff_day_start = kickoff.replace(hour=0, minute=0, second=0, microsecond=0)
        kickoff_day_end = kickoff_day_start + timedelta(days=1)

        # Find all CoreTeam IDs with the same player name (could be odds- or apitns- prefixed)
        home_name_ids = [t.id for t in session.query(CoreTeam).filter_by(name=first_player).all()]
        away_name_ids = [t.id for t in session.query(CoreTeam).filter_by(name=second_player).all()]

        if home_name_ids and away_name_ids:
            existing = (
                session.query(CoreMatch)
                .filter(
                    CoreMatch.sport == "tennis",
                    CoreMatch.home_team_id.in_(home_name_ids),
                    CoreMatch.away_team_id.in_(away_name_ids),
                    CoreMatch.kickoff_utc >= kickoff_day_start,
                    CoreMatch.kickoff_utc < kickoff_day_end,
                )
                .first()
            )
            if existing:
                log.debug("Linking api-tennis event %s → existing match %s", event_key, existing.id)
                match = existing

    is_new = match is None
    if is_new:
        from db.models.mvp import _uuid
        match = CoreMatch(id=_uuid(), provider_id=provider_id, sport="tennis")
        session.add(match)

    match.league_id = league.id
    match.home_team_id = match.home_team_id if not is_new else home_team.id
    match.away_team_id = match.away_team_id if not is_new else away_team.id
    match.kickoff_utc = kickoff
    match.status = status
    match.home_score = home_score_int
    match.away_score = away_score_int
    match.outcome = outcome
    match.season = season
    session.flush()

    # --- TennisMatch upsert (surface, round, sets) ---
    surface = _infer_surface(event_type, tournament_name)
    tournament_level = _infer_tournament_level(event_type)
    best_of = _infer_best_of(event_type, tournament_name)
    round_name = (event.get("tournament_round") or "").replace(tournament_name + " - ", "").strip() or None

    a_sets, b_sets, sets_json = _parse_sets(event.get("scores", []))

    tm = session.get(TennisMatch, match.id)
    if tm is None:
        tm = TennisMatch(match_id=match.id)
        session.add(tm)

    tm.surface = surface
    tm.tournament_level = tournament_level
    tm.best_of = best_of
    tm.round_name = round_name
    if a_sets is not None:
        tm.player_a_sets = a_sets
        tm.player_b_sets = b_sets
    if sets_json:
        tm.sets_json = sets_json
    tm.retired = "Retirement" in event_status or "After Retirement" in (event_status or "")

    session.flush()
    return match.id


def _parse_match_statistics(stats_list: list[dict]) -> dict:
    """
    Parse api-tennis get_match_statistics response into per-player stat dicts.

    api-tennis format:
        [{"type": "Aces", "home": "12", "away": "5"}, ...]

    Returns {"first": {...}, "second": {...}}
    """
    def _int(v) -> Optional[int]:
        try:
            return int(v) if v not in (None, "", "-") else None
        except (ValueError, TypeError):
            return None

    def _float(v) -> Optional[float]:
        try:
            s = str(v).replace("%", "").strip()
            return float(s) if s not in ("", "-") else None
        except (ValueError, TypeError):
            return None

    first: dict = {}
    second: dict = {}

    for stat in (stats_list or []):
        t = (stat.get("type") or "").strip().lower()
        h = stat.get("home")
        a = stat.get("away")

        if "aces" in t:
            first["aces"] = _int(h)
            second["aces"] = _int(a)
        elif "double fault" in t:
            first["double_faults"] = _int(h)
            second["double_faults"] = _int(a)
        elif "first serve" in t and "%" in t and "won" not in t:
            first["first_serve_in_pct"] = _float(h)
            second["first_serve_in_pct"] = _float(a)
        elif "first serve points won" in t or ("1st serve" in t and "won" in t):
            first["first_serve_won_pct"] = _float(h)
            second["first_serve_won_pct"] = _float(a)
        elif "second serve points won" in t or ("2nd serve" in t and "won" in t):
            first["second_serve_won_pct"] = _float(h)
            second["second_serve_won_pct"] = _float(a)
        elif "first serve speed" in t or ("1st serve" in t and "speed" in t and "max" not in t):
            first["first_serve_avg_mph"] = _float(h)
            second["first_serve_avg_mph"] = _float(a)
        elif "first serve max speed" in t or "max" in t and "1st" in t:
            first["first_serve_max_mph"] = _float(h)
            second["first_serve_max_mph"] = _float(a)
        elif "second serve speed" in t or ("2nd serve" in t and "speed" in t):
            first["second_serve_avg_mph"] = _float(h)
            second["second_serve_avg_mph"] = _float(a)
        elif t == "winners":
            first["winners"] = _int(h)
            second["winners"] = _int(a)
        elif "unforced error" in t:
            first["unforced_errors"] = _int(h)
            second["unforced_errors"] = _int(a)
        elif "forced error" in t:
            first["forced_errors"] = _int(h)
            second["forced_errors"] = _int(a)
        elif "net point" in t and "won" in t:
            first["net_points_won"] = _int(h)
            second["net_points_won"] = _int(a)
        elif "net approach" in t or "net points played" in t:
            first["net_approaches"] = _int(h)
            second["net_approaches"] = _int(a)
        elif "service points won" in t:
            first["service_points_won"] = _int(h)
            second["service_points_won"] = _int(a)
        elif "service points played" in t:
            first["service_points_played"] = _int(h)
            second["service_points_played"] = _int(a)
        elif "return points won" in t:
            first["return_points_won"] = _int(h)
            second["return_points_won"] = _int(a)
        elif "return points played" in t:
            first["return_points_played"] = _int(h)
            second["return_points_played"] = _int(a)
        elif "total points won" in t:
            first["total_points_won"] = _int(h)
            second["total_points_won"] = _int(a)
        elif "break point" in t and "won" in t:
            first["bp_conversion_pct"] = _float(h)
            second["bp_conversion_pct"] = _float(a)
        elif "break point" in t and "saved" in t:
            first["break_points_saved"] = _int(h)
            second["break_points_saved"] = _int(a)
        elif "break point" in t and "faced" in t:
            first["break_points_faced"] = _int(h)
            second["break_points_faced"] = _int(a)
        elif "break point" in t and "converted" in t:
            first["break_points_converted"] = _int(h)
            second["break_points_converted"] = _int(a)
        elif "return on 1st serve" in t or "first serve return" in t:
            first["first_serve_return_won_pct"] = _float(h)
            second["first_serve_return_won_pct"] = _float(a)
        elif "return on 2nd serve" in t or "second serve return" in t:
            first["second_serve_return_won_pct"] = _float(h)
            second["second_serve_return_won_pct"] = _float(a)

    return {"first": first, "second": second}


def _upsert_match_stats(
    session: Session,
    match_id: str,
    home_team_id: str,
    away_team_id: str,
    serve_stats: dict,
    extended_stats: Optional[dict] = None,
) -> None:
    """Write TennisMatchStats rows for home + away players."""
    from db.models.tennis import TennisMatchStats

    ext = extended_stats or {"first": {}, "second": {}}

    for side, player_id in [("first", home_team_id), ("second", away_team_id)]:
        s = serve_stats.get(side, {})
        e = ext.get(side, {})
        if not s and not e:
            continue

        row = (
            session.query(TennisMatchStats)
            .filter_by(match_id=match_id, player_id=player_id)
            .first()
        )
        if row is None:
            row = TennisMatchStats(match_id=match_id, player_id=player_id)
            session.add(row)

        # Base serve stats from point-by-point
        row.service_games_played = s.get("service_games_played")
        row.service_games_held = s.get("service_games_held")
        row.service_hold_pct = s.get("service_hold_pct")
        row.break_points_faced = s.get("break_points_faced") or e.get("break_points_faced")
        row.break_points_saved = s.get("break_points_saved") or e.get("break_points_saved")
        row.break_points_created = s.get("break_points_created")
        row.break_points_converted = s.get("break_points_converted") or e.get("break_points_converted")
        row.bp_conversion_pct = s.get("bp_conversion_pct") or e.get("bp_conversion_pct")
        # return_games = opponent's service games
        opp_side = "second" if side == "first" else "first"
        opp = serve_stats.get(opp_side, {})
        row.return_games_played = opp.get("service_games_played")
        row.return_games_won = (opp.get("service_games_played", 0) or 0) - (opp.get("service_games_held", 0) or 0)

        # Extended stats from get_match_statistics
        if e.get("aces") is not None:
            row.aces = e["aces"]
        if e.get("double_faults") is not None:
            row.double_faults = e["double_faults"]
        if e.get("first_serve_in_pct") is not None:
            row.first_serve_in_pct = e["first_serve_in_pct"]
        if e.get("first_serve_won_pct") is not None:
            row.first_serve_won_pct = e["first_serve_won_pct"]
        if e.get("second_serve_won_pct") is not None:
            row.second_serve_won_pct = e["second_serve_won_pct"]
        if e.get("first_serve_avg_mph") is not None:
            row.first_serve_avg_mph = e["first_serve_avg_mph"]
        if e.get("first_serve_max_mph") is not None:
            row.first_serve_max_mph = e["first_serve_max_mph"]
        if e.get("second_serve_avg_mph") is not None:
            row.second_serve_avg_mph = e["second_serve_avg_mph"]
        if e.get("winners") is not None:
            row.winners = e["winners"]
        if e.get("unforced_errors") is not None:
            row.unforced_errors = e["unforced_errors"]
        if e.get("forced_errors") is not None:
            row.forced_errors = e["forced_errors"]
        if e.get("net_approaches") is not None:
            row.net_approaches = e["net_approaches"]
        if e.get("net_points_won") is not None:
            row.net_points_won = e["net_points_won"]
        if e.get("service_points_played") is not None:
            row.service_points_played = e["service_points_played"]
        if e.get("service_points_won") is not None:
            row.service_points_won = e["service_points_won"]
        if e.get("return_points_played") is not None:
            row.return_points_played = e["return_points_played"]
        if e.get("return_points_won") is not None:
            row.return_points_won = e["return_points_won"]
        if e.get("total_points_won") is not None:
            row.total_points_won = e["total_points_won"]
        if e.get("first_serve_return_won_pct") is not None:
            row.first_serve_return_won_pct = e["first_serve_return_won_pct"]
        if e.get("second_serve_return_won_pct") is not None:
            row.second_serve_return_won_pct = e["second_serve_return_won_pct"]

    session.flush()


# ---------------------------------------------------------------------------
# Public fetch entry point
# ---------------------------------------------------------------------------

def fetch_all(dry_run: bool = False, days: int = 2) -> int:
    """
    Fetch fixtures + live scores from api-tennis.com and upsert into the DB.

    - Fetches today + next `days` days of scheduled fixtures
    - Fetches all live matches
    - Parses set scores and serve stats from point-by-point data
    - Upserts CoreMatch, TennisMatch, TennisMatchStats

    Returns total number of match rows processed.
    """
    if not settings.TENNIS_LIVE_API_KEY:
        log.error(
            "TENNIS_LIVE_API_KEY not set. "
            "Register at https://api-tennis.com and set the key in .env"
        )
        return 0

    from db.session import engine

    all_events: list[dict] = []

    # 1. Live matches (real-time)
    try:
        live = _get("get_livescore")
        log.info("api-tennis: %d live matches", len(live))
        all_events.extend(live)
    except Exception as exc:
        log.warning("api-tennis get_livescore failed: %s", exc)
    time.sleep(0.5)

    # 2. Fixtures for today + upcoming days
    today = date.today()
    for offset in range(days + 1):
        d = today + timedelta(days=offset)
        date_str = d.isoformat()
        try:
            fixtures = _get("get_fixtures", {
                "date_start": date_str,
                "date_stop": date_str,
            })
            log.info("api-tennis: %d fixtures for %s", len(fixtures), date_str)
            all_events.extend(fixtures)
        except Exception as exc:
            log.warning("api-tennis get_fixtures for %s failed: %s", date_str, exc)
        time.sleep(0.4)

    # 3. Yesterday's finished results
    yesterday = (today - timedelta(days=1)).isoformat()
    try:
        finished = _get("get_fixtures", {
            "date_start": yesterday,
            "date_stop": yesterday,
        })
        log.info("api-tennis: %d fixtures for %s (yesterday)", len(finished), yesterday)
        all_events.extend(finished)
    except Exception as exc:
        log.warning("api-tennis get_fixtures for yesterday failed: %s", exc)
    time.sleep(0.4)

    # Deduplicate by event_key
    seen: set[str] = set()
    unique_events = []
    for ev in all_events:
        k = str(ev.get("event_key", ""))
        if k and k not in seen:
            seen.add(k)
            unique_events.append(ev)

    log.info("api-tennis: %d unique events to process", len(unique_events))

    if not unique_events:
        return 0

    with Session(engine) as session:
        processed = 0
        stats_failures = 0  # circuit breaker: stop trying stats after 3 consecutive failures
        for event in unique_events:
            try:
                match_id = _upsert_match(session, event, dry_run=dry_run)
                if not match_id or dry_run:
                    processed += 1
                    continue

                # Parse and store serve stats if point-by-point data available
                pointbypoint = event.get("pointbypoint")
                first_player = event.get("event_first_player", "")
                second_player = event.get("event_second_player", "")
                serve_stats = _parse_serve_stats(pointbypoint or [], first_player, second_player)

                # Fetch extended match statistics (serve speeds, winners, UE)
                # Only attempt for live matches — api-tennis free tier returns 500
                # for scheduled/finished matches; live matches have real-time stats.
                extended_stats = None
                event_key = str(event.get("event_key", ""))
                if event_key and event.get("event_live") == "1" and stats_failures < 3:
                    try:
                        stats_result = _get("get_match_statistics", {"event_id": event_key})
                        if stats_result:
                            extended_stats = _parse_match_statistics(stats_result)
                            stats_failures = 0  # reset on success
                        else:
                            stats_failures += 1
                    except Exception as exc:
                        stats_failures += 1
                        if stats_failures >= 3:
                            log.warning("get_match_statistics returning errors — skipping stats for this run.")
                        else:
                            log.debug("get_match_statistics failed for event %s: %s", event_key, exc)
                    time.sleep(0.3)

                if pointbypoint or extended_stats:
                    from db.models.mvp import CoreMatch
                    match = session.get(CoreMatch, match_id)
                    if match:
                        _upsert_match_stats(
                            session,
                            match_id,
                            match.home_team_id,
                            match.away_team_id,
                            serve_stats,
                            extended_stats=extended_stats,
                        )

                session.commit()
                processed += 1
            except Exception as exc:
                session.rollback()
                log.warning("Failed to process event %s: %s", event.get("event_key"), exc)

        log.info("fetch_api_tennis: processed %d events.", processed)
        return processed


# ---------------------------------------------------------------------------
# Odds fetcher — populate core_matches.odds_home/away from api-tennis
# ---------------------------------------------------------------------------

def fetch_match_odds(dry_run: bool = False) -> int:
    """
    For every upcoming/live tennis CoreMatch, call api-tennis get_odds and
    store the best-available decimal odds in odds_home / odds_away.

    api-tennis returns a list of bookmaker rows per match:
        [{"odd_1": "1.75", "odd_2": "2.10", "bookmaker_name": "..."}, ...]
    We take the first bookmaker that has both values.
    """
    if not settings.TENNIS_LIVE_API_KEY:
        return 0

    from datetime import timezone
    from db.models.mvp import CoreMatch
    from db.session import SessionLocal

    db = SessionLocal()
    updated = 0
    now = datetime.now(timezone.utc)

    try:
        upcoming = (
            db.query(CoreMatch)
            .filter(
                CoreMatch.sport == "tennis",
                CoreMatch.status.in_(["scheduled", "live"]),
                CoreMatch.kickoff_utc >= now,
            )
            .all()
        )
        log.info("[tennis_odds] Checking odds for %d upcoming matches.", len(upcoming))

        for match in upcoming:
            # provider_id is "apitns-match-{event_key}"
            event_key = match.provider_id.replace("apitns-match-", "") if match.provider_id else None
            if not event_key or not event_key.isdigit():
                continue

            try:
                rows = _get("get_odds", {"event_key": event_key})
                time.sleep(0.3)
            except Exception as exc:
                log.debug("[tennis_odds] get_odds failed for %s: %s", event_key, exc)
                continue

            if not rows:
                continue

            # Find first bookmaker with both home + away odds
            home_dec = away_dec = None
            for row in rows:
                try:
                    h = float(row.get("odd_1") or 0)
                    a = float(row.get("odd_2") or 0)
                    if h > 1.0 and a > 1.0:
                        home_dec, away_dec = round(h, 3), round(a, 3)
                        break
                except (TypeError, ValueError):
                    continue

            if not home_dec or not away_dec:
                continue

            if match.odds_home != home_dec or match.odds_away != away_dec:
                log.info(
                    "[tennis_odds] %s: home=%.3f away=%.3f (was %s/%s)",
                    match.provider_id, home_dec, away_dec, match.odds_home, match.odds_away,
                )
                if not dry_run:
                    match.odds_home = home_dec
                    match.odds_away = away_dec
                    updated += 1

        if not dry_run:
            db.commit()
        log.info("[tennis_odds] Updated odds for %d matches.", updated)
        return updated

    except Exception as exc:
        db.rollback()
        log.error("[tennis_odds] fetch_match_odds failed: %s", exc, exc_info=True)
        return 0
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Player form builder — run after fetch to aggregate form stats
# ---------------------------------------------------------------------------

def build_player_form(dry_run: bool = False) -> int:
    """
    Compute rolling TennisPlayerForm stats for all players from their TennisMatchStats history.
    Aggregates last 365 days of data and writes/updates TennisPlayerForm rows.
    """
    from db.session import engine
    from db.models.mvp import CoreMatch, CoreTeam
    from db.models.tennis import TennisMatch, TennisMatchStats, TennisPlayerForm

    cutoff = datetime.now(timezone.utc) - timedelta(days=365)

    with Session(engine) as session:
        # Get all tennis players
        players = session.query(CoreTeam).filter(CoreTeam.provider_id.like("apitns-player-%")).all()
        updated = 0

        for player in players:
            as_of = datetime.now(timezone.utc)

            for surface in ("all", "hard", "clay", "grass"):
                # All finished tennis matches for this player (optionally surface-filtered)
                q = (
                    session.query(CoreMatch)
                    .filter(
                        CoreMatch.sport == "tennis",
                        CoreMatch.status == "finished",
                        CoreMatch.kickoff_utc >= cutoff,
                        (
                            (CoreMatch.home_team_id == player.id) |
                            (CoreMatch.away_team_id == player.id)
                        ),
                    )
                )
                if surface != "all":
                    q = q.join(TennisMatch, TennisMatch.match_id == CoreMatch.id).filter(
                        TennisMatch.surface == surface
                    )
                matches = q.all()

                if not matches:
                    continue

                wins = losses = 0
                hold_pcts: list[float] = []
                bp_conv_pcts: list[float] = []
                aces_list: list[float] = []
                df_list: list[float] = []
                first_in_list: list[float] = []
                first_won_list: list[float] = []
                ret_won_list: list[float] = []

                for m in matches:
                    is_home = m.home_team_id == player.id
                    if (m.outcome in ("H", "home_win") and is_home) or \
                       (m.outcome in ("A", "away_win") and not is_home):
                        wins += 1
                    else:
                        losses += 1

                    stats = (
                        session.query(TennisMatchStats)
                        .filter_by(match_id=m.id, player_id=player.id)
                        .first()
                    )
                    if stats:
                        if stats.service_hold_pct is not None:
                            hold_pcts.append(stats.service_hold_pct)
                        if stats.bp_conversion_pct is not None:
                            bp_conv_pcts.append(stats.bp_conversion_pct)
                        if stats.aces is not None:
                            aces_list.append(float(stats.aces))
                        if stats.double_faults is not None:
                            df_list.append(float(stats.double_faults))
                        if stats.first_serve_in_pct is not None:
                            first_in_list.append(stats.first_serve_in_pct)
                        if stats.first_serve_won_pct is not None:
                            first_won_list.append(stats.first_serve_won_pct)
                        if stats.first_serve_return_won_pct is not None:
                            ret_won_list.append(stats.first_serve_return_won_pct)

                total = wins + losses
                win_pct = round(wins / total, 3) if total > 0 else None

                def _avg(lst): return round(sum(lst) / len(lst), 3) if lst else None

                form_row = (
                    session.query(TennisPlayerForm)
                    .filter_by(player_id=player.id, surface=surface, window_days=365)
                    .first()
                )
                if form_row is None:
                    form_row = TennisPlayerForm(
                        player_id=player.id,
                        surface=surface,
                        window_days=365,
                        as_of_date=as_of,
                    )
                    session.add(form_row)

                form_row.as_of_date = as_of
                form_row.matches_played = total
                form_row.wins = wins
                form_row.losses = losses
                form_row.win_pct = win_pct
                form_row.avg_service_hold_pct = _avg(hold_pcts)
                form_row.avg_bp_conversion_pct = _avg(bp_conv_pcts)
                form_row.avg_aces_per_match = _avg(aces_list)
                form_row.avg_df_per_match = _avg(df_list)
                form_row.avg_first_serve_in_pct = _avg(first_in_list)
                form_row.avg_first_serve_won_pct = _avg(first_won_list)
                form_row.avg_return_won_pct = _avg(ret_won_list)
                updated += 1

        if not dry_run:
            session.commit()
        log.info("build_player_form: updated %d player form rows.", updated)
        return updated


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch tennis data from api-tennis.com")
    parser.add_argument("--dry-run", action="store_true", help="Parse but don't write to DB")
    parser.add_argument("--days", type=int, default=2, help="Days ahead to fetch fixtures for")
    parser.add_argument("--build-form", action="store_true", help="Also rebuild player form stats")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

    n = fetch_all(dry_run=args.dry_run, days=args.days)
    print(f"Fetched {n} events.")

    if args.build_form:
        f = build_player_form(dry_run=args.dry_run)
        print(f"Built form for {f} players.")


if __name__ == "__main__":
    main()
