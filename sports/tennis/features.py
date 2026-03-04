"""
Tennis feature engineering pipeline.

Feature categories:
    1. Surface-specific ELO differential
    2. Global ELO differential
    3. Serve/return efficiency metrics
    4. Break point conversion differentials
    5. Form stats (win%, surface win%)
    6. Head-to-head on this surface
    7. Fatigue (days rest, matches in last 14 days)
    8. Match length recovery (avg match duration)
    9. Indoor vs outdoor adjustment
    10. Tournament level and round context
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from core.base_pipeline import FeaturePipeline


FEATURE_NAMES = [
    # ELO
    "elo_diff",                        # global ELO diff (A - B)
    "elo_surface_diff",                # surface-specific ELO diff
    "elo_a",
    "elo_b",
    "elo_surface_a",
    "elo_surface_b",
    # Serve (player A)
    "a_first_serve_in_pct",
    "a_first_serve_won_pct",
    "a_second_serve_won_pct",
    "a_service_hold_pct",
    "a_aces_per_match",
    "a_df_per_match",
    # Serve (player B)
    "b_first_serve_in_pct",
    "b_first_serve_won_pct",
    "b_second_serve_won_pct",
    "b_service_hold_pct",
    "b_aces_per_match",
    "b_df_per_match",
    # Serve differential
    "serve_dominance_diff",            # A serve hold% - B serve hold%
    # Return (player A)
    "a_return_won_pct",
    "a_bp_conversion_pct",
    # Return (player B)
    "b_return_won_pct",
    "b_bp_conversion_pct",
    # Return differential
    "return_dominance_diff",           # A return won% - B return won%
    "bp_conversion_diff",
    # Form
    "a_win_pct_all",
    "a_win_pct_surface",
    "b_win_pct_all",
    "b_win_pct_surface",
    "win_pct_diff",
    "surface_win_pct_diff",
    # Head-to-head
    "h2h_a_win_pct",                   # A's win% against B historically
    "h2h_surface_a_win_pct",           # on this surface specifically
    "h2h_matches_played",
    # Fatigue
    "a_days_rest",
    "b_days_rest",
    "rest_diff",
    "a_matches_last_14d",
    "b_matches_last_14d",
    "a_avg_match_duration_last_5",     # avg minutes per match
    "b_avg_match_duration_last_5",
    "fatigue_diff",                    # composite fatigue score
    # Context
    "is_indoor",
    "tournament_importance",           # 1.0 = ATP250, 1.5 = GS
    "round_importance",                # final > semis > QF etc.
    "is_best_of_5",
]


class TennisFeaturePipeline(FeaturePipeline):
    """
    Extracts and engineers features for tennis match prediction.
    Supports both ATP and WTA (surface logic identical, model may differ).
    """

    def extract(self, match_ids: list[str], db_session: Session) -> pd.DataFrame:
        from db.models import Match
        from db.models.tennis import TennisMatch

        rows = []
        for match_id in match_ids:
            match = db_session.get(Match, match_id)
            if not match:
                continue
            tennis = db_session.get(TennisMatch, match_id)

            row = {
                "match_id": match_id,
                "player_a_id": match.home_entity_id,
                "player_b_id": match.away_entity_id,
                "scheduled_at": match.scheduled_at,
                "surface": tennis.surface if tennis else "hard",
                "is_indoor": tennis.is_indoor if tennis else False,
                "tournament_importance": tennis.tournament_importance if tennis else 1.0,
                "is_best_of_5": (tennis.best_of == 5) if tennis else False,
                "a_days_rest": tennis.player_a_days_rest if tennis else None,
                "b_days_rest": tennis.player_b_days_rest if tennis else None,
                "a_matches_last_14d": tennis.player_a_matches_last_14d if tennis else None,
                "b_matches_last_14d": tennis.player_b_matches_last_14d if tennis else None,
            }
            rows.append(row)

        return pd.DataFrame(rows)

    def transform(self, raw: pd.DataFrame) -> pd.DataFrame:
        df = raw.copy()

        # Ensure all feature columns exist
        for col in FEATURE_NAMES:
            if col not in df.columns:
                df[col] = np.nan

        # Derived differentials
        df["elo_diff"] = df["elo_a"] - df["elo_b"]
        df["elo_surface_diff"] = df["elo_surface_a"] - df["elo_surface_b"]
        df["serve_dominance_diff"] = df["a_service_hold_pct"] - df["b_service_hold_pct"]
        df["return_dominance_diff"] = df["a_return_won_pct"] - df["b_return_won_pct"]
        df["bp_conversion_diff"] = df["a_bp_conversion_pct"] - df["b_bp_conversion_pct"]
        df["win_pct_diff"] = df["a_win_pct_all"] - df["b_win_pct_all"]
        df["surface_win_pct_diff"] = df["a_win_pct_surface"] - df["b_win_pct_surface"]
        df["rest_diff"] = df["a_days_rest"] - df["b_days_rest"]

        # Composite fatigue: penalises players with more recent matches + less rest
        df["fatigue_diff"] = (
            (df["a_matches_last_14d"].fillna(0) - df["b_matches_last_14d"].fillna(0)) * 0.3
            + (df["b_days_rest"].fillna(3) - df["a_days_rest"].fillna(3)) * 0.7
        )

        return df[["match_id"] + FEATURE_NAMES].copy()

    def validate(self, features: pd.DataFrame) -> bool:
        critical = ["elo_diff", "elo_surface_diff"]
        missing = [c for c in critical if c not in features.columns]
        if missing:
            raise ValueError(f"TennisFeaturePipeline: missing critical features: {missing}")

        for pct_col in ["a_first_serve_in_pct", "b_first_serve_in_pct",
                        "a_win_pct_all", "b_win_pct_all"]:
            if pct_col in features.columns and features[pct_col].notna().any():
                if not features[pct_col].dropna().between(0, 1).all():
                    raise ValueError(f"{pct_col} must be in [0, 1]")

        return True

    def get_feature_names(self) -> list[str]:
        return FEATURE_NAMES
