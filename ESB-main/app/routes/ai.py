from flask import Blueprint, render_template, redirect, url_for, flash, request, abort, jsonify, session
from flask_login import current_user, login_required
from flask_wtf import FlaskForm
from wtforms import TextAreaField, SubmitField
from wtforms.validators import DataRequired
from app import db  # Import the main Flask app instance
from app.models import Document, ChatSession, ChatMessage, Enrollment, Chapter, Course
from app.services.chat_service import get_chat_response
from app.services.vector_store import VectorStore

ai_bp = Blueprint('ai', __name__, url_prefix='/ai')

# Forms
class ChatForm(FlaskForm):
    message = TextAreaField('Your Question', validators=[DataRequired()])
    submit = SubmitField('Send')

# Routes
@ai_bp.route('/chat/<int:document_id>', methods=['GET', 'POST'])
@login_required
def chat(document_id):
    document = Document.query.get_or_404(document_id)
    chapter = document.chapter
    course = chapter.course
    
    # Check if user has access to this course
    if not current_user.is_teacher and not Enrollment.query.filter_by(
            student_id=current_user.id, course_id=course.id).first():
        flash('You need to enroll in this course first.', 'warning')
        return redirect(url_for('courses.enroll', course_id=course.id))
    
    # Get or create chat session
    session = ChatSession.query.filter_by(
        user_id=current_user.id,
        document_id=document_id
    ).first()
    
    if not session:
        session = ChatSession(
            user_id=current_user.id,
            document_id=document_id
        )
        db.session.add(session)
        db.session.commit()
    
    # Get previous messages
    messages = session.messages.order_by(ChatMessage.timestamp).all()
    
    form = ChatForm()
    if form.validate_on_submit():
        # Save user message
        user_message = ChatMessage(
            session_id=session.id,
            content=form.message.data,
            is_user=True
        )
        db.session.add(user_message)
        db.session.commit()
        
        # Generate AI response using RAG-powered agent
        try:
            # Use direct RAG (same pattern as quiz generation)
            agent_result = get_chat_response(
                user_message=form.message.data,
                document_id=document_id,
                chat_history=messages
            )

            ai_content = agent_result.get('response', 'I apologize, but I could not generate a response.')
            citations = agent_result.get('citations', [])

            # Save AI response (store citations as JSON in a separate field if needed)
            ai_message = ChatMessage(
                session_id=session.id,
                content=ai_content,
                is_user=False
            )
            db.session.add(ai_message)
            db.session.commit()

            # Refresh messages list
            messages = session.messages.order_by(ChatMessage.timestamp).all()

            # Flash citations to user
            if citations:
                citation_text = "Sources: " + ", ".join([f"Section {c.get('section', 'N/A')} (p.{c.get('page', 'N/A')})" for c in citations[:3]])
                flash(citation_text, 'info')

        except Exception as e:
            flash(f'Failed to get AI response: {str(e)}', 'danger')
        
        # Clear the form
        form.message.data = ''
    
    return render_template('ai/chat.html',
                          title=f'Chat about {document.title}',
                          document=document,
                          chapter=chapter,
                          course=course,
                          form=form,
                          messages=messages,
                          is_chapter_chat=False,
                          summary=document.summary,
                          chapter_id=None)  # Pass None for chapter_id in document chats

@ai_bp.route('/chapter-chat/<int:chapter_id>', methods=['GET', 'POST'])
@login_required
def chapter_chat(chapter_id):
    """Chat interface for asking questions about an entire chapter (now unified with document chat)"""

    # Get the chapter
    chapter = Chapter.query.get_or_404(chapter_id)
    course = chapter.course

    # Check if user has access to this course
    if not current_user.is_teacher and not Enrollment.query.filter_by(
            student_id=current_user.id, course_id=course.id).first():
        flash('You need to enroll in this course first.', 'warning')
        return redirect(url_for('courses.enroll', course_id=course.id))

    # Collect ALL processed documents in this chapter
    processed_docs = []
    if chapter.documents:
        for doc in chapter.documents:
            try:
                vs_check = VectorStore(document_id=str(doc.id))
                if vs_check.collection_exists():
                    processed_docs.append(doc)
            except Exception:
                continue

    # Primary document for session tracking (first processed, or first overall)
    document = processed_docs[0] if processed_docs else (
        chapter.documents.first() if chapter.documents else None
    )

    if not document:
        flash('This chapter has no documents uploaded yet.', 'warning')
        return redirect(url_for('courses.view', course_id=course.id))

    # Get or create chat session (now using database storage)
    chat_session = ChatSession.query.filter_by(
        user_id=current_user.id,
        document_id=document.id,
        chapter_id=chapter_id  # Mark this as chapter-wide chat
    ).first()

    if not chat_session:
        chat_session = ChatSession(
            user_id=current_user.id,
            document_id=document.id,
            chapter_id=chapter_id
        )
        db.session.add(chat_session)
        db.session.commit()

    # Get previous messages
    messages = chat_session.messages.order_by(ChatMessage.timestamp).all()

    form = ChatForm()
    if form.validate_on_submit():
        # Save user message
        user_message = ChatMessage(
            session_id=chat_session.id,
            content=form.message.data,
            is_user=True
        )
        db.session.add(user_message)
        db.session.commit()

        # Generate AI response using RAG-powered agent
        try:
            # Pass all processed doc IDs for multi-document best-doc selection
            agent_result = get_chat_response(
                user_message=form.message.data,
                document_id=document.id,
                document_ids=[d.id for d in processed_docs] if len(processed_docs) > 1 else None,
                chat_history=messages
            )

            ai_content = agent_result.get('response', 'I apologize, but I could not generate a response.')
            citations = agent_result.get('citations', [])

            # Save AI response
            ai_message = ChatMessage(
                session_id=chat_session.id,
                content=ai_content,
                is_user=False
            )
            db.session.add(ai_message)
            db.session.commit()

            # Refresh messages list
            messages = chat_session.messages.order_by(ChatMessage.timestamp).all()

            # Flash citations to user
            if citations:
                citation_text = "Sources: " + ", ".join([f"Section {c.get('section', 'N/A')} (p.{c.get('page', 'N/A')})" for c in citations[:3]])
                flash(citation_text, 'info')

        except Exception as e:
            flash(f'Failed to get AI response: {str(e)}', 'danger')

        # Clear the form
        form.message.data = ''

    return render_template('ai/chat.html',
                         title=f'Chat about Chapter: {chapter.title}',
                         document=document,
                         chapter=chapter,
                         course=course,
                         form=form,
                         messages=messages,
                         is_chapter_chat=True,
                         summary=chapter.summary or "No summary available",
                         chapter_id=chapter_id)
@ai_bp.route('/api/chat/<int:document_id>', methods=['POST'])
@login_required
def api_chat(document_id):
    document = Document.query.get_or_404(document_id)
    chapter = document.chapter
    course = chapter.course
    
    # Check if user has access to this course
    if not current_user.is_teacher and not Enrollment.query.filter_by(
            student_id=current_user.id, course_id=course.id).first():
        return jsonify({'error': 'Access denied'}), 403
    
    # Get or create chat session
    session = ChatSession.query.filter_by(
        user_id=current_user.id,
        document_id=document_id
    ).first()
    
    if not session:
        session = ChatSession(
            user_id=current_user.id,
            document_id=document_id
        )
        db.session.add(session)
        db.session.commit()
    
    # Get user message from request
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'No message provided'}), 400
    
    user_message_text = data['message']
    
    # Save user message
    user_message = ChatMessage(
        session_id=session.id,
        content=user_message_text,
        is_user=True
    )
    db.session.add(user_message)
    db.session.commit()
    
    # Get previous messages for context
    messages = session.messages.order_by(ChatMessage.timestamp).all()
    
    try:
        # Generate AI response using direct RAG (same as quiz generation)
        agent_result = get_chat_response(
            user_message=user_message_text,
            document_id=document_id,
            chat_history=messages
        )

        ai_content = agent_result.get('response', 'I apologize, but I could not generate a response.')
        citations = agent_result.get('citations', [])
        tool_usage = agent_result.get('tool_usage', [])

        # Save AI response
        ai_message = ChatMessage(
            session_id=session.id,
            content=ai_content,
            is_user=False
        )
        db.session.add(ai_message)
        db.session.commit()

        return jsonify({
            'success': True,
            'response': ai_content,
            'message_id': ai_message.id,
            'citations': citations,
            'tool_usage': tool_usage
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@ai_bp.route('/api/chapter-chat/<int:chapter_id>', methods=['POST'])
@login_required
def api_chapter_chat(chapter_id):
    """API endpoint for chapter-wide chat (now unified with database storage)"""
    chapter = Chapter.query.get_or_404(chapter_id)
    course = chapter.course

    # Check if user has access to this course
    if not current_user.is_teacher and not Enrollment.query.filter_by(
            student_id=current_user.id, course_id=course.id).first():
        return jsonify({'error': 'Access denied'}), 403

    # Collect ALL processed documents in this chapter
    processed_docs = []
    if chapter.documents:
        for doc in chapter.documents:
            try:
                vs_check = VectorStore(document_id=str(doc.id))
                if vs_check.collection_exists():
                    processed_docs.append(doc)
            except Exception:
                continue

    # Primary document for session tracking (first processed, or first overall)
    document = processed_docs[0] if processed_docs else (
        chapter.documents.first() if chapter.documents else None
    )

    if not document:
        return jsonify({'error': 'No documents available in this chapter'}), 400

    # Get user message from request
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'No message provided'}), 400

    user_message_text = data['message']

    # Get or create chat session (database storage)
    chat_session = ChatSession.query.filter_by(
        user_id=current_user.id,
        document_id=document.id,
        chapter_id=chapter_id
    ).first()

    if not chat_session:
        chat_session = ChatSession(
            user_id=current_user.id,
            document_id=document.id,
            chapter_id=chapter_id
        )
        db.session.add(chat_session)
        db.session.commit()

    # Save user message
    user_message = ChatMessage(
        session_id=chat_session.id,
        content=user_message_text,
        is_user=True
    )
    db.session.add(user_message)
    db.session.commit()

    # Get previous messages for context
    messages = chat_session.messages.order_by(ChatMessage.timestamp).all()

    try:
        # Pass all processed doc IDs for multi-document best-doc selection
        agent_result = get_chat_response(
            user_message=user_message_text,
            document_id=document.id,
            document_ids=[d.id for d in processed_docs] if len(processed_docs) > 1 else None,
            chat_history=messages
        )

        ai_content = agent_result.get('response', 'I apologize, but I could not generate a response.')
        citations = agent_result.get('citations', [])
        tool_usage = agent_result.get('tool_usage', [])

        # Save AI response
        ai_message = ChatMessage(
            session_id=chat_session.id,
            content=ai_content,
            is_user=False
        )
        db.session.add(ai_message)
        db.session.commit()

        return jsonify({
            'success': True,
            'response': ai_content,
            'message_id': ai_message.id,
            'citations': citations,
            'tool_usage': tool_usage
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@ai_bp.route('/clear/<int:document_id>', methods=['POST'])
@login_required
def clear_chat(document_id):
    session = ChatSession.query.filter_by(
        user_id=current_user.id,
        document_id=document_id
    ).first()
    
    if session:
        # Delete all messages
        ChatMessage.query.filter_by(session_id=session.id).delete()
        db.session.commit()
        flash('Chat history has been cleared.', 'success')
    
    return redirect(url_for('ai.chat', document_id=document_id))

@ai_bp.route('/chapter-chat/<int:chapter_id>/clear', methods=['POST'])
@login_required
def clear_chapter_chat(chapter_id):
    """Clear chat history for a chapter"""
    chapter_session_id = f"chapter_{chapter_id}"
    if 'chapter_chat_history' in session and chapter_session_id in session['chapter_chat_history']:
        session['chapter_chat_history'].pop(chapter_session_id)
        session.modified = True
        flash('Chat history has been cleared.', 'success')
    
    return redirect(url_for('ai.chapter_chat', chapter_id=chapter_id))