from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from sqlalchemy import text, func
import os
from datetime import datetime
from app import db
from app.models import (
    Course,
    Chapter,
    Enrollment,
    User,
    Document,
    Quiz,
    QuestionBankQuestion,
    Classe,
    ClassCourseAssignment,
    Program,
)
from app.services.syllabus_service import SyllabusService
import logging

logger = logging.getLogger(__name__)

courses_api_bp = Blueprint('courses_api', __name__, url_prefix='/courses')


def _compute_tn_aa_distribution(syllabus):
    """Compute a simple, logical "importance" score for TN acquis (AA).

    We approximate teaching emphasis by frequency:
    - each section link counts as 1
    - each chapter-level link counts as 0.5 (coarser)
    The result is normalized into percentages.
    """
    if not syllabus or not getattr(syllabus, 'tn_aa', None):
        return []

    rows = []
    for aa in syllabus.tn_aa:
        sec_count = len(getattr(aa, 'section_links', []) or [])
        chap_count = len(getattr(aa, 'chapter_links', []) or [])
        weight = float(sec_count) + 0.5 * float(chap_count)
        rows.append({
            'number': int(aa.number),
            'label': f"AA {int(aa.number)}",
            'description': aa.description or '',
            'sections_count': sec_count,
            'chapters_count': chap_count,
            'weight': weight,
        })

    total = sum(r['weight'] for r in rows) or 1.0
    for r in rows:
        r['percent'] = round((r['weight'] / total) * 100.0, 1)

    rows.sort(key=lambda x: (-x['percent'], x['number']))
    return rows


@courses_api_bp.route('/', methods=['GET'])
@jwt_required()
def list_courses():
    """
    Get list of courses for current user.
    Teachers: see courses they created
    Students: see enrolled courses + available courses from their teachers
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        if user.is_superuser:
            # Superusers see all courses
            courses = Course.query.order_by(Course.created_at.desc()).all()
            enrolled_courses = [{
                'id': course.id,
                'title': course.title,
                'description': course.description,
                'teacher_id': course.teacher_id,
                'created_at': course.created_at.isoformat() if course.created_at else None,
                'updated_at': course.updated_at.isoformat() if course.updated_at else None,
                'chapters_count': course.chapters.count()
            } for course in courses]

            return jsonify({
                'enrolled_courses': enrolled_courses,
                'available_courses': None,
                'user_role': 'superuser'
            }), 200
        elif user.is_teacher:
            # Teachers see courses they created
            courses = Course.query.filter_by(teacher_id=user.id).order_by(Course.created_at.desc()).all()
            enrolled_courses = [{
                'id': course.id,
                'title': course.title,
                'description': course.description,
                'teacher_id': course.teacher_id,
                'created_at': course.created_at.isoformat() if course.created_at else None,
                'updated_at': course.updated_at.isoformat() if course.updated_at else None,
                'chapters_count': course.chapters.count()
            } for course in courses]

            return jsonify({
                'enrolled_courses': enrolled_courses,
                'available_courses': None,
                'user_role': 'teacher'
            }), 200
        else:
            # Students access is governed by their Classe (class) and/or explicit enrollments.
            # - If the student belongs to a class, they automatically see:
            #   * courses assigned to their class (ClassCourseAssignment)
            #   * courses attached to their program/formation (Program.courses)
            # - We keep explicit enrollments as a fallback for older data.

            allowed_course_ids = set()

            # 1) Class-based access
            if user.class_id:
                classe = Classe.query.get(user.class_id)
                if classe:
                    # Courses assigned to class
                    for row in classe.course_assignments.all():
                        allowed_course_ids.add(int(row.course_id))

                    # Courses from program/formation
                    if classe.program_id:
                        program = Program.query.get(classe.program_id)
                        if program:
                            for c in program.courses:
                                allowed_course_ids.add(int(c.id))

            # 2) Enrollment-based fallback
            enrollments = Enrollment.query.filter_by(student_id=user.id).all()
            for e in enrollments:
                allowed_course_ids.add(int(e.course_id))

            if not allowed_course_ids:
                return jsonify({
                    'enrolled_courses': [],
                    'available_courses': [],
                    'user_role': 'student'
                }), 200

            courses = Course.query.filter(Course.id.in_(list(allowed_course_ids))).order_by(Course.created_at.desc()).all()

            enrolled_courses = [{
                'id': course.id,
                'title': course.title,
                'description': course.description,
                'teacher_id': course.teacher_id,
                'created_at': course.created_at.isoformat() if course.created_at else None,
                'updated_at': course.updated_at.isoformat() if course.updated_at else None,
                'chapters_count': course.chapters.count(),
                'teacher': {
                    'id': course.teacher.id,
                    'username': course.teacher.username,
                    'email': course.teacher.email
                }
            } for course in courses]

            return jsonify({
                'enrolled_courses': enrolled_courses,
                'available_courses': [],
                'user_role': 'student'
            }), 200

    except Exception as e:
        logger.error(f"Error listing courses: {e}")
        return jsonify({'error': str(e)}), 500


@courses_api_bp.route('/', methods=['POST'])
@jwt_required()
def create_course():
    """
    Create a new course.
    Only teachers can create courses.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Only teachers can create courses
        if not user.is_teacher:
            return jsonify({'error': 'Only teachers can create courses'}), 403

        data = request.get_json()

        # Validate required fields
        if not data or not data.get('title'):
            return jsonify({'error': 'Title is required'}), 400

        # Validate title length
        if len(data['title']) < 3 or len(data['title']) > 100:
            return jsonify({'error': 'Title must be between 3 and 100 characters'}), 400

        # Validate description length
        description = data.get('description', '')
        if description and len(description) > 500:
            return jsonify({'error': 'Description must be at most 500 characters'}), 400

        # Create course
        course = Course(
            title=data['title'],
            description=description,
            teacher_id=user.id
        )
        db.session.add(course)
        db.session.commit()

        return jsonify({
            'id': course.id,
            'title': course.title,
            'description': course.description,
            'teacher_id': course.teacher_id,
            'created_at': course.created_at.isoformat() if course.created_at else None,
            'updated_at': course.updated_at.isoformat() if course.updated_at else None
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating course: {e}")
        return jsonify({'error': str(e)}), 500


@courses_api_bp.route('/<int:course_id>', methods=['GET'])
@jwt_required()
def get_course(course_id):
    """
    Get course details.
    Returns different data for teachers vs students.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Check access - allow superusers
        if not user.is_superuser:
            is_teacher = user.is_teacher and course.teacher_id == user.id

            # Student access: class/program OR explicit enrollment
            is_student = False
            if not user.is_teacher:
                # enrollment fallback
                if Enrollment.query.filter_by(student_id=user.id, course_id=course_id).first():
                    is_student = True

                # class/program access
                if not is_student and user.class_id:
                    classe = Classe.query.get(user.class_id)
                    if classe:
                        if classe.course_assignments.filter_by(course_id=course_id).first():
                            is_student = True
                        if not is_student and classe.program_id:
                            program = Program.query.get(classe.program_id)
                            if program:
                                is_student = any(int(c.id) == int(course_id) for c in program.courses)

            if not is_teacher and not is_student:
                return jsonify({'error': "You don't have access to this course"}), 403

        # Set permissions for response
        is_teacher = user.is_superuser or (user.is_teacher and course.teacher_id == user.id)

        # Get syllabus
        syllabus = SyllabusService.get_syllabus_by_course(course_id)

        # TN: compute AA importance distribution
        tn_aa_distribution = []
        try:
            if syllabus and (syllabus.syllabus_type or '').lower() == 'tn':
                tn_aa_distribution = _compute_tn_aa_distribution(syllabus)
        except Exception as e:
            logger.error(f"Error computing TN AA distribution: {e}")
            tn_aa_distribution = []

        # Chapters
        chapters = course.chapters.order_by(Chapter.order).all()
        chapters_list = [{
            'id': chapter.id,
            'title': chapter.title,
            'order': chapter.order,
            'course_id': chapter.course_id,
            'created_at': chapter.created_at.isoformat() if chapter.created_at else None,
            'updated_at': chapter.updated_at.isoformat() if chapter.updated_at else None,
            'documents_count': chapter.documents.count(),
            'has_summary': chapter.has_summary()
        } for chapter in chapters]

        # Module-level attachments
        module_attachments = Document.query.filter_by(
            course_id=course_id,
            chapter_id=None,
            week_number=None,
            document_type='module_attachment'
        ).order_by(Document.created_at.desc()).all()

        module_attachments_list = [{
            'id': doc.id,
            'title': doc.title,
            'file_path': doc.file_path,
            'file_type': doc.file_type,
            'created_at': doc.created_at.isoformat() if doc.created_at else None
        } for doc in module_attachments]

        # Course quizzes
        course_quizzes_raw = Document.query.filter_by(
            course_id=course_id,
            document_type='quiz',
            week_number=None
        ).order_by(Document.created_at.desc()).all()

        # Build response
        response_data = {
            'course': {
                'id': course.id,
                'title': course.title,
                'description': course.description,
                'teacher_id': course.teacher_id,
                'created_at': course.created_at.isoformat() if course.created_at else None,
                'updated_at': course.updated_at.isoformat() if course.updated_at else None,
                'teacher': {
                    'id': course.teacher.id,
                    'username': course.teacher.username,
                    'email': course.teacher.email
                },
                'can_edit': is_teacher
            },
            'syllabus': {
                'id': syllabus.id,
                'syllabus_type': syllabus.syllabus_type,
                'file_path': syllabus.file_path,
                'created_at': syllabus.created_at.isoformat() if syllabus.created_at else None
            } if syllabus else None,
            'chapters': chapters_list,
            'module_attachments': module_attachments_list,
            'tn_aa_distribution': tn_aa_distribution
        }

        if is_teacher:
            # Teacher view
            response_data['course_quizzes'] = [{
                'id': doc.id,
                'title': doc.title,
                'created_at': doc.created_at.isoformat() if doc.created_at else None,
                'quiz_data': doc.quiz_data,
                'chapter_id': doc.chapter_id,
            } for doc in course_quizzes_raw]
        else:
            # Student view with quiz status
            course_quizzes = []
            student_progress = {
                'quizzes_completed': 0,
                'quizzes_total': len(course_quizzes_raw),
                'assignments_submitted': 0,
                'assignments_total': 0
            }

            for quiz_doc in course_quizzes_raw:
                student_quiz = Quiz.query.filter_by(
                    document_id=quiz_doc.id,
                    student_id=user.id
                ).first()

                quiz_info = {
                    'document': {
                        'id': quiz_doc.id,
                        'title': quiz_doc.title,
                        'created_at': quiz_doc.created_at.isoformat() if quiz_doc.created_at else None
                    },
                    'student_completed': False,
                    'student_score': None,
                    'quiz_id': None
                }

                if student_quiz:
                    quiz_info['quiz_id'] = student_quiz.id
                    if student_quiz.completed_at is not None:
                        quiz_info['student_completed'] = True
                        quiz_info['student_score'] = student_quiz.score
                        student_progress['quizzes_completed'] += 1

                course_quizzes.append(quiz_info)

            response_data['course_quizzes'] = course_quizzes
            response_data['student_progress'] = student_progress

        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Error getting course: {e}")
        return jsonify({'error': str(e)}), 500


@courses_api_bp.route('/<int:course_id>/chapters', methods=['GET'])
@jwt_required()
def list_course_chapters(course_id):
    """
    Get list of chapters for a course.
    Returns chapters ordered by their order field.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Access control (with superuser support)
        if not user.is_superuser:
            is_teacher = user.is_teacher and course.teacher_id == user.id
            is_student = not user.is_teacher and Enrollment.query.filter_by(
                student_id=user.id, course_id=course_id).first()

            if not is_teacher and not is_student:
                return jsonify({'error': 'Access denied'}), 403

        # Get chapters
        chapters = course.chapters.order_by(Chapter.order).all()
        chapters_list = [{
            'id': c.id,
            'title': c.title,
            'summary': c.summary,
            'order': c.order,
            'course_id': c.course_id,
            'created_at': c.created_at.isoformat() if c.created_at else None,
            'updated_at': c.updated_at.isoformat() if c.updated_at else None,
            'has_summary': c.has_summary(),
            'documents_count': c.documents.count()
        } for c in chapters]

        return jsonify({
            'chapters': chapters_list,
            'total': len(chapters_list)
        }), 200

    except Exception as e:
        logger.error(f"Error listing course chapters: {e}")
        return jsonify({'error': str(e)}), 500


@courses_api_bp.route('/<int:course_id>', methods=['PUT'])
@jwt_required()
def update_course(course_id):
    """
    Update a course.
    Only the teacher who created the course can update it.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Only the teacher who created the course can edit it
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()

        # Validate title if provided
        if 'title' in data:
            if len(data['title']) < 3 or len(data['title']) > 100:
                return jsonify({'error': 'Title must be between 3 and 100 characters'}), 400
            course.title = data['title']

        # Validate description if provided
        if 'description' in data:
            if data['description'] and len(data['description']) > 500:
                return jsonify({'error': 'Description must be at most 500 characters'}), 400
            course.description = data['description']

        db.session.commit()

        return jsonify({
            'id': course.id,
            'title': course.title,
            'description': course.description,
            'teacher_id': course.teacher_id,
            'created_at': course.created_at.isoformat() if course.created_at else None,
            'updated_at': course.updated_at.isoformat() if course.updated_at else None
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating course: {e}")
        return jsonify({'error': str(e)}), 500


@courses_api_bp.route('/<int:course_id>', methods=['DELETE'])
@jwt_required()
def delete_course(course_id):
    """
    Delete a course.
    Only the teacher who created the course can delete it.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Only the teacher who created the course can delete it
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        title = course.title
        db.session.delete(course)
        db.session.commit()

        return jsonify({'message': f'Course "{title}" has been deleted'}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting course: {e}")
        return jsonify({'error': str(e)}), 500


@courses_api_bp.route('/<int:course_id>/enroll', methods=['POST'])
@jwt_required()
def enroll_course(course_id):
    """
    Enroll in a course.
    Only students can enroll, and they must be associated with the teacher.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Only students can enroll in courses
        if user.is_teacher:
            return jsonify({'error': 'Teachers cannot enroll in courses'}), 403

        course = Course.query.get_or_404(course_id)
        teacher = User.query.get(course.teacher_id)

        if not teacher:
            return jsonify({'error': 'Course has no assigned teacher'}), 400

        # Check if the student is associated with the teacher
        is_associated = False
        try:
            # Try using the relationship method if available
            if hasattr(teacher, 'has_student'):
                is_associated = teacher.has_student(user)

            # If relationship check fails, try a direct query to the association table
            if not is_associated:
                result = db.session.execute(text(
                    "SELECT 1 FROM teacher_student WHERE teacher_id = :teacher_id AND student_id = :student_id"
                ), {"teacher_id": teacher.id, "student_id": user.id}).fetchone()

                is_associated = result is not None

            if not is_associated:
                return jsonify({'error': 'You cannot enroll in this course. Please contact the teacher.'}), 403
        except Exception as e:
            logger.error(f"Error checking teacher-student relationship: {e}")
            return jsonify({'error': 'Error checking enrollment eligibility'}), 500

        # Check if already enrolled
        existing_enrollment = Enrollment.query.filter_by(
            student_id=user.id,
            course_id=course_id
        ).first()

        if existing_enrollment:
            return jsonify({'message': f'You are already enrolled in "{course.title}"'}), 200

        # Create enrollment
        enrollment = Enrollment(
            student_id=user.id,
            course_id=course_id
        )
        db.session.add(enrollment)
        db.session.commit()

        return jsonify({
            'message': f'You have successfully enrolled in "{course.title}"',
            'enrollment': {
                'id': enrollment.id,
                'student_id': enrollment.student_id,
                'course_id': enrollment.course_id,
                'enrolled_at': enrollment.enrolled_at.isoformat() if enrollment.enrolled_at else None
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error enrolling in course: {e}")
        return jsonify({'error': str(e)}), 500


@courses_api_bp.route('/<int:course_id>/upload-module', methods=['POST'])
@jwt_required()
def upload_module_attachment(course_id):
    """
    Upload a module-level file (not attached to a specific chapter).
    Only the teacher who created the course can upload.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        if not user.is_teacher or course.teacher_id != user.id:
            return jsonify({'error': 'Access denied. Teachers only.'}), 403

        # Validate form data
        if 'title' not in request.form:
            return jsonify({'error': 'Title is required'}), 400

        if 'file' not in request.files:
            return jsonify({'error': 'File is required'}), 400

        title = request.form['title']
        if len(title) < 3 or len(title) > 100:
            return jsonify({'error': 'Title must be between 3 and 100 characters'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file type
        allowed_extensions = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'zip', 'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv']
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        if ext not in allowed_extensions:
            return jsonify({'error': 'Invalid file type'}), 400

        # Save file
        uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
        os.makedirs(uploads_dir, exist_ok=True)
        unique_name = f"course_{course_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{filename}"
        full_path = os.path.join(uploads_dir, unique_name)
        file.save(full_path)

        # Create document record
        doc = Document(
            title=title,
            file_path=unique_name,
            file_type=ext,
            document_type='module_attachment',
            course_id=course_id
        )
        db.session.add(doc)
        db.session.commit()

        # Trigger document processing for PDFs
        processing_status = 'uploaded'
        if ext == 'pdf':
            try:
                from app.services.document_pipeline import process_pdf_document
                process_pdf_document(
                    pdf_path=full_path,
                    document_id=doc.id,
                    document_name=filename,
                    extract_images=True
                )
                processing_status = 'processed'
            except Exception as e:
                current_app.logger.error(f"Error processing document {doc.id}: {e}")
                processing_status = 'processing_failed'

        return jsonify({
            'message': 'Module file uploaded successfully',
            'document': {
                'id': doc.id,
                'title': doc.title,
                'file_path': doc.file_path,
                'file_type': doc.file_type,
                'created_at': doc.created_at.isoformat() if doc.created_at else None
            },
            'processing_status': processing_status
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading module attachment: {e}")
        return jsonify({'error': str(e)}), 500


# Helper functions for dashboard endpoint

def _compute_bloom_distribution(course_id):
    """Compute bloom taxonomy distribution from approved questions"""
    try:
        results = db.session.query(
            QuestionBankQuestion.bloom_level,
            func.count(QuestionBankQuestion.id)
        ).filter(
            QuestionBankQuestion.course_id == course_id,
            QuestionBankQuestion.approved_at.isnot(None)
        ).group_by(QuestionBankQuestion.bloom_level).all()

        total = sum(count for _, count in results)
        if total == 0:
            return []

        return [
            {
                'level': level or 'unknown',
                'count': count,
                'percent': round((count / total * 100), 1)
            }
            for level, count in results
        ]
    except Exception as e:
        logger.error(f"Error computing bloom distribution: {e}")
        return []


def _compute_difficulty_distribution(course_id):
    """Compute difficulty level distribution from approved questions"""
    try:
        results = db.session.query(
            QuestionBankQuestion.difficulty,
            func.count(QuestionBankQuestion.id)
        ).filter(
            QuestionBankQuestion.course_id == course_id,
            QuestionBankQuestion.approved_at.isnot(None)
        ).group_by(QuestionBankQuestion.difficulty).all()

        total = sum(count for _, count in results)
        if total == 0:
            return []

        return [
            {
                'level': difficulty or 'unknown',
                'count': count,
                'percent': round((count / total * 100), 1)
            }
            for difficulty, count in results
        ]
    except Exception as e:
        logger.error(f"Error computing difficulty distribution: {e}")
        return []


def _compute_aaa_distribution(course_id):
    """Compute AAA/CLO distribution from approved questions"""
    try:
        # Get all approved questions with CLO field
        questions = QuestionBankQuestion.query.filter(
            QuestionBankQuestion.course_id == course_id,
            QuestionBankQuestion.approved_at.isnot(None),
            QuestionBankQuestion.clo.isnot(None)
        ).all()

        if not questions:
            return []

        # Parse CLO field and count occurrences
        aaa_counts = {}
        for q in questions:
            if not q.clo:
                continue

            # Split by common delimiters (comma, semicolon, etc.)
            import re
            aaa_codes = re.split(r'[,;|]', q.clo)

            for aaa in aaa_codes:
                aaa = aaa.strip()
                if aaa:
                    # Normalize AAA code (e.g., "AAA1", "AA1", "A1" -> "AAA1")
                    normalized = aaa.upper()
                    if normalized.startswith('AAA'):
                        code = normalized
                    elif normalized.startswith('AA'):
                        code = 'A' + normalized
                    elif normalized.startswith('A'):
                        code = 'AA' + normalized
                    else:
                        code = 'AAA' + normalized

                    aaa_counts[code] = aaa_counts.get(code, 0) + 1

        if not aaa_counts:
            return []

        total = sum(aaa_counts.values())

        return sorted(
            [
                {
                    'code': code,
                    'count': count,
                    'percent': round((count / total * 100), 1)
                }
                for code, count in aaa_counts.items()
            ],
            key=lambda x: (-x['percent'], x['code'])
        )
    except Exception as e:
        logger.error(f"Error computing AAA distribution: {e}")
        return []


def _compute_chapter_stats(course_id):
    """Compute per-chapter question counts"""
    try:
        chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).all()

        return [
            {
                'chapter_id': ch.id,
                'chapter_title': ch.title,
                'chapter_order': ch.order,
                'total_questions': QuestionBankQuestion.query.filter_by(
                    course_id=course_id,
                    chapter_id=ch.id
                ).count(),
                'approved_questions': QuestionBankQuestion.query.filter_by(
                    course_id=course_id,
                    chapter_id=ch.id
                ).filter(QuestionBankQuestion.approved_at.isnot(None)).count()
            }
            for ch in chapters
        ]
    except Exception as e:
        logger.error(f"Error computing chapter stats: {e}")
        return []


@courses_api_bp.route('/<int:course_id>/dashboard', methods=['GET'])
@jwt_required()
def get_course_dashboard(course_id):
    """
    Get comprehensive course statistics and question bank analytics

    Returns:
        200: Course dashboard with statistics
        403: If user is not the course teacher or superuser
        404: Course not found
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Check ownership (teacher or superuser)
        if course.teacher_id != user.id and not user.is_superuser:
            return jsonify({'error': 'Access denied'}), 403

        # Compute basic stats
        stats = {
            'students_enrolled': Enrollment.query.filter_by(course_id=course_id).count(),
            'chapters_count': course.chapters.count(),
            'question_bank_total': QuestionBankQuestion.query.filter_by(course_id=course_id).count(),
            'question_bank_approved': QuestionBankQuestion.query.filter_by(
                course_id=course_id
            ).filter(QuestionBankQuestion.approved_at.isnot(None)).count()
        }
        stats['question_bank_pending'] = stats['question_bank_total'] - stats['question_bank_approved']

        # Compute distributions
        bloom_dist = _compute_bloom_distribution(course_id)
        difficulty_dist = _compute_difficulty_distribution(course_id)
        aaa_dist = _compute_aaa_distribution(course_id)
        chapter_stats = _compute_chapter_stats(course_id)

        # Compute exam stats for this course
        from app.models import CourseExam
        from app.api.v1.dashboards import _compute_exam_stats
        exam_stats = _compute_exam_stats([course_id])

        return jsonify({
            'course': {
                'id': course.id,
                'title': course.title,
                'description': course.description,
                'created_at': course.created_at.isoformat() if course.created_at else None
            },
            'stats': stats,
            'bloom_distribution': bloom_dist,
            'difficulty_distribution': difficulty_dist,
            'aaa_distribution': aaa_dist,
            'question_bank_by_chapter': chapter_stats,
            'exam_stats': exam_stats,
        }), 200

    except Exception as e:
        logger.error(f"Error fetching course dashboard: {e}")
        return jsonify({'error': str(e)}), 500
