"""
Soccer feature engineering pipeline.

Feature categories:
    1. ELO differentials (team + player-adjusted)
    2. Form metrics (rolling xG, xGA, PPDA, possession)
    3. Head-to-head record
    4. Lineup strength differential
    5. Injury impact score
    6. Weather impact
    7. Schedule context (rest days, travel fatigue, congestion)
    8. Tactical matchup proxies
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from core.base_pipeline import FeaturePipeline
from db.models import (
    Match, SoccerMatch, SoccerTeamForm, SoccerLineup,
    SoccerInjury, TeamRating, HeadToHead,
)


FEATURE_NAMES = [
    # ELO features
    "elo_diff",                    # home_elo - away_elo
    "elo_home",
    "elo_away",
    "player_adj_elo_diff",         # lineup-adjusted ELO diff
    # Form features (rolling 60 days)
    "home_xg_avg",
    "home_xga_avg",
    "away_xg_avg",
    "away_xga_avg",
    "home_xpts_avg",
    "away_xpts_avg",
    "home_ppda_avg",
    "away_ppda_avg",
    "home_possession_avg",
    "away_possession_avg",
    "home_win_pct",
    "away_win_pct",
    "home_clean_sheet_pct",
    "away_clean_sheet_pct",
    # xG form differential
    "xg_diff",                     # home_xg_avg - away_xg_avg
    "xga_diff",
    # Head-to-head
    "h2h_home_win_pct",            # home team win % in H2H
    "h2h_matches_played",
    "h2h_avg_goals",
    # Lineup
    "home_lineup_strength",        # avg ELO of starting XI (if available)
    "away_lineup_strength",
    "lineup_strength_diff",
    # Injury impact
    "home_injury_impact",          # aggregate ELO lost from injuries
    "away_injury_impact",
    # Weather
    "temperature_c",
    "wind_speed_kmh",
    "precipitation_mm",
    "is_adverse_weather",          # binary: temp<5 or wind>40 or rain>5
    # Schedule
    "home_days_rest",
    "away_days_rest",
    "rest_diff",                   # home_days_rest - away_days_rest
    "home_matches_last_30d",
    "away_matches_last_30d",
    "schedule_congestion_diff",
    "home_travel_km",
    "away_travel_km",
    # Context
    "is_neutral_venue",
    "competition_importance",
]


class SoccerFeaturePipeline(FeaturePipeline):
    """
    Extracts and engineers features for soccer match prediction.

    All features are computed as of the match kickoff date
    using only data available before the match (no leakage).
    """

    def extract(self, match_ids: list[str], db_session: Session) -> pd.DataFrame:
        """
        Pull raw data from DB for the given match IDs.
        Returns one row per match with raw fields.
        """
        rows = []
        for match_id in match_ids:
            match = db_session.get(Match, match_id)
            if match is None:
                continue
            soccer = db_session.get(SoccerMatch, match_id)

            row = {
                "match_id": match_id,
                "home_team_id": match.home_entity_id,
                "away_team_id": match.away_entity_id,
                "scheduled_at": match.scheduled_at,
                "competition_importance": match.importance,
                "is_neutral_venue": soccer.is_neutral_venue if soccer else False,
                # Weather
                "temperature_c": soccer.temperature_c if soccer else None,
                "wind_speed_kmh": soccer.wind_speed_kmh if soccer else None,
                "precipitation_mm": soccer.precipitation_mm if soccer else None,
                # Schedule
                "home_days_rest": soccer.home_days_rest if soccer else None,
                "away_days_rest": soccer.away_days_rest if soccer else None,
                "home_travel_km": soccer.home_travel_km if soccer else None,
                "away_travel_km": soccer.away_travel_km if soccer else None,
            }
            rows.append(row)

        return pd.DataFrame(rows)

    def transform(self, raw: pd.DataFrame) -> pd.DataFrame:
        """
        This is where the heavy feature engineering happens.
        In production each sub-feature would be pulled from pre-computed form tables.
        For now this defines the transformation logic structure.
        """
        df = raw.copy()

        # Placeholder columns — filled from pre-computed form tables in prod
        for col in FEATURE_NAMES:
            if col not in df.columns:
                df[col] = np.nan

        # Derived features
        if "home_xg_avg" in df.columns and "away_xg_avg" in df.columns:
            df["xg_diff"] = df["home_xg_avg"] - df["away_xg_avg"]
        if "home_xga_avg" in df.columns and "away_xga_avg" in df.columns:
            df["xga_diff"] = df["home_xga_avg"] - df["away_xga_avg"]
        if "home_days_rest" in df.columns and "away_days_rest" in df.columns:
            df["rest_diff"] = df["home_days_rest"] - df["away_days_rest"]
        if "home_lineup_strength" in df.columns and "away_lineup_strength" in df.columns:
            df["lineup_strength_diff"] = df["home_lineup_strength"] - df["away_lineup_strength"]
        if "elo_home" in df.columns and "elo_away" in df.columns:
            df["elo_diff"] = df["elo_home"] - df["elo_away"]

        # Weather flag
        df["is_adverse_weather"] = (
            (df["temperature_c"].fillna(15) < 5) |
            (df["wind_speed_kmh"].fillna(0) > 40) |
            (df["precipitation_mm"].fillna(0) > 5)
        ).astype(int)

        return df[["match_id"] + FEATURE_NAMES].copy()

    def validate(self, features: pd.DataFrame) -> bool:
        """
        Check that required ELO features are present and in valid ranges.
        """
        critical = ["elo_diff", "elo_home", "elo_away"]
        missing = [c for c in critical if c not in features.columns]
        if missing:
            raise ValueError(f"SoccerFeaturePipeline: missing critical features: {missing}")

        if features["elo_home"].notna().any():
            if not features["elo_home"].between(800, 2500).all():
                raise ValueError("ELO home ratings out of expected range [800, 2500]")
        if features["home_win_pct"].notna().any():
            if not features["home_win_pct"].between(0, 1).all():
                raise ValueError("home_win_pct must be in [0, 1]")

        return True

    def get_feature_names(self) -> list[str]:
        return FEATURE_NAMES
