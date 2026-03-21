"""Add is_ai and bio columns to users for AI tipster accounts

Revision ID: 0032
Revises: 0031
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_ai", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("users", sa.Column("bio", sa.Text(), nullable=True))
    # Optional match_id on tipster_tips — used by AI tipsters for reliable settlement
    op.add_column("tipster_tips", sa.Column("match_id", sa.String(36), nullable=True))
    op.create_index("ix_tipster_tips_match_id", "tipster_tips", ["match_id"])


def downgrade() -> None:
    op.drop_index("ix_tipster_tips_match_id", table_name="tipster_tips")
    op.drop_column("tipster_tips", "match_id")
    op.drop_column("users", "bio")
    op.drop_column("users", "is_ai")
