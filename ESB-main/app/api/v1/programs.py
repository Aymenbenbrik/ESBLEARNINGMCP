"""
Programs API v1
RESTful endpoints for program management, course associations, and class creation
"""

import os
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from app import db
from app.models import Program, Classe, Course, User, ClassCourseAssignment
from app.models.program_learning import ProgramAAP, ProgramCompetence, aap_competence_link, AAAapLink
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
                    'code': p.code,
                    'description': p.description,
                    'program_type': p.program_type,
                    'descriptor_file': p.descriptor_file,
                    'study_plan_file': p.study_plan_file,
                    'created_at': p.created_at.isoformat() if p.created_at else None,
                    'courses_count': p.courses_count,
                    'classes_count': p.classes.count(),
                    'aaps_count': p.aaps.count() if hasattr(p, 'aaps') else 0,
                    'competences_count': p.competences.count() if hasattr(p, 'competences') else 0,
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
            code=data.get('code', '').strip() or None,
            description=data.get('description', '').strip(),
            program_type=data.get('program_type', '').strip() or None,
        )
        db.session.add(program)
        db.session.commit()

        logger.info(f"Program created: {program.id} - {program.name}")

        return jsonify({
            'message': 'Program created successfully',
            'program': {
                'id': program.id,
                'name': program.name,
                'code': program.code,
                'description': program.description,
                'program_type': program.program_type,
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

        # Get AAP
        aaps_data = [aap.to_dict() for aap in program.aaps.order_by(ProgramAAP.order).all()]

        # Get Competences
        competences_data = [comp.to_dict() for comp in program.competences.all()]

        return jsonify({
            'program': {
                'id': program.id,
                'name': program.name,
                'code': program.code,
                'description': program.description,
                'program_type': program.program_type,
                'descriptor_file': program.descriptor_file,
                'descriptor_uploaded_at': program.descriptor_uploaded_at.isoformat() if program.descriptor_uploaded_at else None,
                'study_plan_file': program.study_plan_file,
                'study_plan_uploaded_at': program.study_plan_uploaded_at.isoformat() if program.study_plan_uploaded_at else None,
                'created_at': program.created_at.isoformat() if program.created_at else None,
                'courses_count': len(courses_data),
                'classes_count': len(classes_data),
                'courses': courses_data,
                'classes': classes_data,
                'aaps': aaps_data,
                'competences': competences_data,
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

        # Update program_type if provided
        if 'program_type' in data:
            program.program_type = data['program_type'].strip() or None

        # Update code if provided
        if 'code' in data:
            code = data['code'].strip() or None
            if code:
                existing_code = Program.query.filter(
                    Program.code == code,
                    Program.id != program_id
                ).first()
                if existing_code:
                    return jsonify({'error': f'Program with code "{code}" already exists'}), 400
            program.code = code

        db.session.commit()

        logger.info(f"Program updated: {program.id} - {program.name}")

        return jsonify({
            'message': 'Program updated successfully',
            'program': {
                'id': program.id,
                'name': program.name,
                'code': program.code,
                'description': program.description,
                'program_type': program.program_type,
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

        # Clean up AAP/competence data
        AAAapLink.query.filter(
            AAAapLink.aap_id.in_(
                db.session.query(ProgramAAP.id).filter_by(program_id=program_id)
            )
        ).delete(synchronize_session='fetch')

        db.session.execute(
            aap_competence_link.delete().where(
                aap_competence_link.c.aap_id.in_(
                    db.session.query(ProgramAAP.id).filter_by(program_id=program_id)
                )
            )
        )

        ProgramAAP.query.filter_by(program_id=program_id).delete()
        ProgramCompetence.query.filter_by(program_id=program_id).delete()

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


# ─── Descriptor Upload & Extraction ─────────────────────────────────────────

@programs_api_bp.route('/<int:program_id>/upload-descriptor', methods=['POST'])
@jwt_required()
@superuser_required
def upload_descriptor(program_id):
    """Upload a .docx formation descriptor file."""
    program = Program.query.get_or_404(program_id)

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename or not file.filename.lower().endswith('.docx'):
        return jsonify({'error': 'Only .docx files are accepted'}), 400

    try:
        uploads_dir = current_app.config.get('UPLOAD_FOLDER', 'uploads')
        program_dir = os.path.join(uploads_dir, 'programs', str(program_id))
        os.makedirs(program_dir, exist_ok=True)

        filename = secure_filename(file.filename)
        file_path = os.path.join(program_dir, filename)
        file.save(file_path)

        rel_path = os.path.join('programs', str(program_id), filename)
        program.descriptor_file = rel_path
        program.descriptor_uploaded_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'message': 'Descriptor uploaded successfully',
            'descriptor_file': rel_path,
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading descriptor: {e}")
        return jsonify({'error': str(e)}), 500


ALLOWED_STUDY_PLAN_EXTENSIONS = {'.zip', '.pdf', '.docx'}


@programs_api_bp.route('/<int:program_id>/upload-study-plan', methods=['POST'])
@jwt_required()
@superuser_required
def upload_study_plan(program_id):
    """Upload a study plan file (.zip, .pdf, or .docx)."""
    program = Program.query.get_or_404(program_id)

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_STUDY_PLAN_EXTENSIONS:
        return jsonify({'error': 'Only .zip, .pdf, or .docx files are accepted'}), 400

    try:
        uploads_dir = current_app.config.get('UPLOAD_FOLDER', 'uploads')
        study_plan_dir = os.path.join(uploads_dir, 'programs', str(program_id), 'study-plan')
        os.makedirs(study_plan_dir, exist_ok=True)

        filename = secure_filename(file.filename)
        file_path = os.path.join(study_plan_dir, filename)
        file.save(file_path)

        rel_path = os.path.join('programs', str(program_id), 'study-plan', filename)
        program.study_plan_file = rel_path
        program.study_plan_uploaded_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'message': 'Study plan uploaded successfully',
            'study_plan_file': rel_path,
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading study plan: {e}")
        return jsonify({'error': str(e)}), 500


@programs_api_bp.route('/<int:program_id>/extract-syllabi', methods=['POST'])
@jwt_required()
@superuser_required
def extract_syllabi(program_id):
    """Extract syllabi for all courses in this program using uploaded course documents."""
    program = Program.query.get_or_404(program_id)

    results = []
    for course in program.courses:
        try:
            from app.models.syllabus import Syllabus
            existing = Syllabus.query.filter_by(course_id=course.id).first()

            from app.models.documents import Document
            docs = Document.query.filter_by(course_id=course.id).all()
            pdf_docs = [d for d in docs if d.file_path and d.file_path.lower().endswith('.pdf')]

            if not pdf_docs:
                results.append({
                    'course_id': course.id,
                    'course_title': course.title,
                    'status': 'skipped',
                    'reason': 'No PDF documents found'
                })
                continue

            uploads_dir = current_app.config.get('UPLOAD_FOLDER', 'uploads')
            pdf_path = os.path.join(uploads_dir, pdf_docs[0].file_path)

            if not os.path.exists(pdf_path):
                results.append({
                    'course_id': course.id,
                    'course_title': course.title,
                    'status': 'error',
                    'reason': 'PDF file not found on disk'
                })
                continue

            from app.services.syllabus_tn_service import SyllabusTNService
            tn_service = SyllabusTNService()

            if not existing:
                existing = Syllabus(course_id=course.id, syllabus_type='tn')
                db.session.add(existing)
                db.session.flush()

            from app.services.syllabus_tn_service import extract_aap_from_pdf
            aap_data = extract_aap_from_pdf(pdf_path)

            results.append({
                'course_id': course.id,
                'course_title': course.title,
                'status': 'success',
                'syllabus_id': existing.id,
                'aap_extracted': len(aap_data) if aap_data else 0,
            })
        except Exception as e:
            logger.error(f"Error extracting syllabus for course {course.id}: {e}")
            results.append({
                'course_id': course.id,
                'course_title': course.title,
                'status': 'error',
                'reason': str(e)
            })

    db.session.commit()

    return jsonify({
        'message': f'Syllabus extraction completed for {len(results)} courses',
        'results': results,
        'summary': {
            'total': len(results),
            'success': len([r for r in results if r['status'] == 'success']),
            'skipped': len([r for r in results if r['status'] == 'skipped']),
            'error': len([r for r in results if r['status'] == 'error']),
        }
    }), 200


@programs_api_bp.route('/<int:program_id>/extract-descriptor', methods=['POST'])
@jwt_required()
@superuser_required
def extract_descriptor(program_id):
    """Extract AAP, competences, and matrix from the uploaded descriptor."""
    program = Program.query.get_or_404(program_id)

    if not program.descriptor_file:
        return jsonify({'error': 'No descriptor file uploaded. Please upload first.'}), 400

    uploads_dir = current_app.config.get('UPLOAD_FOLDER', 'uploads')
    full_path = os.path.join(uploads_dir, program.descriptor_file)

    if not os.path.exists(full_path):
        return jsonify({'error': 'Descriptor file not found on server'}), 404

    try:
        from app.services.program_extraction_service import extract_program_descriptor, save_extracted_data

        extracted = extract_program_descriptor(full_path, program_id)
        if extracted.get('error'):
            return jsonify({'error': extracted['error']}), 400

        result = save_extracted_data(program_id, extracted)

        return jsonify({
            'message': 'Extraction completed successfully',
            'result': result,
            'extracted': {
                'aaps': extracted.get('aaps', []),
                'competences': extracted.get('competences', []),
                'matrix': extracted.get('matrix', []),
                'study_plan': extracted.get('study_plan', []),
            },
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error extracting descriptor: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@programs_api_bp.route('/<int:program_id>/process-descriptor', methods=['POST'])
@jwt_required()
@superuser_required
def process_descriptor(program_id):
    """
    Full agentic AI pipeline: extract all data from descriptor,
    create courses, teachers, and link everything.
    """
    program = Program.query.get_or_404(program_id)

    if not program.descriptor_file:
        return jsonify({'error': 'No descriptor file uploaded. Please upload first.'}), 400

    uploads_dir = current_app.config.get('UPLOAD_FOLDER', 'uploads')
    full_path = os.path.join(uploads_dir, program.descriptor_file)

    if not os.path.exists(full_path):
        return jsonify({'error': 'Descriptor file not found on server'}), 404

    try:
        from app.services.program_extraction_service import process_program_descriptor
        result = process_program_descriptor(program_id, full_path)
        return jsonify({
            'message': 'Pipeline completed successfully',
            **result,
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in pipeline: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


# ─── AAP CRUD ───────────────────────────────────────────────────────────────

@programs_api_bp.route('/<int:program_id>/aap', methods=['GET'])
@jwt_required()
def list_aaps(program_id):
    """List all AAP for a program."""
    Program.query.get_or_404(program_id)
    aaps = ProgramAAP.query.filter_by(program_id=program_id).order_by(ProgramAAP.order).all()
    return jsonify({'aaps': [a.to_dict() for a in aaps]}), 200


@programs_api_bp.route('/<int:program_id>/aap', methods=['POST'])
@jwt_required()
@superuser_required
def create_aap(program_id):
    """Create a new AAP."""
    Program.query.get_or_404(program_id)
    data = request.get_json()

    code = data.get('code', '').strip()
    description = data.get('description', '').strip()
    if not code or not description:
        return jsonify({'error': 'code and description are required'}), 400

    existing = ProgramAAP.query.filter_by(program_id=program_id, code=code).first()
    if existing:
        return jsonify({'error': f'AAP with code "{code}" already exists'}), 400

    aap = ProgramAAP(
        program_id=program_id, code=code, description=description,
        order=data.get('order', 0),
    )
    db.session.add(aap)
    db.session.commit()
    return jsonify({'message': 'AAP created', 'aap': aap.to_dict()}), 201


@programs_api_bp.route('/<int:program_id>/aap/<int:aap_id>', methods=['PUT'])
@jwt_required()
@superuser_required
def update_aap(program_id, aap_id):
    """Update an AAP."""
    aap = ProgramAAP.query.filter_by(id=aap_id, program_id=program_id).first_or_404()
    data = request.get_json()

    if 'code' in data:
        aap.code = data['code'].strip()
    if 'description' in data:
        aap.description = data['description'].strip()
    if 'order' in data:
        aap.order = data['order']

    db.session.commit()
    return jsonify({'message': 'AAP updated', 'aap': aap.to_dict()}), 200


@programs_api_bp.route('/<int:program_id>/aap/<int:aap_id>', methods=['DELETE'])
@jwt_required()
@superuser_required
def delete_aap(program_id, aap_id):
    """Delete an AAP."""
    aap = ProgramAAP.query.filter_by(id=aap_id, program_id=program_id).first_or_404()
    db.session.delete(aap)
    db.session.commit()
    return jsonify({'message': 'AAP deleted'}), 200


# ─── Competences CRUD ───────────────────────────────────────────────────────

@programs_api_bp.route('/<int:program_id>/competences', methods=['GET'])
@jwt_required()
def list_competences(program_id):
    """List all competences for a program."""
    Program.query.get_or_404(program_id)
    comps = ProgramCompetence.query.filter_by(program_id=program_id).all()
    return jsonify({'competences': [c.to_dict() for c in comps]}), 200


@programs_api_bp.route('/<int:program_id>/competences', methods=['POST'])
@jwt_required()
@superuser_required
def create_competence(program_id):
    """Create a new competence."""
    Program.query.get_or_404(program_id)
    data = request.get_json()

    code = data.get('code', '').strip()
    description = data.get('description', '').strip()
    if not code or not description:
        return jsonify({'error': 'code and description are required'}), 400

    existing = ProgramCompetence.query.filter_by(program_id=program_id, code=code).first()
    if existing:
        return jsonify({'error': f'Competence with code "{code}" already exists'}), 400

    comp = ProgramCompetence(program_id=program_id, code=code, description=description)
    db.session.add(comp)
    db.session.commit()
    return jsonify({'message': 'Competence created', 'competence': comp.to_dict()}), 201


@programs_api_bp.route('/<int:program_id>/competences/<int:comp_id>', methods=['PUT'])
@jwt_required()
@superuser_required
def update_competence(program_id, comp_id):
    """Update a competence."""
    comp = ProgramCompetence.query.filter_by(id=comp_id, program_id=program_id).first_or_404()
    data = request.get_json()

    if 'code' in data:
        comp.code = data['code'].strip()
    if 'description' in data:
        comp.description = data['description'].strip()

    db.session.commit()
    return jsonify({'message': 'Competence updated', 'competence': comp.to_dict()}), 200


@programs_api_bp.route('/<int:program_id>/competences/<int:comp_id>', methods=['DELETE'])
@jwt_required()
@superuser_required
def delete_competence(program_id, comp_id):
    """Delete a competence."""
    comp = ProgramCompetence.query.filter_by(id=comp_id, program_id=program_id).first_or_404()
    db.session.delete(comp)
    db.session.commit()
    return jsonify({'message': 'Competence deleted'}), 200


# ─── AAP ↔ Competence Matrix ────────────────────────────────────────────────

@programs_api_bp.route('/<int:program_id>/aap-competence-matrix', methods=['GET'])
@jwt_required()
def get_aap_competence_matrix(program_id):
    """Get the AAP ↔ Competence relationship matrix."""
    Program.query.get_or_404(program_id)

    aaps = ProgramAAP.query.filter_by(program_id=program_id).order_by(ProgramAAP.order).all()
    comps = ProgramCompetence.query.filter_by(program_id=program_id).all()

    matrix = []
    for comp in comps:
        linked_aap_ids = {a.id for a in comp.aaps}
        matrix.append({
            'competence': comp.to_dict(),
            'aap_links': [aap.id in linked_aap_ids for aap in aaps],
        })

    return jsonify({
        'aaps': [a.to_dict() for a in aaps],
        'competences': [c.to_dict() for c in comps],
        'matrix': matrix,
    }), 200


@programs_api_bp.route('/<int:program_id>/aap-competence-matrix', methods=['PUT'])
@jwt_required()
@superuser_required
def update_aap_competence_matrix(program_id):
    """Update the AAP ↔ Competence matrix.

    Body: { "links": [{"competence_id": 1, "aap_ids": [1, 3, 5]}, ...] }
    """
    Program.query.get_or_404(program_id)
    data = request.get_json()
    links = data.get('links', [])

    try:
        for entry in links:
            comp_id = entry.get('competence_id')
            aap_ids = entry.get('aap_ids', [])

            comp = ProgramCompetence.query.filter_by(id=comp_id, program_id=program_id).first()
            if not comp:
                continue

            comp.aaps = []
            for aap_id in aap_ids:
                aap = ProgramAAP.query.filter_by(id=aap_id, program_id=program_id).first()
                if aap:
                    comp.aaps.append(aap)

        db.session.commit()
        return jsonify({'message': 'Matrix updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating matrix: {e}")
        return jsonify({'error': str(e)}), 500


# ── AA ↔ AAP Mapping per course/syllabus ──────────────────────────────────

@programs_api_bp.route('/courses/<int:course_id>/aa-aap-mapping', methods=['GET'])
@jwt_required()
def get_aa_aap_mapping(course_id):
    """Get the AA↔AAP mapping for a course's syllabus."""
    from app.models.courses import Course
    from app.models.syllabus import Syllabus
    from app.models.syllabus_tn import TNAA

    course = Course.query.get_or_404(course_id)
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus:
        return jsonify({'mapping': [], 'aaps': [], 'aas': []}), 200

    aas = TNAA.query.filter_by(syllabus_id=syllabus.id).order_by(TNAA.number).all()
    # Get program AAPs for this course's program(s)
    program_ids = [p.id for p in course.programs] if hasattr(course, 'programs') else []
    if not program_ids:
        return jsonify({'mapping': [], 'aaps': [], 'aas': [{'number': a.number, 'description': a.description} for a in aas]}), 200

    aaps = ProgramAAP.query.filter(ProgramAAP.program_id.in_(program_ids)).order_by(ProgramAAP.order).all()
    links = AAAapLink.query.filter_by(syllabus_id=syllabus.id).all()
    link_set = {(lk.aa_id, lk.aap_id) for lk in links}

    return jsonify({
        'aas': [{'id': a.id, 'number': a.number, 'description': a.description} for a in aas],
        'aaps': [{'id': a.id, 'code': a.code, 'description': a.description} for a in aaps],
        'mapping': [{'aa_id': a.id, 'aap_id': p.id, 'linked': (a.id, p.id) in link_set} for a in aas for p in aaps],
    }), 200


@programs_api_bp.route('/courses/<int:course_id>/aa-aap-mapping', methods=['PUT'])
@jwt_required()
def update_aa_aap_mapping(course_id):
    """Update the AA↔AAP mapping for a course's syllabus."""
    from app.models.courses import Course
    from app.models.syllabus import Syllabus

    course = Course.query.get_or_404(course_id)
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus:
        return jsonify({'error': 'No syllabus found'}), 404

    data = request.get_json()
    links_data = data.get('links', [])  # [{"aa_id": 1, "aap_id": 2}, ...]

    try:
        # Delete existing links for this syllabus
        AAAapLink.query.filter_by(syllabus_id=syllabus.id).delete()
        # Create new links
        for link in links_data:
            new_link = AAAapLink(
                aa_id=link['aa_id'],
                aap_id=link['aap_id'],
                syllabus_id=syllabus.id,
            )
            db.session.add(new_link)
        db.session.commit()
        return jsonify({'message': 'Mapping updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating AA↔AAP mapping: {e}")
        return jsonify({'error': str(e)}), 500