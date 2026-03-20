"""
Practical Work (TP Code) API
==============================
Endpoints for teacher/student interactions with code-based practical works.

Teacher flow:
  POST   /sections/<id>/practical-work                  Create TP (manual or AI-generated)
  PUT    /practical-work/<tp_id>                         Update TP (statement, aa_codes, etc.)
  POST   /practical-work/<tp_id>/generate-statement      AI: generate statement
  POST   /practical-work/<tp_id>/suggest-aa              AI: suggest AA codes
  POST   /practical-work/<tp_id>/generate-reference      AI: generate reference solution
  PUT    /practical-work/<tp_id>/publish                 Publish TP
  DELETE /practical-work/<tp_id>                         Delete TP
  GET    /practical-work/<tp_id>/submissions             List student submissions

Student flow:
  GET    /sections/<id>/practical-work                   List published TPs in section
  GET    /practical-work/<tp_id>                         View TP (statement only)
  POST   /practical-work/<tp_id>/submit                  Submit code
  GET    /practical-work/<tp_id>/my-submission           Get my latest submission

Grade flow:
  PUT    /practical-work/submissions/<sub_id>/grade      Teacher validates/modifies grade
"""

import logging
import threading
from datetime import datetime

from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api.v1 import api_v1_bp
from app import db
from app.models import User, TNSection, PracticalWork, PracticalWorkSubmission, Enrollment

logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_user():
    return User.query.get(int(get_jwt_identity()))


def _section_access(section: TNSection, user: User):
    """Return (is_teacher, is_enrolled)."""
    try:
        course = section.chapter.syllabus.course
    except AttributeError:
        return False, False
    is_teacher = user.is_teacher and course.teacher_id == user.id
    is_enrolled = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())
    return is_teacher, is_enrolled


def _tp_access(tp: PracticalWork, user: User):
    """Return (is_teacher, is_enrolled)."""
    section = TNSection.query.get(tp.section_id)
    if not section:
        return False, False
    return _section_access(section, user)


# ─── List / Create TP ────────────────────────────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/practical-work', methods=['GET'])
@jwt_required()
def list_practical_works(section_id):
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, is_enrolled = _section_access(section, user)

    if not (is_teacher or is_enrolled):
        return jsonify({'error': 'Access denied'}), 403

    query = PracticalWork.query.filter_by(section_id=section_id)
    if not is_teacher:
        query = query.filter_by(status='published')

    tps = query.order_by(PracticalWork.created_at.desc()).all()
    return jsonify({'practical_works': [tp.to_dict() for tp in tps]})


@api_v1_bp.route('/sections/<int:section_id>/practical-work', methods=['POST'])
@jwt_required()
def create_practical_work(section_id):
    """Teacher creates a new TP (initially draft, without AI)."""
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)

    if not is_teacher:
        return jsonify({'error': 'Teacher access required'}), 403

    data = request.get_json() or {}
    title = data.get('title', '').strip()
    language = data.get('language', 'python').lower()
    max_grade = float(data.get('max_grade', 20.0))

    if not title:
        return jsonify({'error': 'title is required'}), 400

    VALID_LANGS = ['python', 'sql', 'r', 'java', 'c', 'cpp']
    if language not in VALID_LANGS:
        return jsonify({'error': f'language must be one of {VALID_LANGS}'}), 400

    tp = PracticalWork(
        section_id=section_id,
        title=title,
        language=language,
        max_grade=max_grade,
        statement=data.get('statement', ''),
        statement_source='teacher',
        aa_codes=data.get('aa_codes', []),
        status='draft',
        tp_nature=data.get('tp_nature', 'formative'),
    )
    db.session.add(tp)
    db.session.commit()

    return jsonify({'practical_work': tp.to_dict(include_solution=True)}), 201


# ─── Get / Update / Delete TP ────────────────────────────────────────────────

@api_v1_bp.route('/practical-work/<int:tp_id>', methods=['GET'])
@jwt_required()
def get_practical_work(tp_id):
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, is_enrolled = _tp_access(tp, user)

    if not (is_teacher or is_enrolled):
        return jsonify({'error': 'Access denied'}), 403
    if not is_teacher and tp.status != 'published':
        return jsonify({'error': 'TP not published yet'}), 403

    return jsonify({'practical_work': tp.to_dict(include_solution=is_teacher)})


@api_v1_bp.route('/practical-work/<int:tp_id>', methods=['PUT'])
@jwt_required()
def update_practical_work(tp_id):
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, _ = _tp_access(tp, user)

    if not is_teacher:
        return jsonify({'error': 'Teacher access required'}), 403

    data = request.get_json() or {}
    if 'title' in data:
        tp.title = data['title'].strip()
    if 'language' in data:
        tp.language = data['language'].lower()
    if 'max_grade' in data:
        tp.max_grade = float(data['max_grade'])
    if 'statement' in data:
        tp.statement = data['statement']
        tp.statement_source = 'teacher'
    if 'aa_codes' in data:
        tp.aa_codes = data['aa_codes']
    if 'reference_solution' in data:
        tp.reference_solution = data['reference_solution']
    if 'reference_validated' in data:
        tp.reference_validated = bool(data['reference_validated'])
    if 'correction_criteria' in data:
        tp.correction_criteria = data['correction_criteria']
    if 'tp_nature' in data:
        tp.tp_nature = data['tp_nature']

    tp.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'practical_work': tp.to_dict(include_solution=True)})


@api_v1_bp.route('/practical-work/<int:tp_id>/publish', methods=['PUT'])
@jwt_required()
def publish_practical_work(tp_id):
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, _ = _tp_access(tp, user)

    if not is_teacher:
        return jsonify({'error': 'Teacher access required'}), 403
    if not tp.statement:
        return jsonify({'error': 'Cannot publish TP without a statement'}), 400

    tp.status = 'published'
    tp.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'practical_work': tp.to_dict()})


@api_v1_bp.route('/practical-work/<int:tp_id>', methods=['DELETE'])
@jwt_required()
def delete_practical_work(tp_id):
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, _ = _tp_access(tp, user)

    if not is_teacher:
        return jsonify({'error': 'Teacher access required'}), 403

    db.session.delete(tp)
    db.session.commit()
    return jsonify({'message': 'TP deleted'})


# ─── AI Generation Endpoints ──────────────────────────────────────────────────

@api_v1_bp.route('/practical-work/<int:tp_id>/generate-statement', methods=['POST'])
@jwt_required()
def generate_tp_statement_endpoint(tp_id):
    """
    AI Agent: Generate TP statement from section context.
    Calls LangGraph workflow: get_context → generate_statement
    """
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, _ = _tp_access(tp, user)

    if not is_teacher:
        return jsonify({'error': 'Teacher access required'}), 403

    data = request.get_json() or {}
    hint = data.get('hint', '')

    try:
        from app.services.mcp_tools import get_section_context, generate_tp_statement

        ctx = get_section_context(tp.section_id)
        result = generate_tp_statement(
            context=ctx.get('context', ''),
            language=tp.language,
            hint=hint,
        )

        tp.statement = result.get('statement', '')
        tp.statement_source = 'ai'
        if result.get('title') and tp.title == tp.title:
            tp.title = result.get('title', tp.title)
        tp.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'statement': tp.statement,
            'title': tp.title,
            'statement_source': 'ai',
        })
    except Exception as e:
        logger.error(f"generate_statement error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/practical-work/<int:tp_id>/suggest-aa', methods=['POST'])
@jwt_required()
def suggest_aa_endpoint(tp_id):
    """AI Agent: Suggest AA codes for the TP."""
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, _ = _tp_access(tp, user)

    if not is_teacher:
        return jsonify({'error': 'Teacher access required'}), 403
    if not tp.statement:
        return jsonify({'error': 'Set statement first'}), 400

    try:
        from app.services.mcp_tools import suggest_aa_codes
        result = suggest_aa_codes(section_id=tp.section_id, statement=tp.statement)
        return jsonify({
            'suggested_aa': result.get('aa_codes', []),
            'justification': result.get('justification', ''),
        })
    except Exception as e:
        logger.error(f"suggest_aa error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/practical-work/<int:tp_id>/generate-reference', methods=['POST'])
@jwt_required()
def generate_reference_endpoint(tp_id):
    """AI Agent: Generate reference solution + correction criteria."""
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, _ = _tp_access(tp, user)

    if not is_teacher:
        return jsonify({'error': 'Teacher access required'}), 403
    if not tp.statement:
        return jsonify({'error': 'Set statement first'}), 400

    try:
        from app.services.mcp_tools import generate_reference_solution
        result = generate_reference_solution(
            statement=tp.statement,
            language=tp.language,
            max_grade=tp.max_grade,
        )
        tp.reference_solution = result.get('reference_solution', '')
        tp.correction_criteria = result.get('correction_criteria', '')
        tp.reference_validated = False
        tp.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'reference_solution': tp.reference_solution,
            'correction_criteria': tp.correction_criteria,
        })
    except Exception as e:
        logger.error(f"generate_reference error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


# ─── Student Submission ───────────────────────────────────────────────────────

@api_v1_bp.route('/practical-work/<int:tp_id>/submit', methods=['POST'])
@jwt_required()
def submit_practical_work(tp_id):
    """Student submits code → triggers async AI correction."""
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, is_enrolled = _tp_access(tp, user)

    if user.is_teacher:
        return jsonify({'error': 'Only students can submit'}), 403
    if not is_enrolled:
        return jsonify({'error': 'Not enrolled in this course'}), 403
    if tp.status != 'published':
        return jsonify({'error': 'TP not available yet'}), 403

    data = request.get_json() or {}
    answers = data.get('answers', [])  # [{question_id, code}]
    if answers:
        # Concatenate answers for backward-compatible `code` field
        code = '\n\n'.join(
            f"# === Question {a['question_id']} ===\n{a['code']}"
            for a in answers
            if a.get('code', '').strip()
        )
    else:
        code = data.get('code', '').strip()
    if not code:
        return jsonify({'error': 'code is required'}), 400

    # Count previous attempts
    attempts = PracticalWorkSubmission.query.filter_by(
        tp_id=tp_id, student_id=user.id
    ).count()

    submission = PracticalWorkSubmission(
        tp_id=tp_id,
        student_id=user.id,
        code=code,
        answers=answers if answers else None,
        attempt_number=attempts + 1,
        correction_status='pending',
        status='submitted',
    )
    db.session.add(submission)
    db.session.commit()

    # Trigger async AI correction in a background thread
    _trigger_async_correction(submission.id, tp)

    return jsonify({
        'submission': submission.to_dict(),
        'message': 'Soumis avec succès. Correction IA en cours…',
    }), 201


def _trigger_async_correction(submission_id: int, tp: PracticalWork):
    """Launch AI correction in a background thread (non-blocking)."""
    app = current_app._get_current_object()

    def _run():
        with app.app_context():
            sub = PracticalWorkSubmission.query.get(submission_id)
            if not sub:
                return
            tp_obj = PracticalWork.query.get(sub.tp_id)
            if not tp_obj:
                return
            try:
                sub.correction_status = 'correcting'
                sub.status = 'correcting'
                db.session.commit()

                from app.services.tp_agent_graph import run_tp_correction
                result = run_tp_correction(
                    tp_id=tp_obj.id,
                    submission_id=sub.id,
                    statement=tp_obj.statement or '',
                    reference_solution=tp_obj.reference_solution or '',
                    student_code=sub.code,
                    language=tp_obj.language,
                    correction_criteria=tp_obj.correction_criteria or '',
                    max_grade=tp_obj.max_grade,
                )

                sub.correction_report = result.get('correction_report', '')
                sub.proposed_grade = result.get('proposed_grade', 0.0)
                sub.correction_status = 'done'
                # Keep status as 'correcting' until teacher grades
                sub.status = 'correcting'
                db.session.commit()
                logger.info(f"[TP Correction] submission {submission_id} corrected: grade={sub.proposed_grade}")

            except Exception as e:
                logger.error(f"[TP Correction] Error for submission {submission_id}: {e}", exc_info=True)
                sub.correction_status = 'failed'
                sub.correction_report = f"Erreur de correction automatique: {str(e)}"
                db.session.commit()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()


@api_v1_bp.route('/practical-work/<int:tp_id>/my-submission', methods=['GET'])
@jwt_required()
def get_my_submission(tp_id):
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    _, is_enrolled = _tp_access(tp, user)

    if not is_enrolled and not user.is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    sub = PracticalWorkSubmission.query.filter_by(
        tp_id=tp_id, student_id=user.id
    ).order_by(PracticalWorkSubmission.attempt_number.desc()).first()

    return jsonify({'submission': sub.to_dict() if sub else None})


# ─── Teacher: View all submissions ────────────────────────────────────────────

@api_v1_bp.route('/practical-work/<int:tp_id>/submissions', methods=['GET'])
@jwt_required()
def list_submissions(tp_id):
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, _ = _tp_access(tp, user)

    if not is_teacher:
        return jsonify({'error': 'Teacher access required'}), 403

    subs = PracticalWorkSubmission.query.filter_by(tp_id=tp_id).order_by(
        PracticalWorkSubmission.submitted_at.desc()
    ).all()

    return jsonify({'submissions': [s.to_dict() for s in subs]})


# ─── Teacher: Validate / override grade ──────────────────────────────────────

@api_v1_bp.route('/practical-work/submissions/<int:sub_id>/grade', methods=['PUT'])
@jwt_required()
def grade_submission(sub_id):
    """Teacher validates the AI-proposed grade (or overrides it)."""
    user = _get_user()
    sub = PracticalWorkSubmission.query.get_or_404(sub_id)
    tp = PracticalWork.query.get(sub.tp_id)
    is_teacher, _ = _tp_access(tp, user)

    if not is_teacher:
        return jsonify({'error': 'Teacher access required'}), 403

    data = request.get_json() or {}
    final_grade = data.get('final_grade')
    teacher_comment = data.get('teacher_comment', '')

    if final_grade is None:
        return jsonify({'error': 'final_grade is required'}), 400

    final_grade = float(final_grade)
    if final_grade < 0 or final_grade > tp.max_grade:
        return jsonify({'error': f'Grade must be between 0 and {tp.max_grade}'}), 400

    sub.final_grade = final_grade
    sub.teacher_comment = teacher_comment
    sub.status = 'graded'
    sub.graded_at = datetime.utcnow()
    sub.graded_by_id = user.id
    db.session.commit()

    return jsonify({'submission': sub.to_dict()})


# ─── Parse Questions ──────────────────────────────────────────────────────────

@api_v1_bp.route('/practical-work/<int:tp_id>/parse-questions', methods=['POST'])
@jwt_required()
def parse_tp_questions_route(tp_id):
    """AI: Parse statement into structured questions and save to TP."""
    user = _get_user()
    tp = PracticalWork.query.get_or_404(tp_id)
    is_teacher, _ = _tp_access(tp, user)
    if not is_teacher:
        return jsonify({'error': 'Teacher only'}), 403
    if not tp.statement:
        return jsonify({'error': 'No statement to parse'}), 400

    try:
        from app.services.mcp_tools import parse_tp_questions
        result = parse_tp_questions(
            statement=tp.statement,
            language=tp.language,
            max_grade=tp.max_grade,
        )
        questions = result.get('questions', [])
        tp.questions = questions
        tp.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'questions': questions}), 200
    except Exception as e:
        logger.error(f"parse_tp_questions_route error: {e}")
        return jsonify({'error': str(e)}), 500


# ─── Question Starter Code ────────────────────────────────────────────────────

@api_v1_bp.route('/practical-work/<int:tp_id>/question-starter', methods=['POST'])
@jwt_required()
def generate_question_starter_route(tp_id):
    """AI: Generate starter code (with question as comment) for a specific question."""
    tp = PracticalWork.query.get_or_404(tp_id)
    data = request.get_json() or {}
    question_id = data.get('question_id')
    question_text = data.get('question_text', '')

    # Find question text from stored questions if question_id given
    if question_id and tp.questions:
        for q in tp.questions:
            if q.get('id') == question_id:
                question_text = q.get('text', question_text)
                break

    if not question_text:
        return jsonify({'error': 'question_text required'}), 400

    try:
        from app.services.mcp_tools import generate_question_starter
        result = generate_question_starter(
            question_text=question_text,
            language=tp.language,
        )
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"generate_question_starter_route error: {e}")
        return jsonify({'error': str(e)}), 500


# ─── Formative chatbot ────────────────────────────────────────────────────────

@api_v1_bp.route('/practical-work/<int:tp_id>/chat', methods=['POST'])
@jwt_required()
def tp_chatbot(tp_id):
    """
    Socratic chatbot for formative TPs.
    Body: { question_id, student_message, conversation_history, student_code }
    """
    tp = PracticalWork.query.get_or_404(tp_id)
    user = _get_user()
    _, is_enrolled = _tp_access(tp, user)

    if not is_enrolled and not user.is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    if tp.tp_nature == 'sommative':
        return jsonify({'error': 'Chatbot not available for summative TPs'}), 403

    data = request.get_json() or {}
    question_id = data.get('question_id')
    student_message = data.get('student_message', '').strip()
    conversation_history = data.get('conversation_history', [])
    student_code = data.get('student_code', '')

    if not student_message:
        return jsonify({'error': 'student_message required'}), 400

    # Get question text
    question_text = tp.statement or ''
    if question_id and tp.questions:
        for q in tp.questions:
            if q.get('id') == question_id:
                question_text = q.get('text', question_text)
                break

    try:
        from app.services.mcp_tools import chat_with_student
        result = chat_with_student(
            question_text=question_text,
            language=tp.language,
            student_message=student_message,
            conversation_history=conversation_history,
            student_code=student_code,
        )
        return jsonify({'reply': result.get('reply', ''), 'role': 'assistant'}), 200
    except Exception as e:
        logger.error(f"tp_chatbot error: {e}")
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/chapters/<int:chapter_id>/ai-detect-tp/meta', methods=['GET'])
@jwt_required()
def ai_detect_tp_meta(chapter_id):
    """Return document count + names for this chapter (fast, no AI)."""
    from app.models import Chapter as RegularChapter
    user = User.query.get(int(get_jwt_identity()))
    if not user.is_teacher and not user.is_superuser:
        return jsonify({'error': 'Teachers only'}), 403
    chapter = RegularChapter.query.get_or_404(chapter_id)
    docs = chapter.documents.all()
    return jsonify({
        'doc_count': len(docs),
        'doc_names': [d.title for d in docs],
        'chapter_title': chapter.title,
    })


@api_v1_bp.route('/chapters/<int:chapter_id>/ai-detect-tp', methods=['POST'])
@jwt_required()
def ai_detect_tp(chapter_id):
    """AI analyzes chapter documents to suggest TP activities."""
    from app.services.mcp_tools import detect_tp_opportunities
    user = User.query.get(int(get_jwt_identity()))
    if not user.is_teacher and not user.is_superuser:
        return jsonify({'error': 'Teachers only'}), 403

    data = request.get_json(silent=True) or {}
    language = data.get('language', 'Python')

    try:
        result = detect_tp_opportunities(chapter_id, language)
        return jsonify(result)
    except Exception as e:
        logger.error(f"ai_detect_tp error: {e}")
        return jsonify({'error': str(e)}), 500
