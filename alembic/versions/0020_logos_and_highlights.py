"""Add logo_url to core_teams and core_leagues; add highlights_json to core_matches.

Revision ID: 0020
Revises: 0019
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("core_teams",   sa.Column("logo_url", sa.String(500), nullable=True))
    op.add_column("core_leagues", sa.Column("logo_url", sa.String(500), nullable=True))
    op.add_column("core_matches", sa.Column("highlights_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("core_matches", "highlights_json")
    op.drop_column("core_leagues", "logo_url")
    op.drop_column("core_teams",   "logo_url")
