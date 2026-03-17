"""
Programs API v1
RESTful endpoints for program management, course associations, and class creation
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import Program, Classe, Course, User, ClassCourseAssignment
from app.api.v1.utils import get_current_user, superuser_required
import logging

logger = logging.getLogger(__name__)

programs_api_bp = Blueprint('programs_api', __name__, url_prefix='/programs')


@programs_api_bp.route('/', methods=['GET'])
@jwt_required()
@superuser_required
def list_programs():
    """
    List all programs with course and class counts

    Query Parameters:
        None

    Returns:
        200: List of programs with metadata
        403: If user is not a superuser
    """
    try:
        programs = Program.query.order_by(Program.created_at.desc()).all()

        return jsonify({
            'programs': [
                {
                    'id': p.id,
                    'name': p.name,
                    'description': p.description,
                    'created_at': p.created_at.isoformat() if p.created_at else None,
                    'courses_count': p.courses_count,
                    'classes_count': p.classes.count()
                }
                for p in programs
            ],
            'total': len(programs)
        }), 200
    except Exception as e:
        logger.error(f"Error listing programs: {e}")
        return jsonify({'error': str(e)}), 500


@programs_api_bp.route('/', methods=['POST'])
@jwt_required()
@superuser_required
def create_program():
    """
    Create a new program

    Request Body:
        {
            "name": "Program Name" (required, 1-150 chars, unique),
            "description": "Description" (optional)
        }

    Returns:
        201: Created program
        400: Validation error
        403: If user is not a superuser
        500: Server error
    """
    try:
        data = request.get_json()

        # Validate required fields
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': 'Program name is required'}), 400

        if len(name) > 150:
            return jsonify({'error': 'Program name must be 150 characters or less'}), 400

        # Check uniqueness
        existing = Program.query.filter_by(name=name).first()
        if existing:
            return jsonify({'error': f'Program with name "{name}" already exists'}), 400

        # Create program
        program = Program(
            name=name,
            description=data.get('description', '').strip()
        )
        db.session.add(program)
        db.session.commit()

        logger.info(f"Program created: {program.id} - {program.name}")

        return jsonify({
            'message': 'Program created successfully',
            'program': {
                'id': program.id,
                'name': program.name,
                'description': program.description,
                'created_at': program.created_at.isoformat() if program.created_at else None,
                'courses_count': 0,
                'classes_count': 0
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating program: {e}")
        return jsonify({'error': str(e)}), 500


@programs_api_bp.route('/<int:program_id>', methods=['GET'])
@jwt_required()
@superuser_required
def get_program(program_id):
    """
    Get program details with associated courses and classes

    Returns:
        200: Program details with courses and classes
        403: If user is not a superuser
        404: Program not found
    """
    try:
        program = Program.query.get_or_404(program_id)

        # Get courses with details
        courses_data = [
            {
                'id': course.id,
                'title': course.title,
                'description': course.description,
                'teacher': {
                    'id': course.teacher.id,
                    'username': course.teacher.username,
                    'email': course.teacher.email
                } if course.teacher else None,
                'chapters_count': course.chapters.count(),
                'students_count': course.enrollments.count()
            }
            for course in program.courses
        ]

        # Get classes with details
        classes_data = [
            {
                'id': c.id,
                'name': c.name,
                'program_id': c.program_id,
                'created_at': c.created_at.isoformat() if c.created_at else None,
                'students_count': c.students.count(),
                'courses_count': ClassCourseAssignment.query.filter_by(class_id=c.id).count()
            }
            for c in program.classes.order_by(Classe.created_at.desc()).all()
        ]

        return jsonify({
            'program': {
                'id': program.id,
                'name': program.name,
                'description': program.description,
                'created_at': program.created_at.isoformat() if program.created_at else None,
                'courses_count': len(courses_data),
                'classes_count': len(classes_data),
                'courses': courses_data,
                'classes': classes_data
            }
        }), 200
    except Exception as e:
        logger.error(f"Error getting program {program_id}: {e}")
        return jsonify({'error': str(e)}), 500


@programs_api_bp.route('/<int:program_id>', methods=['PUT'])
@jwt_required()
@superuser_required
def update_program(program_id):
    """
    Update program details

    Request Body:
        {
            "name": "New Name" (optional, 1-150 chars),
            "description": "New Description" (optional)
        }

    Returns:
        200: Updated program
        400: Validation error
        403: If user is not a superuser
        404: Program not found
    """
    try:
        program = Program.query.get_or_404(program_id)
        data = request.get_json()

        # Update name if provided
        if 'name' in data:
            name = data['name'].strip()
            if not name:
                return jsonify({'error': 'Program name cannot be empty'}), 400

            if len(name) > 150:
                return jsonify({'error': 'Program name must be 150 characters or less'}), 400

            # Check uniqueness (excluding self)
            existing = Program.query.filter(
                Program.name == name,
                Program.id != program_id
            ).first()
            if existing:
                return jsonify({'error': f'Program with name "{name}" already exists'}), 400

            program.name = name

        # Update description if provided
        if 'description' in data:
            program.description = data['description'].strip()

        db.session.commit()

        logger.info(f"Program updated: {program.id} - {program.name}")

        return jsonify({
            'message': 'Program updated successfully',
            'program': {
                'id': program.id,
                'name': program.name,
                'description': program.description,
                'created_at': program.created_at.isoformat() if program.created_at else None,
                'courses_count': program.courses_count,
                'classes_count': program.classes.count()
            }
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating program {program_id}: {e}")
        return jsonify({'error': str(e)}), 500


@programs_api_bp.route('/<int:program_id>', methods=['DELETE'])
@jwt_required()
@superuser_required
def delete_program(program_id):
    """
    Delete a program

    Note: Cannot delete if classes exist. Must remove classes first.
    Removes all course associations before deletion.

    Returns:
        200: Program deleted successfully
        400: Cannot delete (has classes)
        403: If user is not a superuser
        404: Program not found
    """
    try:
        program = Program.query.get_or_404(program_id)

        # Check if program has classes
        if program.classes.count() > 0:
            return jsonify({
                'error': 'Cannot delete program with existing classes. Please remove classes first.'
            }), 400

        # Clear course associations
        program.courses.clear()

        # Delete program
        db.session.delete(program)
        db.session.commit()

        logger.info(f"Program deleted: {program_id}")

        return jsonify({
            'message': 'Program deleted successfully'
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting program {program_id}: {e}")
        return jsonify({'error': str(e)}), 500


@programs_api_bp.route('/<int:program_id>/courses', methods=['POST'])
@jwt_required()
@superuser_required
def add_course_to_program(program_id):
    """
    Add a course to a program

    Request Body:
        {
            "course_id": 123 (required)
        }

    Returns:
        200: Course added successfully
        400: Validation error or course already associated
        403: If user is not a superuser
        404: Program or course not found
    """
    try:
        program = Program.query.get_or_404(program_id)
        data = request.get_json()

        # Validate course_id
        course_id = data.get('course_id')
        if not course_id:
            return jsonify({'error': 'course_id is required'}), 400

        course = Course.query.get_or_404(course_id)

        # Check if already associated
        if course in program.courses:
            return jsonify({'error': 'Course is already associated with this program'}), 400

        # Add course to program
        program.courses.append(course)
        db.session.commit()

        logger.info(f"Course {course_id} added to program {program_id}")

        return jsonify({
            'message': 'Course added to program successfully',
            'program': {
                'id': program.id,
                'name': program.name,
                'courses_count': program.courses_count
            },
            'course': {
                'id': course.id,
                'title': course.title
            }
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding course to program {program_id}: {e}")
        return jsonify({'error': str(e)}), 500


@programs_api_bp.route('/<int:program_id>/courses/<int:course_id>', methods=['DELETE'])
@jwt_required()
@superuser_required
def remove_course_from_program(program_id, course_id):
    """
    Remove a course from a program

    Returns:
        200: Course removed successfully
        400: Course not associated with program
        403: If user is not a superuser
        404: Program or course not found
    """
    try:
        program = Program.query.get_or_404(program_id)
        course = Course.query.get_or_404(course_id)

        # Check if course is associated
        if course not in program.courses:
            return jsonify({'error': 'Course is not associated with this program'}), 400

        # Remove course from program
        program.courses.remove(course)
        db.session.commit()

        logger.info(f"Course {course_id} removed from program {program_id}")

        return jsonify({
            'message': 'Course removed from program successfully',
            'program': {
                'id': program.id,
                'name': program.name,
                'courses_count': program.courses_count
            }
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error removing course {course_id} from program {program_id}: {e}")
        return jsonify({'error': str(e)}), 500


@programs_api_bp.route('/<int:program_id>/classes', methods=['POST'])
@jwt_required()
@superuser_required
def create_class_in_program(program_id):
    """
    Create a new class within a program

    Request Body:
        {
            "name": "Class Name" (required, 1-100 chars)
        }

    Returns:
        201: Class created successfully
        400: Validation error
        403: If user is not a superuser
        404: Program not found
    """
    try:
        program = Program.query.get_or_404(program_id)
        data = request.get_json()

        # Validate name
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': 'Class name is required'}), 400

        if len(name) > 100:
            return jsonify({'error': 'Class name must be 100 characters or less'}), 400

        # Check uniqueness within program
        existing = Classe.query.filter_by(name=name, program_id=program_id).first()
        if existing:
            return jsonify({'error': f'Class with name "{name}" already exists in this program'}), 400

        # Create class
        classe = Classe(
            name=name,
            program_id=program_id
        )
        db.session.add(classe)
        db.session.commit()

        logger.info(f"Class created: {classe.id} - {classe.name} in program {program_id}")

        return jsonify({
            'message': 'Class created successfully',
            'class': {
                'id': classe.id,
                'name': classe.name,
                'program_id': classe.program_id,
                'program_name': program.name,
                'created_at': classe.created_at.isoformat() if classe.created_at else None,
                'students_count': 0,
                'courses_count': 0
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating class in program {program_id}: {e}")
        return jsonify({'error': str(e)}), 500
