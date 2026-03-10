"""Add extras_json to core_matches for Highlightly enrichment data (lineups, stats, events).

Revision ID: 0019
Revises: 0018
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "core_matches",
        sa.Column("extras_json", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("core_matches", "extras_json")
