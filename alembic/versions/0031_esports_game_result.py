"""Add esports_game_result table for per-map ELO

Revision ID: 0031
Revises: 0030
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "esports_game_result",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("match_id", sa.String(36), nullable=False),
        sa.Column("game_number", sa.Integer(), nullable=False),
        sa.Column("map_name", sa.String(100), nullable=True),
        sa.Column("home_team_id", sa.String(36), nullable=False),
        sa.Column("away_team_id", sa.String(36), nullable=False),
        sa.Column("winner_team_id", sa.String(36), nullable=True),
        sa.Column("provider_game_id", sa.String(100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("match_id", "game_number", name="uq_esports_game_result"),
        sa.UniqueConstraint("provider_game_id"),
    )
    op.create_index("ix_esports_game_match_id", "esports_game_result", ["match_id"])


def downgrade() -> None:
    op.drop_index("ix_esports_game_match_id", table_name="esports_game_result")
    op.drop_table("esports_game_result")
