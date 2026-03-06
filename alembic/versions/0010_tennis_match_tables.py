"""Tennis match detail tables: tennis_matches, tennis_match_stats, tennis_player_form

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-06
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tennis_matches",
        sa.Column("match_id", sa.String(36), sa.ForeignKey("core_matches.id"), primary_key=True),
        sa.Column("surface", sa.String(50), nullable=False, server_default="hard"),
        sa.Column("is_indoor", sa.Boolean, default=False, nullable=False, server_default="false"),
        sa.Column("tournament_level", sa.String(50), nullable=True),
        sa.Column("tournament_importance", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("round_name", sa.String(50), nullable=True),
        sa.Column("best_of", sa.Integer, nullable=False, server_default="3"),
        sa.Column("player_a_days_rest", sa.Integer, nullable=True),
        sa.Column("player_b_days_rest", sa.Integer, nullable=True),
        sa.Column("player_a_matches_last_14d", sa.Integer, nullable=True),
        sa.Column("player_b_matches_last_14d", sa.Integer, nullable=True),
        sa.Column("player_a_sets", sa.Integer, nullable=True),
        sa.Column("player_b_sets", sa.Integer, nullable=True),
        sa.Column("sets_json", sa.String(500), nullable=True),
        sa.Column("match_duration_min", sa.Integer, nullable=True),
        sa.Column("retired", sa.Boolean, nullable=False, server_default="false"),
    )

    op.create_table(
        "tennis_match_stats",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), sa.ForeignKey("tennis_matches.match_id"), nullable=False),
        sa.Column("player_id", sa.String(36), sa.ForeignKey("core_teams.id"), nullable=True),
        sa.Column("aces", sa.Integer, nullable=True),
        sa.Column("double_faults", sa.Integer, nullable=True),
        sa.Column("first_serve_in_pct", sa.Float, nullable=True),
        sa.Column("first_serve_won_pct", sa.Float, nullable=True),
        sa.Column("second_serve_won_pct", sa.Float, nullable=True),
        sa.Column("service_games_played", sa.Integer, nullable=True),
        sa.Column("service_games_held", sa.Integer, nullable=True),
        sa.Column("service_hold_pct", sa.Float, nullable=True),
        sa.Column("return_games_played", sa.Integer, nullable=True),
        sa.Column("return_games_won", sa.Integer, nullable=True),
        sa.Column("break_points_faced", sa.Integer, nullable=True),
        sa.Column("break_points_saved", sa.Integer, nullable=True),
        sa.Column("break_points_created", sa.Integer, nullable=True),
        sa.Column("break_points_converted", sa.Integer, nullable=True),
        sa.Column("bp_conversion_pct", sa.Float, nullable=True),
        sa.Column("total_points_won", sa.Integer, nullable=True),
        sa.Column("first_serve_return_won_pct", sa.Float, nullable=True),
        sa.Column("second_serve_return_won_pct", sa.Float, nullable=True),
        sa.UniqueConstraint("match_id", "player_id", name="uq_tennis_match_stats"),
    )

    op.create_table(
        "tennis_player_form",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("player_id", sa.String(36), sa.ForeignKey("core_teams.id"), nullable=True),
        sa.Column("as_of_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("surface", sa.String(50), nullable=False, server_default="all"),
        sa.Column("window_days", sa.Integer, nullable=False, server_default="365"),
        sa.Column("matches_played", sa.Integer, nullable=False, server_default="0"),
        sa.Column("wins", sa.Integer, nullable=False, server_default="0"),
        sa.Column("losses", sa.Integer, nullable=False, server_default="0"),
        sa.Column("win_pct", sa.Float, nullable=True),
        sa.Column("avg_first_serve_in_pct", sa.Float, nullable=True),
        sa.Column("avg_first_serve_won_pct", sa.Float, nullable=True),
        sa.Column("avg_bp_conversion_pct", sa.Float, nullable=True),
        sa.Column("avg_service_hold_pct", sa.Float, nullable=True),
        sa.Column("avg_return_won_pct", sa.Float, nullable=True),
        sa.Column("avg_aces_per_match", sa.Float, nullable=True),
        sa.Column("avg_df_per_match", sa.Float, nullable=True),
        sa.Column("matches_since_last_title", sa.Integer, nullable=True),
        sa.UniqueConstraint("player_id", "as_of_date", "surface", "window_days", name="uq_tennis_form"),
    )


def downgrade() -> None:
    op.drop_table("tennis_player_form")
    op.drop_table("tennis_match_stats")
    op.drop_table("tennis_matches")
