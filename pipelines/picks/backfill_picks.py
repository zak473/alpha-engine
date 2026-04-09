"""
Backfill TrackedPick + TipsterTip rows for historical finished matches.

Scans finished matches (last N days) that have predictions and real odds,
applies the same edge/kelly logic as auto_picks.run(), sets outcomes immediately
from match results, and creates TrackedPick + TipsterTip rows with settled outcomes.

Uses lower thresholds than the live bot (min_edge=0.01, min_confidence=0.40) to
build a meaningful historical track record.

Usage:
    python -m pipelines.picks.backfill_picks
    python -m pipelines.picks.backfill_picks --dry-run
    python -m pipelines.picks.backfill_picks --days 30
    python -m pipelines.picks.backfill_picks --days 14 --dry-run
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from config.settings import settings
from db.models.mvp import CoreMatch, PredMatch, CoreLeague, CoreTeam, RatingEloTeam
from db.models.picks import TrackedPick
from db.models.tipsters import TipsterTip
from db.session import SessionLocal
from pipelines.picks.auto_picks import kelly_fraction, edge_pct
from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

log = logging.getLogger(__name__)

# Lower thresholds for backfill — we want volume for track record
BACKFILL_MIN_EDGE: float = 0.01
BACKFILL_MIN_CONFIDENCE: float = 0.40

# Per-sport overrides (same as auto_picks, but relaxed for backfill)
BACKFILL_SPORT_MIN_EDGE: dict[str, float] = {
    "baseball":    0.03,
    "basketball":  0.01,
}
BACKFILL_SPORT_MIN_CONFIDENCE: dict[str, float] = {
    "baseball": 0.45,
}


def _already_picked(
    db: Session, user_id: str, match_id: str, market: str, selection: str
) -> bool:
    return (
        db.query(TrackedPick)
        .filter(
            TrackedPick.user_id == user_id,
            TrackedPick.match_id == match_id,
            TrackedPick.market_name == market,
            TrackedPick.selection_label == selection,
        )
        .first()
        is not None
    )


def _already_tipped(
    db: Session, user_id: str, match_label: str, market: str, selection: str
) -> bool:
    return (
        db.query(TipsterTip)
        .filter(
            TipsterTip.user_id == user_id,
            TipsterTip.match_label == match_label,
            TipsterTip.market_name == market,
            TipsterTip.selection_label == selection,
        )
        .first()
        is not None
    )


def _resolve_outcome(
    selection_label: str,
    match_label: str,
    match_outcome: str,
    home_name: str,
    away_name: str,
) -> Optional[str]:
    """
    Map a selection label + match outcome to "won" | "lost" | None.

    match_outcome is one of: "home_win", "away_win", "draw", "H", "A", "D"
    Returns None if we can't resolve the selection.
    """
    label = selection_label.lower().strip()
    mo = (match_outcome or "").lower()

    is_home_win = mo in ("home_win", "h")
    is_away_win = mo in ("away_win", "a")
    is_draw = mo in ("draw", "d")

    if label == "draw":
        return "won" if is_draw else "lost"

    if label in ("home", "1"):
        return "won" if is_home_win else "lost"

    if label in ("away", "2"):
        return "won" if is_away_win else "lost"

    # Team name matching
    home_lower = (home_name or "").lower().strip()
    away_lower = (away_name or "").lower().strip()

    if home_lower and (home_lower in label or label in home_lower):
        return "won" if is_home_win else "lost"
    if away_lower and (away_lower in label or label in away_lower):
        return "won" if is_away_win else "lost"

    return None


def _elo_probs(db: Session, match: CoreMatch) -> tuple[float, float, float]:
    """Return (p_home, p_away, confidence 0-1) from ELO ratings, or (0.5, 0.5, 0) if unavailable."""
    kickoff = match.kickoff_utc
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)
    home_row = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == match.home_team_id, RatingEloTeam.rated_at < kickoff)
        .order_by(RatingEloTeam.rated_at.desc())
        .first()
    )
    away_row = (
        db.query(RatingEloTeam)
        .filter(RatingEloTeam.team_id == match.away_team_id, RatingEloTeam.rated_at < kickoff)
        .order_by(RatingEloTeam.rated_at.desc())
        .first()
    )
    if not home_row or not away_row:
        return 0.5, 0.5, 0.0
    p_home = round(1 / (1 + 10 ** ((away_row.rating_after - home_row.rating_after) / 400)), 4)
    p_away = round(1 - p_home, 4)
    confidence = round(max(0.0, min(1.0, abs(p_home - 0.5) * 2)), 4)
    return p_home, p_away, confidence


def run(
    days: int = 14,
    min_edge: float = BACKFILL_MIN_EDGE,
    min_confidence: float = BACKFILL_MIN_CONFIDENCE,
    kelly_frac: float = settings.AUTO_PICK_KELLY_FRACTION,
    user_id: str = settings.AUTO_PICK_USER_ID,
    dry_run: bool = False,
) -> int:
    """
    Backfill TrackedPick + TipsterTip rows for finished historical matches.
    Uses PredMatch (ML) when available, falls back to ELO probabilities.
    Returns number of picks created.
    """
    db = SessionLocal()
    created = 0

    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # All finished matches in the window with a known outcome
        matches = (
            db.query(CoreMatch)
            .filter(
                CoreMatch.status == "finished",
                CoreMatch.outcome.isnot(None),
                CoreMatch.kickoff_utc >= cutoff,
            )
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )

        log.info("Backfill: evaluating %d finished matches (last %d days) ...", len(matches), days)
        now = datetime.now(timezone.utc)

        for match in matches:
            league = db.get(CoreLeague, match.league_id)
            home_team = db.get(CoreTeam, match.home_team_id)
            away_team = db.get(CoreTeam, match.away_team_id)
            if not home_team or not away_team:
                continue

            league_name = league.name if league else "Unknown"
            home_name = home_team.name
            away_name = away_team.name
            match_label = f"{home_name} vs {away_name}"
            sport = match.sport

            # Try ML prediction first, fall back to ELO
            pred = db.query(PredMatch).filter(PredMatch.match_id == match.id).first()
            if pred and pred.p_home and pred.p_away:
                p_home, p_away = pred.p_home, pred.p_away
                p_draw = pred.p_draw or 0.0
                confidence = (pred.confidence / 100.0) if pred.confidence else max(p_home, p_away)
                source = "ml"
            else:
                p_home, p_away, confidence = _elo_probs(db, match)
                p_draw = 0.0
                source = "elo"

            if confidence == 0.0:
                continue

            # Market name
            if sport in ("basketball", "baseball"):
                ml_market = "Moneyline"
            elif sport in ("tennis", "esports"):
                ml_market = "Match Winner"
            else:
                ml_market = "1X2"

            # Prefer real market odds; fall back to fair odds
            using_fair_odds = not match.odds_home
            h_odds = match.odds_home or (round(1 / p_home, 3) if p_home > 0 else None)
            a_odds = match.odds_away or (round(1 / p_away, 3) if p_away > 0 else None)
            d_odds = match.odds_draw or (round(1 / p_draw, 3) if p_draw and p_draw > 0.01 else None)

            candidates: list[tuple[str, float, float, str]] = []
            if h_odds and p_home:
                candidates.append((home_name, p_home, h_odds, ml_market))
            if a_odds and p_away:
                candidates.append((away_name, p_away, a_odds, ml_market))
            if d_odds and p_draw and p_draw > 0.01:
                candidates.append(("Draw", p_draw, d_odds, ml_market))

            # With fair odds use confidence-only gate
            if using_fair_odds:
                effective_min_edge = 0.0
                effective_min_conf = BACKFILL_SPORT_MIN_CONFIDENCE.get(sport, 0.60)
            else:
                effective_min_edge = BACKFILL_SPORT_MIN_EDGE.get(sport, min_edge)
                effective_min_conf = BACKFILL_SPORT_MIN_CONFIDENCE.get(sport, min_confidence)

            for selection_label, model_prob, book_odds, market_name in candidates:
                e = edge_pct(model_prob, book_odds)

                if e < effective_min_edge:
                    continue
                if confidence < effective_min_conf:
                    continue
                if book_odds < settings.MIN_ODDS or book_odds > settings.MAX_ODDS:
                    continue

                # Dedup — don't create if already exists
                if _already_picked(db, user_id, match.id, market_name, selection_label):
                    log.debug("  Skip (already picked): %s %s", match_label, selection_label)
                    continue

                # Resolve settled outcome immediately from match result
                pick_outcome = _resolve_outcome(
                    selection_label, match_label, match.outcome, home_name, away_name
                )
                if pick_outcome is None:
                    log.debug(
                        "  Skip (can't resolve outcome): %s %s vs match outcome=%s",
                        match_label, selection_label, match.outcome,
                    )
                    continue

                k = kelly_fraction(model_prob, book_odds)
                stake = round(k * kelly_frac, 4)

                # Approximate settlement time = kickoff + 2 hours
                kickoff = match.kickoff_utc
                if kickoff.tzinfo is None:
                    kickoff = kickoff.replace(tzinfo=timezone.utc)
                settled_at = kickoff + timedelta(hours=2)
                # Don't use a future settled_at
                if settled_at > now:
                    settled_at = now

                log.info(
                    "  [%s] %s | %s @ %.2f | edge=+%.1f%% | kelly=%.1f%% | outcome=%s",
                    sport, match_label, selection_label, book_odds,
                    e * 100, k * 100, pick_outcome,
                )

                if not dry_run:
                    pick = TrackedPick(
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
                        outcome=pick_outcome,
                        settled_at=settled_at,
                    )
                    db.add(pick)
                    created += 1

                    # Also create TipsterTip under the sport-specific AI tipster account
                    ai_tipster_id = AI_TIPSTER_IDS.get(sport)
                    if ai_tipster_id and not _already_tipped(
                        db, ai_tipster_id, match_label, market_name, selection_label
                    ):
                        tip = TipsterTip(
                            user_id=ai_tipster_id,
                            sport=sport,
                            match_label=match_label,
                            market_name=market_name,
                            selection_label=selection_label,
                            odds=book_odds,
                            outcome=pick_outcome,
                            start_time=kickoff,
                            settled_at=settled_at,
                            match_id=match.id,
                            note=f"[{source}] {'Fair odds' if using_fair_odds else 'Edge: +' + str(round(e * 100, 1)) + '%'} | Kelly: {round(k * 100, 1)}% [backfill]",
                        )
                        db.add(tip)

        if not dry_run:
            db.commit()
            log.info("Backfill complete: created %d picks.", created)
        else:
            log.info("DRY RUN — would create %d picks.", created)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return created


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill picks from historical finished matches")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be created, don't write")
    parser.add_argument("--days", type=int, default=14, help="Lookback window in days (default: 14)")
    parser.add_argument("--min-edge", type=float, default=BACKFILL_MIN_EDGE, help="Minimum edge threshold")
    parser.add_argument("--kelly", type=float, default=settings.AUTO_PICK_KELLY_FRACTION, help="Fractional Kelly")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(days=args.days, min_edge=args.min_edge, kelly_frac=args.kelly, dry_run=args.dry_run)
    print(f"Done. {n} picks {'would be ' if args.dry_run else ''}created.")


if __name__ == "__main__":
    main()
