from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import User, Document, ChatSession, ChatMessage, Enrollment, Chapter, Course
from app.services.chat_service import get_chat_response
from app.services.vector_store import VectorStore
from app.services.document_pipeline import reprocess_document as reprocess_pdf_document
import logging

logger = logging.getLogger(__name__)

ai_api_bp = Blueprint('ai_api', __name__, url_prefix='/ai')


# ============================================================
# DOCUMENT CHAT ENDPOINTS
# ============================================================

@ai_api_bp.route('/chat/<int:document_id>', methods=['POST'])
@jwt_required()
def send_document_chat(document_id):
    """
    Send a message in document chat.
    Request body: {message: str}
    Returns: {success: bool, response: str, message_id: int, citations: list, tool_usage: dict}
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
            course = Course.query.get(document.course_id)
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Check if document is processed; if not, try one automatic reprocess for PDF files
        vector_store = VectorStore(document_id=str(document_id))
        if not vector_store.collection_exists() and document.file_type == 'pdf' and document.file_path:
            try:
                from flask import current_app
                import os
                normalized_path = document.file_path.replace('\\', '/')
                full_path = os.path.join(current_app.config['UPLOAD_FOLDER'], normalized_path)
                if os.path.exists(full_path):
                    logger.info(f"Document {document_id} not indexed. Attempting automatic reprocess from {full_path}")
                    success, stats = reprocess_pdf_document(
                        document_id=document.id,
                        pdf_path=full_path,
                        document_name=document.title,
                    )
                    logger.info(f"Automatic reprocess result for document {document_id}: success={success}, stats={stats}")
                    vector_store = VectorStore(document_id=str(document_id))
            except Exception as reprocess_error:
                logger.warning(f"Automatic document reprocess failed for chat {document_id}: {reprocess_error}")

        if not vector_store.collection_exists():
            return jsonify({
                'error': 'Document not processed for AI chat. Le document doit etre retraite et contenir du texte extractible avant d activer le chat.'
            }), 400

        # Get message from request
        data = request.get_json() or {}
        user_message = data.get('message', '').strip()

        if not user_message:
            return jsonify({'error': 'Message is required'}), 400

        # Get or create chat session
        chat_session = ChatSession.query.filter_by(
            user_id=user.id,
            document_id=document_id,
            chapter_id=None
        ).first()

        if not chat_session:
            chat_session = ChatSession(
                user_id=user.id,
                document_id=document_id,
                chapter_id=None
            )
            db.session.add(chat_session)
            db.session.flush()

        # Get chat history
        chat_history = []
        previous_messages = ChatMessage.query.filter_by(
            session_id=chat_session.id
        ).order_by(ChatMessage.timestamp.asc()).all()

        for msg in previous_messages:
            chat_history.append({
                'role': 'user' if msg.is_user else 'assistant',
                'content': msg.content
            })

        # Save user message
        user_chat_message = ChatMessage(
            session_id=chat_session.id,
            content=user_message,
            is_user=True
        )
        db.session.add(user_chat_message)
        db.session.flush()

        # Get AI response
        response_data = get_chat_response(
            user_message=user_message,
            document_id=document_id,
            chat_history=chat_history
        )

        ai_response = response_data.get('response', '')
        citations = response_data.get('citations', [])
        tool_usage = response_data.get('tool_usage', {})

        # Save AI response
        ai_chat_message = ChatMessage(
            session_id=chat_session.id,
            content=ai_response,
            is_user=False
        )
        db.session.add(ai_chat_message)
        db.session.commit()

        return jsonify({
            'success': True,
            'response': ai_response,
            'message_id': ai_chat_message.id,
            'citations': citations,
            'tool_usage': tool_usage
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in document chat: {str(e)}")
        return jsonify({'error': str(e)}), 500


@ai_api_bp.route('/chat/<int:document_id>/history', methods=['GET'])
@jwt_required()
def get_document_chat_history(document_id):
    """
    Get chat history for a document.
    Returns: {messages: [{id, content, is_user, timestamp}], total: int}
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
            course = Course.query.get(document.course_id)
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Get chat session
        chat_session = ChatSession.query.filter_by(
            user_id=user.id,
            document_id=document_id,
            chapter_id=None
        ).first()

        if not chat_session:
            return jsonify({'messages': [], 'total': 0}), 200

        # Get messages
        messages = ChatMessage.query.filter_by(
            session_id=chat_session.id
        ).order_by(ChatMessage.timestamp.asc()).all()

        messages_data = []
        for msg in messages:
            messages_data.append({
                'id': msg.id,
                'content': msg.content,
                'is_user': msg.is_user,
                'timestamp': msg.timestamp.isoformat() if msg.timestamp else None
            })

        return jsonify({
            'messages': messages_data,
            'total': len(messages)
        }), 200

    except Exception as e:
        logger.error(f"Error getting chat history: {str(e)}")
        return jsonify({'error': str(e)}), 500


@ai_api_bp.route('/chat/<int:document_id>/clear', methods=['POST'])
@jwt_required()
def clear_document_chat(document_id):
    """
    Clear chat history for a document.
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
            course = Course.query.get(document.course_id)
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Get chat session
        chat_session = ChatSession.query.filter_by(
            user_id=user.id,
            document_id=document_id,
            chapter_id=None
        ).first()

        if chat_session:
            # Delete all messages
            ChatMessage.query.filter_by(session_id=chat_session.id).delete()
            db.session.commit()

        return jsonify({'message': 'Chat history cleared'}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error clearing chat: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# CHAPTER CHAT ENDPOINTS (Multi-document)
# ============================================================

@ai_api_bp.route('/chapter-chat/<int:chapter_id>', methods=['POST'])
@jwt_required()
def send_chapter_chat(chapter_id):
    """
    Send a message in chapter chat (multi-document).
    Request body: {message: str}
    Returns: {success: bool, response: str, message_id: int, citations: list, tool_usage: dict}
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        # Check access
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Collect processed documents
        processed_documents = []
        for doc in chapter.documents:
            # Create a VectorStore instance for each document to check if it's processed
            doc_vector_store = VectorStore(document_id=str(doc.id))
            if doc_vector_store.collection_exists():
                processed_documents.append(doc.id)

        if not processed_documents:
            return jsonify({
                'error': 'No processed documents available for this chapter. Please ask the teacher to process documents.'
            }), 400

        # Get message from request
        data = request.get_json() or {}
        user_message = data.get('message', '').strip()

        if not user_message:
            return jsonify({'error': 'Message is required'}), 400

        # Get or create chat session
        chat_session = ChatSession.query.filter_by(
            user_id=user.id,
            document_id=processed_documents[0],  # Use first doc as anchor
            chapter_id=chapter_id
        ).first()

        if not chat_session:
            chat_session = ChatSession(
                user_id=user.id,
                document_id=processed_documents[0],
                chapter_id=chapter_id
            )
            db.session.add(chat_session)
            db.session.flush()

        # Get chat history
        chat_history = []
        previous_messages = ChatMessage.query.filter_by(
            session_id=chat_session.id
        ).order_by(ChatMessage.timestamp.asc()).all()

        for msg in previous_messages:
            chat_history.append({
                'role': 'user' if msg.is_user else 'assistant',
                'content': msg.content
            })

        # Save user message
        user_chat_message = ChatMessage(
            session_id=chat_session.id,
            content=user_message,
            is_user=True
        )
        db.session.add(user_chat_message)
        db.session.flush()

        # Get AI response (multi-document mode)
        response_data = get_chat_response(
            user_message=user_message,
            document_ids=processed_documents,
            chat_history=chat_history
        )

        ai_response = response_data.get('response', '')
        citations = response_data.get('citations', [])
        tool_usage = response_data.get('tool_usage', {})

        # Save AI response
        ai_chat_message = ChatMessage(
            session_id=chat_session.id,
            content=ai_response,
            is_user=False
        )
        db.session.add(ai_chat_message)
        db.session.commit()

        return jsonify({
            'success': True,
            'response': ai_response,
            'message_id': ai_chat_message.id,
            'citations': citations,
            'tool_usage': tool_usage
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in chapter chat: {str(e)}")
        return jsonify({'error': str(e)}), 500


@ai_api_bp.route('/chapter-chat/<int:chapter_id>/history', methods=['GET'])
@jwt_required()
def get_chapter_chat_history(chapter_id):
    """
    Get chat history for a chapter.
    Returns: {messages: [{id, content, is_user, timestamp}], total: int}
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        # Check access
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Get chat session
        chat_session = ChatSession.query.filter_by(
            user_id=user.id,
            chapter_id=chapter_id
        ).first()

        if not chat_session:
            return jsonify({'messages': [], 'total': 0}), 200

        # Get messages
        messages = ChatMessage.query.filter_by(
            session_id=chat_session.id
        ).order_by(ChatMessage.timestamp.asc()).all()

        messages_data = []
        for msg in messages:
            messages_data.append({
                'id': msg.id,
                'content': msg.content,
                'is_user': msg.is_user,
                'timestamp': msg.timestamp.isoformat() if msg.timestamp else None
            })

        return jsonify({
            'messages': messages_data,
            'total': len(messages)
        }), 200

    except Exception as e:
        logger.error(f"Error getting chapter chat history: {str(e)}")
        return jsonify({'error': str(e)}), 500


@ai_api_bp.route('/chapter-chat/<int:chapter_id>/clear', methods=['POST'])
@jwt_required()
def clear_chapter_chat(chapter_id):
    """
    Clear chat history for a chapter.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        chapter = Chapter.query.get_or_404(chapter_id)
        course = chapter.course

        # Check access
        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Get chat session
        chat_session = ChatSession.query.filter_by(
            user_id=user.id,
            chapter_id=chapter_id
        ).first()

        if chat_session:
            # Delete all messages
            ChatMessage.query.filter_by(session_id=chat_session.id).delete()
            db.session.commit()

        return jsonify({'message': 'Chapter chat history cleared'}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error clearing chapter chat: {str(e)}")
        return jsonify({'error': str(e)}), 500
