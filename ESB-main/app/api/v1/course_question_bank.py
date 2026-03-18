"""
Course-scoped Question Bank API
================================
Question bank tab living *inside* the module (course) page.
Teachers generate, edit and approve questions organised by AA code.
Students see only approved questions.

Endpoints:
  GET    /courses/<id>/question-bank            list questions grouped by AA
  POST   /courses/<id>/question-bank/generate   AI-generate questions (5 types)
  PUT    /courses/<id>/question-bank/<qid>      approve / edit / reject
  DELETE /courses/<id>/question-bank/<qid>      delete
"""

import json
import logging
from datetime import datetime

from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.api.v1 import api_v1_bp
from app import db
from app.models import User, Course, QuestionBankQuestion, Enrollment

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_QUESTION_TYPES = ('mcq', 'true_false', 'drag_drop', 'open_ended', 'code')

QUESTION_TYPE_LABELS = {
    'mcq':        'QCM',
    'true_false':  'Vrai / Faux',
    'drag_drop':   'Drag & Drop',
    'open_ended':  'Question ouverte',
    'code':        'Code pratique',
}

BLOOM_LABELS = {
    'remember':   'Mémorisation',
    'understand': 'Compréhension',
    'apply':      'Application',
    'analyze':    'Analyse',
    'evaluate':   'Évaluation',
    'create':     'Création',
}

DIFFICULTY_LABELS = {
    'easy':   'Facile',
    'medium': 'Moyen',
    'hard':   'Difficile',
}

# JSON schema description for each question type (used inside the prompt)
_TYPE_FORMAT = {
    'mcq': """\
Retourne un tableau JSON d'objets, un objet par question, avec exactement ces champs :
[
  {
    "question_text": "Énoncé de la question",
    "choice_a": "Choix A",
    "choice_b": "Choix B",
    "choice_c": "Choix C",
    "correct_choice": "a" | "b" | "c",
    "answer": "Explication concise de la bonne réponse"
  }
]""",

    'true_false': """\
Retourne un tableau JSON d'objets :
[
  {
    "question_text": "Affirmation à évaluer (vrai ou faux)",
    "correct_choice": "true" | "false",
    "answer": "Explication pourquoi c'est vrai ou faux"
  }
]""",

    'drag_drop': """\
Retourne un tableau JSON d'objets (exercice d'appariement) :
[
  {
    "question_text": "Associez chaque terme de gauche à sa définition de droite",
    "answer": "[{\\"left\\": \\"Terme A\\", \\"right\\": \\"Définition A\\"}, {\\"left\\": \\"Terme B\\", \\"right\\": \\"Définition B\\"}, {\\"left\\": \\"Terme C\\", \\"right\\": \\"Définition C\\"}]",
    "explanation": "Explication des associations correctes"
  }
]""",

    'open_ended': """\
Retourne un tableau JSON d'objets :
[
  {
    "question_text": "Question ouverte nécessitant une réponse développée",
    "answer": "Réponse modèle détaillée avec les critères d'évaluation"
  }
]""",

    'code': """\
Retourne un tableau JSON d'objets :
[
  {
    "question_text": "Énoncé du problème de programmation (contexte + consignes précises)",
    "answer": "Solution complète avec commentaires explicatifs ligne par ligne",
    "explanation": "Explication de l'approche algorithmique et des concepts utilisés"
  }
]""",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user() -> User:
    return User.query.get(int(get_jwt_identity()))


def _course_access(course_id: int, user: User):
    """Return (is_teacher, is_enrolled, course)."""
    course = Course.query.get(course_id)
    if not course:
        return False, False, None
    is_teacher = user.is_teacher and course.teacher_id == user.id
    is_enrolled = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course_id).first())
    return is_teacher, is_enrolled, course


def _normalize_aa(clo_val) -> str:
    """Normalize stored clo/AAA value → 'AA N' form."""
    if not clo_val:
        return ''
    return clo_val.replace('AAA', 'AA').replace('CLO', 'AA').strip()


def _serialize(q: QuestionBankQuestion, is_teacher: bool = False) -> dict:
    d = {
        'id':            q.id,
        'question_text': q.question_text,
        'question_type': q.question_type or 'mcq',
        'bloom_level':   q.bloom_level,
        'difficulty':    q.difficulty,
        'aa_code':       _normalize_aa(q.clo),
        'answer':        q.answer,
        'explanation':   q.explanation,
        'is_approved':   q.is_approved,
        'approved_at':   q.approved_at.isoformat() if q.approved_at else None,
        'created_at':    q.created_at.isoformat() if q.created_at else None,
    }
    # MCQ / VF specific fields
    d['choice_a']       = q.choice_a
    d['choice_b']       = q.choice_b
    d['choice_c']       = q.choice_c
    d['correct_choice'] = q.correct_choice if is_teacher else None
    return d


def _llm():
    api_key = current_app.config.get('GOOGLE_API_KEY', '')
    model   = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    return ChatGoogleGenerativeAI(model=model, google_api_key=api_key,
                                  temperature=0.6, max_tokens=6000)


def _build_prompt(course_title: str, aa_code: str, bloom_level: str,
                  difficulty: str, question_type: str, num_q: int) -> str:
    bloom_lbl = BLOOM_LABELS.get(bloom_level, bloom_level)
    diff_lbl  = DIFFICULTY_LABELS.get(difficulty, difficulty)
    fmt       = _TYPE_FORMAT.get(question_type, _TYPE_FORMAT['mcq'])
    type_lbl  = QUESTION_TYPE_LABELS.get(question_type, question_type)

    return f"""Tu es un expert en ingénierie pédagogique universitaire.

Génère exactement {num_q} question(s) de type « {type_lbl} » pour le cours "{course_title}".

Paramètres pédagogiques :
- Acquis d'Apprentissage (AA) ciblé : {aa_code}
- Niveau Taxonomie de Bloom        : {bloom_lbl}
- Difficulté                       : {diff_lbl}

Format de réponse attendu :
{fmt}

Règles impératives :
- Génère exactement {num_q} objet(s) dans le tableau JSON
- Le JSON doit être valide et directement parseable (pas de markdown, pas d'explication hors JSON)
- Rédige en français avec un vocabulaire académique universitaire
- Les questions doivent évaluer le niveau Bloom « {bloom_lbl} » et non pas un niveau inférieur
- La difficulté « {diff_lbl} » doit se ressentir dans la complexité de la question
"""


def _parse_llm_response(raw: str) -> list[dict]:
    """Extract a JSON array from raw LLM text."""
    text = raw.strip()
    # Strip markdown fences
    for fence in ('```json', '```'):
        if fence in text:
            text = text.split(fence, 1)[-1].rsplit('```', 1)[0].strip()

    # Try direct parse first
    for start, end in [('[', ']'), ('{', '}')]:
        idx = text.find(start)
        if idx == -1:
            continue
        depth, result_end = 0, -1
        for i, ch in enumerate(text[idx:], idx):
            depth += (ch == start) - (ch == end)
            if depth == 0:
                result_end = i + 1
                break
        if result_end == -1:
            continue
        try:
            parsed = json.loads(text[idx:result_end])
            return parsed if isinstance(parsed, list) else [parsed]
        except json.JSONDecodeError:
            continue
    return []


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@api_v1_bp.route('/courses/<int:course_id>/question-bank', methods=['GET'])
@jwt_required()
def list_course_qbank(course_id):
    """Return questions for this course, grouped by AA code."""
    user = _get_user()
    is_teacher, is_enrolled, course = _course_access(course_id, user)
    if not course:
        return jsonify({'error': 'Cours introuvable'}), 404
    if not is_teacher and not is_enrolled:
        return jsonify({'error': 'Accès refusé'}), 403

    query = QuestionBankQuestion.query.filter_by(course_id=course_id)
    if not is_teacher:
        query = query.filter(QuestionBankQuestion.approved_at.isnot(None))
    questions = query.order_by(QuestionBankQuestion.clo, QuestionBankQuestion.created_at).all()

    # Group by AA
    groups: dict[str, list] = {}
    for q in questions:
        aa = _normalize_aa(q.clo) or 'Sans AA'
        groups.setdefault(aa, []).append(_serialize(q, is_teacher))

    sorted_groups = dict(sorted(groups.items()))
    return jsonify({
        'groups':   sorted_groups,
        'total':    len(questions),
        'aa_codes': list(sorted_groups.keys()),
    }), 200


@api_v1_bp.route('/courses/<int:course_id>/question-bank/generate', methods=['POST'])
@jwt_required()
def generate_course_qbank(course_id):
    """AI-generate questions and save them (unapproved)."""
    user = _get_user()
    is_teacher, _, course = _course_access(course_id, user)
    if not course:
        return jsonify({'error': 'Cours introuvable'}), 404
    if not is_teacher:
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    body          = request.get_json(silent=True) or {}
    aa_code       = (body.get('aa_code') or '').strip()
    bloom_level   = (body.get('bloom_level') or 'remember').strip()
    difficulty    = (body.get('difficulty') or 'medium').strip()
    question_type = (body.get('question_type') or 'mcq').strip()
    num_q         = max(1, min(10, int(body.get('num_questions', 3))))

    if not aa_code:
        return jsonify({'error': 'Le code AA est requis'}), 400
    if question_type not in VALID_QUESTION_TYPES:
        return jsonify({'error': f'Type invalide. Valeurs acceptées : {", ".join(VALID_QUESTION_TYPES)}'}), 400

    prompt = _build_prompt(course.title, aa_code, bloom_level, difficulty, question_type, num_q)
    try:
        llm      = _llm()
        response = llm.invoke([
            SystemMessage(content='Tu es un expert en conception pédagogique. Réponds UNIQUEMENT en JSON valide, sans texte avant ou après.'),
            HumanMessage(content=prompt),
        ])
        raw = response.content if hasattr(response, 'content') else str(response)
    except Exception as exc:
        logger.exception('LLM generation error')
        return jsonify({'error': f'Erreur de génération IA : {exc}'}), 500

    items = _parse_llm_response(raw)
    if not items:
        return jsonify({'error': 'Réponse IA invalide (JSON non parseable). Réessayez.', 'raw': raw[:500]}), 500

    # Normalise AA code for storage
    clo_val = aa_code if aa_code.upper().startswith('AA') else f'AA {aa_code}'

    saved = []
    for item in items:
        q_text = (item.get('question_text') or '').strip()
        if not q_text:
            continue
        q = QuestionBankQuestion(
            course_id      = course_id,
            question_text  = q_text,
            question_type  = question_type,
            bloom_level    = bloom_level,
            difficulty     = difficulty,
            clo            = clo_val,
            choice_a       = item.get('choice_a') or None,
            choice_b       = item.get('choice_b') or None,
            choice_c       = item.get('choice_c') or None,
            correct_choice = (item.get('correct_choice') or '')[:5].lower() or None,
            explanation    = item.get('explanation') or None,
            answer         = item.get('answer') or item.get('explanation') or None,
        )
        db.session.add(q)
        saved.append(q)

    db.session.commit()
    return jsonify({
        'message':   f'{len(saved)} question(s) générée(s) — validez-les avant de les utiliser dans un quiz.',
        'questions': [_serialize(q, is_teacher=True) for q in saved],
    }), 200


@api_v1_bp.route('/courses/<int:course_id>/question-bank/<int:question_id>', methods=['PUT'])
@jwt_required()
def update_course_qbank_question(course_id, question_id):
    """Approve, reject or edit a question."""
    user = _get_user()
    is_teacher, _, course = _course_access(course_id, user)
    if not course:
        return jsonify({'error': 'Cours introuvable'}), 404
    if not is_teacher:
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    q = QuestionBankQuestion.query.filter_by(id=question_id, course_id=course_id).first_or_404()
    body = request.get_json(silent=True) or {}

    action = body.get('action')
    if action == 'approve':
        q.approved_at    = datetime.utcnow()
        q.approved_by_id = user.id
    elif action == 'reject':
        q.approved_at    = None
        q.approved_by_id = None

    for field in ('question_text', 'choice_a', 'choice_b', 'choice_c',
                  'correct_choice', 'explanation', 'answer',
                  'bloom_level', 'difficulty'):
        if field in body:
            setattr(q, field, body[field])
    if 'aa_code' in body:
        q.clo = body['aa_code']

    db.session.commit()
    return jsonify({'question': _serialize(q, is_teacher=True)}), 200


@api_v1_bp.route('/courses/<int:course_id>/question-bank/<int:question_id>', methods=['DELETE'])
@jwt_required()
def delete_course_qbank_question(course_id, question_id):
    """Delete a question permanently."""
    user = _get_user()
    is_teacher, _, course = _course_access(course_id, user)
    if not course:
        return jsonify({'error': 'Cours introuvable'}), 404
    if not is_teacher:
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    q = QuestionBankQuestion.query.filter_by(id=question_id, course_id=course_id).first_or_404()
    db.session.delete(q)
    db.session.commit()
    return jsonify({'message': 'Question supprimée'}), 200
