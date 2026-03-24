"""add_ai_tokens_to_users

Revision ID: a247bd4eda85
Revises: a1b2c3d4e5f6
Create Date: 2026-03-24 13:40:57.903921

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a247bd4eda85'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Column may already exist if create_all() was called before this migration ran
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_tokens INTEGER NOT NULL DEFAULT 10"
    )


def downgrade() -> None:
    op.drop_column('users', 'ai_tokens')
