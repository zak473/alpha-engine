"""Hockey match service."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session

from api.sports.base.interfaces import BaseMatchListService

log = logging.getLogger(__name__)
from api.sports.hockey.schemas import (
    EloPanelOut,
    EloHistoryPoint,
    FairOddsOut,
    H2HRecordOut,
    HockeyMatchDetail,
    HockeyMatchListItem,
    HockeyMatchListResponse,
    HockeyTeamFormOut,
    HockeyTeamStatsOut,
    KeyDriverOut,
    ModelMetaOut,
    ParticipantOut,
    PeriodScore,
    ProbabilitiesOut,
)
from api.sports.base.queries import compute_team_form, form_from_hl, form_summary, h2h_from_hl
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
    _norm = {"H": "home_win", "A": "away_win", "D": "draw",
             "home_win": "home_win", "away_win": "away_win", "draw": "draw"}
    _flip = {"home_win": "away_win", "away_win": "home_win", "draw": "draw"}
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


# ─── Hockey-specific helpers ──────────────────────────────────────────────────

def _form_hockey(hl_matches: list[dict], team_name: str) -> HockeyTeamFormOut | None:
    raw = form_from_hl(hl_matches, team_name)
    if not raw:
        return None
    return HockeyTeamFormOut(
        team_name=team_name,
        wins=raw["wins"],
        draws=raw["draws"],
        losses=raw["losses"],
        form_pts=float(raw["form_pts"]),
        goals_scored_avg=raw.get("gf_avg"),
        goals_conceded_avg=raw.get("ga_avg"),
    )


def _form_from_db(db: Session, team_id: str, team_name: str) -> HockeyTeamFormOut | None:
    records = compute_team_form(db, "hockey", team_id, limit=10)
    if not records:
        return None
    s = form_summary(records)
    return HockeyTeamFormOut(
        team_name=team_name,
        wins=s["wins"],
        draws=s["draws"],
        losses=s["losses"],
        goals_scored_avg=s.get("avg_pts_for"),
        goals_conceded_avg=s.get("avg_pts_against"),
    )


def _parse_hockey_stats(stats_list: list, team_name: str) -> HockeyTeamStatsOut | None:
    """Parse a Highlightly statistics list into HockeyTeamStatsOut."""
    if not stats_list:
        return None
    parsed: dict[str, str | None] = {}
    for s in stats_list:
        if isinstance(s, dict) and s.get("type"):
            parsed[s["type"].lower().strip()] = s.get("value")

    def _int(key: str) -> int | None:
        v = parsed.get(key)
        try:
            return int(str(v).replace("%", "").strip()) if v not in (None, "") else None
        except (ValueError, TypeError):
            return None

    def _float(key: str) -> float | None:
        v = parsed.get(key)
        try:
            return float(str(v).replace("%", "").strip()) if v not in (None, "") else None
        except (ValueError, TypeError):
            return None

    return HockeyTeamStatsOut(
        team_name=team_name,
        shots=_int("shots") or _int("total shots"),
        shots_on_goal=_int("shots on goal") or _int("shots on target"),
        hits=_int("hits"),
        blocked_shots=_int("blocked shots") or _int("blocked"),
        faceoff_wins=_int("faceoff wins") or _int("faceoffs won"),
        faceoff_pct=_float("faceoff %") or _float("faceoff percentage"),
        power_plays=_int("power plays"),
        power_play_goals=_int("power play goals") or _int("pp goals"),
        penalty_minutes=_int("penalty minutes") or _int("pim"),
    )


def _extract_hockey_stats(extras: dict) -> tuple[HockeyTeamStatsOut | None, HockeyTeamStatsOut | None]:
    raw = extras.get("statistics") or extras.get("stats")
    if not raw:
        return None, None
    home_list: list = []
    away_list: list = []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            side = str(item.get("team") or item.get("side") or "").lower()
            stats = item.get("statistics") or item.get("stats") or []
            if "home" in side or side == "1":
                home_list = stats
            elif "away" in side or side == "2":
                away_list = stats
    elif isinstance(raw, dict):
        home_raw = raw.get("home") or raw.get("homeTeam")
        away_raw = raw.get("away") or raw.get("awayTeam")
        home_list = home_raw if isinstance(home_raw, list) else []
        away_list = away_raw if isinstance(away_raw, list) else []
    return home_list, away_list  # type: ignore[return-value]


def _parse_period_scores(extras: dict, side: str) -> PeriodScore | None:
    """Parse period-by-period scores from extras_json."""
    periods = extras.get("periods") or extras.get("periodScores") or extras.get("period_scores")
    if not periods:
        return None
    # Shape: [{"period": 1, "home": 2, "away": 1}, ...] or {"1": {"home": 2, "away": 1}, ...}
    p1 = p2 = p3 = ot = so = None
    if isinstance(periods, list):
        for p in periods:
            num = p.get("period") or p.get("number")
            val = p.get(side)
            if num == 1: p1 = val
            elif num == 2: p2 = val
            elif num == 3: p3 = val
            elif num in (4, "OT", "ot"): ot = val
            elif str(num).lower() in ("so", "5", "shootout"): so = val
    elif isinstance(periods, dict):
        for k, v in periods.items():
            val = v.get(side) if isinstance(v, dict) else None
            if str(k) == "1": p1 = val
            elif str(k) == "2": p2 = val
            elif str(k) == "3": p3 = val
            elif str(k).lower() in ("4", "ot"): ot = val
            elif str(k).lower() in ("so", "5", "shootout"): so = val
    if p1 is None and p2 is None and p3 is None:
        return None
    return PeriodScore(p1=p1, p2=p2, p3=p3, ot=ot, so=so)


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

        # League names + logos
        league_ids = {m.league_id for m in matches if m.league_id}
        league_objs = {lg.id: lg for lg in db.query(CoreLeague).filter(CoreLeague.id.in_(league_ids)).all()} if league_ids else {}

        # Team names + logos
        all_team_ids = {m.home_team_id for m in matches} | {m.away_team_id for m in matches}
        team_objs = {t.id: t for t in db.query(CoreTeam).filter(CoreTeam.id.in_(all_team_ids)).all()} if all_team_ids else {}

        items = []
        for m in matches:
            pred = pred_map.get(m.id)
            elo_h = elo_map.get(m.home_team_id)
            elo_a = elo_map.get(m.away_team_id)
            p_home = pred.p_home if pred else None
            p_away = pred.p_away if pred else None
            confidence = int(round(max(p_home or 0, p_away or 0) * 100)) if (p_home or p_away) else None

            lg_obj = league_objs.get(m.league_id)
            ht_obj = team_objs.get(m.home_team_id)
            at_obj = team_objs.get(m.away_team_id)
            items.append(HockeyMatchListItem(
                id=m.id,
                league=lg_obj.name if lg_obj else "Unknown",
                season=m.season,
                kickoff_utc=m.kickoff_utc,
                status=m.status,
                home_id=m.home_team_id,
                home_name=ht_obj.name if ht_obj else m.home_team_id,
                away_id=m.away_team_id,
                away_name=at_obj.name if at_obj else m.away_team_id,
                home_score=m.home_score,
                away_score=m.away_score,
                outcome=m.outcome,
                elo_home=round(elo_h, 1) if elo_h else None,
                elo_away=round(elo_a, 1) if elo_a else None,
                p_home=round(p_home, 3) if p_home else None,
                p_away=round(p_away, 3) if p_away else None,
                confidence=confidence,
                odds_home=m.odds_home,
                odds_away=m.odds_away,
                home_logo=ht_obj.logo_url if ht_obj else None,
                away_logo=at_obj.logo_url if at_obj else None,
                league_logo=lg_obj.logo_url if lg_obj else None,
            ))

        return HockeyMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> HockeyMatchDetail:
        m = db.query(CoreMatch).filter(CoreMatch.id == match_id, CoreMatch.sport == "hockey").first()
        if not m:
            raise HTTPException(status_code=404, detail="Hockey match not found")

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

        # Predictions
        from db.models.mvp import PredMatch
        pred = db.query(PredMatch).filter(PredMatch.match_id == match_id).order_by(PredMatch.created_at.desc()).first()

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
                fair_odds = FairOddsOut(
                    home_win=round(1 / p_home, 2),
                    away_win=round(1 / p_away, 2),
                )
            key_drivers = [
                KeyDriverOut(feature=d.get("feature", ""), value=d.get("value"), importance=d.get("importance", 0.0))
                for d in (pred.key_drivers or [])
            ]
        elif elo_h and elo_a:
            # ELO-derived fallback probabilities
            r_diff = elo_h.rating - elo_a.rating + 30.0  # 30-pt home advantage
            p_home = round(1.0 / (1.0 + math.pow(10, -r_diff / 400.0)), 4)
            p_away = round(1.0 - p_home, 4)
            probs = ProbabilitiesOut(home_win=p_home, away_win=p_away)
            confidence = int(round(max(0, min(100, (max(p_home, p_away) - 0.5) * 200))))
            if p_home > 0 and p_away > 0:
                fair_odds = FairOddsOut(
                    home_win=round(1 / p_home, 2),
                    away_win=round(1 / p_away, 2),
                )
            key_drivers = [
                KeyDriverOut(feature="ELO Differential", importance=1.0, value=round(elo_h.rating - elo_a.rating, 1)),
            ]

        # extras_json contains HL enrichment: stats, form, h2h, period scores
        extras = m.extras_json or {}

        # H2H: prefer HL prematch data, fall back to DB
        _hl_h2h_raw = h2h_from_hl(extras.get("headtohead") or [], home_name, away_name)
        if _hl_h2h_raw:
            h2h = H2HRecordOut(
                total_matches=_hl_h2h_raw["total_matches"],
                home_wins=_hl_h2h_raw["home_wins"],
                away_wins=_hl_h2h_raw["away_wins"],
                recent_matches=[
                    {
                        "date": entry.get("date"),
                        "home_score": entry.get("home_score"),
                        "away_score": entry.get("away_score"),
                        "outcome": entry.get("outcome"),
                    }
                    for entry in _hl_h2h_raw.get("recent_matches", [])
                ],
            )
        else:
            h2h = _h2h(db, m.home_team_id, m.away_team_id)

        # Form: prefer HL lastfivegames, fall back to DB
        form_h = (
            _form_hockey(extras.get("lastfivegames_home") or [], home_name)
            or _form_from_db(db, m.home_team_id, home_name)
        )
        form_a = (
            _form_hockey(extras.get("lastfivegames_away") or [], away_name)
            or _form_from_db(db, m.away_team_id, away_name)
        )

        # Live/post-match statistics
        home_stats_list, away_stats_list = _extract_hockey_stats(extras)
        stats_h = _parse_hockey_stats(home_stats_list, home_name) if home_stats_list else None
        stats_a = _parse_hockey_stats(away_stats_list, away_name) if away_stats_list else None

        # Period scores
        home_periods = _parse_period_scores(extras, "home")
        away_periods = _parse_period_scores(extras, "away")

        # Current period from extras or live_clock
        current_period: int | None = extras.get("current_period") or extras.get("period")

        return HockeyMatchDetail(
            id=m.id,
            sport="hockey",
            league=league,
            season=m.season,
            kickoff_utc=m.kickoff_utc,
            status=m.status,
            home=ParticipantOut(id=m.home_team_id, name=home_name, logo_url=home_logo),
            away=ParticipantOut(id=m.away_team_id, name=away_name, logo_url=away_logo),
            home_score=m.home_score,
            away_score=m.away_score,
            outcome=m.outcome,
            live_clock=m.live_clock if hasattr(m, "live_clock") else None,
            current_period=current_period,
            home_periods=home_periods,
            away_periods=away_periods,
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
                "source": "highlightly",
                "has_elo": elo_h is not None,
                "has_pred": pred is not None,
                "has_stats": stats_h is not None,
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
