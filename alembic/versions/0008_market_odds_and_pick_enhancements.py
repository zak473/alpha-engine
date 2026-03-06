"""Add market_odds table and enhance tracked_picks with Kelly/CLV fields.

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── market_odds ────────────────────────────────────────────────────────
    op.create_table(
        "market_odds",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("match_id", sa.String(36), nullable=False),
        sa.Column("sport", sa.String(20), nullable=False),
        sa.Column("bookmaker", sa.String(100), nullable=False),
        sa.Column("market", sa.String(50), nullable=False),
        sa.Column("home_odds", sa.Float, nullable=True),
        sa.Column("draw_odds", sa.Float, nullable=True),
        sa.Column("away_odds", sa.Float, nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_closing", sa.Boolean, nullable=False, server_default="false"),
    )
    op.create_index("ix_market_odds_match", "market_odds", ["match_id"])
    op.create_index("ix_market_odds_recorded", "market_odds", ["recorded_at"])
    op.create_index("ix_market_odds_closing", "market_odds", ["match_id", "is_closing"])

    # ── tracked_picks enhancements ─────────────────────────────────────────
    op.add_column("tracked_picks", sa.Column("kelly_fraction", sa.Float, nullable=True))
    op.add_column("tracked_picks", sa.Column("stake_fraction", sa.Float, nullable=True))
    op.add_column("tracked_picks", sa.Column("closing_odds", sa.Float, nullable=True))
    op.add_column("tracked_picks", sa.Column("clv", sa.Float, nullable=True))
    op.add_column("tracked_picks", sa.Column("auto_generated", sa.Boolean, nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("tracked_picks", "auto_generated")
    op.drop_column("tracked_picks", "clv")
    op.drop_column("tracked_picks", "closing_odds")
    op.drop_column("tracked_picks", "stake_fraction")
    op.drop_column("tracked_picks", "kelly_fraction")
    op.drop_index("ix_market_odds_closing", "market_odds")
    op.drop_index("ix_market_odds_recorded", "market_odds")
    op.drop_index("ix_market_odds_match", "market_odds")
    op.drop_table("market_odds")
