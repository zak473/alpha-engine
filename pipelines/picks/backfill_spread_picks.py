"""
Backfill historical spread / handicap / over-under tips.

Two data sources:

1. Real SpreadOdds rows (SGO): for any finished CoreMatch that has stored SpreadOdds,
   create picks using the stored fair/book odds and settle immediately from scores.

2. Asian Handicap 0 synthetic (soccer only): for finished soccer matches with PredMatch
   data, create "Asian Handicap 0" (Draw No Bet) picks using the model's favourite at
   standard market juice (-110 = 1.909 decimal).
   Settlement:
     - won  → predicted team won
     - void → draw (stake returned, excluded from win-rate stats)
     - lost → predicted team lost

Usage:
    python -m pipelines.picks.backfill_spread_picks
    python -m pipelines.picks.backfill_spread_picks --dry-run
    python -m pipelines.picks.backfill_spread_picks --days 60
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from config.settings import settings
from db.models.mvp import CoreMatch, PredMatch, CoreLeague, CoreTeam
from db.models.odds import SpreadOdds
from db.models.picks import TrackedPick
from db.models.tipsters import TipsterTip
from db.session import SessionLocal
from pipelines.picks.auto_picks import kelly_fraction, edge_pct
from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

log = logging.getLogger(__name__)

# Standard market juice for AH-0 synthetic picks (-110 American = 1.909 decimal)
AH0_ODDS = 1.909

# Minimum model probability to back a team at AH 0 (must have genuine edge vs juice)
# At 1.909 odds, implied prob = 52.4% — so we need >52.4% to have any edge at all.
# Set bar at 55% for meaningful edge.
AH0_MIN_PROB = 0.55

SPREAD_MARKET: dict[str, str] = {
    "basketball": "Point Spread",
    "baseball":   "Run Line",
    "hockey":     "Puck Line",
    "soccer":     "Asian Handicap",
}
TOTAL_MARKET: dict[str, str] = {
    "basketball": "Total Points",
    "baseball":   "Total Runs",
    "hockey":     "Total Goals",
    "soccer":     "Total Goals",
}


def _already_tipped(db: Session, user_id: str, match_label: str, market: str, selection: str) -> bool:
    return db.query(TipsterTip).filter(
        TipsterTip.user_id == user_id,
        TipsterTip.match_label == match_label,
        TipsterTip.market_name == market,
        TipsterTip.selection_label == selection,
    ).first() is not None


def _already_picked(db: Session, user_id: str, match_id: str, market: str, selection: str) -> bool:
    return db.query(TrackedPick).filter(
        TrackedPick.user_id == user_id,
        TrackedPick.match_id == match_id,
        TrackedPick.market_name == market,
        TrackedPick.selection_label == selection,
    ).first() is not None


def _settle_spread(h: int, a: int, line: float, side: str) -> str:
    """Settle a spread pick. side='home' or 'away'."""
    diff = (h + line) - a if side == "home" else (a + line) - h
    if diff > 0:
        return "won"
    if diff == 0:
        return "void"
    return "lost"


def _settle_total(h: int, a: int, line: float, side: str) -> str:
    """Settle an over/under pick."""
    total = h + a
    if side == "over":
        return "won" if total > line else ("void" if total == line else "lost")
    return "won" if total < line else ("void" if total == line else "lost")


def _settle_ah0(match_outcome: str, side: str) -> Optional[str]:
    """
    Settle an Asian Handicap 0 pick.
    side = 'home' | 'away'
    Returns 'won' | 'void' | 'lost' | None
    """
    mo = (match_outcome or "").lower()
    if mo in ("draw", "d"):
        return "void"
    if side == "home":
        return "won" if mo in ("home_win", "h") else "lost"
    return "won" if mo in ("away_win", "a") else "lost"


# ─── Part 1: real SpreadOdds backfill ────────────────────────────────────────

def _backfill_real_spread(db: Session, user_id: str, now: datetime, dry_run: bool) -> int:
    """Create picks from stored SpreadOdds rows where the match is now finished."""
    created = 0

    # Find finished matches that have SpreadOdds
    rows = (
        db.query(SpreadOdds, CoreMatch)
        .join(CoreMatch, CoreMatch.id == SpreadOdds.match_id)
        .filter(
            CoreMatch.status == "finished",
            CoreMatch.home_score.isnot(None),
            CoreMatch.away_score.isnot(None),
            SpreadOdds.fair_odds_decimal.isnot(None),
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    log.info("[spread_backfill] Real SpreadOdds: %d finished rows to check.", len(rows))

    for spread, match in rows:
        sport = match.sport
        ai_tipster_id = AI_TIPSTER_IDS.get(sport)
        if not ai_tipster_id:
            continue

        market_name = (
            SPREAD_MARKET.get(sport) if spread.market_type == "spread"
            else TOTAL_MARKET.get(sport)
        )
        if not market_name:
            continue

        home_team = db.get(CoreTeam, match.home_team_id)
        away_team = db.get(CoreTeam, match.away_team_id)
        if not home_team or not away_team:
            continue

        match_label = f"{home_team.name} vs {away_team.name}"
        league = db.get(CoreLeague, match.league_id)
        league_name = league.name if league else "Unknown"

        # Use book odds if available, else fair odds
        book_odds = spread.book_odds_decimal or spread.fair_odds_decimal
        fair_prob = 1.0 / spread.fair_odds_decimal
        e = edge_pct(fair_prob, book_odds)

        if spread.market_type == "spread":
            team_name = home_team.name if spread.side == "home" else away_team.name
            line_str = f"{spread.line:+.1f}" if spread.line != int(spread.line) else f"{spread.line:+.0f}"
            selection_label = f"{team_name} {line_str}"
        else:
            line_str = f"{spread.line:.1f}" if spread.line != int(spread.line) else f"{spread.line:.0f}"
            selection_label = f"{'Over' if spread.side == 'over' else 'Under'} {line_str}"

        # Settle
        try:
            h, a = int(match.home_score), int(match.away_score)
        except (TypeError, ValueError):
            continue

        if spread.market_type == "spread":
            outcome = _settle_spread(h, a, spread.line, spread.side)
        else:
            outcome = _settle_total(h, a, spread.line, spread.side)

        if _already_tipped(db, ai_tipster_id, match_label, market_name, selection_label):
            continue

        k = kelly_fraction(fair_prob, book_odds)
        stake = round(k * settings.AUTO_PICK_KELLY_FRACTION, 4)

        kickoff = match.kickoff_utc
        if kickoff.tzinfo is None:
            kickoff = kickoff.replace(tzinfo=timezone.utc)
        settled_at = min(kickoff + timedelta(hours=3), now)

        odds_note = "book" if spread.book_odds_decimal else "fair"
        log.info(
            "  [%s] %s | %s @ %.2f (%s) | edge=+%.1f%% | outcome=%s",
            sport, match_label, selection_label, book_odds, odds_note,
            e * 100, outcome,
        )

        created += 1
        if not dry_run:
            if not _already_picked(db, user_id, match.id, market_name, selection_label):
                db.add(TrackedPick(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    match_id=match.id,
                    match_label=match_label,
                    sport=sport,
                    league=league_name,
                    start_time=kickoff,
                    market_name=market_name,
                    selection_label=selection_label,
                    odds=book_odds,
                    edge=round(e, 4),
                    kelly_fraction=round(k, 4),
                    stake_fraction=stake,
                    auto_generated=True,
                    outcome=outcome,
                    settled_at=settled_at,
                ))
            db.add(TipsterTip(
                user_id=ai_tipster_id,
                sport=sport,
                match_label=match_label,
                market_name=market_name,
                selection_label=selection_label,
                odds=book_odds,
                outcome=outcome,
                start_time=kickoff,
                settled_at=settled_at,
                match_id=match.id,
                note=f"Edge: +{round(e * 100, 1)}% | Kelly: {round(k * 100, 1)}% [spread backfill]",
            ))

    return created


# ─── Part 2: Asian Handicap 0 synthetic (soccer) ─────────────────────────────

def _backfill_ah0_soccer(
    db: Session, user_id: str, days: int, now: datetime, dry_run: bool
) -> int:
    """
    For finished soccer matches with PredMatch data, create Asian Handicap 0
    (Draw No Bet) tips under the soccer AI tipster.

    AH 0 means: back a team to win with their stake returned if the match draws.
    Settlement: won=team wins, void=draw, lost=team loses.
    """
    created = 0
    ai_tipster_id = AI_TIPSTER_IDS.get("soccer")
    if not ai_tipster_id:
        return 0

    cutoff = datetime.utcnow() - timedelta(days=days)

    rows = (
        db.query(CoreMatch, PredMatch)
        .join(PredMatch, PredMatch.match_id == CoreMatch.id)
        .filter(
            CoreMatch.sport == "soccer",
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
            CoreMatch.kickoff_utc >= cutoff,
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    log.info("[spread_backfill] AH-0 soccer: %d finished matches to check.", len(rows))

    for match, pred in rows:
        if not pred.p_home or not pred.p_away:
            continue

        home_team = db.get(CoreTeam, match.home_team_id)
        away_team = db.get(CoreTeam, match.away_team_id)
        if not home_team or not away_team:
            continue

        match_label = f"{home_team.name} vs {away_team.name}"
        league = db.get(CoreLeague, match.league_id)
        league_name = league.name if league else "Unknown"
        market_name = "Asian Handicap"

        # Pick the stronger side if it clears the minimum probability
        if pred.p_home >= pred.p_away and pred.p_home >= AH0_MIN_PROB:
            selection_label = f"{home_team.name} 0"
            model_prob = pred.p_home
            side = "home"
        elif pred.p_away > pred.p_home and pred.p_away >= AH0_MIN_PROB:
            selection_label = f"{away_team.name} 0"
            model_prob = pred.p_away
            side = "away"
        else:
            continue  # neither side clears the bar

        outcome = _settle_ah0(match.outcome, side)
        if outcome is None:
            continue

        if _already_tipped(db, ai_tipster_id, match_label, market_name, selection_label):
            continue

        e = edge_pct(model_prob, AH0_ODDS)
        k = kelly_fraction(model_prob, AH0_ODDS)
        stake = round(k * settings.AUTO_PICK_KELLY_FRACTION, 4)

        kickoff = match.kickoff_utc
        if kickoff.tzinfo is None:
            kickoff = kickoff.replace(tzinfo=timezone.utc)
        settled_at = min(kickoff + timedelta(hours=2), now)

        log.info(
            "  [soccer] %s | %s @ %.3f | edge=+%.1f%% | outcome=%s",
            match_label, selection_label, AH0_ODDS, e * 100, outcome,
        )

        created += 1
        if not dry_run:
            if not _already_picked(db, user_id, match.id, market_name, selection_label):
                db.add(TrackedPick(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    match_id=match.id,
                    match_label=match_label,
                    sport="soccer",
                    league=league_name,
                    start_time=kickoff,
                    market_name=market_name,
                    selection_label=selection_label,
                    odds=AH0_ODDS,
                    edge=round(e, 4),
                    kelly_fraction=round(k, 4),
                    stake_fraction=stake,
                    auto_generated=True,
                    outcome=outcome,
                    settled_at=settled_at,
                ))
            db.add(TipsterTip(
                user_id=ai_tipster_id,
                sport="soccer",
                match_label=match_label,
                market_name=market_name,
                selection_label=selection_label,
                odds=AH0_ODDS,
                outcome=outcome,
                start_time=kickoff,
                settled_at=settled_at,
                match_id=match.id,
                note=f"AH 0 | Model: {round(model_prob * 100, 1)}% | Edge: +{round(e * 100, 1)}% [backfill]",
            ))

    return created


# ─── Main ─────────────────────────────────────────────────────────────────────

def run(
    days: int = 60,
    user_id: str = settings.AUTO_PICK_USER_ID,
    dry_run: bool = False,
) -> int:
    """
    Backfill spread + over/under tips for finished matches.
    Returns total tips created.
    """
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    total = 0
    try:
        total += _backfill_real_spread(db, user_id, now, dry_run)
        total += _backfill_ah0_soccer(db, user_id, days, now, dry_run)

        if not dry_run:
            db.commit()
            log.info("[spread_backfill] Done. Created %d tips.", total)
        else:
            log.info("[spread_backfill] DRY RUN — would create %d tips.", total)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return total


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill spread / AH-0 tips")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--days", type=int, default=60)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(days=args.days, dry_run=args.dry_run)
    print(f"Done. {n} tips {'would be ' if args.dry_run else ''}created.")


if __name__ == "__main__":
    main()
