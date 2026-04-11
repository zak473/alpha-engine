"""
Backtest pipeline — runs the evaluation engine against all historical predictions
and stores results back into model_registry.metrics["backtest"].

Usage:
    python -m pipelines.backtest.run_backtest               # all live models
    python -m pipelines.backtest.run_backtest --sport soccer
    python -m pipelines.backtest.run_backtest --sport soccer --staking kelly
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from core.types import PredictionResult, Sport
from db.models.mvp import CoreMatch, ModelRegistry, PredMatch
from db.session import SessionLocal
from evaluation.backtester import Backtester, StakingConfig

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"]

HC_MIN_ODDS: float = 1.4
HC_MAX_ODDS: float = 4.0
# AH0 (Draw No Bet): allow from 1.10 — confident favourites in 3-way markets have
# short AH0 odds (e.g. p_home=0.55, p_away=0.20 → AH0=1.36) which was being blocked
# by the old 1.50 floor, killing nearly all soccer DNB bets.
AH0_MIN_ODDS: float = 1.10

# Per-sport optimal confidence thresholds for the backtest.
# These differ from live-pick thresholds: the backtest should show the model's
# realistic achievable P&L, not the most-selective live-pick filter.
# Esports: model stores confidence = abs(p - 0.5) * 2, so a 60% prediction = 20%
# confidence. Any global threshold > 0.30 kills all esports bets.
BACKTEST_MIN_CONFIDENCE: dict[str, float] = {
    "esports":    0.0,   # edge gate only — was +19u/week at this setting
    "soccer":     0.65,  # lgb_v18 — raised from 0.55; matches live pick threshold
    "tennis":     0.55,
    "basketball": 0.60,  # ~80% model probability threshold for meaningful sample
    "baseball":   0.55,
    "hockey":     0.55,
}

# Per-sport min_edge for the main backtest.
# Binary sports (basketball/hockey/etc.) often have no real market odds stored
# (most bets fall back to fair_odds → edge ≈ 0). Using 0.0 here lets confidence
# gate do the filtering so we still see accuracy/ROI from the sample.
# Soccer uses the AH simulation with real SGO odds → keep edge gate meaningful.
BACKTEST_MIN_EDGE: dict[str, float] = {
    "soccer":     0.02,  # real SGO AH + Poisson → edge is meaningful
    "tennis":     0.0,   # many historical matches lack odds_away → edge=0 for away picks
    "basketball": 0.0,   # most bets use fair odds → edge ≈ 0; confidence gate only
    "baseball":   0.0,   # tiny sample, show all
    "hockey":     0.0,   # small sample, show all
    "esports":    0.0,   # match.odds_away often missing → away picks silently use fair odds
}


def _outcome_to_float(outcome: str | None) -> float | None:
    if outcome in ("H", "home_win"):
        return 1.0
    if outcome in ("D", "draw"):
        return 0.5
    if outcome in ("A", "away_win"):
        return 0.0
    return None


def _run_tennis_handicap(session: Session, min_confidence: float = 0.25) -> dict | None:
    """
    Simulate set handicap (-1.5 sets) betting on tennis predictions.

    For each finished tennis match with a PredMatch and set scores:
    - Compute P(favourite wins 2-0) using BO3 formula W = p²(3-2p)
    - Only place the favourite's -1.5 bet if fair odds pass MIN/MAX range
    - Apply a confidence gate (min_confidence)
    - Flat 1u staking (no Kelly — we have no market odds reference, just fair odds)

    Returns a summary dict stored as metrics["backtest"]["set_handicap"].
    """
    import numpy as np
    from sqlalchemy import func
    from db.models.mvp import CoreMatch, PredMatch
    from pipelines.picks.auto_picks import _solve_per_set_prob

    subq = (
        session.query(PredMatch.match_id, func.max(PredMatch.id).label("latest_id"))
        .join(CoreMatch, CoreMatch.id == PredMatch.match_id)
        .filter(CoreMatch.sport == "tennis")
        .group_by(PredMatch.match_id)
        .subquery()
    )
    rows = (
        session.query(CoreMatch, PredMatch)
        .join(subq, subq.c.match_id == CoreMatch.id)
        .join(PredMatch, PredMatch.id == subq.c.latest_id)
        .filter(
            CoreMatch.sport == "tennis",
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
            CoreMatch.home_score.isnot(None),
            CoreMatch.away_score.isnot(None),
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if not rows:
        log.warning("  Tennis handicap: no finished matches with set scores.")
        return None

    bets = []
    skipped_conf = 0
    skipped_odds = 0
    skipped_sets = 0

    for match, pred in rows:
        p_home = pred.p_home or 0.0
        p_away = pred.p_away or 0.0
        if p_home <= 0 or p_away <= 0:
            continue

        confidence = (pred.confidence or 0) / 100.0
        if confidence < min_confidence:
            skipped_conf += 1
            continue

        # Identify the favourite (higher match win prob)
        fav_is_home = p_home >= p_away
        fav_prob = p_home if fav_is_home else p_away

        # Compute per-set probability for the favourite
        p_set = _solve_per_set_prob(fav_prob)
        p_clean = p_set ** 2          # P(favourite wins 2-0)
        hc_odds = round(1.0 / p_clean, 3) if p_clean > 0.01 else None
        if hc_odds is None or hc_odds < HC_MIN_ODDS or hc_odds > HC_MAX_ODDS:
            skipped_odds += 1
            continue

        try:
            h_sets = int(match.home_score)
            a_sets = int(match.away_score)
        except (ValueError, TypeError):
            skipped_sets += 1
            continue

        if fav_is_home:
            won = (h_sets - a_sets) >= 2   # home wins 2-0
        else:
            won = (a_sets - h_sets) >= 2   # away wins 2-0

        pnl = (hc_odds - 1.0) if won else -1.0
        bets.append({
            "match_id": match.id,
            "fav_prob": fav_prob,
            "p_clean": p_clean,
            "hc_odds": hc_odds,
            "won": won,
            "pnl": pnl,
            "date": match.kickoff_utc,
        })

    if not bets:
        log.warning("  Tennis handicap: no bets survived filters (conf_skip=%d odds_skip=%d sets_skip=%d).",
                    skipped_conf, skipped_odds, skipped_sets)
        return None

    pnl_arr = np.array([b["pnl"] for b in bets])
    won_arr = np.array([b["won"] for b in bets])
    odds_arr = np.array([b["hc_odds"] for b in bets])
    n_bets = len(bets)
    n_won = int(won_arr.sum())
    total_pnl = float(pnl_arr.sum())
    roi = total_pnl / n_bets   # flat 1u per bet

    # Sharpe (per-bet returns as % of stake)
    ret_std = float(pnl_arr.std())
    sharpe = float(pnl_arr.mean() / ret_std * (n_bets ** 0.5)) if ret_std > 0 else 0.0

    # Max drawdown on cumulative P/L curve
    cum = np.cumsum(pnl_arr)
    running_max = np.maximum.accumulate(cum)
    max_dd = float((cum - running_max).min())

    date_from = bets[0]["date"]
    date_to = bets[-1]["date"]

    result = {
        "n_bets": n_bets,
        "n_won": n_won,
        "hit_rate": round(n_won / n_bets, 4),
        "pnl_units": round(total_pnl, 2),
        "roi": round(roi, 4),
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown_units": round(max_dd, 2),
        "avg_odds": round(float(odds_arr.mean()), 3),
        "skipped_conf": skipped_conf,
        "skipped_odds": skipped_odds,
        "staking": "flat_1u",
        "market": "Set Handicap -1.5",
        "side": "favourite_only",
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "run_at": datetime.now(tz=timezone.utc).isoformat(),
    }

    log.info(
        "  tennis-handicap  n=%d  hit=%.1f%%  pnl=%+.1fu  roi=%+.1f%%  sharpe=%.2f  dd=%.1fu",
        n_bets, n_won / n_bets * 100, total_pnl, roi * 100, sharpe, max_dd,
    )
    return result


def _run_soccer_draw_no_bet(session: Session, min_confidence: float = 0.65) -> dict | None:
    """
    Simulate Draw No Bet (Asian Handicap 0) for soccer predictions.

    Bet on the model's favourite (higher of p_home / p_away):
    - Win  if favourite wins outright  → +odds-1
    - Push if match draws              → 0  (stake returned)
    - Lose if other team wins          → -1

    Fair AH0 odds for favourite = (p_fav + p_dog) / p_fav
    (draw is excluded from the payout pool so it doesn't inflate the favourite's price).

    Returns a summary dict stored as metrics["backtest"]["draw_no_bet"].
    """
    import numpy as np
    from sqlalchemy import func

    subq = (
        session.query(PredMatch.match_id, func.max(PredMatch.id).label("latest_id"))
        .join(CoreMatch, CoreMatch.id == PredMatch.match_id)
        .filter(CoreMatch.sport == "soccer")
        .group_by(PredMatch.match_id)
        .subquery()
    )
    rows = (
        session.query(CoreMatch, PredMatch)
        .join(subq, subq.c.match_id == CoreMatch.id)
        .join(PredMatch, PredMatch.id == subq.c.latest_id)
        .filter(
            CoreMatch.sport == "soccer",
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if not rows:
        log.warning("  Soccer DNB: no finished matches.")
        return None

    bets = []
    skipped_conf = 0
    skipped_odds = 0

    for match, pred in rows:
        p_home = pred.p_home or 0.0
        p_away = pred.p_away or 0.0
        if p_home <= 0 or p_away <= 0:
            continue

        confidence = (pred.confidence or 0) / 100.0
        if confidence < min_confidence:
            skipped_conf += 1
            continue

        fav_is_home = p_home >= p_away
        p_fav = p_home if fav_is_home else p_away
        p_dog = p_away if fav_is_home else p_home

        # AH0 fair odds: draw is a push, only win/lose split for odds
        ah0_odds = round((p_fav + p_dog) / p_fav, 3) if p_fav > 0 else None
        if ah0_odds is None or ah0_odds < AH0_MIN_ODDS or ah0_odds > HC_MAX_ODDS:
            skipped_odds += 1
            continue

        outcome = match.outcome  # "home_win"/"H", "draw"/"D", "away_win"/"A"
        if outcome in ("home_win", "H"):
            actual = "home"
        elif outcome in ("draw", "D"):
            actual = "draw"
        else:
            actual = "away"

        fav_side = "home" if fav_is_home else "away"
        if actual == fav_side:
            pnl = ah0_odds - 1.0   # win
        elif actual == "draw":
            pnl = 0.0              # push — stake returned
        else:
            pnl = -1.0             # lose

        bets.append({
            "match_id": match.id,
            "p_fav": p_fav,
            "ah0_odds": ah0_odds,
            "pnl": pnl,
            "won": pnl > 0,
            "push": pnl == 0.0,
            "date": match.kickoff_utc,
        })

    if not bets:
        log.warning("  Soccer DNB: no bets survived filters (conf_skip=%d odds_skip=%d).",
                    skipped_conf, skipped_odds)
        return None

    pnl_arr = np.array([b["pnl"] for b in bets])
    odds_arr = np.array([b["ah0_odds"] for b in bets])
    n_bets = len(bets)
    n_won = sum(1 for b in bets if b["won"])
    n_push = sum(1 for b in bets if b["push"])
    total_pnl = float(pnl_arr.sum())
    roi = total_pnl / n_bets

    ret_std = float(pnl_arr.std())
    sharpe = float(pnl_arr.mean() / ret_std * (n_bets ** 0.5)) if ret_std > 0 else 0.0

    cum = np.cumsum(pnl_arr)
    running_max = np.maximum.accumulate(cum)
    max_dd = float((cum - running_max).min())

    date_from = bets[0]["date"]
    date_to = bets[-1]["date"]

    result = {
        "n_bets": n_bets,
        "n_won": n_won,
        "n_push": n_push,
        "hit_rate": round(n_won / n_bets, 4),
        "pnl_units": round(total_pnl, 2),
        "roi": round(roi, 4),
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown_units": round(max_dd, 2),
        "avg_odds": round(float(odds_arr.mean()), 3),
        "min_confidence": min_confidence,
        "skipped_conf": skipped_conf,
        "skipped_odds": skipped_odds,
        "staking": "flat_1u",
        "market": "Draw No Bet (AH0)",
        "side": "favourite_only",
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "run_at": datetime.now(tz=timezone.utc).isoformat(),
    }

    log.info(
        "  soccer-DNB  n=%d  hit=%.1f%%  push=%d  pnl=%+.1fu  roi=%+.1f%%  sharpe=%.2f",
        n_bets, n_won / n_bets * 100, n_push, total_pnl, roi * 100, sharpe,
    )
    return result


def _run_soccer_asian_handicap(session: Session, min_confidence: float = 0.55) -> dict | None:
    """
    Simulate Asian Handicap betting for soccer using REAL SGO spread lines + odds.

    For each finished soccer match with a prediction and SpreadOdds:
    - Look up the real SGO spread line (e.g. home -1.5, away +1.5)
    - Use a Poisson goal model fitted from (p_home, p_draw, p_away) to compute
      P(home/away covers that specific line)
    - Edge = model_prob − 1/book_odds (real SGO book price, not assumed)
    - Resolve using actual goal scores

    Fallback for matches without SpreadOdds: use AH-0.5 at assumed 1.90
    (so the backtest still shows something for the full history).

    Returns a summary dict stored as metrics["backtest"]["asian_handicap"].
    """
    import numpy as np
    from sqlalchemy import func
    from db.models.odds import SpreadOdds
    from pipelines.picks.auto_picks import _fit_poisson_params, _poisson_ah_prob

    FALLBACK_ODDS = 1.90  # used when no real SGO odds stored
    FALLBACK_IMPLIED = 1.0 / FALLBACK_ODDS

    subq = (
        session.query(PredMatch.match_id, func.max(PredMatch.id).label("latest_id"))
        .join(CoreMatch, CoreMatch.id == PredMatch.match_id)
        .filter(CoreMatch.sport == "soccer")
        .group_by(PredMatch.match_id)
        .subquery()
    )
    rows = (
        session.query(CoreMatch, PredMatch)
        .join(subq, subq.c.match_id == CoreMatch.id)
        .join(PredMatch, PredMatch.id == subq.c.latest_id)
        .filter(
            CoreMatch.sport == "soccer",
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
            CoreMatch.home_score.isnot(None),
            CoreMatch.away_score.isnot(None),
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if not rows:
        log.warning("  Soccer AH: no finished matches with scores.")
        return None

    # Pre-load all spread odds for finished soccer matches
    match_ids = [m.id for m, _ in rows]
    spread_by_match: dict[str, list] = {}
    for sp in session.query(SpreadOdds).filter(
        SpreadOdds.match_id.in_(match_ids),
        SpreadOdds.market_type == "spread",
    ).all():
        spread_by_match.setdefault(sp.match_id, []).append(sp)

    bets = []
    skipped_conf = 0
    skipped_edge = 0
    n_real_odds = 0
    n_fallback = 0

    for match, pred in rows:
        p_home = pred.p_home or 0.0
        p_away = pred.p_away or 0.0
        p_draw = pred.p_draw or 0.0
        if p_home <= 0 or p_away <= 0:
            continue

        confidence = (pred.confidence or 0) / 100.0
        if confidence < min_confidence:
            skipped_conf += 1
            continue

        home_goals = match.home_score
        away_goals = match.away_score
        spreads = spread_by_match.get(match.id, [])

        # Try to find a real SGO spread line with book odds
        bet_placed = False
        lh = la = None  # lazy-init Poisson params

        for sp in spreads:
            if not sp.book_available or not sp.book_odds_decimal:
                continue

            if sp.side == "home":
                line = sp.line  # e.g. -1.5 (home gives 1.5 goals)
                if abs(abs(line) - 0.5) < 0.05 and line < 0:
                    model_prob = p_home
                else:
                    if lh is None:
                        lh, la = _fit_poisson_params(p_home, p_draw, p_away)
                    model_prob, _ = _poisson_ah_prob(lh, la, line)
                # Resolve: home covers if home_goals - away_goals > -line
                diff = home_goals - away_goals
                threshold = -line
                won = diff > threshold
                push = abs(diff - threshold) < 1e-9

            elif sp.side == "away":
                home_line = -sp.line  # convert away line to home-perspective
                if abs(abs(home_line) - 0.5) < 0.05 and home_line < 0:
                    model_prob = p_away + p_draw
                else:
                    if lh is None:
                        lh, la = _fit_poisson_params(p_home, p_draw, p_away)
                    p_home_covers, p_push = _poisson_ah_prob(lh, la, home_line)
                    model_prob = 1.0 - p_home_covers - p_push
                diff = home_goals - away_goals
                threshold = -home_line
                won = diff < threshold
                push = abs(diff - threshold) < 1e-9
            else:
                continue

            if push:
                # Push — stake returned; count as neutral (pnl=0), still a bet
                book_odds = sp.book_odds_decimal
                edge = model_prob - 1.0 / book_odds
                if edge < 0.02:
                    skipped_edge += 1
                    continue
                pnl = 0.0
            else:
                book_odds = sp.book_odds_decimal
                edge = model_prob - 1.0 / book_odds
                if edge < 0.02:
                    skipped_edge += 1
                    continue
                pnl = (book_odds - 1.0) if won else -1.0

            bets.append({
                "match_id": match.id,
                "bet_side": sp.side,
                "line": sp.line,
                "model_prob": model_prob,
                "book_odds": book_odds,
                "edge": edge,
                "pnl": pnl,
                "won": won and not push,
                "date": match.kickoff_utc,
                "real_odds": True,
            })
            n_real_odds += 1
            bet_placed = True
            break  # one bet per match (take the first qualifying spread)

        if bet_placed:
            continue

        # Fallback: no real SGO odds — use AH-0.5 at assumed 1.90
        p_home_ah = p_home
        p_away_ah = p_away + p_draw

        if p_home_ah >= p_away_ah:
            bet_side, model_prob = "home", p_home_ah
        else:
            bet_side, model_prob = "away", p_away_ah

        edge = model_prob - FALLBACK_IMPLIED
        if edge < 0.02:
            skipped_edge += 1
            continue

        diff = home_goals - away_goals
        won = diff > 0 if bet_side == "home" else diff <= 0
        pnl = (FALLBACK_ODDS - 1.0) if won else -1.0

        bets.append({
            "match_id": match.id,
            "bet_side": bet_side,
            "line": -0.5 if bet_side == "home" else 0.5,
            "model_prob": model_prob,
            "book_odds": FALLBACK_ODDS,
            "edge": edge,
            "pnl": pnl,
            "won": won,
            "date": match.kickoff_utc,
            "real_odds": False,
        })
        n_fallback += 1

    if not bets:
        log.warning("  Soccer AH: no bets survived filters (conf_skip=%d edge_skip=%d).",
                    skipped_conf, skipped_edge)
        return None

    pnl_arr = np.array([b["pnl"] for b in bets])
    n_bets = len(bets)
    n_won = sum(1 for b in bets if b["won"])
    total_pnl = float(pnl_arr.sum())
    roi = total_pnl / n_bets

    ret_std = float(pnl_arr.std())
    sharpe = float(pnl_arr.mean() / ret_std * (n_bets ** 0.5)) if ret_std > 0 else 0.0

    cum = np.cumsum(pnl_arr)
    running_max = np.maximum.accumulate(cum)
    max_dd = float((cum - running_max).min())

    date_from = bets[0]["date"]
    date_to = bets[-1]["date"]

    avg_odds = float(np.array([b["book_odds"] for b in bets]).mean())
    result = {
        "n_bets": n_bets,
        "n_bets_real_odds": n_real_odds,
        "n_bets_fallback": n_fallback,
        "n_won": n_won,
        "hit_rate": round(n_won / n_bets, 4),
        "pnl_units": round(total_pnl, 2),
        "roi": round(roi, 4),
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown_units": round(max_dd, 2),
        "avg_odds": round(avg_odds, 3),
        "avg_edge": round(float(np.array([b["edge"] for b in bets]).mean()), 4),
        "min_confidence": min_confidence,
        "skipped_conf": skipped_conf,
        "skipped_edge": skipped_edge,
        "staking": "flat_1u",
        "market": "Asian Handicap (SGO real lines + Poisson model)",
        "side": "model_favourite",
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "run_at": datetime.now(tz=timezone.utc).isoformat(),
    }

    log.info(
        "  soccer-AH  n=%d (real=%d fb=%d)  hit=%.1f%%  pnl=%+.1fu  roi=%+.1f%%  sharpe=%.2f  avg_odds=%.2f",
        n_bets, n_real_odds, n_fallback, n_won / n_bets * 100, total_pnl, roi * 100, sharpe, avg_odds,
    )
    return result


def _run_sgo_spread_sim(
    session: Session,
    sport: str,
    market_key: str,
    min_edge: float = 0.02,
) -> dict | None:
    """
    Generic spread-line backtest using SGO fair_odds vs book_odds.

    Works for basketball (Point Spread), hockey (Puck Line), baseball (Run Line).
    Does NOT use the ML model — instead trusts SGO's own fair probability and
    checks whether the book offers a better price.

    Settlement uses CoreMatch.home_score / away_score.
    Returns a summary dict or None if no data.
    """
    import numpy as np
    from db.models.odds import SpreadOdds
    from pipelines.picks.auto_picks import edge_pct

    MARKET_NAMES = {
        "basketball": "Point Spread",
        "hockey":     "Puck Line",
        "baseball":   "Run Line",
    }
    market_display = MARKET_NAMES.get(sport, "Spread")

    rows = (
        session.query(SpreadOdds, CoreMatch)
        .join(CoreMatch, CoreMatch.id == SpreadOdds.match_id)
        .filter(
            CoreMatch.sport == sport,
            CoreMatch.status == "finished",
            CoreMatch.home_score.isnot(None),
            CoreMatch.away_score.isnot(None),
            SpreadOdds.market_type == "spread",
            SpreadOdds.book_available == True,
            SpreadOdds.book_odds_decimal.isnot(None),
            SpreadOdds.fair_odds_decimal.isnot(None),
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if not rows:
        log.warning("  %s spread sim: no finished matches with SGO spread data.", sport)
        return None

    # One bet per match — pick the spread side with highest edge
    best_by_match: dict[str, dict] = {}
    for sp, match in rows:
        fair_prob = 1.0 / sp.fair_odds_decimal
        e = edge_pct(fair_prob, sp.book_odds_decimal)
        if e < min_edge:
            continue

        existing = best_by_match.get(match.id)
        if existing is None or e > existing["edge"]:
            try:
                home_score = float(match.home_score)
                away_score = float(match.away_score)
            except (TypeError, ValueError):
                continue

            diff = home_score - away_score
            line = sp.line  # home perspective (e.g. -4.5 means home gives 4.5)
            threshold = -line

            if sp.side == "home":
                won = diff > threshold
                push = abs(diff - threshold) < 1e-9
            else:
                # Away side: home must NOT cover
                won = diff < threshold
                push = abs(diff - threshold) < 1e-9

            pnl = 0.0 if push else ((sp.book_odds_decimal - 1.0) if won else -1.0)

            best_by_match[match.id] = {
                "match_id": match.id,
                "side": sp.side,
                "line": sp.line,
                "fair_prob": fair_prob,
                "book_odds": sp.book_odds_decimal,
                "edge": e,
                "pnl": pnl,
                "won": won and not push,
                "push": push,
                "date": match.kickoff_utc,
            }

    bets = sorted(best_by_match.values(), key=lambda b: b["date"])
    if not bets:
        log.warning("  %s spread sim: no bets survived edge filter (min_edge=%.3f).", sport, min_edge)
        return None

    pnl_arr = np.array([b["pnl"] for b in bets])
    n_bets = len(bets)
    n_won = sum(1 for b in bets if b["won"])
    n_push = sum(1 for b in bets if b["push"])
    total_pnl = float(pnl_arr.sum())
    roi = total_pnl / n_bets

    ret_std = float(pnl_arr.std())
    sharpe = float(pnl_arr.mean() / ret_std * (n_bets ** 0.5)) if ret_std > 0 else 0.0

    cum = np.cumsum(pnl_arr)
    running_max = np.maximum.accumulate(cum)
    max_dd = float((cum - running_max).min())

    avg_odds = float(np.array([b["book_odds"] for b in bets]).mean())
    avg_edge = float(np.array([b["edge"] for b in bets]).mean())

    result = {
        "n_bets": n_bets,
        "n_won": n_won,
        "n_push": n_push,
        "hit_rate": round(n_won / n_bets, 4),
        "pnl_units": round(total_pnl, 2),
        "roi": round(roi, 4),
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown_units": round(max_dd, 2),
        "avg_odds": round(avg_odds, 3),
        "avg_edge": round(avg_edge, 4),
        "min_edge": min_edge,
        "staking": "flat_1u",
        "market": market_display,
        "side": "best_edge_per_match",
        "signal": "SGO fair odds",
        "date_from": bets[0]["date"].isoformat() if bets[0]["date"] else None,
        "date_to": bets[-1]["date"].isoformat() if bets[-1]["date"] else None,
        "run_at": datetime.now(tz=timezone.utc).isoformat(),
    }

    log.info(
        "  %s-spread  n=%d  hit=%.1f%%  pnl=%+.1fu  roi=%+.1f%%  sharpe=%.2f  avg_odds=%.2f",
        sport, n_bets, n_won / n_bets * 100, total_pnl, roi * 100, sharpe, avg_odds,
    )
    return result


def _run_for_sport(
    session: Session,
    sport: str,
    staking: str = "flat",
    kelly_fraction: float = 0.25,
    min_edge: float = 0.02,
    min_confidence: float = -1.0,   # -1 = use BACKTEST_MIN_CONFIDENCE per-sport default
) -> dict | None:
    """Run backtester for one sport using all historical predictions."""
    # Apply per-sport defaults if no explicit threshold was passed
    if min_confidence < 0:
        min_confidence = BACKTEST_MIN_CONFIDENCE.get(sport, 0.0)

    # Per-sport edge override (binary sports often lack stored market odds → edge ≈ 0)
    effective_min_edge = BACKTEST_MIN_EDGE.get(sport, min_edge)

    registry = (
        session.query(ModelRegistry)
        .filter_by(sport=sport, is_live=True)
        .order_by(ModelRegistry.trained_at.desc())
        .first()
    )
    if not registry:
        log.warning("  No live model for %s — skipping.", sport)
        return None

    # Use all finished predictions for this sport (any model version).
    # We deduplicate by match_id keeping the latest prediction.
    from sqlalchemy import func
    subq = (
        session.query(PredMatch.match_id, func.max(PredMatch.id).label("latest_id"))
        .join(CoreMatch, CoreMatch.id == PredMatch.match_id)
        .filter(CoreMatch.sport == sport)
        .group_by(PredMatch.match_id)
        .subquery()
    )
    rows = (
        session.query(CoreMatch, PredMatch)
        .join(subq, subq.c.match_id == CoreMatch.id)
        .join(PredMatch, PredMatch.id == subq.c.latest_id)
        .filter(
            CoreMatch.sport == sport,
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if not rows:
        log.warning("  No finished predictions for %s (%s).", sport, registry.model_name)
        return None

    predictions, actuals, odds_list = [], [], []
    for match, pred in rows:
        actual = _outcome_to_float(match.outcome)
        if actual is None:
            continue

        p_home = pred.p_home or 0.0
        p_away = pred.p_away or 0.0
        p_draw = pred.p_draw or 0.0
        confidence = (pred.confidence or 0) / 100.0

        if confidence < min_confidence:
            continue

        # Select odds for the model's best predicted outcome.
        # For binary sports (no draw): both home + away odds are stored, so use
        # the correct side. This prevents artificially inflating P/L by paying
        # home-odds for away wins.
        # For soccer: draw/away odds are often missing (SGO only covers top leagues)
        # so fall back to home odds as a market-efficiency proxy when unavailable.
        best_p = max(p_home, p_draw, p_away)
        if best_p == p_away and p_away > 0.05:
            real_odds = match.odds_away
            fair_odds = 1.0 / p_away
        elif best_p == p_draw and p_draw > 0.05:
            real_odds = match.odds_draw
            fair_odds = 1.0 / p_draw
        else:
            real_odds = match.odds_home
            fair_odds = 1.0 / p_home if p_home > 0.05 else None

        if real_odds and real_odds > 1.0:
            bet_odds = real_odds
        elif sport == "soccer":
            # Soccer fallback: home odds proxy preserves ~300-bet SGO coverage
            bet_odds = match.odds_home if (match.odds_home and match.odds_home > 1.0) else fair_odds
        else:
            # For binary-odds sports, skip if specific outcome odds aren't stored
            bet_odds = fair_odds

        predictions.append(PredictionResult(
            match_id=match.id,
            sport=Sport(sport),
            p_home=p_home,
            p_away=p_away,
            p_draw=p_draw,
            confidence=confidence,
        ))
        actuals.append(actual)
        odds_list.append(bet_odds)

    if not predictions:
        log.warning("  No valid predictions for %s after filtering.", sport)
        return None

    config = StakingConfig(method=staking, kelly_fraction=kelly_fraction, min_edge=effective_min_edge)
    result = Backtester(config).run(predictions, actuals, odds_list)

    date_from = rows[0][0].kickoff_utc
    date_to = rows[-1][0].kickoff_utc

    summary = {
        "live_model": registry.model_name,
        "n_predictions": result.n_predictions,
        "n_correct": result.n_correct,
        "accuracy": round(result.accuracy, 4),
        "roi": round(result.roi, 4),
        "sharpe_ratio": round(result.sharpe_ratio, 3),
        "max_drawdown": round(result.max_drawdown, 4),
        "log_loss": round(result.log_loss, 4),
        "brier_score": round(result.brier_score, 4),
        "calibration_error": round(result.calibration_error, 4),
        "pnl_units": round(result.pnl_units, 2),
        "staking": staking,
        "kelly_fraction": kelly_fraction if staking == "kelly" else None,
        "min_edge": min_edge,
        "min_confidence": min_confidence,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "run_at": datetime.now(tz=timezone.utc).isoformat(),
        **result.metadata,
    }

    dd_pct = result.max_drawdown / config.bankroll_start * 100  # convert units → %
    log.info(
        "  %-10s  n=%d  acc=%.1f%%  roi=%+.1f%%  sharpe=%.2f  drawdown=%.1f%%",
        sport,
        result.n_predictions,
        result.accuracy * 100,
        result.roi * 100,
        result.sharpe_ratio,
        dd_pct,
    )

    # Persist into model_registry.metrics["backtest"]
    metrics = dict(registry.metrics or {})
    metrics["backtest"] = summary

    # Sport-specific handicap / spread simulations
    if sport == "tennis":
        hc_result = _run_tennis_handicap(session, min_confidence=min_confidence)
        if hc_result:
            metrics["backtest"]["set_handicap"] = hc_result
    elif sport == "soccer":
        dnb_result = _run_soccer_draw_no_bet(session, min_confidence=min_confidence)
        if dnb_result:
            metrics["backtest"]["draw_no_bet"] = dnb_result
        ah_result = _run_soccer_asian_handicap(session, min_confidence=min_confidence)
        if ah_result:
            metrics["backtest"]["asian_handicap"] = ah_result
    elif sport == "basketball":
        spread_result = _run_sgo_spread_sim(session, "basketball", "point_spread", min_edge=0.02)
        if spread_result:
            metrics["backtest"]["point_spread"] = spread_result
    elif sport == "hockey":
        spread_result = _run_sgo_spread_sim(session, "hockey", "puck_line", min_edge=0.02)
        if spread_result:
            metrics["backtest"]["puck_line"] = spread_result
    elif sport == "baseball":
        spread_result = _run_sgo_spread_sim(session, "baseball", "run_line", min_edge=0.02)
        if spread_result:
            metrics["backtest"]["run_line"] = spread_result

    registry.metrics = metrics

    return summary


def run(sport: str | None = None, staking: str = "flat", kelly_fraction: float = 0.25, min_edge: float = 0.02, min_confidence: float = -1.0) -> None:
    session: Session = SessionLocal()
    try:
        target_sports = [sport] if sport and sport != "all" else SPORTS
        log.info("Running backtest for: %s  staking=%s  min_edge=%.2f  min_conf=%.2f", target_sports, staking, min_edge, min_confidence)

        all_results = {}
        for s in target_sports:
            log.info("--- %s ---", s.upper())
            result = _run_for_sport(session, s, staking, kelly_fraction, min_edge, min_confidence)
            if result:
                all_results[s] = result

        session.commit()
        log.info("Backtest complete. Results stored in model_registry.metrics['backtest'].")

        if all_results:
            log.info("\n%-12s %-8s %-8s %-8s %-8s", "Sport", "Acc", "ROI", "Sharpe", "n")
            log.info("-" * 48)
            for s, r in all_results.items():
                log.info("%-12s %-8s %-8s %-8s %-8d",
                    s,
                    f"{r['accuracy']:.1%}",
                    f"{r['roi']:+.1%}",
                    f"{r['sharpe_ratio']:.2f}",
                    r['n_predictions'],
                )

    except Exception:
        session.rollback()
        log.exception("Backtest failed")
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run backtest across all live models")
    parser.add_argument("--sport", default=None, help="soccer|tennis|esports|basketball|baseball|hockey|all")
    parser.add_argument("--staking", default="flat", choices=["flat", "kelly", "fractional"])
    parser.add_argument("--kelly-fraction", type=float, default=0.25)
    parser.add_argument("--min-edge", type=float, default=0.02)
    args = parser.parse_args()
    run(sport=args.sport, staking=args.staking, kelly_fraction=args.kelly_fraction, min_edge=args.min_edge)


if __name__ == "__main__":
    main()
