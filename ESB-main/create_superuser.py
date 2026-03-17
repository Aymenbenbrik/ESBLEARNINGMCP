from app import create_app, db
from app.models import User

app = create_app()

with app.app_context():
    print("Creating superuser account...")

    # Check if superuser already exists
    existing = User.query.filter_by(username='superadmin').first()
    if existing:
        print(f"Superuser 'superadmin' already exists (ID: {existing.id})")
        print(f"Making them superuser if not already...")
        existing.is_superuser = True
        db.session.commit()
    else:
        # Create new superuser
        superuser = User(
            username='superadmin',
            email='super@admin.com',
            is_teacher=True,
            is_superuser=True
        )
        superuser.set_password('super123')
        db.session.add(superuser)
        db.session.commit()
        print(f"✓ Superuser created: superadmin / super123")
        print(f"  ID: {superuser.id}")

    # Also upgrade your teacher account to superuser
    teacher = User.query.filter_by(username='teacher').first()
    if teacher:
        teacher.is_superuser = True
        db.session.commit()
        print(f"✓ Upgraded 'teacher' account to superuser")