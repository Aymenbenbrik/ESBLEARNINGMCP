from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import User, TeacherStudent, UserSession, Course, Classe
from app.api.v1.utils import validate_pagination
from datetime import datetime, timedelta
import re

users_api_bp = Blueprint('users_api', __name__, url_prefix='/users')


def generate_username_from_email(email):
    """Generate username from email (part before @)"""
    match = re.match(r'^([^@]+)@', email)
    if match:
        base_username = match.group(1).lower()
        # Remove dots and special characters
        base_username = re.sub(r'[^a-z0-9]', '', base_username)
        return base_username[:30]  # Limit to 30 chars
    return None


def generate_auto_password(email):
    """Generate auto password: FirstName@123"""
    username = generate_username_from_email(email)
    if username:
        # Capitalize first letter
        return f"{username.capitalize()}@123"
    return "Student@123"


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
