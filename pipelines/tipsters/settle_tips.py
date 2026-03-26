"""
One-off (and scheduled) settlement of pending AI tipster tips.

Matches a TipsterTip.selection_label against the home/away team names on
the CoreMatch — exactly the same logic as the scheduler job, but runnable
standalone to settle all existing backlog immediately.

Usage:
    python -m pipelines.tipsters.settle_tips
    python -m pipelines.tipsters.settle_tips --dry-run
"""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone

from db.models.mvp import CoreMatch, CoreTeam
from db.models.tipsters import TipsterTip
from db.session import SessionLocal
from pipelines.tipsters.seed_ai_tipsters import AI_TIPSTER_IDS

log = logging.getLogger(__name__)


def run(dry_run: bool = False, all_users: bool = False, recheck: bool = False) -> int:
    """
    Settle pending TipsterTips whose match is finished.

    By default only settles AI tipster accounts. Pass all_users=True to also
    settle tips posted by human users that have a match_id set.
    Pass recheck=True to re-evaluate already-settled tips (fixes wrong outcomes).

    Returns number of tips settled/corrected.
    """
    db = SessionLocal()
    settled = 0
    skipped = 0
    now = datetime.now(timezone.utc)

    try:
        q = db.query(TipsterTip).filter(
            TipsterTip.match_id.isnot(None),
        )
        if not recheck:
            q = q.filter(TipsterTip.outcome.is_(None))
        if not all_users:
            ai_ids = set(AI_TIPSTER_IDS.values())
            q = q.filter(TipsterTip.user_id.in_(ai_ids))

        pending = q.all()
        log.info("settle_tips: %d pending tips to evaluate.", len(pending))

        for tip in pending:
            match = db.query(CoreMatch).filter(CoreMatch.id == tip.match_id).first()
            if not match or match.status != "finished":
                continue

            # Derive outcome from scores if missing
            if not match.outcome:
                hs, as_ = match.home_score, match.away_score
                if hs is not None and as_ is not None:
                    try:
                        h_int, a_int = int(hs), int(as_)
                        if h_int > a_int:
                            match.outcome = "home_win"
                        elif a_int > h_int:
                            match.outcome = "away_win"
                        elif match.sport == "soccer":
                            match.outcome = "draw"
                    except (ValueError, TypeError):
                        pass

            if not match.outcome:
                continue

            label = tip.selection_label.lower().strip()
            mo = match.outcome or ""
            is_home_win = mo in ("home_win", "H")
            is_away_win = mo in ("away_win", "A")

            if label == "draw":
                outcome = "won" if match.outcome == "draw" else "lost"
            elif label == "home":
                outcome = "won" if is_home_win else "lost"
            elif label == "away":
                outcome = "won" if is_away_win else "lost"
            else:
                home_team = db.get(CoreTeam, match.home_team_id)
                away_team = db.get(CoreTeam, match.away_team_id)
                home_name = (home_team.name or "").lower() if home_team else ""
                away_name = (away_team.name or "").lower() if away_team else ""

                if home_name and (home_name in label or label in home_name):
                    outcome = "won" if is_home_win else "lost"
                elif away_name and (away_name in label or label in away_name):
                    outcome = "won" if is_away_win else "lost"
                else:
                    log.debug(
                        "  can't match label '%s' to home='%s' away='%s' (tip=%s)",
                        tip.selection_label, home_name, away_name, tip.id,
                    )
                    skipped += 1
                    continue

            log.info(
                "  [%s] %s | %s → %s (%s)",
                tip.sport, tip.match_label, tip.selection_label, outcome, match.outcome,
            )
            if not dry_run:
                tip.outcome = outcome
                tip.settled_at = now
            settled += 1

        if not dry_run and settled:
            db.commit()

        log.info(
            "settle_tips: %s %d tips, skipped %d (label unresolved).",
            "would settle" if dry_run else "settled", settled, skipped,
        )
        return settled

    except Exception:
        db.rollback()
        log.exception("settle_tips failed")
        raise
    finally:
        db.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    parser = argparse.ArgumentParser(description="Settle pending AI tipster tips")
    parser.add_argument("--dry-run", action="store_true", help="Print results without writing")
    parser.add_argument("--all-users", action="store_true", help="Also settle human user tips with match_id")
    parser.add_argument("--recheck", action="store_true", help="Re-evaluate already-settled tips to fix wrong outcomes")
    args = parser.parse_args()
    n = run(dry_run=args.dry_run, all_users=args.all_users, recheck=args.recheck)
    print(f"{'Would settle' if args.dry_run else 'Settled'} {n} tips.")


if __name__ == "__main__":
    main()
