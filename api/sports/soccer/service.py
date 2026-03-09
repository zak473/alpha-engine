"""
Soccer match service layer.

Provides:
    get_match_list()   — paginated list with ELO + basic prediction data
    get_match_detail() — full match detail assembled from multiple tables
"""

from __future__ import annotations

from datetime import datetime
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
    KeyDriverOut,
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
)
from db.models.mvp import (
    CoreLeague,
    CoreMatch,
    CoreTeam,
    CoreTeamMatchStats,
    FeatSoccerMatch,
    ModelRegistry,
    PredMatch,
    RatingEloTeam,
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
        .limit(2)
        .all()
    )
    if not rows:
        return None
    latest = rows[0]
    change = None
    if len(rows) == 2:
        change = round(latest.rating_after - rows[1].rating_after, 1)
    return EloSnapshotOut(
        team_id=team_id,
        team_name=team_name,
        rating=round(latest.rating_after, 1),
        rating_change=change,
    )


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
            result = _norm.get(m.outcome or "", "draw")
            home_score, away_score = m.home_score, m.away_score
        else:
            # Swap perspective
            result = _flip.get(_norm.get(m.outcome or "", "draw"), "draw")
            home_score, away_score = m.away_score, m.home_score

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
        home_form_rank=None,
        away_form_rank=None,
    )



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
        live_registry = db.query(ModelRegistry).filter_by(is_live=True).first()
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

        items = []
        for m in rows:
            league_name = _league_name(db, m.league_id)
            home_name = _team_name(db, m.home_team_id)
            away_name = _team_name(db, m.away_team_id)
            pred = pred_map.get(m.id)
            feat = feat_map.get(m.id)

            items.append(SoccerMatchListItem(
                id=m.id,
                league=league_name,
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
                elo_home=round(feat.elo_home, 1) if feat and feat.elo_home else None,
                elo_away=round(feat.elo_away, 1) if feat and feat.elo_away else None,
                elo_diff=round(feat.elo_diff, 1) if feat and feat.elo_diff else None,
                confidence=pred.confidence if pred else None,
                p_home=round(pred.p_home, 4) if pred else None,
                p_draw=round(pred.p_draw, 4) if pred else None,
                p_away=round(pred.p_away, 4) if pred else None,
            ))

        return SoccerMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> SoccerMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "soccer":
            raise HTTPException(status_code=404, detail=f"Soccer match {match_id} not found")

        home_name = _team_name(db, match.home_team_id)
        away_name = _team_name(db, match.away_team_id)
        league_name = _league_name(db, match.league_id)

        # Prediction
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
        if probabilities is None and elo_home and elo_away:
            HOME_ADV = 65.0  # soccer home advantage in ELO points
            r_h = elo_home.rating + HOME_ADV
            r_a = elo_away.rating
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

        return SoccerMatchDetail(
            id=match.id,
            sport="soccer",
            league=league_name,
            season=match.season,
            kickoff_utc=match.kickoff_utc,
            status=match.status,
            home=ParticipantOut(id=match.home_team_id, name=home_name),
            away=ParticipantOut(id=match.away_team_id, name=away_name),
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
            form_home=_form_stats(feat, home_name, "home", match_id),
            form_away=_form_stats(feat, away_name, "away", match_id),
            simulation=simulation,
            h2h=_h2h(db, match.home_team_id, match.away_team_id, home_name, away_name),
            context=match_context,
            lineup_home=None,
            lineup_away=None,
            injuries_home=[],
            injuries_away=[],
            referee=None,
            league_context=_real_league_context(db, match, match.home_team_id, match.away_team_id),
            adv_home=None,
            adv_away=None,
            betting={
                "home_ml": round(1 / probabilities.home_win, 2) if probabilities and probabilities.home_win > 0 else None,
                "draw_ml": round(1 / probabilities.draw, 2) if probabilities and probabilities.draw and probabilities.draw > 0 else None,
                "away_ml": round(1 / probabilities.away_win, 2) if probabilities and probabilities.away_win > 0 else None,
                "spread": None,
                "total": None,
            },
        )
