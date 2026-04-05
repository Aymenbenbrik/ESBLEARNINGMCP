"""
Migration: Add exam_metadata column to course_exam table

Run with: flask db upgrade
Or manually: python migrations/add_exam_metadata.py
"""

from flask import Flask
from app import create_app, db
from sqlalchemy import text

def upgrade():
    """Add exam_metadata column to course_exam table."""
    app = create_app()
    with app.app_context():
        try:
            # Check if column already exists
            result = db.session.execute(text(
                "SELECT COUNT(*) FROM pragma_table_info('course_exam') WHERE name='exam_metadata'"
            ))
            exists = result.scalar() > 0
            
            if not exists:
                print("Adding exam_metadata column to course_exam table...")
                db.session.execute(text(
                    "ALTER TABLE course_exam ADD COLUMN exam_metadata TEXT"
                ))
                db.session.commit()
                print("✅ Migration completed successfully!")
            else:
                print("ℹ️  Column exam_metadata already exists. Skipping.")
        except Exception as e:
            print(f"❌ Migration failed: {e}")
            db.session.rollback()
            raise

if __name__ == '__main__':
    upgrade()
