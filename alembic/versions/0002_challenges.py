"""Challenges module — challenges, members, entries, results tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-04 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # challenges
    op.create_table(
        "challenges",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("visibility", sa.String(20), server_default="public", nullable=False),
        sa.Column("sport_scope", sa.JSON, server_default="[]", nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_members", sa.Integer, nullable=True),
        sa.Column("entry_limit_per_day", sa.Integer, nullable=True),
        sa.Column("scoring_type", sa.String(20), server_default="points", nullable=False),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_challenges_visibility", "challenges", ["visibility"])
    op.create_index("ix_challenges_created_by", "challenges", ["created_by"])
    op.create_index("ix_challenges_start_at", "challenges", ["start_at"])

    # challenge_members
    op.create_table(
        "challenge_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("challenge_id", sa.String(36), sa.ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("role", sa.String(20), server_default="member", nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.UniqueConstraint("challenge_id", "user_id", name="uq_challenge_members"),
    )
    op.create_index("ix_challenge_members_challenge", "challenge_members", ["challenge_id"])
    op.create_index("ix_challenge_members_user", "challenge_members", ["user_id"])

    # challenge_entries
    op.create_table(
        "challenge_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("challenge_id", sa.String(36), sa.ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("event_id", sa.String(36), nullable=False),
        sa.Column("sport", sa.String(50), nullable=False),
        sa.Column("event_start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("pick_type", sa.String(50), nullable=False),
        sa.Column("pick_payload", sa.JSON, server_default="{}", nullable=False),
        sa.Column("prediction_payload", sa.JSON, server_default="{}", nullable=False),
        sa.Column("model_version", sa.String(100), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
    )
    op.create_index("ix_challenge_entries_challenge", "challenge_entries", ["challenge_id"])
    op.create_index("ix_challenge_entries_user", "challenge_entries", ["user_id"])
    op.create_index("ix_challenge_entries_event", "challenge_entries", ["event_id"])
    op.create_index("ix_challenge_entries_status", "challenge_entries", ["status"])
    op.create_index("ix_challenge_entries_submitted", "challenge_entries", ["submitted_at"])

    # challenge_entry_results
    op.create_table(
        "challenge_entry_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entry_id", sa.String(36), sa.ForeignKey("challenge_entries.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("outcome_payload", sa.JSON, server_default="{}", nullable=False),
        sa.Column("settled_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("score_value", sa.Float, nullable=False),
    )
    op.create_index("ix_challenge_entry_results_entry", "challenge_entry_results", ["entry_id"])


def downgrade() -> None:
    op.drop_table("challenge_entry_results")
    op.drop_table("challenge_entries")
    op.drop_table("challenge_members")
    op.drop_table("challenges")
