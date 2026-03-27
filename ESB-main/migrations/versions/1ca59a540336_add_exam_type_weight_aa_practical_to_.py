"""add_exam_type_weight_aa_practical_to_course_exam

Revision ID: 1ca59a540336
Revises: 4ca81ccc18ed
Create Date: 2026-03-27 11:24:55.179627

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1ca59a540336'
down_revision = '4ca81ccc18ed'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('course_exam', schema=None) as batch_op:
        batch_op.add_column(sa.Column('exam_type', sa.String(length=20), nullable=True, server_default='examen'))
        batch_op.add_column(sa.Column('weight', sa.Float(), nullable=True, server_default='30.0'))
        batch_op.add_column(sa.Column('target_aa_ids', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('has_practical_target', sa.Boolean(), nullable=True, server_default='0'))


def downgrade():
    with op.batch_alter_table('course_exam', schema=None) as batch_op:
        batch_op.drop_column('has_practical_target')
        batch_op.drop_column('target_aa_ids')
        batch_op.drop_column('weight')
        batch_op.drop_column('exam_type')
