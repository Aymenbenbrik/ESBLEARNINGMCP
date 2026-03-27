"""
Exam API — gestion des évaluations de cours (Examen, DS, Épreuve pratique)
===========================================================================
GET    /courses/<id>/exams              lister toutes les évaluations
GET    /courses/<id>/exam               retro-compat: dernière évaluation
POST   /courses/<id>/exam/upload        upload + config de l'évaluation
PATCH  /courses/<id>/exam/<eid>/config  mettre à jour la config (type, weight, AAs)
POST   /courses/<id>/exam/analyze       déclencher l'analyse IA
DELETE /courses/<id>/exam/<eid>         supprimer une évaluation
"""
import os
import uuid
import logging
import json
from datetime import datetime

from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from app.api.v1 import api_v1_bp
from app import db
from app.models import User, Course, Enrollment, CourseExam, Chapter, Document

logger = logging.getLogger(__name__)

EXAM_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt', 'md'}

EXAM_TYPE_LABELS = {
    'examen': 'Examen final',
    'ds': 'Devoir Surveillé (DS)',
    'pratique': 'Épreuve pratique',
}


def _course_access(course_id: int):
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    course = Course.query.get_or_404(course_id)
    is_teacher = bool(user.is_teacher and course.teacher_id == user.id) or bool(user.is_superuser)
    is_student = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())
    return user, course, is_teacher, is_student


def _allowed_exam(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in EXAM_EXTENSIONS


def _get_gemini(task: str = 'analysis'):
    """
    Return a Gemini LLM tuned for the given task.

    task='analysis'     → gemini-2.5-pro  (deep reasoning, exam evaluation)
    task='generation'   → gemini-2.5-pro  (creative + pedagogical question writing)
    task='fast'         → gemini-2.5-flash (quick checks, config patching)
    """
    from langchain_google_genai import ChatGoogleGenerativeAI
    api_key = current_app.config.get('GOOGLE_API_KEY', '')

    if task == 'fast':
        model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
        temp, tokens = 0.1, 2048
    else:
        model = current_app.config.get('GEMINI_EXAM_MODEL', 'gemini-2.5-pro')
        temp = 0.4 if task == 'generation' else 0.2
        tokens = 16000

    try:
        return ChatGoogleGenerativeAI(
            model=model, google_api_key=api_key,
            temperature=temp, max_tokens=tokens,
        )
    except Exception:
        # Fallback to flash
        return ChatGoogleGenerativeAI(
            model='gemini-2.5-flash', google_api_key=api_key,
            temperature=temp, max_tokens=min(tokens, 8192),
        )


def _extract_text(file_path: str, ext: str) -> str:
    """Extract plain text from uploaded exam file."""
    full = os.path.join(current_app.config['UPLOAD_FOLDER'], file_path)
    if ext in ('txt', 'md'):
        with open(full, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    if ext == 'pdf':
        try:
            import fitz
            doc = fitz.open(full)
            return '\n'.join(page.get_text() for page in doc)
        except Exception:
            pass
    if ext in ('doc', 'docx'):
        try:
            from docx import Document
            doc = Document(full)
            return '\n'.join(p.text for p in doc.paragraphs)
        except Exception:
            pass
    return ''


def _get_chapter_difficulty_context(course) -> str:
    """Build a context string describing difficulty level per chapter based on documents."""
    chapters = Chapter.query.filter_by(course_id=course.id).order_by(Chapter.order).all()
    if not chapters:
        return "Aucun chapitre défini pour ce cours."

    lines = []
    total = len(chapters)
    for ch in chapters:
        docs = Document.query.filter_by(chapter_id=ch.id).all()
        doc_titles = [d.title for d in docs if d.document_type not in ('quiz',)]

        idx = chapters.index(ch) + 1
        if idx <= total / 3:
            diff = "Fondamental (facile)"
        elif idx <= 2 * total / 3:
            diff = "Intermédiaire (moyen)"
        else:
            diff = "Avancé (difficile)"

        doc_str = f" | Documents: {', '.join(doc_titles[:3])}" if doc_titles else ""
        lines.append(f"  - Chapitre {ch.order}: {ch.title} → Niveau {diff}{doc_str}")

    return "\n".join(lines)


# ─── GET all exams (list) ───────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exams', methods=['GET'])
@jwt_required()
def list_course_exams(course_id):
    user, course, is_teacher, is_student = _course_access(course_id)
    if not is_teacher and not is_student:
        return jsonify({'error': 'Access denied'}), 403

    exams = (CourseExam.query
             .filter_by(course_id=course_id)
             .order_by(CourseExam.created_at.desc())
             .all())
    return jsonify({'exams': [e.to_dict() for e in exams]}), 200


# ─── GET exam (retro-compat) ────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exam', methods=['GET'])
@jwt_required()
def get_course_exam(course_id):
    user, course, is_teacher, is_student = _course_access(course_id)
    if not is_teacher and not is_student:
        return jsonify({'error': 'Access denied'}), 403

    exam = (CourseExam.query
            .filter_by(course_id=course_id)
            .order_by(CourseExam.created_at.desc())
            .first())
    return jsonify({'exam': exam.to_dict() if exam else None}), 200


# ─── POST upload ────────────────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exam/upload', methods=['POST'])
@jwt_required()
def upload_course_exam(course_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'Empty filename'}), 400
    if not _allowed_exam(f.filename):
        return jsonify({'error': 'Type de fichier non autorisé (pdf, docx, txt, md)'}), 400

    exam_type = request.form.get('exam_type', 'examen')
    if exam_type not in ('examen', 'ds', 'pratique'):
        exam_type = 'examen'

    try:
        weight = float(request.form.get('weight', 30.0))
    except (ValueError, TypeError):
        weight = 30.0

    has_practical_target_raw = request.form.get('has_practical_target', 'false')
    has_practical_target = has_practical_target_raw.lower() in ('true', '1', 'yes')

    target_aa_ids_raw = request.form.get('target_aa_ids', '[]')
    try:
        target_aa_ids = json.loads(target_aa_ids_raw)
        if not isinstance(target_aa_ids, list):
            target_aa_ids = []
    except Exception:
        target_aa_ids = []

    original = secure_filename(f.filename)
    ext = original.rsplit('.', 1)[1].lower()
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    folder = os.path.join(current_app.config['UPLOAD_FOLDER'], 'exams', f'course_{course_id}')
    os.makedirs(folder, exist_ok=True)
    full_path = os.path.join(folder, unique_name)
    f.save(full_path)

    rel_path = os.path.join('exams', f'course_{course_id}', unique_name)
    exam = CourseExam(
        course_id=course_id,
        file_path=rel_path,
        original_name=original,
        status='uploaded',
        exam_type=exam_type,
        weight=weight,
        target_aa_ids=target_aa_ids,
        has_practical_target=has_practical_target,
    )
    db.session.add(exam)
    db.session.commit()
    return jsonify({'exam': exam.to_dict()}), 201


# ─── PATCH config ───────────────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exam/<int:exam_id>/config', methods=['PATCH'])
@jwt_required()
def update_exam_config(course_id, exam_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    exam = CourseExam.query.filter_by(id=exam_id, course_id=course_id).first_or_404()
    data = request.get_json() or {}

    if 'exam_type' in data and data['exam_type'] in ('examen', 'ds', 'pratique'):
        exam.exam_type = data['exam_type']
    if 'weight' in data:
        exam.weight = float(data['weight'])
    if 'target_aa_ids' in data and isinstance(data['target_aa_ids'], list):
        exam.target_aa_ids = data['target_aa_ids']
    if 'has_practical_target' in data:
        exam.has_practical_target = bool(data['has_practical_target'])

    exam.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'exam': exam.to_dict()}), 200


# ─── POST analyze ───────────────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exam/analyze', methods=['POST'])
@jwt_required()
def analyze_course_exam(course_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json() or {}
    exam_id = data.get('exam_id')
    exam = CourseExam.query.filter_by(id=exam_id, course_id=course_id).first_or_404()

    exam.status = 'analyzing'
    db.session.commit()

    try:
        ext = exam.file_path.rsplit('.', 1)[1].lower() if exam.file_path else ''
        text = _extract_text(exam.file_path, ext)
        if not text.strip():
            raise ValueError('Could not extract text from file')

        syllabus = course.syllabus
        all_aa_list = []
        if syllabus:
            for aa in syllabus.tn_aa:
                all_aa_list.append({'number': aa.number, 'description': aa.description or ''})

        target_ids = exam.target_aa_ids or []
        if target_ids:
            target_aas = [a for a in all_aa_list if a['number'] in target_ids]
        else:
            target_aas = all_aa_list

        aa_context = '\n'.join(
            f"AA{a['number']}: {a['description']}" for a in target_aas[:20]
        ) if target_aas else 'Non définis'

        chapter_context = _get_chapter_difficulty_context(course)

        exam_type_label = EXAM_TYPE_LABELS.get(exam.exam_type or 'examen', 'Examen')
        practical_instruction = (
            "L'enseignant ATTEND des questions pratiques dans cette épreuve."
            if exam.has_practical_target
            else "Cette épreuve ne cible PAS de questions pratiques (théorique)."
        )

        prompt = f"""Tu es un expert pédagogique. Analyse cette épreuve de cours.

COURS: {course.title}
TYPE D'ÉPREUVE: {exam_type_label}
PONDÉRATION: {exam.weight or 30}%
{practical_instruction}

ACQUIS D'APPRENTISSAGE CIBLÉS:
{aa_context}

STRUCTURE DES CHAPITRES (niveaux de difficulté):
{chapter_context}

TEXTE DE L'ÉPREUVE:
{text[:8000]}

Retourne UNIQUEMENT un JSON valide avec cette structure exacte (pas de markdown, pas de texte avant/après):
{{
  "overview": "résumé de l'épreuve en 2-3 phrases",
  "questions_count": <nombre de questions>,
  "estimated_duration": "<durée estimée ex: 2h>",
  "avg_difficulty": "<facile|moyen|difficile>",
  "has_practical_questions": <true|false>,
  "practical_questions_count": <nombre de questions pratiques, 0 si aucune>,
  "bloom_distribution": {{
    "remembering": <% int, total doit faire 100>,
    "understanding": <% int>,
    "applying": <% int>,
    "analyzing": <% int>,
    "evaluating": <% int>,
    "creating": <% int>
  }},
  "difficulty_by_chapter": [
    {{"chapter": "Chapitre 1: <titre>", "difficulty": "<facile|moyen|difficile>", "questions_count": <int>, "comment": "..."}}
  ],
  "aa_alignment": [
    {{"aa": "AA1", "covered": <true|false>, "comment": "..."}}
  ],
  "strengths": ["point fort 1", "point fort 2"],
  "feedback": ["observation 1", "observation 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "overall_score": <note sur 10 int>,
  "improvement_proposals": [
    {{
      "aa": "AA2",
      "bloom_level": "analyzing",
      "question_type": "open_ended",
      "is_practical": <true|false>,
      "difficulty": "moyen",
      "question_text": "Texte de la question proposée...",
      "rationale": "Pourquoi cette question améliore l'épreuve"
    }}
  ]
}}

RÈGLES:
- improvement_proposals: propose 3-5 questions pour corriger les lacunes détectées (AAs non couverts, niveaux Bloom manquants, équilibre pratique/théorique)
- difficulty_by_chapter: analyse quels chapitres sont couverts et à quel niveau
- has_practical_questions: true si l'épreuve contient des manipulations, TP, code, calculs appliqués
- bloom_distribution: les 6 valeurs doivent totaliser 100"""

        # Use gemini-2.5-pro for deep pedagogical analysis + question generation
        llm = _get_gemini(task='analysis')
        try:
            response = llm.invoke(prompt)
        except Exception as model_err:
            logger.warning(f'Pro model failed, trying flash: {model_err}')
            from langchain_google_genai import ChatGoogleGenerativeAI
            fallback_llm = ChatGoogleGenerativeAI(
                model='gemini-2.5-flash',
                google_api_key=current_app.config.get('GOOGLE_API_KEY', ''),
                temperature=0.2, max_tokens=8192
            )
            response = fallback_llm.invoke(prompt)
        raw = response.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        evaluation = json.loads(raw.strip())

        exam.ai_evaluation = evaluation
        exam.status = 'done'
        exam.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'exam': exam.to_dict()}), 200

    except Exception as e:
        logger.error(f'Exam analysis failed: {e}')
        exam.status = 'error'
        exam.ai_evaluation = {'error': str(e), 'error_message': 'Analyse échouée. Vérifiez les logs.'}
        db.session.commit()
        return jsonify({'exam': exam.to_dict(), 'warning': str(e)}), 200  # Return 200 so frontend refetches


# ─── GENERATE extra questions (Gemini 2.5 Pro) ──────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exam/<int:exam_id>/generate', methods=['POST'])
@jwt_required()
def generate_exam_questions(course_id, exam_id):
    """
    Use Gemini 2.5 Pro (generation mode) to create additional questions
    targeting the gaps found in the exam analysis.
    Body (JSON): { count: int, focus: 'bloom' | 'aa' | 'difficulty' | 'practical' }
    Returns: { questions: [...] }
    """
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    exam = CourseExam.query.filter_by(id=exam_id, course_id=course_id).first_or_404()
    if not exam.ai_evaluation or exam.ai_evaluation.get('error'):
        return jsonify({'error': 'Analysez l\'épreuve avant de générer des questions'}), 400

    data = request.get_json(silent=True) or {}
    count = min(int(data.get('count', 5)), 10)
    focus = data.get('focus', 'aa')  # bloom | aa | difficulty | practical

    ev = exam.ai_evaluation
    aa_gaps = [a['aa'] for a in (ev.get('aa_alignment') or []) if not a.get('covered')]
    bloom_dist = ev.get('bloom_distribution') or {}
    bloom_gaps = [k for k, v in bloom_dist.items() if isinstance(v, (int, float)) and v < 5]
    suggestions = ev.get('suggestions', [])

    focus_instructions = {
        'bloom': f"Niveaux de Bloom sous-représentés : {', '.join(bloom_gaps) or 'aucun'}. Priorisez les questions d'ordre supérieur (analyse, évaluation, création).",
        'aa': f"AAs non couverts : {', '.join(aa_gaps) or 'aucun'}. Générez des questions qui valident explicitement ces acquis.",
        'difficulty': "Produisez un mix équilibré : 30% Fondamental, 40% Intermédiaire, 30% Avancé.",
        'practical': "Générez uniquement des questions pratiques : études de cas, exercices de calcul, manipulation, code ou application directe.",
    }.get(focus, '')

    prompt = f"""Tu es un expert en ingénierie pédagogique et en conception d'examens universitaires.

COURS : {course.title}
TYPE D'ÉPREUVE : {exam.exam_type}
OBSERVATIONS SUR L'ÉPREUVE ACTUELLE :
- Lacunes AAs : {aa_gaps}
- Niveaux Bloom faibles : {bloom_gaps}
- Suggestions : {suggestions}

MISSION : Génère exactement {count} nouvelles questions d'examen pour combler les lacunes.
FOCUS : {focus_instructions}

Retourne UNIQUEMENT du JSON valide (sans ```), structure :
{{
  "questions": [
    {{
      "text": "Énoncé complet de la question",
      "type": "qcm | ouvert | pratique | vrai_faux",
      "bloom_level": "remembering | understanding | applying | analyzing | evaluating | creating",
      "aa_targeted": "AA visé (ex: AA2.1)",
      "difficulty": "Fondamental | Intermédiaire | Avancé",
      "points": 2,
      "answer_hint": "Éléments de réponse attendus",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."]  // seulement pour type=qcm
    }}
  ]
}}

EXIGENCES :
- Chaque question doit être complète, précise et directement exploitable
- Les QCM doivent avoir exactement 4 options dont une seule correcte
- answer_hint doit être suffisamment détaillé pour la correction
- Respectez le niveau universitaire et le domaine du cours"""

    try:
        llm = _get_gemini(task='generation')
        try:
            response = llm.invoke(prompt)
        except Exception as model_err:
            logger.warning(f'Pro model failed for generation, trying flash: {model_err}')
            from langchain_google_genai import ChatGoogleGenerativeAI
            fallback_llm = ChatGoogleGenerativeAI(
                model='gemini-2.5-flash',
                google_api_key=current_app.config.get('GOOGLE_API_KEY', ''),
                temperature=0.4, max_tokens=8192
            )
            response = fallback_llm.invoke(prompt)
        raw = response.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw.strip())
        return jsonify(result), 200
    except Exception as e:
        logger.error(f'Question generation failed: {e}')
        return jsonify({'error': str(e)}), 500


# ─── GENERATE LaTeX exam document (Gemini) ──────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exam/<int:exam_id>/generate-latex', methods=['POST'])
@jwt_required()
def generate_exam_latex(course_id, exam_id):
    """Generate a complete LaTeX exam document using AI based on analysis."""
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    exam = CourseExam.query.filter_by(id=exam_id, course_id=course_id).first_or_404()
    ev = exam.ai_evaluation or {}

    data = request.get_json(silent=True) or {}
    include_proposals = data.get('include_proposals', True)

    proposals = ev.get('improvement_proposals', []) if include_proposals else []
    aa_list = [a['aa'] for a in (ev.get('aa_alignment') or []) if a.get('covered')]

    prompt = f"""Tu es un expert en création d'épreuves universitaires. Génère un document LaTeX complet pour une nouvelle épreuve.

COURS: {course.title}
TYPE D'ÉPREUVE: {EXAM_TYPE_LABELS.get(exam.exam_type or 'examen', 'Examen')}
DURÉE: {ev.get('estimated_duration', '2h')}
AAs VALIDÉS: {', '.join(aa_list) or 'Tous les AAs du cours'}
PROPOSITIONS D'AMÉLIORATION: {json.dumps(proposals[:5], ensure_ascii=False)}

Génère un document LaTeX complet avec:
1. Préambule avec packages nécessaires (amsmath, amssymb, geometry, graphicx, enumitem, etc.)
2. Page de garde avec: nom de l'établissement, intitulé du cours, durée, date, instructions
3. 3-5 exercices numérotés couvrant les AAs définis
4. Mix de questions: QCM, questions ouvertes, calculs/démonstrations si pertinent
5. Barème complet (total = 20 points)
6. Utilise des formules mathématiques si pertinent pour le domaine

IMPORTANT:
- Génère du LaTeX VALIDE et compilable
- N'inclus PAS de commentaires explicatifs hors du LaTeX
- Utilise \\documentclass{{exam}} ou \\documentclass{{article}} selon le contenu
- Retourne UNIQUEMENT le code LaTeX, sans balises markdown"""

    try:
        llm = _get_gemini(task='generation')
        try:
            response = llm.invoke(prompt)
        except Exception:
            from langchain_google_genai import ChatGoogleGenerativeAI
            llm = ChatGoogleGenerativeAI(model='gemini-2.5-flash', google_api_key=current_app.config.get('GOOGLE_API_KEY', ''), temperature=0.4, max_tokens=8192)
            response = llm.invoke(prompt)

        latex = response.content.strip()
        if latex.startswith('```'):
            parts = latex.split('```')
            latex = parts[1] if len(parts) > 1 else latex
            if latex.startswith('latex') or latex.startswith('tex'):
                latex = latex[latex.index('\n')+1:]

        return jsonify({'latex': latex}), 200
    except Exception as e:
        logger.error(f'LaTeX generation failed: {e}')
        return jsonify({'error': str(e)}), 500


# ─── COMPILE LaTeX to PDF (pdflatex) ────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exam/<int:exam_id>/compile-latex', methods=['POST'])
@jwt_required()
def compile_exam_latex(course_id, exam_id):
    """Compile LaTeX source to PDF using pdflatex."""
    import subprocess
    import tempfile
    from flask import Response as FlaskResponse
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json(silent=True) or {}
    latex_content = data.get('latex', '')
    if not latex_content.strip():
        return jsonify({'error': 'LaTeX content is empty'}), 400

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tex_path = os.path.join(tmpdir, 'exam.tex')
            with open(tex_path, 'w', encoding='utf-8') as f:
                f.write(latex_content)

            result = None
            for _ in range(2):  # Run twice for cross-references
                result = subprocess.run(
                    ['pdflatex', '-interaction=nonstopmode', '-output-directory', tmpdir, tex_path],
                    capture_output=True, text=True, timeout=60, cwd=tmpdir
                )

            pdf_path = os.path.join(tmpdir, 'exam.pdf')
            if os.path.exists(pdf_path):
                with open(pdf_path, 'rb') as f:
                    pdf_bytes = f.read()
                return FlaskResponse(
                    pdf_bytes,
                    mimetype='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename="{course.title}_examen.pdf"'}
                )
            else:
                log = result.stdout[-2000:] if result and result.stdout else (result.stderr[-2000:] if result else 'Unknown error')
                return jsonify({'error': 'Compilation failed', 'log': log}), 400
    except FileNotFoundError:
        return jsonify({'error': 'pdflatex not found. Please install MiKTeX or TeX Live.'}), 500
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Compilation timeout (>60s)'}), 408
    except Exception as e:
        logger.error(f'LaTeX compilation failed: {e}')
        return jsonify({'error': str(e)}), 500


# ─── DELETE exam ────────────────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exam/<int:exam_id>', methods=['DELETE'])
@jwt_required()
def delete_course_exam(course_id, exam_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    exam = CourseExam.query.filter_by(id=exam_id, course_id=course_id).first_or_404()
    if exam.file_path:
        try:
            full = os.path.join(current_app.config['UPLOAD_FOLDER'], exam.file_path)
            if os.path.exists(full):
                os.remove(full)
        except Exception:
            pass
    db.session.delete(exam)
    db.session.commit()
    return jsonify({'message': 'Évaluation supprimée'}), 200
