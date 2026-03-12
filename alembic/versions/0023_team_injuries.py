"""Add team_injuries table for API-Football injury data.

Revision ID: 0023
Revises: 0022
Create Date: 2026-03-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "team_injuries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("team_id", sa.String(100), nullable=False),
        sa.Column("team_name", sa.String(200), nullable=False),
        sa.Column("player_name", sa.String(200), nullable=False),
        sa.Column("position", sa.String(50), nullable=True),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("reason", sa.String(200), nullable=True),
        sa.Column("expected_return", sa.String(100), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            onupdate=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("team_id", "player_name", name="uq_team_injury_player"),
    )
    op.create_index("ix_team_injuries_team_id", "team_injuries", ["team_id"])
    op.create_index("ix_team_injuries_fetched_at", "team_injuries", ["fetched_at"])


def downgrade() -> None:
    op.drop_index("ix_team_injuries_fetched_at", table_name="team_injuries")
    op.drop_index("ix_team_injuries_team_id", table_name="team_injuries")
    op.drop_table("team_injuries")
