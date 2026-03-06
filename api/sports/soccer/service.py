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
    # Seeded mock values for extended fields
    import random as _random
    seed = sum(ord(c) for c in match_id + team_id + "stats") % 100
    rng = _random.Random(seed)
    shots_t = row.shots or 0
    shots_on = row.shots_on_target or 0
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
        corners=rng.randint(2, 10),
        offsides=rng.randint(0, 5),
        big_chances_created=rng.randint(1, 5),
        big_chances_missed=rng.randint(0, 3),
        aerial_duels_won=rng.randint(5, 20),
        aerial_duels_lost=rng.randint(3, 18),
        crosses=rng.randint(5, 22),
        long_balls_accurate=rng.randint(10, 40),
        through_balls=rng.randint(0, 5),
        tackles_won=rng.randint(5, 18),
        interceptions=rng.randint(3, 14),
        clearances=rng.randint(5, 25),
        blocks=rng.randint(1, 8),
        shots_inside_box=max(0, shots_t - rng.randint(1, 4)) if shots_t > 0 else rng.randint(2, 8),
        shots_outside_box=rng.randint(1, 5),
        dribbles_completed=rng.randint(2, 10),
    )


def _form_stats(feat: FeatSoccerMatch, team_name: str, side: str, match_id: str = "") -> FormStatsOut | None:
    """Build FormStatsOut for home or away side from a FeatSoccerMatch row."""
    if feat is None:
        return None
    import random as _random
    seed = sum(ord(c) for c in (match_id or "") + side + "form") % 100
    seed_val = seed / 100.0
    rng = _random.Random(seed)

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

    # Enhance with mock extended fields
    clean_sheets = wins if wins else 0
    btts = (losses or 0) + (draws or 0) // 2
    raw_form = (["W"] * (wins or 0) + ["D"] * (draws or 0) + ["L"] * (losses or 0))[:5]
    shots_avg = round(xg_avg * 6.5, 1) if xg_avg else None
    shots_on_target_avg = round(shots_avg * 0.38, 1) if shots_avg else None

    form.clean_sheets = clean_sheets
    form.btts = btts
    form.form_last_5 = raw_form if raw_form else None
    form.ppda_avg = round(8.5 + seed_val * 0.15, 2)
    form.shots_avg = shots_avg
    form.shots_on_target_avg = shots_on_target_avg
    form.corners_avg = round(5.5 + seed_val * 0.1, 1)
    return form


# --- Mock data helpers (deterministic from match_id seed) ---

_POSITIONS_FORMATION_433 = [
    ("GK", 1), ("RB", 2), ("CB", 4), ("CB", 5), ("LB", 3),
    ("CDM", 6), ("CM", 8), ("CM", 10), ("RW", 7), ("ST", 9), ("LW", 11),
]
_SUBS_POSITIONS = [("GK", 12), ("CB", 15), ("CM", 14), ("ST", 19), ("LW", 17)]

_PLAYER_NAMES = {
    "home": [
        ("Alisson Becker", "GK"), ("Trent Alexander-Arnold", "RB"), ("Virgil van Dijk", "CB"),
        ("Ibrahima Konaté", "CB"), ("Andrew Robertson", "LB"), ("Wataru Endo", "CDM"),
        ("Dominik Szoboszlai", "CM"), ("Alexis Mac Allister", "CM"), ("Mohamed Salah", "RW"),
        ("Darwin Núñez", "ST"), ("Luis Díaz", "LW"),
        # bench
        ("Caoimhín Kelleher", "GK"), ("Jarell Quansah", "CB"), ("Curtis Jones", "CM"),
        ("Harvey Elliott", "CAM"), ("Cody Gakpo", "LW"),
    ],
    "away": [
        ("André Onana", "GK"), ("Aaron Wan-Bissaka", "RB"), ("Harry Maguire", "CB"),
        ("Lisandro Martínez", "CB"), ("Diogo Dalot", "LB"), ("Casemiro", "CDM"),
        ("Bruno Fernandes", "CM"), ("Mason Mount", "CM"), ("Marcus Rashford", "RW"),
        ("Rasmus Højlund", "ST"), ("Alejandro Garnacho", "LW"),
        # bench
        ("Tom Heaton", "GK"), ("Victor Lindelöf", "CB"), ("Hannibal Mejbri", "CM"),
        ("Antony", "RW"), ("Wout Weghorst", "ST"),
    ],
}

_REFEREES = [
    ("Michael Oliver", "English"), ("Anthony Taylor", "English"),
    ("Craig Pawson", "English"), ("Stuart Attwell", "English"),
    ("Andre Marriner", "English"), ("Felix Zwayer", "German"),
    ("Clement Turpin", "French"), ("Daniele Orsato", "Italian"),
    ("Slavko Vincic", "Slovenian"), ("Carlos del Cerro Grande", "Spanish"),
]

_INJURIES = [
    ("Hamstring", "4-6 weeks", "High"), ("Knee ligament", "3 months", "High"),
    ("Ankle sprain", "2-3 weeks", "Medium"), ("Thigh strain", "2 weeks", "Medium"),
    ("Calf injury", "3 weeks", "Medium"), ("Back problem", "Unknown", "Low"),
    ("Illness", "1 week", "Low"), ("Shoulder", "2 weeks", "Low"),
]

_FORMATIONS = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "3-4-3", "5-3-2"]


def _mock_lineup(match_id: str, side: str) -> SoccerLineupOut:
    import random as _random
    seed = sum(ord(c) for c in match_id + side) % 100
    rng = _random.Random(seed)
    players_raw = _PLAYER_NAMES[side]
    formation = _FORMATIONS[seed % len(_FORMATIONS)]

    players = []
    for i, (pname, pos) in enumerate(players_raw[:11]):
        mins = rng.randint(70, 90) if i < 9 else rng.randint(60, 90)
        goals = rng.choices([0, 1, 2], weights=[80, 17, 3])[0] if pos in ("ST", "LW", "RW", "CAM") else rng.choices([0, 1], weights=[95, 5])[0]
        assists = rng.choices([0, 1], weights=[82, 18])[0] if pos not in ("GK", "CB") else 0
        shots = goals + rng.randint(0, 3) if pos in ("ST", "LW", "RW") else rng.randint(0, 1)
        shots_on = min(shots, rng.randint(0, shots + 1)) if shots > 0 else 0
        xg_val = round(shots * rng.uniform(0.06, 0.18), 2) if shots > 0 else None
        rating = round(rng.uniform(6.0, 9.5), 1)
        key_passes = rng.randint(0, 4) if pos in ("CM", "CAM", "LW", "RW") else 0
        tackles = rng.randint(0, 4) if pos in ("CDM", "CM", "CB", "LB", "RB") else 0
        passes = rng.randint(20, 80) if pos in ("CB", "CDM", "CM") else rng.randint(10, 40)
        pass_acc = round(rng.uniform(0.72, 0.95), 2)

        saves = rng.randint(2, 8) if pos == "GK" else None
        goals_conceded = rng.randint(0, 3) if pos == "GK" else None

        players.append(SoccerPlayerOut(
            name=pname, position=pos, jersey=i + 1, is_starter=True,
            minutes=mins, goals=goals, assists=assists, xg=xg_val,
            shots=shots, shots_on_target=shots_on, key_passes=key_passes,
            tackles=tackles, interceptions=rng.randint(0, 2),
            clearances=rng.randint(0, 3) if pos in ("CB", "GK") else 0,
            aerial_duels_won=rng.randint(0, 6) if pos in ("CB", "ST") else rng.randint(0, 2),
            passes=passes, passes_completed=int(passes * pass_acc),
            pass_accuracy=pass_acc, crosses=rng.randint(0, 4) if pos in ("LB", "RB", "LW", "RW") else 0,
            long_balls=rng.randint(0, 8) if pos in ("CB", "CDM") else 0,
            saves=saves, goals_conceded=goals_conceded,
            yellow_cards=rng.choices([0, 1], weights=[90, 10])[0],
            red_cards=rng.choices([0, 1], weights=[99, 1])[0],
            rating=rating,
        ))

    # Add bench players (no game stats)
    for i, (pname, pos) in enumerate(players_raw[11:]):
        sub_mins = rng.randint(15, 45) if rng.random() > 0.4 else None
        players.append(SoccerPlayerOut(
            name=pname, position=pos, jersey=12 + i, is_starter=False,
            minutes=sub_mins,
        ))

    return SoccerLineupOut(
        team_id=side, team_name=side.capitalize(),
        formation=formation, players=players,
    )


def _mock_injuries(match_id: str, side: str) -> list:
    import random as _random
    seed = sum(ord(c) for c in match_id + side + "inj") % 100
    rng = _random.Random(seed)
    n = rng.randint(0, 3)
    if n == 0:
        return []
    names_pool = _PLAYER_NAMES[side]
    injured = rng.sample(names_pool, min(n, len(names_pool)))
    result = []
    for (pname, pos) in injured:
        inj = _INJURIES[rng.randint(0, len(_INJURIES) - 1)]
        status_choices = ["Out", "Doubtful", "Questionable"]
        result.append(SoccerInjuryOut(
            player_name=pname, position=pos,
            status=rng.choice(status_choices),
            reason=inj[0], expected_return=inj[1], impact=inj[2],
        ))
    return result


def _mock_referee(match_id: str) -> SoccerRefereeOut:
    import random as _random
    seed = sum(ord(c) for c in match_id + "ref") % len(_REFEREES)
    rng = _random.Random(seed)
    name, nat = _REFEREES[seed % len(_REFEREES)]
    return SoccerRefereeOut(
        name=name, nationality=nat,
        yellow_cards_per_game=round(rng.uniform(2.8, 5.2), 2),
        red_cards_per_game=round(rng.uniform(0.05, 0.35), 2),
        fouls_per_game=round(rng.uniform(22, 38), 1),
        penalties_per_game=round(rng.uniform(0.1, 0.6), 2),
        home_win_pct=round(rng.uniform(0.38, 0.55), 3),
    )


def _mock_league_context(match_id: str) -> SoccerLeagueContextOut:
    import random as _random
    seed = sum(ord(c) for c in match_id + "ctx") % 100
    rng = _random.Random(seed)
    home_pos = rng.randint(1, 20)
    away_pos = rng.randint(1, 20)
    home_pts = rng.randint(10, 72)
    away_pts = rng.randint(10, 72)
    gp = rng.randint(20, 35)
    return SoccerLeagueContextOut(
        home_position=home_pos, away_position=away_pos,
        home_points=home_pts, away_points=away_pts,
        home_games_played=gp, away_games_played=gp,
        points_gap=home_pts - away_pts,
        top_4_gap_home=max(0, rng.randint(0, 15)),
        relegation_gap_away=max(0, rng.randint(0, 12)),
        home_form_rank=rng.randint(1, 20),
        away_form_rank=rng.randint(1, 20),
    )


def _mock_adv_stats(match_id: str, side: str, stats: Optional[SoccerTeamStatsOut] = None) -> SoccerAdvancedTeamStatsOut:
    import random as _random
    seed = sum(ord(c) for c in match_id + side + "adv") % 100
    rng = _random.Random(seed)
    big_c = rng.randint(1, 6)
    big_m = rng.randint(0, big_c)
    corners = rng.randint(2, 10)
    cross_tot = rng.randint(8, 25)
    cross_comp = rng.randint(2, cross_tot)
    return SoccerAdvancedTeamStatsOut(
        team_id=side, team_name=side.capitalize(),
        ppda=round(rng.uniform(5.0, 18.0), 2),
        high_press_success_rate=round(rng.uniform(0.20, 0.55), 3),
        big_chances_created=big_c, big_chances_missed=big_m,
        big_chance_conversion_pct=round((big_c - big_m) / big_c, 3) if big_c > 0 else 0.0,
        set_piece_goals=rng.randint(0, 2),
        corners_won=corners,
        corner_conversion_pct=round(rng.uniform(0.04, 0.14), 3),
        offsides_caught=rng.randint(0, 5),
        errors_leading_to_goal=rng.randint(0, 2),
        aerial_duel_win_pct=round(rng.uniform(0.42, 0.62), 3),
        crosses_completed=cross_comp,
        cross_accuracy_pct=round(cross_comp / cross_tot, 3) if cross_tot > 0 else 0.0,
        xpts=round(rng.uniform(0.3, 2.8), 2),
        progressive_passes=rng.randint(30, 80),
        progressive_carries=rng.randint(10, 35),
        final_third_entries=rng.randint(15, 45),
        penalty_box_touches=rng.randint(8, 28),
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
            lineup_home=_mock_lineup(match_id, "home"),
            lineup_away=_mock_lineup(match_id, "away"),
            injuries_home=_mock_injuries(match_id, "home"),
            injuries_away=_mock_injuries(match_id, "away"),
            referee=_mock_referee(match_id),
            league_context=_mock_league_context(match_id),
            adv_home=_mock_adv_stats(match_id, "home"),
            adv_away=_mock_adv_stats(match_id, "away"),
            betting={
                "home_ml": round(1 / probabilities.home_win, 2) if probabilities and probabilities.home_win > 0 else None,
                "draw_ml": round(1 / probabilities.draw, 2) if probabilities and probabilities.draw and probabilities.draw > 0 else None,
                "away_ml": round(1 / probabilities.away_win, 2) if probabilities and probabilities.away_win > 0 else None,
                "spread": None,
                "total": None,
            },
        )
