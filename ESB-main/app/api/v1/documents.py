from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
import os
from app import db
from app.models import Document, User, Enrollment
import logging

logger = logging.getLogger(__name__)

documents_api_bp = Blueprint('documents_api', __name__, url_prefix='/documents')


@documents_api_bp.route('/<int:document_id>', methods=['GET'])
@jwt_required()
def get_document(document_id):
    """
    Get document details.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Check access
        if document.chapter_id:
            chapter = document.chapter
            course = chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        return jsonify({
            'id': document.id,
            'title': document.title,
            'file_path': document.file_path,
            'file_type': document.file_type,
            'document_type': document.document_type,
            'summary': document.summary,
            'chapter_id': document.chapter_id,
            'course_id': document.course_id,
            'week_number': document.week_number,
            'created_at': document.created_at.isoformat() if document.created_at else None,
            'updated_at': document.updated_at.isoformat() if document.updated_at else None,
            'quiz_data': document.quiz_data,
            'metadata': document.content_metadata,
            'can_edit': is_teacher
        }), 200

    except Exception as e:
        logger.error(f"Error getting document: {e}")
        return jsonify({'error': str(e)}), 500


@documents_api_bp.route('/<int:document_id>', methods=['DELETE'])
@jwt_required()
def delete_document(document_id):
    """
    Delete a document.
    Only the teacher who created the course can delete documents.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Get course
        if document.chapter_id:
            chapter = document.chapter
            course = chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        # Only the teacher who created the course can delete documents
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        # Delete the file from filesystem
        try:
            if document.file_path:
                # Log raw path from database
                logger.info(f"Document {document_id} file_path from DB: {repr(document.file_path)}")

                # Normalize path separators for cross-platform compatibility
                normalized_path = document.file_path.replace('\\', '/')
                logger.info(f"Normalized path: {normalized_path}")

                file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], normalized_path)
                logger.info(f"Full file path: {file_path}")
                logger.info(f"File exists: {os.path.exists(file_path)}")

                if os.path.exists(file_path):
                    os.remove(file_path)
        except Exception as e:
            logger.warning(f"Warning: File could not be deleted: {e}")

        # Delete from database
        title = document.title
        chapter_id = document.chapter_id
        db.session.delete(document)
        db.session.commit()

        return jsonify({
            'message': f'Document "{title}" has been deleted',
            'chapter_id': chapter_id
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting document: {e}")
        return jsonify({'error': str(e)}), 500


@documents_api_bp.route('/<int:document_id>/reprocess', methods=['POST'])
@jwt_required()
def reprocess_document(document_id):
    """
    Reprocess an existing document to index it into ChromaDB for RAG chat.
    Only the teacher who created the course can reprocess documents.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Get course
        if document.chapter_id:
            chapter = document.chapter
            course = chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        # Only the teacher who created the course can reprocess
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        # Only PDFs can be reprocessed
        if document.file_type != 'pdf':
            return jsonify({'error': 'Only PDF documents can be reprocessed for AI chat'}), 400

        try:
            from app.services.document_pipeline import reprocess_document as reprocess_pdf_document

            # Log raw path from database
            logger.info(f"Document {document_id} file_path from DB: {repr(document.file_path)}")

            # Normalize path separators for cross-platform compatibility
            normalized_path = document.file_path.replace('\\', '/')
            logger.info(f"Normalized path: {normalized_path}")

            full_path = os.path.join(current_app.config['UPLOAD_FOLDER'], normalized_path)
            logger.info(f"Full file path: {full_path}")
            logger.info(f"File exists: {os.path.exists(full_path)}")

            if not os.path.exists(full_path):
                logger.error(f"File not found at: {full_path}")
                return jsonify({'error': 'Document file not found on server'}), 404

            success, stats = reprocess_pdf_document(
                pdf_path=full_path,
                document_id=document.id,
                document_name=document.title,
            )
            if not success:
                return jsonify({'error': stats.get('error', 'Document reprocessing failed')}), 500

            return jsonify({
                'message': f'Document "{document.title}" has been reprocessed and indexed for AI chat'
            }), 200

        except Exception as e:
            current_app.logger.error(f"Error reprocessing document {document.id}: {e}")
            return jsonify({'error': f'Reprocessing failed: {str(e)}'}), 500

    except Exception as e:
        logger.error(f"Error in reprocess_document: {e}")
        return jsonify({'error': str(e)}), 500


@documents_api_bp.route('/<int:document_id>/download', methods=['GET'])
@jwt_required()
def download_document(document_id):
    """
    Download a document file.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Check access
        if document.chapter_id:
            chapter = document.chapter
            course = chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Send file
        if not document.file_path:
            return jsonify({'error': 'Document has no file'}), 400

        uploads_dir = current_app.config['UPLOAD_FOLDER']

        # Log raw path from database
        logger.info(f"Document {document_id} file_path from DB: {repr(document.file_path)}")

        # Normalize path separators for cross-platform compatibility
        normalized_path = document.file_path.replace('\\', '/')
        logger.info(f"Normalized path: {normalized_path}")

        file_path = os.path.join(uploads_dir, normalized_path)
        logger.info(f"Full file path: {file_path}")
        logger.info(f"File exists: {os.path.exists(file_path)}")

        if not os.path.exists(file_path):
            logger.error(f"File not found at: {file_path}")
            return jsonify({'error': 'File not found on server'}), 404

        # Extract directory and filename
        directory = os.path.dirname(file_path)
        filename = os.path.basename(file_path)

        return send_from_directory(
            directory,
            filename,
            as_attachment=True,
            download_name=f"{document.title}.{document.file_type}"
        )

    except Exception as e:
        logger.error(f"Error downloading document: {e}")
        return jsonify({'error': str(e)}), 500


@documents_api_bp.route('/<int:document_id>/file', methods=['GET'])
@jwt_required()
def get_document_file(document_id):
    """
    Serve document file for inline viewing (e.g., in PDF viewer).
    Unlike /download, this serves the file inline without forcing download.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Check access
        if document.chapter_id:
            chapter = document.chapter
            course = chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Send file inline
        if not document.file_path:
            return jsonify({'error': 'Document has no file'}), 400

        uploads_dir = current_app.config['UPLOAD_FOLDER']

        # Log raw path from database
        logger.info(f"Document {document_id} file_path from DB: {repr(document.file_path)}")

        # Normalize path separators for cross-platform compatibility
        normalized_path = document.file_path.replace('\\', '/')
        logger.info(f"Normalized path: {normalized_path}")

        file_path = os.path.join(uploads_dir, normalized_path)
        logger.info(f"Full file path: {file_path}")
        logger.info(f"File exists: {os.path.exists(file_path)}")

        if not os.path.exists(file_path):
            logger.error(f"File not found at: {file_path}")
            return jsonify({'error': 'File not found on server'}), 404

        # Extract directory and filename
        directory = os.path.dirname(file_path)
        filename = os.path.basename(file_path)

        # Serve inline (as_attachment=False allows viewing in browser)
        return send_from_directory(
            directory,
            filename,
            as_attachment=False,  # KEY: Allow inline viewing
            mimetype='application/pdf' if document.file_type == 'pdf' else None
        )

    except Exception as e:
        logger.error(f"Error serving document file: {e}")
        return jsonify({'error': str(e)}), 500


@documents_api_bp.route('/<int:document_id>/extraction', methods=['GET'])
@jwt_required()
def get_document_extraction(document_id):
    """
    Get extraction data and analysis results for a document.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Check access
        if document.chapter_id:
            chapter = document.chapter
            course = chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Get extraction data
        extraction_data = None
        analysis_results = None

        if hasattr(document, 'extraction_data'):
            extraction_data = document.extraction_data

        if hasattr(document, 'analysis_results'):
            analysis_results = document.analysis_results

        return jsonify({
            'document_id': document.id,
            'title': document.title,
            'extraction_data': extraction_data,
            'analysis_results': analysis_results
        }), 200

    except Exception as e:
        logger.error(f"Error getting document extraction: {e}")
        return jsonify({'error': str(e)}), 500


@documents_api_bp.route('/<int:document_id>/notes', methods=['GET'])
@jwt_required()
def get_document_notes_list(document_id):
    """
    Get all notes for a document by the current user.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Check access
        if document.chapter_id:
            chapter = document.chapter
            course = chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Import Note model
        from app.models import Note

        # Get notes for current user
        notes = Note.query.filter_by(
            document_id=document_id,
            user_id=user.id
        ).order_by(Note.created_at.desc()).all()

        notes_data = []
        for note in notes:
            notes_data.append({
                'id': note.id,
                'content': note.content,
                'image_path': note.image_path,
                'created_at': note.created_at.isoformat() if note.created_at else None,
                'updated_at': note.updated_at.isoformat() if note.updated_at else None
            })

        return jsonify({
            'notes': notes_data,
            'total': len(notes)
        }), 200

    except Exception as e:
        logger.error(f"Error getting document notes: {e}")
        return jsonify({'error': str(e)}), 500
