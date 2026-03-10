"""Add tipster_tips and tipster_follows tables.

Revision ID: 0018
Revises: 0017
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tipster_tips",
        sa.Column("id",               sa.String(36),  primary_key=True),
        sa.Column("user_id",          sa.String(36),  nullable=False),
        sa.Column("sport",            sa.String(20),  nullable=False),
        sa.Column("match_label",      sa.String(200), nullable=False),
        sa.Column("market_name",      sa.String(100), nullable=False),
        sa.Column("selection_label",  sa.String(200), nullable=False),
        sa.Column("odds",             sa.Float(),     nullable=False),
        sa.Column("outcome",          sa.String(20),  nullable=True),
        sa.Column("start_time",       sa.DateTime(timezone=True), nullable=False),
        sa.Column("note",             sa.Text(),      nullable=True),
        sa.Column("created_at",       sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("settled_at",       sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_tipster_tips_user_id",      "tipster_tips", ["user_id"])
    op.create_index("ix_tipster_tips_outcome",      "tipster_tips", ["outcome"])
    op.create_index("ix_tipster_tips_user_outcome", "tipster_tips", ["user_id", "outcome"])

    op.create_table(
        "tipster_follows",
        sa.Column("id",           sa.Integer(),   primary_key=True, autoincrement=True),
        sa.Column("follower_id",  sa.String(36),  nullable=False),
        sa.Column("tipster_id",   sa.String(36),  nullable=False),
        sa.Column("created_at",   sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("follower_id", "tipster_id", name="uq_tipster_follow"),
    )
    op.create_index("ix_tipster_follows_tipster_id",  "tipster_follows", ["tipster_id"])
    op.create_index("ix_tipster_follows_follower_id", "tipster_follows", ["follower_id"])


def downgrade() -> None:
    op.drop_index("ix_tipster_follows_follower_id", table_name="tipster_follows")
    op.drop_index("ix_tipster_follows_tipster_id",  table_name="tipster_follows")
    op.drop_table("tipster_follows")
    op.drop_index("ix_tipster_tips_user_outcome", table_name="tipster_tips")
    op.drop_index("ix_tipster_tips_outcome",      table_name="tipster_tips")
    op.drop_index("ix_tipster_tips_user_id",      table_name="tipster_tips")
    op.drop_table("tipster_tips")
