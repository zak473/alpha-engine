"""Add live_clock, current_period, current_state_json to core_matches

Revision ID: 0014
Revises: 0013
Create Date: 2026-03-06
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("core_matches", sa.Column("live_clock", sa.String(20), nullable=True))
    op.add_column("core_matches", sa.Column("current_period", sa.Integer(), nullable=True))
    op.add_column("core_matches", sa.Column("current_state_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("core_matches", "current_state_json")
    op.drop_column("core_matches", "current_period")
    op.drop_column("core_matches", "live_clock")
