"""Add hockey_team_match_stats table

Revision ID: 0025
Revises: 0024
Create Date: 2026-03-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hockey_team_match_stats",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), sa.ForeignKey("core_matches.id"), nullable=False),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("is_home", sa.Boolean(), nullable=False),
        sa.Column("goals", sa.Integer(), nullable=True),
        sa.Column("goals_p1", sa.Integer(), nullable=True),
        sa.Column("goals_p2", sa.Integer(), nullable=True),
        sa.Column("goals_p3", sa.Integer(), nullable=True),
        sa.Column("goals_ot", sa.Integer(), nullable=True),
        sa.Column("shots", sa.Integer(), nullable=True),
        sa.Column("shots_on_goal", sa.Integer(), nullable=True),
        sa.Column("save_pct", sa.Float(), nullable=True),
        sa.Column("power_play_goals", sa.Integer(), nullable=True),
        sa.Column("power_play_opportunities", sa.Integer(), nullable=True),
        sa.Column("power_play_pct", sa.Float(), nullable=True),
        sa.Column("penalty_kill_pct", sa.Float(), nullable=True),
        sa.Column("penalty_minutes", sa.Integer(), nullable=True),
        sa.Column("faceoff_wins", sa.Integer(), nullable=True),
        sa.Column("faceoff_total", sa.Integer(), nullable=True),
        sa.Column("faceoff_pct", sa.Float(), nullable=True),
        sa.Column("hits", sa.Integer(), nullable=True),
        sa.Column("blocked_shots", sa.Integer(), nullable=True),
        sa.Column("giveaways", sa.Integer(), nullable=True),
        sa.Column("takeaways", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_hockey_stats_match_team", "hockey_team_match_stats", ["match_id", "team_id"])


def downgrade() -> None:
    op.drop_index("ix_hockey_stats_match_team", "hockey_team_match_stats")
    op.drop_table("hockey_team_match_stats")
