"""add odds columns to core_matches

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("core_matches", sa.Column("odds_home", sa.Float(), nullable=True))
    op.add_column("core_matches", sa.Column("odds_away", sa.Float(), nullable=True))
    op.add_column("core_matches", sa.Column("odds_draw", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("core_matches", "odds_draw")
    op.drop_column("core_matches", "odds_away")
    op.drop_column("core_matches", "odds_home")
