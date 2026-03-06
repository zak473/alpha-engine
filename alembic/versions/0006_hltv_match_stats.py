"""Add hltv_match_stats table for scraped CS2 data.

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hltv_match_stats",
        sa.Column("core_match_id", sa.String(36),
                  sa.ForeignKey("core_matches.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("hltv_match_id", sa.Integer(), nullable=False),
        sa.Column("maps",         sa.JSON(), nullable=True),
        sa.Column("players_home", sa.JSON(), nullable=True),
        sa.Column("players_away", sa.JSON(), nullable=True),
        sa.Column("veto_text",    sa.Text(), nullable=True),
        sa.Column("format",       sa.String(10), nullable=True),
        sa.Column("is_lan",       sa.Boolean(), default=False),
        sa.Column("scraped_at",   sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_hltv_match_stats_hltv_id", "hltv_match_stats", ["hltv_match_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_hltv_match_stats_hltv_id", table_name="hltv_match_stats")
    op.drop_table("hltv_match_stats")
