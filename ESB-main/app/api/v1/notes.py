from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from datetime import datetime
from app import db
from app.models import User, Document, Note, Enrollment
import logging
import os

logger = logging.getLogger(__name__)

notes_api_bp = Blueprint('notes_api', __name__, url_prefix='/notes')


# ============================================================
# ENDPOINTS
# ============================================================

@notes_api_bp.route('/', methods=['POST'])
@jwt_required()
def add_note():
    """
    Add a note to a document.
    FormData: {document_id: int, content?: str, image?: File}
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Validate form data
        if 'document_id' not in request.form:
            return jsonify({'error': 'Missing required field: document_id'}), 400

        document_id = request.form['document_id']

        try:
            document_id = int(document_id)
        except ValueError:
            return jsonify({'error': 'Invalid document_id'}), 400

        document = Document.query.get_or_404(document_id)

        # Check access
        if document.chapter_id:
            course = document.chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Get content
        content = request.form.get('content', '').strip() or None

        # Handle image upload
        image_path = None
        if 'image' in request.files:
            image_file = request.files['image']
            if image_file and image_file.filename != '':
                # Validate file type
                filename = secure_filename(image_file.filename)
                ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

                if ext not in ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']:
                    return jsonify({'error': 'Invalid image type. Allowed: png, jpg, jpeg, gif, bmp, webp'}), 400

                # Save image
                uploads_dir = current_app.config.get('UPLOAD_FOLDER')
                if not uploads_dir:
                    return jsonify({'error': 'Upload folder not configured'}), 500

                notes_images_dir = os.path.join(uploads_dir, 'notes_images')
                os.makedirs(notes_images_dir, exist_ok=True)

                unique_filename = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{filename}"
                image_path = os.path.join('notes_images', unique_filename)
                full_path = os.path.join(uploads_dir, image_path)

                image_file.save(full_path)
                logger.info(f"Saved note image to {full_path}")

        # Validate that at least content or image is provided
        if not content and not image_path:
            return jsonify({'error': 'Either content or image must be provided'}), 400

        # Create note
        note = Note(
            user_id=user.id,
            document_id=document_id,
            content=content
        )

        if image_path:
            note.image_path = image_path

        db.session.add(note)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Note added successfully',
            'note': {
                'id': note.id,
                'content': note.content,
                'image_path': note.image_path,
                'created_at': note.created_at.isoformat() if note.created_at else None
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding note: {str(e)}")
        return jsonify({'error': str(e)}), 500


@notes_api_bp.route('/document/<int:document_id>', methods=['GET'])
@jwt_required()
def get_document_notes(document_id):
    """
    Get all notes for a document by the current user.
    Returns: {notes: [{id, content, image_path, created_at}], total: int}
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Check access
        if document.chapter_id:
            course = document.chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

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
        logger.error(f"Error getting notes: {str(e)}")
        return jsonify({'error': str(e)}), 500


@notes_api_bp.route('/<int:note_id>', methods=['DELETE'])
@jwt_required()
def delete_note(note_id):
    """
    Delete a note.
    Only the note owner can delete it.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        note = Note.query.get_or_404(note_id)

        # Ownership check
        if note.user_id != user.id:
            return jsonify({'error': 'Access denied. You can only delete your own notes.'}), 403

        # Delete image file if exists
        if note.image_path:
            try:
                uploads_dir = current_app.config.get('UPLOAD_FOLDER')
                full_path = os.path.join(uploads_dir, note.image_path)
                if os.path.exists(full_path):
                    os.remove(full_path)
                    logger.info(f"Deleted note image: {full_path}")
            except Exception as e:
                logger.warning(f"Could not delete note image: {e}")

        # Delete note from database
        db.session.delete(note)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Note deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting note: {str(e)}")
        return jsonify({'error': str(e)}), 500


@notes_api_bp.route('/image/<path:filename>', methods=['GET'])
@jwt_required()
def serve_note_image(filename):
    """
    Serve note image file.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Security: Check that the image belongs to a note owned by this user
        # Extract filename from path (remove 'notes_images/' prefix if present)
        if filename.startswith('notes_images/'):
            filename = filename[len('notes_images/'):]

        image_path = os.path.join('notes_images', filename)
        note = Note.query.filter_by(image_path=image_path).first()

        if not note:
            return jsonify({'error': 'Image not found'}), 404

        # Check ownership or access to document
        document = note.document
        if document.chapter_id:
            course = document.chapter.course
        elif document.course_id:
            course = document.course
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_owner = note.user_id == user.id
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_owner and not is_teacher and not is_enrolled:
            return jsonify({'error': 'Access denied'}), 403

        # Serve file
        uploads_dir = current_app.config.get('UPLOAD_FOLDER')
        notes_images_dir = os.path.join(uploads_dir, 'notes_images')

        return send_from_directory(
            notes_images_dir,
            filename
        )

    except Exception as e:
        logger.error(f"Error serving note image: {str(e)}")
        return jsonify({'error': str(e)}), 500
