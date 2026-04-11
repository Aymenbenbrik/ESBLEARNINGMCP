"""
Admin Syllabus Service
Orchestrates the full pipeline: upload → extract → persist → create course structure.
"""

import os
import shutil
import logging
from datetime import datetime

from flask import current_app
from werkzeug.utils import secure_filename

from app import db
from app.models import Syllabus, TNChapter, Course, Chapter

logger = logging.getLogger(__name__)


class AdminSyllabusService:

    # ------------------------------------------------------------------ #
    #  Batch processing
    # ------------------------------------------------------------------ #
    @staticmethod
    def process_syllabus_batch(files, course_mappings, admin_id):
        """
        Process multiple syllabus files.

        Args:
            files: List of werkzeug FileStorage objects
            course_mappings: Dict mapping filename → course_id
            admin_id: ID of the admin user

        Returns:
            List of result dicts (one per file)
        """
        results = []
        upload_dir = AdminSyllabusService._ensure_syllabi_folder()

        for f in files:
            filename = secure_filename(f.filename or "unknown.pdf")
            course_id = course_mappings.get(filename) or course_mappings.get(f.filename)
            if not course_id:
                results.append({
                    'filename': filename,
                    'success': False,
                    'error': 'No course_id mapping provided for this file',
                })
                continue

            try:
                course_id = int(course_id)
            except (ValueError, TypeError):
                results.append({
                    'filename': filename,
                    'success': False,
                    'error': f'Invalid course_id: {course_id}',
                })
                continue

            course = Course.query.get(course_id)
            if not course:
                results.append({
                    'filename': filename,
                    'success': False,
                    'error': f'Course {course_id} not found',
                })
                continue

            # Save file to disk
            timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
            stored_name = f"{course_id}_{timestamp}_{filename}"
            file_path = os.path.join(upload_dir, stored_name)

            try:
                f.save(file_path)
                logger.info(f"Saved syllabus file: {file_path}")

                result = AdminSyllabusService.process_single_syllabus(
                    file_path=file_path,
                    course_id=course_id,
                    syllabus_type='tn',
                    admin_id=admin_id,
                )
                result['filename'] = filename
                results.append(result)
            except Exception as exc:
                logger.exception(f"Error processing {filename}")
                db.session.rollback()
                results.append({
                    'filename': filename,
                    'success': False,
                    'error': str(exc),
                })

        return results

    # ------------------------------------------------------------------ #
    #  Single file pipeline
    # ------------------------------------------------------------------ #
    @staticmethod
    def process_single_syllabus(file_path, course_id, syllabus_type='tn', admin_id=None):
        """
        Full pipeline for one file:
        1. Create/update Syllabus record
        2. Extract using the appropriate service
        3. Persist extraction to normalized TN tables
        4. Create/update Course chapters from TN chapters
        5. Store processed file path

        Returns:
            dict with success flag and details
        """
        course = Course.query.get(course_id)
        if not course:
            return {'success': False, 'error': f'Course {course_id} not found'}

        # 1. Create or update Syllabus record
        syllabus = Syllabus.query.filter_by(course_id=course_id).first()
        if not syllabus:
            syllabus = Syllabus(course_id=course_id, syllabus_type=syllabus_type)
            db.session.add(syllabus)
            db.session.flush()
            logger.info(f"Created Syllabus id={syllabus.id} for course {course_id}")
        else:
            syllabus.syllabus_type = syllabus_type
            syllabus.updated_at = datetime.utcnow()

        syllabus.file_path = file_path

        # 2. Extract
        logger.info(f"Extracting syllabus (type={syllabus_type}) from {file_path}")
        extraction_result = AdminSyllabusService._extract(file_path, syllabus_type)

        if not extraction_result:
            db.session.commit()
            return {
                'success': False,
                'error': 'Extraction returned empty result',
                'syllabus_id': syllabus.id,
            }

        # 3. Persist to normalized tables
        logger.info(f"Persisting extraction for syllabus {syllabus.id}")
        AdminSyllabusService._persist(syllabus, extraction_result, syllabus_type)

        # 4. Create/update course chapters
        chapters_created = AdminSyllabusService.create_course_structure(course_id)

        db.session.commit()
        logger.info(f"Pipeline complete for course {course_id}")

        return {
            'success': True,
            'syllabus_id': syllabus.id,
            'course_id': course_id,
            'chapters_created': chapters_created,
            'extraction_keys': list(extraction_result.keys()),
        }

    # ------------------------------------------------------------------ #
    #  Create course structure from TN data
    # ------------------------------------------------------------------ #
    @staticmethod
    def create_course_structure(course_id):
        """
        From existing Syllabus + TNChapters + TNSections,
        create the full Course → Chapter structure.

        Returns:
            Number of chapters created/updated
        """
        syllabus = Syllabus.query.filter_by(course_id=course_id).first()
        if not syllabus:
            logger.warning(f"No syllabus for course {course_id}")
            return 0

        tn_chapters = (
            TNChapter.query
            .filter_by(syllabus_id=syllabus.id)
            .order_by(TNChapter.index)
            .all()
        )

        if not tn_chapters:
            logger.warning(f"No TN chapters for syllabus {syllabus.id}")
            return 0

        created = 0
        for tn_ch in tn_chapters:
            existing = Chapter.query.filter_by(
                course_id=course_id,
                order=tn_ch.index,
            ).first()

            if existing:
                # Update title if changed
                if existing.title != tn_ch.title:
                    existing.title = tn_ch.title
                    logger.info(f"Updated chapter '{tn_ch.title}' (order={tn_ch.index})")
            else:
                chapter = Chapter(
                    course_id=course_id,
                    title=tn_ch.title,
                    order=tn_ch.index,
                )
                db.session.add(chapter)
                created += 1
                logger.info(f"Created chapter '{tn_ch.title}' (order={tn_ch.index})")

        db.session.flush()
        return created

    # ------------------------------------------------------------------ #
    #  Processing status
    # ------------------------------------------------------------------ #
    @staticmethod
    def get_processing_status(course_id=None):
        """
        Get status of syllabus processing.

        Args:
            course_id: Optional — filter to a single course

        Returns:
            List of status dicts
        """
        query = Syllabus.query
        if course_id:
            query = query.filter_by(course_id=course_id)

        syllabi = query.all()
        results = []
        for s in syllabi:
            course = Course.query.get(s.course_id)
            has_chapters = TNChapter.query.filter_by(syllabus_id=s.id).count() > 0
            course_chapters = Chapter.query.filter_by(course_id=s.course_id).count() if course else 0

            results.append({
                'syllabus_id': s.id,
                'course_id': s.course_id,
                'course_title': course.title if course else None,
                'syllabus_type': s.syllabus_type,
                'file_path': s.file_path,
                'has_extraction': has_chapters or bool(s.tn_data),
                'tn_chapters_count': TNChapter.query.filter_by(syllabus_id=s.id).count(),
                'course_chapters_count': course_chapters,
                'created_at': s.created_at.isoformat() if s.created_at else None,
                'updated_at': s.updated_at.isoformat() if s.updated_at else None,
            })

        return results

    # ------------------------------------------------------------------ #
    #  Private helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _ensure_syllabi_folder():
        """Ensure uploads/syllabi/ exists and return its absolute path."""
        upload_root = current_app.config.get('UPLOAD_FOLDER', 'uploads')
        syllabi_dir = os.path.join(upload_root, 'syllabi')
        os.makedirs(syllabi_dir, exist_ok=True)
        return syllabi_dir

    @staticmethod
    def _extract(file_path, syllabus_type):
        """Run the appropriate extraction service."""
        if syllabus_type == 'tn':
            from app.services.syllabus_tn_service import SyllabusTNService
            return SyllabusTNService.extract_tn_syllabus(file_path)
        else:
            from app.services.syllabus_service import SyllabusService
            return SyllabusService.extract_from_file(file_path)

    @staticmethod
    def _persist(syllabus, extraction_result, syllabus_type):
        """Persist extraction results to normalized tables."""
        if syllabus_type == 'tn':
            from app.routes.tn_syllabus import _persist_tn_extraction
            _persist_tn_extraction(syllabus, extraction_result)
        else:
            # For BGA, store the raw result in the existing JSON fields
            syllabus.clo_data = extraction_result.get('clo_data')
            syllabus.plo_data = extraction_result.get('plo_data')
            syllabus.weekly_plan = extraction_result.get('weekly_plan')
            syllabus.syllabus_type = 'bga'
            db.session.flush()
