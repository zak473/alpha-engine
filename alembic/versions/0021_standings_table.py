"""Add core_standings table for league standings from Highlightly.

Revision ID: 0021
Revises: 0020
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "core_standings",
        sa.Column("id",            sa.Integer(),    primary_key=True, autoincrement=True),
        sa.Column("league_id",     sa.String(36),   nullable=False),
        sa.Column("season",        sa.String(20),   nullable=False),
        sa.Column("sport",         sa.String(20),   nullable=False),
        sa.Column("team_id",       sa.String(36),   nullable=True),
        sa.Column("team_name",     sa.String(200),  nullable=False),
        sa.Column("team_logo",     sa.String(500),  nullable=True),
        sa.Column("position",      sa.Integer(),    nullable=True),
        sa.Column("played",        sa.Integer(),    nullable=True),
        sa.Column("won",           sa.Integer(),    nullable=True),
        sa.Column("drawn",         sa.Integer(),    nullable=True),
        sa.Column("lost",          sa.Integer(),    nullable=True),
        sa.Column("goals_for",     sa.Integer(),    nullable=True),
        sa.Column("goals_against", sa.Integer(),    nullable=True),
        sa.Column("goal_diff",     sa.Integer(),    nullable=True),
        sa.Column("points",        sa.Integer(),    nullable=True),
        sa.Column("form",          sa.String(20),   nullable=True),   # "WWDLW"
        sa.Column("group_name",    sa.String(100),  nullable=True),   # for group stages
        sa.Column("updated_at",    sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("league_id", "season", "team_name", name="uq_standings_league_season_team"),
    )
    op.create_index("ix_standings_league_season", "core_standings", ["league_id", "season"])
    op.create_index("ix_standings_sport",         "core_standings", ["sport"])


def downgrade() -> None:
    op.drop_index("ix_standings_sport",         table_name="core_standings")
    op.drop_index("ix_standings_league_season", table_name="core_standings")
    op.drop_table("core_standings")
