"""
File Service - PDF Only
Handles file upload, storage, and PDF text extraction.
Simplified to support only PDF files.
"""

import os
import uuid
from pathlib import Path
from flask import current_app
from werkzeug.utils import secure_filename
import logging

logger = logging.getLogger(__name__)


def allowed_file(filename):
    """Check if the file is a PDF"""
    if not filename or '.' not in filename:
        return False
    return filename.rsplit('.', 1)[1].lower() == 'pdf'


def save_file(file, chapter_id):
    """Save the file to the upload folder and return the path"""
    # Generate unique filename to prevent collisions
    original_filename = secure_filename(file.filename)
    file_extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'pdf'
    unique_filename = f"{uuid.uuid4().hex}.{file_extension}"
    
    # Create directory structure based on chapter ID
    upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], f'chapter_{chapter_id}')
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, unique_filename)

    # Use forward slashes for cross-platform compatibility
    # (works on Windows, Linux, and macOS)
    relative_path = f'chapter_{chapter_id}/{unique_filename}'

    # Save the file
    file.save(file_path)

    return relative_path


def get_file_path(relative_path):
    """Get the absolute file path from the relative path stored in the database"""
    return os.path.join(current_app.config['UPLOAD_FOLDER'], relative_path)


def extract_text_from_file(file_path):
    """Extract text from PDF file (simplified - PDF only)"""
    file_extension = file_path.rsplit('.', 1)[1].lower() if '.' in file_path else ''
    
    if file_extension != 'pdf':
        raise ValueError(f"Unsupported file type: {file_extension}. Only PDF files are supported.")
    
    return extract_text_from_pdf(file_path)


def extract_text_from_pdf(file_path):
    """Extract text from PDF files using PyPDF2 (simple fallback method)"""
    try:
        from PyPDF2 import PdfReader
        
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        
        return text.strip()
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {str(e)}")
        return None


def save_syllabus_file(file, course_id):
    """Save a syllabus PDF file and return the path"""
    original_filename = secure_filename(file.filename)
    file_extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'pdf'
    unique_filename = f"syllabus_{course_id}_{uuid.uuid4().hex[:8]}.{file_extension}"
    
    # Create syllabus directory
    upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'syllabus')
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, unique_filename)

    # Use forward slashes for cross-platform compatibility
    relative_path = f'syllabus/{unique_filename}'

    file.save(file_path)

    return relative_path, file_path


def save_module_file(file, course_id, week_number=None):
    """Save a module attachment PDF file and return the path"""
    original_filename = secure_filename(file.filename)
    file_extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'pdf'
    
    week_str = f"_week{week_number}" if week_number else ""
    unique_filename = f"module_{course_id}{week_str}_{uuid.uuid4().hex[:8]}.{file_extension}"
    
    # Create modules directory
    upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'modules')
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, unique_filename)

    # Use forward slashes for cross-platform compatibility
    relative_path = f'modules/{unique_filename}'

    file.save(file_path)

    return relative_path, file_path
