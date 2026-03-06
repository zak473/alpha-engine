"""Add tracked_picks table.

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tracked_picks",
        sa.Column("id",              sa.String(36),  primary_key=True),
        sa.Column("user_id",         sa.String(100), nullable=False),
        sa.Column("match_id",        sa.String(36),  nullable=False),
        sa.Column("match_label",     sa.String(300), nullable=False),
        sa.Column("sport",           sa.String(20),  nullable=False),
        sa.Column("league",          sa.String(200), nullable=True),
        sa.Column("start_time",      sa.DateTime(timezone=True), nullable=False),
        sa.Column("market_name",     sa.String(100), nullable=False),
        sa.Column("selection_label", sa.String(200), nullable=False),
        sa.Column("odds",            sa.Float(),     nullable=False),
        sa.Column("edge",            sa.Float(),     nullable=True),
        sa.Column("outcome",         sa.String(20),  nullable=True),
        sa.Column("settled_at",      sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes",           sa.Text(),      nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_tracked_picks_user",    "tracked_picks", ["user_id"])
    op.create_index("ix_tracked_picks_match",   "tracked_picks", ["match_id"])
    op.create_index("ix_tracked_picks_created", "tracked_picks", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_tracked_picks_created", table_name="tracked_picks")
    op.drop_index("ix_tracked_picks_match",   table_name="tracked_picks")
    op.drop_index("ix_tracked_picks_user",    table_name="tracked_picks")
    op.drop_table("tracked_picks")
