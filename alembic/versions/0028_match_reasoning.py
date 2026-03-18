"""Add match_reasoning table for AI-generated analysis cache

Revision ID: 0028
Revises: 0027
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "match_reasoning",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("match_id", sa.String(36), nullable=False, unique=True),
        sa.Column("reasoning", sa.Text(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_match_reasoning_match_id", "match_reasoning", ["match_id"])


def downgrade() -> None:
    op.drop_index("ix_match_reasoning_match_id", table_name="match_reasoning")
    op.drop_table("match_reasoning")
