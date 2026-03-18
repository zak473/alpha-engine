"""Basketball match service."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session

from api.sports.base.interfaces import BaseMatchListService
from api.sports.basketball.schemas import (
    BasketballMatchDetail,
    BasketballMatchListItem,
    BasketballMatchListResponse,
    BasketballTeamFormOut,
    BasketballTeamStatsOut,
    EloPanelOut,
    EloHistoryPoint,
    FairOddsOut,
    H2HRecordOut,
    KeyDriverOut,
    ModelMetaOut,
    ParticipantOut,
    ProbabilitiesOut,
    QuarterScore,
)
from api.sports.base.queries import compute_team_form, form_from_hl, form_summary, h2h_from_hl
from db.models.basketball import BasketballTeamMatchStats
from db.models.mvp import CoreLeague, CoreMatch, CoreTeam, PredMatch, RatingEloTeam

log = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _find_team_by_name(db: Session, name: str, sport: str) -> Optional[CoreTeam]:
    """Find the best matching CoreTeam by display name."""
    teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{name}%")).all()
    if not teams:
        words = [w for w in name.split() if len(w) > 3]
        for word in words:
            teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{word}%")).all()
            if teams:
                break
    if not teams:
        return None
    prefix = "nba" if sport == "basketball" else f"hl-{sport}"
    for t in teams:
        if t.provider_id and t.provider_id.startswith(prefix):
            return t
    return teams[0]


def _league_name(db: Session, league_id: str) -> str:
    lg = db.get(CoreLeague, league_id)
    return lg.name if lg else "Unknown League"


def _elo_snapshot(db: Session, team_id: str, name: str) -> Optional[EloPanelOut]:
    row = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == team_id, RatingEloTeam.context == "global")
        .order_by(RatingEloTeam.rated_at.desc())
        .first()
    )
    if not row:
        return None
    change = round(row.rating_after - row.rating_before, 1) if row.rating_before else None
    return EloPanelOut(
        team_id=team_id,
        team_name=name,
        rating=round(row.rating_after, 1),
        rating_change=change,
    )


def _h2h(db: Session, home_id: str, away_id: str) -> H2HRecordOut:
    from sqlalchemy import or_, and_
    rows = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "basketball",
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
    _norm = {"H": "home_win", "A": "away_win", "home_win": "home_win", "away_win": "away_win"}
    _flip = {"home_win": "away_win", "away_win": "home_win"}
    home_wins = away_wins = 0
    recent = []
    for m in rows:
        if m.home_team_id == home_id:
            result = _norm.get(m.outcome or "", "")
            hs, as_ = m.home_score, m.away_score
        else:
            result = _flip.get(_norm.get(m.outcome or "", ""), "")
            hs, as_ = m.away_score, m.home_score
        if result == "home_win":
            home_wins += 1
        elif result == "away_win":
            away_wins += 1
        if len(recent) < 5:
            recent.append({
                "date": m.kickoff_utc.isoformat() if m.kickoff_utc else "",
                "home_score": hs,
                "away_score": as_,
                "outcome": result,
            })
    return H2HRecordOut(total_matches=len(rows), home_wins=home_wins, away_wins=away_wins, recent_matches=recent)


def _form_basketball(hl_matches: list[dict], team_name: str) -> Optional[BasketballTeamFormOut]:
    raw = form_from_hl(hl_matches, team_name)
    if not raw:
        return None
    return BasketballTeamFormOut(
        team_name=team_name,
        wins=raw["wins"],
        draws=raw.get("draws", 0),
        losses=raw["losses"],
        form_pts=float(raw["form_pts"]),
        points_scored_avg=raw.get("gf_avg"),
        points_conceded_avg=raw.get("ga_avg"),
    )


def _form_from_db(db: Session, team_id: str, team_name: str) -> Optional[BasketballTeamFormOut]:
    records = compute_team_form(db, "basketball", team_id, limit=10)
    if not records:
        return None
    s = form_summary(records)
    return BasketballTeamFormOut(
        team_name=team_name,
        wins=s["wins"],
        draws=s.get("draws", 0),
        losses=s["losses"],
        points_scored_avg=s.get("avg_pts_for"),
        points_conceded_avg=s.get("avg_pts_against"),
    )


def _stats_from_db(row: BasketballTeamMatchStats, team_name: str) -> BasketballTeamStatsOut:
    return BasketballTeamStatsOut(
        team_name=team_name,
        points=row.points,
        fg_made=row.fg_made,
        fg_attempted=row.fg_attempted,
        fg_pct=row.fg_pct,
        fg3_made=row.fg3_made,
        fg3_attempted=row.fg3_attempted,
        fg3_pct=row.fg3_pct,
        ft_made=row.ft_made,
        ft_attempted=row.ft_attempted,
        ft_pct=row.ft_pct,
        rebounds_total=row.rebounds_total,
        rebounds_offensive=row.rebounds_offensive,
        rebounds_defensive=row.rebounds_defensive,
        assists=row.assists,
        turnovers=row.turnovers,
        steals=row.steals,
        blocks=row.blocks,
        fouls=row.fouls,
        plus_minus=row.plus_minus,
        assists_to_turnover=row.assists_to_turnover,
        pace=row.pace,
        offensive_rating=row.offensive_rating,
        defensive_rating=row.defensive_rating,
        net_rating=row.net_rating,
    )


def _quarter_score(row: BasketballTeamMatchStats) -> Optional[QuarterScore]:
    if not any([row.points_q1, row.points_q2, row.points_q3, row.points_q4]):
        return None
    return QuarterScore(
        q1=row.points_q1,
        q2=row.points_q2,
        q3=row.points_q3,
        q4=row.points_q4,
        ot=row.points_ot,
    )


# ─── Service ──────────────────────────────────────────────────────────────────

class BasketballMatchService(BaseMatchListService):

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
    ) -> BasketballMatchListResponse:
        q = db.query(CoreMatch).filter(CoreMatch.sport == "basketball")
        if status:
            q = q.filter(CoreMatch.status == status)
        if league:
            q = q.join(CoreLeague, CoreLeague.id == CoreMatch.league_id, isouter=True).filter(
                CoreLeague.name.ilike(f"%{league}%")
            )
        if date_from:
            try:
                q = q.filter(CoreMatch.kickoff_utc >= datetime.fromisoformat(date_from))
            except ValueError:
                pass
        if date_to:
            try:
                q = q.filter(CoreMatch.kickoff_utc <= datetime.fromisoformat(date_to))
            except ValueError:
                pass

        status_order = case({"live": 0, "scheduled": 1, "finished": 2}, value=CoreMatch.status, else_=3)
        q = q.order_by(status_order, CoreMatch.kickoff_utc.asc())

        total = q.count()
        matches = q.offset(offset).limit(limit).all()

        # Batch-load ELO
        from sqlalchemy import func
        team_ids = {m.home_team_id for m in matches} | {m.away_team_id for m in matches}
        elo_subq = (
            db.query(RatingEloTeam.team_id, func.max(RatingEloTeam.rated_at).label("max_at"))
            .filter(RatingEloTeam.team_id.in_(team_ids), RatingEloTeam.context == "global")
            .group_by(RatingEloTeam.team_id)
            .subquery()
        )
        elo_rows = (
            db.query(RatingEloTeam)
            .join(elo_subq, (RatingEloTeam.team_id == elo_subq.c.team_id) & (RatingEloTeam.rated_at == elo_subq.c.max_at))
            .all()
        )
        elo_map: dict[str, float] = {r.team_id: r.rating_after for r in elo_rows}

        # Batch-load predictions
        match_ids = [m.id for m in matches]
        preds = db.query(PredMatch).filter(PredMatch.match_id.in_(match_ids)).all()
        pred_map = {p.match_id: p for p in preds}

        # Batch-load teams / leagues
        team_objs = {t.id: t for t in db.query(CoreTeam).filter(CoreTeam.id.in_(team_ids)).all()} if team_ids else {}
        league_ids = {m.league_id for m in matches if m.league_id}
        league_objs = {lg.id: lg for lg in db.query(CoreLeague).filter(CoreLeague.id.in_(league_ids)).all()} if league_ids else {}

        items = []
        for m in matches:
            pred = pred_map.get(m.id)
            elo_h = elo_map.get(m.home_team_id)
            elo_a = elo_map.get(m.away_team_id)
            if pred:
                p_home = pred.p_home
                p_away = pred.p_away
                confidence = pred.confidence
            else:
                r_h = elo_h or 1500.0
                r_a = elo_a or 1500.0
                p_home = round(1.0 / (1.0 + math.pow(10, -(r_h - r_a + 50.0) / 400.0)), 3)
                p_away = round(1.0 - p_home, 3)
                confidence = None
            ht = team_objs.get(m.home_team_id)
            at = team_objs.get(m.away_team_id)
            lg = league_objs.get(m.league_id)
            items.append(BasketballMatchListItem(
                id=m.id,
                league=lg.name if lg else "Unknown",
                season=m.season,
                kickoff_utc=m.kickoff_utc,
                status=m.status,
                home_id=m.home_team_id,
                home_name=ht.name if ht else m.home_team_id,
                away_id=m.away_team_id,
                away_name=at.name if at else m.away_team_id,
                home_score=m.home_score,
                away_score=m.away_score,
                outcome=m.outcome,
                live_clock=m.live_clock if m.status == "live" else None,
                current_period=m.current_period if m.status == "live" else None,
                elo_home=round(elo_h, 1) if elo_h else None,
                elo_away=round(elo_a, 1) if elo_a else None,
                p_home=round(p_home, 3) if p_home else None,
                p_away=round(p_away, 3) if p_away else None,
                confidence=confidence,
                odds_home=m.odds_home,
                odds_away=m.odds_away,
                home_logo=ht.logo_url if ht else None,
                away_logo=at.logo_url if at else None,
                league_logo=lg.logo_url if lg else None,
            ))

        return BasketballMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> BasketballMatchDetail:
        m = db.query(CoreMatch).filter(CoreMatch.id == match_id, CoreMatch.sport == "basketball").first()
        if not m:
            raise HTTPException(status_code=404, detail="Basketball match not found")

        home_team = db.get(CoreTeam, m.home_team_id)
        away_team = db.get(CoreTeam, m.away_team_id)
        home_name = home_team.name if home_team else m.home_team_id
        away_name = away_team.name if away_team else m.away_team_id
        home_logo = home_team.logo_url if home_team else None
        away_logo = away_team.logo_url if away_team else None
        league_obj = db.get(CoreLeague, m.league_id) if m.league_id else None
        league = league_obj.name if league_obj else "Unknown League"

        # ELO
        elo_h = _elo_snapshot(db, m.home_team_id, home_name)
        elo_a = _elo_snapshot(db, m.away_team_id, away_name)

        # Prediction (latest)
        pred = (
            db.query(PredMatch)
            .filter(PredMatch.match_id == match_id)
            .order_by(PredMatch.created_at.desc())
            .first()
        )

        probs = None
        fair_odds = None
        confidence = None
        key_drivers = None
        model_meta = None

        if pred:
            p_home = pred.p_home or 0.0
            p_away = pred.p_away or 0.0
            probs = ProbabilitiesOut(home_win=p_home, away_win=p_away)
            confidence = int(round(max(0, min(100, (max(p_home, p_away) - 0.5) * 200))))
            if p_home > 0 and p_away > 0:
                fair_odds = FairOddsOut(home_win=round(1 / p_home, 2), away_win=round(1 / p_away, 2))
            key_drivers = [
                KeyDriverOut(feature=d.get("feature", ""), value=d.get("value"), importance=d.get("importance", 0.0))
                for d in (pred.key_drivers or [])
            ]
        else:
            # ELO with 1500 default — ensures probabilities always render
            r_h_val = elo_h.rating if elo_h else 1500.0
            r_a_val = elo_a.rating if elo_a else 1500.0
            r_diff = r_h_val - r_a_val + 50.0  # basketball home advantage
            p_home = round(1.0 / (1.0 + math.pow(10, -r_diff / 400.0)), 4)
            p_away = round(1.0 - p_home, 4)
            probs = ProbabilitiesOut(home_win=p_home, away_win=p_away)
            confidence = int(round(max(0, min(100, (max(p_home, p_away) - 0.5) * 200))))
            if p_home > 0 and p_away > 0:
                fair_odds = FairOddsOut(home_win=round(1 / p_home, 2), away_win=round(1 / p_away, 2))
            key_drivers = [
                KeyDriverOut(feature="ELO Differential", importance=1.0, value=round(r_h_val - r_a_val, 1)),
            ]

        # Box score stats
        stats_home_row = db.query(BasketballTeamMatchStats).filter_by(
            match_id=m.id, team_id=m.home_team_id
        ).first()
        stats_away_row = db.query(BasketballTeamMatchStats).filter_by(
            match_id=m.id, team_id=m.away_team_id
        ).first()

        stats_h = _stats_from_db(stats_home_row, home_name) if stats_home_row else None
        stats_a = _stats_from_db(stats_away_row, away_name) if stats_away_row else None
        home_quarters = _quarter_score(stats_home_row) if stats_home_row else None
        away_quarters = _quarter_score(stats_away_row) if stats_away_row else None

        # Form
        extras = m.extras_json or {}
        form_h = (
            _form_basketball(extras.get("lastfivegames_home") or [], home_name)
            or _form_from_db(db, m.home_team_id, home_name)
        )
        form_a = (
            _form_basketball(extras.get("lastfivegames_away") or [], away_name)
            or _form_from_db(db, m.away_team_id, away_name)
        )

        # H2H
        _hl_h2h_raw = h2h_from_hl(extras.get("headtohead") or [], home_name, away_name)
        if _hl_h2h_raw:
            h2h = H2HRecordOut(
                total_matches=_hl_h2h_raw["total_matches"],
                home_wins=_hl_h2h_raw["home_wins"],
                away_wins=_hl_h2h_raw["away_wins"],
                recent_matches=[
                    {
                        "date": e.get("date"),
                        "home_score": e.get("home_score"),
                        "away_score": e.get("away_score"),
                        "outcome": e.get("outcome"),
                    }
                    for e in _hl_h2h_raw.get("recent_matches", [])
                ],
            )
        else:
            h2h = _h2h(db, m.home_team_id, m.away_team_id)

        return BasketballMatchDetail(
            id=m.id,
            sport="basketball",
            league=league,
            season=m.season,
            kickoff_utc=m.kickoff_utc,
            status=m.status,
            home=ParticipantOut(id=m.home_team_id, name=home_name, logo_url=home_logo),
            away=ParticipantOut(id=m.away_team_id, name=away_name, logo_url=away_logo),
            home_score=m.home_score,
            away_score=m.away_score,
            outcome=m.outcome,
            live_clock=m.live_clock if m.status == "live" else None,
            current_period=m.current_period,
            home_quarters=home_quarters,
            away_quarters=away_quarters,
            probabilities=probs,
            confidence=confidence,
            fair_odds=fair_odds,
            key_drivers=key_drivers,
            model=model_meta,
            elo_home=elo_h,
            elo_away=elo_a,
            form_home=form_h,
            form_away=form_a,
            stats_home=stats_h,
            stats_away=stats_a,
            h2h=h2h,
            odds_home=m.odds_home,
            odds_away=m.odds_away,
            context={"venue_name": m.venue} if m.venue else None,
            data_completeness={
                "has_elo": elo_h is not None,
                "has_pred": pred is not None,
                "has_stats": stats_h is not None,
                "has_form": form_h is not None,
            },
        )

    def preview_match(self, home_name: str, away_name: str, db: Session) -> BasketballMatchDetail:
        """ELO-based preview for a match not yet in the DB."""
        home_team = _find_team_by_name(db, home_name, "basketball")
        away_team = _find_team_by_name(db, away_name, "basketball")

        home_id = home_team.id if home_team else f"preview-home-{home_name.lower().replace(' ', '-')}"
        away_id = away_team.id if away_team else f"preview-away-{away_name.lower().replace(' ', '-')}"
        hname = home_team.name if home_team else home_name
        aname = away_team.name if away_team else away_name
        home_logo = home_team.logo_url if home_team else None
        away_logo = away_team.logo_url if away_team else None

        elo_h = _elo_snapshot(db, home_id, hname) if home_team else None
        elo_a = _elo_snapshot(db, away_id, aname) if away_team else None

        r_h_val = elo_h.rating if elo_h else 1500.0
        r_a_val = elo_a.rating if elo_a else 1500.0
        r_diff = r_h_val - r_a_val + 50.0
        p_home = round(1.0 / (1.0 + math.pow(10, -r_diff / 400.0)), 4)
        p_away = round(1.0 - p_home, 4)
        probs = ProbabilitiesOut(home_win=p_home, away_win=p_away)
        fair_odds = FairOddsOut(home_win=round(1 / p_home, 2), away_win=round(1 / p_away, 2))
        key_drivers = [KeyDriverOut(feature="ELO Differential", importance=1.0, value=round(r_h_val - r_a_val, 1))]

        h2h = _h2h(db, home_id, away_id) if home_team and away_team else H2HRecordOut(total_matches=0, home_wins=0, away_wins=0, recent_matches=[])
        form_h = _form_from_db(db, home_id, hname) if home_team else None
        form_a = _form_from_db(db, away_id, aname) if away_team else None

        return BasketballMatchDetail(
            id=f"preview-{home_id}-{away_id}",
            sport="basketball",
            league="NBA",
            season=None,
            kickoff_utc=None,
            status="scheduled",
            home=ParticipantOut(id=home_id, name=hname, logo_url=home_logo),
            away=ParticipantOut(id=away_id, name=aname, logo_url=away_logo),
            probabilities=probs,
            fair_odds=fair_odds,
            key_drivers=key_drivers,
            elo_home=elo_h,
            elo_away=elo_a,
            form_home=form_h,
            form_away=form_a,
            h2h=h2h,
            data_completeness={
                "has_elo": elo_h is not None,
                "has_pred": False,
                "has_stats": False,
                "has_form": form_h is not None,
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
            EloHistoryPoint(
                date=r.rated_at.strftime("%Y-%m-%d") if r.rated_at else "",
                rating=round(r.rating_after, 1),
                match_id=r.match_id,
            )
            for r in reversed(rows)
        ]
