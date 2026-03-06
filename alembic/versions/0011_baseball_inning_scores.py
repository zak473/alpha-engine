"""Add inning_scores_json to event_context for baseball linescore data

Revision ID: 0011
Revises: 0010
Create Date: 2026-03-06
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("event_context", sa.Column("inning_scores_json", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("event_context", "inning_scores_json")
