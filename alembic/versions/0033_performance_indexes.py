"""Add performance indexes

Revision ID: 0033
Revises: a247bd4eda85
Create Date: 2026-03-29

Audit: both target indexes already exist in the model definitions and were
created by earlier migrations / create_all():
  - core_team_match_stats.team_id  → ix_core_tms_team  (defined in mvp.py __table_args__)
  - model_registry.is_live         → ix_model_registry_sport_live  (composite index on sport, is_live)

No new DDL is emitted; this migration documents the audit result.
"""
from alembic import op

revision = "0033"
down_revision = "a247bd4eda85"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Both indexes already exist — no DDL needed.
    pass


def downgrade() -> None:
    pass
