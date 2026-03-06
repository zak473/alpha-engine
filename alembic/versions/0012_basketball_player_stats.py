"""Add basketball_player_match_stats table

Revision ID: 0012
Revises: 0011
Create Date: 2026-03-06
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "basketball_player_match_stats",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), sa.ForeignKey("core_matches.id"), nullable=False),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("is_home", sa.Boolean, nullable=False),
        sa.Column("player_id", sa.String(50), nullable=True),
        sa.Column("player_name", sa.String(200), nullable=False),
        sa.Column("position", sa.String(10), nullable=True),
        sa.Column("jersey", sa.String(5), nullable=True),
        sa.Column("is_starter", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("minutes", sa.Float, nullable=True),
        sa.Column("points", sa.Integer, nullable=True),
        sa.Column("rebounds_total", sa.Integer, nullable=True),
        sa.Column("rebounds_offensive", sa.Integer, nullable=True),
        sa.Column("rebounds_defensive", sa.Integer, nullable=True),
        sa.Column("assists", sa.Integer, nullable=True),
        sa.Column("steals", sa.Integer, nullable=True),
        sa.Column("blocks", sa.Integer, nullable=True),
        sa.Column("turnovers", sa.Integer, nullable=True),
        sa.Column("fouls", sa.Integer, nullable=True),
        sa.Column("plus_minus", sa.Integer, nullable=True),
        sa.Column("fg_made", sa.Integer, nullable=True),
        sa.Column("fg_attempted", sa.Integer, nullable=True),
        sa.Column("fg_pct", sa.Float, nullable=True),
        sa.Column("fg3_made", sa.Integer, nullable=True),
        sa.Column("fg3_attempted", sa.Integer, nullable=True),
        sa.Column("fg3_pct", sa.Float, nullable=True),
        sa.Column("ft_made", sa.Integer, nullable=True),
        sa.Column("ft_attempted", sa.Integer, nullable=True),
        sa.Column("ft_pct", sa.Float, nullable=True),
    )
    op.create_index("ix_bball_player_match", "basketball_player_match_stats", ["match_id", "team_id"])


def downgrade() -> None:
    op.drop_index("ix_bball_player_match", "basketball_player_match_stats")
    op.drop_table("basketball_player_match_stats")
