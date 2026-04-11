"""
Spread and over/under pick generation.

Runs after fetch_odds_sgo has populated SpreadOdds rows.
Uses SGO's fair_odds vs book_odds to compute edge, then creates
TrackedPick + TipsterTip rows for qualifying bets.

Market names:
  basketball: "Point Spread" / "Total Points"
  baseball:   "Run Line"     / "Total Runs"
  hockey:     "Puck Line"    / "Total Goals"
  soccer:     "Asian Handicap" / "Total Goals"
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from config.settings import settings
from db.models.mvp import CoreMatch, CoreLeague, CoreTeam
from db.models.odds import SpreadOdds
from db.models.picks import TrackedPick
from db.models.tipsters import TipsterTip
from db.session import SessionLocal
from pipelines.picks.auto_picks import kelly_fraction, edge_pct, _already_picked, _already_tipped
from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

log = logging.getLogger(__name__)

# Minimum edge to generate a spread/total pick
SPREAD_MIN_EDGE: dict[str, float] = {
    "basketball": 0.02,
    "baseball":   0.025,
    "hockey":     0.02,
    "soccer":     0.02,
}
TOTAL_MIN_EDGE: dict[str, float] = {
    "basketball": 0.015,
    "baseball":   0.02,
    "hockey":     0.02,
    "soccer":     0.02,
}

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


def run(
    kelly_frac: float = settings.AUTO_PICK_KELLY_FRACTION,
    user_id: str = settings.AUTO_PICK_USER_ID,
    dry_run: bool = False,
) -> int:
    """
    Scan SpreadOdds for upcoming matches and create picks where edge > threshold.
    Returns number of picks created.
    """
    db = SessionLocal()
    created = 0

    try:
        now = datetime.now(timezone.utc)

        # All scheduled/live matches that have spread odds with book prices available
        rows = (
            db.query(SpreadOdds, CoreMatch)
            .join(CoreMatch, CoreMatch.id == SpreadOdds.match_id)
            .filter(
                CoreMatch.status.in_(["scheduled", "live"]),
                CoreMatch.kickoff_utc > now,
                SpreadOdds.book_available == True,
                SpreadOdds.book_odds_decimal.isnot(None),
                SpreadOdds.fair_odds_decimal.isnot(None),
            )
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )

        log.info("[spread_picks] Evaluating %d spread/total odds rows ...", len(rows))

        for spread, match in rows:
            sport = match.sport

            # Soccer AH + totals are handled by auto_picks.py (Poisson model + confidence gate).
            # spread_picks.py only uses SGO's own fair odds with no model signal — skip soccer.
            if sport == "soccer":
                continue

            market_name = (
                SPREAD_MARKET.get(sport) if spread.market_type == "spread"
                else TOTAL_MARKET.get(sport)
            )
            if not market_name:
                continue  # sport not supported for this market

            min_edge = (
                SPREAD_MIN_EDGE.get(sport, 0.02) if spread.market_type == "spread"
                else TOTAL_MIN_EDGE.get(sport, 0.02)
            )

            # Edge: SGO fair prob vs book implied prob
            fair_prob = 1.0 / spread.fair_odds_decimal
            e = edge_pct(fair_prob, spread.book_odds_decimal)

            if e < min_edge:
                continue
            if spread.book_odds_decimal < settings.MIN_ODDS or spread.book_odds_decimal > settings.MAX_ODDS:
                continue

            # Build selection label
            home_team = db.get(CoreTeam, match.home_team_id)
            away_team = db.get(CoreTeam, match.away_team_id)
            if not home_team or not away_team:
                continue

            if spread.market_type == "spread":
                team_name = home_team.name if spread.side == "home" else away_team.name
                # Format line with explicit sign
                line_str = f"{spread.line:+.1f}" if spread.line != int(spread.line) else f"{spread.line:+.0f}"
                selection_label = f"{team_name} {line_str}"
            else:
                # Total
                line_str = f"{spread.line:.1f}" if spread.line != int(spread.line) else f"{spread.line:.0f}"
                selection_label = f"{'Over' if spread.side == 'over' else 'Under'} {line_str}"

            league = db.get(CoreLeague, match.league_id)
            league_name = league.name if league else "Unknown"
            match_label = f"{home_team.name} vs {away_team.name}"

            # Dedup
            if _already_picked(db, user_id, match.id, market_name, selection_label):
                log.debug("  Skip (already picked): %s %s", match_label, selection_label)
                continue

            k = kelly_fraction(fair_prob, spread.book_odds_decimal)
            stake = round(k * kelly_frac, 4)

            log.info(
                "  [%s] %s | %s @ %.2f | edge=+%.1f%% | kelly=%.1f%%",
                sport, match_label, selection_label, spread.book_odds_decimal,
                e * 100, k * 100,
            )

            created += 1
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
                    odds=spread.book_odds_decimal,
                    edge=round(e, 4),
                    kelly_fraction=round(k, 4),
                    stake_fraction=stake,
                    auto_generated=True,
                )
                db.add(pick)

                ai_tipster_id = AI_TIPSTER_IDS.get(sport)
                if ai_tipster_id and not _already_tipped(
                    db, ai_tipster_id, match_label, market_name, selection_label
                ):
                    db.add(TipsterTip(
                        user_id=ai_tipster_id,
                        sport=sport,
                        match_label=match_label,
                        market_name=market_name,
                        selection_label=selection_label,
                        odds=spread.book_odds_decimal,
                        start_time=match.kickoff_utc,
                        match_id=match.id,
                        note=(
                            f"{'Spread' if spread.market_type == 'spread' else 'Total'} "
                            f"(line {spread.line:+g}) | Edge: +{round(e * 100, 1)}% | Kelly: {round(k * 100, 1)}%"
                        ),
                    ))

        if not dry_run:
            db.commit()
            log.info("[spread_picks] Created %d picks.", created)
        else:
            log.info("[spread_picks] DRY RUN — would create %d picks.", created)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return created
