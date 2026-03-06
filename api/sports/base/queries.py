"""Shared query utilities used across sport services."""

from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from db.models.mvp import CoreMatch, CoreTeam


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
