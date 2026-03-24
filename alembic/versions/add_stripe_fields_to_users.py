"""Add Stripe subscription fields to users table

Revision ID: a1b2c3d4e5f6
Revises: 0032
Create Date: 2026-03-24
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_users_stripe_customer_id", "users", ["stripe_customer_id"])
    op.add_column("users", sa.Column("subscription_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("subscription_status", sa.String(50), nullable=True))
    op.add_column(
        "users",
        sa.Column("subscription_current_period_end", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "subscription_current_period_end")
    op.drop_column("users", "subscription_status")
    op.drop_column("users", "subscription_id")
    op.drop_constraint("uq_users_stripe_customer_id", "users", type_="unique")
    op.drop_column("users", "stripe_customer_id")
