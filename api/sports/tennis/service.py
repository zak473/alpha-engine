"""Tennis match service."""

from __future__ import annotations

import json
import logging

log = logging.getLogger(__name__)
import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session

from api.sports.base.interfaces import BaseMatchListService
from api.sports.tennis.schemas import (
    EloHistoryPoint,
    FairOddsOut,
    H2HRecordOut,
    KeyDriverOut,
    ModelMetaOut,
    ParticipantOut,
    ProbabilitiesOut,
    SetDetailOut,
    TennisMatchDetail,
    TennisMatchInfoOut,
    TennisMatchListItem,
    TennisMatchListResponse,
    TennisPlayerFormOut,
    TennisPlayerProfileOut,
    TennisServeStatsOut,
    TennisSurfaceEloOut,
    TennisTiebreakOut,
)
from db.models.mvp import (
    CoreLeague,
    CoreMatch,
    CoreTeam,
    ModelRegistry,
    PredMatch,
    RatingEloTeam,
)
from db.models.tennis import TennisMatch, TennisMatchStats, TennisPlayerForm, TennisPlayerProfile


# ─── Real tournament metadata lookups ─────────────────────────────────────────

# Official ATP/WTA prize money by tournament level (2024/25 season)
_PRIZE_BY_LEVEL: dict[str, int] = {
    "grand_slam": 65_000_000,
    "atp_finals": 15_250_000,
    "wta_finals": 15_250_000,
    "masters":     8_995_200,
    "wta1000":     8_995_200,
    "atp500":      2_098_620,
    "wta500":      2_098_620,
    "atp250":        661_825,
    "wta250":        275_640,
    "challenger":    132_000,
    "itf":            15_000,
}

# Official ATP singles ranking points for champion
_POINTS_BY_LEVEL: dict[str, int] = {
    "grand_slam":  2000,
    "atp_finals":  1500,
    "wta_finals":  1500,
    "masters":     1000,
    "wta1000":      900,
    "atp500":       500,
    "wta500":       430,
    "atp250":       250,
    "wta250":       280,
    "challenger":    80,
    "itf":           10,
}

# ITF/Tennis Abstract court speed index (0–100, higher = faster)
_COURT_SPEED_BY_NAME: dict[str, float] = {
    "Australian Open": 55.0, "Roland Garros": 25.0, "Wimbledon": 78.0,
    "US Open": 58.0, "Indian Wells": 50.0, "Miami": 52.0,
    "Monte Carlo": 22.0, "Madrid": 35.0, "Rome": 28.0,
    "Canadian Open": 48.0, "Toronto": 48.0, "Montreal": 48.0,
    "Cincinnati": 51.0, "Shanghai": 50.0, "Paris": 45.0,
    "Vienna": 45.0, "Basel": 43.0, "Tokyo": 52.0,
    "Doha": 48.0, "Dubai": 52.0, "Acapulco": 32.0,
    "Halle": 74.0, "Queen's Club": 72.0, "'s-Hertogenbosch": 70.0,
}
_SPEED_BY_SURFACE: dict[str, float] = {
    "clay": 28.0, "grass": 74.0, "hard": 52.0, "carpet": 55.0
}

# Official ball supplier per tournament
_BALLS_BY_NAME: dict[str, str] = {
    "Australian Open": "Dunlop", "Roland Garros": "Babolat",
    "Wimbledon": "Slazenger", "US Open": "Wilson",
    "Indian Wells": "Wilson", "Miami": "Penn",
    "Monte Carlo": "Babolat", "Madrid": "Babolat", "Rome": "Babolat",
    "Canadian Open": "Wilson", "Toronto": "Wilson", "Montreal": "Wilson",
    "Cincinnati": "Penn", "Shanghai": "Wilson", "Paris": "Wilson",
    "Vienna": "Head", "Basel": "Head", "Tokyo": "Wilson",
    "Doha": "Wilson", "Dubai": "Wilson", "Halle": "Dunlop",
    "Queen's Club": "Dunlop", "Acapulco": "Babolat",
}
_BALLS_BY_SURFACE: dict[str, str] = {
    "clay": "Babolat", "grass": "Slazenger", "hard": "Wilson", "carpet": "Penn"
}

_DRAW_BY_LEVEL: dict[str, int] = {
    "grand_slam": 128, "atp_finals": 8, "wta_finals": 8,
    "masters": 64, "wta1000": 64,
    "atp500": 48, "wta500": 56,
    "atp250": 32, "wta250": 32,
    "challenger": 32, "itf": 16,
}


def _enrich_match_info(info: TennisMatchInfoOut, league_name: str) -> TennisMatchInfoOut:
    """Replace mock tournament metadata with real lookup-table values."""
    if info is None:
        return None
    level = info.tournament_level or "atp250"
    info.tournament_prize_pool_usd = _PRIZE_BY_LEVEL.get(level)
    info.points_on_offer = _POINTS_BY_LEVEL.get(level)
    info.draw_size = _DRAW_BY_LEVEL.get(level, 32)

    # Balls: match tournament name against lookup, fallback to surface
    balls = None
    for t_name, brand in _BALLS_BY_NAME.items():
        if t_name.lower() in league_name.lower():
            balls = brand
            break
    info.balls_brand = balls or _BALLS_BY_SURFACE.get(info.surface or "hard", "Wilson")

    # Court speed: match tournament name, fallback to surface
    speed = None
    for t_name, spd in _COURT_SPEED_BY_NAME.items():
        if t_name.lower() in league_name.lower():
            speed = spd
            break
    info.court_speed_index = speed or _SPEED_BY_SURFACE.get(info.surface or "hard", 52.0)

    return info


def _real_player_profile(
    db: Session, player_id: str, player_name: str
) -> TennisPlayerProfileOut:
    """Fetch real player profile from TennisPlayerProfile table."""
    import re
    import unicodedata
    from db.models.mvp import CoreTeam

    def _norm(s: str) -> str:
        nfkd = unicodedata.normalize("NFKD", s)
        return re.sub(r"[^a-z]", "", nfkd.encode("ascii", "ignore").decode("ascii").lower())

    prof = db.query(TennisPlayerProfile).filter_by(player_id=player_id).first()
    if prof is None:
        # Try full-name lookup: "Daniil Medvedev" → medvedev_daniil
        parts = player_name.strip().split()
        if len(parts) >= 2:
            first, last = parts[0], parts[-1]
            norm = f"{_norm(last)}_{_norm(first)}"
            prof = db.query(TennisPlayerProfile).filter_by(name_normalized=norm).first()
    if prof is None:
        # Look for other CoreTeam entries with the same player name (duplicate team records)
        same_name_teams = db.query(CoreTeam).filter(
            CoreTeam.name.ilike(player_name)
        ).all()
        for other_team in same_name_teams:
            if other_team.id == player_id:
                continue
            p = db.query(TennisPlayerProfile).filter_by(player_id=other_team.id).first()
            if p is not None:
                prof = p
                break
    if prof is None:
        # Fallback: last-name-only match for abbreviated names ("D. Medvedev" → "Medvedev")
        parts = player_name.strip().split()
        last = parts[-1] if parts else player_name
        candidates = db.query(TennisPlayerProfile).filter(
            TennisPlayerProfile.name_last.ilike(last)
        ).all()
        # Prefer profiles with a ranking (active player data)
        ranked = [p for p in candidates if p.ranking is not None]
        if len(ranked) == 1:
            prof = ranked[0]
        elif len(candidates) == 1:
            prof = candidates[0]

    # Also pull logo from CoreTeam if not on profile
    team = db.query(CoreTeam).filter_by(id=player_id).first()
    team_logo = team.logo_url if team else None

    if prof is None:
        return TennisPlayerProfileOut(
            player_id=player_id,
            player_name=player_name,
            logo_url=team_logo,
        )

    age = None
    if prof.dob:
        from datetime import date as _date
        today = _date.today()
        age = today.year - prof.dob.year - (
            (today.month, today.day) < (prof.dob.month, prof.dob.day)
        )

    logo = prof.logo_url or team_logo

    return TennisPlayerProfileOut(
        player_id=player_id,
        player_name=player_name,
        nationality=prof.nationality,
        age=age,
        ranking=prof.ranking,
        ranking_points=prof.ranking_points,
        height_cm=prof.height_cm,
        plays=prof.hand,
        turned_pro=prof.turned_pro,
        career_titles=prof.career_titles,
        career_grand_slams=prof.career_grand_slams,
        career_win_pct=prof.career_win_pct,
        season_wins=prof.season_wins,
        season_losses=prof.season_losses,
        logo_url=logo,
    )


def _compute_extended_form(
    form: TennisPlayerFormOut, db: Session, player_id: str, surface: str | None
) -> TennisPlayerFormOut:
    """Compute surface-specific stats, tiebreaks, titles, duration from DB history."""
    if form is None:
        return None

    from datetime import date as _date, timedelta

    year_start = datetime(_date.today().year, 1, 1, tzinfo=timezone.utc)

    # Surface-specific win% — read from pre-computed TennisPlayerForm rows
    for surf in ("hard", "clay", "grass"):
        surf_row = (
            db.query(TennisPlayerForm)
            .filter_by(player_id=player_id, surface=surf, window_days=365)
            .order_by(TennisPlayerForm.as_of_date.desc())
            .first()
        )
        if surf_row and surf_row.win_pct is not None:
            setattr(form, f"win_pct_{surf}", surf_row.win_pct)

    # Historical TennisMatch rows for tiebreaks, duration, three-setters
    hist_tm = (
        db.query(TennisMatch)
        .join(CoreMatch, CoreMatch.id == TennisMatch.match_id)
        .filter(
            CoreMatch.sport == "tennis",
            CoreMatch.status == "finished",
            (CoreMatch.home_team_id == player_id) | (CoreMatch.away_team_id == player_id),
            TennisMatch.sets_json.isnot(None),
        )
        .limit(100)
        .all()
    )

    tb_played = tb_won = 0
    durations: list[float] = []
    three_set_count = 0

    for tm in hist_tm:
        m = db.get(CoreMatch, tm.match_id)
        if not m:
            continue
        is_player_a = m.home_team_id == player_id

        if tm.match_duration_min:
            durations.append(float(tm.match_duration_min))

        try:
            sets = json.loads(tm.sets_json) if isinstance(tm.sets_json, str) else (tm.sets_json or [])
            if len(sets) >= 3:
                three_set_count += 1
            for s in sets:
                a_g = s.get("a", 0)
                b_g = s.get("b", 0)
                if a_g == 7 or b_g == 7:
                    tb_played += 1
                    if (is_player_a and a_g == 7) or (not is_player_a and b_g == 7):
                        tb_won += 1
        except Exception as exc:
            log.debug("tennis_tiebreak_parse player=%s match=%s err=%s", player_id, getattr(tm, "id", "?"), exc)

    if tb_played > 0:
        form.tiebreaks_played = tb_played
        form.tiebreaks_won = tb_won
        form.tiebreak_win_pct = round(tb_won / tb_played, 3)

    if durations:
        form.avg_match_duration_min = round(sum(durations) / len(durations), 1)

    if hist_tm:
        form.three_setters_pct = round(three_set_count / len(hist_tm), 3)

    # Titles/finals YTD
    ytd_matches = (
        db.query(CoreMatch)
        .join(TennisMatch, TennisMatch.match_id == CoreMatch.id)
        .filter(
            CoreMatch.sport == "tennis",
            CoreMatch.status == "finished",
            CoreMatch.kickoff_utc >= year_start,
            TennisMatch.round_name.in_(("F", "Final")),
            (CoreMatch.home_team_id == player_id) | (CoreMatch.away_team_id == player_id),
        )
        .all()
    )
    titles = sum(
        1 for m in ytd_matches
        if (m.home_team_id == player_id and m.outcome in ("H", "home_win")) or
           (m.away_team_id == player_id and m.outcome in ("A", "away_win"))
    )
    form.titles_ytd = titles
    form.finals_ytd = len(ytd_matches)

    # Ranking trend: ELO change over last 28 days (positive = rising)
    recent_elos = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == player_id, RatingEloTeam.context == "global")
        .order_by(RatingEloTeam.rated_at.desc())
        .limit(10)
        .all()
    )
    if len(recent_elos) >= 2:
        form.ranking_trend = round(recent_elos[0].rating_after - recent_elos[-1].rating_after)

    return form


def _real_tiebreaks(sets_detail: list) -> TennisTiebreakOut:
    """Extract tiebreak data from sets_detail using real tb_a/tb_b values."""
    tbs = []
    a_won = b_won = 0
    for s in (sets_detail or []):
        a_g = getattr(s, "a", None) if not hasattr(s, "get") else s.get("a", 0)
        b_g = getattr(s, "b", None) if not hasattr(s, "get") else s.get("b", 0)
        set_num = getattr(s, "set_num", 1) if not hasattr(s, "get") else s.get("set_num", 1)
        tb_a = getattr(s, "tb_a", None) if not hasattr(s, "get") else s.get("tb_a")
        tb_b = getattr(s, "tb_b", None) if not hasattr(s, "get") else s.get("tb_b")

        if (a_g or 0) == 7 or (b_g or 0) == 7:
            winner = "a" if (a_g or 0) > (b_g or 0) else "b"
            if winner == "a":
                a_won += 1
            else:
                b_won += 1
            tbs.append({
                "set_num": set_num,
                "score_a": tb_a,   # None when not yet stored from api-tennis
                "score_b": tb_b,
                "winner": winner,
            })

    return TennisTiebreakOut(
        player_a_tiebreaks_won=a_won,
        player_b_tiebreaks_won=b_won,
        tiebreaks=tbs,
    )


# ─── DB helpers ───────────────────────────────────────────────────────────────

def _name(db: Session, team_id: str) -> str:
    t = db.get(CoreTeam, team_id)
    return t.name if t else team_id


def _league_name(db: Session, league_id: str) -> str:
    lg = db.get(CoreLeague, league_id)
    return lg.name if lg else "Unknown Tournament"


def _elo_snapshot(db: Session, player_id: str, name: str) -> EloHistoryPoint | None:
    """Latest global ELO for a player (used in list view)."""
    rows = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == player_id, RatingEloTeam.context == "global")
        .order_by(RatingEloTeam.rated_at.desc())
        .limit(2)
        .all()
    )
    if not rows:
        return None
    latest = rows[0]
    change = round(latest.rating_after - latest.rating_before, 1)
    return EloHistoryPoint(
        date=latest.rated_at.isoformat(),
        rating=round(latest.rating_after, 1),
        match_id=latest.match_id if hasattr(latest, "match_id") else None,
    )


def _surface_elo(db: Session, player_id: str, name: str, surface: str | None) -> TennisSurfaceEloOut | None:
    """Return overall ELO + optional surface-specific rating."""
    # Global rating
    global_rows = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == player_id, RatingEloTeam.context == "global")
        .order_by(RatingEloTeam.rated_at.desc())
        .limit(2)
        .all()
    )
    if not global_rows:
        return None
    latest = global_rows[0]
    overall = round(latest.rating_after, 1)
    rating_change = round(latest.rating_after - global_rows[1].rating_after, 1) if len(global_rows) == 2 else None

    # Surface-specific rating (stored with context=surface name, e.g. "hard")
    surface_rating = None
    surface_delta = None
    if surface:
        surf_rows = (
            db.query(RatingEloTeam)
            .filter(
                RatingEloTeam.team_id == player_id,
                RatingEloTeam.context == surface.lower(),
            )
            .order_by(RatingEloTeam.rated_at.desc())
            .limit(1)
            .all()
        )
        if surf_rows:
            surface_rating = round(surf_rows[0].rating_after, 1)
            surface_delta = round(surface_rating - overall, 1)

    return TennisSurfaceEloOut(
        player_id=player_id,
        player_name=name,
        overall_rating=overall,
        surface_rating=surface_rating,
        surface_delta=surface_delta,
        rating_change=rating_change,
    )


def _tennis_info(db: Session, match_id: str) -> TennisMatchInfoOut | None:
    """Fetch TennisMatch record for surface, round, fatigue, sets."""
    try:
        row = db.get(TennisMatch, match_id)
        if row is None:
            return None
        sets_detail: list[SetDetailOut] = []
        if row.sets_json:
            try:
                raw = json.loads(row.sets_json) if isinstance(row.sets_json, str) else row.sets_json
                for i, s in enumerate(raw or [], start=1):
                    sets_detail.append(SetDetailOut(
                        set_num=i,
                        a=s.get("a", 0),
                        b=s.get("b", 0),
                        tb_a=s.get("tb_a"),
                        tb_b=s.get("tb_b"),
                    ))
            except Exception as exc:
                log.debug("tennis_sets_parse match=%s err=%s", row.match_id if hasattr(row, "match_id") else "?", exc)
        return TennisMatchInfoOut(
            surface=row.surface,
            is_indoor=bool(row.is_indoor),
            tournament_level=row.tournament_level,
            round_name=row.round_name,
            best_of=row.best_of or 3,
            player_a_days_rest=row.player_a_days_rest,
            player_b_days_rest=row.player_b_days_rest,
            player_a_matches_last_14d=row.player_a_matches_last_14d,
            player_b_matches_last_14d=row.player_b_matches_last_14d,
            match_duration_min=row.match_duration_min,
            retired=bool(row.retired),
            sets_detail=sets_detail,
        )
    except Exception as exc:
        log.warning("tennis_match_info_failed err=%s", exc)
        return None


def _match_stats(db: Session, match_id: str, player_id: str, player_name: str) -> TennisServeStatsOut | None:
    """Fetch TennisMatchStats for one player."""
    try:
        row = (
            db.query(TennisMatchStats)
            .filter(TennisMatchStats.match_id == match_id, TennisMatchStats.player_id == player_id)
            .first()
        )
        if row is None:
            return None
        return TennisServeStatsOut(
            player_id=player_id,
            player_name=player_name,
            aces=row.aces,
            double_faults=row.double_faults,
            first_serve_in_pct=row.first_serve_in_pct,
            first_serve_won_pct=row.first_serve_won_pct,
            second_serve_won_pct=row.second_serve_won_pct,
            service_games_played=row.service_games_played,
            service_games_held=row.service_games_held,
            service_hold_pct=row.service_hold_pct,
            return_games_played=row.return_games_played,
            return_games_won=row.return_games_won,
            break_points_faced=row.break_points_faced,
            break_points_saved=row.break_points_saved,
            break_points_created=row.break_points_created,
            break_points_converted=row.break_points_converted,
            bp_conversion_pct=row.bp_conversion_pct,
            first_serve_return_won_pct=row.first_serve_return_won_pct,
            second_serve_return_won_pct=row.second_serve_return_won_pct,
            total_points_won=row.total_points_won,
            first_serve_avg_mph=row.first_serve_avg_mph,
            first_serve_max_mph=row.first_serve_max_mph,
            second_serve_avg_mph=row.second_serve_avg_mph,
            winners=row.winners,
            unforced_errors=row.unforced_errors,
            forced_errors=row.forced_errors,
            net_approaches=row.net_approaches,
            net_points_won=row.net_points_won,
            service_points_played=row.service_points_played,
            service_points_won=row.service_points_won,
            return_points_played=row.return_points_played,
            return_points_won=row.return_points_won,
        )
    except Exception as exc:
        log.warning("tennis_match_stats_failed match=%s player=%s err=%s", match_id, player_id, exc)
        return None


def _player_form(db: Session, player_id: str, player_name: str, surface: str | None) -> TennisPlayerFormOut | None:
    """Fetch most recent TennisPlayerForm row for a player."""
    try:
        q = (
            db.query(TennisPlayerForm)
            .filter(TennisPlayerForm.player_id == player_id)
            .order_by(TennisPlayerForm.as_of_date.desc())
        )
        # Prefer surface-specific form if available, else fall back to "all"
        surf_key = surface.lower() if surface else "all"
        surf_row = q.filter(TennisPlayerForm.surface == surf_key).first()
        row = surf_row or q.filter(TennisPlayerForm.surface == "all").first() or q.first()
        if row is None:
            return None
        return TennisPlayerFormOut(
            player_name=player_name,
            surface=row.surface,
            window_days=row.window_days,
            matches_played=row.matches_played,
            wins=row.wins,
            losses=row.losses,
            win_pct=row.win_pct,
            avg_first_serve_in_pct=row.avg_first_serve_in_pct,
            avg_first_serve_won_pct=row.avg_first_serve_won_pct,
            avg_service_hold_pct=row.avg_service_hold_pct,
            avg_bp_conversion_pct=row.avg_bp_conversion_pct,
            avg_return_won_pct=row.avg_return_won_pct,
            avg_aces_per_match=row.avg_aces_per_match,
            avg_df_per_match=row.avg_df_per_match,
            matches_since_last_title=row.matches_since_last_title,
        )
    except Exception as exc:
        log.warning("tennis_player_form_failed player=%s err=%s", player_id, exc)
        return None


def _h2h_from_hl(hl_matches: list[dict], home_name: str, away_name: str) -> H2HRecordOut | None:
    """Parse HL headtohead data into tennis H2HRecordOut. Sets score is used as game proxy."""
    from api.sports.base.queries import h2h_from_hl as _parse_h2h
    raw = _parse_h2h(hl_matches, home_name, away_name)
    if not raw:
        return None
    recent = [
        {
            "date": m.get("date"),
            "player_a_sets": m.get("home_score"),
            "player_b_sets": m.get("away_score"),
            "winner": "a" if m.get("outcome") == "home_win" else "b",
            "player_a_name": home_name,
            "player_b_name": away_name,
            "surface": None,
            "round": None,
        }
        for m in raw.get("recent_matches", [])
    ]
    return H2HRecordOut(
        total_matches=raw["total_matches"],
        player_a_wins=raw["home_wins"],
        player_b_wins=raw["away_wins"],
        recent_matches=recent,
    )


def _h2h(db: Session, home_id: str, away_id: str, home_name: str = "", away_name: str = "") -> H2HRecordOut:
    from sqlalchemy import or_, and_
    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "tennis",
            CoreMatch.status == "finished",
            or_(
                and_(CoreMatch.home_team_id == home_id, CoreMatch.away_team_id == away_id),
                and_(CoreMatch.home_team_id == away_id, CoreMatch.away_team_id == home_id),
            ),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(10)
        .all()
    )

    # Fallback: search by name across all player ID schemes (handles fragmentation)
    if not matches and home_name and away_name:
        home_lower = f"%{home_name.split()[-1].lower()}%"  # match on last name
        away_lower = f"%{away_name.split()[-1].lower()}%"
        home_ids = [
            t.id for t in db.query(CoreTeam.id)
            .filter(CoreTeam.name.ilike(home_lower))
            .all()
        ]
        away_ids = [
            t.id for t in db.query(CoreTeam.id)
            .filter(CoreTeam.name.ilike(away_lower))
            .all()
        ]
        if home_ids and away_ids:
            matches = (
                db.query(CoreMatch)
                .filter(
                    CoreMatch.sport == "tennis",
                    CoreMatch.status == "finished",
                    or_(
                        and_(CoreMatch.home_team_id.in_(home_ids), CoreMatch.away_team_id.in_(away_ids)),
                        and_(CoreMatch.home_team_id.in_(away_ids), CoreMatch.away_team_id.in_(home_ids)),
                    ),
                )
                .order_by(CoreMatch.kickoff_utc.desc())
                .limit(10)
                .all()
            )
    a_wins = b_wins = 0
    recent = []
    # Resolve home_name player's team IDs across all schemes for outcome mapping
    home_name_lower = home_name.split()[-1].lower() if home_name else ""
    for m in matches:
        home_team = db.get(CoreTeam, m.home_team_id)
        home_team_name = (home_team.name if home_team else "").lower()
        a_is_home = home_name_lower and home_name_lower in home_team_name
        if a_is_home:
            winner = "a" if m.outcome in ("H", "home_win") else "b"
            hs, bs = m.home_score, m.away_score
        else:
            winner = "a" if m.outcome in ("A", "away_win") else "b"
            hs, bs = m.away_score, m.home_score
        if winner == "a":
            a_wins += 1
        else:
            b_wins += 1
        if len(recent) < 5:
            # Try to get TennisMatch info for this match (surface/round)
            surface_name = None
            round_name = None
            try:
                tm = db.get(TennisMatch, m.id)
                if tm:
                    surface_name = tm.surface
                    round_name = tm.round_name
            except Exception as exc:
                log.debug("tennis_h2h_match_info match=%s err=%s", m.id, exc)
            recent.append({
                "date": m.kickoff_utc.isoformat() if m.kickoff_utc else None,
                "player_a_sets": hs,
                "player_b_sets": bs,
                "winner": winner,
                "player_a_name": home_name,
                "player_b_name": away_name,
                "surface": surface_name,
                "round": round_name,
            })
    return H2HRecordOut(
        total_matches=len(matches),
        player_a_wins=a_wins,
        player_b_wins=b_wins,
        recent_matches=recent,
    )


class TennisMatchService(BaseMatchListService):

    def get_match_list(self, db, *, status=None, league=None, date_from=None, date_to=None, limit=50, offset=0):
        q = db.query(CoreMatch).filter(CoreMatch.sport == "tennis")
        if status:
            q = q.filter(CoreMatch.status == status)
        if league:
            q = q.join(CoreLeague, CoreLeague.id == CoreMatch.league_id).filter(
                CoreLeague.name.ilike(f"%{league}%")
            )
        if date_from:
            q = q.filter(CoreMatch.kickoff_utc >= date_from)
        if date_to:
            q = q.filter(CoreMatch.kickoff_utc <= date_to)

        total = q.count()
        status_order = case({"live": 0, "scheduled": 1, "finished": 2}, value=CoreMatch.status, else_=3)
        rows = q.order_by(status_order, CoreMatch.kickoff_utc.asc()).offset(offset).limit(limit).all()

        # Batch-load teams and leagues for logos
        all_team_ids = {m.home_team_id for m in rows} | {m.away_team_id for m in rows}
        all_league_ids = {m.league_id for m in rows if m.league_id}
        all_match_ids = [m.id for m in rows]
        team_map = {t.id: t for t in db.query(CoreTeam).filter(CoreTeam.id.in_(all_team_ids)).all()} if all_team_ids else {}
        league_map = {lg.id: lg for lg in db.query(CoreLeague).filter(CoreLeague.id.in_(all_league_ids)).all()} if all_league_ids else {}
        pred_map = {p.match_id: p for p in db.query(PredMatch).filter(PredMatch.match_id.in_(all_match_ids)).all()} if all_match_ids else {}

        items = []
        for m in rows:
            ht = team_map.get(m.home_team_id)
            at = team_map.get(m.away_team_id)
            lg = league_map.get(m.league_id)
            home_name = ht.name if ht else m.home_team_id
            away_name = at.name if at else m.away_team_id
            snap_h = _elo_snapshot(db, m.home_team_id, home_name)
            snap_a = _elo_snapshot(db, m.away_team_id, away_name)
            r_home = snap_h.rating if snap_h else 1500.0
            r_away = snap_a.rating if snap_a else 1500.0
            p_home = round(1.0 / (1.0 + 10 ** (-(r_home - r_away) / 400.0)), 4)
            p_away = round(1.0 - p_home, 4)
            pred = pred_map.get(m.id)
            items.append(TennisMatchListItem(
                id=m.id,
                league=lg.name if lg else "Unknown Tournament",
                season=m.season,
                kickoff_utc=m.kickoff_utc,
                status=m.status,
                home_id=m.home_team_id,
                home_name=home_name,
                away_id=m.away_team_id,
                away_name=away_name,
                home_score=m.home_score,
                away_score=m.away_score,
                outcome=m.outcome,
                live_clock=m.live_clock if m.status == "live" else None,
                current_period=m.current_period if m.status == "live" else None,
                elo_home=snap_h.rating if snap_h else None,
                elo_away=snap_a.rating if snap_a else None,
                p_home=p_home,
                p_away=p_away,
                confidence=pred.confidence if pred else None,
                odds_home=m.odds_home,
                odds_away=m.odds_away,
                home_logo=ht.logo_url if ht else None,
                away_logo=at.logo_url if at else None,
                league_logo=lg.logo_url if lg else None,
            ))
        return TennisMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> TennisMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "tennis":
            raise HTTPException(status_code=404, detail=f"Tennis match {match_id} not found")
        try:
            return self._get_match_detail_inner(match_id, match, db)
        except HTTPException:
            raise
        except Exception as exc:
            log.error("tennis_match_detail_failed match=%s err=%s", match_id, exc, exc_info=True)
            raise HTTPException(status_code=500, detail=f"tennis_detail_error: {type(exc).__name__}: {exc}")

    def _get_match_detail_inner(self, match_id: str, match, db: Session) -> TennisMatchDetail:

        home_team = db.get(CoreTeam, match.home_team_id)
        away_team = db.get(CoreTeam, match.away_team_id)
        home_name = home_team.name if home_team else match.home_team_id
        away_name = away_team.name if away_team else match.away_team_id
        home_logo = home_team.logo_url if home_team else None
        away_logo = away_team.logo_url if away_team else None
        league_name = _league_name(db, match.league_id)

        # Tennis-specific info (surface, round, fatigue, sets)
        tennis_info = _tennis_info(db, match_id)
        surface = tennis_info.surface if tennis_info else None

        # Surface-aware ELO
        elo_home = _surface_elo(db, match.home_team_id, home_name, surface)
        elo_away = _surface_elo(db, match.away_team_id, away_name, surface)

        # Model prediction (if exists)
        live_registry = db.query(ModelRegistry).filter_by(is_live=True, sport="tennis").first()
        if live_registry is None:
            # Fall back to any live model
            live_registry = db.query(ModelRegistry).filter_by(is_live=True).first()
        pred: PredMatch | None = None
        if live_registry:
            pred = (
                db.query(PredMatch)
                .filter(PredMatch.match_id == match_id, PredMatch.model_version == live_registry.model_name)
                .first()
            )

        probabilities = None
        fair_odds = None
        confidence = None
        key_drivers = []
        model_meta = None
        p_home = None
        p_away = None

        if pred:
            p_home = round(pred.p_home, 4)
            p_away = round(pred.p_away, 4)
            probabilities = ProbabilitiesOut(home_win=p_home, away_win=p_away)
            fair_odds = FairOddsOut(
                home_win=round(1 / p_home, 2) if p_home > 0 else None,
                away_win=round(1 / p_away, 2) if p_away > 0 else None,
            )
            confidence = pred.confidence
            key_drivers = [
                KeyDriverOut(feature=d.get("feature", ""), value=d.get("value"), importance=d.get("importance", 0.0))
                for d in (pred.key_drivers or [])
            ]
        elif match.odds_home and match.odds_away:
            # Derive no-vig implied probs from market odds
            raw_h = 1.0 / match.odds_home
            raw_a = 1.0 / match.odds_away
            total = raw_h + raw_a
            p_home = round(raw_h / total, 4)
            p_away = round(raw_a / total, 4)
            probabilities = ProbabilitiesOut(home_win=p_home, away_win=p_away)
            fair_odds = FairOddsOut(
                home_win=round(1 / p_home, 2) if p_home > 0 else None,
                away_win=round(1 / p_away, 2) if p_away > 0 else None,
            )
        elif elo_home and elo_away:
            # ELO-derived probabilities (no home advantage in tennis)
            r_diff = elo_home.overall_rating - elo_away.overall_rating
            # Use surface rating if available
            if elo_home.surface_rating and elo_away.surface_rating:
                r_diff = elo_home.surface_rating - elo_away.surface_rating
            p_home = round(1.0 / (1.0 + math.pow(10, -r_diff / 400.0)), 4)
            p_away = round(1.0 - p_home, 4)
            probabilities = ProbabilitiesOut(home_win=p_home, away_win=p_away)
            fair_odds = FairOddsOut(
                home_win=round(1 / p_home, 2) if p_home > 0 else None,
                away_win=round(1 / p_away, 2) if p_away > 0 else None,
            )

        if live_registry:
            metrics = live_registry.metrics or {}
            model_meta = ModelMetaOut(
                version=live_registry.model_name,
                algorithm=live_registry.algorithm,
                trained_at=live_registry.trained_at,
                accuracy=metrics.get("accuracy"),
                brier_score=metrics.get("brier_score"),
                n_train_samples=live_registry.n_train_samples,
            )

        # Serve/return stats — real from DB, extended fields populated by fetch_api_tennis
        stats_home = _match_stats(db, match_id, match.home_team_id, home_name)
        stats_away = _match_stats(db, match_id, match.away_team_id, away_name)
        # Derive computed fields from raw DB values
        if stats_home:
            if stats_home.winners is not None and stats_home.unforced_errors:
                stats_home.winner_ue_ratio = round(
                    stats_home.winners / stats_home.unforced_errors, 2
                ) if stats_home.unforced_errors > 0 else None
            if stats_home.net_approaches and stats_home.net_points_won is not None:
                stats_home.net_win_pct = round(
                    stats_home.net_points_won / stats_home.net_approaches, 3
                ) if stats_home.net_approaches > 0 else None
            if stats_home.service_points_played and stats_home.return_points_played:
                stats_home.total_points_played = (
                    stats_home.service_points_played + stats_home.return_points_played
                )
        if stats_away:
            if stats_away.winners is not None and stats_away.unforced_errors:
                stats_away.winner_ue_ratio = round(
                    stats_away.winners / stats_away.unforced_errors, 2
                ) if stats_away.unforced_errors > 0 else None
            if stats_away.net_approaches and stats_away.net_points_won is not None:
                stats_away.net_win_pct = round(
                    stats_away.net_points_won / stats_away.net_approaches, 3
                ) if stats_away.net_approaches > 0 else None
            if stats_away.service_points_played and stats_away.return_points_played:
                stats_away.total_points_played = (
                    stats_away.service_points_played + stats_away.return_points_played
                )

        # Player form — real from DB; extended fields computed from history
        form_home = _player_form(db, match.home_team_id, home_name, surface)
        form_away = _player_form(db, match.away_team_id, away_name, surface)
        form_home = _compute_extended_form(form_home, db, match.home_team_id, surface)
        form_away = _compute_extended_form(form_away, db, match.away_team_id, surface)

        # Match info with real tournament metadata
        tennis_info = _enrich_match_info(tennis_info, league_name)

        # Real player profiles from TennisPlayerProfile table
        profile_home = _real_player_profile(db, match.home_team_id, home_name)
        profile_away = _real_player_profile(db, match.away_team_id, away_name)

        # Tiebreaks from real sets_detail (tb_a/tb_b populated by fetch_api_tennis)
        tiebreaks = None
        if tennis_info and tennis_info.sets_detail:
            tiebreaks = _real_tiebreaks(tennis_info.sets_detail)

        # Betting market derived from probabilities
        betting = None
        if p_home is not None and p_away is not None:
            betting = {
                "home_ml": round(1 / p_home, 2) if p_home > 0 else None,
                "away_ml": round(1 / p_away, 2) if p_away > 0 else None,
            }

        # Derive current_state for live tennis matches from TennisMatch sets_json
        tennis_current_state = None
        tennis_current_period = match.current_period if match.status == "live" else None
        if match.status == "live":
            tennis_current_state = match.current_state_json
            if tennis_current_state is None:
                try:
                    tm_row = db.get(TennisMatch, match_id)
                    if tm_row and tm_row.sets_json:
                        raw_sets = json.loads(tm_row.sets_json) if isinstance(tm_row.sets_json, str) else tm_row.sets_json
                        if raw_sets:
                            tennis_current_state = {
                                "current_set": len(raw_sets),
                                "sets": raw_sets,
                            }
                            if tennis_current_period is None:
                                tennis_current_period = len(raw_sets)
                except Exception as exc:
                    log.warning("tennis_live_state_failed match=%s err=%s", match.id, exc)

        return TennisMatchDetail(
            id=match.id,
            sport="tennis",
            league=league_name,
            season=match.season,
            kickoff_utc=match.kickoff_utc,
            status=match.status,
            home=ParticipantOut(id=match.home_team_id, name=home_name, logo_url=home_logo),
            away=ParticipantOut(id=match.away_team_id, name=away_name, logo_url=away_logo),
            home_score=match.home_score,
            away_score=match.away_score,
            outcome=match.outcome,
            live_clock=match.live_clock if match.status == "live" else None,
            current_period=tennis_current_period,
            current_state=tennis_current_state,
            probabilities=probabilities,
            fair_odds=fair_odds,
            confidence=confidence,
            key_drivers=key_drivers,
            model=model_meta,
            elo_home=elo_home,
            elo_away=elo_away,
            tennis_info=tennis_info,
            stats_home=stats_home,
            stats_away=stats_away,
            form_home=form_home,
            form_away=form_away,
            h2h=(
                _h2h_from_hl(
                    (match.extras_json or {}).get("headtohead") or [], home_name, away_name
                ) or _h2h(db, match.home_team_id, match.away_team_id, home_name, away_name)
            ),
            profile_home=profile_home,
            profile_away=profile_away,
            tiebreaks=tiebreaks,
            betting=betting,
        )

    def preview_match(self, home_name: str, away_name: str, db: Session) -> TennisMatchDetail:
        """ELO-based preview for a tennis match not yet in the DB."""
        from db.models.mvp import CoreTeam

        def _find_player(name: str) -> Optional[CoreTeam]:
            last = name.split()[-1] if name else name
            teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{last}%")).all()
            if not teams:
                teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{name}%")).all()
            if not teams:
                return None
            for t in teams:
                if t.provider_id and "tennis" in t.provider_id:
                    return t
            return teams[0]

        home_player = _find_player(home_name)
        away_player = _find_player(away_name)

        home_id = home_player.id if home_player else f"preview-home-{home_name.lower().replace(' ', '-')}"
        away_id = away_player.id if away_player else f"preview-away-{away_name.lower().replace(' ', '-')}"
        hname = home_player.name if home_player else home_name
        aname = away_player.name if away_player else away_name

        elo_h = _surface_elo(db, home_id, hname, None) if home_player else None
        elo_a = _surface_elo(db, away_id, aname, None) if away_player else None

        probs = None
        fair_odds = None
        key_drivers = None
        if elo_h and elo_a:
            r_diff = elo_h.overall_rating - elo_a.overall_rating
            p_home = round(1.0 / (1.0 + math.pow(10, -r_diff / 400.0)), 4)
            p_away = round(1.0 - p_home, 4)
            probs = ProbabilitiesOut(home_win=p_home, away_win=p_away)
            fair_odds = FairOddsOut(
                home_win=round(1 / p_home, 2) if p_home > 0 else None,
                away_win=round(1 / p_away, 2) if p_away > 0 else None,
            )
            key_drivers = [KeyDriverOut(feature="ELO Differential", importance=1.0, value=round(elo_h.overall_rating - elo_a.overall_rating, 1))]

        h2h = _h2h(db, home_id, away_id, hname, aname) if home_player and away_player else H2HRecordOut(total_matches=0, home_wins=0, away_wins=0, recent_matches=[])
        form_h = _player_form(db, home_id, hname, None) if home_player else None
        form_a = _player_form(db, away_id, aname, None) if away_player else None

        return TennisMatchDetail(
            id=f"preview-{home_id}-{away_id}",
            sport="tennis",
            league="Unknown",
            kickoff_utc=datetime.now(timezone.utc),
            status="scheduled",
            home=ParticipantOut(id=home_id, name=hname, logo_url=home_player.logo_url if home_player else None),
            away=ParticipantOut(id=away_id, name=aname, logo_url=away_player.logo_url if away_player else None),
            probabilities=probs,
            fair_odds=fair_odds,
            key_drivers=key_drivers or [],
            elo_home=elo_h,
            elo_away=elo_a,
            h2h=h2h,
            form_home=form_h,
            form_away=form_a,
        )
