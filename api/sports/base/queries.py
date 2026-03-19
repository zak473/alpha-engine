"""Shared query utilities used across sport services."""

from __future__ import annotations
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch, CoreTeam


def parse_hl_score(state: dict) -> tuple[int | None, int | None]:
    """Parse a Highlightly state dict → (home_score, away_score)."""
    score_data = state.get("score") or {}
    raw = score_data.get("current") or score_data.get("fulltime") or ""
    parts = str(raw).replace(" ", "").split("-")
    if len(parts) == 2:
        try:
            return int(parts[0]), int(parts[1])
        except ValueError:
            pass
    return None, None


def is_hl_match_finished(state: dict) -> bool:
    """Return True if a Highlightly match state describes a finished match."""
    desc = (state.get("description") or "").lower().strip()
    finished_keywords = {"finished", "final", "ft", "aet", "pen", "after extra time",
                        "after penalties", "ended", "awarded", "walkover"}
    return desc in finished_keywords or desc.startswith("final")


def h2h_from_hl(hl_matches: list[dict[str, Any]], home_name: str, away_name: str) -> dict | None:
    """
    Parse a Highlightly headtohead response into a dict compatible with H2HRecordOut.
    Perspective: home_name = the current match's home team.
    Returns None if no usable matches found.
    """
    if not hl_matches:
        return None

    home_wins = draws = away_wins = 0
    recent: list[dict] = []
    home_lower = home_name.lower()

    for m in hl_matches[:10]:
        home = m.get("homeTeam") or {}
        state = m.get("state") or {}

        if not is_hl_match_finished(state):
            continue

        h_score, a_score = parse_hl_score(state)
        if h_score is None or a_score is None:
            continue

        # Determine if our "home" team played as home in this historical match
        hl_home_name = (home.get("name") or "").lower()
        our_home_is_hl_home = home_lower in hl_home_name or hl_home_name in home_lower

        view_h, view_a = (h_score, a_score) if our_home_is_hl_home else (a_score, h_score)

        if view_h > view_a:
            home_wins += 1
            outcome = "home_win"
        elif view_a > view_h:
            away_wins += 1
            outcome = "away_win"
        else:
            draws += 1
            outcome = "draw"

        if len(recent) < 5:
            recent.append({
                "date": m.get("date"),
                "home_score": view_h,
                "away_score": view_a,
                "outcome": outcome,
                "home_name": home_name,
                "away_name": away_name,
            })

    total = home_wins + draws + away_wins
    if total == 0:
        return None
    return {
        "total_matches": total,
        "home_wins": home_wins,
        "draws": draws,
        "away_wins": away_wins,
        "recent_matches": recent,
    }


def form_from_hl(hl_matches: list[dict[str, Any]], team_name: str) -> dict | None:
    """
    Parse a Highlightly lastfivegames response into a generic form dict.
    Returns dict with keys: wins, draws, losses, form_pts, gf_avg, ga_avg, form_seq
    Returns None if not enough data.
    """
    if not hl_matches:
        return None

    w = d = l = pts = 0
    gf_list: list[float] = []
    ga_list: list[float] = []
    form_seq: list[str] = []
    team_lower = team_name.lower()

    for m in hl_matches[:5]:
        home = m.get("homeTeam") or {}
        state = m.get("state") or {}

        if not is_hl_match_finished(state):
            continue

        h_score, a_score = parse_hl_score(state)
        if h_score is None or a_score is None:
            continue

        hl_home_name = (home.get("name") or "").lower()
        is_home = team_lower in hl_home_name or hl_home_name in team_lower

        gf = float(h_score if is_home else a_score)
        ga = float(a_score if is_home else h_score)

        if h_score > a_score:
            result = "W" if is_home else "L"
        elif a_score > h_score:
            result = "L" if is_home else "W"
        else:
            result = "D"

        gf_list.append(gf)
        ga_list.append(ga)
        form_seq.append(result)
        if result == "W":
            pts += 3; w += 1
        elif result == "D":
            pts += 1; d += 1
        else:
            l += 1

    if not form_seq:
        return None
    return {
        "wins": w, "draws": d, "losses": l,
        "form_pts": pts,
        "gf_avg": round(sum(gf_list) / len(gf_list), 2) if gf_list else None,
        "ga_avg": round(sum(ga_list) / len(ga_list), 2) if ga_list else None,
        "form_seq": form_seq,
    }


def compute_league_context(
    session: Session,
    sport: str,
    league_id: Optional[str],
    season: Optional[str],
    home_id: str,
    away_id: str,
) -> Optional[dict]:
    """
    Build league context dict for a match, compatible with LeagueContextSection in frontend.
    Tries CoreStanding table first (Highlightly data), falls back to computing from CoreMatch history.
    Returns dict with home_position, away_position, home_points, etc. or None if no data.
    """
    from db.models.mvp import CoreStanding

    if not league_id:
        return None

    # --- Try CoreStanding table first (populated by Highlightly standings pipeline) ---
    q = session.query(CoreStanding).filter(CoreStanding.league_id == league_id)
    if season:
        q = q.filter(CoreStanding.season == season)
    rows = q.order_by(CoreStanding.position).all()

    if rows:
        home_row = next((r for r in rows if r.team_id == home_id), None)
        away_row = next((r for r in rows if r.team_id == away_id), None)

        if home_row or away_row:
            n = len(rows)
            top4_pts = rows[3].points if n >= 4 else None
            rel_pts = rows[max(0, n - 3)].points if n >= 3 else None

            home_pts = home_row.points if home_row else None
            away_pts = away_row.points if away_row else None

            return {
                "home_position": home_row.position if home_row else None,
                "away_position": away_row.position if away_row else None,
                "home_points": home_pts,
                "away_points": away_pts,
                "home_games_played": home_row.played if home_row else None,
                "away_games_played": away_row.played if away_row else None,
                "points_gap": (home_pts - away_pts) if home_pts is not None and away_pts is not None else None,
                "top_4_gap_home": (home_pts - top4_pts) if home_pts is not None and top4_pts is not None else None,
                "relegation_gap_away": (away_pts - rel_pts) if away_pts is not None and rel_pts is not None else None,
            }

    # --- Fallback: compute from CoreMatch history ---
    q2 = session.query(CoreMatch).filter(
        CoreMatch.sport == sport,
        CoreMatch.league_id == league_id,
        CoreMatch.status == "finished",
    )
    if season:
        q2 = q2.filter(CoreMatch.season == season)
    matches = q2.all()

    if not matches:
        return None

    standings: dict[str, dict] = {}
    for m in matches:
        for tid in [m.home_team_id, m.away_team_id]:
            if tid not in standings:
                standings[tid] = {"pts": 0, "gp": 0}
        standings[m.home_team_id]["gp"] += 1
        standings[m.away_team_id]["gp"] += 1
        # Use 2pts/0pts for binary win/loss sports; draw = 1pt each
        if m.outcome == "home_win":
            standings[m.home_team_id]["pts"] += 2
        elif m.outcome == "away_win":
            standings[m.away_team_id]["pts"] += 2
        else:
            standings[m.home_team_id]["pts"] += 1
            standings[m.away_team_id]["pts"] += 1

    sorted_teams = sorted(standings.keys(), key=lambda t: -standings[t]["pts"])
    position_map = {tid: i + 1 for i, tid in enumerate(sorted_teams)}
    n = len(sorted_teams)

    home_pos = position_map.get(home_id)
    away_pos = position_map.get(away_id)
    if home_pos is None and away_pos is None:
        return None

    home_s = standings.get(home_id, {"pts": 0, "gp": 0})
    away_s = standings.get(away_id, {"pts": 0, "gp": 0})
    top4_pts = standings[sorted_teams[3]]["pts"] if n >= 4 else None
    rel_pts = standings[sorted_teams[max(0, n - 3)]]["pts"] if n >= 3 else None

    return {
        "home_position": home_pos,
        "away_position": away_pos,
        "home_points": home_s["pts"],
        "away_points": away_s["pts"],
        "home_games_played": home_s["gp"],
        "away_games_played": away_s["gp"],
        "points_gap": home_s["pts"] - away_s["pts"],
        "top_4_gap_home": (home_s["pts"] - top4_pts) if top4_pts is not None else None,
        "relegation_gap_away": (away_s["pts"] - rel_pts) if rel_pts is not None else None,
    }


def compute_team_form(session: Session, sport: str, team_id: str, limit: int = 10) -> list[dict]:
    matches = (
        session.query(CoreMatch)
        .filter(
            CoreMatch.sport == sport,
            CoreMatch.status == "finished",
            or_(CoreMatch.home_team_id == team_id, CoreMatch.away_team_id == team_id),
        )
        .order_by(CoreMatch.kickoff_utc.desc())
        .limit(limit)
        .all()
    )
    results = []
    for m in matches:
        is_home = m.home_team_id == team_id
        pts_for = m.home_score if is_home else m.away_score
        pts_against = m.away_score if is_home else m.home_score
        opp_id = m.away_team_id if is_home else m.home_team_id
        opp = session.get(CoreTeam, opp_id)
        if m.outcome == "home_win":
            result = "W" if is_home else "L"
        elif m.outcome == "away_win":
            result = "L" if is_home else "W"
        else:
            result = "D"
        results.append({
            "date": m.kickoff_utc.date().isoformat(),
            "opponent": opp.name if opp else opp_id,
            "home_away": "H" if is_home else "A",
            "pts_for": pts_for,
            "pts_against": pts_against,
            "result": result,
        })
    return results


def form_summary(records: list[dict]) -> dict:
    wins = sum(1 for r in records if r["result"] == "W")
    draws = sum(1 for r in records if r["result"] == "D")
    losses = sum(1 for r in records if r["result"] == "L")
    pts_for = [r["pts_for"] for r in records if r["pts_for"] is not None]
    pts_against = [r["pts_against"] for r in records if r["pts_against"] is not None]
    return {
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "avg_pts_for": round(sum(pts_for) / len(pts_for), 1) if pts_for else None,
        "avg_pts_against": round(sum(pts_against) / len(pts_against), 1) if pts_against else None,
    }
