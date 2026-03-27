"""
Auto-pick bot — generates TrackedPick records for high-edge opportunities.

Runs after predict_only + fetch_odds. For each upcoming/live match that has:
  - A prediction (pred_match row)
  - Real market odds (core_matches.odds_home/away)
  - Edge > AUTO_PICK_MIN_EDGE (default 3%)
  - Confidence > AUTO_PICK_MIN_CONFIDENCE (default 55%)

Computes fractional Kelly stake and creates a pick under AUTO_PICK_USER_ID.
Deduplicates: won't create a duplicate pick for the same match+market+selection.

Usage:
    python -m pipelines.picks.auto_picks
    python -m pipelines.picks.auto_picks --dry-run
    python -m pipelines.picks.auto_picks --min-edge 0.05 --kelly 0.25
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
from db.models.picks import TrackedPick
from db.models.tipsters import TipsterTip
from db.session import SessionLocal
from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

log = logging.getLogger(__name__)


# ── Kelly maths ───────────────────────────────────────────────────────────────

def kelly_fraction(prob: float, decimal_odds: float) -> float:
    """
    Full Kelly criterion: (b*p - q) / b
    where b = decimal_odds - 1, p = win prob, q = 1 - p.
    Returns 0 if the bet has no edge.
    """
    b = decimal_odds - 1.0
    if b <= 0:
        return 0.0
    k = (b * prob - (1 - prob)) / b
    return max(0.0, k)


def edge_pct(model_prob: float, decimal_odds: float) -> float:
    """Edge = model_prob − implied_prob_from_book_odds."""
    return model_prob - (1.0 / decimal_odds)


# ── Dedup check ────────────────────────────────────────────────────────────────

def _already_picked(db: Session, user_id: str, match_id: str, market: str, selection: str) -> bool:
    return db.query(TrackedPick).filter(
        TrackedPick.user_id == user_id,
        TrackedPick.match_id == match_id,
        TrackedPick.market_name == market,
        TrackedPick.selection_label == selection,
    ).first() is not None


def _already_tipped(db: Session, user_id: str, match_label: str, market: str, selection: str) -> bool:
    return db.query(TipsterTip).filter(
        TipsterTip.user_id == user_id,
        TipsterTip.match_label == match_label,
        TipsterTip.market_name == market,
        TipsterTip.selection_label == selection,
    ).first() is not None


# ── Per-sport thresholds ───────────────────────────────────────────────────────
# Baseball: model picks heavy favourites with no real edge → require much higher
# bar before auto-betting. Raise min_edge to 8% and min_confidence to 65%.
SPORT_MIN_EDGE: dict[str, float] = {
    "baseball":    0.06,
    "basketball":  0.04,
}
SPORT_MIN_CONFIDENCE: dict[str, float] = {
    "baseball":    0.35,  # ~67% win prob
    "basketball":  0.30,  # ~65% win prob
    "tennis":      0.40,
    "esports":     0.40,
}

# Only tip matches starting within this many hours — prevents bulk-tipping weeks of fixtures
LOOKAHEAD_HOURS = 48
# Sports with wider odds spreads — heavy favourites common
SPORT_MIN_ODDS: dict[str, float] = {
    "tennis":     1.15,
    "esports":    1.15,
    "basketball": 1.20,
    "baseball":   1.20,
}
SPORT_MAX_ODDS: dict[str, float] = {
    "tennis":     8.0,
    "esports":    8.0,
    "basketball": 5.0,
    "baseball":   5.0,
}
# Only use fair_odds fallback for sports with no real odds feed
FAIR_ODDS_SPORTS = {"tennis", "esports"}


# ── Main ───────────────────────────────────────────────────────────────────────

def run(
    min_edge: float = settings.AUTO_PICK_MIN_EDGE,
    min_confidence: float = settings.AUTO_PICK_MIN_CONFIDENCE,
    kelly_frac: float = settings.AUTO_PICK_KELLY_FRACTION,
    user_id: str = settings.AUTO_PICK_USER_ID,
    dry_run: bool = False,
) -> int:
    """
    Scan predictions and create auto-picks for value bets.
    Returns number of picks created.
    """
    db = SessionLocal()
    created = 0

    try:
        from sqlalchemy import or_
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(hours=LOOKAHEAD_HOURS)
        # Only upcoming/live matches within LOOKAHEAD_HOURS window
        rows = (
            db.query(CoreMatch, PredMatch)
            .join(PredMatch, PredMatch.match_id == CoreMatch.id)
            .filter(
                CoreMatch.status.in_(["scheduled", "live"]),
                CoreMatch.kickoff_utc > now,
                CoreMatch.kickoff_utc <= horizon,
                or_(
                    # Real market odds available
                    (CoreMatch.odds_home.isnot(None) & CoreMatch.odds_away.isnot(None)),
                    # No market odds but model produced fair odds (e.g. tennis)
                    (PredMatch.fair_odds_home.isnot(None) & PredMatch.fair_odds_away.isnot(None)),
                ),
            )
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )

        log.info("Auto-pick bot: evaluating %d match-prediction pairs ...", len(rows))

        for match, pred in rows:
            league = db.get(CoreLeague, match.league_id)
            home_team = db.get(CoreTeam, match.home_team_id)
            away_team = db.get(CoreTeam, match.away_team_id)
            if not home_team or not away_team:
                continue

            league_name = league.name if league else "Unknown"
            match_label = f"{home_team.name} vs {away_team.name}"

            # Build candidate selections: (label, model_prob, book_odds, market_name)
            candidates: list[tuple[str, float, float, str]] = []

            # Determine correct market name based on sport
            sport = match.sport
            ml_market = "Moneyline" if sport in ("basketball", "baseball") else "Match Winner" if sport in ("tennis", "esports") else "1X2"

            home_name = home_team.name
            away_name = away_team.name

            # Decide whether we're working with real market odds or fair odds only
            # Fair odds fallback only for sports with no real odds feed (tennis, esports)
            has_real_odds = bool(match.odds_home and match.odds_away)
            use_fair_odds = not has_real_odds and sport in FAIR_ODDS_SPORTS

            if not has_real_odds and not use_fair_odds:
                continue

            if has_real_odds:
                if match.odds_home and pred.p_home:
                    candidates.append((home_name, pred.p_home, match.odds_home, ml_market, False))
                if match.odds_away and pred.p_away:
                    candidates.append((away_name, pred.p_away, match.odds_away, ml_market, False))
                if match.odds_draw and pred.p_draw and pred.p_draw > 0.01:
                    candidates.append(("Draw", pred.p_draw, match.odds_draw, ml_market, False))
            else:
                # No real odds — use model's fair odds (tennis/esports only)
                if pred.fair_odds_home and pred.p_home and pred.fair_odds_home < 990:
                    candidates.append((home_name, pred.p_home, pred.fair_odds_home, ml_market, True))
                if pred.fair_odds_away and pred.p_away and pred.fair_odds_away < 990:
                    candidates.append((away_name, pred.p_away, pred.fair_odds_away, ml_market, True))

            effective_min_edge = SPORT_MIN_EDGE.get(sport, min_edge)
            effective_min_conf = SPORT_MIN_CONFIDENCE.get(sport, min_confidence)

            for selection_label, model_prob, book_odds, market_name, fair_only in candidates:
                confidence = pred.confidence / 100.0 if pred.confidence else model_prob
                e = 0.0 if fair_only else edge_pct(model_prob, book_odds)

                if not fair_only and e < effective_min_edge:
                    continue
                if confidence < effective_min_conf:
                    continue
                eff_min_odds = SPORT_MIN_ODDS.get(sport, settings.MIN_ODDS)
                eff_max_odds = SPORT_MAX_ODDS.get(sport, settings.MAX_ODDS)
                if book_odds < eff_min_odds or book_odds > eff_max_odds:
                    continue

                # Dedup
                if _already_picked(db, user_id, match.id, market_name, selection_label):
                    log.debug("  Skip (already picked): %s %s", match_label, selection_label)
                    continue

                k = kelly_fraction(model_prob, book_odds)
                stake = round(k * kelly_frac, 4)

                log.info(
                    "  [%s] %s | %s @ %.2f | edge=+%.1f%% | kelly=%.1f%% | stake=%.2fu",
                    sport, match_label, selection_label, book_odds,
                    e * 100, k * 100, stake,
                )

                if not dry_run:
                    pick = TrackedPick(
                        id=str(uuid.uuid4()),
                        user_id=user_id,
                        match_id=match.id,
                        match_label=match_label,
                        sport=sport,
                        league=league_name,
                        start_time=match.kickoff_utc,
                        market_name=market_name,
                        selection_label=selection_label,
                        odds=book_odds,
                        edge=round(e, 4),
                        kelly_fraction=round(k, 4),
                        stake_fraction=stake,
                        auto_generated=True,
                    )
                    db.add(pick)
                    created += 1

                    # Also post under the sport-specific AI tipster account
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
                            start_time=match.kickoff_utc,
                            match_id=match.id,
                            note=(f"Confidence: {round(confidence * 100, 1)}% | Fair odds" if fair_only else f"Edge: +{round(e * 100, 1)}% | Kelly: {round(k * 100, 1)}%"),
                        )
                        db.add(tip)

        if not dry_run:
            db.commit()
            log.info("Auto-pick bot: created %d picks.", created)
        else:
            log.info("DRY RUN — would create %d picks.", created)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return created


# ── CLV batch settlement ───────────────────────────────────────────────────────

def settle_all_clv() -> int:
    """
    For all settled auto-picks without CLV, compute it from market_odds snapshots.
    Run after fetch_odds to get closing prices.
    """
    from pipelines.odds.fetch_odds import settle_clv

    db = SessionLocal()
    settled = 0
    try:
        pending_clv = (
            db.query(TrackedPick)
            .filter(
                TrackedPick.outcome.isnot(None),
                TrackedPick.closing_odds.is_(None),
            )
            .all()
        )
        for pick in pending_clv:
            settle_clv(db, pick.id, pick.match_id)
            settled += 1
        db.commit()
        if settled:
            log.info("CLV settlement: computed CLV for %d picks.", settled)
    finally:
        db.close()
    return settled


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-pick bot with Kelly staking")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--min-edge", type=float, default=settings.AUTO_PICK_MIN_EDGE)
    parser.add_argument("--kelly", type=float, default=settings.AUTO_PICK_KELLY_FRACTION)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(min_edge=args.min_edge, kelly_frac=args.kelly, dry_run=args.dry_run)
    print(f"Done. {n} picks {'would be ' if args.dry_run else ''}created.")


if __name__ == "__main__":
    main()
