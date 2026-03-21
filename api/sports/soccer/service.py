"""
Soccer match service layer.

Provides:
    get_match_list()   — paginated list with ELO + basic prediction data
    get_match_detail() — full match detail assembled from multiple tables
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

log = logging.getLogger(__name__)
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session

import math

from api.sports.base.interfaces import BaseMatchListService
from api.sports.soccer.schemas import (
    EloSnapshotOut,
    EventContextOut,
    FairOddsOut,
    FormStatsOut,
    H2HRecordOut,
    HighlightClipOut,
    KeyDriverOut,
    MatchEventOut,
    ModelMetaOut,
    ParticipantOut,
    ProbabilitiesOut,
    ScorelineOut,
    SimulationOut,
    SoccerAdvancedTeamStatsOut,
    SoccerInjuryOut,
    SoccerLeagueContextOut,
    SoccerLineupOut,
    SoccerMatchDetail,
    SoccerMatchListItem,
    SoccerMatchListResponse,
    SoccerPlayerOut,
    SoccerRefereeOut,
    SoccerTeamStatsOut,
    StandingRowOut,
)
from db.models.mvp import (
    CoreLeague,
    CoreMatch,
    CoreStanding,
    CoreTeam,
    CoreTeamMatchStats,
    FeatSoccerMatch,
    ModelRegistry,
    PredMatch,
    RatingEloTeam,
    TeamInjury,
)


def _team_name(db: Session, team_id: str) -> str:
    t = db.get(CoreTeam, team_id)
    return t.name if t else team_id


def _league_name(db: Session, league_id: str) -> str:
    lg = db.get(CoreLeague, league_id)
    return lg.name if lg else "Unknown League"


def _elo_snapshot(db: Session, team_id: str, team_name: str) -> Optional[EloSnapshotOut]:
    """Return the latest ELO snapshot for a team, or None if no history exists."""
    rows = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == team_id, RatingEloTeam.context == "global")
        .order_by(RatingEloTeam.rated_at.desc())
        .limit(10)
        .all()
    )
    if not rows:
        return None
    latest = rows[0]
    change = round(latest.rating_after - latest.rating_before, 1)
    return EloSnapshotOut(
        team_id=team_id,
        team_name=team_name,
        rating=round(latest.rating_after, 1),
        rating_change=change,
    )


def _form_from_hl(hl_matches: list[dict], team_name: str) -> FormStatsOut | None:
    """Build FormStatsOut from Highlightly lastfivegames data."""
    from api.sports.base.queries import form_from_hl
    raw = form_from_hl(hl_matches, team_name)
    if not raw:
        return None
    return FormStatsOut(
        team_name=team_name,
        form_pts=float(raw["form_pts"]),
        wins=raw["wins"],
        draws=raw["draws"],
        losses=raw["losses"],
        goals_scored_avg=raw.get("gf_avg"),
        goals_conceded_avg=raw.get("ga_avg"),
        form_last_5=raw.get("form_seq"),
    )


def _h2h_from_hl(hl_matches: list[dict], home_name: str, away_name: str) -> H2HRecordOut | None:
    """Build H2HRecordOut from Highlightly headtohead data."""
    from api.sports.base.queries import h2h_from_hl
    raw = h2h_from_hl(hl_matches, home_name, away_name)
    if not raw:
        return None
    return H2HRecordOut(**raw)


def _h2h(db: Session, home_id: str, away_id: str, home_name: str = "", away_name: str = "") -> H2HRecordOut:
    """
    Build head-to-head record between two teams from core_matches history.
    Considers both home/away orientations.
    """
    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.status == "finished",
            (
                ((CoreMatch.home_team_id == home_id) & (CoreMatch.away_team_id == away_id))
                | ((CoreMatch.home_team_id == away_id) & (CoreMatch.away_team_id == home_id))
            ),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(10)
        .all()
    )

    # Normalise outcome codes: DB stores "H"/"D"/"A", H2H uses "home_win"/"draw"/"away_win"
    _norm = {"H": "home_win", "D": "draw", "A": "away_win",
             "home_win": "home_win", "draw": "draw", "away_win": "away_win"}
    _flip = {"home_win": "away_win", "away_win": "home_win", "draw": "draw"}

    home_wins = draws = away_wins = 0
    recent = []
    for m in matches:
        # Normalise: "home" always = the team we queried as home_id
        if m.home_team_id == home_id:
            result = _norm.get(m.outcome or "")
            home_score, away_score = m.home_score, m.away_score
        else:
            # Swap perspective
            normed = _norm.get(m.outcome or "")
            result = _flip.get(normed) if normed else None
            home_score, away_score = m.away_score, m.home_score

        if result is None:
            continue  # unknown outcome — skip rather than miscount as draw

        if result == "home_win":
            home_wins += 1
        elif result == "away_win":
            away_wins += 1
        else:
            draws += 1

        if len(recent) < 5:
            recent.append({
                "date": m.kickoff_utc.isoformat() if m.kickoff_utc else None,
                "home_score": home_score,
                "away_score": away_score,
                "outcome": result,
                "home_name": home_name,
                "away_name": away_name,
            })

    return H2HRecordOut(
        total_matches=len(matches),
        home_wins=home_wins,
        draws=draws,
        away_wins=away_wins,
        recent_matches=recent,
    )


def _team_stats_out(
    db: Session, match_id: str, team_id: str, team_name: str, is_home: bool
) -> Optional[SoccerTeamStatsOut]:
    row = (
        db.query(CoreTeamMatchStats)
        .filter(CoreTeamMatchStats.match_id == match_id, CoreTeamMatchStats.team_id == team_id)
        .first()
    )
    if row is None:
        return None
    return SoccerTeamStatsOut(
        team_id=team_id,
        team_name=team_name,
        is_home=is_home,
        shots_total=row.shots,
        shots_on_target=row.shots_on_target,
        xg=row.xg,
        xga=row.xga,
        possession_pct=row.possession_pct,
        passes_completed=row.passes_completed,
        pass_accuracy_pct=row.pass_accuracy_pct,
        fouls=row.fouls,
        yellow_cards=row.yellow_cards,
        red_cards=row.red_cards,
        corners=row.corners,
        offsides=row.offsides,
        big_chances_created=row.big_chances_created,
        big_chances_missed=row.big_chances_missed,
        aerial_duels_won=row.aerial_duels_won,
        aerial_duels_lost=row.aerial_duels_lost,
        crosses=row.crosses,
    )


def _adv_stats_out(
    db: Session, match_id: str, team_id: str, team_name: str,
) -> Optional[SoccerAdvancedTeamStatsOut]:
    """Build advanced stats from CoreTeamMatchStats when populated (Understat + Highlightly data)."""
    row = (
        db.query(CoreTeamMatchStats)
        .filter(CoreTeamMatchStats.match_id == match_id, CoreTeamMatchStats.team_id == team_id)
        .first()
    )
    if row is None:
        return None
    # Only return if we have at least some advanced data
    has_data = any([
        row.ppda is not None,
        row.big_chances_created is not None,
        row.corners is not None,
        row.deep_completions is not None,
        row.aerial_duels_won is not None,
    ])
    if not has_data:
        return None

    # Corner conversion: goals from corners / corners won
    corner_conv = None
    if row.corners and row.corners > 0 and row.goals is not None:
        # rough proxy — not exact set piece goals, just overall conversion
        corner_conv = None  # leave for now, need set_piece_goals separately

    # Aerial duel win rate
    aerial_win_pct = None
    if row.aerial_duels_won is not None and row.aerial_duels_lost is not None:
        total_aerials = row.aerial_duels_won + row.aerial_duels_lost
        if total_aerials > 0:
            aerial_win_pct = round(row.aerial_duels_won / total_aerials * 100, 1)

    # xPts from xG (Poisson approximation)
    xpts = None
    if row.xg is not None and row.xga is not None:
        import math as _math
        def _poisson_win_prob(xg_for: float, xg_against: float) -> float:
            max_g = 8
            win = 0.0
            for g_for in range(max_g + 1):
                for g_against in range(max_g + 1):
                    p = (
                        (_math.exp(-xg_for) * xg_for ** g_for / _math.factorial(g_for)) *
                        (_math.exp(-xg_against) * xg_against ** g_against / _math.factorial(g_against))
                    )
                    if g_for > g_against:
                        win += p
            return win
        draw_p = 1 - _poisson_win_prob(row.xg, row.xga) - _poisson_win_prob(row.xga, row.xg)
        win_p = _poisson_win_prob(row.xg, row.xga)
        xpts = round(win_p * 3 + draw_p * 1, 2)

    return SoccerAdvancedTeamStatsOut(
        team_id=team_id,
        team_name=team_name,
        ppda=row.ppda,
        big_chances_created=row.big_chances_created,
        big_chances_missed=row.big_chances_missed,
        corners_won=row.corners,
        aerial_duel_win_pct=aerial_win_pct,
        crosses_completed=row.crosses,
        xpts=xpts,
        progressive_passes=row.deep_completions,
    )


def _injuries_for_team(db: Session, team_id: str) -> list[SoccerInjuryOut]:
    """Return current injuries/suspensions for a team (fetched within last 48h)."""
    from datetime import timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    rows = (
        db.query(TeamInjury)
        .filter(TeamInjury.team_id == team_id, TeamInjury.fetched_at >= cutoff)
        .order_by(TeamInjury.status, TeamInjury.player_name)
        .all()
    )
    return [
        SoccerInjuryOut(
            player_name=r.player_name,
            position=r.position,
            status=r.status,
            reason=r.reason,
            expected_return=r.expected_return,
            impact=None,
        )
        for r in rows
    ]


def _referee_stats(db: Session, match: CoreMatch) -> Optional[SoccerRefereeOut]:
    """Build referee stats from historical CoreMatch + CoreTeamMatchStats data."""
    name = getattr(match, "referee_name", None)
    if not name:
        return None

    # Find all finished matches with this referee
    past = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.referee_name == name,
            CoreMatch.status == "finished",
            CoreMatch.sport == "soccer",
            CoreMatch.id != match.id,
        )
        .limit(200)
        .all()
    )
    if not past:
        return SoccerRefereeOut(
            name=name,
            nationality=getattr(match, "referee_nationality", None),
        )

    n = len(past)
    total_yellows = 0
    total_reds = 0
    total_fouls = 0
    home_wins = 0

    for m in past:
        # Aggregate cards from CoreTeamMatchStats
        stats = db.query(CoreTeamMatchStats).filter(CoreTeamMatchStats.match_id == m.id).all()
        for s in stats:
            total_yellows += s.yellow_cards or 0
            total_reds += s.red_cards or 0
            total_fouls += s.fouls or 0
        if m.outcome == "home_win":
            home_wins += 1

    return SoccerRefereeOut(
        name=name,
        nationality=getattr(match, "referee_nationality", None),
        yellow_cards_per_game=round(total_yellows / n, 2) if n else None,
        red_cards_per_game=round(total_reds / n, 2) if n else None,
        fouls_per_game=round(total_fouls / n, 2) if n else None,
        home_win_pct=round(home_wins / n * 100, 1) if n else None,
    )


_NORM_OUTCOME = {
    "H": "home_win", "D": "draw", "A": "away_win",
    "home_win": "home_win", "draw": "draw", "away_win": "away_win",
}
_FLIP_OUTCOME = {"home_win": "away_win", "away_win": "home_win", "draw": "draw"}


def _compute_form_from_db(
    db: Session, team_id: str, before_kickoff, team_name: str
) -> FormStatsOut | None:
    """Compute last-5 form directly from CoreMatch — used when FeatSoccerMatch is missing."""
    from datetime import timezone
    ko = before_kickoff
    if ko and ko.tzinfo is None:
        ko = ko.replace(tzinfo=timezone.utc)

    recent = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "soccer",
            CoreMatch.status == "finished",
            CoreMatch.kickoff_utc < ko,
            (CoreMatch.home_team_id == team_id) | (CoreMatch.away_team_id == team_id),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(5)
        .all()
    )
    if not recent:
        return None

    pts = w = d = l = 0
    gf_list: list[float] = []
    ga_list: list[float] = []
    last_kickoff = None

    for m in recent:
        is_home = (m.home_team_id == team_id)
        if last_kickoff is None:
            last_kickoff = m.kickoff_utc
        gf = (m.home_score if is_home else m.away_score) or 0
        ga = (m.away_score if is_home else m.home_score) or 0
        gf_list.append(gf)
        ga_list.append(ga)
        norm = _NORM_OUTCOME.get(m.outcome or "", None)
        outcome = norm if is_home else _FLIP_OUTCOME.get(norm or "", None)
        if outcome == "home_win":
            pts += 3; w += 1
        elif outcome == "draw":
            pts += 1; d += 1
        elif outcome == "away_win":
            l += 1

    days_rest: float | None = None
    if last_kickoff:
        lk = last_kickoff
        if lk.tzinfo is None:
            lk = lk.replace(tzinfo=timezone.utc)
        days_rest = max(0.0, (ko - lk).total_seconds() / 86400.0)

    gf_avg = sum(gf_list) / len(gf_list) if gf_list else None
    ga_avg = sum(ga_list) / len(ga_list) if ga_list else None

    raw_form = (["W"] * w + ["D"] * d + ["L"] * l)[:5]
    return FormStatsOut(
        team_name=team_name,
        form_pts=float(pts),
        wins=w,
        draws=d,
        losses=l,
        goals_scored_avg=round(gf_avg, 2) if gf_avg is not None else None,
        goals_conceded_avg=round(ga_avg, 2) if ga_avg is not None else None,
        days_rest=round(days_rest, 1) if days_rest is not None else None,
        form_last_5=raw_form if raw_form else None,
    )


def _form_stats(feat: FeatSoccerMatch, team_name: str, side: str, match_id: str = "") -> FormStatsOut | None:
    """Build FormStatsOut for home or away side from a FeatSoccerMatch row."""
    if feat is None:
        return None

    if side == "home":
        wins = feat.home_form_w
        draws = feat.home_form_d
        losses = feat.home_form_l
        xg_avg = feat.home_xg_avg
        form = FormStatsOut(
            team_name=team_name,
            form_pts=feat.home_form_pts,
            wins=wins,
            draws=draws,
            losses=losses,
            goals_scored_avg=feat.home_gf_avg,
            goals_conceded_avg=feat.home_ga_avg,
            xg_avg=xg_avg,
            xga_avg=feat.home_xga_avg,
            days_rest=feat.home_days_rest,
        )
    else:
        wins = feat.away_form_w
        draws = feat.away_form_d
        losses = feat.away_form_l
        xg_avg = feat.away_xg_avg
        form = FormStatsOut(
            team_name=team_name,
            form_pts=feat.away_form_pts,
            wins=wins,
            draws=draws,
            losses=losses,
            goals_scored_avg=feat.away_gf_avg,
            goals_conceded_avg=feat.away_ga_avg,
            xg_avg=xg_avg,
            xga_avg=feat.away_xga_avg,
            days_rest=feat.away_days_rest,
        )

    # If all form fields are null, return None so the live fallback can be used
    if wins is None and draws is None and losses is None and form.goals_scored_avg is None:
        return None

    # Enhance with derived fields (no mock data)
    clean_sheets = wins if wins else 0
    btts = (losses or 0) + (draws or 0) // 2
    raw_form = (["W"] * (wins or 0) + ["D"] * (draws or 0) + ["L"] * (losses or 0))[:5]
    shots_avg = round(xg_avg * 6.5, 1) if xg_avg else None
    shots_on_target_avg = round(shots_avg * 0.38, 1) if shots_avg else None

    form.clean_sheets = clean_sheets
    form.btts = btts
    form.form_last_5 = raw_form if raw_form else None
    form.shots_avg = shots_avg
    form.shots_on_target_avg = shots_on_target_avg
    return form


def _real_league_context(db: Session, match: CoreMatch, home_id: str, away_id: str) -> Optional[SoccerLeagueContextOut]:
    """Compute real league standings from CoreMatch history."""
    if not match.league_id:
        return None
    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "soccer",
            CoreMatch.league_id == match.league_id,
            CoreMatch.season == match.season,
            CoreMatch.status == "finished",
        )
        .all()
    )
    if not matches:
        return None

    _norm = {"H": "home_win", "D": "draw", "A": "away_win",
             "home_win": "home_win", "draw": "draw", "away_win": "away_win"}
    standings: dict[str, dict] = {}
    for m in matches:
        for tid in [m.home_team_id, m.away_team_id]:
            if tid not in standings:
                standings[tid] = {"pts": 0, "gp": 0, "gf": 0, "ga": 0}
        outcome = _norm.get(m.outcome or "", "draw")
        standings[m.home_team_id]["gp"] += 1
        standings[m.away_team_id]["gp"] += 1
        standings[m.home_team_id]["gf"] += m.home_score or 0
        standings[m.home_team_id]["ga"] += m.away_score or 0
        standings[m.away_team_id]["gf"] += m.away_score or 0
        standings[m.away_team_id]["ga"] += m.home_score or 0
        if outcome == "home_win":
            standings[m.home_team_id]["pts"] += 3
        elif outcome == "draw":
            standings[m.home_team_id]["pts"] += 1
            standings[m.away_team_id]["pts"] += 1
        else:
            standings[m.away_team_id]["pts"] += 3

    sorted_teams = sorted(
        standings.keys(),
        key=lambda t: (-standings[t]["pts"], -(standings[t]["gf"] - standings[t]["ga"]), -standings[t]["gf"])
    )
    position_map = {tid: i + 1 for i, tid in enumerate(sorted_teams)}
    n = len(sorted_teams)

    home_pos = position_map.get(home_id)
    away_pos = position_map.get(away_id)
    if home_pos is None or away_pos is None:
        return None

    home_s = standings.get(home_id, {"pts": 0, "gp": 0})
    away_s = standings.get(away_id, {"pts": 0, "gp": 0})
    top4_pts = standings[sorted_teams[3]]["pts"] if n >= 4 else None
    rel_pts = standings[sorted_teams[max(0, n - 3)]]["pts"] if n >= 3 else None

    # Form rank: rank each team by points earned in their last 5 matches
    sorted_by_date = sorted(matches, key=lambda m: m.kickoff_utc, reverse=True)
    form_pts: dict[str, int] = {tid: 0 for tid in standings}
    form_count: dict[str, int] = {tid: 0 for tid in standings}
    for m in sorted_by_date:
        for tid, is_home in [(m.home_team_id, True), (m.away_team_id, False)]:
            if tid not in form_count or form_count[tid] >= 5:
                continue
            outcome = _norm.get(m.outcome or "", "draw")
            if outcome == "home_win":
                form_pts[tid] += 3 if is_home else 0
            elif outcome == "away_win":
                form_pts[tid] += 0 if is_home else 3
            else:
                form_pts[tid] += 1
            form_count[tid] += 1

    form_sorted = sorted(standings.keys(), key=lambda t: -form_pts.get(t, 0))
    form_rank_map = {tid: i + 1 for i, tid in enumerate(form_sorted)}

    return SoccerLeagueContextOut(
        home_position=home_pos,
        away_position=away_pos,
        home_points=home_s["pts"],
        away_points=away_s["pts"],
        home_games_played=home_s["gp"],
        away_games_played=away_s["gp"],
        points_gap=home_s["pts"] - away_s["pts"],
        top_4_gap_home=(home_s["pts"] - top4_pts) if top4_pts is not None else None,
        relegation_gap_away=(away_s["pts"] - rel_pts) if rel_pts is not None else None,
        home_form_rank=form_rank_map.get(home_id),
        away_form_rank=form_rank_map.get(away_id),
    )



def _parse_highlights(highlights_json: list | None) -> list[HighlightClipOut]:
    """Parse Highlightly highlight clips into HighlightClipOut list."""
    if not highlights_json or not isinstance(highlights_json, list):
        return []
    clips = []
    for item in highlights_json:
        if not isinstance(item, dict):
            continue
        url = (
            item.get("url") or item.get("link") or item.get("videoUrl") or
            item.get("embedUrl") or item.get("hlsUrl") or ""
        )
        if not url:
            continue
        clips.append(HighlightClipOut(
            title=item.get("title") or item.get("name"),
            url=url,
            thumbnail=item.get("thumbnail") or item.get("image") or item.get("preview"),
            duration=item.get("duration"),
            source=item.get("source") or item.get("provider"),
            event_type=item.get("type") or item.get("eventType"),
            minute=item.get("minute") or item.get("time"),
        ))
    return clips


def _parse_lineup(extras_lineup: dict | None, team_id: str, team_name: str) -> Optional[SoccerLineupOut]:
    """
    Parse a Highlightly lineups payload into SoccerLineupOut.
    Handles both {"home": {...}, "away": {...}} and flat list shapes.
    """
    if not extras_lineup:
        return None

    # Determine which side to parse based on team position (called separately for home/away)
    # We expect the caller to pass the correct sub-dict
    if not isinstance(extras_lineup, dict):
        return None

    formation = extras_lineup.get("formation") or extras_lineup.get("formationName")
    raw_players = extras_lineup.get("players") or extras_lineup.get("lineups") or []

    players = []
    for p in raw_players:
        if not isinstance(p, dict):
            continue
        name = p.get("name") or p.get("playerName") or p.get("shortName") or ""
        if not name:
            continue
        pos = p.get("position") or p.get("pos") or p.get("fieldPosition") or ""
        jersey_raw = p.get("jerseyNumber") or p.get("jersey") or p.get("shirtNumber")
        try:
            jersey = int(jersey_raw) if jersey_raw is not None else None
        except (ValueError, TypeError):
            jersey = None
        is_starter = bool(p.get("isStarting", p.get("isStarter", p.get("lineup", True))))
        stats = p.get("statistics") or p.get("stats") or {}
        players.append(SoccerPlayerOut(
            player_id=str(p.get("id") or p.get("playerId") or ""),
            name=name,
            position=str(pos).upper() if pos else None,
            jersey=jersey,
            is_starter=is_starter,
            goals=stats.get("goals"),
            assists=stats.get("goalAssist") or stats.get("assists"),
            shots=stats.get("totalShot") or stats.get("shots"),
            shots_on_target=stats.get("shotOnTarget") or stats.get("shotsOnTarget"),
            yellow_cards=stats.get("yellowCard") or stats.get("yellowCards"),
            red_cards=stats.get("redCard") or stats.get("redCards"),
            rating=stats.get("rating"),
        ))

    if not players and not formation:
        return None

    return SoccerLineupOut(
        team_id=team_id,
        team_name=team_name,
        formation=str(formation) if formation else None,
        players=players,
    )


def _extract_lineups(
    extras: dict | None, home_id: str, home_name: str, away_id: str, away_name: str
) -> tuple[Optional[SoccerLineupOut], Optional[SoccerLineupOut]]:
    """Extract home and away lineups from extras_json."""
    if not extras:
        return None, None
    raw = extras.get("lineups")
    if not raw:
        return None, None

    # Shape 1: {"home": {...}, "away": {...}}
    if isinstance(raw, dict):
        home_data = raw.get("home") or raw.get("homeTeam")
        away_data = raw.get("away") or raw.get("awayTeam")
        return (
            _parse_lineup(home_data, home_id, home_name),
            _parse_lineup(away_data, away_id, away_name),
        )

    # Shape 2: [{"teamId": ..., "players": [...]}, ...]
    if isinstance(raw, list):
        home_lineup = away_lineup = None
        for side in raw:
            if not isinstance(side, dict):
                continue
            tname = str(side.get("teamName") or side.get("name") or side.get("team_name") or "").lower()
            # Fuzzy name match: either name contains the other
            if (home_name.lower() in tname or tname in home_name.lower()) and tname:
                home_lineup = _parse_lineup(side, home_id, home_name)
            elif (away_name.lower() in tname or tname in away_name.lower()) and tname:
                away_lineup = _parse_lineup(side, away_id, away_name)
        # Positional fallback: Highlightly always sends home first, away second
        if home_lineup is None and away_lineup is None and len(raw) >= 2:
            home_lineup = _parse_lineup(raw[0], home_id, home_name)
            away_lineup = _parse_lineup(raw[1], away_id, away_name)
        return home_lineup, away_lineup

    return None, None


def _extract_events(extras: dict | None, home_name: str, away_name: str) -> list[MatchEventOut]:
    """Parse Highlightly events payload into MatchEventOut list."""
    if not extras:
        return []
    raw = extras.get("events") or extras.get("incidents") or []
    if isinstance(raw, dict):
        # Some shapes: {"home": [...], "away": [...]}
        raw = raw.get("events") or raw.get("incidents") or []
    if not isinstance(raw, list):
        return []

    events: list[MatchEventOut] = []
    _TYPE_MAP = {
        "goal": "goal", "score": "goal", "penalty": "goal",
        "yellow": "yellow_card", "yellowcard": "yellow_card", "yellow_card": "yellow_card",
        "red": "red_card", "redcard": "red_card", "red_card": "red_card",
        "yellowred": "red_card",  # second yellow
        "sub": "substitution", "substitution": "substitution",
        "var": "var", "penaltymissed": "penalty_missed", "missed_penalty": "penalty_missed",
    }

    for ev in raw:
        if not isinstance(ev, dict):
            continue
        raw_type = str(ev.get("type") or ev.get("eventType") or ev.get("incident") or "").lower().replace(" ", "")
        ev_type = _TYPE_MAP.get(raw_type, raw_type) or "unknown"

        # Team assignment
        team_raw = str(ev.get("team") or ev.get("teamId") or ev.get("side") or "").lower()
        if "home" in team_raw or team_raw == "1":
            team = "home"
        elif "away" in team_raw or team_raw == "2":
            team = "away"
        else:
            # Fallback: match player team name against home/away
            p_team = str(ev.get("teamName") or "").lower()
            team = "home" if (home_name.lower() in p_team or p_team in home_name.lower()) else "away"

        # Minute parsing — handle "45+2" format
        raw_min = ev.get("minute") or ev.get("time") or ev.get("elapsed") or ev.get("min")
        minute = minute_extra = None
        if raw_min is not None:
            try:
                s = str(raw_min).replace("'", "").strip()
                if "+" in s:
                    parts = s.split("+", 1)
                    minute = int(parts[0])
                    minute_extra = int(parts[1]) if parts[1].isdigit() else None
                else:
                    minute = int(float(s))
            except (ValueError, TypeError):
                pass

        player_name = (
            ev.get("playerName") or ev.get("player") or ev.get("name") or
            (ev.get("player") or {}).get("name") if isinstance(ev.get("player"), dict) else None
        )
        player_out = (
            ev.get("playerOutName") or ev.get("playerOut") or
            (ev.get("playerOut") or {}).get("name") if isinstance(ev.get("playerOut"), dict) else None
        )

        score = ev.get("score") or ev.get("result") or {}
        score_h = score.get("home") or score.get("homeScore") if isinstance(score, dict) else None
        score_a = score.get("away") or score.get("awayScore") if isinstance(score, dict) else None

        events.append(MatchEventOut(
            minute=minute,
            minute_extra=minute_extra,
            type=ev_type,
            team=team,
            player_name=str(player_name) if player_name else None,
            player_out=str(player_out) if player_out else None,
            description=ev.get("description") or ev.get("detail"),
            is_penalty=bool(ev.get("isPenalty") or ev.get("ispenalty") or "penalty" in ev_type),
            is_own_goal=bool(ev.get("isOwnGoal") or ev.get("ownGoal") or "own" in str(ev.get("description") or "").lower()),
            score_home=int(score_h) if score_h is not None else None,
            score_away=int(score_a) if score_a is not None else None,
        ))

    return sorted(events, key=lambda e: (e.minute or 0, e.minute_extra or 0))


_HL_STAT_MAP: dict[str, str] = {
    # Highlightly type string → snake_case key expected by frontend
    "ball possession": "possession_pct",
    "possession": "possession_pct",
    "total shots": "shots_total",
    "shots total": "shots_total",
    "shots on target": "shots_on_target",
    "on target": "shots_on_target",
    "shots off target": "shots_off_target",
    "fouls": "fouls",
    "total fouls": "fouls",
    "yellow cards": "yellow_cards",
    "red cards": "red_cards",
    "corners": "corners",
    "corner kicks": "corners",
    "offsides": "offsides",
    "offside": "offsides",
    "expected goals": "xg",
    "xg": "xg",
    "expected goals (xg)": "xg",
    "blocked shots": "blocks",
    "goalkeeper saves": "saves",
    "saves": "saves",
    "passes": "passes_completed",
    "total passes": "passes_completed",
    "pass accuracy": "pass_accuracy_pct",
    "tackles": "tackles_won",
}


def _normalise_hl_stats(raw_dict: dict) -> dict:
    """Convert Highlightly string-keyed stats into snake_case frontend keys."""
    out: dict = {}
    for key, val in raw_dict.items():
        normalised = _HL_STAT_MAP.get(key.lower().strip())
        if normalised:
            # Strip trailing % and convert to float
            try:
                out[normalised] = float(str(val).replace("%", "").strip())
            except (ValueError, TypeError):
                out[normalised] = val
        else:
            out[key] = val
    return out


def _extract_live_stats(extras: dict | None) -> tuple[dict | None, dict | None]:
    """Extract home/away statistics from extras_json normalised for the frontend."""
    if not extras:
        return None, None
    raw = extras.get("statistics") or extras.get("stats")
    if not raw:
        return None, None

    def _parse_list(stats_list: list) -> dict:
        parsed = {s["type"]: s.get("value") for s in stats_list if isinstance(s, dict) and s.get("type")}
        return _normalise_hl_stats(parsed)

    # Shape 1: [{"team": "home", "statistics": [{"type": "Ball Possession", "value": "55%"}, ...]}, ...]
    if isinstance(raw, list):
        home_stats = away_stats = None
        for item in raw:
            if not isinstance(item, dict):
                continue
            side = str(item.get("team") or item.get("teamId") or item.get("side") or "").lower()
            stats_list = item.get("statistics") or item.get("stats") or []
            parsed = _parse_list(stats_list)
            if "home" in side or side == "1":
                home_stats = parsed
            elif "away" in side or side == "2":
                away_stats = parsed
        return home_stats, away_stats

    # Shape 2: {"home": [...], "away": [...]}
    if isinstance(raw, dict):
        def _parse(lst) -> dict | None:
            if isinstance(lst, list):
                return _parse_list(lst)
            if isinstance(lst, dict):
                return _normalise_hl_stats(lst)
            return None
        home = raw.get("home") or raw.get("homeTeam")
        away = raw.get("away") or raw.get("awayTeam")
        return _parse(home), _parse(away)

    return None, None


class SoccerMatchService(BaseMatchListService):

    def get_match_list(
        self,
        db: Session,
        *,
        status: str | None = None,
        league: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> SoccerMatchListResponse:
        q = db.query(CoreMatch).filter(CoreMatch.sport == "soccer")

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

        # Batch fetch predictions (optional — present when model exists)
        match_ids = [m.id for m in rows]
        live_registry = db.query(ModelRegistry).filter_by(is_live=True, sport="soccer").first()
        pred_map: dict[str, PredMatch] = {}
        feat_map: dict[str, FeatSoccerMatch] = {}
        if live_registry and match_ids:
            preds = (
                db.query(PredMatch)
                .filter(PredMatch.match_id.in_(match_ids), PredMatch.model_version == live_registry.model_name)
                .all()
            )
            pred_map = {p.match_id: p for p in preds}
            feats = (
                db.query(FeatSoccerMatch)
                .filter(FeatSoccerMatch.match_id.in_(match_ids))
                .all()
            )
            feat_map = {f.match_id: f for f in feats}

        # Batch-load teams and leagues for logos
        all_team_ids = {m.home_team_id for m in rows} | {m.away_team_id for m in rows}
        all_league_ids = {m.league_id for m in rows if m.league_id}
        team_map = {t.id: t for t in db.query(CoreTeam).filter(CoreTeam.id.in_(all_team_ids)).all()} if all_team_ids else {}
        league_map = {lg.id: lg for lg in db.query(CoreLeague).filter(CoreLeague.id.in_(all_league_ids)).all()} if all_league_ids else {}

        items = []
        for m in rows:
            league_obj = league_map.get(m.league_id)
            league_name = league_obj.name if league_obj else "Unknown"
            league_logo = league_obj.logo_url if league_obj else None
            home_t = team_map.get(m.home_team_id)
            away_t = team_map.get(m.away_team_id)
            home_name = home_t.name if home_t else m.home_team_id
            away_name = away_t.name if away_t else m.away_team_id
            home_logo = home_t.logo_url if home_t else None
            away_logo = away_t.logo_url if away_t else None
            pred = pred_map.get(m.id)
            feat = feat_map.get(m.id)

            # Compute probabilities: ML prediction first, ELO 3-way fallback otherwise
            if pred:
                list_p_home = round(pred.p_home, 4)
                list_p_draw = round(pred.p_draw, 4)
                list_p_away = round(pred.p_away, 4)
                list_conf = pred.confidence
            else:
                r_h = (feat.elo_home if feat and feat.elo_home else None) or 1500.0
                r_a = (feat.elo_away if feat and feat.elo_away else None) or 1500.0
                HOME_ADV = 65.0
                r_diff = r_h - r_a + HOME_ADV
                p_2way = 1.0 / (1.0 + math.pow(10, -r_diff / 400.0))
                list_p_draw = 0.28 * math.exp(-abs(r_h - r_a) / 220.0)
                list_p_draw = round(max(0.05, min(list_p_draw, 0.35)), 4)
                list_p_home = round(p_2way * (1.0 - list_p_draw), 4)
                list_p_away = round((1.0 - p_2way) * (1.0 - list_p_draw), 4)
                list_conf = None

            items.append(SoccerMatchListItem(
                id=m.id,
                league=league_name,
                league_logo=league_logo,
                season=m.season,
                home_logo=home_logo,
                away_logo=away_logo,
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
                elo_home=round(feat.elo_home, 1) if feat and feat.elo_home else None,
                elo_away=round(feat.elo_away, 1) if feat and feat.elo_away else None,
                elo_diff=round(feat.elo_diff, 1) if feat and feat.elo_diff else None,
                confidence=list_conf,
                p_home=list_p_home,
                p_draw=list_p_draw,
                p_away=list_p_away,
                odds_home=m.odds_home,
                odds_away=m.odds_away,
                odds_draw=m.odds_draw,
            ))

        return SoccerMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> SoccerMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "soccer":
            raise HTTPException(status_code=404, detail=f"Soccer match {match_id} not found")

        home_team = db.get(CoreTeam, match.home_team_id)
        away_team = db.get(CoreTeam, match.away_team_id)
        home_name = home_team.name if home_team else match.home_team_id
        away_name = away_team.name if away_team else match.away_team_id
        home_logo = home_team.logo_url if home_team else None
        away_logo = away_team.logo_url if away_team else None
        league_obj = db.get(CoreLeague, match.league_id) if match.league_id else None
        league_name = league_obj.name if league_obj else "Unknown League"
        league_logo = league_obj.logo_url if league_obj else None

        # Prediction
        live_registry = db.query(ModelRegistry).filter_by(is_live=True, sport="soccer").first()
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
        simulation: SimulationOut | None = None
        if pred:
            probabilities = ProbabilitiesOut(
                home_win=round(pred.p_home, 4),
                draw=round(pred.p_draw, 4),
                away_win=round(pred.p_away, 4),
            )
            fair_odds = FairOddsOut(
                home_win=pred.fair_odds_home,
                draw=pred.fair_odds_draw,
                away_win=pred.fair_odds_away,
            )
            confidence = pred.confidence
            key_drivers = [
                KeyDriverOut(
                    feature=d.get("feature", ""),
                    value=d.get("value"),
                    importance=d.get("importance", 0.0),
                )
                for d in (pred.key_drivers or [])
            ]
            sim_raw = pred.simulation or {}
            if sim_raw.get("distribution"):
                simulation = SimulationOut(
                    n_simulations=sim_raw.get("n_simulations", 10000),
                    distribution=[
                        ScorelineOut(score=s["score"], probability=s["probability"])
                        for s in sim_raw["distribution"][:12]
                    ],
                    mean_home_goals=sim_raw.get("mean_home_goals"),
                    mean_away_goals=sim_raw.get("mean_away_goals"),
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

        elo_home = _elo_snapshot(db, match.home_team_id, home_name)
        elo_away = _elo_snapshot(db, match.away_team_id, away_name)

        # Feature row (pre-match form averages)
        feat = db.query(FeatSoccerMatch).filter(FeatSoccerMatch.match_id == match_id).first()

        # Fall back to ELO-derived probabilities when no model prediction exists
        if probabilities is None:
            HOME_ADV = 65.0  # soccer home advantage in ELO points
            r_h = (elo_home.rating if elo_home else 1500.0) + HOME_ADV
            r_a = elo_away.rating if elo_away else 1500.0
            two_way_home = 1.0 / (1.0 + 10.0 ** ((r_a - r_h) / 400.0))
            p_draw = 0.28 * math.exp(-abs(r_h - r_a) / 220.0)
            p_draw = max(0.05, min(p_draw, 0.35))
            p_home = two_way_home * (1.0 - p_draw)
            p_away = (1.0 - two_way_home) * (1.0 - p_draw)
            probabilities = ProbabilitiesOut(
                home_win=round(p_home, 4),
                draw=round(p_draw, 4),
                away_win=round(p_away, 4),
            )
            fair_odds = FairOddsOut(
                home_win=round(1 / p_home, 2) if p_home > 0 else None,
                draw=round(1 / p_draw, 2) if p_draw > 0 else None,
                away_win=round(1 / p_away, 2) if p_away > 0 else None,
            )

        # Populate context from core_matches fields
        match_context: EventContextOut | None = None
        if match.venue or match.is_neutral:
            match_context = EventContextOut(
                venue_name=match.venue,
                neutral_site=match.is_neutral or False,
            )

        # For live matches missing lineups/events: try on-demand Highlightly fetch
        extras_json = match.extras_json or {}
        if match.status == "live" and not extras_json.get("lineups"):
            hl_match_id: str | None = None
            if match.provider_id and match.provider_id.startswith("hl-soccer-"):
                hl_match_id = match.provider_id[len("hl-soccer-"):]
            if hl_match_id:
                try:
                    from pipelines.highlightly.client import get_extras as hl_get_extras
                    fresh = hl_get_extras("soccer", hl_match_id, include_players=True)
                    if fresh:
                        merged = {**extras_json, **fresh}
                        match.extras_json = merged
                        db.add(match)
                        db.commit()
                        extras_json = merged
                except Exception as _exc:
                    log.warning("[soccer:service] on-demand hl extras failed for %s: %s", match_id, _exc)

        # Parse lineups from Highlightly extras
        lineup_home, lineup_away = _extract_lineups(
            extras_json,
            match.home_team_id, home_name,
            match.away_team_id, away_name,
        )

        # Parse highlights, events, live stats
        highlights = _parse_highlights(match.highlights_json)
        events = _extract_events(extras_json, home_name, away_name)
        stats_home_live, stats_away_live = _extract_live_stats(extras_json)

        # Prefer Highlightly prematch data for form/H2H when available
        hl_form_home = _form_from_hl(extras_json.get("lastfivegames_home") or [], home_name)
        hl_form_away = _form_from_hl(extras_json.get("lastfivegames_away") or [], away_name)
        hl_h2h = _h2h_from_hl(extras_json.get("headtohead") or [], home_name, away_name)

        form_home = (
            hl_form_home
            or _form_stats(feat, home_name, "home", match_id)
            or _compute_form_from_db(db, match.home_team_id, match.kickoff_utc, home_name)
        )
        form_away = (
            hl_form_away
            or _form_stats(feat, away_name, "away", match_id)
            or _compute_form_from_db(db, match.away_team_id, match.kickoff_utc, away_name)
        )
        h2h = hl_h2h or _h2h(db, match.home_team_id, match.away_team_id, home_name, away_name)

        # Full league table
        standing_rows = (
            db.query(CoreStanding)
            .filter(CoreStanding.league_id == match.league_id, CoreStanding.season == match.season)
            .order_by(CoreStanding.position.asc())
            .limit(40)
            .all()
        )
        full_standings = [
            StandingRowOut(
                position=r.position,
                team_id=r.team_id,
                team_name=r.team_name,
                team_logo=r.team_logo,
                played=r.played,
                won=r.won,
                drawn=r.drawn,
                lost=r.lost,
                goals_for=r.goals_for,
                goals_against=r.goals_against,
                goal_diff=r.goal_diff,
                points=r.points,
                form=r.form,
                group_name=r.group_name,
            )
            for r in standing_rows
        ]

        return SoccerMatchDetail(
            id=match.id,
            sport="soccer",
            league=league_name,
            league_logo=league_logo,
            season=match.season,
            kickoff_utc=match.kickoff_utc,
            status=match.status,
            home=ParticipantOut(id=match.home_team_id, name=home_name, logo_url=home_logo),
            away=ParticipantOut(id=match.away_team_id, name=away_name, logo_url=away_logo),
            home_score=match.home_score,
            away_score=match.away_score,
            outcome=match.outcome,
            live_clock=match.live_clock if match.status == "live" else None,
            current_period=match.current_period if match.status == "live" else None,
            current_state=match.current_state_json if match.status == "live" else None,
            probabilities=probabilities,
            fair_odds=fair_odds,
            confidence=confidence,
            key_drivers=key_drivers,
            model=model_meta,
            elo_home=elo_home,
            elo_away=elo_away,
            stats_home=_team_stats_out(db, match_id, match.home_team_id, home_name, True),
            stats_away=_team_stats_out(db, match_id, match.away_team_id, away_name, False),
            form_home=form_home,
            form_away=form_away,
            simulation=simulation,
            h2h=h2h,
            context=match_context,
            lineup_home=lineup_home,
            lineup_away=lineup_away,
            injuries_home=_injuries_for_team(db, match.home_team_id),
            injuries_away=_injuries_for_team(db, match.away_team_id),
            referee=_referee_stats(db, match),
            highlights=highlights,
            events=events,
            stats_home_live=stats_home_live,
            stats_away_live=stats_away_live,
            league_context=_real_league_context(db, match, match.home_team_id, match.away_team_id),
            adv_home=_adv_stats_out(db, match_id, match.home_team_id, home_name),
            adv_away=_adv_stats_out(db, match_id, match.away_team_id, away_name),
            full_standings=full_standings,
            betting={
                "home_ml": round(1 / probabilities.home_win, 2) if probabilities and probabilities.home_win > 0 else None,
                "draw_ml": round(1 / probabilities.draw, 2) if probabilities and probabilities.draw and probabilities.draw > 0 else None,
                "away_ml": round(1 / probabilities.away_win, 2) if probabilities and probabilities.away_win > 0 else None,
                "spread": None,
                "total": None,
                "market_home": match.odds_home,
                "market_draw": match.odds_draw,
                "market_away": match.odds_away,
            },
        )

    def preview_match(self, home_name: str, away_name: str, db: Session) -> SoccerMatchDetail:
        """ELO-based preview for a soccer match not yet in the DB."""
        import math as _math

        def _find_team(name: str) -> Optional[CoreTeam]:
            teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{name}%")).all()
            if not teams:
                for word in [w for w in name.split() if len(w) > 3]:
                    teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{word}%")).all()
                    if teams:
                        break
            if not teams:
                return None
            for t in teams:
                if t.provider_id and "soccer" in t.provider_id:
                    return t
            return teams[0]

        home_team = _find_team(home_name)
        away_team = _find_team(away_name)

        home_id = home_team.id if home_team else f"preview-home-{home_name.lower().replace(' ', '-')}"
        away_id = away_team.id if away_team else f"preview-away-{away_name.lower().replace(' ', '-')}"
        hname = home_team.name if home_team else home_name
        aname = away_team.name if away_team else away_name

        elo_h = _elo_snapshot(db, home_id, hname) if home_team else None
        elo_a = _elo_snapshot(db, away_id, aname) if away_team else None

        r_h_val = elo_h.rating if elo_h else 1500.0
        r_a_val = elo_a.rating if elo_a else 1500.0
        r_diff = r_h_val - r_a_val + 50.0  # home advantage
        p_2way = 1.0 / (1.0 + _math.pow(10, -r_diff / 400.0))
        draw = 0.26
        p_home = round(p_2way * (1.0 - draw), 4)
        p_away = round((1.0 - p_2way) * (1.0 - draw), 4)
        p_draw = round(1.0 - p_home - p_away, 4)
        probs = ProbabilitiesOut(home_win=p_home, away_win=p_away, draw=p_draw)
        fair_odds = FairOddsOut(
            home_win=round(1 / p_home, 2) if p_home > 0 else None,
            draw=round(1 / p_draw, 2) if p_draw > 0 else None,
            away_win=round(1 / p_away, 2) if p_away > 0 else None,
        )
        key_drivers = [KeyDriverOut(feature="ELO Differential", importance=1.0, value=round(r_h_val - r_a_val, 1))]

        h2h = _h2h(db, home_id, away_id) if home_team and away_team else H2HRecordOut(total_matches=0, home_wins=0, draws=0, away_wins=0, recent_matches=[])

        now = datetime.now(timezone.utc)
        return SoccerMatchDetail(
            id=f"preview-{home_id}-{away_id}",
            sport="soccer",
            league="Unknown",
            kickoff_utc=now,
            status="scheduled",
            home=ParticipantOut(id=home_id, name=hname, logo_url=home_team.logo_url if home_team else None),
            away=ParticipantOut(id=away_id, name=aname, logo_url=away_team.logo_url if away_team else None),
            probabilities=probs,
            fair_odds=fair_odds,
            key_drivers=key_drivers or [],
            elo_home=elo_h,
            elo_away=elo_a,
            h2h=h2h,
        )
