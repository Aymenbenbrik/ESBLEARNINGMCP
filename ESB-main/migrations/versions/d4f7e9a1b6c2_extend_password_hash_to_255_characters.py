"""Extend password_hash column to 255 characters

Revision ID: d4f7e9a1b6c2
Revises: c8d9e4a2f5b3
Create Date: 2026-02-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4f7e9a1b6c2'
down_revision = 'c8d9e4a2f5b3'
branch_labels = None
depends_on = None


def upgrade():
    # Extend password_hash column from 128 to 255 characters
    # This fixes truncation of PBKDF2-SHA256 hashes which are ~150+ characters
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column('password_hash',
                              existing_type=sa.String(length=128),
                              type_=sa.String(length=255),
                              existing_nullable=True)

    # Flag all existing users for password reset due to truncated hashes
    # Users with truncated hashes cannot login until they reset their password
    op.execute('UPDATE "user" SET is_first_login = TRUE WHERE password_hash IS NOT NULL')


def downgrade():
    # WARNING: Downgrading will truncate password hashes again
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column('password_hash',
                              existing_type=sa.String(length=255),
                              type_=sa.String(length=128),
                              existing_nullable=True)
