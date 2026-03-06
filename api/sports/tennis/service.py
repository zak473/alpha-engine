"""Tennis match service."""

from __future__ import annotations

import json
import math
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
from db.models.tennis import TennisMatch, TennisMatchStats, TennisPlayerForm


# ─── Mock helpers ──────────────────────────────────────────────────────────────

_PLAYER_PROFILES = {
    "home": {
        "nationality": "Serbian", "plays": "Right-handed", "backhand": "Two-handed",
        "age": 36, "ranking": 1, "ranking_points": 11245, "height_cm": 188, "weight_kg": 80,
        "coach": "Goran Ivanisevic", "career_titles": 98, "career_grand_slams": 24,
        "turned_pro": 2003, "career_win_pct": 0.833, "highest_ranking": 1,
    },
    "away": {
        "nationality": "Spanish", "plays": "Left-handed", "backhand": "Two-handed",
        "age": 37, "ranking": 12, "ranking_points": 3010, "height_cm": 185, "weight_kg": 85,
        "coach": "Carlos Moyá", "career_titles": 22, "career_grand_slams": 14,
        "turned_pro": 2001, "career_win_pct": 0.830, "highest_ranking": 1,
    },
}

_NATIONALITIES = ["Serbian", "Spanish", "Russian", "German", "Italian", "British",
                  "Australian", "American", "Greek", "Norwegian", "Danish", "Croatian"]
_COACHES = ["Ivan Lendl", "Stefan Edberg", "Boris Becker", "Brad Gilbert",
            "Carlos Moyá", "John McEnroe", "Gilles Cervara", "Severin Lüthi"]
_BALLS = ["Wilson", "Penn", "Slazenger", "Dunlop", "Babolat"]
_PRIZE_POOLS = [250_000, 500_000, 1_000_000, 2_000_000, 6_000_000, 8_500_000, 14_600_000]
_RANKING_POINTS = [0, 10, 20, 45, 90, 180, 360, 720, 1200, 2000]


def _mock_player_profile(match_id: str, player_id: str, player_name: str, side: str) -> TennisPlayerProfileOut:
    seed = sum(ord(c) for c in match_id + side) % 100
    rng = __import__("random").Random(seed)
    base = _PLAYER_PROFILES.get(side, {})
    ranking = base.get("ranking") or rng.randint(1, 200)
    s_wins = rng.randint(10, 55)
    s_losses = rng.randint(2, 25)
    return TennisPlayerProfileOut(
        player_id=player_id, player_name=player_name,
        nationality=base.get("nationality") or rng.choice(_NATIONALITIES),
        age=base.get("age") or rng.randint(19, 38),
        ranking=ranking,
        ranking_points=base.get("ranking_points") or rng.randint(200, 11000),
        ranking_change_week=rng.randint(-15, 15),
        prize_money_ytd_usd=rng.randint(80_000, 4_500_000),
        career_prize_money_usd=rng.randint(1_000_000, 120_000_000),
        plays=base.get("plays") or rng.choice(["Right-handed", "Left-handed"]),
        backhand=base.get("backhand") or rng.choice(["Two-handed", "One-handed"]),
        turned_pro=base.get("turned_pro") or rng.randint(2000, 2018),
        height_cm=base.get("height_cm") or rng.randint(175, 200),
        weight_kg=base.get("weight_kg") or rng.randint(70, 95),
        coach=base.get("coach") or rng.choice(_COACHES),
        career_titles=base.get("career_titles") or rng.randint(0, 30),
        career_grand_slams=base.get("career_grand_slams") or rng.randint(0, 4),
        career_win_pct=base.get("career_win_pct") or round(rng.uniform(0.55, 0.82), 3),
        season_wins=s_wins, season_losses=s_losses,
        highest_ranking=base.get("highest_ranking") or rng.randint(1, ranking),
    )


def _mock_tiebreaks(match_id: str, sets_detail: list) -> TennisTiebreakOut:
    seed = sum(ord(c) for c in match_id + "tb") % 100
    rng = __import__("random").Random(seed)
    tbs = []
    a_won = b_won = 0
    for s in (sets_detail or []):
        # tiebreak happened if both players won 6 games
        a_games = getattr(s, "a", None) or s.get("a", 0) if hasattr(s, "get") else getattr(s, "a", 0)
        b_games = getattr(s, "b", None) or s.get("b", 0) if hasattr(s, "get") else getattr(s, "b", 0)
        set_num = getattr(s, "set_num", None) or s.get("set_num", 1) if hasattr(s, "get") else getattr(s, "set_num", 1)
        if a_games == 7 or b_games == 7:
            winner = "a" if a_games > b_games else "b"
            if winner == "a":
                a_won += 1
                score_a, score_b = rng.randint(7, 10), rng.randint(3, 6)
            else:
                b_won += 1
                score_b, score_a = rng.randint(7, 10), rng.randint(3, 6)
            tbs.append({"set_num": set_num, "score_a": score_a, "score_b": score_b, "winner": winner})
    return TennisTiebreakOut(
        player_a_tiebreaks_won=a_won,
        player_b_tiebreaks_won=b_won,
        tiebreaks=tbs,
    )


def _enhance_serve_stats(stats: TennisServeStatsOut, match_id: str, side: str) -> TennisServeStatsOut:
    """Add extended serve/rally stats to an existing stats object."""
    if stats is None:
        return None
    seed = sum(ord(c) for c in match_id + side + "srv") % 100
    rng = __import__("random").Random(seed)
    # Serve speeds depend on surface
    fs_avg = round(rng.uniform(170, 195), 1)
    fs_max = round(fs_avg + rng.uniform(8, 20), 1)
    ss_avg = round(rng.uniform(135, 160), 1)
    winners = rng.randint(12, 45)
    ue = rng.randint(8, 38)
    net_app = rng.randint(5, 35)
    net_won = rng.randint(int(net_app * 0.45), int(net_app * 0.80))
    svc_pts = rng.randint(50, 90)
    svc_won = rng.randint(int(svc_pts * 0.55), int(svc_pts * 0.72))
    ret_pts = rng.randint(50, 90)
    ret_won = rng.randint(int(ret_pts * 0.28), int(ret_pts * 0.45))
    stats.first_serve_avg_mph = fs_avg
    stats.first_serve_max_mph = fs_max
    stats.second_serve_avg_mph = ss_avg
    stats.winners = winners
    stats.unforced_errors = ue
    stats.forced_errors = rng.randint(4, 20)
    stats.winner_ue_ratio = round(winners / ue, 2) if ue > 0 else None
    stats.net_approaches = net_app
    stats.net_points_won = net_won
    stats.net_win_pct = round(net_won / net_app, 3) if net_app > 0 else None
    stats.rally_0_4_won_pct = round(rng.uniform(0.45, 0.65), 3)
    stats.rally_5_8_won_pct = round(rng.uniform(0.40, 0.60), 3)
    stats.rally_9plus_won_pct = round(rng.uniform(0.35, 0.60), 3)
    stats.service_points_played = svc_pts
    stats.service_points_won = svc_won
    stats.return_points_played = ret_pts
    stats.return_points_won = ret_won
    stats.total_points_played = svc_pts + ret_pts
    stats.total_points_won = svc_won + ret_won
    return stats


def _enhance_player_form(form: TennisPlayerFormOut, match_id: str, side: str) -> TennisPlayerFormOut:
    if form is None:
        return None
    seed = sum(ord(c) for c in match_id + side + "form") % 100
    rng = __import__("random").Random(seed)
    tb_played = rng.randint(2, 18)
    tb_won = rng.randint(1, tb_played)
    form.win_pct_hard = round(rng.uniform(0.50, 0.85), 3)
    form.win_pct_clay = round(rng.uniform(0.45, 0.82), 3)
    form.win_pct_grass = round(rng.uniform(0.42, 0.78), 3)
    form.tiebreaks_played = tb_played
    form.tiebreaks_won = tb_won
    form.tiebreak_win_pct = round(tb_won / tb_played, 3)
    form.titles_ytd = rng.randint(0, 4)
    form.finals_ytd = form.titles_ytd + rng.randint(0, 3)
    form.ranking_trend = rng.randint(-30, 30)
    form.avg_match_duration_min = round(rng.uniform(70, 160), 1)
    form.three_setters_pct = round(rng.uniform(0.20, 0.55), 3)
    return form


def _enhance_match_info(info: TennisMatchInfoOut, match_id: str) -> TennisMatchInfoOut:
    if info is None:
        return None
    seed = sum(ord(c) for c in match_id + "info") % 100
    rng = __import__("random").Random(seed)
    info.tournament_prize_pool_usd = _PRIZE_POOLS[seed % len(_PRIZE_POOLS)]
    info.points_on_offer = _RANKING_POINTS[min(seed % 10, len(_RANKING_POINTS) - 1)]
    info.draw_size = rng.choice([32, 64, 128])
    info.balls_brand = rng.choice(_BALLS)
    info.court_speed_index = round(rng.uniform(20, 80), 1)
    return info


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
    change = round(latest.rating_after - rows[1].rating_after, 1) if len(rows) == 2 else None
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
            except Exception:
                pass
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
    except Exception:
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
        )
    except Exception:
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
    except Exception:
        return None


def _h2h(db: Session, home_id: str, away_id: str, home_name: str = "", away_name: str = "") -> H2HRecordOut:
    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "tennis",
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
    a_wins = b_wins = 0
    recent = []
    for m in matches:
        if m.home_team_id == home_id:
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
            except Exception:
                pass
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

        items = []
        for m in rows:
            home_name = _name(db, m.home_team_id)
            away_name = _name(db, m.away_team_id)
            snap_h = _elo_snapshot(db, m.home_team_id, home_name)
            snap_a = _elo_snapshot(db, m.away_team_id, away_name)
            items.append(TennisMatchListItem(
                id=m.id,
                league=_league_name(db, m.league_id),
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
            ))
        return TennisMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> TennisMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "tennis":
            raise HTTPException(status_code=404, detail=f"Tennis match {match_id} not found")

        home_name = _name(db, match.home_team_id)
        away_name = _name(db, match.away_team_id)
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

        # Build stats + form, then enhance with mock extended data
        stats_home = _match_stats(db, match_id, match.home_team_id, home_name)
        stats_away = _match_stats(db, match_id, match.away_team_id, away_name)
        stats_home = _enhance_serve_stats(stats_home, match_id, "home")
        stats_away = _enhance_serve_stats(stats_away, match_id, "away")

        form_home = _player_form(db, match.home_team_id, home_name, surface)
        form_away = _player_form(db, match.away_team_id, away_name, surface)
        form_home = _enhance_player_form(form_home, match_id, "home")
        form_away = _enhance_player_form(form_away, match_id, "away")

        # Enhance match info with tournament/court metadata
        tennis_info = _enhance_match_info(tennis_info, match_id)

        # Rich player profiles (mock)
        profile_home = _mock_player_profile(match_id, match.home_team_id, home_name, "home")
        profile_away = _mock_player_profile(match_id, match.away_team_id, away_name, "away")

        # Tiebreaks derived from sets_detail
        tiebreaks = None
        if tennis_info and tennis_info.sets_detail:
            tiebreaks = _mock_tiebreaks(match_id, tennis_info.sets_detail)

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
                except Exception:
                    pass

        return TennisMatchDetail(
            id=match.id,
            sport="tennis",
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
            h2h=_h2h(db, match.home_team_id, match.away_team_id, home_name, away_name),
            profile_home=profile_home,
            profile_away=profile_away,
            tiebreaks=tiebreaks,
            betting=betting,
        )
