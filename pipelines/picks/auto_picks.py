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


# ── Soccer Asian Handicap helpers ─────────────────────────────────────────────

def _fit_poisson_params(p_home: float, p_draw: float, p_away: float) -> tuple[float, float]:
    """
    Fit independent Poisson λ_h, λ_a that reproduce (p_home, p_draw) from a 3-way model.
    Returns (λ_home, λ_away) expected goals.
    Iterative gradient descent; converges in <50 steps for typical soccer probabilities.
    """
    import numpy as np

    MAX = 12  # max goals to sum over (Poisson tail is negligible beyond 12)

    def _grid(lh: float, la: float):
        import math as _math
        ph = np.array([np.exp(-lh) * (lh ** i) / _math.factorial(i) for i in range(MAX)])
        pa = np.array([np.exp(-la) * (la ** i) / _math.factorial(i) for i in range(MAX)])
        return np.outer(ph, pa)  # grid[i,j] = P(home=i, away=j)

    # Start from a sensible prior (typical EPL home/away goal averages)
    lh, la = max(0.3, 1.4 * p_home / 0.46), max(0.3, 1.1 * p_away / 0.27)

    for _ in range(80):
        g = _grid(lh, la)
        p_hw = float(np.tril(g, -1).sum())   # home wins (i > j)
        p_dw = float(np.diag(g).sum())         # draw    (i == j)
        err_h = p_home - p_hw
        err_d = p_draw - p_dw
        if abs(err_h) < 1e-5 and abs(err_d) < 1e-5:
            break
        lh = max(0.05, lh + err_h * 0.6 - err_d * 0.1)
        la = max(0.05, la - err_h * 0.4 + err_d * 0.1)

    return lh, la


def _poisson_ah_prob(lh: float, la: float, line: float) -> tuple[float, float]:
    """
    Compute P(home covers AH line) and P(push) using Poisson goal distributions.

    line is from the HOME side perspective (e.g. -1.5 means home gives 1.5 goals).
    Home covers if (home_goals + line) > away_goals, i.e. diff > -line.

    Returns (p_win, p_push).
    Half-ball lines (±0.5, ±1.5, …) have p_push=0.
    Whole-ball lines (0, ±1, ±2, …) have non-zero p_push.
    """
    import numpy as np
    import math

    MAX = 12
    ph = np.array([math.exp(-lh) * (lh ** i) / math.factorial(i) for i in range(MAX)])
    pa = np.array([math.exp(-la) * (la ** i) / math.factorial(i) for i in range(MAX)])

    p_win = p_push = 0.0
    threshold = -line  # home covers if diff > threshold
    for i in range(MAX):
        for j in range(MAX):
            diff = i - j
            p_ij = float(ph[i] * pa[j])
            if diff > threshold:
                p_win += p_ij
            elif abs(diff - threshold) < 1e-9:  # exact push (whole-ball only)
                p_push += p_ij

    return p_win, p_push


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
# Esports: model stores confidence as abs(p - 0.5) * 2 so a 60% prediction = 20%
# confidence. Global 70% gate kills ALL esports picks. Use edge-only gating instead.
# Baseball/hockey: keep high confidence since sample is thin and model less proven.
# Soccer: 65% works well for lgb_v18 given its confidence distribution.
SPORT_MIN_EDGE: dict[str, float] = {
    "esports":     1.0,   # effectively disabled (negative ROI at all thresholds)
    "baseball":    0.02,  # was 0.08 — too high; lowered to match 90-day backtest formula
    "basketball":  0.01,
}
SPORT_MIN_CONFIDENCE: dict[str, float] = {
    # MIN_ODDS=1.40 applied to ALL picks (fair + real) caps model_prob < 0.714.
    # Combined with these floors: basketball p=0.65-0.71, baseball p=0.60-0.71.
    "esports":    1.0,   # DISABLED: all esports thresholds showed negative ROI
    "soccer":     0.30,  # real SGO odds only; MIN_ODDS=1.40 still applies as lower bound
    "tennis":     0.46,  # match winner OR set handicap; target ≤5/day; p_home≥0.73
    "basketball": 0.30,
    "baseball":   0.20,
    "hockey":     0.35,
}
FAIR_ODDS_MIN_CONFIDENCE: dict[str, float] = {
    # soccer removed — uses real SGO odds only (no fair-odds fallback)
    "basketball": 0.30,
    "baseball":   0.20,
    "tennis":     0.46,
}
# Per-sport minimum odds override. Tennis: 1.20 allows short-priced match winners
# (p_home up to 0.83). Picks where odds < 1.20 fall through to set handicap.
SPORT_MIN_ODDS: dict[str, float] = {
    "tennis": 1.20,
}

# Sports where we fall back to model fair odds (1/p) when real market odds are
# unavailable. SGO covers top-tier soccer leagues only. Basketball (NBA) and
# baseball (MLB) often lack stored market odds — we fall back to model fair odds
# with confidence-only gating (model is well-calibrated at these confidence levels).
# Tennis uses fair odds for moneyline (model 62.9% acc post label-bias fix).
# Esports: DISABLED — negative ROI at all thresholds.
FAIR_ODDS_SPORTS: set[str] = {"basketball", "baseball", "tennis"}  # soccer uses SGO real odds only


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

            # Determine correct market name based on sport
            sport = match.sport

            # Skip handball, women's, and junior basketball tagged as sport="basketball"
            if sport == "basketball":
                league_lower = league_name.lower()
                if "handball" in league_lower:
                    log.debug("  Skip (handball): %s [%s]", match_label, league_name)
                    continue
                if "women" in league_lower or " w " in f" {league_lower} " or league_lower.endswith(" w"):
                    log.debug("  Skip (women's basketball): %s [%s]", match_label, league_name)
                    continue
                if "women" in home_team.name.lower() or "women" in away_team.name.lower():
                    log.debug("  Skip (women's team): %s", match_label)
                    continue

            # Build candidate selections: (label, model_prob, book_odds, market_name)
            candidates: list[tuple[str, float, float, str]] = []
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

            # Tennis: add set handicap (-1.5) to the candidate pool so we can
            # pick whichever market has higher confidence (match winner wins unless
            # its odds fall below sport_min_odds, in which case handicap is chosen).
            if sport == "tennis" and pred.p_home and pred.p_away:
                all_hc = _tennis_handicap_candidates(home_name, away_name, pred.p_home)
                if all_hc:
                    candidates.append(max(all_hc, key=lambda c: c[1]))

            sport_min_odds = SPORT_MIN_ODDS.get(sport, settings.MIN_ODDS)

            effective_min_edge = 0.0 if using_fair_odds else SPORT_MIN_EDGE.get(sport, min_edge)
            if using_fair_odds:
                effective_min_conf = FAIR_ODDS_MIN_CONFIDENCE.get(sport, 0.65)
            else:
                effective_min_conf = SPORT_MIN_CONFIDENCE.get(sport, min_confidence)

            # For fair odds: pick single best candidate (highest model_prob) that meets
            # the odds threshold — naturally prefers match winner, falls through to
            # set handicap when match winner odds are too short (p_home > 0.83).
            if using_fair_odds and candidates:
                valid_cands = [c for c in candidates if c[2] >= sport_min_odds]
                candidates = [max(valid_cands, key=lambda c: c[1])] if valid_cands else []

            # ── Soccer Asian Handicap (real SGO spread odds) ───────────────────
            # Backtest: 72% hit rate, +36.8% ROI at 1.90 (≥55% conf, n=50).
            # Use the real ±0.5 spread line from SpreadOdds (fetched by SGO pipeline).
            # Model probability: p_home (covers -0.5) or p_away+p_draw (covers +0.5).
            # Edge = model_prob − 1/book_odds. Only bet ±0.5 lines — other lines need
            # a goal model we don't have yet.
            if sport == "soccer":
                from db.models.odds import SpreadOdds as _SpreadOdds
                _p_home = pred.p_home or 0.0
                _p_draw = pred.p_draw or 0.0
                _p_away = pred.p_away or 0.0
                ah_conf = (pred.confidence or 0) / 100.0

                if _p_home > 0 and _p_away > 0 and ah_conf >= 0.65:
                    # Fetch the home and away spread rows for this match
                    _spreads = (
                        db.query(_SpreadOdds)
                        .filter(
                            _SpreadOdds.match_id == match.id,
                            _SpreadOdds.market_type == "spread",
                            _SpreadOdds.book_available == True,
                            _SpreadOdds.book_odds_decimal.isnot(None),
                        )
                        .all()
                    )

                    # Fit Poisson goal model once per match (reused across all spread rows)
                    _lh, _la = None, None

                    for _sp in _spreads:
                        # Determine model probability for this specific AH line.
                        # ±0.5: exact from 3-way probs. Any other line: Poisson model.
                        if _sp.side == "home":
                            # Home covers line: home wins by enough
                            if abs(abs(_sp.line) - 0.5) < 0.05 and _sp.line < 0:
                                _model_prob = _p_home
                            else:
                                if _lh is None:
                                    _lh, _la = _fit_poisson_params(_p_home, _p_draw, _p_away)
                                _model_prob, _ = _poisson_ah_prob(_lh, _la, _sp.line)
                            _ah_selection = f"{home_name} {_sp.line:+.1f}".replace(".0", "")
                        elif _sp.side == "away":
                            # Away +X means home line is -X; compute home covers then invert
                            _home_line = -_sp.line
                            if abs(abs(_home_line) - 0.5) < 0.05 and _home_line < 0:
                                _model_prob = _p_away + _p_draw
                            else:
                                if _lh is None:
                                    _lh, _la = _fit_poisson_params(_p_home, _p_draw, _p_away)
                                _p_home_covers, _p_push = _poisson_ah_prob(_lh, _la, _home_line)
                                _model_prob = 1.0 - _p_home_covers - _p_push
                            _ah_selection = f"{away_name} {_sp.line:+.1f}".replace(".0", "")
                        else:
                            continue

                        _ah_edge = edge_pct(_model_prob, _sp.book_odds_decimal)
                        if _ah_edge < 0.02:
                            continue

                        if _already_picked(db, user_id, match.id, "Asian Handicap", _ah_selection):
                            continue

                        k = kelly_fraction(_model_prob, _sp.book_odds_decimal)
                        stake = round(k * kelly_frac, 4)
                        log.info(
                            "  [soccer-AH] %s | %s @ %.2f (SGO real) | edge=+%.1f%% | kelly=%.1f%%",
                            match_label, _ah_selection, _sp.book_odds_decimal, _ah_edge * 100, k * 100,
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
                                market_name="Asian Handicap",
                                selection_label=_ah_selection,
                                odds=_sp.book_odds_decimal,
                                edge=round(_ah_edge, 4),
                                kelly_fraction=round(k, 4),
                                stake_fraction=stake,
                                auto_generated=True,
                            )
                            db.add(pick)
                            created += 1

                            ai_tipster_id = AI_TIPSTER_IDS.get(sport)
                            if ai_tipster_id and not _already_tipped(
                                db, ai_tipster_id, match_label, "Asian Handicap", _ah_selection
                            ):
                                tip = TipsterTip(
                                    user_id=ai_tipster_id,
                                    sport=sport,
                                    match_label=match_label,
                                    market_name="Asian Handicap",
                                    selection_label=_ah_selection,
                                    odds=_sp.book_odds_decimal,
                                    start_time=match.kickoff_utc,
                                    match_id=match.id,
                                    note=f"AH -0.5 (SGO) | Edge: +{round(_ah_edge * 100, 1)}% | Kelly: {round(k * 100, 1)}%",
                                )
                                db.add(tip)

            for selection_label, model_prob, book_odds, market_name in candidates:
                e = edge_pct(model_prob, book_odds)
                confidence = pred.confidence / 100.0 if pred.confidence else model_prob

                if e < effective_min_edge:
                    continue
                if confidence < effective_min_conf:
                    continue
                if book_odds < sport_min_odds or book_odds > settings.MAX_ODDS:
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
