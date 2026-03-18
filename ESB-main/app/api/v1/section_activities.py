"""
Section Activities API
======================
YouTube activities and teacher-validated graded quizzes per TNSection.

Endpoints:
  # Activities (YouTube)
  GET    /sections/<id>/activities                   list activities
  POST   /sections/<id>/activities/youtube           add YouTube activity
  DELETE /sections/<id>/activities/<aid>             delete activity

  # Section Quiz (teacher)
  GET    /sections/<id>/quiz                         get quiz (+ questions)
  POST   /sections/<id>/quiz/generate                AI-generate questions
  PUT    /sections/<id>/quiz/questions/<qid>         approve/reject/edit question
  PUT    /sections/<id>/quiz/publish                 publish quiz
  DELETE /sections/<id>/quiz                         delete quiz

  # Section Quiz (student)
  GET    /sections/<id>/quiz/take                    get quiz for student (no answers)
  POST   /sections/<id>/quiz/submit                  submit answers
  GET    /sections/<id>/quiz/result                  get my result

  # Extract section content from document
  POST   /sections/<id>/content/extract-from-document   extract text from chapter doc
"""

import re
import json
import logging
from datetime import datetime

from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.api.v1 import api_v1_bp
from app import db
from app.models import (
    User, TNSection, SectionContent, SectionActivity, SectionQuiz,
    SectionQuizQuestion, SectionQuizSubmission, Enrollment, Document
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user():
    return User.query.get(int(get_jwt_identity()))


def _section_access(section: TNSection, user: User):
    """Return (is_teacher, is_enrolled)."""
    chapter = section.chapter
    syllabus = chapter.syllabus
    course = syllabus.course if syllabus else None
    if not course:
        return False, False
    is_teacher = user.is_teacher and course.teacher_id == user.id
    is_enrolled = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())
    return is_teacher, is_enrolled


def _resolve_course_id(section: TNSection):
    """Return the Course.id reachable from a TNSection, or None."""
    try:
        return section.chapter.syllabus.course.id
    except AttributeError:
        return None


def _extract_youtube_id(url: str) -> str | None:
    patterns = [
        r'(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})',
        r'^([A-Za-z0-9_-]{11})$',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def _get_llm():
    api_key = current_app.config.get('GOOGLE_API_KEY', '')
    model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    return ChatGoogleGenerativeAI(model=model, google_api_key=api_key, temperature=0.4, max_tokens=4000)


# ---------------------------------------------------------------------------
# Activities — YouTube
# ---------------------------------------------------------------------------

@api_v1_bp.route('/sections/<int:section_id>/activities', methods=['GET'])
@jwt_required()
def list_section_activities(section_id):
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, is_enrolled = _section_access(section, user)
    if not is_teacher and not is_enrolled:
        return jsonify({'error': 'Access denied'}), 403

    activities = section.activities or []
    result = []
    for a in activities:
        d = a.to_dict()
        if a.activity_type == 'quiz' and a.section_quiz_rel:
            d['quiz'] = a.section_quiz_rel.to_dict()
        result.append(d)
    return jsonify({'activities': result}), 200


@api_v1_bp.route('/sections/<int:section_id>/activities/youtube', methods=['POST'])
@jwt_required()
def add_youtube_activity(section_id):
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    body = request.get_json(silent=True) or {}
    url = (body.get('url') or '').strip()
    title = (body.get('title') or '').strip()
    if not url:
        return jsonify({'error': 'url is required'}), 400

    embed_id = _extract_youtube_id(url)
    if not embed_id:
        return jsonify({'error': 'Invalid YouTube URL'}), 400

    if not title:
        title = f'Vidéo YouTube — {embed_id}'

    # Resolve chapter + course for the Document record
    chapter_obj = section.chapter
    syllabus = chapter_obj.syllabus
    chapter_id_for_doc = None
    course_id_for_doc = None
    if syllabus and syllabus.course:
        from app.models import Chapter
        course_id_for_doc = syllabus.course.id
        target = next(
            (c for c in Chapter.query.filter_by(course_id=course_id_for_doc).all()
             if c.order == chapter_obj.index), None
        )
        if target:
            chapter_id_for_doc = target.id

    max_pos = db.session.query(db.func.max(SectionActivity.position)).filter_by(section_id=section_id).scalar() or 0
    activity = SectionActivity(
        section_id=section_id,
        activity_type='youtube',
        title=title,
        youtube_url=url,
        youtube_embed_id=embed_id,
        position=max_pos + 1,
        transcript_status='indexing',
    )
    db.session.add(activity)
    db.session.commit()
    activity_id = activity.id

    # --- Background thread: fetch transcript + index in ChromaDB ---
    import threading
    from flask import current_app

    app = current_app._get_current_object()

    def _index_video(app, activity_id, embed_id, title, chapter_id_for_doc, course_id_for_doc):
        with app.app_context():
            from app import db
            from app.models import SectionActivity
            from app.services.youtube_rag_service import process_youtube_activity
            act = SectionActivity.query.get(activity_id)
            if not act:
                return
            try:
                doc_id = process_youtube_activity(
                    video_id=embed_id,
                    video_title=title,
                    chapter_id=chapter_id_for_doc,
                    course_id=course_id_for_doc,
                )
                act.document_id = doc_id
                act.transcript_status = 'indexed' if doc_id else 'failed'
            except Exception as e:
                logger.error(f"YouTube RAG indexing failed: {e}")
                act.transcript_status = 'failed'
            db.session.commit()

    t = threading.Thread(
        target=_index_video,
        args=(app, activity_id, embed_id, title, chapter_id_for_doc, course_id_for_doc),
        daemon=True,
    )
    t.start()

    return jsonify(activity.to_dict()), 201


@api_v1_bp.route('/sections/<int:section_id>/activities/<int:activity_id>/rag-status', methods=['GET'])
@jwt_required()
def get_activity_rag_status(section_id, activity_id):
    """Return detailed RAG indexing status for a YouTube activity."""
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, is_enrolled = _section_access(section, user)
    if not is_teacher and not is_enrolled:
        return jsonify({'error': 'Access denied'}), 403

    activity = SectionActivity.query.filter_by(id=activity_id, section_id=section_id).first_or_404()
    if activity.activity_type != 'youtube':
        return jsonify({'error': 'Not a YouTube activity'}), 400

    result = activity.to_dict()

    # Attach Document metadata if indexed
    if activity.document_id and activity.document_rel:
        doc = activity.document_rel
        result['rag_document'] = {
            'id': doc.id,
            'title': doc.title,
            'summary': doc.summary,
            'metadata': doc.content_metadata,
        }

    # Check ChromaDB collection existence + size
    if activity.document_id:
        try:
            from app.services.vector_store import VectorStore
            vs = VectorStore(document_id=str(activity.document_id))
            if vs.collection_exists():
                count = vs.collection.count()
                result['rag_chunks'] = count
        except Exception:
            pass

    return jsonify(result), 200


@api_v1_bp.route('/sections/<int:section_id>/activities/<int:activity_id>', methods=['DELETE'])
@jwt_required()
def delete_section_activity(section_id, activity_id):
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    activity = SectionActivity.query.filter_by(id=activity_id, section_id=section_id).first_or_404()

    # Clean up ChromaDB collection + Document record for YouTube videos
    if activity.activity_type == 'youtube' and activity.document_id:
        try:
            from app.services.vector_store import VectorStore
            vs = VectorStore(document_id=str(activity.document_id))
            vs.delete_collection()
        except Exception as e:
            logger.warning(f"Could not delete ChromaDB collection for doc {activity.document_id}: {e}")
        from app.models import Document
        doc = Document.query.get(activity.document_id)
        if doc:
            db.session.delete(doc)

    db.session.delete(activity)
    db.session.commit()
    return jsonify({'message': 'Activity deleted'}), 200


# ---------------------------------------------------------------------------
# Section Quiz — Teacher management
# ---------------------------------------------------------------------------

@api_v1_bp.route('/sections/<int:section_id>/quiz', methods=['GET'])
@jwt_required()
def get_section_quiz(section_id):
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, is_enrolled = _section_access(section, user)
    if not is_teacher and not is_enrolled:
        return jsonify({'error': 'Access denied'}), 403

    quiz = SectionQuiz.query.filter_by(section_id=section_id).first()
    if not quiz:
        return jsonify({'quiz': None}), 200
    return jsonify({'quiz': quiz.to_dict(include_questions=True)}), 200


@api_v1_bp.route('/sections/<int:section_id>/quiz/bank-stats', methods=['GET'])
@jwt_required()
def get_quiz_bank_stats(section_id):
    """
    Return stats about available approved questions in the question bank for this
    section's course: total count + distinct AA codes / bloom levels / difficulties.
    Used by the quiz configurator form.
    """
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    # Resolve course
    course_id = _resolve_course_id(section)
    if not course_id:
        return jsonify({'total': 0, 'aa_codes': [], 'bloom_levels': [], 'difficulties': []}), 200

    from app.models import QuestionBankQuestion
    from sqlalchemy import distinct

    base = QuestionBankQuestion.query.filter(
        QuestionBankQuestion.course_id == course_id,
        QuestionBankQuestion.approved_at.isnot(None),
    )

    total = base.count()
    aa_codes = sorted({
        q.clo for q in base.all()
        if q.clo and not q.clo.upper().startswith('CLO')
    })
    bloom_levels = sorted({q.bloom_level for q in base.all() if q.bloom_level})
    difficulties = sorted({q.difficulty for q in base.all() if q.difficulty})

    return jsonify({
        'total': total,
        'aa_codes': aa_codes,
        'bloom_levels': bloom_levels,
        'difficulties': difficulties,
    }), 200


@api_v1_bp.route('/sections/<int:section_id>/quiz/from-bank', methods=['POST'])
@jwt_required()
def create_quiz_from_bank(section_id):
    """
    Create (or augment) a section quiz by picking questions from the approved
    question bank.

    Body:
        num_questions  int   (2–30)
        aa_codes       list  optional — filter by AA code (clo field)
        bloom_levels   list  optional — filter by bloom_level
        difficulties   list  optional — filter by difficulty
        title          str   optional — quiz title override
    """
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    body = request.get_json(silent=True) or {}
    num_q = max(2, min(30, int(body.get('num_questions', 5))))
    aa_codes = body.get('aa_codes') or []
    bloom_levels = body.get('bloom_levels') or []
    difficulties = body.get('difficulties') or []
    title = body.get('title', '').strip() or f'Quiz — {section.title}'

    course_id = _resolve_course_id(section)
    if not course_id:
        return jsonify({'error': 'Cannot resolve course from this section'}), 400

    from app.models import QuestionBankQuestion
    from sqlalchemy import or_

    query = QuestionBankQuestion.query.filter(
        QuestionBankQuestion.course_id == course_id,
        QuestionBankQuestion.approved_at.isnot(None),
    )

    if aa_codes:
        filters = [QuestionBankQuestion.clo.ilike(f'%{c}%') for c in aa_codes]
        query = query.filter(or_(*filters))

    if bloom_levels:
        query = query.filter(QuestionBankQuestion.bloom_level.in_(bloom_levels))

    if difficulties:
        query = query.filter(QuestionBankQuestion.difficulty.in_(difficulties))

    candidates = query.all()
    if not candidates:
        return jsonify({
            'error': (
                'Aucune question approuvée ne correspond aux filtres sélectionnés. '
                'Vérifiez la banque de questions du cours.'
            )
        }), 400

    import random
    selected = random.sample(candidates, min(num_q, len(candidates)))

    # Get or create quiz
    quiz = SectionQuiz.query.filter_by(section_id=section_id).first()
    if not quiz:
        quiz = SectionQuiz(
            section_id=section_id,
            title=title,
            status='draft',
        )
        db.session.add(quiz)
        db.session.flush()
    else:
        # Clear existing pending questions so teacher starts fresh
        SectionQuizQuestion.query.filter_by(quiz_id=quiz.id, status='pending').delete()

    # Normalize AA code: strip "AAA" prefix → "AA"
    def _normalize_aa(clo_val):
        if not clo_val:
            return ''
        return clo_val.replace('AAA', 'AA').replace('CLO', 'AA').strip()

    new_questions = []
    for i, bq in enumerate(selected):
        q_type = bq.question_type or 'open_ended'
        # Only copy choices for MCQ/true_false types
        if q_type == 'mcq':
            ca = bq.choice_a or ''
            cb = bq.choice_b or ''
            cc = bq.choice_c or ''
            cd = ''
            correct = (bq.correct_choice or 'a').lower()[:1]
        elif q_type == 'true_false':
            ca = 'Vrai'
            cb = 'Faux'
            cc = ''
            cd = ''
            correct = (bq.correct_choice or 'a').lower()[:1]
        else:
            ca = cb = cc = cd = ''
            correct = ''
        q = SectionQuizQuestion(
            quiz_id=quiz.id,
            question_text=bq.question_text,
            question_type=q_type,
            choice_a=ca,
            choice_b=cb,
            choice_c=cc,
            choice_d=cd,
            correct_choice=correct,
            explanation=bq.explanation or bq.answer or '',
            bloom_level=bq.bloom_level or '',
            difficulty=bq.difficulty or 'medium',
            aa_code=_normalize_aa(bq.clo),
            points=1.0,
            status='pending',
            position=i + 1,
        )
        db.session.add(q)
        new_questions.append(q)

    db.session.commit()
    return jsonify({
        'message': (
            f'{len(new_questions)} question(s) sélectionnée(s) depuis la banque — '
            'validez-les avant de publier.'
        ),
        'quiz': quiz.to_dict(include_questions=True),
    }), 200


@api_v1_bp.route('/sections/<int:section_id>/quiz/generate', methods=['POST'])
@jwt_required()
def generate_section_quiz(section_id):
    """AI generates MCQ questions from section content. Teacher then validates them."""
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    body = request.get_json(silent=True) or {}
    num_questions = max(2, min(15, int(body.get('num_questions', 5))))

    # Get context: section content or chapter summary
    content_obj = SectionContent.query.filter_by(section_id=section_id).first()
    context = ''
    if content_obj and content_obj.content:
        context = content_obj.content[:5000]
    else:
        # Fall back to chapter documents summaries
        chapter = section.chapter
        syllabus = chapter.syllabus
        if syllabus and syllabus.course:
            from app.models import Chapter, Document
            course_chapters = Chapter.query.filter_by(course_id=syllabus.course.id, order=chapter.index).all()
            for ch in course_chapters:
                for doc in ch.documents.all():
                    if doc.summary:
                        context += doc.summary[:2000]
                        break
                if context:
                    break

    if not context:
        return jsonify({'error': 'No content available to generate questions. Generate section content first.'}), 400

    # Collect AA (Acquis d'Apprentissage) linked to this section or its chapter
    from app.models import TNSectionAA, TNChapterAA
    aa_list = []
    for link in section.aa_links:
        aa = link.aa
        aa_list.append({'code': f'AA {aa.number}', 'description': aa.description})
    if not aa_list:
        for link in section.chapter.aa_links:
            aa = link.aa
            aa_list.append({'code': f'AA {aa.number}', 'description': aa.description})

    aa_context = ''
    if aa_list:
        aa_context = '\n\nAcquis d\'Apprentissage (AA) ciblés par cette section:\n'
        for aa in aa_list:
            aa_context += f'  - {aa["code"]}: {aa["description"]}\n'
        aa_context += '\nChaque question DOIT être associée à l\'un de ces AA.'

    # Get or create quiz
    quiz = SectionQuiz.query.filter_by(section_id=section_id).first()
    if not quiz:
        quiz = SectionQuiz(
            section_id=section_id,
            title=f'Quiz — {section.title}',
            status='draft',
        )
        db.session.add(quiz)
        db.session.flush()

    aa_codes_str = ', '.join(aa['code'] for aa in aa_list) if aa_list else 'AA 1'

    prompt = f"""Tu es un expert pédagogique. Génère {num_questions} questions QCM pour évaluer la compréhension de cette section de cours.

Section: {section.index} — {section.title}
Contenu:
{context}{aa_context}

RÈGLES:
1. Retourne UNIQUEMENT un tableau JSON valide, rien d'autre.
2. Chaque question a les champs suivants OBLIGATOIRES:
   - question_text: texte de la question
   - choice_a, choice_b, choice_c, choice_d: 4 propositions de réponse
   - correct_choice: "a", "b", "c" ou "d"
   - explanation: explication de la bonne réponse
   - bloom_level: niveau Taxonomie de Bloom parmi: "remember", "understand", "apply", "analyze", "evaluate", "create"
   - difficulty: niveau de difficulté parmi: "easy", "medium", "hard"
   - aa_code: l'AA associé parmi: {aa_codes_str} (ou le premier si un seul AA)
   - points: 1.0
3. Répartition des difficultés: 30% easy, 50% medium, 20% hard.
4. Répartition des niveaux Bloom: mix remember/understand/apply/analyze.
5. Si plusieurs AA sont disponibles, répartir les questions entre eux.
6. Les distracteurs doivent être plausibles et cohérents.
7. Langue: français (ou langue du contenu).

EXEMPLE:
[
  {{
    "question_text": "Quelle est la définition d'une matrice ?",
    "choice_a": "Un tableau à une dimension",
    "choice_b": "Un tableau à deux dimensions de nombres",
    "choice_c": "Une fonction mathématique",
    "choice_d": "Un vecteur de vecteurs",
    "correct_choice": "b",
    "explanation": "Une matrice est un tableau rectangulaire de nombres organisé en lignes et colonnes.",
    "bloom_level": "remember",
    "difficulty": "easy",
    "aa_code": "{aa_codes_str.split(',')[0].strip() if aa_list else 'AA 1'}",
    "points": 1.0
  }}
]

RÉPONSE (JSON pur uniquement):"""

    try:
        llm = _get_llm()
        response = llm.invoke([
            SystemMessage(content="Tu es un expert pédagogique. Tu génères des questions QCM en JSON valide uniquement."),
            HumanMessage(content=prompt),
        ])
        raw = response.content.strip()
        if raw.startswith('```'):
            raw = re.sub(r'^```[a-z]*\n?', '', raw)
            raw = raw.rstrip('`').strip()

        questions_data = json.loads(raw)
        if not isinstance(questions_data, list):
            raise ValueError("Expected JSON array")
    except Exception as e:
        logger.error(f"Quiz generation error: {e}")
        return jsonify({'error': f'AI generation failed: {str(e)}'}), 500

    # Save questions (all pending teacher validation)
    max_pos = max((q.position for q in quiz.questions), default=0)
    new_questions = []
    for i, qd in enumerate(questions_data):
        if not isinstance(qd, dict) or 'question_text' not in qd:
            continue
        q = SectionQuizQuestion(
            quiz_id=quiz.id,
            question_text=str(qd.get('question_text', '')),
            question_type='mcq',
            choice_a=str(qd.get('choice_a', '')),
            choice_b=str(qd.get('choice_b', '')),
            choice_c=str(qd.get('choice_c', '')),
            choice_d=str(qd.get('choice_d', '')),
            correct_choice=str(qd.get('correct_choice', 'a')).lower()[:1],
            explanation=str(qd.get('explanation', '')),
            bloom_level=str(qd.get('bloom_level', 'remember')),
            difficulty=str(qd.get('difficulty', 'medium')),
            aa_code=str(qd.get('aa_code', aa_list[0]['code'] if aa_list else '')),
            points=float(qd.get('points', 1.0)),
            status='pending',
            position=max_pos + i + 1,
        )
        db.session.add(q)
        new_questions.append(q)

    db.session.commit()

    return jsonify({
        'message': f'{len(new_questions)} questions generated — validate them before publishing',
        'quiz': quiz.to_dict(include_questions=True),
    }), 200


@api_v1_bp.route('/sections/<int:section_id>/quiz/questions/<int:question_id>', methods=['PUT'])
@jwt_required()
def update_quiz_question(section_id, question_id):
    """Teacher approves, rejects, or edits a question."""
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    quiz = SectionQuiz.query.filter_by(section_id=section_id).first_or_404()
    question = SectionQuizQuestion.query.filter_by(id=question_id, quiz_id=quiz.id).first_or_404()

    body = request.get_json(silent=True) or {}
    for field in ('question_text', 'choice_a', 'choice_b', 'choice_c', 'choice_d',
                  'correct_choice', 'explanation', 'bloom_level', 'difficulty', 'aa_code',
                  'points', 'status'):
        if field in body:
            setattr(question, field, body[field])

    db.session.commit()
    return jsonify({'question': question.to_dict()}), 200


@api_v1_bp.route('/sections/<int:section_id>/quiz/publish', methods=['PUT'])
@jwt_required()
def publish_section_quiz(section_id):
    """Publish the quiz — only approved questions are included for students."""
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    quiz = SectionQuiz.query.filter_by(section_id=section_id).first_or_404()
    approved = [q for q in quiz.questions if q.status == 'approved']
    if not approved:
        return jsonify({'error': 'No approved questions. Approve at least one question before publishing.'}), 400

    quiz.status = 'published'
    quiz.max_score = sum(q.points for q in approved)
    db.session.commit()

    # Ensure there's an activity entry for this quiz
    existing = SectionActivity.query.filter_by(section_id=section_id, activity_type='quiz').first()
    if not existing:
        max_pos = db.session.query(db.func.max(SectionActivity.position)).filter_by(section_id=section_id).scalar() or 0
        act = SectionActivity(
            section_id=section_id,
            activity_type='quiz',
            title=quiz.title,
            section_quiz_id=quiz.id,
            position=max_pos + 1,
        )
        db.session.add(act)
        db.session.commit()

    return jsonify({'message': 'Quiz published', 'quiz': quiz.to_dict()}), 200


@api_v1_bp.route('/sections/<int:section_id>/quiz', methods=['DELETE'])
@jwt_required()
def delete_section_quiz(section_id):
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    quiz = SectionQuiz.query.filter_by(section_id=section_id).first()
    if quiz:
        SectionActivity.query.filter_by(section_id=section_id, section_quiz_id=quiz.id).delete()
        db.session.delete(quiz)
        db.session.commit()
    return jsonify({'message': 'Quiz deleted'}), 200


# ---------------------------------------------------------------------------
# Section Quiz — Student
# ---------------------------------------------------------------------------

@api_v1_bp.route('/sections/<int:section_id>/quiz/take', methods=['GET'])
@jwt_required()
def take_section_quiz(section_id):
    """Student fetches the quiz without correct answers."""
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, is_enrolled = _section_access(section, user)
    if not is_enrolled and not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    quiz = SectionQuiz.query.filter_by(section_id=section_id, status='published').first()
    if not quiz:
        return jsonify({'error': 'No published quiz for this section'}), 404

    # Check if already submitted
    existing = SectionQuizSubmission.query.filter_by(quiz_id=quiz.id, student_id=user.id).first()
    if existing:
        return jsonify({'already_submitted': True, 'result': existing.to_dict()}), 200

    approved_questions = [q for q in quiz.questions if q.status == 'approved']
    return jsonify({
        'quiz': {
            'id': quiz.id,
            'title': quiz.title,
            'max_score': quiz.max_score,
            'question_count': len(approved_questions),
        },
        'questions': [q.to_dict(hide_answer=True) for q in approved_questions],
        'already_submitted': False,
    }), 200


@api_v1_bp.route('/sections/<int:section_id>/quiz/submit', methods=['POST'])
@jwt_required()
def submit_section_quiz(section_id):
    """Student submits answers; auto-graded for MCQ."""
    user = _get_user()
    if user.is_teacher:
        return jsonify({'error': 'Students only'}), 403

    section = TNSection.query.get_or_404(section_id)
    _, is_enrolled = _section_access(section, user)
    if not is_enrolled:
        return jsonify({'error': 'Not enrolled'}), 403

    quiz = SectionQuiz.query.filter_by(section_id=section_id, status='published').first()
    if not quiz:
        return jsonify({'error': 'No published quiz'}), 404

    existing = SectionQuizSubmission.query.filter_by(quiz_id=quiz.id, student_id=user.id).first()
    if existing:
        return jsonify({'error': 'Already submitted', 'result': existing.to_dict()}), 409

    body = request.get_json(silent=True) or {}
    answers = body.get('answers', {})   # {str(question_id): "a"/"b"/"c"/"d"}

    approved_questions = [q for q in quiz.questions if q.status == 'approved']
    score = 0.0
    max_score = sum(q.points for q in approved_questions)
    for q in approved_questions:
        student_ans = str(answers.get(str(q.id), '')).lower().strip()
        if q.question_type in ('mcq', 'true_false') and student_ans == q.correct_choice:
            score += q.points

    submission = SectionQuizSubmission(
        quiz_id=quiz.id,
        student_id=user.id,
        answers=answers,
        score=score,
        max_score=max_score,
        submitted_at=datetime.utcnow(),
    )
    db.session.add(submission)
    db.session.commit()

    return jsonify({
        'message': 'Submitted successfully',
        'score': score,
        'max_score': max_score,
        'percent': round(score / max_score * 100, 1) if max_score else 0,
        'result': submission.to_dict(),
    }), 201


@api_v1_bp.route('/sections/<int:section_id>/quiz/result', methods=['GET'])
@jwt_required()
def get_quiz_result(section_id):
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, is_enrolled = _section_access(section, user)
    if not is_teacher and not is_enrolled:
        return jsonify({'error': 'Access denied'}), 403

    quiz = SectionQuiz.query.filter_by(section_id=section_id).first()
    if not quiz:
        return jsonify({'error': 'No quiz'}), 404

    if is_teacher:
        # Return all submissions
        subs = SectionQuizSubmission.query.filter_by(quiz_id=quiz.id).all()
        return jsonify({'submissions': [s.to_dict() for s in subs]}), 200
    else:
        sub = SectionQuizSubmission.query.filter_by(quiz_id=quiz.id, student_id=user.id).first()
        if not sub:
            return jsonify({'submitted': False}), 200
        return jsonify({'submitted': True, 'result': sub.to_dict()}), 200


# ---------------------------------------------------------------------------
# Extract section content from chapter document
# ---------------------------------------------------------------------------

@api_v1_bp.route('/sections/<int:section_id>/content/extract-from-document', methods=['POST'])
@jwt_required()
def extract_section_content_from_document(section_id):
    """
    Extract the relevant portion of text for this section from the chapter's document,
    then save it as SectionContent (status=pending, requires teacher approval).
    """
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    is_teacher, _ = _section_access(section, user)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    chapter_obj = section.chapter
    syllabus = chapter_obj.syllabus
    if not syllabus or not syllabus.course:
        return jsonify({'error': 'Cannot determine course from section'}), 404

    from app.models import Chapter
    from app.services.file_service import get_file_path, extract_text_from_file
    import os

    # Find the matching Chapter (by order == tn_chapter.index)
    course_chapters = Chapter.query.filter_by(course_id=syllabus.course.id).all()
    target_chapter = next((c for c in course_chapters if c.order == chapter_obj.index), None)
    if not target_chapter:
        return jsonify({'error': 'Chapter not found'}), 404

    # Get most recent document
    body = request.get_json(silent=True) or {}
    doc_id = body.get('document_id')
    if doc_id:
        doc = Document.query.filter_by(id=doc_id, chapter_id=target_chapter.id).first()
    else:
        doc = target_chapter.documents.order_by(Document.created_at.desc()).first()

    if not doc or not doc.file_path:
        return jsonify({'error': 'No document found in this chapter'}), 404

    full_path = get_file_path(doc.file_path.replace('\\', '/'))
    if not os.path.exists(full_path):
        return jsonify({'error': 'File not found on disk'}), 404

    text = extract_text_from_file(full_path)
    if not text or len(text.strip()) < 50:
        return jsonify({'error': 'Could not extract readable text'}), 422

    prompt = f"""Tu es un assistant pédagogique. Extrait depuis ce document de cours le contenu correspondant à la section "{section.index} — {section.title}".

Consignes :
- Identifie la partie du texte qui correspond à cette section (par titre ou numérotation).
- Si la section n'est pas clairement identifiable, génère un contenu pédagogique cohérent basé sur le titre de la section et le contexte du document.
- Rédige en markdown structuré avec des titres, bullet points et exemples.
- Longueur : 300 à 800 mots.
- Langue : même langue que le document.

TITRE DU DOCUMENT: {doc.title}
SECTION CIBLE: {section.index} — {section.title}

CONTENU DU DOCUMENT (premiers 8000 caractères):
{text[:8000]}

CONTENU EXTRAIT (markdown):"""

    try:
        llm = _get_llm()
        response = llm.invoke([
            SystemMessage(content="Tu es un assistant pédagogique expert en extraction de contenu éducatif."),
            HumanMessage(content=prompt),
        ])
        extracted = response.content.strip()
    except Exception as e:
        logger.error(f"Section content extraction error: {e}")
        return jsonify({'error': f'AI extraction failed: {str(e)}'}), 500

    # Save or update SectionContent
    sc = SectionContent.query.filter_by(section_id=section_id).first()
    if sc:
        sc.content = extracted
        sc.status = 'pending'
        sc.generated_at = datetime.utcnow()
        sc.validated_at = None
        sc.validated_by_id = None
    else:
        sc = SectionContent(
            section_id=section_id,
            content=extracted,
            status='pending',
        )
        db.session.add(sc)

    db.session.commit()

    return jsonify({
        'message': 'Section content extracted from document',
        'content': sc.to_dict(),
        'source_document': {'id': doc.id, 'title': doc.title},
    }), 200
