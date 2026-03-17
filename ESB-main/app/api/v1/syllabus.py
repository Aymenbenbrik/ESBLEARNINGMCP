from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from datetime import datetime
from app import db
from app.models import User, Course, Syllabus, Enrollment, Chapter
import logging
import os

logger = logging.getLogger(__name__)

syllabus_api_bp = Blueprint('syllabus_api', __name__, url_prefix='/syllabus')


def _serialize_tn_syllabus(syllabus):
    """Serialize TN syllabus normalized ORM data to a dict for the frontend."""
    result = {}

    # Administrative info
    if syllabus.tn_admin:
        adm = syllabus.tn_admin
        result['administrative'] = {
            'module_name': adm.module_name,
            'code_ue': adm.code_ue,
            'code_ecue': adm.code_ecue,
            'field': adm.field,
            'department': adm.department,
            'option': adm.option,
            'volume_presentiel': adm.volume_presentiel,
            'volume_personnel': adm.volume_personnel,
            'coefficient': adm.coefficient,
            'credits': adm.credits,
            'responsible': adm.responsible,
            'teachers': adm.teachers or [],
        }

    # AA — Acquis d'Apprentissage
    result['aa'] = [
        {'number': aa.number, 'description': aa.description}
        for aa in sorted(syllabus.tn_aa, key=lambda x: x.number)
    ]

    # AAP — selected assessment methods
    result['aap'] = [
        {'number': aap.number, 'selected': aap.selected}
        for aap in sorted(syllabus.tn_aap, key=lambda x: x.number)
        if aap.selected
    ]

    # Build AA lookup for chapter/section links
    aa_lookup = {aa.number: aa.description for aa in syllabus.tn_aa}
    aa_id_to_num = {aa.id: aa.number for aa in syllabus.tn_aa}

    # Chapters with sections and AA links
    chapters = []
    for ch in sorted(syllabus.tn_chapters, key=lambda x: x.index):
        ch_aa = [
            {
                'aa_number': aa_id_to_num.get(link.aa_id, 0),
                'aa_description': aa_lookup.get(aa_id_to_num.get(link.aa_id, 0), ''),
                'description_override': link.description_override,
            }
            for link in ch.aa_links
        ]
        sections = []
        for sec in sorted(ch.sections, key=lambda x: str(x.index)):
            sec_aa = [
                {
                    'aa_number': aa_id_to_num.get(link.aa_id, 0),
                    'aa_description': aa_lookup.get(aa_id_to_num.get(link.aa_id, 0), ''),
                    'description_override': link.description_override,
                }
                for link in sec.aa_links
            ]
            sections.append({
                'index': sec.index,
                'title': sec.title,
                'aa_links': sec_aa,
            })
        chapters.append({
            'index': ch.index,
            'title': ch.title,
            'aa_links': ch_aa,
            'sections': sections,
        })
    result['chapters'] = chapters

    # Evaluation
    if syllabus.tn_evaluation:
        ev = syllabus.tn_evaluation
        result['evaluation'] = {
            'methods': ev.methods or [],
            'criteria': ev.criteria or [],
            'measures': ev.measures or [],
            'final_grade_formula': ev.final_grade_formula,
        }

    # Bibliography
    result['bibliography'] = [
        {'position': bib.position, 'entry': bib.entry}
        for bib in sorted(syllabus.tn_bibliography, key=lambda x: (x.position or 0))
    ]

    return result


# ============================================================
# ENDPOINTS
# ============================================================

@syllabus_api_bp.route('/<int:course_id>/upload', methods=['POST'])
@jwt_required()
def upload_syllabus(course_id):
    """
    Upload syllabus file for a course.
    FormData: {syllabus_type: 'bga' or 'tn', file: File}
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Teacher-only check
        if not user.is_teacher or course.teacher_id != user.id:
            return jsonify({'error': 'Only the course teacher can upload syllabus'}), 403

        # Validate form data
        if 'syllabus_type' not in request.form or 'file' not in request.files:
            return jsonify({'error': 'Missing required fields: syllabus_type and file'}), 400

        syllabus_type = request.form['syllabus_type']
        file = request.files['file']

        if syllabus_type not in ['bga', 'tn']:
            return jsonify({'error': 'syllabus_type must be "bga" or "tn"'}), 400

        if not file or file.filename == '':
            return jsonify({'error': 'No file provided'}), 400

        # Validate file type
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        if ext not in ['pdf', 'docx', 'doc']:
            return jsonify({'error': 'Invalid file type. Only PDF and DOCX are allowed.'}), 400

        # Save file
        uploads_dir = current_app.config.get('UPLOAD_FOLDER')
        if not uploads_dir:
            return jsonify({'error': 'Upload folder not configured'}), 500

        unique_name = f"syllabus_{course_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{filename}"
        full_path = os.path.join(uploads_dir, unique_name)
        file.save(full_path)

        logger.info(f"Saved syllabus file to {full_path}")

        # Create or update syllabus record
        syllabus = Syllabus.query.filter_by(course_id=course_id).first()

        if syllabus:
            # Delete old file if exists
            if syllabus.file_path:
                old_path = os.path.join(uploads_dir, syllabus.file_path)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception as e:
                        logger.warning(f"Could not delete old syllabus file: {e}")

            # Update existing
            syllabus.syllabus_type = syllabus_type
            syllabus.file_path = unique_name
            syllabus.updated_at = datetime.utcnow()
        else:
            # Create new
            syllabus = Syllabus(
                course_id=course_id,
                syllabus_type=syllabus_type,
                file_path=unique_name
            )
            db.session.add(syllabus)

        db.session.commit()

        return jsonify({
            'message': 'Syllabus uploaded successfully',
            'syllabus_id': syllabus.id,
            'file_path': unique_name,
            'syllabus_type': syllabus_type
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading syllabus: {str(e)}")
        return jsonify({'error': str(e)}), 500


@syllabus_api_bp.route('/<int:course_id>', methods=['GET'])
@jwt_required()
def get_syllabus(course_id):
    """
    Get syllabus data for a course.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Check access
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'Access denied'}), 403

        syllabus = Syllabus.query.filter_by(course_id=course_id).first()

        if not syllabus:
            return jsonify({'error': 'No syllabus found for this course'}), 404

        return jsonify({
            'id': syllabus.id,
            'syllabus_type': syllabus.syllabus_type,
            'clo_data': syllabus.clo_data,
            'plo_data': syllabus.plo_data,
            'weekly_plan': syllabus.weekly_plan,
            'tn_data': syllabus.tn_data,
            'tn_structured': _serialize_tn_syllabus(syllabus) if syllabus.syllabus_type == 'tn' else None,
            'file_path': syllabus.file_path,
            'created_at': syllabus.created_at.isoformat() if syllabus.created_at else None,
            'updated_at': syllabus.updated_at.isoformat() if syllabus.updated_at else None
        }), 200

    except Exception as e:
        logger.error(f"Error getting syllabus: {str(e)}")
        return jsonify({'error': str(e)}), 500


@syllabus_api_bp.route('/<int:course_id>/extract', methods=['POST'])
@jwt_required()
def extract_syllabus(course_id):
    """
    Trigger syllabus content extraction.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Teacher-only check
        if not user.is_teacher or course.teacher_id != user.id:
            return jsonify({'error': 'Only the course teacher can extract syllabus'}), 403

        syllabus = Syllabus.query.filter_by(course_id=course_id).first()

        if not syllabus or not syllabus.file_path:
            return jsonify({'error': 'No syllabus file found. Please upload a syllabus first.'}), 404

        # Check if file exists
        uploads_dir = current_app.config.get('UPLOAD_FOLDER')
        full_path = os.path.join(uploads_dir, syllabus.file_path)

        if not os.path.exists(full_path):
            return jsonify({'error': 'Syllabus file not found on server'}), 404

        # Import services
        from app.services.syllabus_service import SyllabusService

        # Process syllabus based on type
        # BGA Path - replicate logic from app/routes/syllabus.py extract_syllabus() (lines 438-493)
        if syllabus.syllabus_type == 'bga':
            try:
                # Extract using existing service method
                extraction_result = SyllabusService.extract_from_file(full_path)

                # Update syllabus with extracted data
                syllabus.clo_data = extraction_result.get('clo_data', [])
                syllabus.plo_data = extraction_result.get('plo_data', [])
                syllabus.weekly_plan = extraction_result.get('weekly_plan', [])

                # Calculate CLO coverage stats
                try:
                    stats = SyllabusService.calculate_clo_coverage_stats(course_id)
                    if stats:
                        syllabus.clo_stats = stats
                except Exception as e:
                    logger.warning(f"Could not calculate CLO stats: {e}")

                db.session.commit()

                # Upsert chapters from weekly plan (create or update)
                chapters_created = 0
                if syllabus.weekly_plan:
                    existing_chapters = {c.order: c for c in course.chapters.all()}
                    for week_data in syllabus.weekly_plan:
                        week_num = week_data.get("Week#")
                        topic = week_data.get("Topic") or f"Week {week_num}"
                        order = int(week_num) if week_num else 0

                        if order in existing_chapters:
                            # Update title if changed
                            existing_chapters[order].title = str(topic)
                        else:
                            chapter = Chapter(
                                course_id=course_id,
                                title=str(topic),
                                order=order
                            )
                            db.session.add(chapter)
                            chapters_created += 1

                    db.session.commit()

                result = {
                    'clo_count': len(syllabus.clo_data),
                    'plo_count': len(syllabus.plo_data),
                    'weekly_plan_count': len(syllabus.weekly_plan),
                    'chapters_created': chapters_created
                }

                return jsonify({
                    'success': True,
                    'message': 'Syllabus extracted successfully',
                    'data': result
                }), 200

            except Exception as e:
                db.session.rollback()
                logger.error(f"BGA extraction failed: {str(e)}")
                return jsonify({
                    'success': False,
                    'error': f'Extraction failed: {str(e)}'
                }), 500

        # TN Path - replicate logic from app/routes/syllabus.py tn_extract() (lines 2468-2542)
        else:  # syllabus.syllabus_type == 'tn'
            try:
                from app.services.syllabus_tn_service import SyllabusTNService
                from app.routes.tn_syllabus import _persist_tn_extraction

                # Extract TN syllabus
                extraction_result = SyllabusTNService.extract_tn_syllabus(full_path)

                # Persist to TN normalized tables
                _persist_tn_extraction(syllabus, extraction_result)

                # Create chapters from TN chapters (if none exist)
                chapters_created = 0
                if course.chapters.count() == 0 and syllabus.tn_chapters:
                    for tn_ch in sorted(syllabus.tn_chapters, key=lambda x: x.index):
                        chapter = Chapter(
                            course_id=course_id,
                            title=tn_ch.title,
                            order=tn_ch.index
                        )
                        db.session.add(chapter)
                        chapters_created += 1

                    db.session.commit()

                result = {
                    'tn_chapters_count': len(syllabus.tn_chapters) if syllabus.tn_chapters else 0,
                    'tn_aa_count': len(syllabus.tn_aa) if syllabus.tn_aa else 0,
                    'chapters_created': chapters_created
                }

                return jsonify({
                    'success': True,
                    'message': 'Syllabus extracted successfully',
                    'data': result
                }), 200

            except Exception as e:
                db.session.rollback()
                logger.error(f"TN extraction failed: {str(e)}")
                return jsonify({
                    'success': False,
                    'error': f'Extraction failed: {str(e)}'
                }), 500

    except Exception as e:
        logger.error(f"Error extracting syllabus: {str(e)}")
        return jsonify({'error': str(e)}), 500


@syllabus_api_bp.route('/<int:course_id>/classify', methods=['POST'])
@jwt_required()
def classify_syllabus(course_id):
    """
    Trigger chapter classification based on syllabus.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Teacher-only check
        if not user.is_teacher or course.teacher_id != user.id:
            return jsonify({'error': 'Only the course teacher can classify chapters'}), 403

        # Replicate logic from app/routes/syllabus.py tn_classify_store() (lines 2545-2574)
        try:
            syllabus = Syllabus.query.filter_by(course_id=course_id).first()

            if not syllabus:
                return jsonify({
                    'success': False,
                    'error': 'No syllabus found for course'
                }), 404

            if syllabus.syllabus_type != 'tn':
                return jsonify({
                    'success': False,
                    'error': 'Classification only available for TN syllabi'
                }), 400

            # Check if TN data exists
            if not syllabus.tn_data:
                return jsonify({
                    'success': False,
                    'error': 'Syllabus not extracted. Please extract the syllabus first.'
                }), 400

            # Use existing TN classification service
            from app.services.syllabus_tn_service import SyllabusTNService
            from app.routes.tn_syllabus import _persist_tn_extraction

            extracted = syllabus.tn_data or {}
            updated = SyllabusTNService.classify_chapters_sections_to_aaa(extracted)

            # Merge classification into the main chapters list so _persist_tn_extraction can map AA links
            classification = (updated.get("aaa_classification") or {})
            if isinstance(classification, dict) and classification.get("chapters"):
                updated["chapters"] = classification.get("chapters")
            updated["__classified"] = True

            # Re-persist with classification
            _persist_tn_extraction(syllabus, updated)

            return jsonify({
                'success': True,
                'message': 'Chapters classified successfully',
                'data': {
                    'classified': True,
                    'classification': classification
                }
            }), 200

        except Exception as e:
            db.session.rollback()
            logger.error(f"Classification failed: {str(e)}")
            return jsonify({
                'success': False,
                'error': f'Classification failed: {str(e)}'
            }), 500

    except Exception as e:
        logger.error(f"Error classifying syllabus: {str(e)}")
        return jsonify({'error': str(e)}), 500


@syllabus_api_bp.route('/<int:course_id>/clo', methods=['GET'])
@jwt_required()
def get_clo(course_id):
    """
    Get CLO data for a course.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Check access
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'Access denied'}), 403

        syllabus = Syllabus.query.filter_by(course_id=course_id).first()

        if not syllabus:
            return jsonify({'error': 'No syllabus found for this course'}), 404

        return jsonify({
            'clo_data': syllabus.clo_data or []
        }), 200

    except Exception as e:
        logger.error(f"Error getting CLO data: {str(e)}")
        return jsonify({'error': str(e)}), 500


@syllabus_api_bp.route('/<int:course_id>/plo', methods=['GET'])
@jwt_required()
def get_plo(course_id):
    """
    Get PLO data for a course.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Check access
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'Access denied'}), 403

        syllabus = Syllabus.query.filter_by(course_id=course_id).first()

        if not syllabus:
            return jsonify({'error': 'No syllabus found for this course'}), 404

        return jsonify({
            'plo_data': syllabus.plo_data or []
        }), 200

    except Exception as e:
        logger.error(f"Error getting PLO data: {str(e)}")
        return jsonify({'error': str(e)}), 500


@syllabus_api_bp.route('/<int:course_id>/weekly-plan', methods=['GET'])
@jwt_required()
def get_weekly_plan(course_id):
    """
    Get weekly plan for a course.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Check access
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'Access denied'}), 403

        syllabus = Syllabus.query.filter_by(course_id=course_id).first()

        if not syllabus:
            return jsonify({'error': 'No syllabus found for this course'}), 404

        return jsonify({
            'weekly_plan': syllabus.weekly_plan or []
        }), 200

    except Exception as e:
        logger.error(f"Error getting weekly plan: {str(e)}")
        return jsonify({'error': str(e)}), 500


@syllabus_api_bp.route('/<int:course_id>/download', methods=['GET'])
@jwt_required()
def download_syllabus(course_id):
    """
    Download syllabus file.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Check access
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'Access denied'}), 403

        syllabus = Syllabus.query.filter_by(course_id=course_id).first()

        if not syllabus or not syllabus.file_path:
            return jsonify({'error': 'No syllabus file found'}), 404

        uploads_dir = current_app.config.get('UPLOAD_FOLDER')
        file_path = os.path.join(uploads_dir, syllabus.file_path)

        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found on server'}), 404

        # Extract directory and filename
        directory = os.path.dirname(file_path)
        filename = os.path.basename(file_path)

        # Determine file extension
        ext = filename.rsplit('.', 1)[1] if '.' in filename else 'pdf'

        return send_from_directory(
            directory,
            filename,
            as_attachment=True,
            download_name=f"syllabus_{course.name}.{ext}"
        )

    except Exception as e:
        logger.error(f"Error downloading syllabus: {str(e)}")
        return jsonify({'error': str(e)}), 500
