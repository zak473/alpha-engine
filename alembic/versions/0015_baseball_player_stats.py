"""Add baseball_player_match_stats table.

Revision ID: 0015
Revises: 0014
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "baseball_player_match_stats",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), sa.ForeignKey("core_matches.id"), nullable=False),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("is_home", sa.Boolean(), nullable=False),
        sa.Column("player_id", sa.String(50), nullable=True),
        sa.Column("player_name", sa.String(200), nullable=False),
        sa.Column("position", sa.String(10), nullable=True),
        sa.Column("batting_order", sa.Integer(), nullable=True),
        sa.Column("is_starter", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("hand", sa.String(5), nullable=True),
        sa.Column("at_bats", sa.Integer(), nullable=True),
        sa.Column("runs", sa.Integer(), nullable=True),
        sa.Column("hits", sa.Integer(), nullable=True),
        sa.Column("doubles", sa.Integer(), nullable=True),
        sa.Column("triples", sa.Integer(), nullable=True),
        sa.Column("home_runs", sa.Integer(), nullable=True),
        sa.Column("rbi", sa.Integer(), nullable=True),
        sa.Column("walks", sa.Integer(), nullable=True),
        sa.Column("strikeouts", sa.Integer(), nullable=True),
        sa.Column("stolen_bases", sa.Integer(), nullable=True),
        sa.Column("left_on_base", sa.Integer(), nullable=True),
        sa.Column("batting_avg", sa.Float(), nullable=True),
        sa.Column("obp", sa.Float(), nullable=True),
        sa.Column("slg", sa.Float(), nullable=True),
        sa.Column("ops", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_baseball_player_stats_match", "baseball_player_match_stats", ["match_id"])
    op.create_index("ix_baseball_player_stats_team", "baseball_player_match_stats", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_baseball_player_stats_team", "baseball_player_match_stats")
    op.drop_index("ix_baseball_player_stats_match", "baseball_player_match_stats")
    op.drop_table("baseball_player_match_stats")
