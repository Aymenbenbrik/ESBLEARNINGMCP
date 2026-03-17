from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
import os
from app import db
from app.models import Course, Chapter, Document, Enrollment, User
from app.services.file_service import save_file, allowed_file
from app.services.ai_service import generate_summary
from app.services.syllabus_service import SyllabusService
from app.services.aap_definitions import get_aap_label
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
import logging

logger = logging.getLogger(__name__)

chapters_api_bp = Blueprint('chapters_api', __name__, url_prefix='/chapters')


@chapters_api_bp.route('/<int:course_id>', methods=['POST'])
@jwt_required()
def create_chapter(course_id):
    """
    Create a new chapter in a course.
    Only the teacher who created the course can add chapters.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Only the teacher who created the course can add chapters
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()

        # Validate required fields
        if not data or not data.get('title'):
            return jsonify({'error': 'Title is required'}), 400

        # Validate title length
        if len(data['title']) < 3 or len(data['title']) > 100:
            return jsonify({'error': 'Title must be between 3 and 100 characters'}), 400

        # Validate order
        order = data.get('order')
        if not order or order < 1:
            return jsonify({'error': 'Order must be a positive number'}), 400

        # Create chapter
        chapter = Chapter(
            title=data['title'],
            order=order,
            course_id=course_id
        )
        db.session.add(chapter)
        db.session.commit()

        return jsonify({
            'id': chapter.id,
            'title': chapter.title,
            'order': chapter.order,
            'course_id': chapter.course_id,
            'created_at': chapter.created_at.isoformat() if chapter.created_at else None,
            'updated_at': chapter.updated_at.isoformat() if chapter.updated_at else None,
            'has_summary': chapter.has_summary(),
            'documents_count': 0
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating chapter: {e}")
        return jsonify({'error': str(e)}), 500


@chapters_api_bp.route('/<int:chapter_id>', methods=['GET'])
@jwt_required()
def get_chapter(chapter_id):
    """
    Get chapter details with documents and TN sections.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        # Check if user has access to this course
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Get documents
        documents = chapter.documents.all()
        documents_list = [{
            'id': doc.id,
            'title': doc.title,
            'file_path': doc.file_path,
            'file_type': doc.file_type,
            'document_type': doc.document_type,
            'created_at': doc.created_at.isoformat() if doc.created_at else None,
            'updated_at': doc.updated_at.isoformat() if doc.updated_at else None
        } for doc in documents]

        # TN sections + TN norms distributions (AAAs and selected AAPs)
        syllabus = SyllabusService.get_syllabus_by_course(course.id)
        tn_chapter = None
        if syllabus and (syllabus.syllabus_type or '').lower() == 'tn' and getattr(syllabus, 'tn_chapters', None):
            for tnc in syllabus.tn_chapters:
                if tnc.index == chapter.order:
                    # Collect linked AA numbers ("AAA" in TN vocabulary)
                    chapter_aa_numbers = sorted([int(link.aa.number) for link in (tnc.aa_links or [])])

                    # Selected AAPs (global for syllabus)
                    selected_aap_numbers = []
                    try:
                        selected_aap_numbers = sorted([int(a.number) for a in (syllabus.tn_aap or []) if getattr(a, 'selected', False)])
                    except Exception:
                        selected_aap_numbers = []

                    tn_chapter = {
                        'id': tnc.id,
                        'index': tnc.index,
                        'title': tnc.title,
                        'aaa': [{
                            'number': int(link.aa.number),
                            'label': f"AAA {int(link.aa.number)}",
                            'description': (link.description_override or getattr(link.aa, 'description', '') or '')
                        } for link in sorted((tnc.aa_links or []), key=lambda l: int(l.aa.number))],
                        'aap': [{
                            'number': int(a.number),
                            'label': f"AAP {int(a.number)}",
                            'description': get_aap_label(int(a.number))
                        } for a in sorted([a for a in (syllabus.tn_aap or []) if getattr(a, 'selected', False)], key=lambda x: int(x.number))],
                        'sections': [{
                            'id': section.id,
                            'index': section.index,
                            'title': section.title,
                            'aaa': [{
                                'number': int(link.aa.number),
                                'label': f"AAA {int(link.aa.number)}",
                                'description': (link.description_override or getattr(link.aa, 'description', '') or '')
                            } for link in sorted((section.aa_links or []), key=lambda l: int(l.aa.number))]
                        } for section in (tnc.sections or [])]
                    }
                    break

        return jsonify({
            'chapter': {
                'id': chapter.id,
                'title': chapter.title,
                'order': chapter.order,
                'course_id': chapter.course_id,
                'summary': chapter.summary,
                'created_at': chapter.created_at.isoformat() if chapter.created_at else None,
                'updated_at': chapter.updated_at.isoformat() if chapter.updated_at else None,
                'has_summary': chapter.has_summary(),
                'can_edit': is_teacher
            },
            'course': {
                'id': course.id,
                'title': course.title
            },
            'documents': documents_list,
            'tn_chapter': tn_chapter
        }), 200

    except Exception as e:
        logger.error(f"Error getting chapter: {e}")
        return jsonify({'error': str(e)}), 500


@chapters_api_bp.route('/<int:chapter_id>', methods=['PUT'])
@jwt_required()
def update_chapter(chapter_id):
    """
    Update a chapter.
    Only the teacher who created the course can edit chapters.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        # Only the teacher who created the course can edit chapters
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()

        # Update title if provided
        if 'title' in data:
            if len(data['title']) < 3 or len(data['title']) > 100:
                return jsonify({'error': 'Title must be between 3 and 100 characters'}), 400
            chapter.title = data['title']

        # Update order if provided
        if 'order' in data:
            if data['order'] < 1:
                return jsonify({'error': 'Order must be a positive number'}), 400
            chapter.order = data['order']

        db.session.commit()

        return jsonify({
            'id': chapter.id,
            'title': chapter.title,
            'order': chapter.order,
            'course_id': chapter.course_id,
            'summary': chapter.summary,
            'created_at': chapter.created_at.isoformat() if chapter.created_at else None,
            'updated_at': chapter.updated_at.isoformat() if chapter.updated_at else None,
            'has_summary': chapter.has_summary()
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating chapter: {e}")
        return jsonify({'error': str(e)}), 500


@chapters_api_bp.route('/<int:chapter_id>', methods=['DELETE'])
@jwt_required()
def delete_chapter(chapter_id):
    """
    Delete a chapter.
    Only the teacher who created the course can delete chapters.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        # Only the teacher who created the course can delete chapters
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        title = chapter.title
        course_id = course.id
        db.session.delete(chapter)
        db.session.commit()

        return jsonify({
            'message': f'Chapter "{title}" has been deleted',
            'course_id': course_id
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting chapter: {e}")
        return jsonify({'error': str(e)}), 500


@chapters_api_bp.route('/<int:chapter_id>/documents', methods=['POST'])
@jwt_required()
def upload_document(chapter_id):
    """
    Upload a document to a chapter.
    Only the teacher who created the course can upload documents.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        # Only the teacher who created the course can upload documents
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

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
        if not allowed_file(file.filename):
            return jsonify({'error': 'Only PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, CSV files are allowed'}), 400

        # Save the file
        filename = secure_filename(file.filename)
        file_path = save_file(file, chapter_id)
        file_type = filename.rsplit('.', 1)[1].lower()

        # Create the document in the database
        document = Document(
            title=title,
            file_path=file_path,
            file_type=file_type,
            chapter_id=chapter_id,
            course_id=course.id
        )
        db.session.add(document)
        db.session.commit()

        # Generate summary
        summary_status = 'pending'
        try:
            summary = generate_summary(file_path, file_type)
            document.summary = summary
            db.session.commit()
            summary_status = 'generated'
        except Exception as e:
            logger.error(f"Error generating summary: {e}")
            summary_status = 'failed'

        # Index PDF into ChromaDB for RAG chatbot
        processing_status = 'uploaded'
        if file_type == 'pdf':
            try:
                from app.services.document_pipeline import process_pdf_document
                full_path = os.path.join(current_app.config['UPLOAD_FOLDER'], file_path)
                process_pdf_document(
                    pdf_path=full_path,
                    document_id=document.id,
                    document_name=filename,
                    extract_images=True
                )
                processing_status = 'processed'
            except Exception as e:
                current_app.logger.error(f"Error indexing document {document.id}: {e}")
                processing_status = 'processing_failed'

        return jsonify({
            'message': 'Document uploaded successfully',
            'document': {
                'id': document.id,
                'title': document.title,
                'file_path': document.file_path,
                'file_type': document.file_type,
                'chapter_id': document.chapter_id,
                'created_at': document.created_at.isoformat() if document.created_at else None
            },
            'summary_status': summary_status,
            'processing_status': processing_status
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading document: {e}")
        return jsonify({'error': str(e)}), 500


@chapters_api_bp.route('/<int:chapter_id>/summary/generate', methods=['POST'])
@jwt_required()
def generate_chapter_summary(chapter_id):
    """
    Generate a comprehensive summary of an entire chapter.
    Only the teacher who created the course can generate summaries.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        # Only the teacher who created the course can generate summaries
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        # Check if summary already exists
        if chapter.summary:
            return jsonify({
                'message': 'Summary already exists',
                'summary': chapter.summary
            }), 200

        # Get all documents
        documents = chapter.documents.all()
        if not documents:
            return jsonify({'error': 'No documents found in this chapter to generate a summary'}), 400

        # Combine summaries
        combined_text = " ".join([doc.summary for doc in documents if doc.summary])

        if not combined_text:
            return jsonify({'error': 'No document summaries available. Please ensure documents have been processed.'}), 400

        # Generate chapter summary using Gemini
        try:
            api_key = current_app.config.get('GOOGLE_API_KEY')
            if not api_key:
                raise ValueError("Google API key is not configured")

            model = current_app.config.get('GEMINI_MODEL', 'gemini-2.0-flash')

            llm = ChatGoogleGenerativeAI(
                model=model,
                google_api_key=api_key,
                temperature=0.3,
                max_tokens=8000
            )

            prompt = f"Create a comprehensive summary of the following educational content:\n\n{combined_text}"

            messages = [
                SystemMessage(content="You are an educational assistant that provides comprehensive, well-structured summaries of educational content. You excel at combining information from multiple sources into a cohesive summary."),
                HumanMessage(content=prompt)
            ]
            response = llm.invoke(messages)
            chapter_summary = response.content.strip()

            # Save the chapter summary
            chapter.summary = chapter_summary
            db.session.commit()

            return jsonify({
                'message': 'Chapter summary generated successfully',
                'summary': chapter_summary
            }), 200

        except Exception as e:
            logger.error(f"Error generating chapter summary: {e}")
            return jsonify({'error': f'Failed to generate summary: {str(e)}'}), 500

    except Exception as e:
        logger.error(f"Error in generate_chapter_summary: {e}")
        return jsonify({'error': str(e)}), 500


@chapters_api_bp.route('/<int:chapter_id>/summary', methods=['GET'])
@jwt_required()
def get_chapter_summary(chapter_id):
    """
    Get the chapter summary.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        # Check if user has access
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        if not chapter.summary:
            return jsonify({
                'has_summary': False,
                'summary': None
            }), 200

        return jsonify({
            'has_summary': True,
            'summary': chapter.summary
        }), 200

    except Exception as e:
        logger.error(f"Error getting chapter summary: {e}")
        return jsonify({'error': str(e)}), 500
