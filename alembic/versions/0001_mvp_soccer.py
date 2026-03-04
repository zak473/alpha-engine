"""MVP soccer schema — core, rating, feat, pred, model_registry tables

Revision ID: 0001
Revises:
Create Date: 2024-11-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # core_leagues
    op.create_table(
        "core_leagues",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("tier", sa.Integer, server_default="1"),
        sa.Column("provider_id", sa.String(200), nullable=True, unique=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_core_leagues_name", "core_leagues", ["name"])

    # core_teams
    op.create_table(
        "core_teams",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("league_id", sa.String(36), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("short_name", sa.String(50), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("provider_id", sa.String(200), nullable=True, unique=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_core_teams_name", "core_teams", ["name"])

    # core_matches
    op.create_table(
        "core_matches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("league_id", sa.String(36), nullable=False),
        sa.Column("season", sa.String(20), nullable=True),
        sa.Column("home_team_id", sa.String(36), nullable=False),
        sa.Column("away_team_id", sa.String(36), nullable=False),
        sa.Column("kickoff_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), server_default="scheduled"),
        sa.Column("home_score", sa.Integer, nullable=True),
        sa.Column("away_score", sa.Integer, nullable=True),
        sa.Column("outcome", sa.String(20), nullable=True),
        sa.Column("venue", sa.String(200), nullable=True),
        sa.Column("is_neutral", sa.Boolean, server_default="false"),
        sa.Column("provider_id", sa.String(200), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_core_matches_kickoff", "core_matches", ["kickoff_utc"])
    op.create_index("ix_core_matches_status", "core_matches", ["status"])
    op.create_index("ix_core_matches_league_season", "core_matches", ["league_id", "season"])

    # core_team_match_stats
    op.create_table(
        "core_team_match_stats",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), nullable=False),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("is_home", sa.Boolean, nullable=False),
        sa.Column("goals", sa.Integer, nullable=True),
        sa.Column("goals_conceded", sa.Integer, nullable=True),
        sa.Column("shots", sa.Integer, nullable=True),
        sa.Column("shots_on_target", sa.Integer, nullable=True),
        sa.Column("xg", sa.Float, nullable=True),
        sa.Column("xga", sa.Float, nullable=True),
        sa.Column("np_xg", sa.Float, nullable=True),
        sa.Column("possession_pct", sa.Float, nullable=True),
        sa.Column("passes_completed", sa.Integer, nullable=True),
        sa.Column("pass_accuracy_pct", sa.Float, nullable=True),
        sa.Column("ppda", sa.Float, nullable=True),
        sa.Column("fouls", sa.Integer, nullable=True),
        sa.Column("yellow_cards", sa.Integer, nullable=True),
        sa.Column("red_cards", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("match_id", "team_id", name="uq_core_team_match_stats"),
    )
    op.create_index("ix_core_tms_match", "core_team_match_stats", ["match_id"])
    op.create_index("ix_core_tms_team", "core_team_match_stats", ["team_id"])

    # rating_elo_team
    op.create_table(
        "rating_elo_team",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("match_id", sa.String(36), nullable=False),
        sa.Column("context", sa.String(20), server_default="global"),
        sa.Column("rating_before", sa.Float, nullable=False),
        sa.Column("rating_after", sa.Float, nullable=False),
        sa.Column("expected_score", sa.Float, nullable=False),
        sa.Column("actual_score", sa.Float, nullable=False),
        sa.Column("k_factor", sa.Float, nullable=False),
        sa.Column("rated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("team_id", "match_id", "context", name="uq_rating_elo_team"),
    )
    op.create_index("ix_rating_elo_team_id", "rating_elo_team", ["team_id"])
    op.create_index("ix_rating_elo_rated_at", "rating_elo_team", ["rated_at"])

    # feat_soccer_match
    op.create_table(
        "feat_soccer_match",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), nullable=False, unique=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("elo_home", sa.Float, nullable=True),
        sa.Column("elo_away", sa.Float, nullable=True),
        sa.Column("elo_diff", sa.Float, nullable=True),
        sa.Column("home_form_pts", sa.Float, nullable=True),
        sa.Column("away_form_pts", sa.Float, nullable=True),
        sa.Column("home_form_w", sa.Integer, nullable=True),
        sa.Column("home_form_d", sa.Integer, nullable=True),
        sa.Column("home_form_l", sa.Integer, nullable=True),
        sa.Column("away_form_w", sa.Integer, nullable=True),
        sa.Column("away_form_d", sa.Integer, nullable=True),
        sa.Column("away_form_l", sa.Integer, nullable=True),
        sa.Column("home_gf_avg", sa.Float, nullable=True),
        sa.Column("home_ga_avg", sa.Float, nullable=True),
        sa.Column("away_gf_avg", sa.Float, nullable=True),
        sa.Column("away_ga_avg", sa.Float, nullable=True),
        sa.Column("home_xg_avg", sa.Float, nullable=True),
        sa.Column("home_xga_avg", sa.Float, nullable=True),
        sa.Column("away_xg_avg", sa.Float, nullable=True),
        sa.Column("away_xga_avg", sa.Float, nullable=True),
        sa.Column("home_days_rest", sa.Float, nullable=True),
        sa.Column("away_days_rest", sa.Float, nullable=True),
        sa.Column("rest_diff", sa.Float, nullable=True),
        sa.Column("h2h_home_win_pct", sa.Float, nullable=True),
        sa.Column("h2h_matches_played", sa.Integer, server_default="0"),
        sa.Column("is_home_advantage", sa.Integer, server_default="1"),
        sa.Column("outcome", sa.String(20), nullable=True),
        sa.Column("target", sa.Float, nullable=True),
    )
    op.create_index("ix_feat_soccer_match_id", "feat_soccer_match", ["match_id"])

    # pred_match
    op.create_table(
        "pred_match",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("match_id", sa.String(36), nullable=False),
        sa.Column("model_version", sa.String(100), nullable=False),
        sa.Column("p_home", sa.Float, nullable=False),
        sa.Column("p_draw", sa.Float, nullable=False),
        sa.Column("p_away", sa.Float, nullable=False),
        sa.Column("fair_odds_home", sa.Float, nullable=False),
        sa.Column("fair_odds_draw", sa.Float, nullable=False),
        sa.Column("fair_odds_away", sa.Float, nullable=False),
        sa.Column("confidence", sa.Integer, nullable=False),
        sa.Column("key_drivers", sa.JSON, server_default="[]"),
        sa.Column("simulation", sa.JSON, server_default="{}"),
        sa.Column("features_snapshot", sa.JSON, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("match_id", "model_version", name="uq_pred_match"),
    )
    op.create_index("ix_pred_match_match_id", "pred_match", ["match_id"])
    op.create_index("ix_pred_match_created", "pred_match", ["created_at"])

    # model_registry
    op.create_table(
        "model_registry",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sport", sa.String(20), nullable=False),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("algorithm", sa.String(50), nullable=False),
        sa.Column("artifact_path", sa.String(500), nullable=False),
        sa.Column("feature_names", sa.JSON, server_default="[]"),
        sa.Column("hyperparams", sa.JSON, server_default="{}"),
        sa.Column("train_data_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("train_data_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("n_train_samples", sa.Integer, nullable=True),
        sa.Column("metrics", sa.JSON, server_default="{}"),
        sa.Column("is_live", sa.Boolean, server_default="false"),
        sa.Column("trained_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("ix_model_registry_sport_live", "model_registry", ["sport", "is_live"])


def downgrade() -> None:
    for tbl in [
        "model_registry", "pred_match", "feat_soccer_match",
        "rating_elo_team", "core_team_match_stats",
        "core_matches", "core_teams", "core_leagues",
    ]:
        op.drop_table(tbl)
