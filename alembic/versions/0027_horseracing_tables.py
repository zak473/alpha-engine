"""Add horse_races and horse_runners tables

Revision ID: 0027
Revises: 0026
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "horse_races",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("course", sa.String(200), nullable=False),
        sa.Column("region", sa.String(10), nullable=True),
        sa.Column("race_name", sa.String(500), nullable=False),
        sa.Column("race_class", sa.String(100), nullable=True),
        sa.Column("race_type", sa.String(50), nullable=True),
        sa.Column("distance_f", sa.Float(), nullable=True),
        sa.Column("going", sa.String(100), nullable=True),
        sa.Column("surface", sa.String(50), nullable=True),
        sa.Column("pattern", sa.String(100), nullable=True),
        sa.Column("age_band", sa.String(50), nullable=True),
        sa.Column("rating_band", sa.String(50), nullable=True),
        sa.Column("sex_restriction", sa.String(50), nullable=True),
        sa.Column("prize", sa.String(100), nullable=True),
        sa.Column("field_size", sa.Integer(), nullable=True),
        sa.Column("off_time", sa.String(10), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="scheduled"),
        sa.Column("season", sa.String(20), nullable=True),
        sa.Column("extras_json", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_horse_races_scheduled_at", "horse_races", ["scheduled_at"])
    op.create_index("ix_horse_races_status", "horse_races", ["status"])
    op.create_index("ix_horse_races_course", "horse_races", ["course"])

    op.create_table(
        "horse_runners",
        sa.Column("id", sa.String(200), primary_key=True),
        sa.Column("race_id", sa.String(100), sa.ForeignKey("horse_races.id", ondelete="CASCADE"), nullable=False),
        sa.Column("horse_name", sa.String(200), nullable=False),
        sa.Column("horse_id", sa.String(100), nullable=False),
        sa.Column("number", sa.Integer(), nullable=True),
        sa.Column("draw", sa.Integer(), nullable=True),
        sa.Column("jockey", sa.String(200), nullable=True),
        sa.Column("jockey_id", sa.String(100), nullable=True),
        sa.Column("trainer", sa.String(200), nullable=True),
        sa.Column("trainer_id", sa.String(100), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("sex", sa.String(20), nullable=True),
        sa.Column("colour", sa.String(20), nullable=True),
        sa.Column("sire", sa.String(200), nullable=True),
        sa.Column("dam", sa.String(200), nullable=True),
        sa.Column("region", sa.String(10), nullable=True),
        sa.Column("lbs", sa.Integer(), nullable=True),
        sa.Column("ofr", sa.String(20), nullable=True),
        sa.Column("form", sa.String(100), nullable=True),
        sa.Column("last_run", sa.String(50), nullable=True),
        sa.Column("headgear", sa.String(50), nullable=True),
        sa.Column("is_non_runner", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("position", sa.Integer(), nullable=True),
        sa.Column("sp", sa.Float(), nullable=True),
        sa.Column("beaten_lengths", sa.Float(), nullable=True),
        sa.Column("extras_json", JSONB(), nullable=True),
    )
    op.create_index("ix_horse_runners_race_id", "horse_runners", ["race_id"])
    op.create_index("ix_horse_runners_horse_id", "horse_runners", ["horse_id"])


def downgrade() -> None:
    op.drop_index("ix_horse_runners_horse_id", "horse_runners")
    op.drop_index("ix_horse_runners_race_id", "horse_runners")
    op.drop_table("horse_runners")
    op.drop_index("ix_horse_races_course", "horse_races")
    op.drop_index("ix_horse_races_status", "horse_races")
    op.drop_index("ix_horse_races_scheduled_at", "horse_races")
    op.drop_table("horse_races")
