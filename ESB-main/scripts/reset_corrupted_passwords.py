"""
Script to flag all existing users for password reset due to truncated hashes
Run after extending password_hash column to 255 characters

This script is optional - the migration already handles flagging users.
Use this if you need to re-flag users or run the operation separately.
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from app.models import User


def main():
    app = create_app()
    with app.app_context():
        # Flag all users for password reset
        users = User.query.all()
        count = 0

        for user in users:
            if user.password_hash and len(user.password_hash) >= 128:
                # This user's password was likely truncated
                user.is_first_login = True
                count += 1

        db.session.commit()
        print(f"✅ Flagged {count} users for password reset")
        print("Users will be prompted to change password on next login")


if __name__ == '__main__':
    main()
