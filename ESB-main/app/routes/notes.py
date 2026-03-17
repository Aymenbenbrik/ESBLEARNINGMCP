from flask import Blueprint, render_template, redirect, url_for, request, flash, jsonify, abort, send_from_directory, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import os
from datetime import datetime

from app import db
from app.models import Note, Document

notes = Blueprint('notes', __name__)

@notes.route('/add_note', methods=['POST'])
@login_required
def add_note():
    """Add a new note to a document"""
    document_id = request.form.get('document_id')
    content = request.form.get('content')
    image = request.files.get('image')
    
    document = Document.query.get_or_404(document_id)
    
    if not content and not image:
        return jsonify({
            'success': False,
            'message': 'A note must contain either text or an image.'
        }), 400
    
    # Validate image if provided
    image_path = None
    if image and image.filename:
        # Check file extension
        allowed_extensions = ['png', 'jpg', 'jpeg', 'gif']
        file_ext = image.filename.rsplit('.', 1)[1].lower() if '.' in image.filename else ''
        
        if file_ext not in allowed_extensions:
            return jsonify({
                'success': False,
                'message': 'Invalid image format. Supported formats: PNG, JPG, JPEG, GIF.'
            }), 400
    
    # Create new note
    try:
        note = Note(
            user_id=current_user.id,
            document_id=document_id,
            content=content,
            image_file=image
        )
        
        db.session.add(note)
        db.session.commit()
        
        # Return success response with new note data
        return jsonify({
            'success': True,
            'message': 'Note added successfully',
            'note': note.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error adding note: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'An error occurred while saving your note.'
        }), 500

@notes.route('/delete_note/<int:note_id>', methods=['DELETE'])
@login_required
def delete_note(note_id):
    """Delete a note"""
    note = Note.query.get_or_404(note_id)
    
    # Ensure the user owns this note
    if note.user_id != current_user.id:
        abort(403)  # Forbidden
    
    try:
        # Delete the associated image file if it exists
        note.delete_file()
        
        # Delete from database
        db.session.delete(note)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Note deleted successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting note: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'An error occurred while deleting the note.'
        }), 500

@notes.route('/note_image/<path:filename>')
def serve_note_image(filename):
    """Serve uploaded note images"""
    file_dir = os.path.dirname(filename)
    base_filename = os.path.basename(filename)
    
    # Serve the file from the upload folder
    return send_from_directory(os.path.join(current_app.config['UPLOAD_FOLDER'], file_dir), base_filename)



