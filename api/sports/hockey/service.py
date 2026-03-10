"""Hockey match service."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session

from api.sports.base.interfaces import BaseMatchListService
from api.sports.hockey.schemas import (
    EloPanelOut,
    EloHistoryPoint,
    FairOddsOut,
    H2HRecordOut,
    HockeyMatchDetail,
    HockeyMatchListItem,
    HockeyMatchListResponse,
    KeyDriverOut,
    ModelMetaOut,
    ParticipantOut,
    ProbabilitiesOut,
)
from db.models.mvp import CoreLeague, CoreMatch, CoreTeam, RatingEloTeam


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _name(db: Session, team_id: str) -> str:
    t = db.get(CoreTeam, team_id)
    return t.name if t else team_id


def _league_name(db: Session, league_id: str) -> str:
    lg = db.get(CoreLeague, league_id)
    return lg.name if lg else "Unknown League"


def _elo_snapshot(db: Session, team_id: str, name: str) -> Optional[EloPanelOut]:
    rows = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == team_id, RatingEloTeam.context == "global")
        .order_by(RatingEloTeam.rated_at.desc())
        .limit(1)
        .all()
    )
    if not rows:
        return None
    r = rows[0]
    change = round(r.rating_after - r.rating_before, 1) if r.rating_before else None
    return EloPanelOut(
        team_id=team_id,
        team_name=name,
        rating=round(r.rating_after, 1),
        rating_change=change,
    )


def _h2h(db: Session, home_id: str, away_id: str) -> H2HRecordOut:
    from sqlalchemy import or_, and_
    rows = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "hockey",
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
    home_wins = sum(1 for m in rows if (m.home_team_id == home_id and m.outcome == "H") or (m.away_team_id == home_id and m.outcome == "A"))
    away_wins = sum(1 for m in rows if (m.home_team_id == away_id and m.outcome == "H") or (m.away_team_id == away_id and m.outcome == "A"))
    recent = []
    for m in rows[:5]:
        recent.append({
            "id": m.id,
            "date": m.kickoff_utc.isoformat() if m.kickoff_utc else "",
            "home": _name(db, m.home_team_id),
            "away": _name(db, m.away_team_id),
            "score": f"{m.home_score or 0} - {m.away_score or 0}",
            "outcome": m.outcome,
        })
    return H2HRecordOut(total_matches=len(rows), home_wins=home_wins, away_wins=away_wins, recent_matches=recent)


# ─── Service ──────────────────────────────────────────────────────────────────

class HockeyMatchService(BaseMatchListService):

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
    ) -> HockeyMatchListResponse:
        q = db.query(CoreMatch).filter(CoreMatch.sport == "hockey")

        if status:
            q = q.filter(CoreMatch.status == status)
        if league:
            from sqlalchemy import or_
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

        status_order = case(
            (CoreMatch.status == "live",      0),
            (CoreMatch.status == "scheduled", 1),
            (CoreMatch.status == "finished",  2),
            else_=3,
        )
        q = q.order_by(status_order, CoreMatch.kickoff_utc.asc())

        total = q.count()
        matches = q.offset(offset).limit(limit).all()

        # Batch-load ELO ratings
        team_ids = {m.home_team_id for m in matches} | {m.away_team_id for m in matches}
        from sqlalchemy import func
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
        from db.models.mvp import PredMatch
        match_ids = [m.id for m in matches]
        preds = db.query(PredMatch).filter(PredMatch.match_id.in_(match_ids)).all()
        pred_map = {p.match_id: p for p in preds}

        # League names
        league_ids = {m.league_id for m in matches if m.league_id}
        leagues = {lg.id: lg.name for lg in db.query(CoreLeague).filter(CoreLeague.id.in_(league_ids)).all()} if league_ids else {}

        # Team names
        all_team_ids = {m.home_team_id for m in matches} | {m.away_team_id for m in matches}
        teams = {t.id: t.name for t in db.query(CoreTeam).filter(CoreTeam.id.in_(all_team_ids)).all()} if all_team_ids else {}

        items = []
        for m in matches:
            pred = pred_map.get(m.id)
            elo_h = elo_map.get(m.home_team_id)
            elo_a = elo_map.get(m.away_team_id)
            p_home = pred.prob_home if pred else None
            p_away = pred.prob_away if pred else None
            confidence = int(round(max(p_home or 0, p_away or 0) * 100)) if (p_home or p_away) else None

            items.append(HockeyMatchListItem(
                id=m.id,
                league=leagues.get(m.league_id, "Unknown"),
                season=m.season,
                kickoff_utc=m.kickoff_utc,
                status=m.status,
                home_id=m.home_team_id,
                home_name=teams.get(m.home_team_id, m.home_team_id),
                away_id=m.away_team_id,
                away_name=teams.get(m.away_team_id, m.away_team_id),
                home_score=m.home_score,
                away_score=m.away_score,
                outcome=m.outcome,
                elo_home=round(elo_h, 1) if elo_h else None,
                elo_away=round(elo_a, 1) if elo_a else None,
                p_home=round(p_home, 3) if p_home else None,
                p_away=round(p_away, 3) if p_away else None,
                confidence=confidence,
            ))

        return HockeyMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> HockeyMatchDetail:
        m = db.query(CoreMatch).filter(CoreMatch.id == match_id, CoreMatch.sport == "hockey").first()
        if not m:
            raise HTTPException(status_code=404, detail="Hockey match not found")

        home_name = _name(db, m.home_team_id)
        away_name = _name(db, m.away_team_id)
        league = _league_name(db, m.league_id) if m.league_id else "Unknown League"

        # ELO
        elo_h = _elo_snapshot(db, m.home_team_id, home_name)
        elo_a = _elo_snapshot(db, m.away_team_id, away_name)

        # Predictions
        from db.models.mvp import PredMatch
        pred = db.query(PredMatch).filter(PredMatch.match_id == match_id).order_by(PredMatch.generated_at.desc()).first()

        probs = None
        fair_odds = None
        confidence = None
        key_drivers = None
        model_meta = None
        if pred:
            probs = ProbabilitiesOut(home_win=pred.prob_home or 0.0, away_win=pred.prob_away or 0.0)
            confidence = int(round(max(pred.prob_home or 0, pred.prob_away or 0) * 100))
            if pred.prob_home and pred.prob_away:
                fair_odds = FairOddsOut(
                    home_win=round(1 / pred.prob_home, 2) if pred.prob_home > 0 else None,
                    away_win=round(1 / pred.prob_away, 2) if pred.prob_away > 0 else None,
                )

        h2h = _h2h(db, m.home_team_id, m.away_team_id)

        return HockeyMatchDetail(
            id=m.id,
            sport="hockey",
            league=league,
            season=m.season,
            kickoff_utc=m.kickoff_utc,
            status=m.status,
            home=ParticipantOut(id=m.home_team_id, name=home_name),
            away=ParticipantOut(id=m.away_team_id, name=away_name),
            home_score=m.home_score,
            away_score=m.away_score,
            outcome=m.outcome,
            probabilities=probs,
            confidence=confidence,
            fair_odds=fair_odds,
            key_drivers=key_drivers,
            model=model_meta,
            elo_home=elo_h,
            elo_away=elo_a,
            h2h=h2h,
            data_completeness={"source": "highlightly", "has_elo": elo_h is not None, "has_pred": pred is not None},
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
