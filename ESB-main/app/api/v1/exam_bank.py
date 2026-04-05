"""
Exam Bank API — Banque d'épreuves validées avec Safe Exam & Gemini 2.5 Pro
Endpoints pour la gestion des épreuves, génération de réponses et sessions de passage.
"""

import os
import json
import logging
import base64
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from app import db
from app.models import (
    Course, User, ValidatedExam, ExamBankQuestion,
    ExamSession, ExamSessionAnswer, ExamViolation, StudentPhoto, Enrollment
)
from app.api.v1.utils import get_current_user, teacher_required

logger = logging.getLogger(__name__)
exam_bank_api_bp = Blueprint('exam_bank_api', __name__, url_prefix='/exam-bank')

ALLOWED_EXAM_EXTENSIONS = {'pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png'}
ALLOWED_PHOTO_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}

def allowed_file(filename, allowed_set):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_set

def get_upload_path(*subdirs):
    path = os.path.join(current_app.config['UPLOAD_FOLDER'], *subdirs)
    os.makedirs(path, exist_ok=True)
    return path


# ─────────────────────────────────────────────────────────────────────────────
# EXAM CRUD
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/', methods=['GET'])
@jwt_required()
def list_exams():
    """Liste les épreuves validées d'un cours. course_id requis."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    course_id = request.args.get('course_id', type=int)
    if not course_id:
        return jsonify({'error': 'course_id requis'}), 400

    course = Course.query.get_or_404(course_id)

    query = ValidatedExam.query.filter_by(course_id=course_id)

    # Étudiants ne voient que les épreuves disponibles
    if not user.is_teacher and not user.is_superuser:
        # Vérifier inscription
        enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course_id).first()
        if not enrolled:
            return jsonify({'error': 'Accès non autorisé'}), 403
        query = query.filter_by(is_available=True)

    exams = query.order_by(ValidatedExam.created_at.desc()).all()
    return jsonify([e.to_dict() for e in exams])


@exam_bank_api_bp.route('/', methods=['POST'])
@jwt_required()
def create_exam():
    """Créer une nouvelle épreuve validée (enseignant seulement)."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    data = request.get_json() or {}
    course_id = data.get('course_id')
    if not course_id:
        return jsonify({'error': 'course_id requis'}), 400

    course = Course.query.get_or_404(course_id)

    exam = ValidatedExam(
        course_id=course_id,
        title=data.get('title', 'Épreuve sans titre'),
        description=data.get('description'),
        duration_minutes=data.get('duration_minutes', 60),
        total_points=data.get('total_points', 20.0),
        status='draft',
        is_available=False,
        allow_retake=data.get('allow_retake', False),
        max_attempts=data.get('max_attempts', 1),
        safe_exam_enabled=data.get('safe_exam_enabled', True),
        fullscreen_required=data.get('fullscreen_required', True),
        disable_copy_paste=data.get('disable_copy_paste', True),
        face_id_required=data.get('face_id_required', True),
        camera_monitoring=data.get('camera_monitoring', True),
        exam_password=data.get('exam_password') or None,
        created_by_id=user.id,
    )
    db.session.add(exam)
    db.session.commit()
    return jsonify(exam.to_dict()), 201


@exam_bank_api_bp.route('/<int:exam_id>', methods=['GET'])
@jwt_required()
def get_exam(exam_id):
    """Récupérer une épreuve avec ses questions."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    exam = ValidatedExam.query.get_or_404(exam_id)
    is_teacher = user.is_teacher or user.is_superuser

    # Include answers only for teachers
    return jsonify(exam.to_dict(include_questions=True))


@exam_bank_api_bp.route('/<int:exam_id>', methods=['PUT'])
@jwt_required()
def update_exam(exam_id):
    """Mettre à jour les métadonnées d'une épreuve."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    exam = ValidatedExam.query.get_or_404(exam_id)
    data = request.get_json() or {}

    for field in ['title', 'description', 'duration_minutes', 'total_points',
                  'status', 'is_available', 'allow_retake', 'max_attempts',
                  'safe_exam_enabled', 'fullscreen_required', 'disable_copy_paste',
                  'face_id_required', 'camera_monitoring']:
        if field in data:
            setattr(exam, field, data[field])

    if 'exam_password' in data:
        exam.exam_password = data['exam_password'] or None

    db.session.commit()
    return jsonify(exam.to_dict())


@exam_bank_api_bp.route('/<int:exam_id>/publish', methods=['POST'])
@jwt_required()
def publish_exam(exam_id):
    """Publier l'épreuve — la rend visible aux étudiants."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403
    exam = ValidatedExam.query.get_or_404(exam_id)
    exam.is_available = True
    exam.status = 'active'
    db.session.commit()
    return jsonify(exam.to_dict())


@exam_bank_api_bp.route('/<int:exam_id>/unpublish', methods=['POST'])
@jwt_required()
def unpublish_exam(exam_id):
    """Dépublier l'épreuve — la masque aux étudiants."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403
    exam = ValidatedExam.query.get_or_404(exam_id)
    exam.is_available = False
    exam.status = 'draft'
    db.session.commit()
    return jsonify(exam.to_dict())


@exam_bank_api_bp.route('/<int:exam_id>/delete', methods=['DELETE'])
@jwt_required()
def delete_exam(exam_id):
    """Supprimer une épreuve."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    exam = ValidatedExam.query.get_or_404(exam_id)
    db.session.delete(exam)
    db.session.commit()
    return jsonify({'message': 'Épreuve supprimée'}), 200


# ─────────────────────────────────────────────────────────────────────────────
# UPLOAD FICHIER ÉPREUVE
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/<int:exam_id>/upload', methods=['POST'])
@jwt_required()
def upload_exam_file(exam_id):
    """Upload le fichier PDF/DOCX de l'épreuve."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    exam = ValidatedExam.query.get_or_404(exam_id)

    if 'file' not in request.files:
        return jsonify({'error': 'Fichier manquant'}), 400

    file = request.files['file']
    if not file.filename or not allowed_file(file.filename, ALLOWED_EXAM_EXTENSIONS):
        return jsonify({'error': 'Format de fichier non supporté'}), 400

    upload_dir = get_upload_path('exam_files', str(exam.course_id))
    filename = secure_filename(f"exam_{exam_id}_{file.filename}")
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)

    exam.file_path = filepath
    db.session.commit()
    return jsonify({'message': 'Fichier uploadé', 'file_path': filename})


# ─────────────────────────────────────────────────────────────────────────────
# QUESTIONS D'ÉPREUVE
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/<int:exam_id>/questions', methods=['POST'])
@jwt_required()
def add_question(exam_id):
    """Ajouter une question à une épreuve."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    exam = ValidatedExam.query.get_or_404(exam_id)
    data = request.get_json() or {}

    # Determine order
    max_order = db.session.query(db.func.max(ExamBankQuestion.order)).filter_by(exam_id=exam_id).scalar() or 0

    question = ExamBankQuestion(
        exam_id=exam_id,
        order=data.get('order', max_order + 1),
        question_text=data.get('question_text', ''),
        question_type=data.get('question_type', 'open_ended'),
        choice_a=data.get('choice_a'),
        choice_b=data.get('choice_b'),
        choice_c=data.get('choice_c'),
        choice_d=data.get('choice_d'),
        correct_choice=data.get('correct_choice'),
        answer=data.get('answer'),
        answer_generated=False,
        points=data.get('points', 1.0),
        bloom_level=data.get('bloom_level'),
        clo=data.get('clo'),
        difficulty=data.get('difficulty'),
        programming_language=data.get('programming_language'),
        expected_output=data.get('expected_output'),
    )
    db.session.add(question)
    db.session.commit()
    return jsonify(question.to_dict(include_answer=True)), 201


@exam_bank_api_bp.route('/<int:exam_id>/questions/<int:question_id>', methods=['PUT'])
@jwt_required()
def update_question(exam_id, question_id):
    """Mettre à jour une question d'épreuve."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    question = ExamBankQuestion.query.filter_by(id=question_id, exam_id=exam_id).first_or_404()
    data = request.get_json() or {}

    for field in ['question_text', 'question_type', 'choice_a', 'choice_b', 'choice_c',
                  'choice_d', 'correct_choice', 'answer', 'points', 'bloom_level',
                  'clo', 'difficulty', 'programming_language', 'expected_output', 'order']:
        if field in data:
            setattr(question, field, data[field])

    db.session.commit()
    return jsonify(question.to_dict(include_answer=True))


@exam_bank_api_bp.route('/<int:exam_id>/questions/<int:question_id>', methods=['DELETE'])
@jwt_required()
def delete_question(exam_id, question_id):
    """Supprimer une question d'épreuve."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    question = ExamBankQuestion.query.filter_by(id=question_id, exam_id=exam_id).first_or_404()
    db.session.delete(question)
    db.session.commit()
    return jsonify({'message': 'Question supprimée'})


# ─────────────────────────────────────────────────────────────────────────────
# GÉNÉRATION DE RÉPONSES — GEMINI 2.5 PRO
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/<int:exam_id>/generate-answers', methods=['POST'])
@jwt_required()
def generate_answers(exam_id):
    """
    Générer les réponses pour toutes les questions de l'épreuve via Gemini 2.5 Pro.
    Utilise GEMINI_MODEL_ROBUST = 'gemini-2.5-pro'.
    """
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    exam = ValidatedExam.query.get_or_404(exam_id)
    questions = ExamBankQuestion.query.filter_by(exam_id=exam_id).order_by(ExamBankQuestion.order).all()

    if not questions:
        return jsonify({'error': 'Aucune question dans cette épreuve'}), 400

    api_key = current_app.config.get('GOOGLE_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if not api_key:
        return jsonify({'error': 'GOOGLE_API_KEY non configurée'}), 500

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-pro')

        course = Course.query.get(exam.course_id)
        course_name = course.title if course else 'Ce cours'

        generated_count = 0

        for question in questions:
            if question.answer_generated and question.answer:
                continue  # Skip already generated

            # Build prompt based on question type
            if question.question_type == 'mcq':
                prompt = f"""Tu es un expert pédagogique. Pour cette question de type QCM du cours "{course_name}", identifie la bonne réponse et explique pourquoi.

Question: {question.question_text}
A) {question.choice_a or 'N/A'}
B) {question.choice_b or 'N/A'}
C) {question.choice_c or 'N/A'}
D) {question.choice_d or 'N/A'}

Réponds en JSON avec:
{{
  "correct_choice": "A|B|C|D",
  "answer": "Explication détaillée de la bonne réponse et pourquoi les autres sont incorrectes"
}}"""

            elif question.question_type == 'true_false':
                prompt = f"""Tu es un expert pédagogique. Pour cette question Vrai/Faux du cours "{course_name}", détermine la réponse correcte.

Question: {question.question_text}

Réponds en JSON avec:
{{
  "correct_choice": "True|False",
  "answer": "Explication détaillée justifiant la réponse"
}}"""

            elif question.question_type == 'code':
                lang = question.programming_language or 'Python'
                prompt = f"""Tu es un expert en {lang} et pédagogie. Pour cette question pratique de code du cours "{course_name}", fournis une solution complète et commentée.

Question: {question.question_text}

Réponds en JSON avec:
{{
  "answer": "Solution complète en {lang} avec commentaires explicatifs",
  "expected_output": "Sortie attendue du programme (si applicable)"
}}"""

            else:  # open_ended, practical
                prompt = f"""Tu es un expert pédagogique. Pour cette question ouverte du cours "{course_name}", fournis une réponse modèle complète et structurée.

Question: {question.question_text}

Fournis une réponse modèle détaillée qui couvre tous les aspects importants. Structure ta réponse avec des points clés.
Réponds en JSON avec:
{{
  "answer": "Réponse modèle complète et structurée"
}}"""

            try:
                response = model.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(
                        temperature=0.3,
                        response_mime_type="application/json"
                    )
                )

                result_text = response.text.strip()
                # Clean JSON if needed
                if result_text.startswith('```'):
                    result_text = result_text.split('```')[1]
                    if result_text.startswith('json'):
                        result_text = result_text[4:]

                result = json.loads(result_text)
                question.answer = result.get('answer', '')
                question.answer_generated = True

                if question.question_type in ('mcq', 'true_false') and 'correct_choice' in result:
                    question.correct_choice = result['correct_choice']

                if question.question_type == 'code' and 'expected_output' in result:
                    question.expected_output = result.get('expected_output', '')

                generated_count += 1

            except Exception as e:
                logger.error(f"Erreur génération réponse question {question.id}: {e}")
                question.answer = f"[Erreur de génération: {str(e)}]"

        db.session.commit()
        return jsonify({
            'message': f'{generated_count} réponses générées avec succès',
            'generated_count': generated_count,
            'total_questions': len(questions),
        })

    except Exception as e:
        logger.error(f"Erreur generate_answers: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# SESSIONS DE PASSAGE D'ÉPREUVE
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/<int:exam_id>/sessions', methods=['POST'])
@jwt_required()
def start_session(exam_id):
    """Démarrer une session de passage d'épreuve."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    exam = ValidatedExam.query.get_or_404(exam_id)

    if not exam.is_available and not user.is_teacher and not user.is_superuser:
        return jsonify({'error': 'Cette épreuve n\'est pas disponible'}), 403

    # Vérifier le nombre de tentatives
    existing_sessions = ExamSession.query.filter_by(
        exam_id=exam_id, student_id=user.id
    ).filter(ExamSession.status != 'started').count()

    if existing_sessions >= exam.max_attempts and not exam.allow_retake:
        return jsonify({'error': 'Nombre maximum de tentatives atteint'}), 400

    # Vérifier session en cours
    active_session = ExamSession.query.filter_by(
        exam_id=exam_id, student_id=user.id, status='started'
    ).first()

    if active_session:
        return jsonify(active_session.to_dict()), 200

    session = ExamSession(
        exam_id=exam_id,
        student_id=user.id,
        attempt_number=existing_sessions + 1,
        status='started',
    )
    db.session.add(session)
    db.session.commit()

    # Return session with exam questions (without answers)
    result = session.to_dict()
    result['exam'] = exam.to_dict(include_questions=True)
    return jsonify(result), 201


@exam_bank_api_bp.route('/sessions/<int:session_id>', methods=['GET'])
@jwt_required()
def get_session(session_id):
    """Récupérer une session de passage."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    session = ExamSession.query.get_or_404(session_id)

    # Only student or teacher can access
    if session.student_id != user.id and not user.is_teacher and not user.is_superuser:
        return jsonify({'error': 'Accès non autorisé'}), 403

    result = session.to_dict(include_answers=True)
    result['exam'] = session.exam.to_dict(include_questions=True)
    return jsonify(result)


@exam_bank_api_bp.route('/sessions/<int:session_id>/answer', methods=['POST'])
@jwt_required()
def save_answer(session_id):
    """Sauvegarder la réponse d'un étudiant à une question."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    session = ExamSession.query.get_or_404(session_id)
    if session.student_id != user.id:
        return jsonify({'error': 'Accès non autorisé'}), 403

    if session.status != 'started':
        return jsonify({'error': 'Session non active'}), 400

    data = request.get_json() or {}
    question_id = data.get('question_id')
    if not question_id:
        return jsonify({'error': 'question_id requis'}), 400

    question = ExamBankQuestion.query.get_or_404(question_id)

    # Upsert answer
    answer = ExamSessionAnswer.query.filter_by(
        session_id=session_id, question_id=question_id
    ).first()

    if not answer:
        answer = ExamSessionAnswer(session_id=session_id, question_id=question_id)
        db.session.add(answer)

    answer.student_answer = data.get('student_answer')
    answer.student_choice = data.get('student_choice')

    # Auto-correct MCQ/True-False immediately
    if question.question_type in ('mcq', 'true_false') and question.correct_choice:
        answer.is_correct = (answer.student_choice == question.correct_choice)
        answer.score = question.points if answer.is_correct else 0.0

    db.session.commit()
    return jsonify(answer.to_dict())


@exam_bank_api_bp.route('/sessions/<int:session_id>/submit', methods=['POST'])
@jwt_required()
def submit_session(session_id):
    """
    Soumettre l'épreuve et calculer le score.
    Corrige MCQ/V-F automatiquement, envoie les questions ouvertes/code à Gemini pour correction.
    """
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    session = ExamSession.query.get_or_404(session_id)
    if session.student_id != user.id:
        return jsonify({'error': 'Accès non autorisé'}), 403

    if session.status != 'started':
        return jsonify({'error': 'Session déjà soumise'}), 400

    data = request.get_json() or {}
    time_spent = data.get('time_spent_seconds', 0)

    exam = session.exam
    questions = {q.id: q for q in exam.questions}
    answers = {a.question_id: a for a in session.answers}

    total_score = 0.0
    max_score = sum(q.points for q in questions.values())

    api_key = current_app.config.get('GOOGLE_API_KEY') or os.environ.get('GOOGLE_API_KEY')

    for q_id, question in questions.items():
        answer = answers.get(q_id)
        if not answer:
            continue

        if question.question_type in ('mcq', 'true_false'):
            # Already auto-corrected
            if answer.score is not None:
                total_score += answer.score
        elif question.question_type in ('open_ended', 'code', 'practical'):
            # Use Gemini 2.5 Pro to evaluate
            if api_key and answer.student_answer:
                try:
                    import google.generativeai as genai
                    genai.configure(api_key=api_key)
                    model = genai.GenerativeModel('gemini-2.5-pro')

                    eval_prompt = f"""Tu es un correcteur d'examen. Évalue cette réponse étudiant.

Question ({question.points} points): {question.question_text}
Réponse modèle: {question.answer or 'Non disponible'}

Réponse de l'étudiant: {answer.student_answer}

Évalue sur {question.points} points. Réponds en JSON:
{{
  "score": <nombre entre 0 et {question.points}>,
  "feedback": "Commentaire détaillé sur la réponse",
  "is_correct": <true si score >= 50% des points>
}}"""

                    response = model.generate_content(
                        eval_prompt,
                        generation_config=genai.GenerationConfig(
                            temperature=0.2,
                            response_mime_type="application/json"
                        )
                    )
                    result_text = response.text.strip()
                    if result_text.startswith('```'):
                        result_text = result_text.split('```')[1]
                        if result_text.startswith('json'):
                            result_text = result_text[4:]

                    eval_result = json.loads(result_text)
                    answer.score = min(float(eval_result.get('score', 0)), question.points)
                    answer.ai_feedback = eval_result.get('feedback', '')
                    answer.is_correct = eval_result.get('is_correct', False)
                    total_score += answer.score
                except Exception as e:
                    logger.error(f"Erreur correction IA question {q_id}: {e}")

    session.status = 'submitted'
    session.submitted_at = datetime.utcnow()
    session.time_spent_seconds = time_spent
    session.score = round(total_score, 2)
    session.max_score = max_score
    db.session.commit()

    return jsonify(session.to_dict(include_answers=True))


@exam_bank_api_bp.route('/sessions/<int:session_id>/violation', methods=['POST'])
@jwt_required()
def record_violation(session_id):
    """Enregistrer une violation lors d'une épreuve."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    session = ExamSession.query.get_or_404(session_id)
    if session.student_id != user.id:
        return jsonify({'error': 'Accès non autorisé'}), 403

    data = request.get_json() or {}
    violation_type = data.get('violation_type', 'unknown')

    # Count existing violations of same type
    count = ExamViolation.query.filter_by(
        session_id=session_id, violation_type=violation_type
    ).count()

    violation = ExamViolation(
        session_id=session_id,
        violation_type=violation_type,
        is_warning=(count == 0),  # First is warning, subsequent are serious
        details=data.get('details'),
    )
    db.session.add(violation)

    # Disqualify after too many violations of serious types
    serious_types = ['face_not_detected', 'multiple_faces', 'fullscreen_exit', 'tab_switch']
    if violation_type in serious_types and count >= 3:
        session.status = 'disqualified'

    db.session.commit()
    return jsonify({
        'violation': violation.to_dict(),
        'is_disqualified': session.status == 'disqualified',
        'total_violations': ExamViolation.query.filter_by(session_id=session_id).count(),
    })


@exam_bank_api_bp.route('/sessions/<int:session_id>/face-verified', methods=['POST'])
@jwt_required()
def mark_face_verified(session_id):
    """Marquer la vérification FaceID comme réussie."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    session = ExamSession.query.get_or_404(session_id)
    if session.student_id != user.id:
        return jsonify({'error': 'Accès non autorisé'}), 403

    data = request.get_json() or {}
    session.face_verified = True
    session.face_verification_score = data.get('score', 1.0)
    db.session.commit()
    return jsonify({'message': 'FaceID vérifié', 'face_verified': True})


# ─────────────────────────────────────────────────────────────────────────────
# GESTION PHOTOS ÉTUDIANTS (FaceID)
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/student-photos/<int:student_id>', methods=['POST'])
@jwt_required()
def upload_student_photo(student_id):
    """Upload ou remplace la photo de référence d'un étudiant."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants/admins'}), 403

    student = User.query.get_or_404(student_id)

    if 'photo' not in request.files:
        return jsonify({'error': 'Photo manquante'}), 400

    file = request.files['photo']
    if not file.filename or not allowed_file(file.filename, ALLOWED_PHOTO_EXTENSIONS):
        return jsonify({'error': 'Format non supporté (jpg, jpeg, png, webp)'}), 400

    upload_dir = get_upload_path('student_photos')
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"student_{student_id}.{ext}"
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)

    # Upsert StudentPhoto record
    photo = StudentPhoto.query.filter_by(student_id=student_id).first()
    if not photo:
        photo = StudentPhoto(student_id=student_id, uploaded_by_id=user.id)
        db.session.add(photo)

    photo.file_path = filepath
    photo.uploaded_by_id = user.id
    photo.uploaded_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'message': 'Photo uploadée', 'student_id': student_id})


@exam_bank_api_bp.route('/student-photos/<int:student_id>', methods=['GET'])
@jwt_required()
def get_student_photo(student_id):
    """Vérifier si un étudiant a une photo de référence."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    photo = StudentPhoto.query.filter_by(student_id=student_id).first()
    if not photo:
        return jsonify({'has_photo': False, 'student_id': student_id}), 200

    return jsonify({'has_photo': True, 'student_id': student_id,
                    'uploaded_at': photo.uploaded_at.isoformat() if photo.uploaded_at else None})


@exam_bank_api_bp.route('/verify-face', methods=['POST'])
@jwt_required()
def verify_face():
    """
    Vérifier l'identité de l'étudiant par reconnaissance faciale.
    Compare la photo capturée (base64) avec la photo de référence stockée.
    Utilise OpenCV pour la détection de visage et la comparaison.
    """
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    data = request.get_json() or {}
    image_b64 = data.get('image')  # Base64 encoded image from webcam
    student_id = data.get('student_id', user.id)

    if not image_b64:
        return jsonify({'error': 'Image manquante'}), 400

    # Get reference photo
    photo_record = StudentPhoto.query.filter_by(student_id=student_id).first()
    if not photo_record or not os.path.exists(photo_record.file_path):
        # No reference photo — allow passage with warning
        return jsonify({
            'verified': True,
            'score': 0.5,
            'message': 'Aucune photo de référence disponible, accès accordé',
            'no_reference': True,
        })

    try:
        import cv2
        import numpy as np

        # Decode base64 image
        img_data = base64.b64decode(image_b64.split(',')[-1] if ',' in image_b64 else image_b64)
        nparr = np.frombuffer(img_data, np.uint8)
        capture_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Load reference image
        reference_img = cv2.imread(photo_record.file_path)

        if capture_img is None or reference_img is None:
            return jsonify({'error': 'Impossible de décoder les images'}), 400

        # Face detection using OpenCV Haar Cascade
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

        gray_cap = cv2.cvtColor(capture_img, cv2.COLOR_BGR2GRAY)
        gray_ref = cv2.cvtColor(reference_img, cv2.COLOR_BGR2GRAY)

        faces_cap = face_cascade.detectMultiScale(gray_cap, 1.1, 4, minSize=(60, 60))
        faces_ref = face_cascade.detectMultiScale(gray_ref, 1.1, 4, minSize=(60, 60))

        if len(faces_cap) == 0:
            return jsonify({'verified': False, 'score': 0.0, 'message': 'Aucun visage détecté dans la capture'})

        if len(faces_ref) == 0:
            return jsonify({'verified': True, 'score': 0.6, 'message': 'Visage de référence non détectable, accès accordé'})

        # Extract and compare face regions using histogram comparison
        x, y, w, h = faces_cap[0]
        face_cap = cv2.resize(gray_cap[y:y+h, x:x+w], (100, 100))

        x2, y2, w2, h2 = faces_ref[0]
        face_ref = cv2.resize(gray_ref[y2:y2+h2, x2:x2+w2], (100, 100))

        # Compute histograms
        hist_cap = cv2.calcHist([face_cap], [0], None, [256], [0, 256])
        hist_ref = cv2.calcHist([face_ref], [0], None, [256], [0, 256])
        cv2.normalize(hist_cap, hist_cap)
        cv2.normalize(hist_ref, hist_ref)

        similarity = cv2.compareHist(hist_cap, hist_ref, cv2.HISTCMP_CORREL)
        score = float(max(0.0, similarity))

        # Also try template matching for additional confidence
        try:
            face_cap_small = cv2.resize(face_cap, (50, 50))
            face_ref_small = cv2.resize(face_ref, (50, 50))
            diff = np.mean(np.abs(face_cap_small.astype(float) - face_ref_small.astype(float)))
            pixel_similarity = 1.0 - (diff / 255.0)
            # Weighted average
            score = 0.6 * score + 0.4 * pixel_similarity
        except Exception:
            pass

        threshold = 0.35  # Seuil de reconnaissance (ajustable)
        verified = score >= threshold

        return jsonify({
            'verified': verified,
            'score': round(score, 3),
            'message': 'Identité vérifiée' if verified else 'Identité non confirmée, veuillez réessayer',
        })

    except ImportError:
        # OpenCV not available — fallback
        return jsonify({'verified': True, 'score': 0.5, 'message': 'Vérification non disponible, accès accordé'})
    except Exception as e:
        logger.error(f"Erreur verify_face: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# RÉSULTATS & STATISTIQUES
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/<int:exam_id>/results', methods=['GET'])
@jwt_required()
def exam_results(exam_id):
    """Résultats enrichis de toutes les sessions d'une épreuve (enseignant)."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    exam = ValidatedExam.query.get_or_404(exam_id)
    sessions = ExamSession.query.filter_by(exam_id=exam_id).all()

    submitted = [s for s in sessions if s.status in ('submitted', 'graded')]
    graded = [s for s in sessions if s.status == 'graded']
    scores = [s.score for s in submitted if s.score is not None]
    avg_score = sum(scores) / len(scores) if scores else 0
    pass_threshold = exam.total_points * 0.5
    pass_count = sum(1 for sc in scores if sc >= pass_threshold)

    # Stats per question
    stats_by_question = []
    for q in exam.questions:
        answers = ExamSessionAnswer.query.filter_by(question_id=q.id).all()
        answered = [a for a in answers if a.score is not None]
        q_avg = sum(a.score for a in answered) / len(answered) if answered else None
        correct = sum(1 for a in answered if a.is_correct)
        stats_by_question.append({
            'question_id': q.id,
            'question_text': q.question_text[:80],
            'bloom_level': q.bloom_level,
            'difficulty': q.difficulty,
            'question_type': q.question_type,
            'clo': q.clo,
            'points': q.points,
            'avg_score': round(q_avg, 2) if q_avg is not None else None,
            'correct_count': correct,
            'total_answers': len(answered),
            'success_rate': round(correct / len(answered) * 100, 1) if answered else None,
        })

    return jsonify({
        'exam': exam.to_dict(include_questions=True),
        'total_sessions': len(sessions),
        'submitted_count': len(submitted),
        'graded_count': len(graded),
        'avg_score': round(avg_score, 2),
        'pass_rate': round(pass_count / len(scores) * 100, 1) if scores else 0,
        'sessions': [s.to_dict(include_answers=True) for s in sessions],
        'stats_by_question': stats_by_question,
    })


@exam_bank_api_bp.route('/sessions/<int:session_id>/results', methods=['GET'])
@jwt_required()
def session_results(session_id):
    """Résultats d'une session de passage (avec correction)."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    session = ExamSession.query.get_or_404(session_id)

    if session.student_id != user.id and not user.is_teacher and not user.is_superuser:
        return jsonify({'error': 'Accès non autorisé'}), 403

    if session.status == 'started':
        return jsonify({'error': 'L\'épreuve n\'a pas encore été soumise'}), 400

    result = session.to_dict(include_answers=True)
    # Include exam with answers for results page
    is_teacher = user.is_teacher or user.is_superuser
    result['exam'] = session.exam.to_dict(include_questions=True)
    # Add correct answers and model answers to each question
    for q in result['exam']['questions']:
        question = ExamBankQuestion.query.get(q['id'])
        if question:
            q['answer'] = question.answer
            q['correct_choice'] = question.correct_choice

    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# AUTO-CORRECTION & VALIDATION DES NOTES
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/<int:exam_id>/auto-correct', methods=['POST'])
@jwt_required()
def auto_correct_exam(exam_id):
    """
    Corriger automatiquement toutes les sessions soumises de cette épreuve.
    - MCQ / True/False : comparaison directe correct_choice vs student_choice
    - Open-ended : correction par Gemini 2.5 Flash
    """
    import json as _json
    import google.generativeai as genai

    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    exam = ValidatedExam.query.get_or_404(exam_id)
    genai.configure(api_key=current_app.config.get('GOOGLE_API_KEY', ''))
    model = genai.GenerativeModel('gemini-2.5-flash')

    # Load TN corrections as reference if available
    tn_corrections_map = {}  # question_index -> correction text
    if exam.tn_exam_id:
        from app.models import Document
        tn_doc = Document.query.get(exam.tn_exam_id)
        if tn_doc and tn_doc.analysis_results:
            tn_corrs = tn_doc.analysis_results.get('corrections', [])
            for corr in tn_corrs:
                if corr.get('validated') and corr.get('correction'):
                    tn_corrections_map[corr.get('index', -1)] = corr.get('correction', '')

    sessions = ExamSession.query.filter_by(
        exam_id=exam_id, status='submitted'
    ).all()

    graded_count = 0
    for session in sessions:
        total_score = 0.0
        max_score = 0.0

        for answer in (session.answers or []):
            question = ExamBankQuestion.query.get(answer.question_id)
            if not question:
                continue
            max_score += question.points

            if question.question_type in ('mcq', 'true_false'):
                correct = (
                    answer.student_choice is not None and
                    question.correct_choice is not None and
                    answer.student_choice.strip().upper() == question.correct_choice.strip().upper()
                )
                answer.is_correct = correct
                answer.score = float(question.points) if correct else 0.0
                total_score += answer.score

            elif question.question_type in ('open_ended', 'code', 'practical'):
                try:
                    # Use TN correction if available, else question.answer
                    ref_answer = question.answer or 'Non fournie'
                    q_idx = question.order - 1 if hasattr(question, 'order') and question.order else -1
                    if q_idx in tn_corrections_map:
                        ref_answer = tn_corrections_map[q_idx]

                    prompt = (
                        f"Tu es un correcteur d'examen universitaire.\n"
                        f"Question : {question.question_text}\n"
                        f"Correction de référence : {ref_answer}\n"
                        f"Réponse étudiant : {answer.student_answer or '(vide)'}\n"
                        f"Points maximum : {question.points}\n\n"
                        f"Évalue la réponse par rapport à la correction de référence.\n"
                        f"Réponds UNIQUEMENT en JSON valide :\n"
                        f'{{\"score\": <number 0-{question.points}>, \"feedback\": \"<feedback constructif en français>\"}}'
                    )
                    resp = model.generate_content(prompt)
                    text = resp.text.strip()
                    # Extract JSON
                    start = text.find('{')
                    end = text.rfind('}') + 1
                    if start >= 0 and end > start:
                        parsed = _json.loads(text[start:end])
                        score = min(float(parsed.get('score', 0)), float(question.points))
                        score = max(0.0, score)
                        answer.score = score
                        answer.ai_feedback = parsed.get('feedback', '')
                    else:
                        answer.score = 0.0
                        answer.ai_feedback = 'Correction automatique indisponible.'
                except Exception as e:
                    logger.warning(f'Gemini grading failed for answer {answer.id}: {e}')
                    answer.score = 0.0
                    answer.ai_feedback = 'Correction automatique échouée.'
                total_score += answer.score or 0.0

        session.score = round(total_score, 2)
        session.max_score = round(max_score, 2)
        session.status = 'graded'
        graded_count += 1

    db.session.commit()
    return jsonify({'graded_count': graded_count, 'message': f'{graded_count} session(s) corrigée(s).'})


@exam_bank_api_bp.route('/sessions/<int:session_id>/validate-score', methods=['PUT'])
@jwt_required()
def validate_score(session_id):
    """
    Enseignant valide/modifie le score d'une question pour une session.
    Body: { question_id, score, feedback (optional) }
    """
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    session = ExamSession.query.get_or_404(session_id)
    data = request.get_json() or {}
    question_id = data.get('question_id')
    new_score = data.get('score')

    if question_id is None or new_score is None:
        return jsonify({'error': 'question_id et score requis'}), 400

    answer = ExamSessionAnswer.query.filter_by(
        session_id=session_id, question_id=question_id
    ).first()
    if not answer:
        return jsonify({'error': 'Réponse introuvable'}), 404

    question = ExamBankQuestion.query.get(question_id)
    max_pts = float(question.points) if question else float('inf')
    answer.score = min(max(0.0, float(new_score)), max_pts)
    if data.get('feedback'):
        answer.ai_feedback = data['feedback']
    answer.is_correct = (answer.score > 0)

    # Recalculate session total
    session.score = round(sum(
        (a.score or 0.0) for a in (session.answers or [])
    ), 2)
    db.session.commit()

    return jsonify({'ok': True, 'session_score': session.score})


# ─────────────────────────────────────────────────────────────────────────────
# PUBLISH FEEDBACKS
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/<int:exam_id>/publish-feedbacks', methods=['POST'])
@jwt_required()
def publish_feedbacks(exam_id):
    """Publie les feedbacks aux étudiants sélectionnés."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    data = request.get_json() or {}
    session_ids = data.get('session_ids', [])
    global_message = data.get('message', '')

    if not session_ids:
        return jsonify({'error': 'Aucune session sélectionnée'}), 400

    published = 0
    for sid in session_ids:
        session = ExamSession.query.filter_by(id=sid, exam_id=exam_id).first()
        if session and session.status == 'graded':
            if global_message:
                session.feedback = global_message + ('\n\n' + session.feedback if session.feedback else '')
            session.feedback_published = True
            published += 1

    db.session.commit()
    return jsonify({'published_count': published, 'message': f'{published} feedback(s) publiés'})


@exam_bank_api_bp.route('/sessions/<int:session_id>/feedback', methods=['PUT'])
@jwt_required()
def update_session_feedback(session_id):
    """Modifie le feedback global et/ou le score d'une session."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    session = ExamSession.query.get_or_404(session_id)
    data = request.get_json() or {}

    if 'feedback' in data:
        session.feedback = data['feedback']
    if 'score' in data and data['score'] is not None:
        session.score = min(float(data['score']), session.max_score or float('inf'))
        session.status = 'graded'

    db.session.commit()
    return jsonify(session.to_dict())


# ─────────────────────────────────────────────────────────────────────────────
# GENERATE EXAM FROM TN DOCUMENT
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/generate-from-tn', methods=['POST'])
@jwt_required()
def generate_from_tn():
    """
    Génère une ValidatedExam depuis un TnExamDocument analysé.
    Importe l'entête et toutes les questions de l'épreuve TN.
    """
    from app.models import Document

    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    data = request.get_json() or {}
    tn_exam_id = data.get('tn_exam_id')
    course_id = data.get('course_id')

    if not tn_exam_id or not course_id:
        return jsonify({'error': 'tn_exam_id et course_id requis'}), 400

    doc = Document.query.get_or_404(tn_exam_id)
    if doc.document_type != 'tn_exam' or doc.course_id != course_id:
        return jsonify({'error': 'Épreuve TN introuvable pour ce cours'}), 404

    if not doc.analysis_results:
        return jsonify({'error': "L'épreuve TN n'a pas encore été analysée"}), 400

    ar = doc.analysis_results
    meta = ar.get('exam_metadata') or {}

    # ── Build exam metadata ─────────────────────────────────────────────────
    title = data.get('title') or doc.title or f'Épreuve #{doc.id}'

    description_parts = []
    for key, label in [('module', 'Module'), ('niveau', 'Niveau'), ('specialite', 'Spécialité'),
                        ('semestre', 'Semestre'), ('enseignant', 'Enseignant'), ('date', 'Date')]:
        if meta.get(key):
            description_parts.append(f"{label} : {meta[key]}")
    description = data.get('description') or ('\n'.join(description_parts) if description_parts else None)

    duration = int(
        data.get('duration_minutes')
        or meta.get('declared_duration_min')
        or ar.get('declared_duration_min')
        or 60
    )

    # ── Questions ──────────────────────────────────────────────────────────
    # Frontend may send questions; fallback to extracted_questions, then questions key
    raw_questions = (
        data.get('questions')
        or ar.get('extracted_questions')
        or ar.get('questions')
        or []
    )
    total_pts = float(
        data.get('total_points')
        or ar.get('total_max_points')
        or sum(float(q.get('points') or 1) for q in raw_questions)
        or 20.0
    )

    exam = ValidatedExam(
        course_id=course_id,
        title=title,
        description=description,
        duration_minutes=duration,
        total_points=total_pts,
        status='draft',
        is_available=False,
        allow_retake=False,
        max_attempts=1,
        safe_exam_enabled=data.get('safe_exam_enabled', True),
        fullscreen_required=data.get('fullscreen_required', True),
        disable_copy_paste=data.get('disable_copy_paste', True),
        face_id_required=data.get('face_id_required', False),
        camera_monitoring=data.get('camera_monitoring', False),
        exam_password=data.get('exam_password') or None,
        tn_exam_id=tn_exam_id,
        created_by_id=user.id,
    )
    db.session.add(exam)
    db.session.flush()

    for i, q in enumerate(raw_questions):
        text = q.get('text') or q.get('Text') or q.get('question_text') or f'Question {i + 1}'
        bank_q = ExamBankQuestion(
            exam_id=exam.id,
            order=i + 1,
            question_text=text,
            question_type=_map_tn_question_type(q.get('Type') or q.get('question_type') or ''),
            points=float(q.get('points') or 1.0),
            bloom_level=q.get('Bloom_Level') or q.get('bloom_level'),
            difficulty=q.get('Difficulty') or q.get('difficulty'),
            answer_generated=False,
        )
        db.session.add(bank_q)

    db.session.commit()
    return jsonify(exam.to_dict(include_questions=True)), 201


def _map_tn_question_type(raw: str) -> str:
    """Map TN exam question type label to ExamBankQuestion type."""
    raw = (raw or '').lower()
    if any(k in raw for k in ['qcm', 'mcq', 'choix', 'choice']):
        return 'mcq'
    if any(k in raw for k in ['vrai', 'faux', 'true', 'false']):
        return 'true_false'
    if any(k in raw for k in ['code', 'program', 'algo']):
        return 'code'
    if any(k in raw for k in ['prat', 'manip']):
        return 'practical'
    return 'open_ended'

# ─────────────────────────────────────────────────────────────────────────────
# COURSE REVIEW REPORT
# ─────────────────────────────────────────────────────────────────────────────

@exam_bank_api_bp.route('/course-review/<int:course_id>', methods=['GET'])
@jwt_required()
def course_review(course_id):
    """
    Génère un rapport Course Review complet avec statistiques de tous les examens du cours.
    """
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Réservé aux enseignants'}), 403

    exams = ValidatedExam.query.filter_by(course_id=course_id).all()
    if not exams:
        return jsonify({'error': 'Aucun examen trouvé pour ce cours'}), 404

    # Aggregate data across all exams
    all_sessions = []
    bloom_stats: dict = {}
    difficulty_stats: dict = {}
    clo_stats: dict = {}
    question_type_stats: dict = {}
    exam_summaries = []

    for exam in exams:
        sessions = ExamSession.query.filter_by(exam_id=exam.id).all()
        submitted = [s for s in sessions if s.status in ('submitted', 'graded')]
        scores = [s.score for s in submitted if s.score is not None]
        all_sessions.extend(submitted)

        exam_summaries.append({
            'id': exam.id,
            'title': exam.title,
            'is_available': exam.is_available,
            'total_sessions': len(sessions),
            'submitted_count': len(submitted),
            'avg_score': round(sum(scores) / len(scores), 2) if scores else None,
            'pass_rate': round(
                sum(1 for s in scores if s >= exam.total_points * 0.5) / len(scores) * 100, 1
            ) if scores else None,
        })

        # Per-question aggregation
        for q in exam.questions:
            answers = ExamSessionAnswer.query.filter_by(question_id=q.id).all()
            answered = [a for a in answers if a.score is not None]

            bloom = q.bloom_level or 'Non défini'
            diff = q.difficulty or 'Non défini'
            clo = q.clo or 'Non défini'
            qtype = q.question_type or 'Non défini'

            for key, stats_dict in [(bloom, bloom_stats), (diff, difficulty_stats),
                                    (clo, clo_stats), (qtype, question_type_stats)]:
                if key not in stats_dict:
                    stats_dict[key] = {'total': 0, 'correct': 0, 'score_sum': 0, 'count': 0}
                stats_dict[key]['total'] += q.points
                stats_dict[key]['correct'] += sum(1 for a in answered if a.is_correct)
                stats_dict[key]['score_sum'] += sum(a.score or 0 for a in answered)
                stats_dict[key]['count'] += len(answered)

    # Build performance rates
    def build_rates(stats_dict):
        return {k: round(v['correct'] / v['count'] * 100, 1) if v['count'] > 0 else 0
                for k, v in stats_dict.items()}

    # Overall statistics
    all_scores = [s.score for s in all_sessions if s.score is not None]
    overall_avg = round(sum(all_scores) / len(all_scores), 2) if all_scores else 0

    # Generate AI recommendations if available
    recommendations = []
    try:
        import google.generativeai as genai
        genai.configure(api_key=current_app.config.get('GOOGLE_API_KEY', ''))
        model = genai.GenerativeModel('gemini-2.5-flash')

        stats_summary = {
            'exam_count': len(exams),
            'total_students': len(set(s.student_id for s in all_sessions)),
            'overall_avg_score': overall_avg,
            'bloom_success_rates': build_rates(bloom_stats),
            'difficulty_success_rates': build_rates(difficulty_stats),
            'clo_success_rates': build_rates(clo_stats),
        }

        prompt = f"""Tu es un expert pédagogique. Analyse ces statistiques d'examens et fournis 5 recommandations d'amélioration spécifiques et actionnables.

Statistiques : {stats_summary}

Retourne uniquement un JSON :
{{"recommendations": ["recommandation 1", "recommandation 2", "recommandation 3", "recommandation 4", "recommandation 5"]}}"""

        resp = model.generate_content(prompt)
        text = resp.text.strip()
        start = text.find('{')
        end = text.rfind('}') + 1
        if start >= 0 and end > start:
            import json
            parsed = json.loads(text[start:end])
            recommendations = parsed.get('recommendations', [])
    except Exception:
        recommendations = [
            'Renforcer les exercices sur les compétences à faible taux de réussite.',
            'Équilibrer la distribution des niveaux de Bloom dans les futurs examens.',
            'Proposer des ressources supplémentaires pour les CLO avec les scores les plus bas.',
            'Augmenter le nombre de questions pratiques pour améliorer l\'engagement.',
            'Revoir les critères de notation pour assurer une évaluation cohérente.',
        ]

    return jsonify({
        'course_id': course_id,
        'exam_summaries': exam_summaries,
        'overall_stats': {
            'total_exams': len(exams),
            'total_sessions': len(all_sessions),
            'overall_avg_score': overall_avg,
            'total_students': len(set(s.student_id for s in all_sessions)),
        },
        'bloom_performance': build_rates(bloom_stats),
        'difficulty_performance': build_rates(difficulty_stats),
        'clo_performance': build_rates(clo_stats),
        'question_type_performance': build_rates(question_type_stats),
        'recommendations': recommendations,
    }), 200


# ─────────────────────────────────────────────────────────────────────────────
# COURSE REVIEW
# ─────────────────────────────────────────────────────────────────────────────

