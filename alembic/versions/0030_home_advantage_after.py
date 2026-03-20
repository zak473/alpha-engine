"""Add home_advantage_after to rating_elo_team

Revision ID: 0030
Revises: 0029
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rating_elo_team",
        sa.Column("home_advantage_after", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("rating_elo_team", "home_advantage_after")
