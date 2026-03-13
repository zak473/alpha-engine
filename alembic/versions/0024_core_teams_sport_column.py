"""Add sport column to core_teams

Revision ID: 0024
Revises: 0023
Create Date: 2026-03-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("core_teams", sa.Column("sport", sa.String(20), nullable=True, server_default="soccer"))

def downgrade() -> None:
    op.drop_column("core_teams", "sport")
