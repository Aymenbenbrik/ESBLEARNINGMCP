from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import User, TeacherStudent, UserSession, Course, Classe
from app.api.v1.utils import validate_pagination
from datetime import datetime, timedelta
import re
import secrets
import string
import csv
import io

users_api_bp = Blueprint('users_api', __name__, url_prefix='/users')


def generate_username_from_email(email):
    """Generate username from email (part before @)"""
    match = re.match(r'^([^@]+)@', email)
    if match:
        base_username = match.group(1).lower()
        base_username = re.sub(r'[^a-z0-9]', '', base_username)
        return base_username[:30]
    return None


def generate_auto_password(email):
    """Generate auto password: FirstName@123"""
    username = generate_username_from_email(email)
    if username:
        return f"{username.capitalize()}@123"
    return "Student@123"


def _generate_secure_password(length=10):
    """Generate a random secure password."""
    chars = string.ascii_letters + string.digits
    pwd = ''.join(secrets.choice(chars) for _ in range(length - 2))
    pwd += secrets.choice(string.digits)
    pwd += secrets.choice(string.ascii_uppercase)
    return pwd


def _ensure_unique_username(base_username):
    """Ensure username is unique by appending a counter if needed."""
    username = base_username
    counter = 1
    while User.query.filter_by(username=username).first():
        username = f"{base_username}{counter}"
        counter += 1
    return username


def _ensure_unique_email(base_email):
    """Ensure email is unique by appending a counter if needed."""
    if not User.query.filter_by(email=base_email).first():
        return base_email
    name, domain = base_email.rsplit('@', 1)
    counter = 1
    email = f"{name}{counter}@{domain}"
    while User.query.filter_by(email=email).first():
        counter += 1
        email = f"{name}{counter}@{domain}"
    return email


@users_api_bp.route('/students', methods=['POST'])
@jwt_required()
def bulk_add_students():
    """
    Bulk add students by email
    Accepts: { emails: [str] }
    Returns: { added: [User], existing: [User], errors: [str] }
    """
    try:
        user_id = int(get_jwt_identity())
        teacher = User.query.get(user_id)

        if not teacher or not teacher.is_teacher:
            return jsonify({'error': 'Only teachers can add students'}), 403

        data = request.get_json()
        emails = data.get('emails', [])

        if not emails or not isinstance(emails, list):
            return jsonify({'error': 'Emails list is required'}), 400

        added = []
        existing = []
        errors = []

        for email in emails:
            email = email.strip().lower()

            # Validate email format
            if not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
                errors.append(f"Invalid email format: {email}")
                continue

            # Check if user already exists
            user = User.query.filter(User.email.ilike(email)).first()

            if user:
                # User exists, check if already linked to teacher
                if teacher.has_student(user):
                    existing.append({
                        'id': user.id,
                        'username': user.username,
                        'email': user.email
                    })
                else:
                    # Link existing user to teacher
                    teacher.add_student(user)
                    added.append({
                        'id': user.id,
                        'username': user.username,
                        'email': user.email
                    })
            else:
                # Create new student account
                username = generate_username_from_email(email)
                if not username:
                    errors.append(f"Could not generate username from: {email}")
                    continue

                # Ensure username is unique
                counter = 1
                original_username = username
                while User.query.filter_by(username=username).first():
                    username = f"{original_username}{counter}"
                    counter += 1

                # Create new user
                new_user = User(
                    username=username,
                    email=email,
                    is_teacher=False,
                    is_first_login=True
                )
                auto_password = generate_auto_password(email)
                new_user.set_password(auto_password)

                db.session.add(new_user)
                db.session.flush()  # Get the ID

                # Link to teacher
                teacher.add_student(new_user)

                added.append({
                    'id': new_user.id,
                    'username': new_user.username,
                    'email': new_user.email
                })

        db.session.commit()

        return jsonify({
            'added': added,
            'existing': existing,
            'errors': errors
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/students', methods=['GET'])
@jwt_required()
def get_students():
    """
    Get teacher's students
    Returns: { students: [User], stats: { total, active, pending } }
    """
    try:
        user_id = int(get_jwt_identity())
        teacher = User.query.get(user_id)

        if not teacher or not teacher.is_teacher:
            return jsonify({'error': 'Only teachers can view students'}), 403

        students = teacher.get_all_students()

        # Calculate statistics
        total = len(students)
        active = 0
        pending = 0

        # Check for active sessions in last 7 days
        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        for student in students:
            # Check if student has logged in
            recent_session = UserSession.query.filter(
                UserSession.user_id == student.id,
                UserSession.login_time >= seven_days_ago
            ).first()

            if recent_session:
                active += 1
            elif student.is_first_login:
                pending += 1

        # Format student data
        students_data = []
        for student in students:
            last_session = UserSession.query.filter_by(
                user_id=student.id
            ).order_by(UserSession.login_time.desc()).first()

            students_data.append({
                'id': student.id,
                'username': student.username,
                'email': student.email,
                'is_teacher': student.is_teacher,
                'is_superuser': student.is_superuser,
                'created_at': student.created_at.isoformat() if student.created_at else None,
                'last_login': last_session.login_time.isoformat() if last_session else None,
                'is_first_login': student.is_first_login
            })

        return jsonify({
            'students': students_data,
            'stats': {
                'total': total,
                'active': active,
                'pending': pending
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/students/<int:student_id>', methods=['PUT'])
@jwt_required()
def update_student(student_id):
    """
    Update student information
    Accepts: { username: str, email: str }
    """
    try:
        user_id = int(get_jwt_identity())
        teacher = User.query.get(user_id)

        if not teacher or not teacher.is_teacher:
            return jsonify({'error': 'Only teachers can update students'}), 403

        student = User.query.get(student_id)
        if not student:
            return jsonify({'error': 'Student not found'}), 404

        # Verify teacher owns this student
        if not teacher.has_student(student):
            return jsonify({'error': 'You can only update your own students'}), 403

        data = request.get_json()

        # Update username if provided and not duplicate
        if 'username' in data and data['username'] != student.username:
            existing = User.query.filter_by(username=data['username']).first()
            if existing:
                return jsonify({'error': 'Username already exists'}), 400
            student.username = data['username']

        # Update email if provided and not duplicate
        if 'email' in data and data['email'] != student.email:
            existing = User.query.filter_by(email=data['email']).first()
            if existing:
                return jsonify({'error': 'Email already exists'}), 400
            student.email = data['email']

        db.session.commit()

        return jsonify({
            'id': student.id,
            'username': student.username,
            'email': student.email,
            'is_teacher': student.is_teacher,
            'is_superuser': student.is_superuser,
            'created_at': student.created_at.isoformat() if student.created_at else None
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/students/<int:student_id>', methods=['DELETE'])
@jwt_required()
def remove_student(student_id):
    """
    Remove student from teacher's roster (unlink, don't delete account)
    """
    try:
        user_id = int(get_jwt_identity())
        teacher = User.query.get(user_id)

        if not teacher or not teacher.is_teacher:
            return jsonify({'error': 'Only teachers can remove students'}), 403

        student = User.query.get(student_id)
        if not student:
            return jsonify({'error': 'Student not found'}), 404

        # Remove link
        if teacher.remove_student(student):
            db.session.commit()
            return jsonify({'message': 'Student removed from roster'}), 200
        else:
            return jsonify({'error': 'Student is not in your roster'}), 404

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/students/<int:student_id>/reset-password', methods=['POST'])
@jwt_required()
def reset_student_password(student_id):
    """
    Reset student password to auto-generated password
    """
    try:
        user_id = int(get_jwt_identity())
        teacher = User.query.get(user_id)

        if not teacher or not teacher.is_teacher:
            return jsonify({'error': 'Only teachers can reset passwords'}), 403

        student = User.query.get(student_id)
        if not student:
            return jsonify({'error': 'Student not found'}), 404

        # Verify teacher owns this student
        if not teacher.has_student(student):
            return jsonify({'error': 'You can only reset passwords for your own students'}), 403

        # Reset password
        auto_password = generate_auto_password(student.email)
        student.set_password(auto_password)
        student.is_first_login = True
        db.session.add(student)  # Ensure object is tracked by session
        db.session.commit()

        return jsonify({
            'message': 'Password reset successfully',
            'new_password': auto_password
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/', methods=['GET'])
@jwt_required()
def list_users():
    """
    List all users with filters (superuser only)

    Query Parameters:
        role: Filter by role ('all', 'student', 'teacher', 'superuser')
        search: Search by username or email
        limit: Max results per page (default 50, max 100)
        offset: Pagination offset (default 0)

    Returns:
        200: List of users with pagination info
        403: If user is not a superuser
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or not user.is_superuser:
            return jsonify({'error': 'Superuser access required'}), 403

        # Build query
        query = User.query

        # Role filter
        role = request.args.get('role', 'all')
        if role == 'student':
            query = query.filter_by(is_teacher=False, is_superuser=False)
        elif role == 'teacher':
            query = query.filter_by(is_teacher=True)
        elif role == 'superuser':
            query = query.filter_by(is_superuser=True)

        # Search filter
        search = request.args.get('search', '').strip()
        if search:
            query = query.filter(
                db.or_(
                    User.username.ilike(f'%{search}%'),
                    User.email.ilike(f'%{search}%')
                )
            )

        # Pagination
        limit = request.args.get('limit', type=int)
        offset = request.args.get('offset', type=int)
        limit, offset = validate_pagination(limit, offset)

        total = query.count()
        users = query.order_by(User.created_at.desc()).limit(limit).offset(offset).all()

        return jsonify({
            'users': [
                {
                    'id': u.id,
                    'username': u.username,
                    'email': u.email,
                    'is_teacher': u.is_teacher,
                    'is_superuser': u.is_superuser,
                    'is_first_login': u.is_first_login,
                    'class_id': u.class_id,
                    'class_name': u.classe.name if u.classe else None,
                    'created_at': u.created_at.isoformat() if u.created_at else None
                }
                for u in users
            ],
            'total': total,
            'limit': limit,
            'offset': offset
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/teachers', methods=['GET'])
@jwt_required()
def list_teachers():
    """
    List all teachers with statistics (superuser only)

    Returns:
        200: List of teachers with course and student counts
        403: If user is not a superuser
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or not user.is_superuser:
            return jsonify({'error': 'Superuser access required'}), 403

        teachers = User.query.filter_by(is_teacher=True).order_by(User.username).all()

        return jsonify({
            'teachers': [
                {
                    'id': t.id,
                    'username': t.username,
                    'email': t.email,
                    'is_superuser': t.is_superuser,
                    'created_at': t.created_at.isoformat() if t.created_at else None,
                    'courses_count': Course.query.filter_by(teacher_id=t.id).count(),
                    'students_count': TeacherStudent.query.filter_by(teacher_id=t.id).count()
                }
                for t in teachers
            ],
            'total': len(teachers)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/teachers', methods=['POST'])
@jwt_required()
def create_teacher():
    """Create a new teacher account (superuser only)."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or not user.is_superuser:
            return jsonify({'error': 'Superuser access required'}), 403

        data = request.get_json()
        username = (data.get('username') or '').strip()
        email = (data.get('email') or '').strip()
        password = (data.get('password') or '').strip()

        if not username:
            return jsonify({'error': 'username is required'}), 400
        if not email:
            return jsonify({'error': 'email is required'}), 400

        if User.query.filter_by(username=username).first():
            return jsonify({'error': f"Username '{username}' already exists"}), 400
        if User.query.filter_by(email=email).first():
            return jsonify({'error': f"Email '{email}' already exists"}), 400

        if not password:
            password = _generate_secure_password()

        from werkzeug.security import generate_password_hash
        teacher = User(
            username=username,
            email=email,
            password_hash=generate_password_hash(password),
            is_teacher=True,
            is_superuser=False,
        )
        db.session.add(teacher)
        db.session.commit()

        return jsonify({
            'message': 'Teacher created',
            'teacher': {
                'id': teacher.id,
                'username': teacher.username,
                'email': teacher.email,
                'password': password,
                'is_teacher': True,
                'created_at': teacher.created_at.isoformat() if teacher.created_at else None,
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/teachers/<int:teacher_id>', methods=['PUT'])
@jwt_required()
def update_teacher(teacher_id):
    """Update a teacher's info (superuser only)."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or not user.is_superuser:
            return jsonify({'error': 'Superuser access required'}), 403

        teacher = User.query.get(teacher_id)
        if not teacher:
            return jsonify({'error': 'Teacher not found'}), 404
        if not teacher.is_teacher:
            return jsonify({'error': 'User is not a teacher'}), 400

        data = request.get_json()

        new_username = (data.get('username') or '').strip()
        if new_username and new_username != teacher.username:
            if User.query.filter(User.username == new_username, User.id != teacher_id).first():
                return jsonify({'error': f"Username '{new_username}' already exists"}), 400
            teacher.username = new_username

        new_email = (data.get('email') or '').strip()
        if new_email and new_email != teacher.email:
            if User.query.filter(User.email == new_email, User.id != teacher_id).first():
                return jsonify({'error': f"Email '{new_email}' already exists"}), 400
            teacher.email = new_email

        if 'is_superuser' in data:
            teacher.is_superuser = bool(data['is_superuser'])

        db.session.commit()

        return jsonify({
            'message': 'Teacher updated',
            'teacher': {
                'id': teacher.id,
                'username': teacher.username,
                'email': teacher.email,
                'is_teacher': teacher.is_teacher,
                'is_superuser': teacher.is_superuser,
                'created_at': teacher.created_at.isoformat() if teacher.created_at else None,
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/teachers/<int:teacher_id>', methods=['DELETE'])
@jwt_required()
def delete_teacher(teacher_id):
    """Delete a teacher (superuser only). Cannot delete self."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or not user.is_superuser:
            return jsonify({'error': 'Superuser access required'}), 403

        if teacher_id == user_id:
            return jsonify({'error': 'Cannot delete yourself'}), 400

        teacher = User.query.get(teacher_id)
        if not teacher:
            return jsonify({'error': 'Teacher not found'}), 404
        if not teacher.is_teacher:
            return jsonify({'error': 'User is not a teacher'}), 400

        # Check if teacher has courses
        course_count = Course.query.filter_by(teacher_id=teacher_id).count()
        if course_count > 0:
            return jsonify({
                'error': f"Cannot delete teacher: has {course_count} assigned course(s). Reassign them first."
            }), 400

        db.session.delete(teacher)
        db.session.commit()

        return jsonify({'message': 'Teacher deleted'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/teachers/<int:teacher_id>/reset-password', methods=['POST'])
@jwt_required()
def reset_teacher_password(teacher_id):
    """Reset a teacher's password (superuser only)."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or not user.is_superuser:
            return jsonify({'error': 'Superuser access required'}), 403

        teacher = User.query.get(teacher_id)
        if not teacher:
            return jsonify({'error': 'Teacher not found'}), 404

        data = request.get_json() or {}
        new_password = (data.get('password') or '').strip()
        if not new_password:
            new_password = _generate_secure_password()

        from werkzeug.security import generate_password_hash
        teacher.password_hash = generate_password_hash(new_password)
        db.session.commit()

        return jsonify({
            'message': 'Password reset successfully',
            'password': new_password,
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ─── Student Generation & Batch Management ────────────────────────────────────

@users_api_bp.route('/students/generate', methods=['POST'])
@jwt_required()
def generate_students():
    """
    Generate N student accounts with auto-generated credentials.

    Request Body:
        {
            "count": 10,
            "class_id": 1,                   // optional
            "username_prefix": "etudiant",   // optional, default "etudiant"
            "email_domain": "esprit.tn",     // optional, default "esprit.tn"
            "names": [                       // optional, list of {first_name, last_name}
                {"first_name": "Ahmed", "last_name": "Ben Ali"},
                ...
            ]
        }

    Returns:
        201: { students: [{id, username, email, password, class_id}], count: N }
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or (not user.is_teacher and not user.is_superuser):
            return jsonify({'error': 'Teacher or superuser access required'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        count = data.get('count', 0)
        class_id = data.get('class_id')
        prefix = data.get('username_prefix', 'etudiant')
        domain = data.get('email_domain', 'esprit.tn')
        names = data.get('names', [])

        if count <= 0 and not names:
            return jsonify({'error': 'count must be > 0 or names must be provided'}), 400

        if count > 200:
            return jsonify({'error': 'Maximum 200 students per batch'}), 400

        # Validate class if provided
        if class_id:
            classe = Classe.query.get(class_id)
            if not classe:
                return jsonify({'error': f'Class {class_id} not found'}), 404

        generated = []

        # Generate from names list
        if names:
            for entry in names:
                first = entry.get('first_name', '').strip()
                last = entry.get('last_name', '').strip()
                if not first:
                    continue

                base_username = f"{first.lower()}.{last.lower()}" if last else first.lower()
                base_username = re.sub(r'[^a-z0-9.]', '', base_username)[:30]
                username = _ensure_unique_username(base_username)

                base_email = f"{base_username}@{domain}"
                email = _ensure_unique_email(base_email)

                password = _generate_secure_password()

                new_user = User(
                    username=username,
                    email=email,
                    is_teacher=False,
                    is_first_login=True,
                    class_id=class_id,
                )
                new_user.set_password(password)
                db.session.add(new_user)
                db.session.flush()

                if user.is_teacher:
                    user.add_student(new_user)

                generated.append({
                    'id': new_user.id,
                    'username': username,
                    'email': email,
                    'password': password,
                    'first_name': first,
                    'last_name': last,
                    'class_id': class_id,
                })

        # Generate numbered students
        remaining = count - len(generated)
        if remaining > 0:
            existing = User.query.filter(
                User.username.like(f'{prefix}%')
            ).all()
            max_num = 0
            for u in existing:
                match = re.search(rf'^{re.escape(prefix)}(\d+)$', u.username)
                if match:
                    max_num = max(max_num, int(match.group(1)))

            for i in range(1, remaining + 1):
                num = max_num + i
                username = f"{prefix}{num}"
                email = f"{prefix}{num}@{domain}"
                email = _ensure_unique_email(email)
                password = _generate_secure_password()

                new_user = User(
                    username=username,
                    email=email,
                    is_teacher=False,
                    is_first_login=True,
                    class_id=class_id,
                )
                new_user.set_password(password)
                db.session.add(new_user)
                db.session.flush()

                if user.is_teacher:
                    user.add_student(new_user)

                generated.append({
                    'id': new_user.id,
                    'username': username,
                    'email': email,
                    'password': password,
                    'class_id': class_id,
                })

        db.session.commit()

        return jsonify({
            'students': generated,
            'count': len(generated),
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/students/export', methods=['GET'])
@jwt_required()
def export_students_csv():
    """
    Export all students as CSV.

    Query Parameters:
        class_id: optional filter by class
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or (not user.is_teacher and not user.is_superuser):
            return jsonify({'error': 'Teacher or superuser access required'}), 403

        query = User.query.filter_by(is_teacher=False, is_superuser=False)

        class_id = request.args.get('class_id', type=int)
        if class_id:
            query = query.filter_by(class_id=class_id)

        students = query.order_by(User.username).all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['ID', 'Username', 'Email', 'Class', 'Created At', 'First Login'])

        for s in students:
            writer.writerow([
                s.id,
                s.username,
                s.email,
                s.classe.name if s.classe else '',
                s.created_at.strftime('%Y-%m-%d') if s.created_at else '',
                'Yes' if s.is_first_login else 'No',
            ])

        from flask import Response
        csv_content = output.getvalue()
        return Response(
            csv_content,
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=students_export.csv'},
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/students/all', methods=['GET'])
@jwt_required()
def list_all_students():
    """
    List all students with full info (teacher/superuser).

    Query Parameters:
        class_id: optional filter by class
        search: optional search by username/email
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or (not user.is_teacher and not user.is_superuser):
            return jsonify({'error': 'Teacher or superuser access required'}), 403

        query = User.query.filter_by(is_teacher=False, is_superuser=False)

        class_id = request.args.get('class_id', type=int)
        if class_id:
            query = query.filter_by(class_id=class_id)

        search = request.args.get('search', '').strip()
        if search:
            query = query.filter(
                db.or_(
                    User.username.ilike(f'%{search}%'),
                    User.email.ilike(f'%{search}%'),
                )
            )

        students = query.order_by(User.username).all()

        classes = Classe.query.order_by(Classe.name).all()

        students_data = []
        for s in students:
            last_session = UserSession.query.filter_by(
                user_id=s.id
            ).order_by(UserSession.login_time.desc()).first()

            students_data.append({
                'id': s.id,
                'username': s.username,
                'email': s.email,
                'class_id': s.class_id,
                'class_name': s.classe.name if s.classe else None,
                'is_first_login': s.is_first_login,
                'is_active': getattr(s, 'is_active', True),
                'created_at': s.created_at.isoformat() if s.created_at else None,
                'last_login': last_session.login_time.isoformat() if last_session else None,
            })

        return jsonify({
            'students': students_data,
            'total': len(students_data),
            'classes': [
                {'id': c.id, 'name': c.name, 'program_name': c.program.name if c.program else None}
                for c in classes
            ],
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ===========================================================================
# ADMIN STUDENT MANAGEMENT
# ===========================================================================

@users_api_bp.route('/students/<int:student_id>/admin-update', methods=['PUT'])
@jwt_required()
def admin_update_student(student_id):
    """
    Admin-only: update student class_id, is_active status, username, email.
    Accepts: { class_id?: int|null, is_active?: bool, username?: str, email?: str }
    """
    try:
        user_id = int(get_jwt_identity())
        admin = User.query.get(user_id)
        if not admin or not admin.is_superuser:
            return jsonify({'error': 'Superuser access required'}), 403

        student = User.query.get(student_id)
        if not student:
            return jsonify({'error': 'Student not found'}), 404
        if student.is_teacher or student.is_superuser:
            return jsonify({'error': 'Target user is not a student'}), 400

        data = request.get_json()

        if 'class_id' in data:
            new_class_id = data['class_id']
            if new_class_id is not None:
                classe = Classe.query.get(new_class_id)
                if not classe:
                    return jsonify({'error': 'Class not found'}), 404
            student.class_id = new_class_id

        if 'is_active' in data:
            student.is_active = bool(data['is_active'])

        if 'username' in data and data['username'] != student.username:
            existing = User.query.filter_by(username=data['username']).first()
            if existing:
                return jsonify({'error': 'Username already exists'}), 400
            student.username = data['username']

        if 'email' in data and data['email'] != student.email:
            existing = User.query.filter_by(email=data['email']).first()
            if existing:
                return jsonify({'error': 'Email already exists'}), 400
            student.email = data['email']

        db.session.commit()

        return jsonify({
            'message': 'Student updated successfully',
            'student': {
                'id': student.id,
                'username': student.username,
                'email': student.email,
                'class_id': student.class_id,
                'class_name': student.classe.name if student.classe else None,
                'is_active': getattr(student, 'is_active', True),
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@users_api_bp.route('/students/<int:student_id>/admin-reset-password', methods=['POST'])
@jwt_required()
def admin_reset_student_password(student_id):
    """Admin-only: reset student password and return the new one."""
    try:
        user_id = int(get_jwt_identity())
        admin = User.query.get(user_id)
        if not admin or not admin.is_superuser:
            return jsonify({'error': 'Superuser access required'}), 403

        student = User.query.get(student_id)
        if not student:
            return jsonify({'error': 'Student not found'}), 404

        new_password = _generate_secure_password(10)
        student.set_password(new_password)
        student.is_first_login = True
        db.session.commit()

        return jsonify({
            'message': 'Password reset successfully',
            'new_password': new_password,
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
