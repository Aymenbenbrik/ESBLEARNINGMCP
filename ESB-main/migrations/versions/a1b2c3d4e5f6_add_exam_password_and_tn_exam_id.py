"""Add exam_password and tn_exam_id to validated_exam

Revision ID: a1b2c3d4e5f6
Revises: 1ca59a540336
Create Date: 2026-04-04

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '1ca59a540336'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('validated_exam',
        sa.Column('exam_password', sa.String(200), nullable=True))
    op.add_column('validated_exam',
        sa.Column('tn_exam_id', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('validated_exam', 'tn_exam_id')
    op.drop_column('validated_exam', 'exam_password')
