"""Baseball match service."""

from __future__ import annotations

import logging
import math

log = logging.getLogger(__name__)
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session

from api.sports.base.interfaces import BaseMatchListService
from api.sports.baseball.schemas import (
    BaseballEloPanelOut,
    BaseballMatchDetail,
    BaseballMatchInfo,
    BaseballMatchListItem,
    BaseballMatchListResponse,
    BaseballTeamBattingOut,
    BaseballTeamFormEntry,
    BaseballTeamFormOut,
    BaseballWeatherOut,
    BattedBallStatsOut,
    BatterOut,
    BullpenPitcherOut,
    BullpenSummaryOut,
    EloHistoryPoint,
    FairOddsOut,
    H2HRecordOut,
    InningEvent,
    InningScore,
    KeyDriverOut,
    ModelMetaOut,
    ParticipantOut,
    PitchTypeOut,
    ProbabilitiesOut,
    SituationalBattingOut,
    StarterPitcherOut,
    UmpireOut,
)
from api.sports.base.queries import compute_league_context, compute_team_form, form_from_hl, form_summary, h2h_from_hl
from db.models.baseball import BaseballTeamMatchStats, BaseballPlayerMatchStats, EventContext
from db.models.mvp import CoreLeague, CoreMatch, CoreTeam, RatingEloTeam, TeamInjury
from sqlalchemy import or_


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _find_team_by_name(db: Session, name: str, sport: str) -> Optional[CoreTeam]:
    """Find the best matching CoreTeam by display name."""
    teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{name}%")).all()
    if not teams:
        # Fallback: word-level match on the most distinctive word
        words = [w for w in name.split() if len(w) > 3]
        for word in words:
            teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{word}%")).all()
            if teams:
                break
    if not teams:
        return None
    prefix = "mlb" if sport == "baseball" else "nba" if sport == "basketball" else f"hl-{sport}"
    for t in teams:
        if t.provider_id and t.provider_id.startswith(prefix):
            return t
    return teams[0]


def _name(db: Session, team_id: str) -> str:
    t = db.get(CoreTeam, team_id)
    return t.name if t else team_id


# MLB ballpark run-scoring factors (league-average = 1.0; >1.0 = hitter-friendly)
_PARK_FACTORS: dict[str, float] = {
    "coors field": 1.15,
    "great american ball park": 1.09,
    "fenway park": 1.04,
    "yankee stadium": 1.03,
    "citizen's bank park": 1.03,
    "citizens bank park": 1.03,
    "oracle park": 0.92,
    "dodger stadium": 0.93,
    "petco park": 0.94,
    "tropicana field": 0.95,
    "t-mobile park": 0.96,
    "minute maid park": 1.01,
    "wrigley field": 1.02,
    "busch stadium": 0.97,
    "pnc park": 0.97,
    "camden yards": 1.02,
    "oriole park at camden yards": 1.02,
    "american family field": 1.01,
    "target field": 0.98,
    "progressive field": 0.98,
    "comerica park": 0.97,
    "guaranteed rate field": 1.01,
    "kauffman stadium": 0.97,
    "angel stadium": 0.97,
    "globe life field": 1.01,
    "truist park": 1.00,
    "loanDepot park": 0.95,
    "loandepot park": 0.95,
    "marlins park": 0.95,
    "citi field": 0.98,
    "nationals park": 1.00,
}


def _injuries_for_team(db: Session, team_id: str) -> list[dict]:
    from datetime import timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(hours=72)
    rows = (
        db.query(TeamInjury)
        .filter(TeamInjury.team_id == team_id, TeamInjury.fetched_at >= cutoff)
        .order_by(TeamInjury.status, TeamInjury.player_name)
        .all()
    )
    return [
        {"player_name": r.player_name, "position": r.position, "status": r.status,
         "reason": r.reason, "expected_return": r.expected_return}
        for r in rows
    ]


def _get_park_factor(venue: str | None) -> float | None:
    if not venue:
        return None
    return _PARK_FACTORS.get(venue.lower().strip())


def _season_record(db: Session, sport: str, team_id: str, season: str | None) -> str | None:
    """Return 'W-L' season record for a team."""
    q = db.query(CoreMatch).filter(
        CoreMatch.sport == sport,
        CoreMatch.status == "finished",
        or_(CoreMatch.home_team_id == team_id, CoreMatch.away_team_id == team_id),
    )
    if season:
        q = q.filter(CoreMatch.season == season)
    matches = q.all()
    if not matches:
        return None
    wins = losses = 0
    for m in matches:
        is_home = m.home_team_id == team_id
        if m.outcome == "home_win":
            wins += 1 if is_home else 0
            losses += 0 if is_home else 1
        elif m.outcome == "away_win":
            wins += 0 if is_home else 1
            losses += 1 if is_home else 0
    return f"{wins}-{losses}"


def _parse_weather(extras: dict) -> Optional[BaseballWeatherOut]:
    """Parse weather conditions from Highlightly extras_json."""
    raw = extras.get("weather") or extras.get("conditions") or extras.get("environment")
    if not raw or not isinstance(raw, dict):
        return None
    try:
        temp_f = raw.get("temperature") or raw.get("temp_f")
        temp_c = raw.get("temp_c")
        if temp_f and not temp_c:
            temp_c = round((float(temp_f) - 32) * 5 / 9, 1)
        wind = raw.get("wind") or {}
        wind_speed = wind.get("speed") if isinstance(wind, dict) else raw.get("wind_speed")
        wind_dir = wind.get("direction") if isinstance(wind, dict) else raw.get("wind_direction")
        conditions = raw.get("description") or raw.get("conditions") or raw.get("summary")
        humidity = raw.get("humidity") or raw.get("humidity_pct")
        if not any([temp_f, temp_c, conditions, wind_speed]):
            return None
        return BaseballWeatherOut(
            temperature_f=float(temp_f) if temp_f is not None else None,
            temperature_c=float(temp_c) if temp_c is not None else None,
            wind_speed_mph=float(wind_speed) if wind_speed is not None else None,
            wind_direction=str(wind_dir) if wind_dir else None,
            conditions=str(conditions) if conditions else None,
            humidity_pct=float(humidity) if humidity is not None else None,
        )
    except Exception:
        return None


def _league_name(db: Session, league_id: str) -> str:
    lg = db.get(CoreLeague, league_id)
    return lg.name if lg else "Unknown League"


def _elo_snapshot(db: Session, team_id: str, name: str) -> Optional[BaseballEloPanelOut]:
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
    change = round(latest.rating_after - latest.rating_before, 1) if len(rows) >= 1 else None
    last_10 = [round(r.rating_after, 1) for r in reversed(rows)]
    return BaseballEloPanelOut(
        team_id=team_id,
        team_name=name,
        rating=round(latest.rating_after, 1),
        rating_change=change,
        last_10_ratings=last_10,
    )


def _h2h(db: Session, home_id: str, away_id: str) -> H2HRecordOut:
    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "baseball",
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
    hw = aw = 0
    recent = []
    for m in matches:
        if m.home_team_id == home_id:
            w = "home" if m.outcome == "home_win" else "away"
            hs, as_ = m.home_score, m.away_score
        else:
            w = "home" if m.outcome == "away_win" else "away"
            hs, as_ = m.away_score, m.home_score
        if w == "home":
            hw += 1
        else:
            aw += 1
        if len(recent) < 5:
            recent.append({"date": m.kickoff_utc.isoformat(), "home_score": hs, "away_score": as_, "winner": w})
    return H2HRecordOut(total_matches=len(matches), home_wins=hw, away_wins=aw, recent_matches=recent)


def _elo_win_prob(r_home: float, r_away: float, home_adv: float = 24.0) -> float:
    return 1.0 / (1.0 + 10 ** (-((r_home + home_adv) - r_away) / 400.0))


def _batting_from_stats(row: "BaseballTeamMatchStats", team_name: str, db=None) -> BaseballTeamBattingOut:
    """Build team batting from real DB stats, including per-batter rows when available."""
    batters = []
    if db is not None:
        player_rows = (
            db.query(BaseballPlayerMatchStats)
            .filter_by(match_id=row.match_id, team_id=row.team_id)
            .order_by(BaseballPlayerMatchStats.batting_order)
            .all()
        )
        for p in player_rows:
            batters.append(BatterOut(
                name=p.player_name,
                position=p.position or "—",
                batting_order=p.batting_order or 0,
                hand=p.hand or "R",
                batting_avg=p.batting_avg,
                obp=p.obp,
                slg=p.slg,
                ops=p.ops,
                at_bats=p.at_bats,
                runs=p.runs,
                hits=p.hits,
                rbi=p.rbi,
                walks=p.walks,
                strikeouts=p.strikeouts,
                home_runs=p.home_runs,
            ))
    return BaseballTeamBattingOut(
        team_id=row.team_id,
        team_name=team_name,
        is_home=row.is_home,
        batters=batters,
        total_runs=row.runs,
        total_hits=row.hits,
        total_hr=row.home_runs,
        total_rbi=row.rbi,
        total_bb=row.walks,
        total_so=row.strikeouts_batting,
        total_lob=row.left_on_base,
        team_avg=row.batting_avg,
        team_obp=row.obp,
        team_slg=row.slg,
        team_ops=row.ops,
    )


def _starter_from_stats(row: "BaseballTeamMatchStats") -> Optional[StarterPitcherOut]:
    if row.pitcher_name is None:
        return None
    return StarterPitcherOut(
        name=row.pitcher_name,
        hand=None,
        era=row.era,
        whip=row.whip,
        ip=row.innings_pitched,
        hits_allowed=row.hits_allowed,
        earned_runs=row.earned_runs,
        strikeouts=row.strikeouts_pitching,
        walks=row.walks_allowed,
    )


def _hl_form_baseball(hl_matches: list[dict], team_id: str, team_name: str) -> Optional[BaseballTeamFormOut]:
    """Build BaseballTeamFormOut from Highlightly lastfivegames data."""
    raw = form_from_hl(hl_matches, team_name)
    if not raw:
        return None
    return BaseballTeamFormOut(
        team_id=team_id,
        team_name=team_name,
        last_5=None,
        wins_last_5=raw["wins"],
        losses_last_5=raw["losses"],
        avg_runs_for=raw.get("gf_avg"),
        avg_runs_against=raw.get("ga_avg"),
        team_era_last_5=None,
        bullpen_era_last_5=None,
        starter=None,
    )


def _parse_hl_events_baseball(raw_events: list | dict) -> list[InningEvent]:
    """Parse Highlightly events into InningEvent list for baseball."""
    if isinstance(raw_events, dict):
        raw_events = raw_events.get("events") or raw_events.get("incidents") or []
    if not isinstance(raw_events, list):
        return []
    out: list[InningEvent] = []
    for ev in raw_events:
        if not isinstance(ev, dict):
            continue
        ev_type = str(ev.get("type") or ev.get("eventType") or "").lower()
        inning_raw = ev.get("inning") or ev.get("period") or ev.get("half") or 0
        try:
            inning = int(inning_raw)
        except (ValueError, TypeError):
            inning = 0
        half_raw = str(ev.get("half") or ev.get("side") or ev.get("team") or "").lower()
        half = "bottom" if ("bottom" in half_raw or "away" in half_raw or half_raw == "2") else "top"
        desc = ev.get("description") or ev.get("detail") or ev.get("text") or ev_type
        team_raw = str(ev.get("team") or ev.get("teamId") or ev.get("side") or "").lower()
        team = "away" if ("away" in team_raw or team_raw == "2") else "home"
        out.append(InningEvent(
            inning=inning,
            half=half,
            description=str(desc),
            event_type=ev_type or None,
            team=team,
        ))
    return out


def _build_baseball_form(
    team_id: str, team_name: str, records: list[dict], summary: dict
) -> Optional[BaseballTeamFormOut]:
    if not records:
        return None
    entries = []
    for rec in records:
        pts_for = rec["pts_for"] or 0
        pts_against = rec["pts_against"] or 0
        entries.append(BaseballTeamFormEntry(
            date=rec["date"],
            opponent=rec["opponent"],
            score=f"{pts_for}-{pts_against}",
            home_away=rec["home_away"],
            result=rec["result"],
            starter=None,
            starter_era=None,
            park=None,
        ))
    wins = summary["wins"]
    losses = summary["losses"]
    return BaseballTeamFormOut(
        team_id=team_id,
        team_name=team_name,
        last_5=entries,
        wins_last_5=wins,
        losses_last_5=losses,
        avg_runs_for=summary["avg_pts_for"],
        avg_runs_against=summary["avg_pts_against"],
        team_era_last_5=None,
        bullpen_era_last_5=None,
        starter=None,
    )


def _build_baseball_detail(
    match: CoreMatch, home_name: str, away_name: str, league: str, db: Session,
    home_logo: str | None = None, away_logo: str | None = None,
) -> BaseballMatchDetail:
    is_finished = match.status == "finished"

    home_runs = match.home_score
    away_runs = match.away_score

    # Real ELO
    elo_home = _elo_snapshot(db, match.home_team_id, home_name)
    elo_away = _elo_snapshot(db, match.away_team_id, away_name)
    r_home = elo_home.rating if elo_home else 1500.0
    r_away = elo_away.rating if elo_away else 1500.0
    p_home = _elo_win_prob(r_home, r_away, 24.0)
    p_away = 1.0 - p_home

    # Stats: real DB if available, otherwise mock
    stats_home_row = db.query(BaseballTeamMatchStats).filter_by(
        match_id=match.id, team_id=match.home_team_id
    ).first() if is_finished else None
    stats_away_row = db.query(BaseballTeamMatchStats).filter_by(
        match_id=match.id, team_id=match.away_team_id
    ).first() if is_finished else None

    # extras_json needed early (probable pitchers for upcoming games)
    extras = match.extras_json or {}

    def _starter_from_probable(side: str) -> Optional[StarterPitcherOut]:
        data = extras.get(f"probable_pitcher_{side}")
        if not data or not isinstance(data, dict):
            return None
        name = data.get("name")
        if not name:
            return None
        return StarterPitcherOut(
            player_id=data.get("player_id") or None,
            name=name,
            era=data.get("era_last_5"),
            whip=data.get("whip_last_5"),
        )

    starter_home = _starter_from_stats(stats_home_row) if stats_home_row else _starter_from_probable("home")
    starter_away = _starter_from_stats(stats_away_row) if stats_away_row else _starter_from_probable("away")
    bullpen_home = None
    bullpen_away = None
    batting_home = _batting_from_stats(stats_home_row, home_name, db) if stats_home_row else None
    batting_away = _batting_from_stats(stats_away_row, away_name, db) if stats_away_row else None

    # Form: prefer HL lastfivegames, fall back to DB
    hl_form_home = _hl_form_baseball(extras.get("lastfivegames_home") or [], match.home_team_id, home_name)
    hl_form_away = _hl_form_baseball(extras.get("lastfivegames_away") or [], match.away_team_id, away_name)
    if not hl_form_home:
        home_form_records = compute_team_form(db, "baseball", match.home_team_id, limit=5)
        home_summary = form_summary(home_form_records)
        hl_form_home = _build_baseball_form(match.home_team_id, home_name, home_form_records, home_summary)
    if not hl_form_away:
        away_form_records = compute_team_form(db, "baseball", match.away_team_id, limit=5)
        away_summary = form_summary(away_form_records)
        hl_form_away = _build_baseball_form(match.away_team_id, away_name, away_form_records, away_summary)

    # Events: from extras_json, then EventContext DB
    hl_events = _parse_hl_events_baseball(extras.get("events") or [])

    _hl_h2h_raw = h2h_from_hl(extras.get("headtohead") or [], home_name, away_name)
    if _hl_h2h_raw:
        _hl_recent = [
            {
                "date": m.get("date"),
                "home_score": m.get("home_score"),
                "away_score": m.get("away_score"),
                "winner": "home" if m.get("outcome") == "home_win" else "away",
            }
            for m in _hl_h2h_raw.get("recent_matches", [])
        ]
        h2h_result = H2HRecordOut(
            total_matches=_hl_h2h_raw["total_matches"],
            home_wins=_hl_h2h_raw["home_wins"],
            away_wins=_hl_h2h_raw["away_wins"],
            recent_matches=_hl_recent,
        )
    else:
        h2h_result = _h2h(db, match.home_team_id, match.away_team_id)

    # Real inning scores from EventContext (populated by fetch_stats.py)
    innings = None
    ctx = db.query(EventContext).filter_by(match_id=match.id).first()
    if ctx and ctx.inning_scores_json:
        try:
            import json as _json
            raw = _json.loads(ctx.inning_scores_json)
            innings = [InningScore(inning=r["inning"], home=r.get("home"), away=r.get("away")) for r in raw]
        except Exception as exc:
            log.warning("inning_scores_parse_failed match=%s err=%s", match.id, exc)
            innings = None
    events = None

    weather = _parse_weather(extras)
    park_factor = _get_park_factor(match.venue)

    # Umpire name from Highlightly extras
    umpire_name: str | None = (
        extras.get("umpire")
        or extras.get("referee")
        or (extras.get("officials") or [None])[0]
        or None
    )
    if isinstance(umpire_name, dict):
        umpire_name = umpire_name.get("name") or umpire_name.get("full_name")

    # Derive current_period for live baseball from EventContext inning_scores_json length
    baseball_current_period = match.current_period if match.status == "live" else None
    baseball_current_state = match.current_state_json if match.status == "live" else None
    if match.status == "live" and baseball_current_period is None and innings is not None:
        baseball_current_period = len(innings)

    return BaseballMatchDetail(
        id=match.id,
        sport="baseball",
        league=league,
        season=match.season,
        kickoff_utc=match.kickoff_utc,
        status=match.status,
        home=ParticipantOut(id=match.home_team_id, name=home_name, logo_url=home_logo),
        away=ParticipantOut(id=match.away_team_id, name=away_name, logo_url=away_logo),
        home_score=match.home_score,
        away_score=match.away_score,
        outcome=match.outcome,
        live_clock=match.live_clock if match.status == "live" else None,
        current_period=baseball_current_period,
        current_state=baseball_current_state,
        probabilities=ProbabilitiesOut(home_win=round(p_home, 3), away_win=round(p_away, 3)),
        confidence=None,
        fair_odds=FairOddsOut(home_win=round(1 / p_home, 2) if p_home > 0 else None, away_win=round(1 / p_away, 2) if p_away > 0 else None),
        key_drivers=[
            KeyDriverOut(feature="ELO Differential", importance=0.5, value=round(r_home - r_away, 1)),
        ],
        model=None,
        elo_home=elo_home,
        elo_away=elo_away,
        match_info=BaseballMatchInfo(
            ballpark=match.venue,
            city=None,
            attendance=None,
            innings_played=9 if is_finished else None,
            inning_scores=innings,
            home_hits=batting_home.total_hits if batting_home else None,
            home_errors=None,
            away_hits=batting_away.total_hits if batting_away else None,
            away_errors=None,
            umpire_home_plate=umpire_name,
            weather=weather,
            park_factor=park_factor,
            home_record=_season_record(db, "baseball", match.home_team_id, match.season),
            away_record=_season_record(db, "baseball", match.away_team_id, match.season),
            home_streak=None,
            away_streak=None,
            home_bullpen_era=None,
            away_bullpen_era=None,
        ),
        starter_home=starter_home,
        starter_away=starter_away,
        bullpen_home=bullpen_home,
        bullpen_away=bullpen_away,
        batting_home=batting_home,
        batting_away=batting_away,
        form_home=hl_form_home,
        form_away=hl_form_away,
        inning_events=hl_events or events,
        h2h=h2h_result,
        injuries_home=_injuries_for_team(db, match.home_team_id) or None,
        injuries_away=_injuries_for_team(db, match.away_team_id) or None,
        context={"venue_name": match.venue} if match.venue else None,
        league_context=compute_league_context(db, "baseball", match.league_id, match.season, match.home_team_id, match.away_team_id),
        data_completeness={
            "box_score": is_finished and (stats_home_row is not None or stats_away_row is not None),
            "pitching_line": is_finished and (stats_home_row is not None or stats_away_row is not None),
            "batting_line": is_finished and (stats_home_row is not None or stats_away_row is not None),
            "inning_events": innings is not None,
            "elo_ratings": True,
            "weather": False,
            "h2h": True,
        },
        batted_ball_home=None,
        batted_ball_away=None,
        situational_home=None,
        situational_away=None,
        umpire=None,
        betting={
            "home_ml": round(1 / p_home, 2) if p_home > 0 else None,
            "away_ml": round(1 / p_away, 2) if p_away > 0 else None,
            "market_home": match.odds_home,
            "market_away": match.odds_away,
        },
    )


# ─── Service ─────────────────────────────────────────────────────────────────

class BaseballMatchService(BaseMatchListService):

    def get_match_list(self, db, *, status=None, league=None, date_from=None, date_to=None, limit=50, offset=0):
        q = db.query(CoreMatch).filter(CoreMatch.sport == "baseball")
        if status:
            q = q.filter(CoreMatch.status == status)
        if league:
            q = q.join(CoreLeague, CoreLeague.id == CoreMatch.league_id).filter(CoreLeague.name.ilike(f"%{league}%"))
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
        team_map = {t.id: t for t in db.query(CoreTeam).filter(CoreTeam.id.in_(all_team_ids)).all()} if all_team_ids else {}
        league_map = {lg.id: lg for lg in db.query(CoreLeague).filter(CoreLeague.id.in_(all_league_ids)).all()} if all_league_ids else {}

        # Batch-load latest ELO ratings for all teams in one query
        from sqlalchemy import func as _func
        elo_subq = (
            db.query(RatingEloTeam.team_id, _func.max(RatingEloTeam.rated_at).label("max_at"))
            .filter(RatingEloTeam.team_id.in_(all_team_ids), RatingEloTeam.context == "global")
            .group_by(RatingEloTeam.team_id)
            .subquery()
        )
        elo_rows = (
            db.query(RatingEloTeam)
            .join(elo_subq, (RatingEloTeam.team_id == elo_subq.c.team_id) & (RatingEloTeam.rated_at == elo_subq.c.max_at))
            .all()
        )
        elo_map: dict[str, float] = {r.team_id: r.rating_after for r in elo_rows}

        items = []
        for m in rows:
            ht = team_map.get(m.home_team_id)
            at = team_map.get(m.away_team_id)
            lg = league_map.get(m.league_id)
            home_name = ht.name if ht else m.home_team_id
            away_name = at.name if at else m.away_team_id
            r_home = elo_map.get(m.home_team_id, 1500.0)
            r_away = elo_map.get(m.away_team_id, 1500.0)
            p_home = _elo_win_prob(r_home, r_away, 24.0)
            items.append(BaseballMatchListItem(
                id=m.id,
                league=lg.name if lg else "Unknown",
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
                elo_home=round(r_home, 1) if m.home_team_id in elo_map else None,
                elo_away=round(r_away, 1) if m.away_team_id in elo_map else None,
                p_home=round(p_home, 3),
                p_away=round(1.0 - p_home, 3),
                confidence=None,
                home_starter=None,
                away_starter=None,
                odds_home=m.odds_home,
                odds_away=m.odds_away,
                home_logo=ht.logo_url if ht else None,
                away_logo=at.logo_url if at else None,
                league_logo=lg.logo_url if lg else None,
            ))
        return BaseballMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> BaseballMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "baseball":
            raise HTTPException(status_code=404, detail=f"Baseball match {match_id} not found")

        home_team = db.get(CoreTeam, match.home_team_id)
        away_team = db.get(CoreTeam, match.away_team_id)
        home_name = home_team.name if home_team else match.home_team_id
        away_name = away_team.name if away_team else match.away_team_id
        home_logo = home_team.logo_url if home_team else None
        away_logo = away_team.logo_url if away_team else None
        league = _league_name(db, match.league_id)

        return _build_baseball_detail(match, home_name, away_name, league, db,
                                     home_logo=home_logo, away_logo=away_logo)

    def preview_match(self, home_name: str, away_name: str, db: Session) -> BaseballMatchDetail:
        """ELO-based preview for a match not yet in the DB."""
        home_team = _find_team_by_name(db, home_name, "baseball")
        away_team = _find_team_by_name(db, away_name, "baseball")

        home_id = home_team.id if home_team else f"preview-home-{home_name.lower().replace(' ', '-')}"
        away_id = away_team.id if away_team else f"preview-away-{away_name.lower().replace(' ', '-')}"
        hname = home_team.name if home_team else home_name
        aname = away_team.name if away_team else away_name
        home_logo = home_team.logo_url if home_team else None
        away_logo = away_team.logo_url if away_team else None

        elo_home = _elo_snapshot(db, home_id, hname) if home_team else None
        elo_away = _elo_snapshot(db, away_id, aname) if away_team else None
        r_home = elo_home.rating if elo_home else 1500.0
        r_away = elo_away.rating if elo_away else 1500.0
        p_home = _elo_win_prob(r_home, r_away, 24.0)
        p_away = 1.0 - p_home

        h2h = _h2h(db, home_id, away_id) if home_team and away_team else H2HRecordOut(total_matches=0, home_wins=0, away_wins=0, recent_matches=[])

        home_form_records = compute_team_form(db, "baseball", home_id, limit=5) if home_team else []
        home_summary = form_summary(home_form_records)
        away_form_records = compute_team_form(db, "baseball", away_id, limit=5) if away_team else []
        away_summary = form_summary(away_form_records)
        form_home = _build_baseball_form(home_id, hname, home_form_records, home_summary) if home_form_records else None
        form_away = _build_baseball_form(away_id, aname, away_form_records, away_summary) if away_form_records else None

        return BaseballMatchDetail(
            id=f"preview-{home_id}-{away_id}",
            sport="baseball",
            league="MLB",
            season=None,
            kickoff_utc=None,
            status="scheduled",
            home=ParticipantOut(id=home_id, name=hname, logo_url=home_logo),
            away=ParticipantOut(id=away_id, name=aname, logo_url=away_logo),
            probabilities=ProbabilitiesOut(home_win=round(p_home, 3), away_win=round(p_away, 3)),
            fair_odds=FairOddsOut(
                home_win=round(1 / p_home, 2) if p_home > 0 else None,
                away_win=round(1 / p_away, 2) if p_away > 0 else None,
            ),
            key_drivers=[KeyDriverOut(feature="ELO Differential", importance=0.5, value=round(r_home - r_away, 1))],
            elo_home=elo_home,
            elo_away=elo_away,
            match_info=BaseballMatchInfo(
                ballpark=None, city=None, attendance=None, innings_played=None,
                inning_scores=None, home_hits=None, home_errors=None,
                away_hits=None, away_errors=None, umpire_home_plate=None,
                weather=None, park_factor=None,
                home_record=_season_record(db, "baseball", home_id, None) if home_team else None,
                away_record=_season_record(db, "baseball", away_id, None) if away_team else None,
                home_streak=None, away_streak=None,
                home_bullpen_era=None, away_bullpen_era=None,
            ),
            form_home=form_home,
            form_away=form_away,
            h2h=h2h,
            data_completeness={
                "box_score": False, "pitching_line": False, "batting_line": False,
                "inning_events": False,
                "elo_ratings": elo_home is not None or elo_away is not None,
                "weather": False, "h2h": True,
            },
            betting={
                "home_ml": round(1 / p_home, 2) if p_home > 0 else None,
                "away_ml": round(1 / p_away, 2) if p_away > 0 else None,
                "market_home": None,
                "market_away": None,
            },
        )

    def get_elo_history(self, team_id: str, limit: int, db: Session) -> list[EloHistoryPoint]:
        rows = (
            db.query(RatingEloTeam)
            .filter(RatingEloTeam.team_id == team_id, RatingEloTeam.context == "global")
            .order_by(RatingEloTeam.rated_at.desc())
            .limit(limit)
            .all()
        )
        return [
            EloHistoryPoint(date=r.rated_at.isoformat(), rating=round(r.rating_after, 1), match_id=None)
            for r in reversed(rows)
        ]
