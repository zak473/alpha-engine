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
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from config.settings import settings
from db.models.mvp import CoreMatch, PredMatch, CoreLeague, CoreTeam
from db.models.picks import TrackedPick
from db.models.tipsters import TipsterTip
from db.session import SessionLocal
from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

log = logging.getLogger(__name__)


# ── Tennis set handicap helpers ────────────────────────────────────────────────

def _solve_per_set_prob(match_win_prob: float, best_of: int = 3) -> float:
    """
    Invert the match-win formula to get the per-set win probability.
    BO3: W = p²(3-2p)   BO5: W = p³(10 - 15p + 6p²)
    Uses binary search; returns p in (0, 1).
    """
    w = max(0.001, min(0.999, match_win_prob))
    lo, hi = 0.001, 0.999
    for _ in range(60):
        mid = (lo + hi) / 2
        if best_of == 5:
            f = mid ** 3 * (10 - 15 * mid + 6 * mid ** 2)
        else:
            f = mid ** 2 * (3 - 2 * mid)
        if f < w:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _tennis_handicap_candidates(
    home_name: str,
    away_name: str,
    p_home: float,
    best_of: int = 3,
) -> list[tuple[str, float, float, str]]:
    """
    Derive set handicap (-1.5) candidates from match win probability.

    BO3: P(home -1.5) = p²  where p = per-set win prob
         P(away -1.5) = (1-p)²
    BO5: P(home -1.5) = P(3-0) + P(3-1) = p³ + 3p³(1-p)
         P(away -1.5) = (1-p)³ + 3(1-p)³·p

    Selection format:  "{TeamName} -1.5"   Market: "Set Handicap"
    Returns (selection_label, prob, fair_odds, market_name) tuples.
    """
    p = _solve_per_set_prob(p_home, best_of)
    q = 1.0 - p

    if best_of == 5:
        p_home_clean = p ** 3 + 3 * p ** 3 * q   # 3-0 + 3-1
        p_away_clean = q ** 3 + 3 * q ** 3 * p   # 0-3 + 1-3
    else:
        p_home_clean = p ** 2
        p_away_clean = q ** 2

    out: list[tuple[str, float, float, str]] = []
    for name, prob in ((home_name, p_home_clean), (away_name, p_away_clean)):
        if prob > 0.01:
            fair = round(1.0 / prob, 3)
            out.append((f"{name} -1.5", prob, fair, "Set Handicap"))
    return out


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
# Soccer (soccer_lgb_v18): validated at 60.1% accuracy only at ≥50% confidence
# (covers 48% of matches). Picks below 50% confidence drag the track record down,
# so we gate the auto-picks bot at the same threshold the model was evaluated on.
SPORT_MIN_EDGE: dict[str, float] = {
    "baseball":    0.05,
    "basketball":  0.01,  # NBA books are efficient; accept any genuine edge ≥1%
}
SPORT_MIN_CONFIDENCE: dict[str, float] = {
    "baseball": 0.50,
    "soccer":   0.50,  # lgb_v18 validated at 60.1% acc only at ≥50% confidence
}
# When using fair odds (no market odds available), use a higher confidence bar
# since there's no market edge to measure — pure model conviction only.
FAIR_ODDS_MIN_CONFIDENCE: dict[str, float] = {
    "soccer": 0.65,
}

# Sports where we fall back to model fair odds (1/p) when real market odds are
# unavailable. SGO only covers top-tier soccer leagues (EPL/La Liga/etc.) so the
# majority of Highlightly soccer fixtures never get market odds populated.
# For these sports we generate picks against the model's own no-vig line; this
# means we're betting on model confidence rather than market edge, so we drop the
# min_edge requirement to 0 for fair-odds-derived picks.
# Only soccer falls back to fair odds — SGO covers only 7 top leagues out of
# 950+ Highlightly leagues. Tennis and esports have their own real-odds APIs
# (api-tennis.com and PandaScore) so they must have market odds or no pick.
FAIR_ODDS_SPORTS: set[str] = {"soccer"}


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
        # All upcoming/live matches with predictions. Real market odds are preferred;
        # for FAIR_ODDS_SPORTS we fall back to the model's own fair odds so that
        # soccer/tennis/esports matches without SGO coverage still generate picks.
        from sqlalchemy import or_
        rows = (
            db.query(CoreMatch, PredMatch)
            .join(PredMatch, PredMatch.match_id == CoreMatch.id)
            .filter(
                CoreMatch.status.in_(["scheduled", "live"]),
                CoreMatch.kickoff_utc > datetime.now(timezone.utc),
                # Must have real odds OR be a fair-odds sport (we'll fall back below)
                or_(
                    CoreMatch.odds_home.isnot(None),
                    CoreMatch.sport.in_(list(FAIR_ODDS_SPORTS)),
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

            # Determine odds source: prefer real market odds, fall back to fair odds
            # for sports in FAIR_ODDS_SPORTS. Fair odds = model's own no-vig line
            # (1/p), so edge vs fair odds is always ~0; we lower the edge bar to 0
            # for these picks and rely purely on the confidence gate.
            using_fair_odds = (sport in FAIR_ODDS_SPORTS) and not match.odds_home

            h_odds = match.odds_home or (pred.fair_odds_home if using_fair_odds else None)
            a_odds = match.odds_away or (pred.fair_odds_away if using_fair_odds else None)
            d_odds = match.odds_draw or (pred.fair_odds_draw if using_fair_odds else None)

            if h_odds and pred.p_home:
                candidates.append((home_name, pred.p_home, h_odds, ml_market))
            if a_odds and pred.p_away:
                candidates.append((away_name, pred.p_away, a_odds, ml_market))
            if d_odds and pred.p_draw and pred.p_draw > 0.01:
                candidates.append(("Draw", pred.p_draw, d_odds, ml_market))

            # Tennis set handicap — add fair-odds -1.5 set candidates derived from
            # the model's match-win probability. These have edge≈0 vs fair odds but
            # convert low-odds ML favourites (< MIN_ODDS) into higher-odds handicap
            # bets that pass the MIN_ODDS filter and improve unit gain per pick.
            hc_candidates: list[tuple[str, float, float, str]] = []
            if sport == "tennis" and pred.p_home and pred.p_away:
                hc_candidates = _tennis_handicap_candidates(
                    home_name, away_name, pred.p_home
                )

            effective_min_edge = 0.0 if using_fair_odds else SPORT_MIN_EDGE.get(sport, min_edge)
            if using_fair_odds:
                effective_min_conf = FAIR_ODDS_MIN_CONFIDENCE.get(sport, 0.65)
            else:
                effective_min_conf = SPORT_MIN_CONFIDENCE.get(sport, min_confidence)

            # Process handicap candidates (fair odds — skip edge gate, keep conf + odds gates)
            hc_conf_threshold = SPORT_MIN_CONFIDENCE.get(sport, min_confidence)
            for selection_label, model_prob, book_odds, market_name in hc_candidates:
                confidence = pred.confidence / 100.0 if pred.confidence else model_prob
                if confidence < hc_conf_threshold:
                    continue
                if book_odds < settings.MIN_ODDS or book_odds > settings.MAX_ODDS:
                    continue
                if _already_picked(db, user_id, match.id, market_name, selection_label):
                    log.debug("  Skip (already picked): %s %s", match_label, selection_label)
                    continue

                k = kelly_fraction(model_prob, book_odds)
                stake = round(k * settings.AUTO_PICK_KELLY_FRACTION, 4)
                log.info(
                    "  [%s] %s | %s @ %.2f (fair hc) | kelly=%.1f%% | stake=%.2fu",
                    sport, match_label, selection_label, book_odds, k * 100, stake,
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
                        edge=0.0,
                        kelly_fraction=round(k, 4),
                        stake_fraction=stake,
                        auto_generated=True,
                    )
                    db.add(pick)
                    created += 1

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
                            note=f"Set handicap (fair) | Kelly: {round(k * 100, 1)}%",
                        )
                        db.add(tip)

            for selection_label, model_prob, book_odds, market_name in candidates:
                e = edge_pct(model_prob, book_odds)
                confidence = pred.confidence / 100.0 if pred.confidence else model_prob

                if e < effective_min_edge:
                    continue
                if confidence < effective_min_conf:
                    continue
                if book_odds < settings.MIN_ODDS or book_odds > settings.MAX_ODDS:
                    continue

                # Dedup
                if _already_picked(db, user_id, match.id, market_name, selection_label):
                    log.debug("  Skip (already picked): %s %s", match_label, selection_label)
                    continue

                k = kelly_fraction(model_prob, book_odds)
                stake = round(k * kelly_frac, 4)

                odds_source = "fair" if using_fair_odds else "market"
                log.info(
                    "  [%s] %s | %s @ %.2f (%s) | edge=+%.1f%% | kelly=%.1f%% | stake=%.2fu",
                    sport, match_label, selection_label, book_odds, odds_source,
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
                            note=f"Edge: +{round(e * 100, 1)}% | Kelly: {round(k * 100, 1)}%",
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

    # Also run spread + over/under picks from SGO lines
    try:
        from pipelines.picks.spread_picks import run as run_spread
        spread_created = run_spread(kelly_frac=kelly_frac, user_id=user_id, dry_run=dry_run)
        created += spread_created
    except Exception as exc:
        log.error("spread_picks failed: %s", exc, exc_info=True)

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
