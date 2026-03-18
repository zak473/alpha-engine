"""Esports match service."""

from __future__ import annotations

import logging
import math

log = logging.getLogger(__name__)
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
    change = round(latest.rating_after - latest.rating_before, 1)
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
    except Exception as exc:
        log.warning("esports_team_form_failed team=%s err=%s", team_id, exc)
        db.rollback()
        return None


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

        # Batch-load teams and leagues for logos
        all_team_ids = {m.home_team_id for m in rows} | {m.away_team_id for m in rows}
        all_league_ids = {m.league_id for m in rows if m.league_id}
        all_match_ids = [m.id for m in rows]
        team_map = {t.id: t for t in db.query(CoreTeam).filter(CoreTeam.id.in_(all_team_ids)).all()} if all_team_ids else {}
        league_map = {lg.id: lg for lg in db.query(CoreLeague).filter(CoreLeague.id.in_(all_league_ids)).all()} if all_league_ids else {}
        pred_map = {p.match_id: p for p in db.query(PredMatch).filter(PredMatch.match_id.in_(all_match_ids)).all()} if all_match_ids else {}

        items = []
        for m in rows:
            ht = team_map.get(m.home_team_id)
            at = team_map.get(m.away_team_id)
            lg = league_map.get(m.league_id)
            home_name = ht.name if ht else m.home_team_id
            away_name = at.name if at else m.away_team_id
            league_name = lg.name if lg else "Unknown Circuit"
            game_type = _detect_game_type(league_name)
            r_home = _elo_snapshot_rating(db, m.home_team_id) or 1500.0
            r_away = _elo_snapshot_rating(db, m.away_team_id) or 1500.0
            p_home = round(1.0 / (1.0 + 10 ** (-(r_home - r_away) / 400.0)), 4)
            p_away = round(1.0 - p_home, 4)
            pred = pred_map.get(m.id)
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
                confidence=pred.confidence if pred else None,
                odds_home=m.odds_home,
                odds_away=m.odds_away,
                home_logo=ht.logo_url if ht else None,
                away_logo=at.logo_url if at else None,
                league_logo=lg.logo_url if lg else None,
            ))
        return EsportsMatchListResponse(items=items, total=total)

    def get_match_detail(self, match_id: str, db: Session) -> EsportsMatchDetail:
        match = db.get(CoreMatch, match_id)
        if match is None or match.sport != "esports":
            raise HTTPException(status_code=404, detail=f"Esports match {match_id} not found")

        home_team = db.get(CoreTeam, match.home_team_id)
        away_team = db.get(CoreTeam, match.away_team_id)
        home_name = home_team.name if home_team else match.home_team_id
        away_name = away_team.name if away_team else match.away_team_id
        home_logo = home_team.logo_url if home_team else None
        away_logo = away_team.logo_url if away_team else None
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
        else:
            # ELO fallback with 1500 default — ensures probabilities always render
            r_h = elo_home.overall_rating if elo_home else 1500.0
            r_a = elo_away.overall_rating if elo_away else 1500.0
            p_h = round(1.0 / (1.0 + math.pow(10, -(r_h - r_a) / 400.0)), 4)
            p_a = round(1.0 - p_h, 4)
            probabilities = ProbabilitiesOut(home_win=p_h, away_win=p_a)
            fair_odds = FairOddsOut(home_win=round(1/p_h, 2) if p_h > 0 else None, away_win=round(1/p_a, 2) if p_a > 0 else None)

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
        except Exception as exc:
            log.warning("esports_match_info_failed match=%s err=%s", match_id, exc)
            db.rollback()

        match_info = EsportsMatchInfo(
            game_type=game_type, series_format=series_format, is_lan=is_lan,
            patch_version=patch_version or ("14.8" if game_type == "lol" else "1.39.1"),
            tournament_tier="a_tier",
        )

        form_home = _team_form(db, match.home_team_id, home_name)
        form_away = _team_form(db, match.away_team_id, away_name)
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
        except Exception as exc:
            log.warning("esports_map_data_failed match=%s err=%s", match_id, exc)
            db.rollback()

        # Try HLTV scraped data (CS2 only) if no map data
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
            except Exception as exc:
                log.warning("esports_hltv_data_failed match=%s err=%s", match_id, exc)
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
            except Exception as exc:
                log.warning("esports_live_period_failed match=%s err=%s", match_id, exc)

        return EsportsMatchDetail(
            id=match.id, sport="esports", league=league_name, season=match.season,
            kickoff_utc=match.kickoff_utc, status=match.status,
            home=ParticipantOut(id=match.home_team_id, name=home_name, logo_url=home_logo),
            away=ParticipantOut(id=match.away_team_id, name=away_name, logo_url=away_logo),
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

    def preview_match(self, home_name: str, away_name: str, db: Session) -> EsportsMatchDetail:
        """ELO-based preview for an esports match not yet in the DB."""
        from datetime import datetime, timezone
        from db.models.mvp import CoreTeam

        def _find_team(name: str) -> Optional[CoreTeam]:
            teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{name}%")).all()
            if not teams:
                for word in [w for w in name.split() if len(w) > 3]:
                    teams = db.query(CoreTeam).filter(CoreTeam.name.ilike(f"%{word}%")).all()
                    if teams:
                        break
            if not teams:
                return None
            for t in teams:
                if t.provider_id and "esports" in t.provider_id:
                    return t
            return teams[0]

        home_team = _find_team(home_name)
        away_team = _find_team(away_name)

        home_id = home_team.id if home_team else f"preview-home-{home_name.lower().replace(' ', '-')}"
        away_id = away_team.id if away_team else f"preview-away-{away_name.lower().replace(' ', '-')}"
        hname = home_team.name if home_team else home_name
        aname = away_team.name if away_team else away_name

        elo_h = _elo_panel(db, home_id, hname) if home_team else None
        elo_a = _elo_panel(db, away_id, aname) if away_team else None

        r_h = elo_h.overall_rating if elo_h else 1500.0
        r_a = elo_a.overall_rating if elo_a else 1500.0
        p_home = round(1.0 / (1.0 + math.pow(10, -(r_h - r_a) / 400.0)), 4)
        p_away = round(1.0 - p_home, 4)
        probs = ProbabilitiesOut(home_win=p_home, away_win=p_away)
        fair_odds = FairOddsOut(
            home_win=round(1 / p_home, 2) if p_home > 0 else None,
            away_win=round(1 / p_away, 2) if p_away > 0 else None,
        )
        key_drivers = [KeyDriverOut(feature="ELO Differential", importance=1.0, value=round(r_h - r_a, 1))]

        h2h = _h2h(db, home_id, away_id, hname, aname) if home_team and away_team else H2HRecordOut(total_matches=0, team_a_wins=0, team_b_wins=0, recent_matches=[])
        form_h = _team_form(db, home_id, hname) if home_team else None
        form_a = _team_form(db, away_id, aname) if away_team else None

        return EsportsMatchDetail(
            id=f"preview-{home_id}-{away_id}",
            sport="esports",
            league="Unknown",
            kickoff_utc=datetime.now(timezone.utc),
            status="scheduled",
            home=ParticipantOut(id=home_id, name=hname, logo_url=home_team.logo_url if home_team else None),
            away=ParticipantOut(id=away_id, name=aname, logo_url=away_team.logo_url if away_team else None),
            probabilities=probs,
            fair_odds=fair_odds,
            key_drivers=key_drivers or [],
            elo_home=elo_h,
            elo_away=elo_a,
            h2h=h2h,
            form_home=form_h,
            form_away=form_a,
        )
