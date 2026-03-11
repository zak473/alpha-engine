"""Basketball match service."""

from __future__ import annotations

import logging
import math

log = logging.getLogger(__name__)
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session

from api.sports.base.interfaces import BaseMatchListService
from api.sports.basketball.schemas import (
    BasketballAdvancedStatsOut,
    BasketballBettingOut,
    BasketballClutchStatsOut,
    BasketballEloPanelOut,
    BasketballInjuryOut,
    BasketballLineupUnitOut,
    BasketballMatchDetail,
    BasketballMatchInfo,
    BasketballMatchListItem,
    BasketballMatchListResponse,
    BasketballPlayerOut,
    BasketballRefereeOut,
    BasketballScoringRunOut,
    BasketballTeamBoxScore,
    BasketballTeamFormEntry,
    BasketballTeamFormOut,
    EloHistoryPoint,
    FairOddsOut,
    H2HRecordOut,
    KeyDriverOut,
    ModelMetaOut,
    ParticipantOut,
    ProbabilitiesOut,
    QuarterScore,
    ShotZoneOut,
)
from api.sports.base.queries import compute_team_form, form_summary, h2h_from_hl
from db.models.basketball import BasketballTeamMatchStats, BasketballPlayerMatchStats
from db.models.mvp import CoreLeague, CoreMatch, CoreTeam, RatingEloTeam


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _name(db: Session, team_id: str) -> str:
    t = db.get(CoreTeam, team_id)
    return t.name if t else team_id


def _league_name(db: Session, league_id: str) -> str:
    lg = db.get(CoreLeague, league_id)
    return lg.name if lg else "Unknown League"


def _elo_snapshot(db: Session, team_id: str, name: str) -> Optional[BasketballEloPanelOut]:
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
    last_10 = [round(r.rating_after, 1) for r in reversed(rows)]
    return BasketballEloPanelOut(
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
            CoreMatch.sport == "basketball",
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


def _elo_win_prob(r_home: float, r_away: float, home_adv: float = 35.0) -> float:
    return 1.0 / (1.0 + 10 ** (-((r_home + home_adv) - r_away) / 400.0))


def _adv_from_stats(row: "BasketballTeamMatchStats", team_name: str) -> BasketballAdvancedStatsOut:
    """Build advanced stats from real DB row; compute eFG% and TS% from box score."""
    fga = row.fg_attempted or 0
    fg3m = row.fg3_made or 0
    fta = row.ft_attempted or 0
    pts = row.points or 0
    tov = row.turnovers or 0
    fg3a = row.fg3_attempted or 0

    efg = round((( row.fg_made or 0) + 0.5 * fg3m) / fga, 3) if fga > 0 else None
    ts = round(pts / (2 * (fga + 0.44 * fta)), 3) if (fga + 0.44 * fta) > 0 else None
    tov_pct = round(tov / (fga + 0.44 * fta + tov) * 100, 1) if (fga + 0.44 * fta + tov) > 0 else None
    ftr = round(fta / fga, 3) if fga > 0 else None
    three_par = round(fg3a / fga, 3) if fga > 0 else None

    return BasketballAdvancedStatsOut(
        team_id=row.team_id,
        team_name=team_name,
        is_home=row.is_home,
        ortg=row.offensive_rating,
        drtg=row.defensive_rating,
        net_rtg=row.net_rating,
        pace=row.pace,
        efg_pct=efg,
        ts_pct=ts,
        tov_pct=tov_pct,
        ftr=ftr,
        three_par=three_par,
    )


def _box_from_stats(row: "BasketballTeamMatchStats", team_name: str, db: Session | None = None) -> BasketballTeamBoxScore:
    """Build a team box score from real DB stats, including player rows when available."""
    players = []
    if db is not None:
        player_rows = (
            db.query(BasketballPlayerMatchStats)
            .filter_by(match_id=row.match_id, team_id=row.team_id)
            .order_by(BasketballPlayerMatchStats.is_starter.desc(), BasketballPlayerMatchStats.minutes.desc())
            .all()
        )
        for p in player_rows:
            players.append(BasketballPlayerOut(
                name=p.player_name,
                position=p.position,
                is_starter=p.is_starter,
                minutes=p.minutes,
                points=p.points,
                rebounds=p.rebounds_total,
                reb_off=p.rebounds_offensive,
                reb_def=p.rebounds_defensive,
                assists=p.assists,
                steals=p.steals,
                blocks=p.blocks,
                turnovers=p.turnovers,
                fouls=p.fouls,
                plus_minus=p.plus_minus,
                fg_made=p.fg_made,
                fg_att=p.fg_attempted,
                fg_pct=p.fg_pct,
                fg3_made=p.fg3_made,
                fg3_att=p.fg3_attempted,
                fg3_pct=p.fg3_pct,
                ft_made=p.ft_made,
                ft_att=p.ft_attempted,
                ft_pct=p.ft_pct,
            ))
    return BasketballTeamBoxScore(
        team_id=row.team_id,
        team_name=team_name,
        is_home=row.is_home,
        players=players,
        total_points=row.points,
        total_rebounds=row.rebounds_total,
        total_assists=row.assists,
        total_steals=row.steals,
        total_blocks=row.blocks,
        total_turnovers=row.turnovers,
        total_fouls=row.fouls,
        fg_made=row.fg_made,
        fg_att=row.fg_attempted,
        fg_pct=row.fg_pct,
        fg3_made=row.fg3_made,
        fg3_att=row.fg3_attempted,
        fg3_pct=row.fg3_pct,
        ft_made=row.ft_made,
        ft_att=row.ft_attempted,
        ft_pct=row.ft_pct,
    )


def _build_basketball_form(
    team_id: str, team_name: str, records: list[dict], summary: dict
) -> BasketballTeamFormOut:
    entries = []
    for rec in records:
        pts_for = rec["pts_for"] or 0
        pts_against = rec["pts_against"] or 0
        entries.append(BasketballTeamFormEntry(
            date=rec["date"],
            opponent=rec["opponent"],
            score=f"{pts_for}-{pts_against}",
            home_away=rec["home_away"],
            result=rec["result"],
            net_rtg=None,
            days_rest=None,
        ))
    wins = summary["wins"]
    losses = summary["losses"]
    return BasketballTeamFormOut(
        team_id=team_id,
        team_name=team_name,
        last_5=entries,
        wins_last_5=wins,
        losses_last_5=losses,
        avg_pts_for=summary["avg_pts_for"],
        avg_pts_against=summary["avg_pts_against"],
        ortg_last_5=None,
        drtg_last_5=None,
        net_rtg_last_5=None,
        days_rest=None,
        back_to_back=False,
        injury_count=0,
    )


def _build_basketball_detail(
    match: CoreMatch,
    home_name: str,
    away_name: str,
    league: str,
    db: Session,
    home_logo: str | None = None,
    away_logo: str | None = None,
) -> BasketballMatchDetail:
    status = match.status
    is_finished = status == "finished"

    home_pts = match.home_score
    away_pts = match.away_score

    # Real ELO ratings
    elo_home = _elo_snapshot(db, match.home_team_id, home_name)
    elo_away = _elo_snapshot(db, match.away_team_id, away_name)
    r_home = elo_home.rating if elo_home else 1500.0
    r_away = elo_away.rating if elo_away else 1500.0

    p_home = _elo_win_prob(r_home, r_away, 35.0)
    p_away = 1.0 - p_home

    # Box scores: real DB stats only
    stats_home = None
    stats_away = None
    if is_finished:
        stats_home = db.query(BasketballTeamMatchStats).filter_by(
            match_id=match.id, team_id=match.home_team_id
        ).first()
        stats_away = db.query(BasketballTeamMatchStats).filter_by(
            match_id=match.id, team_id=match.away_team_id
        ).first()
        box_home = _box_from_stats(stats_home, home_name, db) if stats_home else None
        box_away = _box_from_stats(stats_away, away_name, db) if stats_away else None

        # Quarter scores: use real DB data if any quarter value is present, else None
        if stats_home and any(
            v is not None for v in [
                stats_home.points_q1, stats_home.points_q2,
                stats_home.points_q3, stats_home.points_q4,
            ]
        ):
            h_qs = QuarterScore(
                q1=stats_home.points_q1,
                q2=stats_home.points_q2,
                q3=stats_home.points_q3,
                q4=stats_home.points_q4,
            )
        else:
            h_qs = None

        if stats_away and any(
            v is not None for v in [
                stats_away.points_q1, stats_away.points_q2,
                stats_away.points_q3, stats_away.points_q4,
            ]
        ):
            a_qs = QuarterScore(
                q1=stats_away.points_q1,
                q2=stats_away.points_q2,
                q3=stats_away.points_q3,
                q4=stats_away.points_q4,
            )
        else:
            a_qs = None
    else:
        box_home = box_away = None
        h_qs = a_qs = None

    # Real form from CoreMatch
    home_form_records = compute_team_form(db, "basketball", match.home_team_id, limit=5)
    away_form_records = compute_team_form(db, "basketball", match.away_team_id, limit=5)
    home_summary = form_summary(home_form_records)
    away_summary = form_summary(away_form_records)

    # H2H: prefer HL prematch data, fall back to DB
    extras = match.extras_json or {}
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

    # Derive current_period for live matches from quarter scores in DB stats
    live_current_period = None
    if status == "live":
        live_current_period = match.current_period
        if live_current_period is None:
            # Try to infer from BasketballTeamMatchStats quarters if available
            try:
                stats_row = db.query(BasketballTeamMatchStats).filter_by(
                    match_id=match.id, team_id=match.home_team_id
                ).first()
                if stats_row:
                    quarters_played = sum(1 for v in [
                        stats_row.points_q1, stats_row.points_q2, stats_row.points_q3, stats_row.points_q4
                    ] if v is not None and v > 0)
                    if quarters_played > 0:
                        live_current_period = quarters_played
            except Exception as exc:
                log.warning("live_period_detect_failed match=%s err=%s", match.id, exc)

    return BasketballMatchDetail(
        id=match.id,
        sport="basketball",
        league=league,
        season=match.season,
        kickoff_utc=match.kickoff_utc,
        status=status,
        home=ParticipantOut(id=match.home_team_id, name=home_name, logo_url=home_logo),
        away=ParticipantOut(id=match.away_team_id, name=away_name, logo_url=away_logo),
        home_score=match.home_score,
        away_score=match.away_score,
        outcome=match.outcome,
        live_clock=match.live_clock if status == "live" else None,
        current_period=live_current_period,
        current_state=match.current_state_json if status == "live" else None,
        probabilities=ProbabilitiesOut(home_win=round(p_home, 3), away_win=round(p_away, 3)),
        confidence=None,
        fair_odds=FairOddsOut(
            home_win=round(1 / p_home, 2) if p_home > 0 else None,
            away_win=round(1 / p_away, 2) if p_away > 0 else None,
        ),
        key_drivers=[
            KeyDriverOut(feature="ELO Differential", importance=0.5, value=round(r_home - r_away, 1)),
        ],
        model=None,
        elo_home=elo_home,
        elo_away=elo_away,
        match_info=BasketballMatchInfo(
            arena=match.venue,
            city=None,
            attendance=None,
            season_phase="regular",
            pace=None,
            home_quarters=h_qs,
            away_quarters=a_qs,
            home_record=None,
            away_record=None,
            home_streak=None,
            away_streak=None,
            home_home_record=None,
            away_away_record=None,
            referee_crew=[],
            overtime_periods=0,
        ),
        form_home=_build_basketball_form(match.home_team_id, home_name, home_form_records, home_summary),
        form_away=_build_basketball_form(match.away_team_id, away_name, away_form_records, away_summary),
        box_home=box_home,
        box_away=box_away,
        adv_home=(
            _adv_from_stats(stats_home, home_name) if is_finished and stats_home else None
        ),
        adv_away=(
            _adv_from_stats(stats_away, away_name) if is_finished and stats_away else None
        ),
        injuries_home=[],
        injuries_away=[],
        shots_home=[],
        shots_away=[],
        h2h=h2h_result,
        context={"venue_name": match.venue} if match.venue else None,
        data_completeness={
            "box_score": is_finished and (stats_home is not None or stats_away is not None),
            "lineup": False,
            "shot_chart": False,
            "advanced_stats": is_finished and (stats_home is not None or stats_away is not None),
            "elo_ratings": True,
            "h2h": True,
        },
        clutch_home=None,
        clutch_away=None,
        top_lineups_home=[],
        top_lineups_away=[],
        scoring_runs=[],
        referee=None,
        betting=None,
    )


# ─── Service ─────────────────────────────────────────────────────────────────

class BasketballMatchService(BaseMatchListService):

    def get_match_list(self, db, *, status=None, league=None, date_from=None, date_to=None, limit=50, offset=0):
        q = db.query(CoreMatch).filter(CoreMatch.sport == "basketball")
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
            elo_h = round(r_home, 1) if m.home_team_id in elo_map else None
            elo_a = round(r_away, 1) if m.away_team_id in elo_map else None
            p_home = _elo_win_prob(r_home, r_away, 35.0)
            items.append(BasketballMatchListItem(
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
                elo_home=elo_h,
                elo_away=elo_a,
                p_home=round(p_home, 3),
                p_away=round(1.0 - p_home, 3),
                confidence=None,
                home_back_to_back=False,
                away_back_to_back=False,
                odds_home=m.odds_home,
                odds_away=m.odds_away,
                home_logo=ht.logo_url if ht else None,
                away_logo=at.logo_url if at else None,
                league_logo=lg.logo_url if lg else None,
            ))
        return BasketballMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> BasketballMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "basketball":
            raise HTTPException(status_code=404, detail=f"Basketball match {match_id} not found")

        home_team = db.get(CoreTeam, match.home_team_id)
        away_team = db.get(CoreTeam, match.away_team_id)
        home_name = home_team.name if home_team else match.home_team_id
        away_name = away_team.name if away_team else match.away_team_id
        home_logo = home_team.logo_url if home_team else None
        away_logo = away_team.logo_url if away_team else None
        league = _league_name(db, match.league_id)

        return _build_basketball_detail(match, home_name, away_name, league, db,
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
