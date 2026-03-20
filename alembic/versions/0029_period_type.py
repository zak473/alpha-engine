"""Add period_type column to core_matches for OT/SO tracking

Revision ID: 0029
Revises: 0028
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # "regulation" | "overtime" | "shootout" | NULL (unknown/not applicable)
    op.add_column(
        "core_matches",
        sa.Column("period_type", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("core_matches", "period_type")
