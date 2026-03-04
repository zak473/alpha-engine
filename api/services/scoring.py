"""
Scoring service — brier and points modes.

brier:  score = 1 - (p_picked - outcome)^2  (higher = better, range 0-1)
        Lower raw brier score = better calibration, but we store as
        score_value = 1 - brier so that higher = better in leaderboard too.

points: score = 1.0 if correct, 0.0 otherwise
"""

from __future__ import annotations


def score_brier(p_picked: float, outcome: float) -> float:
    """
    Args:
        p_picked: predicted probability for the chosen outcome (0-1)
        outcome:  1.0 if the pick was correct, 0.0 if not
    Returns:
        score_value in [0, 1] where higher is better
    """
    raw_brier = (p_picked - outcome) ** 2
    return round(1.0 - raw_brier, 6)


def score_points(correct: bool) -> float:
    return 1.0 if correct else 0.0


def compute_score(
    scoring_type: str,
    pick_type: str,
    prediction_payload: dict,
    outcome_payload: dict,
) -> float:
    """
    Compute a score for one entry given the outcome.

    prediction_payload: {"p_home": 0.5, "p_draw": 0.3, "p_away": 0.2, ...}
    outcome_payload:    {"outcome": "home_win", "correct": true}
    """
    correct: bool = outcome_payload.get("correct", False)

    if scoring_type == "points":
        return score_points(correct)

    # brier: need the probability that was assigned to the picked outcome
    p_map = {
        "home_win": prediction_payload.get("p_home", 0.5),
        "draw":     prediction_payload.get("p_draw", 0.3),
        "away_win": prediction_payload.get("p_away", 0.2),
    }
    p_picked = p_map.get(pick_type, 0.5)
    outcome_value = 1.0 if correct else 0.0
    return score_brier(p_picked, outcome_value)
