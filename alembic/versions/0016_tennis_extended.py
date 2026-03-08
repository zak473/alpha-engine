"""Extend TennisMatchStats with serve/groundstroke columns; add TennisPlayerProfile table.

Revision ID: 0016
Revises: 0015
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Extended TennisMatchStats columns ─────────────────────────────────────
    op.add_column("tennis_match_stats", sa.Column("first_serve_avg_mph", sa.Float(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("first_serve_max_mph", sa.Float(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("second_serve_avg_mph", sa.Float(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("winners", sa.Integer(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("unforced_errors", sa.Integer(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("forced_errors", sa.Integer(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("net_approaches", sa.Integer(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("net_points_won", sa.Integer(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("service_points_played", sa.Integer(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("service_points_won", sa.Integer(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("return_points_played", sa.Integer(), nullable=True))
    op.add_column("tennis_match_stats", sa.Column("return_points_won", sa.Integer(), nullable=True))

    # ── TennisPlayerProfile table ──────────────────────────────────────────────
    op.create_table(
        "tennis_player_profiles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("player_id", sa.String(), sa.ForeignKey("core_teams.id"), nullable=True),
        sa.Column("atp_id", sa.String(20), nullable=True),
        sa.Column("name_first", sa.String(100), nullable=True),
        sa.Column("name_last", sa.String(100), nullable=True),
        sa.Column("name_normalized", sa.String(200), nullable=True),
        sa.Column("nationality", sa.String(10), nullable=True),
        sa.Column("hand", sa.String(20), nullable=True),
        sa.Column("dob", sa.DateTime(), nullable=True),
        sa.Column("height_cm", sa.Integer(), nullable=True),
        sa.Column("turned_pro", sa.Integer(), nullable=True),
        sa.Column("career_titles", sa.Integer(), nullable=True),
        sa.Column("career_grand_slams", sa.Integer(), nullable=True),
        sa.Column("career_wins", sa.Integer(), nullable=True),
        sa.Column("career_losses", sa.Integer(), nullable=True),
        sa.Column("career_win_pct", sa.Float(), nullable=True),
        sa.Column("season_wins", sa.Integer(), nullable=True),
        sa.Column("season_losses", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("player_id", name="uq_tennis_player_profile_player_id"),
        sa.UniqueConstraint("name_normalized", name="uq_tennis_player_profile_name"),
    )
    op.create_index("ix_tennis_player_profiles_name_normalized", "tennis_player_profiles", ["name_normalized"])


def downgrade() -> None:
    op.drop_table("tennis_player_profiles")
    for col in [
        "first_serve_avg_mph", "first_serve_max_mph", "second_serve_avg_mph",
        "winners", "unforced_errors", "forced_errors",
        "net_approaches", "net_points_won",
        "service_points_played", "service_points_won",
        "return_points_played", "return_points_won",
    ]:
        op.drop_column("tennis_match_stats", col)
