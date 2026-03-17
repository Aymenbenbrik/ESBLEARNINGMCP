"""
Admin API v1
RESTful endpoints for class management, teacher assignments, and student enrollment
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import (
    Program, Classe, Course, User, ClassCourseAssignment,
    Enrollment, TeacherStudent
)
from app.api.v1.utils import get_current_user, superuser_required
import logging

logger = logging.getLogger(__name__)

admin_api_bp = Blueprint('admin_api', __name__, url_prefix='/admin')


@admin_api_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@superuser_required
def get_dashboard():
    """
    Get admin dashboard statistics

    Returns:
        200: Dashboard statistics
        403: If user is not a superuser
    """
    try:
        stats = {
            'programs_count': Program.query.count(),
            'classes_count': Classe.query.count(),
            'students_count': User.query.filter_by(is_teacher=False, is_superuser=False).count(),
            'teachers_count': User.query.filter_by(is_teacher=True).count(),
            'courses_count': Course.query.count(),
            'total_users': User.query.count()
        }

        # Recent activity - last 5 programs, classes, users
        recent_programs = Program.query.order_by(Program.created_at.desc()).limit(5).all()
        recent_classes = Classe.query.order_by(Classe.created_at.desc()).limit(5).all()
        recent_users = User.query.order_by(User.created_at.desc()).limit(5).all()

        return jsonify({
            'stats': stats,
            'recent': {
                'programs': [
                    {
                        'id': p.id,
                        'name': p.name,
                        'created_at': p.created_at.isoformat() if p.created_at else None
                    }
                    for p in recent_programs
                ],
                'classes': [
                    {
                        'id': c.id,
                        'name': c.name,
                        'program_id': c.program_id,
                        'program_name': c.program.name if c.program else None,
                        'created_at': c.created_at.isoformat() if c.created_at else None
                    }
                    for c in recent_classes
                ],
                'users': [
                    {
                        'id': u.id,
                        'username': u.username,
                        'email': u.email,
                        'is_teacher': u.is_teacher,
                        'is_superuser': u.is_superuser,
                        'created_at': u.created_at.isoformat() if u.created_at else None
                    }
                    for u in recent_users
                ]
            }
        }), 200
    except Exception as e:
        logger.error(f"Error fetching admin dashboard: {e}")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/classes/<int:class_id>', methods=['GET'])
@jwt_required()
@superuser_required
def get_class_detail(class_id):
    """
    Get class details with course assignments and available teachers

    Returns:
        200: Class details with assignments
        403: If user is not a superuser
        404: Class not found
    """
    try:
        classe = Classe.query.get_or_404(class_id)

        # Get all assignments for this class
        assignments = ClassCourseAssignment.query.filter_by(class_id=class_id).all()

        # Get all available teachers
        teachers = User.query.filter_by(is_teacher=True).order_by(User.username).all()

        # Get program courses if class has a program
        program_courses = []
        if classe.program_id:
            program_courses = classe.program.courses

        # Format assignments
        assignments_data = [
            {
                'id': a.id,
                'course': {
                    'id': a.course.id,
                    'title': a.course.title,
                    'description': a.course.description
                },
                'teacher': {
                    'id': a.teacher.id,
                    'username': a.teacher.username,
                    'email': a.teacher.email
                } if a.teacher else None,
                'created_at': a.created_at.isoformat() if a.created_at else None
            }
            for a in assignments
        ]

        return jsonify({
            'class': {
                'id': classe.id,
                'name': classe.name,
                'program_id': classe.program_id,
                'program_name': classe.program.name if classe.program else None,
                'created_at': classe.created_at.isoformat() if classe.created_at else None,
                'students_count': classe.students.count()
            },
            'assignments': assignments_data,
            'available_teachers': [
                {
                    'id': t.id,
                    'username': t.username,
                    'email': t.email,
                    'is_superuser': t.is_superuser
                }
                for t in teachers
            ],
            'program_courses': [
                {
                    'id': c.id,
                    'title': c.title,
                    'description': c.description,
                    'teacher_id': c.teacher_id
                }
                for c in program_courses
            ] if program_courses else []
        }), 200
    except Exception as e:
        logger.error(f"Error fetching class detail {class_id}: {e}")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/classes/<int:class_id>/assign-teachers', methods=['POST'])
@jwt_required()
@superuser_required
def assign_teachers(class_id):
    """
    Assign teachers to courses for a class

    Request Body:
        {
            "assignments": [
                {
                    "course_id": 123,
                    "teacher_id": 456  // null to remove assignment
                },
                ...
            ]
        }

    Returns:
        200: Assignments updated
        400: Validation error
        403: If user is not a superuser
        404: Class not found
    """
    try:
        classe = Classe.query.get_or_404(class_id)
        data = request.get_json()
        assignments = data.get('assignments', [])

        if not assignments or not isinstance(assignments, list):
            return jsonify({'error': 'assignments list is required'}), 400

        updated_count = 0
        errors = []

        for item in assignments:
            course_id = item.get('course_id')
            teacher_id = item.get('teacher_id')

            if not course_id:
                errors.append('course_id is required for each assignment')
                continue

            # Validate course exists
            course = Course.query.get(course_id)
            if not course:
                errors.append(f'Course {course_id} not found')
                continue

            # Validate teacher exists if provided
            if teacher_id is not None:
                teacher = User.query.get(teacher_id)
                if not teacher or not teacher.is_teacher:
                    errors.append(f'Teacher {teacher_id} not found or invalid')
                    continue

            # Find existing assignment
            assignment = ClassCourseAssignment.query.filter_by(
                class_id=class_id,
                course_id=course_id
            ).first()

            if assignment:
                if teacher_id is None:
                    # Remove assignment
                    db.session.delete(assignment)
                    logger.info(f"Removed assignment: class {class_id}, course {course_id}")
                else:
                    # Update assignment
                    assignment.teacher_id = teacher_id
                    logger.info(f"Updated assignment: class {class_id}, course {course_id}, teacher {teacher_id}")
            elif teacher_id is not None:
                # Create new assignment
                assignment = ClassCourseAssignment(
                    class_id=class_id,
                    course_id=course_id,
                    teacher_id=teacher_id
                )
                db.session.add(assignment)
                logger.info(f"Created assignment: class {class_id}, course {course_id}, teacher {teacher_id}")

            updated_count += 1

        db.session.commit()

        return jsonify({
            'message': 'Teacher assignments updated',
            'updated': updated_count,
            'errors': errors if errors else None
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error assigning teachers to class {class_id}: {e}")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/classes/<int:class_id>/students', methods=['GET'])
@jwt_required()
@superuser_required
def get_class_students(class_id):
    """
    Get students enrolled in a class

    Returns:
        200: List of students
        403: If user is not a superuser
        404: Class not found
    """
    try:
        classe = Classe.query.get_or_404(class_id)

        # Get students directly assigned to this class
        students = classe.students.order_by(User.username).all()

        # Get all students (for potential enrollment)
        all_students = User.query.filter_by(
            is_teacher=False,
            is_superuser=False
        ).order_by(User.username).all()

        return jsonify({
            'class': {
                'id': classe.id,
                'name': classe.name,
                'program_id': classe.program_id,
                'program_name': classe.program.name if classe.program else None
            },
            'enrolled_students': [
                {
                    'id': s.id,
                    'username': s.username,
                    'email': s.email,
                    'created_at': s.created_at.isoformat() if s.created_at else None
                }
                for s in students
            ],
            'all_students': [
                {
                    'id': s.id,
                    'username': s.username,
                    'email': s.email,
                    'class_id': s.class_id,
                    'class_name': s.classe.name if s.classe else None
                }
                for s in all_students
            ],
            'total_enrolled': len(students)
        }), 200
    except Exception as e:
        logger.error(f"Error fetching students for class {class_id}: {e}")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/classes/<int:class_id>/students', methods=['POST'])
@jwt_required()
@superuser_required
def update_class_students(class_id):
    """
    Bulk update students for a class

    Request Body:
        {
            "student_ids": [1, 2, 3, ...]  // List of student IDs to assign to this class
        }

    This will:
    - Assign all specified students to this class
    - Unassign any students not in the list (if they were previously in this class)
    - Enroll students in all courses assigned to this class

    Returns:
        200: Students updated
        400: Validation error
        403: If user is not a superuser
        404: Class not found
    """
    try:
        classe = Classe.query.get_or_404(class_id)
        data = request.get_json()
        student_ids = data.get('student_ids', [])

        if not isinstance(student_ids, list):
            return jsonify({'error': 'student_ids must be a list'}), 400

        # Get current students in this class
        current_students = set(s.id for s in classe.students.all())
        new_students = set(student_ids)

        # Students to add
        to_add = new_students - current_students
        # Students to remove
        to_remove = current_students - new_students

        added_count = 0
        removed_count = 0

        # Remove students
        for student_id in to_remove:
            student = User.query.get(student_id)
            if student and student.class_id == class_id:
                student.class_id = None
                removed_count += 1
                logger.info(f"Removed student {student_id} from class {class_id}")

        # Add students
        for student_id in to_add:
            student = User.query.get(student_id)
            if not student or student.is_teacher or student.is_superuser:
                continue

            # Assign to class
            student.class_id = class_id
            added_count += 1

            # Enroll in all class courses
            assignments = ClassCourseAssignment.query.filter_by(class_id=class_id).all()
            for assignment in assignments:
                # Check if enrollment already exists
                existing = Enrollment.query.filter_by(
                    user_id=student_id,
                    course_id=assignment.course_id
                ).first()
                if not existing:
                    enrollment = Enrollment(
                        user_id=student_id,
                        course_id=assignment.course_id
                    )
                    db.session.add(enrollment)
                    logger.info(f"Enrolled student {student_id} in course {assignment.course_id}")

        db.session.commit()

        return jsonify({
            'message': 'Class students updated successfully',
            'added': added_count,
            'removed': removed_count,
            'total': len(new_students)
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating students for class {class_id}: {e}")
        return jsonify({'error': str(e)}), 500
