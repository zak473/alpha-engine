"""
AI-generated match reasoning endpoint.

GET /reasoning/{match_id}
  - Checks match_reasoning cache (valid for 24 hours)
  - If stale/missing: calls Claude Haiku to generate 2–3 sentence analysis
  - Caches and returns { match_id, reasoning }

The analysis is grounded in prediction probabilities, ELO ratings,
recent form, market odds, and key feature drivers.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import get_db
from config.settings import settings
from db.models.mvp import (
    CoreMatch, CoreTeam, CoreLeague, CoreStanding,
    FeatSoccerMatch, MatchReasoning, PredMatch, ModelRegistry, RatingEloTeam,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/reasoning",
    tags=["reasoning"],
)

CACHE_TTL_HOURS = 24


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _team_name(session: Session, team_id: str) -> str:
    t = session.get(CoreTeam, team_id)
    return t.name if t else team_id


def _league_name(session: Session, league_id: str) -> str:
    lg = session.get(CoreLeague, league_id)
    return lg.name if lg else "Unknown League"


def _elo_rating(session: Session, team_id: str, before: datetime) -> Optional[float]:
    row = (
        session.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == team_id, RatingEloTeam.rated_at < before)
        .order_by(RatingEloTeam.rated_at.desc())
        .first()
    )
    return row.rating_after if row else None


def _standing(session: Session, team_id: str, sport: str) -> Optional[CoreStanding]:
    return (
        session.query(CoreStanding)
        .filter(CoreStanding.team_id == team_id, CoreStanding.sport == sport)
        .order_by(CoreStanding.updated_at.desc())
        .first()
    )


def _build_prompt(
    sport: str,
    league: str,
    home: str,
    away: str,
    p_home: float,
    p_draw: float,
    p_away: float,
    confidence: float,
    fair_home: float,
    fair_draw: float,
    fair_away: float,
    market_home: Optional[float],
    market_draw: Optional[float],
    market_away: Optional[float],
    elo_home: Optional[float],
    elo_away: Optional[float],
    key_drivers: list[dict],
    feat: Optional[FeatSoccerMatch],
    standing_home: Optional[CoreStanding],
    standing_away: Optional[CoreStanding],
) -> str:
    lines = [
        f"Sport: {sport.title()}",
        f"Competition: {league}",
        f"Match: {home} vs {away}",
        "",
        "Model probabilities:",
        f"  {home} win: {round(p_home * 100)}%",
    ]
    if p_draw > 0.01:
        lines.append(f"  Draw: {round(p_draw * 100)}%")
    lines.append(f"  {away} win: {round(p_away * 100)}%")
    lines.append(f"  Model confidence: {round(confidence * 100)}%")

    lines += [
        "",
        "Fair value odds (no-vig):",
        f"  {home}: {fair_home:.2f}",
    ]
    if p_draw > 0.01:
        lines.append(f"  Draw: {fair_draw:.2f}")
    lines.append(f"  {away}: {fair_away:.2f}")

    if market_home:
        lines += [
            "",
            "Market odds (bookmaker):",
            f"  {home}: {market_home:.2f}",
        ]
        if market_draw:
            lines.append(f"  Draw: {market_draw:.2f}")
        if market_away:
            lines.append(f"  {away}: {market_away:.2f}")
        # Edge
        if market_home > 0:
            edge_h = round((p_home - 1 / market_home) * 100, 1)
            if abs(edge_h) >= 1:
                lines.append(f"  Edge on {home}: {'+' if edge_h > 0 else ''}{edge_h}%")
        if market_away and market_away > 0:
            edge_a = round((p_away - 1 / market_away) * 100, 1)
            if abs(edge_a) >= 1:
                lines.append(f"  Edge on {away}: {'+' if edge_a > 0 else ''}{edge_a}%")

    if elo_home and elo_away:
        diff = round(elo_home - elo_away)
        lines += [
            "",
            "ELO ratings:",
            f"  {home}: {round(elo_home)} | {away}: {round(elo_away)} | Diff: {'+' if diff >= 0 else ''}{diff}",
        ]

    if key_drivers:
        lines += ["", "Top model factors:"]
        for d in key_drivers[:5]:
            feat_name = d.get("feature", "").replace("_", " ")
            val = d.get("value")
            imp = d.get("importance", 0)
            val_str = f" = {round(val, 2)}" if val is not None else ""
            lines.append(f"  {feat_name}{val_str} (importance: {round(imp, 3)})")

    if feat:
        lines += ["", "Recent form (last 5 games):"]
        if feat.home_form_pts is not None:
            lines.append(f"  {home}: {feat.home_form_pts:.0f}/15 pts | W{feat.home_form_w} D{feat.home_form_d} L{feat.home_form_l}")
        if feat.away_form_pts is not None:
            lines.append(f"  {away}: {feat.away_form_pts:.0f}/15 pts | W{feat.away_form_w} D{feat.away_form_d} L{feat.away_form_l}")
        if feat.home_xg_avg and feat.away_xg_avg:
            lines.append(f"  Avg xG: {home} {feat.home_xg_avg:.2f} | {away} {feat.away_xg_avg:.2f}")
        if feat.h2h_matches_played and feat.h2h_matches_played > 0:
            lines.append(f"  H2H: {home} wins {round((feat.h2h_home_win_pct or 0) * 100)}% of {feat.h2h_matches_played} meetings")
        if feat.home_days_rest is not None and feat.away_days_rest is not None:
            lines.append(f"  Days rest: {home} {feat.home_days_rest:.0f} | {away} {feat.away_days_rest:.0f}")

    if standing_home or standing_away:
        lines += ["", "League standings:"]
        if standing_home and standing_home.position:
            lines.append(f"  {home}: #{standing_home.position} ({standing_home.played}P {standing_home.won}W {standing_home.drawn}D {standing_home.lost}L, {standing_home.points} pts)")
        if standing_away and standing_away.position:
            lines.append(f"  {away}: #{standing_away.position} ({standing_away.played}P {standing_away.won}W {standing_away.drawn}D {standing_away.lost}L, {standing_away.points} pts)")

    lines += [
        "",
        "---",
        "Write exactly 2–3 sentences of sharp, data-driven analysis explaining the prediction.",
        "Lead with the clearest signal (ELO edge, form, market agreement, etc.).",
        "Mention whether the market aligns with the model if market odds are provided.",
        "End with the recommended pick and why. Be direct — no fluff or hedging.",
    ]

    return "\n".join(lines)


def _call_claude(prompt: str) -> str:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
    except Exception as exc:
        logger.warning("Claude API call failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/preview")
def get_reasoning_preview(
    home: str,
    away: str,
    sport: str = "soccer",
    league: str = "Unknown League",
    p_home: float = 0.5,
    p_draw: float = 0.0,
    p_away: float = 0.5,
    confidence: float = 0.5,
    fair_home: float = 2.0,
    fair_draw: float = 10.0,
    fair_away: float = 2.0,
    elo_home: Optional[float] = None,
    elo_away: Optional[float] = None,
    session: Session = Depends(get_db),
):
    """
    Generate AI reasoning for a preview match (not yet in CoreMatch DB).
    Cache key is derived from sport+home+away.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI reasoning not configured (ANTHROPIC_API_KEY missing)")

    import re
    def _slug(s: str) -> str:
        return re.sub(r"[^a-z0-9]", "_", s.strip().lower())

    cache_key = f"preview:{_slug(sport)}:{_slug(home)}:{_slug(away)}"

    cached = session.query(MatchReasoning).filter_by(match_id=cache_key).first()
    cutoff = datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS)
    if cached and cached.generated_at.replace(tzinfo=None) > cutoff:
        return {"match_id": cache_key, "reasoning": cached.reasoning}

    prompt = _build_prompt(
        sport=sport,
        league=league,
        home=home,
        away=away,
        p_home=p_home,
        p_draw=p_draw,
        p_away=p_away,
        confidence=confidence,
        fair_home=fair_home,
        fair_draw=fair_draw,
        fair_away=fair_away,
        market_home=None,
        market_draw=None,
        market_away=None,
        elo_home=elo_home,
        elo_away=elo_away,
        key_drivers=[],
        feat=None,
        standing_home=None,
        standing_away=None,
    )

    reasoning = _call_claude(prompt)

    if cached:
        cached.reasoning = reasoning
        cached.generated_at = datetime.utcnow()
    else:
        session.add(MatchReasoning(match_id=cache_key, reasoning=reasoning))
    session.commit()

    return {"match_id": cache_key, "reasoning": reasoning}


@router.get("/{match_id}")
def get_reasoning(match_id: str, session: Session = Depends(get_db)):
    """
    Return AI-generated reasoning for a match prediction.
    Cached for 24 hours in match_reasoning table.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI reasoning not configured (ANTHROPIC_API_KEY missing)")

    # Check cache
    cached = session.query(MatchReasoning).filter_by(match_id=match_id).first()
    cutoff = datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS)
    if cached and cached.generated_at.replace(tzinfo=None) > cutoff:
        return {"match_id": match_id, "reasoning": cached.reasoning}

    # Fetch match
    match = session.get(CoreMatch, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    home = _team_name(session, match.home_team_id)
    away = _team_name(session, match.away_team_id)
    league = _league_name(session, match.league_id)
    sport = match.sport or "soccer"

    # Get prediction
    pred_row = (
        session.query(PredMatch, ModelRegistry)
        .join(ModelRegistry, ModelRegistry.model_name == PredMatch.model_version)
        .filter(PredMatch.match_id == match_id, ModelRegistry.is_live == True)
        .order_by(ModelRegistry.trained_at.desc())
        .first()
    )

    if pred_row:
        pred, _ = pred_row
        p_home, p_draw, p_away = pred.p_home, pred.p_draw, pred.p_away
        confidence = pred.confidence / 100
        fair_home = pred.fair_odds_home
        fair_draw = pred.fair_odds_draw
        fair_away = pred.fair_odds_away
        key_drivers = pred.key_drivers or []
    else:
        # ELO fallback
        elo_h = _elo_rating(session, match.home_team_id, match.kickoff_utc) or 1500.0
        elo_a = _elo_rating(session, match.away_team_id, match.kickoff_utc) or 1500.0
        r_diff = elo_h - elo_a + 65.0
        import math
        p_home = 1.0 / (1.0 + math.pow(10, -r_diff / 400.0))
        p_away = 1.0 - p_home
        p_draw = 0.0
        confidence = abs(p_home - 0.5) * 2
        fair_home = round(1 / p_home, 2) if p_home > 0 else 99.0
        fair_away = round(1 / p_away, 2) if p_away > 0 else 99.0
        fair_draw = 99.0
        key_drivers = []

    # ELO ratings for context
    elo_home = _elo_rating(session, match.home_team_id, match.kickoff_utc)
    elo_away = _elo_rating(session, match.away_team_id, match.kickoff_utc)

    # Soccer features
    feat = None
    if sport == "soccer":
        feat = session.query(FeatSoccerMatch).filter_by(match_id=match_id).first()

    # Standings
    standing_home = _standing(session, match.home_team_id, sport)
    standing_away = _standing(session, match.away_team_id, sport)

    prompt = _build_prompt(
        sport=sport,
        league=league,
        home=home,
        away=away,
        p_home=p_home,
        p_draw=p_draw,
        p_away=p_away,
        confidence=confidence,
        fair_home=fair_home,
        fair_draw=fair_draw,
        fair_away=fair_away,
        market_home=match.odds_home,
        market_draw=match.odds_draw,
        market_away=match.odds_away,
        elo_home=elo_home,
        elo_away=elo_away,
        key_drivers=key_drivers,
        feat=feat,
        standing_home=standing_home,
        standing_away=standing_away,
    )

    reasoning = _call_claude(prompt)

    # Upsert cache
    if cached:
        cached.reasoning = reasoning
        cached.generated_at = datetime.utcnow()
    else:
        session.add(MatchReasoning(match_id=match_id, reasoning=reasoning))
    session.commit()

    return {"match_id": match_id, "reasoning": reasoning}
