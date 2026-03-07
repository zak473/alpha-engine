"""Basketball match service — full Quant Terminal depth with mock data fallback."""

from __future__ import annotations

import math
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
from api.sports.base.queries import compute_team_form, form_summary
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
    change = round(latest.rating_after - rows[1].rating_after, 1) if len(rows) >= 2 else None
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


# ─── Mock data ──────────────────────────────────────────────────────────────

_NBA_ROSTERS: dict[str, list[tuple[str, str]]] = {
    "home": [
        ("LeBron James",   "SF"),
        ("Anthony Davis",  "C"),
        ("Austin Reaves",  "SG"),
        ("D'Angelo Russell", "PG"),
        ("Rui Hachimura",  "PF"),
        ("Jarred Vanderbilt", "PF"),
        ("Taurean Prince", "SF"),
        ("Christian Wood", "C"),
        ("Max Christie",   "SG"),
        ("Cam Reddish",    "SF"),
    ],
    "away": [
        ("Jayson Tatum",   "SF"),
        ("Jaylen Brown",   "SG"),
        ("Kristaps Porzingis", "C"),
        ("Jrue Holiday",   "PG"),
        ("Al Horford",     "PF"),
        ("Derrick White",  "SG"),
        ("Payton Pritchard", "PG"),
        ("Sam Hauser",     "SF"),
        ("Xavier Tillman", "C"),
        ("Jordan Walsh",   "SG"),
    ],
}


def _player_box(name: str, pos: str, seed: int, i: int, is_starter: bool) -> BasketballPlayerOut:
    r = (seed * 7 + i * 31) % 100
    if is_starter:
        mins = 28 + (r % 12)
        pts = 8 + (r % 22)
        reb = 2 + (r % 9)
        ast = 1 + (r % 7)
    else:
        mins = 8 + (r % 14)
        pts = 2 + (r % 12)
        reb = 1 + (r % 5)
        ast = 0 + (r % 4)
    pm = -12 + (r % 25)
    # Shooting
    fg_att = max(2, int(pts * 0.55))
    fg_made = max(0, int(fg_att * (0.40 + (r % 20) / 100)))
    fg3_att = max(1, int(fg_att * 0.4))
    fg3_made = max(0, int(fg3_att * (0.30 + (r % 20) / 100)))
    ft_att = max(0, pts - fg_made * 2 - fg3_made)
    ft_made = max(0, int(ft_att * 0.78))
    points_calc = fg_made * 2 + fg3_made * 3 + ft_made
    return BasketballPlayerOut(
        name=name,
        position=pos,
        is_starter=is_starter,
        minutes=float(mins),
        points=points_calc,
        rebounds=reb,
        reb_off=max(0, reb - (r % (reb + 1))),
        reb_def=reb - max(0, reb - (r % (reb + 1))),
        assists=ast,
        steals=r % 3,
        blocks=r % 2,
        turnovers=r % 4,
        fouls=r % 5,
        plus_minus=pm,
        fg_made=fg_made,
        fg_att=fg_att,
        fg_pct=round(fg_made / fg_att, 3) if fg_att else None,
        fg3_made=fg3_made,
        fg3_att=fg3_att,
        fg3_pct=round(fg3_made / fg3_att, 3) if fg3_att else None,
        ft_made=ft_made,
        ft_att=ft_att,
        ft_pct=round(ft_made / ft_att, 3) if ft_att else None,
    )


def _mock_box_score(
    team_id: str, team_name: str, is_home: bool, total_pts: int, seed: int
) -> BasketballTeamBoxScore:
    side = "home" if is_home else "away"
    roster = _NBA_ROSTERS[side]
    players = [
        _player_box(name, pos, seed + i, i, i < 5)
        for i, (name, pos) in enumerate(roster)
    ]
    # Adjust to hit total_pts
    starter_pts = sum(p.points or 0 for p in players[:5])
    bench_pts = sum(p.points or 0 for p in players[5:])
    fg_made = sum(p.fg_made or 0 for p in players)
    fg_att  = sum(p.fg_att  or 0 for p in players)
    fg3_made = sum(p.fg3_made or 0 for p in players)
    fg3_att  = sum(p.fg3_att  or 0 for p in players)
    ft_made  = sum(p.ft_made  or 0 for p in players)
    ft_att   = sum(p.ft_att   or 0 for p in players)
    return BasketballTeamBoxScore(
        team_id=team_id,
        team_name=team_name,
        is_home=is_home,
        players=players,
        total_points=total_pts,
        total_rebounds=sum(p.rebounds or 0 for p in players),
        total_assists=sum(p.assists or 0 for p in players),
        total_steals=sum(p.steals or 0 for p in players),
        total_blocks=sum(p.blocks or 0 for p in players),
        total_turnovers=sum(p.turnovers or 0 for p in players),
        total_fouls=sum(p.fouls or 0 for p in players),
        fg_made=fg_made,
        fg_att=fg_att,
        fg_pct=round(fg_made / fg_att, 3) if fg_att else None,
        fg3_made=fg3_made,
        fg3_att=fg3_att,
        fg3_pct=round(fg3_made / fg3_att, 3) if fg3_att else None,
        ft_made=ft_made,
        ft_att=ft_att,
        ft_pct=round(ft_made / ft_att, 3) if ft_att else None,
        bench_points=bench_pts,
        fast_break_pts=8 + (seed % 14),
        pts_in_paint=24 + (seed % 20),
        second_chance_pts=4 + (seed % 8),
        points_off_turnovers=10 + (seed % 12),
        largest_lead=8 + (seed % 22),
        lead_changes=4 + (seed % 12),
        times_tied=2 + (seed % 8),
    )


def _mock_adv_stats(
    team_id: str, team_name: str, is_home: bool, seed: int
) -> BasketballAdvancedStatsOut:
    base_ortg = 108 + (seed % 12)
    base_drtg = 108 + ((seed + 5) % 12)
    return BasketballAdvancedStatsOut(
        team_id=team_id,
        team_name=team_name,
        is_home=is_home,
        ortg=float(base_ortg),
        drtg=float(base_drtg),
        net_rtg=float(base_ortg - base_drtg),
        pace=97.0 + (seed % 8),
        efg_pct=round(0.50 + (seed % 10) / 100, 3),
        ts_pct=round(0.55 + (seed % 8) / 100, 3),
        tov_pct=round(12.0 + (seed % 5), 1),
        orb_pct=round(24.0 + (seed % 8), 1),
        drb_pct=round(72.0 + (seed % 6), 1),
        ftr=round(0.22 + (seed % 10) / 100, 3),
        three_par=round(0.38 + (seed % 12) / 100, 3),
        second_half_ortg=float(base_ortg + (seed % 6) - 3),
        second_half_drtg=float(base_drtg + ((seed + 2) % 6) - 3),
        clutch_net_rtg=round((seed % 20) - 10, 1),
        transition_pct=round(0.12 + (seed % 10) / 100, 3),
        half_court_ortg=round(base_ortg - 3 + (seed % 6), 1),
        avg_shot_distance=round(12.0 + (seed % 6), 1),
        paint_pct=round(0.28 + (seed % 12) / 100, 3),
        midrange_pct=round(0.10 + (seed % 10) / 100, 3),
    )


def _mock_form(team_id: str, name: str, seed: int) -> BasketballTeamFormOut:
    opponents = ["NYK", "MIA", "BOS", "PHI", "CHI", "MIL", "TOR", "CLE", "ORL"]
    entries = []
    for i in range(5):
        r = (seed * 3 + i * 17) % 100
        pts_for = 100 + (r % 25)
        pts_against = 100 + ((r + 7) % 25)
        result = "W" if pts_for > pts_against else "L"
        opp = opponents[(seed + i) % len(opponents)]
        entries.append(BasketballTeamFormEntry(
            date=(f"2025-{11 + i // 3:02d}-{1 + i * 7:02d}"),
            opponent=opp,
            score=f"{pts_for}-{pts_against}",
            home_away="H" if (seed + i) % 2 == 0 else "A",
            result=result,
            net_rtg=round(float(pts_for - pts_against) * 0.8, 1),
            days_rest=1 + (r % 3),
        ))
    wins = sum(1 for e in entries if e.result == "W")
    return BasketballTeamFormOut(
        team_id=team_id,
        team_name=name,
        last_5=entries,
        wins_last_5=wins,
        losses_last_5=5 - wins,
        avg_pts_for=round(sum(float(e.score.split("-")[0]) for e in entries) / 5, 1),
        avg_pts_against=round(sum(float(e.score.split("-")[1]) for e in entries) / 5, 1),
        ortg_last_5=round(108 + (seed % 12), 1),
        drtg_last_5=round(108 + ((seed + 3) % 12), 1),
        net_rtg_last_5=round(float((seed % 12) - ((seed + 3) % 12)), 1),
        days_rest=1 + (seed % 3),
        back_to_back=(seed % 7 == 0),
        injury_count=(seed % 3),
    )


def _mock_injuries(seed: int, is_home: bool) -> list[BasketballInjuryOut]:
    if seed % 5 == 0:
        return []
    side = "home" if is_home else "away"
    roster = _NBA_ROSTERS[side]
    statuses = ["Out", "Doubtful", "Questionable", "Probable"]
    reasons = ["Knee", "Ankle", "Back", "Hamstring", "Shoulder", "Hip"]
    n = 1 + (seed % 3)
    return [
        BasketballInjuryOut(
            player_name=roster[(seed + i * 3) % len(roster)][0],
            position=roster[(seed + i * 3) % len(roster)][1],
            status=statuses[(seed + i) % len(statuses)],
            reason=reasons[(seed + i * 2) % len(reasons)],
        )
        for i in range(n)
    ]


def _mock_shots(seed: int) -> list[ShotZoneOut]:
    zones = [
        ("Rim (0–3 ft)",     0.28, 0.62),
        ("Short Mid (3–10)", 0.10, 0.38),
        ("Mid (10–22)",      0.12, 0.40),
        ("Corner 3",         0.15, 0.38),
        ("Above Arc 3",      0.35, 0.34),
    ]
    total = 82 + (seed % 15)
    result = []
    for i, (zone, share, base_pct) in enumerate(zones):
        attempts = max(2, int(total * share + (seed + i * 5) % 6 - 3))
        pct = round(base_pct + (seed + i * 3) % 10 / 100, 3)
        made = max(0, int(attempts * pct))
        result.append(ShotZoneOut(
            zone=zone,
            attempts=attempts,
            made=made,
            pct=round(made / attempts, 3),
            attempts_pct=round(attempts / total, 3),
        ))
    return result


def _mock_elo_panel(
    team_id: str, name: str, base_rating: float, seed: int,
    is_home: bool, r_opp: float
) -> BasketballEloPanelOut:
    home_adv = 35.0 if is_home else 0.0
    win_prob = _elo_win_prob(base_rating, r_opp, home_adv if is_home else -35.0)
    last_10 = [round(base_rating + (seed * 3 + j * 7) % 40 - 20, 1) for j in range(10)]
    return BasketballEloPanelOut(
        team_id=team_id,
        team_name=name,
        rating=round(base_rating, 1),
        rating_change=round((seed % 20) - 10, 1),
        rating_pre=round(base_rating - ((seed % 20) - 10), 1),
        rating_post=round(base_rating, 1),
        k_used=16.0,
        home_advantage_applied=home_adv,
        mov_modifier=round(0.3 + (seed % 5) / 10, 2),
        rest_modifier=0.0 if (seed % 7 != 0) else -15.0,
        days_rest=2 if (seed % 7 != 0) else 0,
        back_to_back=(seed % 7 == 0),
        implied_win_prob=round(win_prob, 3),
        elo_win_prob=round(win_prob, 3),
        last_10_ratings=last_10,
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
    team_id: str, team_name: str, records: list[dict], summary: dict, seed: int
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
        ortg_last_5=round(108 + (seed % 12), 1),
        drtg_last_5=round(108 + ((seed + 3) % 12), 1),
        net_rtg_last_5=round(float((seed % 12) - ((seed + 3) % 12)), 1),
        days_rest=1 + (seed % 3),
        back_to_back=(seed % 7 == 0),
        injury_count=(seed % 3),
    )


def _mock_basketball_detail(
    match: CoreMatch,
    home_name: str,
    away_name: str,
    league: str,
    db: Session,
) -> BasketballMatchDetail:
    seed = sum(ord(c) for c in match.id) % 100
    status = match.status
    is_finished = status == "finished"

    home_pts = match.home_score or (95 + (seed % 30) if is_finished else None)
    away_pts = match.away_score or (95 + ((seed + 13) % 30) if is_finished else None)

    # Quarter scores (mock)
    if is_finished and home_pts and away_pts:
        h_qs = _split_quarters(home_pts, seed)
        a_qs = _split_quarters(away_pts, seed + 7)
    else:
        h_qs = a_qs = None

    r_home = 1500 + (seed % 200) - 100
    r_away = 1500 + ((seed + 17) % 200) - 100

    p_home = _elo_win_prob(r_home, r_away, 35.0)
    p_away = 1.0 - p_home

    elo_home = _mock_elo_panel(match.home_team_id, home_name, r_home, seed, True, r_away)
    elo_away = _mock_elo_panel(match.away_team_id, away_name, r_away, seed + 5, False, r_home)

    # Box scores: real DB stats if available, otherwise mock
    if is_finished:
        stats_home = db.query(BasketballTeamMatchStats).filter_by(
            match_id=match.id, team_id=match.home_team_id
        ).first()
        stats_away = db.query(BasketballTeamMatchStats).filter_by(
            match_id=match.id, team_id=match.away_team_id
        ).first()
        if stats_home:
            box_home = _box_from_stats(stats_home, home_name, db)
        else:
            box_home = _mock_box_score(match.home_team_id, home_name, True, home_pts or 108, seed)
        if stats_away:
            box_away = _box_from_stats(stats_away, away_name, db)
        else:
            box_away = _mock_box_score(match.away_team_id, away_name, False, away_pts or 104, seed + 3)
    else:
        box_home = box_away = None

    # Real form from CoreMatch
    home_form_records = compute_team_form(db, "basketball", match.home_team_id, limit=5)
    away_form_records = compute_team_form(db, "basketball", match.away_team_id, limit=5)
    home_summary = form_summary(home_form_records)
    away_summary = form_summary(away_form_records)

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
            except Exception:
                pass

    return BasketballMatchDetail(
        id=match.id,
        sport="basketball",
        league=league,
        season=match.season,
        kickoff_utc=match.kickoff_utc,
        status=status,
        home=ParticipantOut(id=match.home_team_id, name=home_name),
        away=ParticipantOut(id=match.away_team_id, name=away_name),
        home_score=match.home_score,
        away_score=match.away_score,
        outcome=match.outcome,
        live_clock=match.live_clock if status == "live" else None,
        current_period=live_current_period,
        current_state=match.current_state_json if status == "live" else None,
        probabilities=ProbabilitiesOut(home_win=round(p_home, 3), away_win=round(p_away, 3)),
        confidence=55 + (seed % 30),
        fair_odds=FairOddsOut(
            home_win=round(1 / p_home, 2),
            away_win=round(1 / p_away, 2),
        ),
        key_drivers=[
            KeyDriverOut(feature="Home Elo Advantage", importance=0.28, value=round(r_home - r_away, 0), direction="home" if r_home > r_away else "away"),
            KeyDriverOut(feature="Rest Differential", importance=0.18, value=float(elo_home.days_rest or 2), direction="neutral"),
            KeyDriverOut(feature="Offensive Rating (last 5)", importance=0.22, value=round(110 + seed % 8, 1), direction="home"),
            KeyDriverOut(feature="Pace Match-Up", importance=0.14, value=97.5, direction="neutral"),
            KeyDriverOut(feature="Back-to-Back Penalty", importance=0.10, value=float(elo_away.back_to_back), direction="home"),
            KeyDriverOut(feature="H2H Record (last 5)", importance=0.08, value=float(3), direction="home"),
        ],
        model=ModelMetaOut(version="bball-v1.2", algorithm="GBM", trained_at="2025-10-01", n_train_samples=14200, accuracy=0.618, brier_score=0.228),
        elo_home=elo_home,
        elo_away=elo_away,
        match_info=BasketballMatchInfo(
            arena="Crypto.com Arena" if "laker" in home_name.lower() else "TD Garden",
            city="Los Angeles" if "laker" in home_name.lower() else "Boston",
            attendance=18997 + (seed % 500),
            season_phase="regular",
            pace=round(97.5 + (seed % 8), 1),
            home_quarters=h_qs,
            away_quarters=a_qs,
            home_record=f"{28 + seed % 20}-{14 + (seed + 3) % 18}",
            away_record=f"{25 + (seed + 7) % 22}-{17 + (seed + 9) % 20}",
            home_streak=f"W{1 + seed % 5}" if seed % 2 == 0 else f"L{1 + seed % 3}",
            away_streak=f"W{1 + (seed + 3) % 4}" if (seed + 3) % 2 == 0 else f"L{1 + (seed + 3) % 3}",
            home_home_record=f"{16 + seed % 12}-{6 + seed % 8}",
            away_away_record=f"{11 + (seed + 5) % 12}-{9 + (seed + 5) % 10}",
            referee_crew=_mock_referee_bball(match.id).names,
            overtime_periods=0,
        ),
        form_home=_build_basketball_form(match.home_team_id, home_name, home_form_records, home_summary, seed),
        form_away=_build_basketball_form(match.away_team_id, away_name, away_form_records, away_summary, seed + 11),
        box_home=box_home,
        box_away=box_away,
        adv_home=_mock_adv_stats(match.home_team_id, home_name, True, seed),
        adv_away=_mock_adv_stats(match.away_team_id, away_name, False, seed + 5),
        injuries_home=_mock_injuries(seed, True),
        injuries_away=_mock_injuries(seed + 3, False),
        shots_home=_mock_shots(seed),
        shots_away=_mock_shots(seed + 9),
        h2h=_h2h(db, match.home_team_id, match.away_team_id),
        context={"venue_name": "Crypto.com Arena", "attendance": 18997 + (seed % 500)},
        data_completeness={
            "box_score": is_finished,
            "lineup": False,
            "shot_chart": False,
            "advanced_stats": True,
            "elo_ratings": True,
            "h2h": True,
        },
        clutch_home=_mock_clutch_stats(match.id, match.home_team_id, home_name),
        clutch_away=_mock_clutch_stats(match.id, match.away_team_id, away_name),
        top_lineups_home=_mock_lineup_units(match.id, box_home, True),
        top_lineups_away=_mock_lineup_units(match.id, box_away, False),
        scoring_runs=_mock_scoring_runs(match.id),
        referee=_mock_referee_bball(match.id),
        betting=_mock_betting_bball(match.id, p_home, p_away),
    )


_REFEREE_NAMES = [
    "Scott Foster", "Tony Brothers", "Eric Lewis", "Marc Davis",
    "Zach Zarba", "Jason Phillips", "Rodney Mott", "Bill Kennedy",
    "Ed Malloy", "Ken Mauer", "David Guthrie", "J.T. Orr",
]


def _mock_clutch_stats(match_id: str, team_id: str, team_name: str) -> BasketballClutchStatsOut:
    import random
    seed = sum(ord(c) for c in match_id + team_id + "clutch") % 100
    rng = random.Random(seed)
    fg_att = rng.randint(4, 14)
    fg_made = rng.randint(1, fg_att)
    fg3_att = rng.randint(1, 6)
    fg3_made = rng.randint(0, fg3_att)
    pts = fg_made * 2 + fg3_made + rng.randint(0, 6)
    return BasketballClutchStatsOut(
        team_id=team_id, team_name=team_name,
        clutch_minutes=round(rng.uniform(3, 15), 1),
        clutch_points=pts,
        clutch_fg_pct=round(fg_made / fg_att, 3) if fg_att > 0 else 0.0,
        clutch_fg3_pct=round(fg3_made / fg3_att, 3) if fg3_att > 0 else 0.0,
        clutch_ft_pct=round(rng.uniform(0.65, 0.90), 3),
        clutch_turnovers=rng.randint(0, 4),
        clutch_net_rating=round(rng.uniform(-18, 18), 1),
        clutch_wins_season=rng.randint(3, 18),
        clutch_losses_season=rng.randint(2, 15),
        clutch_fg_made=fg_made, clutch_fg_att=fg_att,
        clutch_free_throws_won=rng.randint(0, 6),
    )


def _mock_lineup_units(match_id: str, box: Optional[BasketballTeamBoxScore], is_home: bool) -> list:
    import random
    if box is None or not box.players:
        return []
    seed = sum(ord(c) for c in match_id + str(is_home) + "lu") % 100
    rng = random.Random(seed)
    starters = [p.name for p in box.players if p.is_starter][:5]
    bench_names = [p.name for p in box.players if not p.is_starter][:5]
    units = []
    units.append(BasketballLineupUnitOut(
        players=starters, minutes=round(rng.uniform(14, 22), 1),
        net_rating=round(rng.uniform(-8, 15), 1),
        ortg=round(rng.uniform(105, 125), 1), drtg=round(rng.uniform(100, 120), 1),
        plus_minus=rng.randint(-12, 18), fg_pct=round(rng.uniform(0.42, 0.54), 3),
        pace=round(rng.uniform(94, 104), 1), possessions=rng.randint(35, 55),
    ))
    if len(bench_names) >= 2:
        combo = starters[:3] + bench_names[:2]
        units.append(BasketballLineupUnitOut(
            players=combo, minutes=round(rng.uniform(6, 14), 1),
            net_rating=round(rng.uniform(-5, 20), 1),
            ortg=round(rng.uniform(108, 128), 1), drtg=round(rng.uniform(98, 118), 1),
            plus_minus=rng.randint(-8, 22), fg_pct=round(rng.uniform(0.44, 0.56), 3),
            pace=round(rng.uniform(96, 106), 1), possessions=rng.randint(20, 38),
        ))
    if len(bench_names) >= 5:
        units.append(BasketballLineupUnitOut(
            players=bench_names[:5], minutes=round(rng.uniform(4, 10), 1),
            net_rating=round(rng.uniform(-15, 10), 1),
            ortg=round(rng.uniform(100, 118), 1), drtg=round(rng.uniform(104, 124), 1),
            plus_minus=rng.randint(-15, 12), fg_pct=round(rng.uniform(0.38, 0.50), 3),
            pace=round(rng.uniform(96, 106), 1), possessions=rng.randint(15, 28),
        ))
    return units


def _mock_scoring_runs(match_id: str) -> list:
    import random
    seed = sum(ord(c) for c in match_id + "runs") % 100
    rng = random.Random(seed)
    periods = ["Q1", "Q2", "Q3", "Q4"]
    runs = []
    for _ in range(rng.randint(2, 4)):
        team = rng.choice(["home", "away"])
        period = rng.choice(periods)
        run_size = rng.randint(7, 18)
        mins_rem = rng.randint(2, 9)
        secs_rem = rng.randint(0, 59)
        runs.append(BasketballScoringRunOut(
            team=team, run_size=run_size, period=period,
            time_started=f"{mins_rem}:{secs_rem:02d}",
            time_ended=f"{max(0, mins_rem - 2)}:{rng.randint(0, 59):02d}",
        ))
    return sorted(runs, key=lambda r: r.run_size, reverse=True)


def _mock_referee_bball(match_id: str) -> BasketballRefereeOut:
    import random
    seed = sum(ord(c) for c in match_id + "ref") % 100
    rng = random.Random(seed)
    refs = rng.sample(_REFEREE_NAMES, 3)
    return BasketballRefereeOut(
        names=refs,
        avg_fouls_per_game=round(rng.uniform(38, 52), 1),
        avg_fta_per_game=round(rng.uniform(22, 32), 1),
        home_foul_rate=round(rng.uniform(0.46, 0.54), 3),
        technicals_per_game=round(rng.uniform(0.05, 0.40), 2),
        home_win_pct=round(rng.uniform(0.55, 0.65), 3),
        avg_total_points=round(rng.uniform(210, 235), 1),
    )


def _mock_betting_bball(match_id: str, p_home: float, p_away: float) -> BasketballBettingOut:
    import random
    seed = sum(ord(c) for c in match_id + "bet") % 100
    rng = random.Random(seed)
    spread = round((0.5 - p_home) * 20, 1)
    total = round(rng.uniform(210, 238), 1)
    home_ml = round(1 / p_home, 2) if p_home > 0 else 2.0
    away_ml = round(1 / p_away, 2) if p_away > 0 else 2.0
    return BasketballBettingOut(
        spread=spread, total=total, home_ml=home_ml, away_ml=away_ml,
        spread_line_move=round(rng.uniform(-2.5, 2.5), 1),
        total_line_move=round(rng.uniform(-3, 3), 1),
        sharp_side_spread=rng.choice(["home", "away", "neutral"]),
        implied_home_total=round(total * p_home * 0.85 + total * 0.25, 1),
        implied_away_total=round(total * p_away * 0.85 + total * 0.25, 1),
    )


def _split_quarters(total: int, seed: int) -> QuarterScore:
    """Split total into 4 plausible quarters."""
    base = total // 4
    rem = total - base * 4
    qs = [base + (1 if i < rem else 0) for i in range(4)]
    # Add some variance
    for i in range(4):
        delta = (seed + i * 7) % 7 - 3
        qs[i] = max(10, qs[i] + delta)
    return QuarterScore(q1=qs[0], q2=qs[1], q3=qs[2], q4=qs[3])


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

        items = []
        for m in rows:
            home_name = _name(db, m.home_team_id)
            away_name = _name(db, m.away_team_id)
            elo_h = _elo_snapshot(db, m.home_team_id, home_name)
            elo_a = _elo_snapshot(db, m.away_team_id, away_name)
            seed = sum(ord(c) for c in m.id) % 100
            r_home = (elo_h.rating if elo_h else 1500.0)
            r_away = (elo_a.rating if elo_a else 1500.0)
            p_home = _elo_win_prob(r_home, r_away, 35.0)
            items.append(BasketballMatchListItem(
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
                elo_home=elo_h.rating if elo_h else None,
                elo_away=elo_a.rating if elo_a else None,
                p_home=round(p_home, 3),
                p_away=round(1.0 - p_home, 3),
                confidence=55 + (seed % 30),
                home_back_to_back=(seed % 7 == 0),
                away_back_to_back=((seed + 3) % 7 == 0),
            ))
        return BasketballMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> BasketballMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "basketball":
            raise HTTPException(status_code=404, detail=f"Basketball match {match_id} not found")

        home_name = _name(db, match.home_team_id)
        away_name = _name(db, match.away_team_id)
        league = _league_name(db, match.league_id)

        return _mock_basketball_detail(match, home_name, away_name, league, db)

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
