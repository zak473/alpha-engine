"""Baseball match service — full Quant Terminal depth with mock data fallback."""

from __future__ import annotations

import math
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
from api.sports.base.queries import compute_team_form, form_summary
from db.models.baseball import BaseballTeamMatchStats, BaseballPlayerMatchStats, EventContext
from db.models.mvp import CoreLeague, CoreMatch, CoreTeam, RatingEloTeam


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _name(db: Session, team_id: str) -> str:
    t = db.get(CoreTeam, team_id)
    return t.name if t else team_id


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
    change = round(latest.rating_after - rows[1].rating_after, 1) if len(rows) >= 2 else None
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


def _build_baseball_form(
    team_id: str, team_name: str, records: list[dict], summary: dict, seed: int, is_home: bool
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


def _mock_baseball_detail(
    match: CoreMatch, home_name: str, away_name: str, league: str, db: Session,
    home_logo: str | None = None, away_logo: str | None = None,
) -> BaseballMatchDetail:
    seed = sum(ord(c) for c in match.id) % 100
    is_finished = match.status == "finished"

    home_runs = match.home_score if match.home_score is not None else (3 + (seed % 6) if is_finished else None)
    away_runs = match.away_score if match.away_score is not None else (2 + ((seed + 4) % 6) if is_finished else None)

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

    starter_home = _starter_from_stats(stats_home_row) if stats_home_row else None
    starter_away = _starter_from_stats(stats_away_row) if stats_away_row else None
    bullpen_home = None
    bullpen_away = None
    batting_home = _batting_from_stats(stats_home_row, home_name, db) if stats_home_row else None
    batting_away = _batting_from_stats(stats_away_row, away_name, db) if stats_away_row else None

    # Real form from CoreMatch
    home_form_records = compute_team_form(db, "baseball", match.home_team_id, limit=5)
    away_form_records = compute_team_form(db, "baseball", match.away_team_id, limit=5)
    home_summary = form_summary(home_form_records)
    away_summary = form_summary(away_form_records)

    # Real inning scores from EventContext (populated by fetch_stats.py)
    innings = None
    ctx = db.query(EventContext).filter_by(match_id=match.id).first()
    if ctx and ctx.inning_scores_json:
        try:
            import json as _json
            raw = _json.loads(ctx.inning_scores_json)
            innings = [InningScore(inning=r["inning"], home=r.get("home"), away=r.get("away")) for r in raw]
        except Exception:
            innings = None
    events = None

    weather = None
    park_factor = None

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
            weather=weather,
            park_factor=park_factor,
            home_record=None,
            away_record=None,
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
        form_home=_build_baseball_form(match.home_team_id, home_name, home_form_records, home_summary, seed, True),
        form_away=_build_baseball_form(match.away_team_id, away_name, away_form_records, away_summary, seed + 11, False),
        inning_events=events,
        h2h=_h2h(db, match.home_team_id, match.away_team_id),
        context={"venue_name": match.venue} if match.venue else None,
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

        items = []
        for m in rows:
            ht = team_map.get(m.home_team_id)
            at = team_map.get(m.away_team_id)
            lg = league_map.get(m.league_id)
            home_name = ht.name if ht else m.home_team_id
            away_name = at.name if at else m.away_team_id
            elo_h = _elo_snapshot(db, m.home_team_id, home_name)
            elo_a = _elo_snapshot(db, m.away_team_id, away_name)
            seed = sum(ord(c) for c in m.id) % 100
            r_home = (elo_h.rating if elo_h else 1500.0)
            r_away = (elo_a.rating if elo_a else 1500.0)
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
                elo_home=elo_h.rating if elo_h else None,
                elo_away=elo_a.rating if elo_a else None,
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

        return _mock_baseball_detail(match, home_name, away_name, league, db,
                                     home_logo=home_logo, away_logo=away_logo)

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
