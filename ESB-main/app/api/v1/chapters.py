from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
import os
from app import db
from app.models import Course, Chapter, Document, Enrollment, User, TNAA, TNChapter, TNChapterAA
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

        # Allow force regeneration via body param
        body = request.get_json(silent=True) or {}
        force = bool(body.get('force', False))

        # Check if summary already exists
        if chapter.summary and not force:
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



# ---------------------------------------------------------------------------
# AA matching endpoints
# ---------------------------------------------------------------------------

@chapters_api_bp.route('/<int:chapter_id>/aa-matching', methods=['GET'])
@jwt_required()
def get_aa_matching(chapter_id):
    """
    Return all AAs from the TN syllabus + the current chapter AA links.
    Accessible to teacher and enrolled students.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()
        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'Access denied'}), 403

        tn_chapter, syllabus = _get_tn_chapter_for(chapter)
        if not syllabus:
            return jsonify({'error': 'No TN syllabus found for this course'}), 404
        if not tn_chapter:
            return jsonify({'error': 'No TN chapter matches this course chapter'}), 404

        all_aas = sorted(getattr(syllabus, 'tn_aa', []), key=lambda a: int(a.number))
        current_aa_ids = [link.aa_id for link in (tn_chapter.aa_links or [])]

        return jsonify({
            'tn_chapter_id': tn_chapter.id,
            'all_aas': [
                {'id': aa.id, 'number': aa.number, 'description': aa.description}
                for aa in all_aas
            ],
            'current_aa_ids': current_aa_ids,
            'can_edit': is_teacher,
        }), 200

    except Exception as e:
        logger.error(f"Error getting AA matching: {e}")
        return jsonify({'error': str(e)}), 500


@chapters_api_bp.route('/<int:chapter_id>/aa-matching/propose', methods=['POST'])
@jwt_required()
def propose_aa_matching(chapter_id):
    """
    Use Gemini to propose which AAs best match this chapter.
    Returns a list of proposed aa_ids (not saved).
    Teachers only.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course
        if not (user.is_teacher and course.teacher_id == user.id):
            return jsonify({'error': 'Access denied'}), 403

        tn_chapter, syllabus = _get_tn_chapter_for(chapter)
        if not syllabus or not tn_chapter:
            return jsonify({'error': 'No TN syllabus / TN chapter found'}), 404

        all_aas = sorted(getattr(syllabus, 'tn_aa', []), key=lambda a: int(a.number))
        if not all_aas:
            return jsonify({'error': 'No AAs found in syllabus'}), 404

        # Build context: chapter title + section titles
        section_titles = [f"- {s.index}: {s.title}" for s in (tn_chapter.sections or [])]
        sections_text = "\n".join(section_titles) if section_titles else "(aucune section)"
        aa_list_text = "\n".join([f"AA{aa.number}: {aa.description}" for aa in all_aas])

        prompt = (
            f"Tu es un expert pédagogique. Voici un chapitre de cours:\n"
            f"Titre du chapitre: {tn_chapter.title}\n"
            f"Sections:\n{sections_text}\n\n"
            f"Voici la liste des Acquis d'Apprentissage (AA) du syllabus:\n{aa_list_text}\n\n"
            f"Indique UNIQUEMENT les numéros des AA qui correspondent à ce chapitre, "
            f"sous forme d'une liste JSON de nombres entiers. "
            f"Exemple: [1, 3, 5]. Ne fournis rien d'autre que ce tableau JSON."
        )

        api_key = current_app.config.get('GOOGLE_API_KEY')
        model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
        llm = ChatGoogleGenerativeAI(model=model_name, google_api_key=api_key, temperature=0.1, max_tokens=512)
        response = llm.invoke([
            SystemMessage(content="Tu es un expert pédagogique. Réponds uniquement avec un tableau JSON d'entiers."),
            HumanMessage(content=prompt),
        ])

        import json, re
        raw = response.content.strip()
        match = re.search(r'\[[\d,\s]*\]', raw)
        if not match:
            return jsonify({'error': 'Model did not return a valid JSON array', 'raw': raw}), 500

        proposed_numbers = json.loads(match.group(0))
        aa_number_to_id = {aa.number: aa.id for aa in all_aas}
        proposed_ids = [aa_number_to_id[n] for n in proposed_numbers if n in aa_number_to_id]

        return jsonify({'proposed_aa_ids': proposed_ids}), 200

    except Exception as e:
        logger.error(f"Error proposing AA matching: {e}")
        return jsonify({'error': str(e)}), 500


@chapters_api_bp.route('/<int:chapter_id>/aa-matching', methods=['PUT'])
@jwt_required()
def save_aa_matching(chapter_id):
    """
    Save (replace) the chapter's AA links.
    Body: { "aa_ids": [<int>, ...] }
    Teachers only.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course
        if not (user.is_teacher and course.teacher_id == user.id):
            return jsonify({'error': 'Access denied'}), 403

        tn_chapter, syllabus = _get_tn_chapter_for(chapter)
        if not syllabus or not tn_chapter:
            return jsonify({'error': 'No TN syllabus / TN chapter found'}), 404

        body = request.get_json(silent=True) or {}
        new_aa_ids = set(int(i) for i in body.get('aa_ids', []))

        # Validate that all submitted IDs belong to this syllabus
        valid_ids = {aa.id for aa in getattr(syllabus, 'tn_aa', [])}
        invalid = new_aa_ids - valid_ids
        if invalid:
            return jsonify({'error': f'Unknown AA ids: {invalid}'}), 400

        # Delete old links then create new ones
        TNChapterAA.query.filter_by(chapter_id=tn_chapter.id).delete()
        for aa_id in new_aa_ids:
            db.session.add(TNChapterAA(chapter_id=tn_chapter.id, aa_id=aa_id))
        db.session.commit()

        return jsonify({
            'message': 'AA matching saved',
            'aa_ids': list(new_aa_ids),
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error saving AA matching: {e}")
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Section restructuring from uploaded document
# ---------------------------------------------------------------------------

def _get_tn_chapter_for(chapter):
    """Return the TNChapter linked to a Chapter, or None."""
    syllabus = SyllabusService.get_syllabus_by_course(chapter.course_id)
    if not syllabus or (syllabus.syllabus_type or '').lower() != 'tn':
        return None, None
    for tnc in (syllabus.tn_chapters or []):
        if tnc.index == chapter.order:
            return tnc, syllabus
    return None, syllabus


@chapters_api_bp.route('/<int:chapter_id>/sections/extract-from-document', methods=['POST'])
@jwt_required()
def extract_sections_from_document(chapter_id):
    """
    Analyse the latest uploaded document of a chapter with Gemini
    and return a proposed section structure (preview only, nothing saved).

    Optional body: { "document_id": <int> }  to use a specific document.

    Response:
      {
        "proposed_sections": [
          { "index": "1.1", "title": "..." },
          ...
        ],
        "source_document": { "id": ..., "title": ... },
        "current_sections": [ { "index": "1.1", "title": "..." }, ... ]
      }
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        if not (user.is_teacher and course.teacher_id == user.id) and not user.is_superuser:
            return jsonify({'error': 'Access denied'}), 403

        # Pick the document to analyse
        data = request.get_json(silent=True) or {}
        doc_id = data.get('document_id')
        if doc_id:
            doc = Document.query.filter_by(id=doc_id, chapter_id=chapter_id).first()
            if not doc:
                return jsonify({'error': 'Document not found in this chapter'}), 404
        else:
            # Most recently uploaded document
            doc = chapter.documents.order_by(Document.created_at.desc()).first()
            if not doc:
                return jsonify({'error': 'No documents uploaded to this chapter yet'}), 400

        if not doc.file_path:
            return jsonify({'error': 'Document has no associated file'}), 400

        # Extract text
        from app.services.file_service import get_file_path, extract_text_from_file
        full_path = get_file_path(doc.file_path.replace('\\', '/'))
        if not os.path.exists(full_path):
            return jsonify({'error': 'File not found on disk'}), 404

        text = extract_text_from_file(full_path)
        if not text or len(text.strip()) < 50:
            return jsonify({'error': 'Could not extract readable text from document'}), 422

        # Current sections (for comparison in frontend)
        tn_chapter, _ = _get_tn_chapter_for(chapter)
        current_sections = []
        if tn_chapter:
            current_sections = [
                {'index': s.index, 'title': s.title}
                for s in sorted(tn_chapter.sections, key=lambda s: s.index)
            ]

        # Determine chapter index label (e.g. "I", "II", or numeric)
        chapter_label = str(chapter.order)

        # Call Gemini to extract structure
        api_key = current_app.config.get('GOOGLE_API_KEY', '')
        if not api_key:
            return jsonify({'error': 'GOOGLE_API_KEY not configured'}), 500

        model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
        llm = ChatGoogleGenerativeAI(model=model, google_api_key=api_key, temperature=0)

        prompt = f"""Tu analyses le contenu d'un document de cours universitaire (chapitre {chapter_label} : "{chapter.title}").

Ton objectif : identifier la structure hiérarchique (sections et sous-sections) du document.

RÈGLES STRICTES :
1. Retourne UNIQUEMENT un tableau JSON valide, rien d'autre.
2. Chaque élément a exactement deux clés : "index" (string, ex: "1.1") et "title" (string).
3. L'indexation suit le schéma : sections principales = "{chapter_label}.1", "{chapter_label}.2"... sous-sections = "{chapter_label}.1.1", "{chapter_label}.1.2"...
4. Maximum 15 sections/sous-sections au total.
5. Les titres sont en français ou dans la langue du document.
6. Si le document ne contient pas de structure claire, génère-en une cohérente avec le contenu.

CONTENU DU DOCUMENT (premiers 6000 caractères) :
{text[:6000]}

RÉPONSE (JSON pur uniquement) :"""

        response = llm.invoke([
            SystemMessage(content="Tu es un expert en structuration de contenus pédagogiques universitaires. Tu réponds uniquement en JSON valide."),
            HumanMessage(content=prompt),
        ])

        raw = response.content.strip()
        # Clean markdown code blocks if present
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        raw = raw.strip()

        import json as _json
        try:
            proposed = _json.loads(raw)
        except _json.JSONDecodeError:
            # Try to extract array from text
            import re
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            if match:
                proposed = _json.loads(match.group())
            else:
                return jsonify({'error': 'Gemini returned invalid JSON', 'raw': raw[:500]}), 500

        # Validate structure
        if not isinstance(proposed, list):
            return jsonify({'error': 'Expected a JSON array from Gemini', 'raw': raw[:300]}), 500

        clean = []
        for item in proposed:
            if isinstance(item, dict) and 'index' in item and 'title' in item:
                clean.append({'index': str(item['index']), 'title': str(item['title'])})

        if not clean:
            return jsonify({'error': 'No valid sections extracted from document'}), 422

        return jsonify({
            'proposed_sections': clean,
            'source_document': {'id': doc.id, 'title': doc.title},
            'current_sections': current_sections,
        })

    except Exception as e:
        logger.error(f"Error extracting sections from document: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@chapters_api_bp.route('/<int:chapter_id>/sections/apply-structure', methods=['POST'])
@jwt_required()
def apply_section_structure(chapter_id):
    """
    Replace TNSection records with a teacher-validated structure.

    Body:
      {
        "sections": [
          { "index": "1.1", "title": "..." },
          ...
        ]
      }

    - Deletes existing TNSection rows (and their AA links / SectionContent)
    - Creates new TNSection rows
    - Returns updated tn_chapter with sections
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        if not (user.is_teacher and course.teacher_id == user.id) and not user.is_superuser:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json() or {}
        sections_data = data.get('sections', [])

        if not sections_data or not isinstance(sections_data, list):
            return jsonify({'error': 'sections array is required'}), 400

        # Validate each section
        validated = []
        seen_indexes = set()
        for item in sections_data:
            idx = str(item.get('index', '')).strip()
            title = str(item.get('title', '')).strip()
            if not idx or not title:
                return jsonify({'error': f'Each section needs a non-empty index and title. Got: {item}'}), 400
            if idx in seen_indexes:
                return jsonify({'error': f'Duplicate section index: {idx}'}), 400
            seen_indexes.add(idx)
            validated.append({'index': idx, 'title': title})

        # Find TNChapter
        tn_chapter, syllabus = _get_tn_chapter_for(chapter)
        if not tn_chapter:
            return jsonify({'error': 'No TN syllabus or TNChapter found for this chapter'}), 404

        from app.models import TNSection, SectionContent

        # Delete existing sections (cascades to TNSectionAA and SectionContent)
        TNSection.query.filter_by(chapter_id=tn_chapter.id).delete()
        db.session.flush()

        # Create new sections
        new_sections = []
        for item in validated:
            s = TNSection(
                chapter_id=tn_chapter.id,
                index=item['index'],
                title=item['title'],
            )
            db.session.add(s)
            new_sections.append(s)

        db.session.commit()

        return jsonify({
            'message': f'{len(new_sections)} sections applied successfully',
            'tn_chapter_id': tn_chapter.id,
            'sections': [{'id': s.id, 'index': s.index, 'title': s.title} for s in new_sections],
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error applying section structure: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
