"""Add sport column to core_leagues and core_matches

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("core_leagues", sa.Column("sport", sa.String(20), nullable=True))
    op.add_column("core_matches", sa.Column("sport", sa.String(20), nullable=True))
    op.create_index("ix_core_matches_sport", "core_matches", ["sport"])
    # Backfill existing rows (all soccer from football-data.org)
    op.execute("UPDATE core_leagues SET sport = 'soccer' WHERE sport IS NULL")
    op.execute("UPDATE core_matches SET sport = 'soccer' WHERE sport IS NULL")


def downgrade() -> None:
    op.drop_index("ix_core_matches_sport", "core_matches")
    op.drop_column("core_matches", "sport")
    op.drop_column("core_leagues", "sport")
