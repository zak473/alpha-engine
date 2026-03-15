"""Add ranking, ranking_points, logo_url to tennis_player_profiles

Revision ID: 0026
Revises: 0025
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tennis_player_profiles", sa.Column("ranking", sa.Integer(), nullable=True))
    op.add_column("tennis_player_profiles", sa.Column("ranking_points", sa.Integer(), nullable=True))
    op.add_column("tennis_player_profiles", sa.Column("logo_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("tennis_player_profiles", "logo_url")
    op.drop_column("tennis_player_profiles", "ranking_points")
    op.drop_column("tennis_player_profiles", "ranking")
