"""Add bankroll_snapshots table.

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bankroll_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(100), nullable=False),
        sa.Column("balance", sa.Float, nullable=False),
        sa.Column("event_type", sa.String(30), nullable=False, server_default="daily"),
        sa.Column("pick_id", sa.String(36), nullable=True),
        sa.Column("pnl", sa.Float, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_bankroll_user", "bankroll_snapshots", ["user_id"])
    op.create_index("ix_bankroll_created", "bankroll_snapshots", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_bankroll_created", "bankroll_snapshots")
    op.drop_index("ix_bankroll_user", "bankroll_snapshots")
    op.drop_table("bankroll_snapshots")
