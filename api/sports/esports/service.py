"""Esports match service — CS2 + LoL aware with mock data fallback."""

from __future__ import annotations

import math
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session

from api.sports.base.interfaces import BaseMatchListService
from api.sports.esports.schemas import (
    Cs2EconomyStatsOut,
    Cs2OpeningDuelOut,
    Cs2UtilityStatsOut,
    EloHistoryPoint,
    EsportsDraftPick,
    EsportsEloPanel,
    EsportsGameOut,
    EsportsMapOut,
    EsportsMatchDetail,
    EsportsMatchInfo,
    EsportsMatchListItem,
    EsportsMatchListResponse,
    EsportsObjectiveStats,
    EsportsPlayerStatsOut,
    EsportsTeamFormOut,
    EsportsVetoEntry,
    FairOddsOut,
    H2HRecordOut,
    KeyDriverOut,
    LolObjectiveControlOut,
    LolTeamCompOut,
    ModelMetaOut,
    ParticipantOut,
    ProbabilitiesOut,
)
from db.models.mvp import (
    CoreLeague,
    CoreMatch,
    CoreTeam,
    ModelRegistry,
    PredMatch,
    RatingEloTeam,
)
from db.models.esports import (
    EsportsMatch,
    EsportsMapResult,
    EsportsTeamForm,
)
from db.models.hltv import HltvMatchStats


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _name(db: Session, team_id: str) -> str:
    t = db.get(CoreTeam, team_id)
    return t.name if t else team_id


def _league_name(db: Session, league_id: str) -> str:
    lg = db.get(CoreLeague, league_id)
    return lg.name if lg else "Unknown Circuit"


def _detect_game_type(league_name: str) -> str:
    """Infer game type from league/tournament name."""
    ln = league_name.lower()
    if any(k in ln for k in ("cs2", "csgo", "counter-strike", "cs:")):
        return "cs2"
    if any(k in ln for k in ("league of legends", "lol", "lck", "lcs", "lec", "lpl", "worlds")):
        return "lol"
    if any(k in ln for k in ("valorant", "vct")):
        return "valorant"
    if any(k in ln for k in ("dota", "ti ")):
        return "dota2"
    return "cs2"  # default


def _elo_snapshot_rating(db: Session, team_id: str) -> Optional[float]:
    row = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == team_id, RatingEloTeam.context == "global")
        .order_by(RatingEloTeam.rated_at.desc())
        .first()
    )
    return round(row.rating_after, 1) if row else None


def _elo_panel(db: Session, team_id: str, name: str) -> Optional[EsportsEloPanel]:
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
    change = round(latest.rating_after - rows[1].rating_after, 1) if len(rows) == 2 else None
    return EsportsEloPanel(
        team_id=team_id,
        team_name=name,
        overall_rating=round(latest.rating_after, 1),
        rating_change=change,
    )


def _h2h(db: Session, home_id: str, away_id: str, home_name: str = "", away_name: str = "") -> H2HRecordOut:
    matches = (
        db.query(CoreMatch)
        .filter(
            CoreMatch.sport == "esports",
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
            recent.append({
                "date": m.kickoff_utc.isoformat() if m.kickoff_utc else None,
                "team_a_score": hs,
                "team_b_score": bs,
                "winner": winner,
                "team_a_name": home_name,
                "team_b_name": away_name,
            })
    return H2HRecordOut(total_matches=len(matches), team_a_wins=a_wins, team_b_wins=b_wins, recent_matches=recent)


def _team_form(db: Session, team_id: str, team_name: str) -> Optional[EsportsTeamFormOut]:
    try:
        row = (
            db.query(EsportsTeamForm)
            .filter(EsportsTeamForm.team_id == team_id)
            .order_by(EsportsTeamForm.as_of_date.desc())
            .first()
        )
        if row is None:
            return None
        return EsportsTeamFormOut(
            team_name=team_name,
            series_played=row.series_played,
            series_won=row.series_won,
            series_win_pct=row.series_win_pct,
            maps_played=row.maps_played,
            maps_won=row.maps_won,
            map_win_pct=row.map_win_pct,
            avg_adr=row.avg_adr,
            avg_kast=row.avg_kast,
            avg_rating=row.avg_rating,
            ct_win_pct=row.ct_win_pct,
            t_win_pct=row.t_win_pct,
            current_win_streak=row.current_win_streak,
            current_loss_streak=row.current_loss_streak,
            lan_win_pct=row.lan_win_pct,
            online_win_pct=row.online_win_pct,
            roster_stability_score=row.roster_stability_score,
        )
    except Exception:
        db.rollback()
        return None


# ─── Mock data generators ─────────────────────────────────────────────────────

CS2_MAP_POOL = ["Mirage", "Inferno", "Dust2", "Overpass", "Ancient", "Nuke", "Vertigo", "Anubis"]
_CS2_ROLES = ["rifler", "AWPer", "lurker", "entry", "IGL"]
LOL_ROLES = ["TOP", "JGL", "MID", "BOT", "SUP"]
LOL_CHAMPS = [
    "Aatrox", "Ahri", "Akali", "Aphelios", "Azir", "Camille", "Caitlyn",
    "Corki", "Ezreal", "Fiora", "Graves", "Jayce", "Jinx", "Kalista",
    "Lee Sin", "Leona", "Lucian", "Lulu", "Malphite", "Nautilus",
    "Orianna", "Poppy", "Renekton", "Syndra", "Thresh", "Tristana",
    "Varus", "Viktor", "Xin Zhao", "Zed", "Zeri", "Karma", "Jhin",
]


def _mock_cs2_data(home_name: str, away_name: str, home_score: Optional[int], away_score: Optional[int], match_id: str, status: str = "scheduled", current_state: Optional[dict] = None) -> dict:
    seed = sum(ord(c) for c in match_id) % 100

    # Build veto
    maps = CS2_MAP_POOL.copy()
    veto: list[EsportsVetoEntry] = []
    banned: list[str] = []

    def _veto_pick(idx: int) -> str:
        rem = [m for m in maps if m not in banned]
        return rem[idx % len(rem)]

    for team, action in [("b", "ban"), ("a", "ban"), ("a", "ban"), ("b", "ban"), ("a", "pick"), ("b", "pick")]:
        rem = [m for m in maps if m not in banned]
        mp = rem[(seed + len(veto)) % len(rem)]
        if action == "ban":
            banned.append(mp)
        veto.append(EsportsVetoEntry(action=action, team=team, map_name=mp))

    rem = [m for m in maps if m not in banned]
    decider = rem[0] if rem else "Mirage"
    veto.append(EsportsVetoEntry(action="left_over", team="decider", map_name=decider))

    picked_maps = [v.map_name for v in veto if v.action in ("pick", "left_over")]
    n_maps = (home_score or 0) + (away_score or 0)
    played = picked_maps[:max(n_maps, 1)] if n_maps > 0 else picked_maps[:1]

    map_results: list[EsportsMapOut] = []
    for i, map_name in enumerate(played):
        if n_maps == 0:
            # Live match mid-first-map: show plausible in-progress round score
            if status == "live":
                live_a = (current_state or {}).get("round_a")
                live_b = (current_state or {}).get("round_b")
                if live_a is None:
                    live_a = (seed % 10) + 4   # e.g. 8
                if live_b is None:
                    live_b = (seed + 7) % 10 + 2  # e.g. 5
                map_results.append(EsportsMapOut(
                    map_number=i+1, map_name=map_name,
                    team_a_score=live_a, team_b_score=live_b,
                ))
            else:
                map_results.append(EsportsMapOut(map_number=i+1, map_name=map_name))
            continue
        mw = "a" if i < (home_score or 0) else "b"
        variant = (seed + i) % 3
        if variant == 0:
            a_s, b_s = (16, 11) if mw == "a" else (11, 16)
        elif variant == 1:
            a_s, b_s = (16, 13) if mw == "a" else (13, 16)
        else:
            a_s, b_s = (19, 14) if mw == "a" else (14, 19)
        ct_split = (seed + i) % 2 == 0
        a_ct = min(a_s, 12) if ct_split else max(a_s - 12, 0)
        a_t = a_s - a_ct
        b_ct = min(b_s, 12) if not ct_split else max(b_s - 12, 0)
        b_t = b_s - b_ct
        ot = max(0, a_s + b_s - 30)
        map_results.append(EsportsMapOut(
            map_number=i+1, map_name=map_name,
            team_a_score=a_s, team_b_score=b_s,
            team_a_ct_rounds=a_ct, team_b_ct_rounds=b_ct,
            team_a_t_rounds=a_t, team_b_t_rounds=b_t,
            overtime_rounds=ot, winner=mw,
            side_bias=round((seed % 5 - 2) * 0.8, 1),
        ))

    # Add economy breakdown per map
    total_rounds_a = total_rounds_b = 0
    for mr in map_results:
        if mr.team_a_score is not None:
            n_r = (mr.team_a_score or 0) + (mr.team_b_score or 0)
            total_rounds_a += n_r
            total_rounds_b += n_r
            mr.economy_a = _mock_cs2_economy("a", n_r, seed + mr.map_number)
            mr.economy_b = _mock_cs2_economy("b", n_r, seed + mr.map_number + 50)

    total_rounds = max(total_rounds_a, 20)

    sa, sb = home_name[:3].upper(), away_name[:3].upper()
    base_a = [1.24, 1.18, 1.09, 0.98, 0.92]
    base_b = [1.21, 1.14, 1.06, 0.97, 0.89]
    players_a, players_b = [], []
    for j in range(5):
        ra = base_a[j] + (seed + j) % 10 * 0.02
        rb = base_b[j] + (seed + j * 2) % 10 * 0.02
        ka, kb = int(18 + (seed + j) % 8), int(17 + (seed + j * 2) % 8)
        players_a.append(EsportsPlayerStatsOut(
            player_name=f"{sa}_{_CS2_ROLES[j]}", team="a",
            kills=ka, deaths=int(15-j), assists=int(3+j),
            kd_ratio=round(ka/max(15-j,1),2), adr=round(75+ra*20-j*3,1),
            kast_pct=round(0.68+ra*0.1,2), rating_2=round(ra,2),
            headshot_pct=round(0.35+j*0.04,2), first_kills=int(3+j%3),
            first_deaths=int(2+(j+1)%3), clutches_won=int(j%3),
            flash_assists=int(2+j%4), utility_damage=round(18+ra*10-j*2,1),
            opening_kill_rate=round(0.35+j*0.03,2),
        ))
        players_b.append(EsportsPlayerStatsOut(
            player_name=f"{sb}_{_CS2_ROLES[j]}", team="b",
            kills=kb, deaths=int(16-j), assists=int(4+j),
            kd_ratio=round(kb/max(16-j,1),2), adr=round(72+rb*20-j*3,1),
            kast_pct=round(0.66+rb*0.1,2), rating_2=round(rb,2),
            headshot_pct=round(0.32+j*0.04,2), first_kills=int(2+j%3),
            first_deaths=int(3+j%3), clutches_won=int((j+1)%3),
            flash_assists=int(1+j%4), utility_damage=round(16+rb*10-j*2,1),
            opening_kill_rate=round(0.32+j*0.03,2),
        ))

    utility_a = _mock_cs2_utility("a", total_rounds, seed + 11)
    utility_b = _mock_cs2_utility("b", total_rounds, seed + 61)
    opening_a = _mock_opening_duels("a", total_rounds, f"{sa}_{_CS2_ROLES[0]}", seed + 22)
    opening_b = _mock_opening_duels("b", total_rounds, f"{sb}_{_CS2_ROLES[0]}", seed + 72)

    return {
        "maps": map_results, "veto": veto,
        "players_home": players_a, "players_away": players_b,
        "utility_home": utility_a, "utility_away": utility_b,
        "opening_home": opening_a, "opening_away": opening_b,
    }


def _mock_lol_data(home_name: str, away_name: str, home_score: Optional[int], away_score: Optional[int], match_id: str) -> dict:
    seed = sum(ord(c) for c in match_id) % 100
    n_games = max((home_score or 0) + (away_score or 0), 1)
    games: list[EsportsGameOut] = []
    used_champs: list[str] = []

    def pick_champ(offset: int) -> str:
        idx = (seed + offset) % len(LOL_CHAMPS)
        c = LOL_CHAMPS[idx]
        tries = 0
        while c in used_champs and tries < len(LOL_CHAMPS):
            idx = (idx + 1) % len(LOL_CHAMPS)
            c = LOL_CHAMPS[idx]
            tries += 1
        used_champs.append(c)
        return c

    for g in range(n_games):
        gw = "a" if g < (home_score or 0) else "b"
        dur = round(28 + (seed + g * 7) % 20, 1)
        gd15 = int((1500 + (seed + g * 13) % 2000) * (1 if gw == "a" else -1))
        if gw == "a":
            a_tow, b_tow, a_dr, b_dr, a_k, b_k = 11, 4, 4, 1, 24+seed%8, 14+seed%6
            a_bar, b_bar = 2, 0
        else:
            a_tow, b_tow, a_dr, b_dr, a_k, b_k = 3, 11, 1, 4, 12+seed%6, 23+seed%8
            a_bar, b_bar = 0, 2

        draft_a = [EsportsDraftPick(phase=f"ban_{i+1}", team="a", champion=pick_champ(i)) for i in range(5)]
        draft_a += [EsportsDraftPick(phase=f"pick_{i+1}", team="a", champion=pick_champ(i+10), role=LOL_ROLES[i]) for i in range(5)]
        draft_b = [EsportsDraftPick(phase=f"ban_{i+1}", team="b", champion=pick_champ(i+5)) for i in range(5)]
        draft_b += [EsportsDraftPick(phase=f"pick_{i+1}", team="b", champion=pick_champ(i+15), role=LOL_ROLES[i]) for i in range(5)]

        soul_type = _LOL_DRAGON_SOULS[(seed + g * 3) % len(_LOL_DRAGON_SOULS)] if (a_dr >= 4 or b_dr >= 4) else None
        blue_side = "a" if (seed + g) % 2 == 0 else "b"
        games.append(EsportsGameOut(
            game_number=g+1, duration_min=dur, winner=gw,
            team_a_obj=EsportsObjectiveStats(
                team="a", towers=a_tow, dragons=a_dr, barons=a_bar,
                heralds=1 if g%2==0 else 0, first_blood=gw=="a", first_tower=gw=="a",
                gold_total=int(55000+seed*100), kills=a_k, deaths=b_k, assists=int(a_k*2.1),
                dragon_soul=soul_type if gw=="a" else None,
                elder_dragon=a_dr>=4 and gw=="a",
                rifts_heralds=1 if g%2==0 else 0,
                inhibitors_destroyed=int(a_tow/4),
                ward_kills=int(12+seed%8), wards_placed=int(55+seed%20),
                cs_total=int(dur*9.2*5),
            ),
            team_b_obj=EsportsObjectiveStats(
                team="b", towers=b_tow, dragons=b_dr, barons=b_bar,
                heralds=0 if g%2==0 else 1, first_blood=gw=="b", first_tower=gw=="b",
                gold_total=int(50000+seed*80), kills=b_k, deaths=a_k, assists=int(b_k*2.0),
                dragon_soul=soul_type if gw=="b" else None,
                elder_dragon=b_dr>=4 and gw=="b",
                rifts_heralds=0 if g%2==0 else 1,
                inhibitors_destroyed=int(b_tow/4),
                ward_kills=int(10+seed%6), wards_placed=int(50+seed%18),
                cs_total=int(dur*8.8*5),
            ),
            gold_diff_at_10=int(gd15 * 0.55),
            gold_diff_at_15=gd15,
            gold_diff_at_20=int(gd15 * 1.35),
            draft_a=draft_a, draft_b=draft_b,
            patch="14.8" if seed % 2 == 0 else "14.9",
            blue_side=blue_side,
        ))

    sa, sb = home_name[:3].upper(), away_name[:3].upper()
    base_kda = [4.2, 6.1, 5.3, 4.8, 2.9]
    picks_a = [LOL_CHAMPS[(seed + i * 5) % len(LOL_CHAMPS)] for i in range(5)]
    picks_b = [LOL_CHAMPS[(seed + i * 7 + 3) % len(LOL_CHAMPS)] for i in range(5)]
    players_a, players_b = [], []
    for i, role in enumerate(LOL_ROLES):
        kda_a = round(base_kda[i] + (seed + i) % 30 * 0.1, 1)
        kda_b = round(base_kda[i] + (seed + i * 2) % 30 * 0.1 - 0.5, 1)
        champ_a = picks_a[i]
        champ_b = picks_b[i]
        players_a.append(EsportsPlayerStatsOut(
            player_name=f"{sa} {role.capitalize()}", team="a", role=role,
            kda=kda_a, kill_participation_pct=round(0.55+i*0.05+(seed%10)*0.01,2),
            cs_per_min=round(8.2-i*1.2+(seed%5)*0.1,1) if role!="SUP" else None,
            gold_per_min=round(380-i*20+seed%30,0),
            damage_pct=round(0.22-i*0.03+(seed%8)*0.01,2),
            vision_score_per_min=round(0.6+i*0.1,2),
            champion=champ_a,
            damage_per_min=round(480-i*40+seed%50,0) if role not in ("SUP",) else round(120+seed%40,0),
            ward_score=round(0.55+i*0.08+(seed%5)*0.02,2),
            penta_kills=1 if seed%7==i else 0,
            solo_kills=int(1+(seed+i)%4),
        ))
        players_b.append(EsportsPlayerStatsOut(
            player_name=f"{sb} {role.capitalize()}", team="b", role=role,
            kda=kda_b, kill_participation_pct=round(0.50+i*0.05+(seed%8)*0.01,2),
            cs_per_min=round(7.9-i*1.1+(seed%4)*0.1,1) if role!="SUP" else None,
            gold_per_min=round(370-i*20+seed%25,0),
            damage_pct=round(0.21-i*0.03+(seed%7)*0.01,2),
            vision_score_per_min=round(0.55+i*0.1,2),
            champion=champ_b,
            damage_per_min=round(460-i*40+seed%45,0) if role not in ("SUP",) else round(110+seed%35,0),
            ward_score=round(0.50+i*0.07+(seed%4)*0.02,2),
            penta_kills=0,
            solo_kills=int((seed+i)%3),
        ))

    comp_a = _mock_lol_comp("a", home_name, picks_a, seed)
    comp_b = _mock_lol_comp("b", away_name, picks_b, seed + 33)
    obj_a = _mock_lol_objectives("a", games, seed)
    obj_b = _mock_lol_objectives("b", games, seed + 44)

    return {
        "games": games, "players_home": players_a, "players_away": players_b,
        "comp_home": comp_a, "comp_away": comp_b,
        "obj_home": obj_a, "obj_away": obj_b,
    }


_LOL_COMP_TAGS = [
    ["engage", "teamfight", "frontline"],
    ["poke", "siege", "waveclear"],
    ["scaling", "hypercarry", "late-game"],
    ["split-push", "pick", "skirmish"],
    ["disengage", "peel", "protect-the-carry"],
    ["early-game", "invade", "snowball"],
]

_LOL_DRAGON_SOULS = ["Infernal", "Mountain", "Ocean", "Cloud", "Hextech", "Chemtech"]


def _mock_cs2_economy(team: str, n_rounds: int, seed: int) -> Cs2EconomyStatsOut:
    import random
    r = random.Random(seed)
    pistol = 2  # 2 pistol rounds per half (assuming 2 halves)
    pistol_won = r.randint(0, pistol)
    eco = r.randint(2, 6)
    eco_wins = r.randint(0, max(1, eco // 3))
    force = r.randint(2, 5)
    force_wins = r.randint(0, force // 2)
    full = n_rounds - eco - force - pistol
    full_wins = r.randint(max(0, full - 5), full)
    return Cs2EconomyStatsOut(
        team=team,
        pistol_rounds_played=pistol, pistol_rounds_won=pistol_won,
        pistol_win_pct=round(pistol_won / pistol, 2),
        eco_rounds=eco, eco_wins=eco_wins,
        eco_win_pct=round(eco_wins / max(eco, 1), 2),
        anti_eco_rounds=eco, anti_eco_wins=eco - eco_wins,
        force_buy_rounds=force, force_buy_wins=force_wins,
        force_buy_win_pct=round(force_wins / max(force, 1), 2),
        full_buy_rounds=full, full_buy_wins=full_wins,
        full_buy_win_pct=round(full_wins / max(full, 1), 2),
        avg_starting_money=round(r.uniform(2200, 3800), 0),
        avg_equipment_value=round(r.uniform(3500, 5200), 0),
        conversion_after_pistol_win=round(r.uniform(0.55, 0.78), 2),
    )


def _mock_cs2_utility(team: str, n_rounds: int, seed: int) -> Cs2UtilityStatsOut:
    import random
    r = random.Random(seed)
    return Cs2UtilityStatsOut(
        team=team,
        flashes_thrown=int(r.uniform(1.8, 3.0) * n_rounds),
        flash_assists=int(r.uniform(0.3, 0.8) * n_rounds),
        enemies_flashed_per_round=round(r.uniform(0.8, 1.8), 2),
        he_damage_per_round=round(r.uniform(12, 28), 1),
        smokes_thrown=int(r.uniform(1.2, 2.5) * n_rounds),
        molotovs_thrown=int(r.uniform(0.5, 1.2) * n_rounds),
        utility_damage_per_round=round(r.uniform(18, 45), 1),
        utility_per_round=round(r.uniform(4.0, 7.5), 2),
    )


def _mock_opening_duels(team: str, n_rounds: int, opener_name: str, seed: int) -> Cs2OpeningDuelOut:
    import random
    r = random.Random(seed)
    attempts = int(r.uniform(0.35, 0.55) * n_rounds)
    wins = int(attempts * r.uniform(0.45, 0.65))
    return Cs2OpeningDuelOut(
        team=team,
        opening_duels=attempts, opening_wins=wins,
        opening_win_pct=round(wins / max(attempts, 1), 2),
        opening_attempts_per_round=round(attempts / max(n_rounds, 1), 2),
        top_opener=opener_name,
        top_opener_win_pct=round(r.uniform(0.48, 0.68), 2),
    )


def _mock_lol_comp(team: str, team_name: str, picks: list[str], seed: int) -> LolTeamCompOut:
    import random
    r = random.Random(seed)
    tags = r.choice(_LOL_COMP_TAGS)
    is_early = "early-game" in tags or "invade" in tags
    return LolTeamCompOut(
        team=team,
        comp_tags=tags,
        avg_game_duration_min=round(r.uniform(24, 38), 1),
        early_game_win_pct=round(r.uniform(0.60, 0.85), 2) if is_early else round(r.uniform(0.30, 0.55), 2),
        late_game_win_pct=round(r.uniform(0.30, 0.55), 2) if is_early else round(r.uniform(0.60, 0.82), 2),
        blue_side_picks=picks[:3],
        red_side_picks=picks[2:5] if len(picks) >= 5 else picks,
        banned_by_opponent=[LOL_CHAMPS[(seed + i * 7) % len(LOL_CHAMPS)] for i in range(3)],
        first_pick_champions=[picks[0]] if picks else [],
    )


def _mock_lol_objectives(team: str, games: list[EsportsGameOut], seed: int) -> LolObjectiveControlOut:
    import random
    r = random.Random(seed)
    obj_list = [g.team_a_obj if team == "a" else g.team_b_obj for g in games]
    obj_list = [o for o in obj_list if o is not None]
    total_dr = sum(o.dragons or 0 for o in obj_list)
    total_bar = sum(o.barons or 0 for o in obj_list)
    total_her = sum(o.heralds or 0 for o in obj_list)
    total_tow = sum(o.towers or 0 for o in obj_list)
    fb_wins = sum(1 for o in obj_list if o.first_blood)
    ft_wins = sum(1 for o in obj_list if o.first_tower)
    n = max(len(obj_list), 1)
    return LolObjectiveControlOut(
        team=team,
        total_dragons=total_dr, total_barons=total_bar,
        total_heralds=total_her, total_towers=total_tow,
        total_inhibitors=int(total_bar * 1.2),
        first_blood_rate=round(fb_wins / n, 2),
        first_tower_rate=round(ft_wins / n, 2),
        dragon_soul_secured=sum(1 for o in obj_list if (o.dragons or 0) >= 4),
        elder_dragon_secured=sum(1 for o in obj_list if getattr(o, "elder_dragon", False)),
        avg_gold_diff_at_10=round(r.uniform(-800, 800), 0),
        avg_gold_diff_at_15=round(r.uniform(-1500, 1500), 0),
        avg_gold_diff_at_20=round(r.uniform(-2500, 2500), 0),
    )


def _mock_form(team_name: str, game_type: str, seed: int) -> EsportsTeamFormOut:
    sw = round(0.55 + (seed % 20) * 0.01, 2)
    mw = round(0.58 + (seed % 15) * 0.01, 2)
    is_cs2 = game_type in ("cs2", "valorant")
    is_lol = game_type in ("lol", "dota2")
    return EsportsTeamFormOut(
        team_name=team_name, series_played=20+seed%10, series_won=int((20+seed%10)*sw),
        series_win_pct=sw, maps_played=50+seed%25, maps_won=int((50+seed%25)*mw),
        map_win_pct=mw,
        avg_adr=round(75+(seed%20),1) if is_cs2 else None,
        avg_kast=round(0.68+(seed%10)*0.01,2) if is_cs2 else None,
        avg_rating=round(1.04+(seed%15)*0.01,2) if is_cs2 else None,
        ct_win_pct=round(0.52+(seed%10)*0.01,2) if is_cs2 else None,
        t_win_pct=round(0.50+(seed%12)*0.01,2) if is_cs2 else None,
        current_win_streak=seed%4, current_loss_streak=0 if seed%4>0 else seed%3,
        lan_win_pct=round(0.60+(seed%15)*0.01,2),
        online_win_pct=round(0.55+(seed%12)*0.01,2),
        roster_stability_score=round(0.70+(seed%30)*0.01,2),
        # CS2 extended
        pistol_round_win_pct=round(0.50+(seed%15)*0.02,2) if is_cs2 else None,
        eco_win_pct=round(0.20+(seed%10)*0.02,2) if is_cs2 else None,
        force_buy_win_pct=round(0.35+(seed%12)*0.02,2) if is_cs2 else None,
        avg_clutch_rate=round(0.30+(seed%15)*0.02,2) if is_cs2 else None,
        # LoL extended
        avg_game_duration_min=round(29+(seed%10),1) if is_lol else None,
        avg_first_blood_pct=round(0.52+(seed%15)*0.02,2) if is_lol else None,
        avg_dragons_per_game=round(2.5+(seed%8)*0.2,1) if is_lol else None,
        avg_towers_per_game=round(6+(seed%6)*0.5,1) if is_lol else None,
        blue_side_win_pct=round(0.52+(seed%12)*0.02,2) if is_lol else None,
        red_side_win_pct=round(0.48+(seed%10)*0.02,2) if is_lol else None,
    )


# ─── Service ──────────────────────────────────────────────────────────────────

class EsportsMatchService(BaseMatchListService):

    def get_match_list(self, db, *, status=None, league=None, date_from=None, date_to=None, limit=50, offset=0):
        q = db.query(CoreMatch).filter(CoreMatch.sport == "esports")
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
            league_name = _league_name(db, m.league_id)
            game_type = _detect_game_type(league_name)
            r_home = _elo_snapshot_rating(db, m.home_team_id) or 1500.0
            r_away = _elo_snapshot_rating(db, m.away_team_id) or 1500.0
            p_home = round(1.0 / (1.0 + 10 ** (-(r_home - r_away) / 400.0)), 4)
            p_away = round(1.0 - p_home, 4)
            seed = sum(ord(c) for c in m.id) % 100
            items.append(EsportsMatchListItem(
                id=m.id, league=league_name, season=m.season,
                kickoff_utc=m.kickoff_utc, status=m.status,
                home_id=m.home_team_id, home_name=home_name,
                away_id=m.away_team_id, away_name=away_name,
                home_score=m.home_score, away_score=m.away_score, outcome=m.outcome,
                live_clock=m.live_clock if m.status == "live" else None,
                current_period=m.current_period if m.status == "live" else None,
                elo_home=r_home,
                elo_away=r_away,
                game_type=game_type,
                p_home=p_home,
                p_away=p_away,
                confidence=52 + (seed % 28),
            ))
        return EsportsMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> EsportsMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "esports":
            raise HTTPException(status_code=404, detail=f"Esports match {match_id} not found")

        home_name = _name(db, match.home_team_id)
        away_name = _name(db, match.away_team_id)
        league_name = _league_name(db, match.league_id)
        game_type = _detect_game_type(league_name)
        seed = sum(ord(c) for c in match_id) % 100

        elo_home = _elo_panel(db, match.home_team_id, home_name)
        elo_away = _elo_panel(db, match.away_team_id, away_name)

        # Prediction
        live_registry = db.query(ModelRegistry).filter_by(is_live=True).first()
        pred = None
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

        if pred:
            p_h = round(pred.p_home, 4)
            p_a = round(pred.p_away, 4)
            probabilities = ProbabilitiesOut(home_win=p_h, away_win=p_a)
            fair_odds = FairOddsOut(
                home_win=round(1/p_h, 2) if p_h > 0 else None,
                away_win=round(1/p_a, 2) if p_a > 0 else None,
            )
            confidence = pred.confidence
            key_drivers = [KeyDriverOut(feature=d.get("feature",""), value=d.get("value"), importance=d.get("importance",0.0)) for d in (pred.key_drivers or [])]
        elif elo_home and elo_away:
            r_diff = elo_home.overall_rating - elo_away.overall_rating
            p_h = round(1.0 / (1.0 + math.pow(10, -r_diff / 400.0)), 4)
            p_a = round(1.0 - p_h, 4)
            probabilities = ProbabilitiesOut(home_win=p_h, away_win=p_a)
            fair_odds = FairOddsOut(home_win=round(1/p_h, 2) if p_h > 0 else None, away_win=round(1/p_a, 2) if p_a > 0 else None)
        elif match.odds_home and match.odds_away:
            raw_h = 1.0 / match.odds_home
            raw_a = 1.0 / match.odds_away
            tot = raw_h + raw_a
            p_h, p_a = round(raw_h/tot, 4), round(raw_a/tot, 4)
            probabilities = ProbabilitiesOut(home_win=p_h, away_win=p_a)
            fair_odds = FairOddsOut(home_win=round(1/p_h,2) if p_h>0 else None, away_win=round(1/p_a,2) if p_a>0 else None)

        if live_registry:
            metrics = live_registry.metrics or {}
            model_meta = ModelMetaOut(version=live_registry.model_name, algorithm=live_registry.algorithm,
                trained_at=live_registry.trained_at, accuracy=metrics.get("accuracy"),
                brier_score=metrics.get("brier_score"), n_train_samples=live_registry.n_train_samples)

        # Match info
        series_format, is_lan, patch_version = "bo3", False, None
        try:
            em = db.get(EsportsMatch, match_id)
            if em:
                series_format = em.format or "bo3"
                is_lan = bool(em.is_lan)
        except Exception:
            db.rollback()

        match_info = EsportsMatchInfo(
            game_type=game_type, series_format=series_format, is_lan=is_lan,
            patch_version=patch_version or ("14.8" if game_type == "lol" else "1.39.1"),
            tournament_tier="a_tier",
        )

        form_home = _team_form(db, match.home_team_id, home_name) or _mock_form(home_name, game_type, seed)
        form_away = _team_form(db, match.away_team_id, away_name) or _mock_form(away_name, game_type, (seed+17)%100)
        h2h = _h2h(db, match.home_team_id, match.away_team_id, home_name, away_name)

        # Game-specific data with mock fallback
        maps_data: list[EsportsMapOut] = []
        veto_data: list[EsportsVetoEntry] = []
        players_home: list[EsportsPlayerStatsOut] = []
        players_away: list[EsportsPlayerStatsOut] = []
        games_data: list[EsportsGameOut] = []
        cs2_econ_home: list[Cs2EconomyStatsOut] = []
        cs2_econ_away: list[Cs2EconomyStatsOut] = []
        cs2_util_home: Cs2UtilityStatsOut | None = None
        cs2_util_away: Cs2UtilityStatsOut | None = None
        cs2_open_home: Cs2OpeningDuelOut | None = None
        cs2_open_away: Cs2OpeningDuelOut | None = None
        lol_comp_home: LolTeamCompOut | None = None
        lol_comp_away: LolTeamCompOut | None = None
        lol_obj_home: LolObjectiveControlOut | None = None
        lol_obj_away: LolObjectiveControlOut | None = None

        has_real_data = False
        try:
            em = db.get(EsportsMatch, match_id)
            if em and em.map_results:
                has_real_data = True
                for mr in sorted(em.map_results, key=lambda r: r.map_number):
                    maps_data.append(EsportsMapOut(
                        map_number=mr.map_number, map_name=mr.map_id or "Unknown",
                        team_a_score=mr.team_a_score, team_b_score=mr.team_b_score,
                        team_a_ct_rounds=mr.team_a_ct_rounds, team_b_ct_rounds=mr.team_b_ct_rounds,
                        overtime_rounds=mr.overtime_rounds or 0,
                        winner="a" if mr.winner_team_id == match.home_team_id else "b",
                        side_bias=mr.side_bias,
                    ))
                if em.veto_json:
                    for v in em.veto_json:
                        veto_data.append(EsportsVetoEntry(action=v.get("action","ban"), team=v.get("team","a"), map_name=v.get("map","")))
        except Exception:
            db.rollback()

        # Try HLTV scraped data (CS2 only) if no PandaScore data
        if not has_real_data and game_type in ("cs2", "valorant"):
            try:
                hltv = db.query(HltvMatchStats).filter_by(core_match_id=match_id).first()
                if hltv:
                    has_real_data = True
                    # Maps
                    for i, m in enumerate(hltv.maps or [], start=1):
                        home_sc = m.get("home_score")
                        away_sc = m.get("away_score")
                        winner_str = m.get("winner")
                        maps_data.append(EsportsMapOut(
                            map_number=i,
                            map_name=m.get("map_name", "Unknown"),
                            team_a_score=home_sc,
                            team_b_score=away_sc,
                            winner="a" if winner_str == "home" else ("b" if winner_str == "away" else None),
                        ))
                    # Veto from raw text → parse lines like "Team picked Mirage"
                    if hltv.veto_text:
                        for line in hltv.veto_text.splitlines():
                            line = line.strip()
                            if not line:
                                continue
                            action = "pick" if "pick" in line.lower() else "ban" if "ban" in line.lower() else "left_over"
                            team = "a" if home_name.lower() in line.lower() else "b"
                            # extract map name — last capitalised word
                            parts = line.split()
                            map_name = parts[-1] if parts else ""
                            veto_data.append(EsportsVetoEntry(action=action, team=team, map_name=map_name))
                    # Players
                    for p in hltv.players_home or []:
                        k, d = p.get("kills"), p.get("deaths")
                        players_home.append(EsportsPlayerStatsOut(
                            player_name=p.get("name", ""),
                            team="a",
                            kills=k, deaths=d,
                            kd_ratio=round(k/d, 2) if k and d else None,
                            adr=p.get("adr"),
                            kast_pct=p.get("kast_pct"),
                            rating_2=p.get("rating_2"),
                        ))
                    for p in hltv.players_away or []:
                        k, d = p.get("kills"), p.get("deaths")
                        players_away.append(EsportsPlayerStatsOut(
                            player_name=p.get("name", ""),
                            team="b",
                            kills=k, deaths=d,
                            kd_ratio=round(k/d, 2) if k and d else None,
                            adr=p.get("adr"),
                            kast_pct=p.get("kast_pct"),
                            rating_2=p.get("rating_2"),
                        ))
                    # Update match_info with real format/LAN
                    match_info = EsportsMatchInfo(
                        game_type=game_type,
                        series_format=hltv.format or "bo3",
                        is_lan=hltv.is_lan,
                        patch_version=match_info.patch_version,
                        tournament_tier=match_info.tournament_tier,
                    )
            except Exception:
                db.rollback()

        # No mock fallback — leave all lists empty when real data is unavailable

        # Betting lines
        p_h = probabilities.home_win if probabilities else 0.5
        p_a = probabilities.away_win if probabilities else 0.5
        betting = {
            "home_ml": round(1 / p_h, 2) if p_h > 0 else None,
            "away_ml": round(1 / p_a, 2) if p_a > 0 else None,
            "series_total": 2.5,
            "home_handicap": -1.5 if p_h > 0.65 else 1.5,
        }

        # Derive current_period for live esports from EsportsMapResult (highest map_number played)
        esports_current_period = match.current_period if match.status == "live" else None
        esports_current_state = match.current_state_json if match.status == "live" else None
        if match.status == "live" and esports_current_period is None:
            try:
                em_live = db.get(EsportsMatch, match_id)
                if em_live and em_live.map_results:
                    played_maps = [mr for mr in em_live.map_results]
                    if played_maps:
                        esports_current_period = max(mr.map_number for mr in played_maps)
            except Exception:
                pass

        return EsportsMatchDetail(
            id=match.id, sport="esports", league=league_name, season=match.season,
            kickoff_utc=match.kickoff_utc, status=match.status,
            home=ParticipantOut(id=match.home_team_id, name=home_name),
            away=ParticipantOut(id=match.away_team_id, name=away_name),
            home_score=match.home_score, away_score=match.away_score, outcome=match.outcome,
            live_clock=match.live_clock if match.status == "live" else None,
            current_period=esports_current_period,
            current_state=esports_current_state,
            probabilities=probabilities, fair_odds=fair_odds, confidence=confidence,
            key_drivers=key_drivers, model=model_meta,
            elo_home=elo_home, elo_away=elo_away, h2h=h2h,
            match_info=match_info, form_home=form_home, form_away=form_away,
            maps=maps_data, veto=veto_data, players_home=players_home, players_away=players_away,
            cs2_economy_home=cs2_econ_home, cs2_economy_away=cs2_econ_away,
            cs2_utility_home=cs2_util_home, cs2_utility_away=cs2_util_away,
            cs2_opening_duels_home=cs2_open_home, cs2_opening_duels_away=cs2_open_away,
            games=games_data,
            lol_comp_home=lol_comp_home, lol_comp_away=lol_comp_away,
            lol_objectives_home=lol_obj_home, lol_objectives_away=lol_obj_away,
            betting=betting,
        )
