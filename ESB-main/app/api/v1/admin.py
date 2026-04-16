"""
Admin API v1
RESTful endpoints for class management, teacher assignments, and student enrollment
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import (
    Program, Classe, Course, User, ClassCourseAssignment,
    Enrollment, TeacherStudent, Syllabus, TNChapter
)
from app.api.v1.utils import get_current_user, superuser_required
import logging
import os

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


@admin_api_bp.route('/classes', methods=['GET'])
@jwt_required()
@superuser_required
def list_classes():
    """
    List all classes with student count, program name, course count.

    Returns:
        200: List of classes
        403: If user is not a superuser
    """
    try:
        classes = Classe.query.order_by(Classe.created_at.desc()).all()

        classes_data = []
        for c in classes:
            courses_count = ClassCourseAssignment.query.filter_by(class_id=c.id).count()
            classes_data.append({
                'id': c.id,
                'name': c.name,
                'description': c.description,
                'academic_year': c.academic_year,
                'program_id': c.program_id,
                'program_name': c.program.name if c.program else None,
                'students_count': c.students.count(),
                'courses_count': courses_count,
                'created_at': c.created_at.isoformat() if c.created_at else None,
                'updated_at': c.updated_at.isoformat() if c.updated_at else None,
            })

        return jsonify({
            'classes': classes_data,
            'total': len(classes_data),
        }), 200
    except Exception as e:
        logger.error(f"Error listing classes: {e}")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/classes', methods=['POST'])
@jwt_required()
@superuser_required
def create_class():
    """
    Create a new class.

    Request Body:
        {
            "name": "Class A",
            "description": "Optional description",
            "academic_year": "2025-2026",
            "program_id": 1
        }

    Returns:
        201: Class created
        400: Validation error
        403: If user is not a superuser
    """
    try:
        data = request.get_json()
        name = data.get('name', '').strip()

        if not name:
            return jsonify({'error': 'Class name is required'}), 400

        program_id = data.get('program_id')
        if program_id:
            program = Program.query.get(program_id)
            if not program:
                return jsonify({'error': f'Program {program_id} not found'}), 400

        classe = Classe(
            name=name,
            description=data.get('description', '').strip() or None,
            academic_year=data.get('academic_year', '').strip() or None,
            program_id=program_id,
        )
        db.session.add(classe)
        db.session.commit()

        courses_count = ClassCourseAssignment.query.filter_by(class_id=classe.id).count()

        return jsonify({
            'message': f'Class "{classe.name}" created successfully',
            'class': {
                'id': classe.id,
                'name': classe.name,
                'description': classe.description,
                'academic_year': classe.academic_year,
                'program_id': classe.program_id,
                'program_name': classe.program.name if classe.program else None,
                'students_count': 0,
                'courses_count': courses_count,
                'created_at': classe.created_at.isoformat() if classe.created_at else None,
                'updated_at': classe.updated_at.isoformat() if classe.updated_at else None,
            },
        }), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating class: {e}")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/classes/<int:class_id>', methods=['PUT'])
@jwt_required()
@superuser_required
def update_class(class_id):
    """
    Update class metadata.

    Request Body:
        {
            "name": "Updated Name",
            "description": "Updated description",
            "academic_year": "2025-2026",
            "program_id": 1
        }

    Returns:
        200: Class updated
        400: Validation error
        403: If user is not a superuser
        404: Class not found
    """
    try:
        classe = Classe.query.get_or_404(class_id)
        data = request.get_json()

        if 'name' in data:
            name = data['name'].strip()
            if not name:
                return jsonify({'error': 'Class name cannot be empty'}), 400
            classe.name = name

        if 'description' in data:
            classe.description = data['description'].strip() or None if data['description'] else None

        if 'academic_year' in data:
            classe.academic_year = data['academic_year'].strip() or None if data['academic_year'] else None

        if 'program_id' in data:
            program_id = data['program_id']
            if program_id is not None:
                program = Program.query.get(program_id)
                if not program:
                    return jsonify({'error': f'Program {program_id} not found'}), 400
            classe.program_id = program_id

        db.session.commit()

        courses_count = ClassCourseAssignment.query.filter_by(class_id=classe.id).count()

        return jsonify({
            'message': f'Class "{classe.name}" updated successfully',
            'class': {
                'id': classe.id,
                'name': classe.name,
                'description': classe.description,
                'academic_year': classe.academic_year,
                'program_id': classe.program_id,
                'program_name': classe.program.name if classe.program else None,
                'students_count': classe.students.count(),
                'courses_count': courses_count,
                'created_at': classe.created_at.isoformat() if classe.created_at else None,
                'updated_at': classe.updated_at.isoformat() if classe.updated_at else None,
            },
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating class {class_id}: {e}")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/classes/<int:class_id>', methods=['DELETE'])
@jwt_required()
@superuser_required
def delete_class(class_id):
    """
    Delete a class. Students are reassigned to no class.

    Returns:
        200: Class deleted
        403: If user is not a superuser
        404: Class not found
    """
    try:
        classe = Classe.query.get_or_404(class_id)
        class_name = classe.name

        # Reassign students to no class
        students = classe.students.all()
        for student in students:
            student.class_id = None

        # Delete course assignments (cascade handles this, but be explicit)
        ClassCourseAssignment.query.filter_by(class_id=class_id).delete()

        db.session.delete(classe)
        db.session.commit()

        return jsonify({
            'message': f'Class "{class_name}" deleted successfully',
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting class {class_id}: {e}")
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


# ═══════════════════════════════════════════════════════════════════════
#  SYLLABUS BATCH UPLOAD / EXTRACTION / COURSE STRUCTURE
# ═══════════════════════════════════════════════════════════════════════

@admin_api_bp.route('/syllabus/batch-upload', methods=['POST'])
@jwt_required()
@superuser_required
def batch_upload_syllabus():
    """
    Admin-only: upload and process multiple syllabus files.

    FormData:
        files[]          – one or more PDF/DOCX files
        course_mappings  – JSON string: {"filename": course_id, ...}
        syllabus_type    – optional, default "tn"

    Returns:
        200: Per-file results list
        400: Missing files or mappings
        403: Non-admin user
    """
    import json as _json
    from werkzeug.utils import secure_filename
    from app.services.admin_syllabus_service import AdminSyllabusService

    files = request.files.getlist('files')
    if not files or all(f.filename == '' for f in files):
        return jsonify({'error': 'No files provided'}), 400

    raw_mappings = request.form.get('course_mappings', '{}')
    try:
        course_mappings = _json.loads(raw_mappings)
    except _json.JSONDecodeError:
        return jsonify({'error': 'Invalid course_mappings JSON'}), 400

    user = get_current_user()
    admin_id = user.id

    try:
        results = AdminSyllabusService.process_syllabus_batch(
            files=files,
            course_mappings=course_mappings,
            admin_id=admin_id,
        )

        success_count = sum(1 for r in results if r.get('success'))
        return jsonify({
            'message': f'Processed {success_count}/{len(results)} files successfully',
            'results': results,
        }), 200
    except Exception as e:
        logger.exception("Batch upload failed")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/syllabus/<int:course_id>/process', methods=['POST'])
@jwt_required()
@superuser_required
def process_syllabus(course_id):
    """
    Process a single uploaded syllabus: extract + create structure.

    JSON body (optional):
        syllabus_type – "tn" (default) or "bga"

    If no file is attached, uses the existing file_path from the Syllabus record.
    If a file is attached (key "file"), saves it first.
    """
    from werkzeug.utils import secure_filename
    from app.services.admin_syllabus_service import AdminSyllabusService

    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    user = get_current_user()
    syllabus_type = (request.form.get('syllabus_type')
                     or (request.json or {}).get('syllabus_type', 'tn')
                     if request.is_json else request.form.get('syllabus_type', 'tn'))

    # Determine file path
    file_path = None
    uploaded = request.files.get('file')
    if uploaded and uploaded.filename:
        from datetime import datetime
        upload_dir = AdminSyllabusService._ensure_syllabi_folder()
        filename = secure_filename(uploaded.filename)
        timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        stored_name = f"{course_id}_{timestamp}_{filename}"
        file_path = os.path.join(upload_dir, stored_name)
        uploaded.save(file_path)
    else:
        syllabus = Syllabus.query.filter_by(course_id=course_id).first()
        if syllabus and syllabus.file_path:
            file_path = syllabus.file_path

    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'No syllabus file available. Upload a file first.'}), 400

    try:
        result = AdminSyllabusService.process_single_syllabus(
            file_path=file_path,
            course_id=course_id,
            syllabus_type=syllabus_type,
            admin_id=user.id,
        )
        status_code = 200 if result.get('success') else 422
        return jsonify(result), status_code
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error processing syllabus for course {course_id}")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/syllabus/<int:course_id>/create-structure', methods=['POST'])
@jwt_required()
@superuser_required
def create_course_structure(course_id):
    """
    Create course chapters from existing syllabus TN data.
    Does NOT re-extract — uses already-persisted TNChapters.
    """
    from app.services.admin_syllabus_service import AdminSyllabusService

    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus:
        return jsonify({'error': 'No syllabus found for this course. Upload and extract first.'}), 404

    tn_count = TNChapter.query.filter_by(syllabus_id=syllabus.id).count()
    if tn_count == 0:
        return jsonify({'error': 'No TN chapters found. Run extraction first.'}), 422

    try:
        chapters_created = AdminSyllabusService.create_course_structure(course_id)
        db.session.commit()
        return jsonify({
            'message': f'Course structure created: {chapters_created} new chapter(s)',
            'chapters_created': chapters_created,
            'course_id': course_id,
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error creating structure for course {course_id}")
        return jsonify({'error': str(e)}), 500


@admin_api_bp.route('/syllabus/status', methods=['GET'])
@jwt_required()
@superuser_required
def get_syllabus_status():
    """
    List all syllabi with their processing status.

    Query params:
        course_id – optional filter
    """
    from app.services.admin_syllabus_service import AdminSyllabusService

    course_id = request.args.get('course_id', type=int)

    try:
        statuses = AdminSyllabusService.get_processing_status(course_id=course_id)
        return jsonify({
            'syllabi': statuses,
            'total': len(statuses),
        }), 200
    except Exception as e:
        logger.exception("Error fetching syllabus status")
        return jsonify({'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════════
# Skills Analytics API
# ═══════════════════════════════════════════════════════════════════════════════

@admin_api_bp.route('/skills/analytics', methods=['GET'])
@jwt_required()
@superuser_required
def skills_analytics_api():
    """
    GET /api/v1/admin/skills/analytics?days=30

    Returns aggregated skill execution statistics and recent execution log.
    Useful for frontend dashboards or external monitoring tools.
    """
    from app.services.skill_manager import SkillManager
    from app.models.skills import SkillExecution, Skill, AgentRegistry

    days = request.args.get('days', 30, type=int)
    if days not in (7, 30, 90, 180):
        days = 30

    try:
        # Aggregated stats per skill
        stats = SkillManager().get_usage_stats(days=days)

        # Per-agent breakdown (how many executions per agent in the period)
        from sqlalchemy import func, text as _text
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(days=days)
        agent_rows = (
            SkillExecution.query
            .with_entities(
                SkillExecution.agent_id,
                func.count(SkillExecution.id).label('calls'),
                func.sum(func.case((SkillExecution.status == 'error', 1), else_=0)).label('errors'),
            )
            .filter(SkillExecution.started_at >= since)
            .group_by(SkillExecution.agent_id)
            .all()
        )
        by_agent = [
            {'agent_id': r.agent_id or 'unknown', 'calls': r.calls, 'errors': int(r.errors or 0)}
            for r in agent_rows
        ]

        # Recent 50 executions
        recent_execs = (
            SkillExecution.query
            .order_by(SkillExecution.started_at.desc())
            .limit(50)
            .all()
        )
        skills_map = {s.id: s.name for s in Skill.query.all()}
        recent = [
            {
                'id': e.id,
                'skill_id': e.skill_id,
                'skill_name': skills_map.get(e.skill_id, e.skill_id),
                'agent_id': e.agent_id,
                'user_id': e.user_id,
                'status': e.status,
                'duration_ms': e.duration_ms,
                'tokens_used': e.tokens_used,
                'started_at': e.started_at.isoformat() if e.started_at else None,
                'error_msg': e.error_msg,
            }
            for e in recent_execs
        ]

        return jsonify({
            'period_days': days,
            'aggregate': stats,
            'by_agent': by_agent,
            'recent': recent,
        }), 200

    except Exception as e:
        logger.exception("Error fetching skill analytics")
        return jsonify({'error': str(e)}), 500
