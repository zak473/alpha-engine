"""
Esports feature engineering pipeline (CS2 / MOBA).

Feature categories:
    1. Global and map-specific ELO differentials
    2. Map pool profile (team's map win rates)
    3. Side bias (CT/T round differential on this map)
    4. Player aggregate ratings (avg HLTV 2.0 / KAST / ADR)
    5. Roster stability score
    6. Patch impact weighting
    7. Momentum (current win/loss streak)
    8. LAN vs online performance split
    9. Head-to-head on this map
    10. Recent form (last 30 days)
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from core.base_pipeline import FeaturePipeline


FEATURE_NAMES = [
    # ELO
    "elo_diff",                    # global ELO diff (A - B)
    "elo_map_diff",                # map-specific ELO diff
    "elo_a",
    "elo_b",
    "elo_map_a",
    "elo_map_b",
    # Map pool
    "a_map_win_pct",               # team A win% on this specific map
    "b_map_win_pct",
    "map_win_pct_diff",
    "a_map_sample_size",           # how many times A has played this map (confidence)
    "b_map_sample_size",
    # Side bias
    "map_ct_bias",                 # avg CT-side win advantage on this map (global meta)
    "a_ct_win_pct",                # team A's win% when on CT side
    "a_t_win_pct",
    "b_ct_win_pct",
    "b_t_win_pct",
    "side_advantage_diff",
    # Player aggregate ratings
    "a_avg_rating",                # avg HLTV 2.0 rating across active roster
    "b_avg_rating",
    "rating_diff",
    "a_avg_adr",
    "b_avg_adr",
    "a_avg_kast",
    "b_avg_kast",
    # Roster
    "a_roster_stability",          # [0,1] — 1=stable roster, 0=recent changes
    "b_roster_stability",
    "roster_stability_diff",
    # Momentum
    "a_win_streak",
    "b_win_streak",
    "a_loss_streak",
    "b_loss_streak",
    "momentum_diff",               # a_win_streak - b_win_streak
    # LAN / online
    "is_lan",
    "a_lan_win_pct",
    "b_lan_win_pct",
    "lan_advantage_diff",          # a_lan - b_lan (0 if not LAN)
    # Head-to-head
    "h2h_a_win_pct",
    "h2h_map_a_win_pct",           # H2H on this specific map
    "h2h_matches_played",
    # Patch
    "patch_age_days",              # how old is the current patch
    "is_major_patch",              # binary: patch was major (meta shift)
    # Form (last 30 days)
    "a_series_win_pct_30d",
    "b_series_win_pct_30d",
    "a_map_win_pct_30d",
    "b_map_win_pct_30d",
    # Context
    "tournament_importance",
]


class EsportsFeaturePipeline(FeaturePipeline):
    """
    Extracts and engineers features for esports match prediction.
    Designed for map-level prediction (CS2) and series-level (MOBA).
    """

    def extract(self, match_ids: list[str], db_session: Session) -> pd.DataFrame:
        from db.models import Match
        from db.models.esports import EsportsMatch

        rows = []
        for match_id in match_ids:
            match = db_session.get(Match, match_id)
            if not match:
                continue
            esports = db_session.get(EsportsMatch, match_id)

            row = {
                "match_id": match_id,
                "team_a_id": match.home_entity_id,
                "team_b_id": match.away_entity_id,
                "scheduled_at": match.scheduled_at,
                "competition_importance": match.importance,
                "is_lan": esports.is_lan if esports else False,
                "format": esports.format if esports else "bo3",
            }
            rows.append(row)

        return pd.DataFrame(rows)

    def transform(self, raw: pd.DataFrame) -> pd.DataFrame:
        df = raw.copy()

        for col in FEATURE_NAMES:
            if col not in df.columns:
                df[col] = np.nan

        # Derived differentials
        df["elo_diff"] = df["elo_a"] - df["elo_b"]
        df["elo_map_diff"] = df["elo_map_a"] - df["elo_map_b"]
        df["map_win_pct_diff"] = df["a_map_win_pct"] - df["b_map_win_pct"]
        df["rating_diff"] = df["a_avg_rating"] - df["b_avg_rating"]
        df["roster_stability_diff"] = df["a_roster_stability"] - df["b_roster_stability"]
        df["momentum_diff"] = df["a_win_streak"] - df["b_win_streak"]

        df["side_advantage_diff"] = (
            (df["a_ct_win_pct"].fillna(0.5) - 0.5) - (df["b_ct_win_pct"].fillna(0.5) - 0.5)
        )

        df["lan_advantage_diff"] = np.where(
            df["is_lan"].fillna(False),
            df["a_lan_win_pct"].fillna(0.5) - df["b_lan_win_pct"].fillna(0.5),
            0.0,
        )

        df["tournament_importance"] = df["competition_importance"].fillna(1.0)

        return df[["match_id"] + FEATURE_NAMES].copy()

    def validate(self, features: pd.DataFrame) -> bool:
        critical = ["elo_diff", "elo_map_diff"]
        missing = [c for c in critical if c not in features.columns]
        if missing:
            raise ValueError(f"EsportsFeaturePipeline: missing features: {missing}")
        return True

    def get_feature_names(self) -> list[str]:
        return FEATURE_NAMES
