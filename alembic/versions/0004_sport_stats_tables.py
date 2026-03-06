"""Add sport-specific stats tables and event context

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-04

Creates:
    - basketball_team_match_stats
    - baseball_team_match_stats
    - event_context
    - rating_elo_basketball
    - rating_elo_baseball
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── basketball_team_match_stats ────────────────────────────────────────
    op.create_table(
        "basketball_team_match_stats",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), sa.ForeignKey("core_matches.id"), nullable=False),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("is_home", sa.Boolean(), nullable=False),
        # Scoring
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("points_q1", sa.Integer(), nullable=True),
        sa.Column("points_q2", sa.Integer(), nullable=True),
        sa.Column("points_q3", sa.Integer(), nullable=True),
        sa.Column("points_q4", sa.Integer(), nullable=True),
        sa.Column("points_ot", sa.Integer(), nullable=True),
        # Shooting
        sa.Column("fg_made", sa.Integer(), nullable=True),
        sa.Column("fg_attempted", sa.Integer(), nullable=True),
        sa.Column("fg_pct", sa.Float(), nullable=True),
        sa.Column("fg3_made", sa.Integer(), nullable=True),
        sa.Column("fg3_attempted", sa.Integer(), nullable=True),
        sa.Column("fg3_pct", sa.Float(), nullable=True),
        sa.Column("ft_made", sa.Integer(), nullable=True),
        sa.Column("ft_attempted", sa.Integer(), nullable=True),
        sa.Column("ft_pct", sa.Float(), nullable=True),
        # Rebounds
        sa.Column("rebounds_total", sa.Integer(), nullable=True),
        sa.Column("rebounds_offensive", sa.Integer(), nullable=True),
        sa.Column("rebounds_defensive", sa.Integer(), nullable=True),
        # Playmaking
        sa.Column("assists", sa.Integer(), nullable=True),
        sa.Column("turnovers", sa.Integer(), nullable=True),
        sa.Column("assists_to_turnover", sa.Float(), nullable=True),
        # Defense
        sa.Column("steals", sa.Integer(), nullable=True),
        sa.Column("blocks", sa.Integer(), nullable=True),
        sa.Column("fouls", sa.Integer(), nullable=True),
        # Advanced
        sa.Column("plus_minus", sa.Integer(), nullable=True),
        sa.Column("pace", sa.Float(), nullable=True),
        sa.Column("offensive_rating", sa.Float(), nullable=True),
        sa.Column("defensive_rating", sa.Float(), nullable=True),
        sa.Column("net_rating", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("match_id", "team_id", name="uq_bball_team_match_stats"),
    )
    op.create_index("ix_bball_tms_match", "basketball_team_match_stats", ["match_id"])
    op.create_index("ix_bball_tms_team", "basketball_team_match_stats", ["team_id"])

    # ── baseball_team_match_stats ──────────────────────────────────────────
    op.create_table(
        "baseball_team_match_stats",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), sa.ForeignKey("core_matches.id"), nullable=False),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("is_home", sa.Boolean(), nullable=False),
        # Batting
        sa.Column("runs", sa.Integer(), nullable=True),
        sa.Column("hits", sa.Integer(), nullable=True),
        sa.Column("doubles", sa.Integer(), nullable=True),
        sa.Column("triples", sa.Integer(), nullable=True),
        sa.Column("home_runs", sa.Integer(), nullable=True),
        sa.Column("rbi", sa.Integer(), nullable=True),
        sa.Column("walks", sa.Integer(), nullable=True),
        sa.Column("strikeouts_batting", sa.Integer(), nullable=True),
        sa.Column("batting_avg", sa.Float(), nullable=True),
        sa.Column("obp", sa.Float(), nullable=True),       # on-base percentage
        sa.Column("slg", sa.Float(), nullable=True),       # slugging percentage
        sa.Column("ops", sa.Float(), nullable=True),       # OBP + SLG
        sa.Column("left_on_base", sa.Integer(), nullable=True),
        # Pitching
        sa.Column("era", sa.Float(), nullable=True),
        sa.Column("innings_pitched", sa.Float(), nullable=True),
        sa.Column("hits_allowed", sa.Integer(), nullable=True),
        sa.Column("earned_runs", sa.Integer(), nullable=True),
        sa.Column("walks_allowed", sa.Integer(), nullable=True),
        sa.Column("strikeouts_pitching", sa.Integer(), nullable=True),
        sa.Column("whip", sa.Float(), nullable=True),      # walks+hits per inning
        sa.Column("pitcher_id", sa.String(36), nullable=True),
        sa.Column("pitcher_name", sa.String(200), nullable=True),
        # Fielding
        sa.Column("errors", sa.Integer(), nullable=True),
        sa.Column("double_plays", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("match_id", "team_id", name="uq_baseball_team_match_stats"),
    )
    op.create_index("ix_baseball_tms_match", "baseball_team_match_stats", ["match_id"])
    op.create_index("ix_baseball_tms_team", "baseball_team_match_stats", ["team_id"])

    # ── event_context ──────────────────────────────────────────────────────
    op.create_table(
        "event_context",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), sa.ForeignKey("core_matches.id"), nullable=False, unique=True),
        sa.Column("venue_name", sa.String(200), nullable=True),
        sa.Column("venue_city", sa.String(100), nullable=True),
        sa.Column("venue_country", sa.String(100), nullable=True),
        sa.Column("attendance", sa.Integer(), nullable=True),
        sa.Column("neutral_site", sa.Boolean(), default=False),
        sa.Column("weather_desc", sa.String(200), nullable=True),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("wind_speed_kmh", sa.Float(), nullable=True),
        sa.Column("precipitation_mm", sa.Float(), nullable=True),
        sa.Column("notes", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_event_context_match", "event_context", ["match_id"])

    # ── rating_elo_basketball ──────────────────────────────────────────────
    op.create_table(
        "rating_elo_basketball",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("match_id", sa.String(36), nullable=False),
        sa.Column("context", sa.String(20), default="global"),
        sa.Column("rating_before", sa.Float(), nullable=False),
        sa.Column("rating_after", sa.Float(), nullable=False),
        sa.Column("expected_score", sa.Float(), nullable=False),
        sa.Column("actual_score", sa.Float(), nullable=False),
        sa.Column("k_factor", sa.Float(), nullable=False),
        sa.Column("mov_factor", sa.Float(), nullable=True),
        sa.Column("rest_factor", sa.Float(), nullable=True),
        sa.Column("rated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("team_id", "match_id", "context", name="uq_rating_elo_bball"),
    )
    op.create_index("ix_rating_elo_bball_team", "rating_elo_basketball", ["team_id"])
    op.create_index("ix_rating_elo_bball_rated_at", "rating_elo_basketball", ["rated_at"])

    # ── rating_elo_baseball ────────────────────────────────────────────────
    op.create_table(
        "rating_elo_baseball",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("match_id", sa.String(36), nullable=False),
        sa.Column("context", sa.String(20), default="global"),
        sa.Column("rating_before", sa.Float(), nullable=False),
        sa.Column("rating_after", sa.Float(), nullable=False),
        sa.Column("expected_score", sa.Float(), nullable=False),
        sa.Column("actual_score", sa.Float(), nullable=False),
        sa.Column("k_factor", sa.Float(), nullable=False),
        sa.Column("pitcher_adj", sa.Float(), nullable=True),
        sa.Column("park_factor", sa.Float(), nullable=True),
        sa.Column("rated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("team_id", "match_id", "context", name="uq_rating_elo_baseball"),
    )
    op.create_index("ix_rating_elo_baseball_team", "rating_elo_baseball", ["team_id"])
    op.create_index("ix_rating_elo_baseball_rated_at", "rating_elo_baseball", ["rated_at"])


def downgrade() -> None:
    op.drop_table("rating_elo_baseball")
    op.drop_table("rating_elo_basketball")
    op.drop_table("event_context")
    op.drop_table("baseball_team_match_stats")
    op.drop_table("basketball_team_match_stats")
