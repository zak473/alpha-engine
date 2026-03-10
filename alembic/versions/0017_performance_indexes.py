"""Add performance indexes on hot query paths.

Revision ID: 0017
Revises: 0016
Create Date: 2026-03-09
"""
from alembic import op
from sqlalchemy import text

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def _create_if_not_exists(index_name: str, table: str, columns: list[str]) -> None:
    cols = ", ".join(columns)
    op.execute(text(
        f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({cols})"
    ))


def upgrade() -> None:
    # core_matches — most common filters
    _create_if_not_exists("ix_core_matches_status",       "core_matches", ["status"])
    _create_if_not_exists("ix_core_matches_sport",        "core_matches", ["sport"])
    _create_if_not_exists("ix_core_matches_kickoff_utc",  "core_matches", ["kickoff_utc"])
    _create_if_not_exists("ix_core_matches_sport_status", "core_matches", ["sport", "status"])

    # pred_match — joins and lookups
    _create_if_not_exists("ix_pred_match_match_id",       "pred_match", ["match_id"])
    _create_if_not_exists("ix_pred_match_model_version",  "pred_match", ["model_version"])

    # rating_elo_team — ELO history queries
    _create_if_not_exists("ix_elo_team_team_id",          "rating_elo_team", ["team_id"])
    _create_if_not_exists("ix_elo_team_team_rated_at",    "rating_elo_team", ["team_id", "rated_at"])
    _create_if_not_exists("ix_elo_team_context_rated_at", "rating_elo_team", ["context", "rated_at"])

    # tracked_picks — per-user queries
    _create_if_not_exists("ix_tracked_picks_user_id",          "tracked_picks", ["user_id"])
    _create_if_not_exists("ix_tracked_picks_user_outcome",     "tracked_picks", ["user_id", "outcome"])
    _create_if_not_exists("ix_tracked_picks_user_settled_at",  "tracked_picks", ["user_id", "settled_at"])

    # bankroll_snapshots — per-user balance history
    _create_if_not_exists("ix_bankroll_user_created_at", "bankroll_snapshots", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_bankroll_user_created_at",         table_name="bankroll_snapshots")
    op.drop_index("ix_tracked_picks_user_settled_at",    table_name="tracked_picks")
    op.drop_index("ix_tracked_picks_user_outcome",       table_name="tracked_picks")
    op.drop_index("ix_tracked_picks_user_id",            table_name="tracked_picks")
    op.drop_index("ix_elo_team_context_rated_at",        table_name="rating_elo_team")
    op.drop_index("ix_elo_team_team_rated_at",           table_name="rating_elo_team")
    op.drop_index("ix_elo_team_team_id",                 table_name="rating_elo_team")
    op.drop_index("ix_pred_match_model_version",         table_name="pred_match")
    op.drop_index("ix_pred_match_match_id",              table_name="pred_match")
    op.drop_index("ix_core_matches_sport_status",        table_name="core_matches")
    op.drop_index("ix_core_matches_kickoff_utc",         table_name="core_matches")
    op.drop_index("ix_core_matches_sport",               table_name="core_matches")
    op.drop_index("ix_core_matches_status",              table_name="core_matches")
