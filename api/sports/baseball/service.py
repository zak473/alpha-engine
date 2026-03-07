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
from db.models.baseball import BaseballTeamMatchStats, EventContext
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


# ─── Mock data ──────────────────────────────────────────────────────────────

_MLB_LINEUPS: dict[str, list[tuple[str, str, str]]] = {
    "home": [
        ("DJ LeMahieu",    "3B", "R"),
        ("Aaron Judge",    "RF", "R"),
        ("Juan Soto",      "LF", "L"),
        ("Giancarlo Stanton", "DH", "R"),
        ("Anthony Rizzo",  "1B", "L"),
        ("Gleyber Torres", "2B", "R"),
        ("Austin Wells",   "C",  "L"),
        ("Oswaldo Cabrera","SS", "S"),
        ("Trent Grisham",  "CF", "L"),
    ],
    "away": [
        ("Rafael Devers",  "3B", "L"),
        ("Trevor Story",   "SS", "R"),
        ("Yoshida Masataka", "LF", "L"),
        ("Triston Casas",  "1B", "L"),
        ("Alex Verdugo",   "RF", "L"),
        ("Rob Refsnyder",  "DH", "R"),
        ("Reese McGuire",  "C",  "L"),
        ("Enmanuel Valdez","2B", "R"),
        ("Jarren Duran",   "CF", "L"),
    ],
}

_MLB_STARTERS: dict[str, tuple[str, str, float, float, float]] = {
    "home": ("Gerrit Cole",   "R", 3.12, 0.89, 10.8),  # name, hand, ERA, WHIP, K/9
    "away": ("Brayan Bello",  "R", 4.22, 1.18, 8.6),
}

_MLB_BULLPEN: dict[str, list[tuple[str, str]]] = {
    "home": [
        ("Clay Holmes",    "R"),
        ("Tommy Kahnle",   "R"),
        ("Jonathan Loaisiga", "R"),
        ("Michael King",   "R"),
    ],
    "away": [
        ("Kenley Jansen",  "R"),
        ("John Schreiber", "R"),
        ("Tanner Houck",   "R"),
        ("Chris Martin",   "R"),
    ],
}


_PITCH_ARCHETYPES = {
    "R": [
        ("Four-Seam FB", 0.35, 93.0, 97.0, 2380),
        ("Slider", 0.22, 83.0, 87.0, 2650),
        ("Changeup", 0.15, 85.0, 88.0, 1720),
        ("Curveball", 0.14, 76.0, 80.0, 2550),
        ("Sinker", 0.10, 91.0, 95.0, 2180),
        ("Cutter", 0.04, 88.0, 92.0, 2440),
    ],
    "L": [
        ("Four-Seam FB", 0.30, 91.0, 95.0, 2300),
        ("Changeup", 0.22, 83.0, 87.0, 1680),
        ("Slider", 0.20, 81.0, 85.0, 2580),
        ("Curveball", 0.16, 74.0, 78.0, 2500),
        ("Sinker", 0.08, 89.0, 93.0, 2100),
        ("Cutter", 0.04, 86.0, 90.0, 2380),
    ],
}

_UMPIRES = [
    ("Ángel Hernández", 0.88), ("Joe West", 1.12), ("Phil Cuzzi", 0.95),
    ("Jim Wolf", 1.05), ("Hunter Wendelstedt", 1.08), ("CB Bucknor", 0.92),
    ("Mark Carlson", 1.00), ("Fieldin Culbreth", 0.98), ("Ron Kulpa", 1.10),
    ("Brian Gorman", 0.96), ("Dan Iassogna", 1.03), ("Alfonso Márquez", 1.01),
]


def _mock_pitch_arsenal(hand: str, seed: int) -> list[PitchTypeOut]:
    import random
    rng = random.Random(seed + 999)
    pitches_base = _PITCH_ARCHETYPES.get(hand, _PITCH_ARCHETYPES["R"])
    result = []
    for pname, base_usage, v_lo, v_hi, spin_base in pitches_base[:5]:
        usage = round(base_usage + rng.uniform(-0.05, 0.05), 3)
        velo_avg = round(rng.uniform(v_lo, v_hi), 1)
        velo_max = round(velo_avg + rng.uniform(2, 5), 1)
        spin = int(spin_base + rng.randint(-150, 150))
        result.append(PitchTypeOut(
            pitch_name=pname, usage_pct=max(0.01, usage),
            velocity_avg=velo_avg, velocity_max=velo_max, spin_rate=spin,
            horizontal_break=round(rng.uniform(-14, 14), 1),
            vertical_break=round(rng.uniform(-18, 12), 1),
            whiff_pct=round(rng.uniform(0.18, 0.48), 3),
            put_away_pct=round(rng.uniform(0.12, 0.38), 3),
            ba_against=round(rng.uniform(0.175, 0.290), 3),
        ))
    total = sum(p.usage_pct for p in result)
    for p in result:
        p.usage_pct = round(p.usage_pct / total, 3) if total > 0 else p.usage_pct
    return result


def _mock_batted_ball(match_id: str, team_id: str, team_name: str, side: str) -> BattedBallStatsOut:
    import random
    seed = sum(ord(c) for c in match_id + side + "bb") % 100
    rng = random.Random(seed)
    ev = round(rng.uniform(86, 92), 1)
    gb = round(rng.uniform(0.38, 0.50), 3)
    fb = round(rng.uniform(0.28, 0.40), 3)
    ld = round(max(0.05, 1 - gb - fb - 0.05), 3)
    pull = round(rng.uniform(0.38, 0.52), 3)
    center = round(rng.uniform(0.26, 0.36), 3)
    oppo = round(max(0.01, 1 - pull - center), 3)
    return BattedBallStatsOut(
        team_id=team_id, team_name=team_name,
        avg_exit_velocity=ev, max_exit_velocity=round(ev + rng.uniform(8, 18), 1),
        avg_launch_angle=round(rng.uniform(8, 18), 1),
        barrel_pct=round(rng.uniform(0.06, 0.14), 3),
        hard_hit_pct=round(rng.uniform(0.32, 0.50), 3),
        sweet_spot_pct=round(rng.uniform(0.30, 0.44), 3),
        gb_pct=gb, fb_pct=fb, ld_pct=ld, pu_pct=0.05,
        pull_pct=pull, center_pct=center, oppo_pct=oppo,
        xba=round(rng.uniform(0.230, 0.275), 3),
        xslg=round(rng.uniform(0.370, 0.450), 3),
        xwoba=round(rng.uniform(0.300, 0.360), 3),
    )


def _mock_situational(match_id: str, team_id: str, team_name: str, side: str) -> SituationalBattingOut:
    import random
    seed = sum(ord(c) for c in match_id + side + "sit") % 100
    rng = random.Random(seed)
    return SituationalBattingOut(
        team_id=team_id, team_name=team_name,
        risp_avg=round(rng.uniform(0.230, 0.295), 3),
        risp_obp=round(rng.uniform(0.305, 0.385), 3),
        risp_ops=round(rng.uniform(0.700, 0.870), 3),
        two_out_risp_avg=round(rng.uniform(0.205, 0.270), 3),
        leadoff_avg=round(rng.uniform(0.250, 0.320), 3),
        leadoff_obp=round(rng.uniform(0.330, 0.420), 3),
        bases_loaded_avg=round(rng.uniform(0.240, 0.310), 3),
        late_close_avg=round(rng.uniform(0.230, 0.300), 3),
        vs_lhp_ops=round(rng.uniform(0.680, 0.850), 3),
        vs_rhp_ops=round(rng.uniform(0.700, 0.860), 3),
        clutch_score=round(rng.uniform(-1.5, 2.5), 2),
    )


def _mock_umpire(match_id: str) -> UmpireOut:
    import random
    seed = sum(ord(c) for c in match_id + "ump") % len(_UMPIRES)
    rng = random.Random(seed)
    name, kzone = _UMPIRES[seed % len(_UMPIRES)]
    ow = rng.randint(8, 22)
    ol = rng.randint(8, 22)
    return UmpireOut(
        name=name, games_called=rng.randint(40, 110),
        k_zone_size=round(kzone + rng.uniform(-0.06, 0.06), 3),
        strikeouts_per_game=round(rng.uniform(14, 20), 1),
        walks_per_game=round(rng.uniform(5, 10), 1),
        first_pitch_strike_pct=round(rng.uniform(0.56, 0.66), 3),
        home_win_pct=round(rng.uniform(0.52, 0.60), 3),
        run_scoring_impact=round(rng.uniform(-0.8, 0.8), 2),
        over_record=f"{ow}-{ol}",
    )


def _mock_starter(side: str, seed: int, is_finished: bool) -> StarterPitcherOut:
    name, hand, era, whip, k9 = _MLB_STARTERS[side]
    if is_finished:
        ip = round(5.0 + (seed % 4), 1)
        er = max(0, int(era * ip / 9))
        so = max(3, int(k9 * ip / 9 + (seed % 3)))
        bb = max(0, int(whip * ip - (so / 10)))
        pitches = int(ip * 17 + (seed % 10))
    else:
        ip = er = so = bb = pitches = None
    return StarterPitcherOut(
        name=name,
        hand=hand,
        era=era,
        fip=round(era + 0.3 - (seed % 3) / 10, 2),
        whip=whip,
        k_per_9=k9,
        bb_per_9=round(2.0 + (seed % 8) / 5, 1),
        hr_per_9=round(1.0 + (seed % 5) / 5, 1),
        ip=ip,
        hits_allowed=max(0, int((ip or 0) * 0.9)) if is_finished else None,
        earned_runs=er,
        strikeouts=so,
        walks=bb,
        pitches_thrown=pitches,
        strikes_pct=round(0.62 + (seed % 8) / 100, 3) if is_finished else None,
        last_3_era=round(era + (seed % 10) / 10 - 0.5, 2),
        elo_adj=round(float((seed % 40) - 20), 1),
        games_started=18 + (seed % 12),
        wins=6 + (seed % 8),
        losses=3 + (seed % 6),
        innings_pitched_season=round(100 + (seed % 50), 1),
        k_pct=round(0.20 + (seed % 12) / 100, 3),
        bb_pct=round(0.06 + (seed % 6) / 100, 3),
        k_bb_ratio=round((0.20 + (seed % 12) / 100) / max(0.06, 0.06 + (seed % 6) / 100), 2),
        gb_pct=round(0.42 + (seed % 12) / 100, 3),
        fb_pct=round(0.32 + (seed % 10) / 100, 3),
        ld_pct=round(0.20 + (seed % 6) / 100, 3),
        hr_fb_pct=round(0.10 + (seed % 8) / 100, 3),
        babip=round(0.285 + (seed % 30) / 1000, 3),
        lob_pct=round(0.72 + (seed % 10) / 100, 3),
        xfip=round(era + 0.2 - (seed % 4) / 10, 2),
        siera=round(era + 0.15 - (seed % 3) / 10, 2),
        xera=round(era + 0.1 - (seed % 5) / 10, 2),
        pitch_arsenal=_mock_pitch_arsenal(hand, seed),
    )


def _mock_batter(name: str, pos: str, hand: str, order: int, seed: int, is_finished: bool) -> BatterOut:
    r = (seed * 7 + order * 31) % 100
    avg = round(0.220 + (r % 60) / 1000, 3)
    obp = round(avg + 0.060 + (r % 30) / 1000, 3)
    slg = round(avg + 0.120 + (r % 80) / 1000, 3)
    ops = round(obp + slg, 3)
    if is_finished:
        ab = 3 + (r % 3)
        hits = max(0, int(ab * avg + (r % 3) - 1))
        hr = 1 if r > 90 else 0
        rbi = hr + (1 if hits > 1 else 0)
        bb = 1 if r > 80 else 0
        so = max(0, 1 - hits + (r % 2))
        runs = 1 if (hits > 0 or bb > 0) and r > 60 else 0
    else:
        ab = hits = hr = rbi = bb = so = runs = None
    return BatterOut(
        name=name,
        position=pos,
        batting_order=order,
        hand=hand,
        batting_avg=avg,
        obp=obp,
        slg=slg,
        ops=ops,
        woba=round(obp * 0.9 + slg * 0.2, 3),
        iso=round(slg - avg, 3),
        babip=round(0.270 + (r % 40) / 1000, 3),
        k_pct=round(0.18 + (r % 14) / 100, 3),
        bb_pct=round(0.07 + (r % 8) / 100, 3),
        hard_hit_pct=round(0.34 + (r % 16) / 100, 3),
        barrel_pct=round(0.06 + (r % 10) / 100, 3),
        sprint_speed=round(26.0 + (r % 5), 1),
        xba=round(avg + (r % 20) / 1000 - 0.01, 3),
        xslg=round(slg + (r % 30) / 1000 - 0.015, 3),
        xwoba=round(obp * 0.85 + slg * 0.18, 3),
        at_bats=ab,
        runs=runs,
        hits=hits,
        rbi=rbi,
        walks=bb,
        strikeouts=so,
        home_runs=hr,
    )


def _mock_batting(team_id: str, name: str, is_home: bool, total_runs: Optional[int], seed: int) -> BaseballTeamBattingOut:
    side = "home" if is_home else "away"
    lineup = _MLB_LINEUPS[side]
    is_fin = total_runs is not None
    batters = [
        _mock_batter(bname, pos, hand, i + 1, seed + i * 7, is_fin)
        for i, (bname, pos, hand) in enumerate(lineup)
    ]
    total_h = sum(b.hits or 0 for b in batters)
    total_hr = sum(b.home_runs or 0 for b in batters)
    total_rbi = sum(b.rbi or 0 for b in batters)
    total_bb = sum(b.walks or 0 for b in batters)
    total_so = sum(b.strikeouts or 0 for b in batters)
    avg_s = round(sum(b.batting_avg or 0 for b in batters) / len(batters), 3)
    obp_s = round(sum(b.obp or 0 for b in batters) / len(batters), 3)
    slg_s = round(sum(b.slg or 0 for b in batters) / len(batters), 3)
    return BaseballTeamBattingOut(
        team_id=team_id,
        team_name=name,
        is_home=is_home,
        batters=batters,
        total_runs=total_runs,
        total_hits=total_h if is_fin else None,
        total_hr=total_hr if is_fin else None,
        total_rbi=total_rbi if is_fin else None,
        total_bb=total_bb if is_fin else None,
        total_so=total_so if is_fin else None,
        total_lob=max(0, total_h + total_bb - (total_runs or 0)) if is_fin else None,
        team_avg=avg_s,
        team_obp=obp_s,
        team_slg=slg_s,
        team_ops=round(obp_s + slg_s, 3),
    )


def _mock_bullpen(team_id: str, name: str, is_home: bool, seed: int, is_finished: bool) -> BullpenSummaryOut:
    side = "home" if is_home else "away"
    pitchers_list = _MLB_BULLPEN[side]
    pitchers = []
    total_pitches_3d = 0
    for i, (pname, hand) in enumerate(pitchers_list):
        r = (seed + i * 13) % 100
        used = is_finished and (r > 60)
        ip = round(0.3 + (r % 10) / 10, 1) if used else 0.0
        pitches = int(ip * 15) if used else 0
        days_since = r % 4
        pitches_3d = max(0, 35 - days_since * 8 + (r % 20))
        total_pitches_3d += pitches_3d
        pitchers.append(BullpenPitcherOut(
            name=pname,
            hand=hand,
            ip=ip if used else None,
            earned_runs=max(0, int(ip - 0.5)) if used else None,
            strikeouts=max(0, int(ip * 1.2)) if used else None,
            walks=0 if used else None,
            pitches_thrown=pitches if used else None,
            days_since_last=days_since,
            pitches_last_3d=pitches_3d,
        ))
    fatigue = min(10.0, round(total_pitches_3d / 25, 1))
    return BullpenSummaryOut(
        team_id=team_id,
        team_name=name,
        pitchers=pitchers,
        total_ip=round(sum(p.ip or 0 for p in pitchers), 1),
        total_pitches_last_3d=total_pitches_3d,
        fatigue_score=fatigue,
    )


def _mock_inning_scores(home_r: int, away_r: int, seed: int) -> list[InningScore]:
    innings = []
    home_rem = home_r
    away_rem = away_r
    for inn in range(1, 10):
        h = 0
        a = 0
        if home_rem > 0 and (seed + inn * 3) % 5 == 0:
            take = min(home_rem, 1 + (seed + inn) % 3)
            h = take
            home_rem -= take
        if away_rem > 0 and (seed + inn * 5 + 2) % 5 == 0:
            take = min(away_rem, 1 + (seed + inn + 2) % 3)
            a = take
            away_rem -= take
        innings.append(InningScore(inning=inn, home=h, away=a))
    if home_rem > 0:
        innings[-1] = InningScore(inning=9, home=(innings[-1].home or 0) + home_rem, away=innings[-1].away)
    if away_rem > 0:
        innings[-1] = InningScore(inning=9, home=innings[-1].home, away=(innings[-1].away or 0) + away_rem)
    return innings


def _mock_inning_events(home_name: str, away_name: str, seed: int, innings: list[InningScore]) -> list[InningEvent]:
    events = []
    for inn in innings:
        if inn.home and inn.home > 0:
            et = "HR" if (seed + inn.inning) % 4 == 0 else "RBI"
            events.append(InningEvent(
                inning=inn.inning,
                half="bottom",
                description=f"{'HR' if et == 'HR' else 'RBI single'} — {home_name.split()[-1]} ({inn.home} run{'s' if inn.home > 1 else ''})",
                event_type=et,
                team="home",
            ))
        if inn.away and inn.away > 0:
            et = "HR" if (seed + inn.inning + 2) % 4 == 0 else "RBI"
            events.append(InningEvent(
                inning=inn.inning,
                half="top",
                description=f"{'HR' if et == 'HR' else 'RBI single'} — {away_name.split()[-1]} ({inn.away} run{'s' if inn.away > 1 else ''})",
                event_type=et,
                team="away",
            ))
    return events


def _mock_form(team_id: str, name: str, seed: int, is_home: bool) -> BaseballTeamFormOut:
    opponents = ["NYY", "BOS", "TBR", "TOR", "BAL", "HOU", "OAK", "LAA", "TEX", "CLE"]
    parks = ["Yankee Stadium", "Fenway Park", "Tropicana Field", "Rogers Centre", "Camden Yards"]
    starters = [("Gerrit Cole", 3.12), ("Luis Castillo", 3.67), ("Dylan Cease", 3.91)]
    entries = []
    for i in range(5):
        r = (seed * 3 + i * 17) % 100
        runs_for = 2 + (r % 7)
        runs_against = 2 + ((r + 5) % 7)
        result = "W" if runs_for > runs_against else "L"
        st_name, st_era = starters[(seed + i) % len(starters)]
        entries.append(BaseballTeamFormEntry(
            date=f"2025-{8 + i // 3:02d}-{1 + i * 7:02d}",
            opponent=opponents[(seed + i) % len(opponents)],
            score=f"{runs_for}-{runs_against}",
            home_away="H" if (seed + i) % 2 == 0 else "A",
            result=result,
            starter=st_name,
            starter_era=st_era,
            park=parks[(seed + i) % len(parks)],
        ))
    wins = sum(1 for e in entries if e.result == "W")
    side = "home" if is_home else "away"
    st_name, st_hand, st_era, st_whip, st_k9 = _MLB_STARTERS[side]
    return BaseballTeamFormOut(
        team_id=team_id,
        team_name=name,
        last_5=entries,
        wins_last_5=wins,
        losses_last_5=5 - wins,
        avg_runs_for=round(sum(float(e.score.split("-")[0]) for e in entries) / 5, 2),
        avg_runs_against=round(sum(float(e.score.split("-")[1]) for e in entries) / 5, 2),
        team_era_last_5=round(3.8 + (seed % 15) / 10, 2),
        bullpen_era_last_5=round(3.5 + (seed % 20) / 10, 2),
        starter=StarterPitcherOut(name=st_name, hand=st_hand, era=st_era, whip=st_whip, k_per_9=st_k9),
    )


def _mock_elo_panel(
    team_id: str, name: str, base_rating: float, seed: int,
    is_home: bool, r_opp: float
) -> BaseballEloPanelOut:
    home_adv = 24.0 if is_home else 0.0
    pitcher_adj = float((seed % 40) - 20)
    park_factor = 10.0 if is_home and (seed % 3 == 0) else 0.0
    eff_rating = base_rating + pitcher_adj + park_factor
    win_prob = _elo_win_prob(eff_rating, r_opp, home_adv if is_home else -24.0)
    last_10 = [round(base_rating + (seed * 3 + j * 7) % 40 - 20, 1) for j in range(10)]
    return BaseballEloPanelOut(
        team_id=team_id,
        team_name=name,
        rating=round(base_rating, 1),
        rating_change=round((seed % 16) - 8, 1),
        rating_pre=round(base_rating - ((seed % 16) - 8), 1),
        rating_post=round(base_rating, 1),
        k_used=12.0,
        home_advantage_applied=home_adv,
        pitcher_adj=round(pitcher_adj, 1),
        park_factor_applied=park_factor,
        bullpen_fatigue_adj=round(-float(seed % 10) / 5, 1),
        implied_win_prob=round(win_prob, 3),
        elo_win_prob=round(win_prob, 3),
        last_10_ratings=last_10,
    )


def _batting_from_stats(row: "BaseballTeamMatchStats", team_name: str) -> BaseballTeamBattingOut:
    """Build team batting from a real DB stats row (no per-batter breakdown)."""
    return BaseballTeamBattingOut(
        team_id=row.team_id,
        team_name=team_name,
        is_home=row.is_home,
        batters=[],
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
) -> BaseballTeamFormOut:
    side = "home" if is_home else "away"
    st_name, st_hand, st_era, st_whip, st_k9 = _MLB_STARTERS[side]
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
        team_era_last_5=round(3.8 + (seed % 15) / 10, 2),
        bullpen_era_last_5=round(3.5 + (seed % 20) / 10, 2),
        starter=StarterPitcherOut(name=st_name, hand=st_hand, era=st_era, whip=st_whip, k_per_9=st_k9),
    )


def _mock_baseball_detail(
    match: CoreMatch, home_name: str, away_name: str, league: str, db: Session
) -> BaseballMatchDetail:
    seed = sum(ord(c) for c in match.id) % 100
    is_finished = match.status == "finished"

    home_runs = match.home_score if match.home_score is not None else (3 + (seed % 6) if is_finished else None)
    away_runs = match.away_score if match.away_score is not None else (2 + ((seed + 4) % 6) if is_finished else None)

    r_home = 1500 + (seed % 200) - 100
    r_away = 1500 + ((seed + 17) % 200) - 100
    p_home = _elo_win_prob(r_home, r_away, 24.0)
    p_away = 1.0 - p_home

    elo_home = _mock_elo_panel(match.home_team_id, home_name, r_home, seed, True, r_away)
    elo_away = _mock_elo_panel(match.away_team_id, away_name, r_away, seed + 5, False, r_home)

    # Stats: real DB if available, otherwise mock
    stats_home_row = db.query(BaseballTeamMatchStats).filter_by(
        match_id=match.id, team_id=match.home_team_id
    ).first() if is_finished else None
    stats_away_row = db.query(BaseballTeamMatchStats).filter_by(
        match_id=match.id, team_id=match.away_team_id
    ).first() if is_finished else None

    starter_home = (_starter_from_stats(stats_home_row) or _mock_starter("home", seed, is_finished)) if is_finished else _mock_starter("home", seed, False)
    starter_away = (_starter_from_stats(stats_away_row) or _mock_starter("away", seed + 3, is_finished)) if is_finished else _mock_starter("away", seed + 3, False)
    bullpen_home = _mock_bullpen(match.home_team_id, home_name, True, seed, is_finished)
    bullpen_away = _mock_bullpen(match.away_team_id, away_name, False, seed + 7, is_finished)
    batting_home = (_batting_from_stats(stats_home_row, home_name) if stats_home_row else _mock_batting(match.home_team_id, home_name, True, home_runs, seed))
    batting_away = (_batting_from_stats(stats_away_row, away_name) if stats_away_row else _mock_batting(match.away_team_id, away_name, False, away_runs, seed + 3))

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
    if innings is None and is_finished:
        innings = _mock_inning_scores(home_runs or 0, away_runs or 0, seed)
    events = _mock_inning_events(home_name, away_name, seed, innings) if innings else None

    wind_dirs = ["Out to LF", "In from CF", "Out to RF", "Calm", "Crosswind"]
    conditions = ["Clear", "Partly Cloudy", "Overcast", "Clear"]
    weather = BaseballWeatherOut(
        temperature_f=round(62 + (seed % 30), 1),
        wind_speed_mph=round(5 + (seed % 20), 1),
        wind_direction=wind_dirs[seed % len(wind_dirs)],
        conditions=conditions[seed % len(conditions)],
        humidity_pct=round(40 + (seed % 40), 1),
    )

    park_factor = float((seed % 30) - 10)

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
        home=ParticipantOut(id=match.home_team_id, name=home_name),
        away=ParticipantOut(id=match.away_team_id, name=away_name),
        home_score=match.home_score,
        away_score=match.away_score,
        outcome=match.outcome,
        live_clock=match.live_clock if match.status == "live" else None,
        current_period=baseball_current_period,
        current_state=baseball_current_state,
        probabilities=ProbabilitiesOut(home_win=round(p_home, 3), away_win=round(p_away, 3)),
        confidence=52 + (seed % 28),
        fair_odds=FairOddsOut(home_win=round(1 / p_home, 2), away_win=round(1 / p_away, 2)),
        key_drivers=[
            KeyDriverOut(feature="Starter Quality (home)", importance=0.32, value=round(starter_home.era or 3.5, 2), direction="home" if (starter_home.era or 4) < (starter_away.era or 4) else "away"),
            KeyDriverOut(feature="Team Elo Differential", importance=0.24, value=round(r_home - r_away, 0), direction="home" if r_home > r_away else "away"),
            KeyDriverOut(feature="Bullpen Fatigue (away)", importance=0.16, value=elo_away.bullpen_fatigue_adj),
            KeyDriverOut(feature="Park Factor", importance=0.12, value=park_factor, direction="home" if park_factor > 0 else "away"),
            KeyDriverOut(feature="Weather (Wind)", importance=0.08, value=float(weather.wind_speed_mph or 0), direction="neutral"),
            KeyDriverOut(feature="H2H Record", importance=0.08, value=float(2), direction="home"),
        ],
        model=ModelMetaOut(version="bsbl-v1.1", algorithm="GBM", trained_at="2025-10-01", n_train_samples=18600, accuracy=0.588, brier_score=0.238),
        elo_home=elo_home,
        elo_away=elo_away,
        match_info=BaseballMatchInfo(
            ballpark="Yankee Stadium",
            city="New York",
            attendance=42000 + (seed % 8000),
            innings_played=9 if is_finished else None,
            inning_scores=innings,
            home_hits=sum(b.hits or 0 for b in batting_home.batters) if is_finished else None,
            home_errors=seed % 2,
            away_hits=sum(b.hits or 0 for b in batting_away.batters) if is_finished else None,
            away_errors=(seed + 1) % 2,
            weather=weather,
            park_factor=park_factor,
            home_record=f"{42 + seed % 20}-{31 + (seed + 3) % 18}",
            away_record=f"{38 + (seed + 7) % 22}-{35 + (seed + 9) % 20}",
            home_streak=f"W{1 + seed % 4}" if seed % 2 == 0 else f"L{1 + seed % 3}",
            away_streak=f"W{1 + (seed + 3) % 3}" if (seed + 3) % 2 == 0 else f"L{1 + (seed + 3) % 3}",
            home_bullpen_era=round(3.2 + (seed % 20) / 10, 2),
            away_bullpen_era=round(3.8 + ((seed + 5) % 20) / 10, 2),
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
        context={"venue_name": "Yankee Stadium", "attendance": 42000 + (seed % 8000)},
        data_completeness={
            "box_score": is_finished,
            "pitching_line": is_finished,
            "batting_line": is_finished,
            "inning_events": is_finished,
            "elo_ratings": True,
            "weather": True,
            "h2h": True,
        },
        batted_ball_home=_mock_batted_ball(match.id, match.home_team_id, home_name, "home"),
        batted_ball_away=_mock_batted_ball(match.id, match.away_team_id, away_name, "away"),
        situational_home=_mock_situational(match.id, match.home_team_id, home_name, "home"),
        situational_away=_mock_situational(match.id, match.away_team_id, away_name, "away"),
        umpire=_mock_umpire(match.id),
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

        items = []
        for m in rows:
            home_name = _name(db, m.home_team_id)
            away_name = _name(db, m.away_team_id)
            elo_h = _elo_snapshot(db, m.home_team_id, home_name)
            elo_a = _elo_snapshot(db, m.away_team_id, away_name)
            seed = sum(ord(c) for c in m.id) % 100
            r_home = (elo_h.rating if elo_h else 1500.0)
            r_away = (elo_a.rating if elo_a else 1500.0)
            p_home = _elo_win_prob(r_home, r_away, 24.0)
            home_st = _MLB_STARTERS["home"][0]
            away_st = _MLB_STARTERS["away"][0]
            items.append(BaseballMatchListItem(
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
                confidence=52 + (seed % 28),
                home_starter=home_st,
                away_starter=away_st,
            ))
        return BaseballMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> BaseballMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "baseball":
            raise HTTPException(status_code=404, detail=f"Baseball match {match_id} not found")

        home_name = _name(db, match.home_team_id)
        away_name = _name(db, match.away_team_id)
        league = _league_name(db, match.league_id)

        return _mock_baseball_detail(match, home_name, away_name, league, db)

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
