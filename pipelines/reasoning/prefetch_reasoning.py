"""
Pre-generate AI match reasoning for upcoming scheduled matches.

Calls Claude Haiku once per match and stores the result in match_reasoning
(the same cache the API endpoint reads from). Skips matches that already
have fresh reasoning (generated within the last 24 hours).

Usage:
    python -m pipelines.reasoning.prefetch_reasoning              # all sports, next 48h
    python -m pipelines.reasoning.prefetch_reasoning --sport soccer
    python -m pipelines.reasoning.prefetch_reasoning --hours 72
    python -m pipelines.reasoning.prefetch_reasoning --limit 50   # cap API calls

Requires ANTHROPIC_API_KEY in .env.
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timedelta, timezone

import anthropic
from sqlalchemy.orm import Session

from config.settings import settings
from db.models.mvp import (
    CoreMatch, CoreLeague, CoreStanding, CoreTeam,
    FeatSoccerMatch, MatchReasoning, ModelRegistry, PredMatch, RatingEloTeam,
)
from db.session import SessionLocal

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

CACHE_TTL_HOURS = 24
SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"]


# ---------------------------------------------------------------------------
# Helpers (duplicated from reasoning.py to avoid FastAPI dependency)
# ---------------------------------------------------------------------------

def _team_name(session: Session, team_id: str) -> str:
    t = session.get(CoreTeam, team_id)
    return t.name if t else team_id


def _league_name(session: Session, league_id: str | None) -> str:
    if not league_id:
        return "Unknown League"
    lg = session.get(CoreLeague, league_id)
    return lg.name if lg else "Unknown League"


def _elo_rating(session: Session, team_id: str, before: datetime) -> float | None:
    row = (
        session.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == team_id, RatingEloTeam.rated_at < before)
        .order_by(RatingEloTeam.rated_at.desc())
        .first()
    )
    return row.rating_after if row else None


def _standing(session: Session, team_id: str, sport: str) -> CoreStanding | None:
    return (
        session.query(CoreStanding)
        .filter(CoreStanding.team_id == team_id, CoreStanding.sport == sport)
        .order_by(CoreStanding.updated_at.desc())
        .first()
    )


def _build_prompt(
    sport: str, league: str, home: str, away: str,
    p_home: float, p_draw: float, p_away: float,
    confidence: float, fair_home: float, fair_draw: float, fair_away: float,
    market_home: float | None, market_draw: float | None, market_away: float | None,
    elo_home: float | None, elo_away: float | None,
    key_drivers: list[dict],
    feat: FeatSoccerMatch | None,
    standing_home: CoreStanding | None, standing_away: CoreStanding | None,
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

    lines += ["", "Fair value odds (no-vig):", f"  {home}: {fair_home:.2f}"]
    if p_draw > 0.01:
        lines.append(f"  Draw: {fair_draw:.2f}")
    lines.append(f"  {away}: {fair_away:.2f}")

    if market_home:
        lines += ["", "Market odds (bookmaker):", f"  {home}: {market_home:.2f}"]
        if market_draw:
            lines.append(f"  Draw: {market_draw:.2f}")
        if market_away:
            lines.append(f"  {away}: {market_away:.2f}")
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
            "", "ELO ratings:",
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
        "", "---",
        "Write exactly 2–3 sentences of sharp, data-driven analysis explaining the prediction.",
        "Lead with the clearest signal (ELO edge, form, market agreement, etc.).",
        "Mention whether the market aligns with the model if market odds are provided.",
        "End with the recommended pick and why. Be direct — no fluff or hedging.",
    ]
    return "\n".join(lines)


def _call_claude(client: anthropic.Anthropic, prompt: str) -> str:
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


# ---------------------------------------------------------------------------
# Main prefetch loop
# ---------------------------------------------------------------------------

def _generate_for_match(session: Session, client: anthropic.Anthropic, match: CoreMatch) -> str:
    """Generate and cache reasoning for one match. Returns the reasoning text."""
    home = _team_name(session, match.home_team_id)
    away = _team_name(session, match.away_team_id)
    league = _league_name(session, match.league_id)
    sport = match.sport or "soccer"

    # Get best available prediction
    pred_row = (
        session.query(PredMatch, ModelRegistry)
        .join(ModelRegistry, ModelRegistry.model_name == PredMatch.model_version)
        .filter(PredMatch.match_id == match.id, ModelRegistry.is_live == True)
        .order_by(ModelRegistry.trained_at.desc())
        .first()
    )

    if pred_row:
        pred, _ = pred_row
        p_home, p_draw, p_away = pred.p_home, pred.p_draw, pred.p_away
        confidence = (pred.confidence or 0) / 100
        fair_home = pred.fair_odds_home or (1 / p_home if p_home else 99)
        fair_draw = pred.fair_odds_draw or 99
        fair_away = pred.fair_odds_away or (1 / p_away if p_away else 99)
        key_drivers = pred.key_drivers or []
    else:
        import math
        kickoff = match.kickoff_utc
        if kickoff.tzinfo is None:
            kickoff = kickoff.replace(tzinfo=timezone.utc)
        elo_h = _elo_rating(session, match.home_team_id, kickoff) or 1500.0
        elo_a = _elo_rating(session, match.away_team_id, kickoff) or 1500.0
        r_diff = elo_h - elo_a + 65.0
        p_home = 1.0 / (1.0 + math.pow(10, -r_diff / 400.0))
        p_away = 1.0 - p_home
        p_draw = 0.0
        confidence = abs(p_home - 0.5) * 2
        fair_home = round(1 / p_home, 2) if p_home > 0 else 99.0
        fair_away = round(1 / p_away, 2) if p_away > 0 else 99.0
        fair_draw = 99.0
        key_drivers = []

    kickoff = match.kickoff_utc
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)

    elo_home = _elo_rating(session, match.home_team_id, kickoff)
    elo_away = _elo_rating(session, match.away_team_id, kickoff)

    feat = session.query(FeatSoccerMatch).filter_by(match_id=match.id).first() if sport == "soccer" else None
    standing_home = _standing(session, match.home_team_id, sport)
    standing_away = _standing(session, match.away_team_id, sport)

    prompt = _build_prompt(
        sport=sport, league=league, home=home, away=away,
        p_home=p_home, p_draw=p_draw, p_away=p_away,
        confidence=confidence,
        fair_home=fair_home, fair_draw=fair_draw, fair_away=fair_away,
        market_home=match.odds_home, market_draw=match.odds_draw, market_away=match.odds_away,
        elo_home=elo_home, elo_away=elo_away,
        key_drivers=key_drivers,
        feat=feat,
        standing_home=standing_home, standing_away=standing_away,
    )

    reasoning = _call_claude(client, prompt)

    cached = session.query(MatchReasoning).filter_by(match_id=match.id).first()
    if cached:
        cached.reasoning = reasoning
        cached.generated_at = datetime.utcnow()
    else:
        session.add(MatchReasoning(match_id=match.id, reasoning=reasoning))

    return reasoning


def run(
    sport: str | None = None,
    hours_ahead: int = 48,
    limit: int = 200,
) -> int:
    if not settings.ANTHROPIC_API_KEY:
        log.error("ANTHROPIC_API_KEY not set — add it to .env and retry.")
        return 0

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    session: Session = SessionLocal()
    generated = 0

    try:
        now = datetime.now(tz=timezone.utc)
        cutoff = now + timedelta(hours=hours_ahead)
        stale_before = now - timedelta(hours=CACHE_TTL_HOURS)

        target_sports = [sport] if sport and sport != "all" else SPORTS

        # Find matches that need reasoning generated/refreshed
        query = (
            session.query(CoreMatch)
            .filter(
                CoreMatch.sport.in_(target_sports),
                CoreMatch.status == "scheduled",
                CoreMatch.kickoff_utc >= now,
                CoreMatch.kickoff_utc <= cutoff,
            )
            .order_by(CoreMatch.kickoff_utc.asc())
            .limit(limit * 2)
        )
        matches = query.all()

        # Filter to those without fresh cached reasoning
        to_generate = []
        for m in matches:
            cached = session.query(MatchReasoning).filter_by(match_id=m.id).first()
            if not cached or cached.generated_at.replace(tzinfo=None) < stale_before.replace(tzinfo=None):
                to_generate.append(m)

        to_generate = to_generate[:limit]
        log.info("Generating reasoning for %d matches (sport=%s, next %dh)...",
                 len(to_generate), sport or "all", hours_ahead)

        for i, match in enumerate(to_generate):
            try:
                home = _team_name(session, match.home_team_id)
                away = _team_name(session, match.away_team_id)
                reasoning = _generate_for_match(session, client, match)
                session.commit()
                log.info("  [%d/%d] %s vs %s — %s",
                         i + 1, len(to_generate), home, away,
                         reasoning[:80].replace("\n", " ") + "…")
                generated += 1
                # Respect rate limits
                time.sleep(0.5)
            except Exception as exc:
                session.rollback()
                log.warning("  SKIP %s: %s", match.id[:8], exc)

        log.info("Done. %d reasoning entries generated.", generated)
        return generated

    except Exception:
        session.rollback()
        log.exception("Prefetch failed")
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-generate AI match reasoning")
    parser.add_argument("--sport", default=None, help="Filter by sport")
    parser.add_argument("--hours", type=int, default=48, help="Hours ahead to cover")
    parser.add_argument("--limit", type=int, default=200, help="Max matches to generate")
    args = parser.parse_args()
    run(sport=args.sport, hours_ahead=args.hours, limit=args.limit)


if __name__ == "__main__":
    main()
