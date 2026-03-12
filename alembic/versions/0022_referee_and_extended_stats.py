"""Add referee fields to core_matches and extended stats to core_team_match_stats

Revision ID: 0022
Revises: 0021
Create Date: 2026-03-12
"""
from alembic import op
import sqlalchemy as sa

revision = '0022'
down_revision = '0021'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # core_matches: referee info
    op.add_column('core_matches', sa.Column('referee_name', sa.String(200), nullable=True))
    op.add_column('core_matches', sa.Column('referee_nationality', sa.String(100), nullable=True))

    # core_team_match_stats: extended stats
    op.add_column('core_team_match_stats', sa.Column('corners', sa.Integer(), nullable=True))
    op.add_column('core_team_match_stats', sa.Column('offsides', sa.Integer(), nullable=True))
    op.add_column('core_team_match_stats', sa.Column('deep_completions', sa.Integer(), nullable=True))
    op.add_column('core_team_match_stats', sa.Column('big_chances_created', sa.Integer(), nullable=True))
    op.add_column('core_team_match_stats', sa.Column('big_chances_missed', sa.Integer(), nullable=True))
    op.add_column('core_team_match_stats', sa.Column('aerial_duels_won', sa.Integer(), nullable=True))
    op.add_column('core_team_match_stats', sa.Column('aerial_duels_lost', sa.Integer(), nullable=True))
    op.add_column('core_team_match_stats', sa.Column('crosses', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('core_matches', 'referee_name')
    op.drop_column('core_matches', 'referee_nationality')
    op.drop_column('core_team_match_stats', 'corners')
    op.drop_column('core_team_match_stats', 'offsides')
    op.drop_column('core_team_match_stats', 'deep_completions')
    op.drop_column('core_team_match_stats', 'big_chances_created')
    op.drop_column('core_team_match_stats', 'big_chances_missed')
    op.drop_column('core_team_match_stats', 'aerial_duels_won')
    op.drop_column('core_team_match_stats', 'aerial_duels_lost')
    op.drop_column('core_team_match_stats', 'crosses')
