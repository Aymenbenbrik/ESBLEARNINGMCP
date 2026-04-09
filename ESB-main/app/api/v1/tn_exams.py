from __future__ import annotations

import os
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from app import db
from app.models import Course, Document, User, Chapter
from app.services.tn_exam_evaluation_service import analyze_tn_exam
from app.services.tn_exam_report_service import generate_tn_exam_report_pdf
from app.services.tn_latex_report_service import validate_exam, generate_tn_latex_report


tn_exams_api_bp = Blueprint('tn_exams_api', __name__, url_prefix='/courses/<int:course_id>/tn-exams')
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx'}
ALLOWED_LATEX_EXTENSIONS = {'tex'}


def _allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def _get_teacher_course(course_id: int):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return None, None, (jsonify({'error': 'User not found'}), 404)

    course = Course.query.get_or_404(course_id)
    if not ((user.is_superuser and not user.is_teacher) or (user.is_teacher and course.teacher_id == user.id)):
        return user, course, (jsonify({'error': 'Access denied'}), 403)

    return user, course, None


def _log_route_access(action: str, course_id: int, document_id: int | None = None):
    current_app.logger.info(
        'TN exams API %s called for course=%s%s',
        action,
        course_id,
        f', document={document_id}' if document_id is not None else ''
    )


def _serialize_exam(doc: Document) -> dict:
    analysis = doc.analysis_results or {}
    return {
        'id': doc.id,
        'title': doc.title,
        'file_path': doc.file_path,
        'file_type': doc.file_type,
        'document_type': doc.document_type,
        'course_id': doc.course_id,
        'created_at': doc.created_at.isoformat() if doc.created_at else None,
        'updated_at': doc.updated_at.isoformat() if doc.updated_at else None,
        'metadata': doc.content_metadata or {},
        'has_analysis': bool(doc.analysis_results),
        'has_report': bool(doc.analysis_report_path),
        'analysis_report_path': doc.analysis_report_path,
        'analysis_results': analysis,
        'total_questions': analysis.get('total_questions'),
        'source_coverage_rate': analysis.get('source_coverage_rate'),
        'difficulty_index': analysis.get('difficulty_index'),
        'bloom_index': analysis.get('bloom_index'),
    }


@tn_exams_api_bp.route('', methods=['GET'], strict_slashes=False)
@tn_exams_api_bp.route('/', methods=['GET'], strict_slashes=False)
@jwt_required()
def list_tn_exams(course_id: int):
    _log_route_access('list', course_id)
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    exams = Document.query.filter_by(course_id=course.id, document_type='tn_exam').order_by(Document.created_at.desc()).all()
    return jsonify({
        'course': {
            'id': course.id,
            'title': course.title,
            'description': course.description,
        },
        'exams': [_serialize_exam(ex) for ex in exams],
    }), 200


@tn_exams_api_bp.route('', methods=['POST'], strict_slashes=False)
@tn_exams_api_bp.route('/', methods=['POST'], strict_slashes=False)
@jwt_required()
def upload_tn_exam(course_id: int):
    _log_route_access('upload', course_id)
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    if 'file' not in request.files:
        return jsonify({'error': 'File is required'}), 400

    file = request.files['file']
    title = (request.form.get('title') or '').strip()
    exam_type = (request.form.get('exam_type') or 'test').strip().lower()

    weight_raw = request.form.get('weight', '1.0').strip()
    try:
        weight = float(weight_raw)
    except ValueError:
        weight = 1.0

    target_aa_ids_raw = request.form.get('target_aa_ids', '')
    try:
        target_aa_ids = [int(x.strip()) for x in target_aa_ids_raw.split(',') if x.strip()] if target_aa_ids_raw else []
    except ValueError:
        target_aa_ids = []

    if not file or not file.filename:
        return jsonify({'error': 'File is required'}), 400
    if not _allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Allowed: PDF, DOC, DOCX'}), 400

    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[1].lower()
    rel_dir = os.path.join('tn_exams', str(course.id))
    abs_dir = os.path.join(current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads'), rel_dir)
    os.makedirs(abs_dir, exist_ok=True)

    stamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    stored_name = f"{stamp}_{filename}"
    abs_path = os.path.join(abs_dir, stored_name)
    file.save(abs_path)

    doc = Document(
        title=title or stored_name,
        file_path=os.path.join(rel_dir, stored_name).replace('\\', '/'),
        file_type=ext,
        document_type='tn_exam',
        course_id=course.id,
    )
    doc.content_metadata = {'exam_type': exam_type, 'weight': weight, 'target_aa_ids': target_aa_ids}
    db.session.add(doc)
    db.session.commit()

    return jsonify({
        'message': 'Examen ajouté avec succès',
        'exam': _serialize_exam(doc),
    }), 201


@tn_exams_api_bp.route('/<int:document_id>', methods=['GET'])
@jwt_required()
def get_tn_exam(course_id: int, document_id: int):
    _log_route_access('get', course_id, document_id)
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    return jsonify({
        'course': {
            'id': course.id,
            'title': course.title,
            'description': course.description,
        },
        'exam': _serialize_exam(doc),
    }), 200


@tn_exams_api_bp.route('/<int:document_id>/analyze', methods=['POST'])
@jwt_required()
def analyze_tn_exam_api(course_id: int, document_id: int):
    _log_route_access('analyze', course_id, document_id)
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    # Step 1: Run analysis and commit results immediately (critical path)
    try:
        analysis = analyze_tn_exam(course, doc)
        doc.analysis_results = analysis
        doc.updated_at = datetime.utcnow()
        db.session.commit()
    except Exception as e:
        current_app.logger.exception('TN exam evaluation failed')
        db.session.rollback()
        return jsonify({'error': f"Échec de l'évaluation: {str(e)}"}), 500

    # Step 2: Generate PDF report (non-fatal — analysis already saved above)
    try:
        uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
        report_rel_dir = os.path.join('reports', 'tn_exams', str(course.id))
        report_abs_dir = os.path.join(uploads_dir, report_rel_dir)
        os.makedirs(report_abs_dir, exist_ok=True)
        report_filename = f"tn_exam_{doc.id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.pdf"
        report_abs_path = os.path.join(report_abs_dir, report_filename)
        generate_tn_exam_report_pdf(
            output_path=report_abs_path,
            course_title=course.title,
            exam_title=doc.title,
            analysis=analysis,
        )
        doc.analysis_report_path = os.path.join(report_rel_dir, report_filename).replace('\\', '/')
        db.session.commit()
        message = 'Évaluation terminée. Rapport PDF généré.'
    except Exception:
        current_app.logger.exception('TN exam PDF report generation failed (non-fatal)')
        message = 'Évaluation terminée. Génération du PDF échouée (non bloquant).'

    return jsonify({
        'message': message,
        'exam': _serialize_exam(doc),
    }), 200


@tn_exams_api_bp.route('/<int:document_id>/report', methods=['GET'])
@jwt_required()
def download_tn_exam_report(course_id: int, document_id: int):
    _log_route_access('report', course_id, document_id)
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404
    if not doc.analysis_report_path:
        return jsonify({'error': 'Report not found'}), 404

    uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
    rel = doc.analysis_report_path.replace('\\', '/')
    directory = os.path.join(uploads_dir, os.path.dirname(rel))
    filename = os.path.basename(rel)
    return send_from_directory(directory, filename, as_attachment=True, download_name=filename)


# ─── MCP MULTI-AGENT EXAM EVALUATION ─────────────────────────────────────────

@tn_exams_api_bp.route('/<int:document_id>/analyze-mcp', methods=['POST'])
@jwt_required()
def start_mcp_analysis(course_id: int, document_id: int):
    """Launch MCP multi-agent exam evaluation pipeline (async background)."""
    _log_route_access('start_mcp_analysis', course_id, document_id)
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.filter_by(id=document_id, course_id=course.id, document_type='tn_exam').first()
    if not doc:
        return jsonify({'error': 'Exam document not found'}), 404

    file_path = doc.file_path
    uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
    abs_file_path = os.path.join(uploads_dir, file_path) if file_path else None
    if not abs_file_path or not os.path.exists(abs_file_path):
        return jsonify({'error': f'Fichier introuvable: {file_path}'}), 404

    from app.services.exam_agent_graph import run_exam_evaluation
    session_id = run_exam_evaluation(
        course_id=course.id,
        file_path=abs_file_path,
        exam_title=doc.title or 'Examen Final',
        document_id=document_id,
    )

    return jsonify({'session_id': session_id, 'status': 'running', 'message': 'Analyse MCP lancée'}), 202


@tn_exams_api_bp.route('/<int:document_id>/mcp-sessions', methods=['GET'])
@jwt_required()
def list_mcp_sessions(course_id: int, document_id: int):
    """List all MCP sessions for this exam document."""
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error
    from app.models import ExamAnalysisSession
    sessions = ExamAnalysisSession.query.filter_by(
        course_id=course.id, document_id=document_id
    ).order_by(ExamAnalysisSession.created_at.desc()).limit(10).all()
    return jsonify({'sessions': [s.to_dict() for s in sessions]})


@tn_exams_api_bp.route('/mcp-session/<int:session_id>', methods=['GET'])
@jwt_required()
def get_mcp_session(course_id: int, session_id: int):
    """Get current status + results of a MCP analysis session."""
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error
    from app.models import ExamAnalysisSession, ExamExtractedQuestion
    session = ExamAnalysisSession.query.filter_by(id=session_id, course_id=course.id).first()
    if not session:
        return jsonify({'error': 'Session not found'}), 404
    result = session.to_dict()
    questions = ExamExtractedQuestion.query.filter_by(session_id=session_id).order_by(
        ExamExtractedQuestion.number
    ).all()
    result['questions'] = [q.to_dict() for q in questions]
    return jsonify(result)


@tn_exams_api_bp.route('/<int:document_id>/save-analysis', methods=['POST'])
@jwt_required()
def save_analysis(course_id: int, document_id: int):
    """Save teacher-edited metadata and question attributes."""
    from sqlalchemy.orm.attributes import flag_modified
    from collections import Counter

    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    data = request.get_json(silent=True) or {}
    ar = dict(doc.analysis_results or {})

    if 'exam_metadata' in data:
        ar['exam_metadata'] = {**(ar.get('exam_metadata') or {}), **data['exam_metadata']}
        if 'declared_duration_min' in data['exam_metadata']:
            ar['declared_duration_min'] = data['exam_metadata']['declared_duration_min']

    if 'questions' in data:
        updated = {str(q.get('id', i)): q for i, q in enumerate(data['questions'])}
        merged = []
        for q in ar.get('questions', []):
            key = str(q.get('id', ''))
            merged.append({**q, **updated.get(key, {})})
        ar['questions'] = merged

        bloom_counts = Counter(q.get('Bloom_Level', 'Inconnu') for q in merged)
        total = len(merged) or 1
        ar['bloom_percentages'] = {k: round(v / total * 100) for k, v in bloom_counts.items()}

        diff_counts = Counter(q.get('Difficulty', 'Inconnu') for q in merged)
        ar['difficulty_percentages'] = {k: round(v / total * 100) for k, v in diff_counts.items()}

        aa_counter: Counter = Counter()
        for q in merged:
            for aa in q.get('AA#', []):
                aa_counter[aa] += 1
        ar['aa_percentages'] = dict(aa_counter)

        total_pts = sum(float(q.get('points') or 0) for q in merged)
        ar['total_max_points'] = round(total_pts, 2)

    doc.analysis_results = ar
    flag_modified(doc, 'analysis_results')
    doc.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'ok': True, 'message': 'Modifications sauvegardées.', 'exam': _serialize_exam(doc)}), 200


@tn_exams_api_bp.route('/<int:document_id>/validation', methods=['GET'])
@jwt_required()
def get_validation(course_id: int, document_id: int):
    """Return 8-criterion validation for a TN exam."""
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    if not doc.analysis_results:
        return jsonify({'error': 'Exam not yet analyzed'}), 400

    validation = validate_exam(doc.analysis_results)
    verdict_ok = all(v['status'] != 'FAIL' for v in validation)
    summary = {
        'total': len(validation),
        'pass': sum(1 for v in validation if v['status'] == 'PASS'),
        'warning': sum(1 for v in validation if v['status'] == 'WARNING'),
        'fail': sum(1 for v in validation if v['status'] == 'FAIL'),
    }
    return jsonify({'validation': validation, 'summary': summary, 'verdict_ok': verdict_ok}), 200


@tn_exams_api_bp.route('/<int:document_id>/latex-report', methods=['GET'])
@jwt_required()
def get_latex_report(course_id: int, document_id: int):
    """Generate and download the official LaTeX/PDF evaluation report."""
    from flask import send_file
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    if not doc.analysis_results:
        return jsonify({'error': 'Exam not yet analyzed'}), 400

    try:
        import tempfile
        tmp_dir = tempfile.mkdtemp()
        tex_path = os.path.join(tmp_dir, f'rapport_{document_id}.tex')
        tex_out, pdf_path, _validation = generate_tn_latex_report(
            analysis=doc.analysis_results,
            course_title=course.title,
            output_tex_path=tex_path,
            compile_pdf=True,
        )
        safe_name = (doc.title or 'rapport').replace(' ', '_')
        if pdf_path and os.path.exists(pdf_path):
            return send_file(pdf_path, as_attachment=True,
                             download_name=f'rapport_evaluation_{safe_name}.pdf',
                             mimetype='application/pdf')
        # Fallback: send .tex source if LaTeX compiler not installed
        if tex_out and os.path.exists(tex_out):
            return send_file(tex_out, as_attachment=True,
                             download_name=f'rapport_evaluation_{safe_name}.tex',
                             mimetype='text/plain; charset=utf-8')
        return jsonify({'error': 'PDF generation failed. LaTeX compiler not installed?'}), 500
    except Exception as e:
        current_app.logger.exception('LaTeX report generation failed')
        return jsonify({'error': str(e)}), 500


@tn_exams_api_bp.route('/<int:document_id>/upload-latex-source', methods=['POST'])
@jwt_required()
def upload_latex_source(course_id: int, document_id: int):
    """Upload a LaTeX source .tex file to improve exam question extraction quality."""
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_LATEX_EXTENSIONS:
        return jsonify({'error': 'Invalid file type. Only .tex files are allowed.'}), 400

    rel_dir = os.path.join('tn_exams', str(course.id), 'latex_sources')
    abs_dir = os.path.join(
        current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads'),
        rel_dir
    )
    os.makedirs(abs_dir, exist_ok=True)

    stamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    stored_name = f"{stamp}_source_{document_id}.tex"
    abs_path = os.path.join(abs_dir, stored_name)
    file.save(abs_path)

    rel_path = os.path.join(rel_dir, stored_name).replace('\\', '/')
    meta = dict(doc.content_metadata or {})
    meta['latex_source_path'] = rel_path
    doc.content_metadata = meta

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(doc, 'content_metadata')
    doc.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'message': 'Fichier LaTeX source uploadé avec succès.',
        'latex_source_path': rel_path,
    }), 200


@tn_exams_api_bp.route('/<int:document_id>/generate-questions', methods=['POST'])
@jwt_required()
def generate_curative_questions(course_id: int, document_id: int):
    """Generate curative questions to fill bloom/difficulty/AA gaps."""
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    data = request.get_json() or {}
    bloom_level = data.get('bloom_level', 'Analyser')
    difficulty = data.get('difficulty', 'Moyen')
    target_aa = data.get('target_aa')
    question_type = data.get('question_type', 'Ouvert')
    context = data.get('context', '')
    count = min(int(data.get('count', 3)), 10)
    exercise_minutes = int(data.get('exercise_minutes', 0))

    # Get AA description
    aa_desc = ''
    if target_aa:
        try:
            from app.services.tn_exam_evaluation_service import _course_learning_targets
            targets = _course_learning_targets(course_id)
            for t in targets:
                if t['AA#'] == int(target_aa):
                    aa_desc = t['AA Description']
                    break
        except Exception:
            pass

    # Get existing questions for context (avoid repetition)
    ar = doc.analysis_results or {}
    existing_qs = [q.get('Text', '') for q in (ar.get('questions') or [])][:5]
    existing_ctx = '\n'.join(f'- {q[:100]}' for q in existing_qs if q)
    
    # Include recommendations as context
    recommendations = ar.get('recommendations') or []
    reco_ctx = ''
    if recommendations:
        reco_ctx = '\n'.join(f'- {r}' for r in recommendations[:5])

    aa_line = ''
    if aa_desc:
        aa_line = f"- Acquis d'apprentissage ciblé (AA#{target_aa}): {aa_desc}"
    elif target_aa:
        aa_line = f"- AA#{target_aa} ciblé"

    context_line = f"- Contexte/sujet: {context}" if context else ''
    reco_line = f"\nRecommandations issues de l'analyse de l'examen (à adresser en priorité):\n{reco_ctx}" if reco_ctx else ''

    prompt = f"""[INST]
Tu es un expert en pédagogie universitaire. Génère {count} questions d'examen formant un EXERCICE COHÉRENT en français.
Les questions doivent avoir une progression logique (du plus simple au plus complexe) et être thématiquement liées.{(f" L'exercice est prévu pour {exercise_minutes} minutes.") if exercise_minutes else ""}

Contraintes OBLIGATOIRES:
- Niveau Bloom: {bloom_level}
- Difficulté: {difficulty}
- Type de question: {question_type}
{aa_line}
{context_line}
- Module/cours: {course.name if hasattr(course, 'name') else course.title}
{reco_line}

Questions déjà présentes dans l'examen (à ne PAS répéter):
{existing_ctx or 'Aucune question existante.'}

Génère {count} questions formant un exercice cohérent et progressif. Les questions doivent s'enchaîner logiquement.
Pour les QCM, inclure 4 choix (A, B, C, D) avec une seule bonne réponse.
Si type "Calcul", inclure les données numériques nécessaires.
Les formules mathématiques doivent être en LaTeX inline: $formule$.

Retourne UNIQUEMENT un JSON array valide (pas d'autre texte):
[
  {{
    "text": "Texte complet de la question avec formules LaTeX si nécessaire",
    "bloom_level": "{bloom_level}",
    "difficulty": "{difficulty}",
    "question_type": "{question_type}",
    "aa": {target_aa if target_aa else 'null'},
    "rationale": "Explication courte de pourquoi cette question couvre le niveau {bloom_level}"
  }}
]
[/INST]"""

    try:
        from app.services.tn_exam_evaluation_service import _get_gemini_model_instance, _extract_json_array
        from langchain_core.messages import HumanMessage
        llm = _get_gemini_model_instance()
        resp = llm.invoke([HumanMessage(content=prompt)]).content
        questions = _extract_json_array(resp) or []
        return jsonify({'questions': questions[:count]}), 200
    except Exception as e:
        current_app.logger.exception('Curative question generation failed')
        return jsonify({'error': str(e), 'questions': []}), 500


@tn_exams_api_bp.route('/mcp-session/<int:session_id>/pdf', methods=['GET'])
@jwt_required()
def download_mcp_pdf(course_id: int, session_id: int):
    """Download the compiled LaTeX PDF."""
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error
    from app.models import ExamAnalysisSession
    from flask import send_file
    session = ExamAnalysisSession.query.filter_by(id=session_id, course_id=course.id).first()
    if not session or not session.latex_pdf_path:
        return jsonify({'error': 'PDF not available'}), 404
    if not os.path.exists(session.latex_pdf_path):
        return jsonify({'error': 'PDF file missing on disk'}), 404
    return send_file(
        session.latex_pdf_path,
        as_attachment=True,
        download_name=f'exam_proposal_{session_id}.pdf',
    )


@tn_exams_api_bp.route('/<int:document_id>/save-proposal', methods=['POST'])
@jwt_required()
def save_proposal(course_id, document_id):
    """Save a proposed exam version (modified questions + exercises) for teacher review."""
    from flask import jsonify, request
    from app.models import db, Document
    import json

    doc = Document.query.filter_by(id=document_id, course_id=course_id).first_or_404()
    data = request.get_json(force=True) or {}

    # proposal contains: questions, latex_content, description, created_at
    proposal = {
        'questions': data.get('questions', []),
        'latex_content': data.get('latex_content', ''),
        'description': data.get('description', 'Proposition enseignant'),
        'created_at': data.get('created_at', ''),
        'version': data.get('version', 1),
    }

    meta = doc.content_metadata or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}

    # Store proposal in content_metadata
    proposals = meta.get('proposals', [])
    proposals.append(proposal)
    meta['proposals'] = proposals[-5:]  # keep last 5 versions
    meta['latest_proposal'] = proposal
    doc.content_metadata = meta
    db.session.commit()

    return jsonify({'status': 'ok', 'message': 'Proposition sauvegardee', 'total_proposals': len(proposals)}), 200


@tn_exams_api_bp.route('/<int:document_id>/extract-questions', methods=['POST'])
@jwt_required()
def extract_questions_vision(course_id: int, document_id: int):
    """Extract all questions from exam using langchain + Gemini (same approach as MCP analysis)."""
    import json as _json
    import re as _re
    from sqlalchemy.orm.attributes import flag_modified
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.messages import SystemMessage, HumanMessage
    from app.services.evaluate_service import extract_text_from_file, _extract_json_array

    _log_route_access('extract-questions', course_id, document_id)
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404
    if not doc.file_path:
        return jsonify({'error': 'No exam file uploaded'}), 400

    try:
        uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
        full_path = os.path.join(uploads_dir, doc.file_path) if not os.path.isabs(doc.file_path) else doc.file_path
        if not os.path.exists(full_path):
            return jsonify({'error': f'File not found: {full_path}'}), 400

        # ── Step 1: Extract text from PDF (same as MCP) ──
        exam_text = extract_text_from_file(full_path)
        if not exam_text or not exam_text.strip():
            return jsonify({'error': 'Could not extract text from file'}), 400

        current_app.logger.info(f'[QUESTIONS] Extracted {len(exam_text)} chars from {full_path}')

        # Optional: load LaTeX source if available
        latex_source = ''
        latex_path = (doc.content_metadata or {}).get('latex_source_path', '')
        if latex_path:
            latex_abs = os.path.join(uploads_dir, latex_path)
            if os.path.exists(latex_abs):
                try:
                    with open(latex_abs, 'r', encoding='utf-8', errors='ignore') as f:
                        latex_source = f.read()
                except Exception:
                    pass

        latex_hint = ""
        if latex_source.strip():
            latex_hint = f"""
Utilise également le source LaTeX suivant pour améliorer l'extraction (numérotation, formules exactes):
--- SOURCE LATEX ---
{latex_source[:5000]}
--- FIN SOURCE LATEX ---
"""

        # ── Step 2: Load course AAs for AA matching ──
        try:
            from app.services.tn_exam_evaluation_service import _course_learning_targets
            aa_targets = _course_learning_targets(course_id)
        except Exception:
            aa_targets = []

        aa_section = ""
        aa_example = "null"
        if aa_targets:
            aa_list_text = "\n".join([f"  AA#{a['AA#']}: {a['AA Description']}" for a in aa_targets])
            aa_section = f"""
- aa_numbers : liste des numéros d'AA couverts par cette question (tableau d'entiers, ex: [1, 3]).
  Choisis parmi les AA suivants du cours :
{aa_list_text}
  Si la question ne cible clairement aucun AA, retourne [].
"""
            aa_example = "[1]"

        # ── Step 3: Build prompt ──
        prompt = f"""Tu es un expert en extraction de questions d'examens universitaires.
Extrais TOUTES les questions du texte d'examen ci-dessous (y compris les sous-questions).
{latex_hint}

RÈGLES OBLIGATOIRES:
1. Préserve les formules mathématiques EXACTEMENT (ex: $x^2$, $\\alpha + \\beta$, $$\\int_0^1 f(x)\\,dx$$)
2. Si une figure/tableau est mentionné(e), inclus une référence explicite [Figure N] ou [Tableau N]
3. Pour les QCM, inclus les choix (A, B, C, D) dans le texte de la question
4. Préserve la numérotation originale des questions

Pour CHAQUE question, extrais :
- question_number : numéro original (ex: "1", "1.a", "2.b.i")
- exercise_number : numéro de l'exercice parent (entier)
- exercise_title : titre de l'exercice (ex: "Exercice 1 : Logique")
- text : texte complet avec formules LaTeX préservées
- has_figure : true si figure/graphique/schéma/tableau mentionné, false sinon
- points : barème en points si mentionné (nombre décimal), null sinon
- question_type : parmi ["QCM", "Ouvert", "Vrai/Faux", "Calcul", "Démonstration", "Étude de cas", "Pratique", "Exercice d'application"]
- difficulty : parmi ["Très facile", "Facile", "Moyen", "Difficile", "Très difficile"]
- bloom_level : parmi ["Mémoriser", "Comprendre", "Appliquer", "Analyser", "Évaluer", "Créer"]
- estimated_time_min : temps estimé en minutes (entier)
{aa_section}
Règles pour l'estimation du temps :
- QCM simple : 1-2 min | QCM avec calcul : 3-5 min
- Vrai/Faux : 1-2 min | Question ouverte courte : 3-5 min | longue : 8-15 min
- Calcul simple : 3-5 min | complexe : 8-15 min
- Démonstration : 10-20 min | Étude de cas : 15-25 min
- Ajuste selon la difficulté : Très facile ×0.7, Facile ×0.85, Moyen ×1, Difficile ×1.3, Très difficile ×1.5

Retourne UNIQUEMENT un tableau JSON valide (pas de markdown, pas de commentaire):
[
  {{
    "question_number": "1.a",
    "exercise_number": 1,
    "exercise_title": "Exercice 1 : ...",
    "text": "Montrer que $\\forall x \\in \\mathbb{{R}}$...",
    "has_figure": false,
    "points": 2.0,
    "question_type": "Démonstration",
    "difficulty": "Moyen",
    "bloom_level": "Appliquer",
    "estimated_time_min": 12,
    "aa_numbers": {aa_example}
  }}
]

Texte de l'examen:
{exam_text}
"""

        # ── Step 4: Call Gemini via langchain (same as MCP) ──
        api_key = current_app.config.get('GOOGLE_API_KEY', '')
        llm = ChatGoogleGenerativeAI(
            model='gemini-2.5-pro',
            google_api_key=api_key,
            temperature=0.2,
        )

        messages = [
            SystemMessage(content="Tu es un expert en extraction de questions d'examen universitaire. Préserve exactement les formules mathématiques LaTeX. Retourne UNIQUEMENT du JSON valide."),
            HumanMessage(content=prompt),
        ]

        completion = llm.invoke(messages)
        resp_text = completion.content
        current_app.logger.info(f'[QUESTIONS EXTRACTION RAW] first 500 chars: {resp_text[:500]}')

        # ── Step 4: Parse JSON array (same helper as MCP) ──
        questions = _extract_json_array(resp_text)
        if not questions:
            return jsonify({'error': 'Could not parse questions from Gemini response', 'raw': resp_text[:500]}), 500

        # ── Step 5: Post-process ──
        for i, q in enumerate(questions):
            q.setdefault('id', i + 1)
            # Normalize points
            pts = q.get('points')
            if isinstance(pts, str):
                try:
                    q['points'] = float(pts)
                except (ValueError, TypeError):
                    q['points'] = None
            # Normalize time
            t = q.get('estimated_time_min')
            if isinstance(t, str):
                try:
                    q['estimated_time_min'] = int(t)
                except (ValueError, TypeError):
                    q['estimated_time_min'] = None
            # Normalize aa_numbers
            aa_raw = q.get('aa_numbers', q.get('aa_number', []))
            if isinstance(aa_raw, int):
                q['aa_numbers'] = [aa_raw]
            elif isinstance(aa_raw, list):
                q['aa_numbers'] = [int(a) for a in aa_raw if str(a).isdigit() or isinstance(a, int)]
            else:
                q['aa_numbers'] = []

        # ── Step 5b: If Gemini didn't fill aa_numbers, run dedicated AA classification ──
        if aa_targets and not any(q.get('aa_numbers') for q in questions):
            current_app.logger.info('[QUESTIONS] aa_numbers empty — running dedicated AA classification')
            try:
                from app.services.tn_exam_evaluation_service import _classify_questions_aa, _extract_json_array as _ej
                # Build format expected by _classify_questions_aa
                qs_for_aa = [{'Question#': q.get('id', i+1), 'Text': q.get('text', '')} for i, q in enumerate(questions)]
                classified = _classify_questions_aa(qs_for_aa, aa_targets)
                # Map back aa_numbers
                aa_by_id = {int(c.get('Question#')): c.get('AA#', []) for c in classified}
                for i, q in enumerate(questions):
                    qid = q.get('id', i + 1)
                    q['aa_numbers'] = aa_by_id.get(int(qid), [])
            except Exception as aa_err:
                current_app.logger.warning(f'[QUESTIONS] AA classification fallback failed: {aa_err}')

        # ── Step 6: Save to database ──
        ar = dict(doc.analysis_results or {})
        ar['extracted_questions'] = questions
        doc.analysis_results = ar
        flag_modified(doc, 'analysis_results')
        doc.updated_at = datetime.utcnow()
        db.session.commit()

        current_app.logger.info(f'[QUESTIONS EXTRACTION] course={course_id} doc={document_id} count={len(questions)}')

        return jsonify({
            'success': True,
            'questions': questions,
            'count': len(questions),
            'message': f"{len(questions)} questions extraites avec succès via Gemini 2.5 Pro"
        }), 200

    except Exception as e:
        current_app.logger.error(f'Questions extraction failed: {e}', exc_info=True)
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@tn_exams_api_bp.route('/<int:document_id>/extract-header', methods=['POST'])
@jwt_required()
def extract_header(course_id: int, document_id: int):
    """Extract exam header information using Gemini 2.5 Pro Vision on the first page image."""
    import base64
    import json as _json
    import re as _re
    from sqlalchemy.orm.attributes import flag_modified

    _log_route_access('extract-header', course_id, document_id)
    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    if not doc.file_path:
        return jsonify({'error': 'No exam file uploaded'}), 400

    try:
        uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
        full_path = os.path.join(uploads_dir, doc.file_path) if not os.path.isabs(doc.file_path) else doc.file_path

        if not os.path.exists(full_path):
            return jsonify({'error': f'File not found: {full_path}'}), 400

        ext = full_path.rsplit('.', 1)[-1].lower()

        # ── Step 1: Render the first page of the PDF as a high-res image ──
        header_image_b64 = None
        if ext == 'pdf':
            import fitz  # PyMuPDF
            pdf_doc = fitz.open(full_path)
            if pdf_doc.page_count == 0:
                return jsonify({'error': 'PDF has no pages'}), 400
            page = pdf_doc[0]
            # Render at 2x resolution for better OCR
            mat = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat)
            header_image_b64 = base64.b64encode(pix.tobytes("png")).decode('utf-8')
            num_pages = pdf_doc.page_count
            pdf_doc.close()
        else:
            # For non-PDF files, fall back to text extraction
            from app.services.evaluate_service import extract_text_from_file
            from app.services.tn_exam_evaluation_service import _extract_exam_metadata
            text = extract_text_from_file(full_path)
            if not text or not text.strip():
                return jsonify({'error': 'Could not extract text from file'}), 400
            header_data = _extract_exam_metadata(text)
            ar = dict(doc.analysis_results or {})
            ar['exam_header'] = header_data
            doc.analysis_results = ar
            flag_modified(doc, 'analysis_results')
            doc.updated_at = datetime.utcnow()
            db.session.commit()
            current_app.logger.info(f'[HEADER EXTRACTION] course={course_id} doc={document_id} result={_json.dumps(header_data, ensure_ascii=False)}')
            return jsonify({'success': True, 'header': header_data, 'message': "En-tête extrait avec succès"}), 200

        # ── Step 2: Send image to Gemini 2.5 Pro Vision ──
        import google.generativeai as genai
        from google.generativeai.types import HarmCategory, HarmBlockThreshold
        api_key = current_app.config.get('GOOGLE_API_KEY', '')
        genai.configure(api_key=api_key)

        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }
        model = genai.GenerativeModel('gemini-2.5-pro', safety_settings=safety_settings)

        prompt = """Tu es un assistant expert en lecture d'en-têtes de documents d'examen universitaires (Tunisie / Algérie / France).

Analyse cette image qui représente la première page d'un examen. Détecte la zone d'en-tête (header) et extrais TOUTES les informations suivantes.

Champs à extraire :
- exam_name : nom exact du module / matière (ex: "Algèbre 1", "Business Computing")
- class_name : classe / niveau / promotion (ex: "1LMAD-1", "L2 Info", "1ère année")
- language : langue de l'épreuve → "Français" ou "Anglais" ou "Arabe" ou "Mixte"
- declared_duration_min : durée EN MINUTES (entier). Convertis: 1h=60, 1h30=90, 2h=120
- exam_date : date telle que mentionnée (ex: "06 Janvier 2026")
- instructors : liste des noms des enseignants (ex: ["Ben Brik Aymen"])
- num_pages : nombre de pages (détecté ou mentionné). Valeur réelle = """ + str(num_pages) + """
- exam_type : type détecté → "Examen" / "DS" / "Test" / "TP" / "Rattrapage" / "Autre"
- calculator_allowed : true si calculatrice autorisée, false si non, null si non mentionné
- computer_allowed : true si PC autorisé, false si non, null si non mentionné
- internet_allowed : true si internet autorisé, false si non, null si non mentionné
- documents_allowed : true si documents autorisés, false si non, null si non mentionné
- department : département ou filière (ex: "ESPRIT School of Business")

IMPORTANT :
- Cherche les patterns visuels : tableaux, lignes structurées, logos
- "OUI" = true, "NON" = false
- Si un champ n'est pas visible, retourne null

Retourne UNIQUEMENT un objet JSON valide, sans commentaires ni markdown :
{
  "exam_name": "...",
  "class_name": "...",
  "language": "...",
  "declared_duration_min": 120,
  "exam_date": "...",
  "instructors": ["..."],
  "num_pages": ...,
  "exam_type": "...",
  "calculator_allowed": false,
  "computer_allowed": null,
  "internet_allowed": false,
  "documents_allowed": false,
  "department": "..."
}"""

        image_part = {
            'mime_type': 'image/png',
            'data': header_image_b64,
        }

        response = model.generate_content(
            [prompt, image_part],
            generation_config=genai.types.GenerationConfig(temperature=0, max_output_tokens=2048),
        )

        resp_text = response.text
        current_app.logger.info(f'[HEADER EXTRACTION RAW] Gemini response: {resp_text[:500]}')

        # ── Step 3: Parse JSON from response ──
        m = _re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', resp_text, _re.DOTALL)
        if not m:
            return jsonify({'error': 'Could not parse Gemini response', 'raw': resp_text[:500]}), 500

        header_data = _json.loads(m.group(0))

        # Post-process: normalize duration
        dur = header_data.get('declared_duration_min')
        if isinstance(dur, str):
            nums = _re.findall(r'\d+', dur)
            header_data['declared_duration_min'] = int(nums[0]) if nums else None
        # Normalize instructors
        instr = header_data.get('instructors')
        if isinstance(instr, str):
            header_data['instructors'] = [instr] if instr else []
        elif not isinstance(instr, list):
            header_data['instructors'] = []
        # Ensure num_pages is set
        if not header_data.get('num_pages'):
            header_data['num_pages'] = num_pages

        # ── Step 4: Save to database ──
        ar = dict(doc.analysis_results or {})
        ar['exam_header'] = header_data
        doc.analysis_results = ar
        flag_modified(doc, 'analysis_results')
        doc.updated_at = datetime.utcnow()
        db.session.commit()

        current_app.logger.info(f'[HEADER EXTRACTION] course={course_id} doc={document_id} result={_json.dumps(header_data, ensure_ascii=False)}')

        return jsonify({
            'success': True,
            'header': header_data,
            'message': "En-tête extrait avec succès via Gemini 2.5 Pro Vision"
        }), 200

    except Exception as e:
        current_app.logger.error(f'Header extraction failed: {e}', exc_info=True)
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@tn_exams_api_bp.route('/<int:document_id>/proposals', methods=['GET'])
@jwt_required()
def get_proposals(course_id, document_id):
    """Get saved proposals for this exam."""
    from flask import jsonify
    from app.models import db, Document

    doc = Document.query.filter_by(id=document_id, course_id=course_id).first_or_404()
    meta = doc.content_metadata or {}
    proposals = meta.get('proposals', [])
    latest = meta.get('latest_proposal', None)

    return jsonify({
        'proposals': proposals,
        'latest_proposal': latest,
        'total': len(proposals)
    }), 200


# ─── match-sources : RAG matching of questions to course documents ──────────────────────────────────────

@tn_exams_api_bp.route('/<int:document_id>/match-sources', methods=['POST'])
@jwt_required()
def match_sources(course_id: int, document_id: int):
    """Match each extracted question to the most relevant course documents using RAG (ChromaDB + VectorStore).

    Searches through:
      - Documents attached to course chapters (Contenu des modules)
      - Course-level PDF documents (e.g., textbooks without chapter assignment)
    """
    from app.services.vector_store import VectorStore

    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    ar = doc.analysis_results or {}
    questions = ar.get('extracted_questions', [])
    if not questions:
        return jsonify({'error': 'No extracted questions found. Run question extraction first.'}), 400

    # ── Get all course documents for RAG: chapter docs + course-level PDFs ──
    # Priority: documents belonging to chapters (module content) + course-level PDFs
    course_docs = Document.query.filter(
        Document.course_id == course.id,
        Document.document_type.notin_(['tn_exam', 'quiz']),
        Document.id != document_id,
    ).all()

    if not course_docs:
        return jsonify({'matches': [], 'message': 'No course documents found for RAG matching'}), 200

    # Build chapter lookup map for enriched responses
    chapter_ids = {d.chapter_id for d in course_docs if d.chapter_id}
    chapters_map: dict = {}
    if chapter_ids:
        for ch in Chapter.query.filter(Chapter.id.in_(chapter_ids)).all():
            chapters_map[ch.id] = {'title': ch.title, 'order': ch.order}

    # Separate into chapter docs and course-level docs (textbooks etc.)
    chapter_docs = [d for d in course_docs if d.chapter_id is not None]
    course_level_docs = [d for d in course_docs if d.chapter_id is None]

    current_app.logger.info(
        f'[MATCH-SOURCES] {len(questions)} questions vs {len(chapter_docs)} chapter docs + '
        f'{len(course_level_docs)} course-level docs'
    )

    matches = []

    for q in questions:
        q_id = q.get('id', 0)
        q_num = str(q.get('question_number', q_id))
        q_text = q.get('text', '')
        if not q_text.strip():
            matches.append({'question_id': q_id, 'question_number': q_num, 'sources': []})
            continue

        sources = []

        # Search chapter documents first (higher priority)
        for cdoc in chapter_docs + course_level_docs:
            try:
                vs = VectorStore(document_id=str(cdoc.id))
                if not vs.collection_exists():
                    continue
                if vs.get_vector_count() == 0:
                    continue

                chunks = vs.search_text_chunks(q_text, n_results=3)

                for chunk in chunks:
                    distance = chunk.get('distance', 1.0)
                    similarity = max(0.0, 1.0 - distance / 2.0)
                    if similarity < 0.20:  # slightly lower threshold for broader matching
                        continue

                    meta = chunk.get('metadata', {})
                    chapter_info = chapters_map.get(cdoc.chapter_id) if cdoc.chapter_id else None
                    sources.append({
                        'document_id': cdoc.id,
                        'document_name': cdoc.title or f'Document {cdoc.id}',
                        'chapter_id': cdoc.chapter_id,
                        'chapter_name': chapter_info['title'] if chapter_info else None,
                        'chapter_order': chapter_info['order'] if chapter_info else None,
                        'page': int(meta.get('page_number', 1)),
                        'section': meta.get('section_title') or meta.get('section_number') or None,
                        'excerpt': (chunk.get('content', '')[:300]).strip() or None,
                        'similarity': round(similarity, 3),
                    })

            except Exception as doc_err:
                current_app.logger.warning(f'[MATCH-SOURCES] Error searching doc {cdoc.id}: {doc_err}')
                continue

        # Sort by similarity descending, keep top 3
        sources.sort(key=lambda s: s['similarity'], reverse=True)
        sources = sources[:3]

        matches.append({
            'question_id': q_id,
            'question_number': q_num,
            'sources': sources,
        })

    current_app.logger.info(
        f'[MATCH-SOURCES] Done — {sum(len(m["sources"]) for m in matches)} total source matches'
    )
    return jsonify({
        'matches': matches,
        'total_questions': len(questions),
        'documents_searched': len(course_docs),
        'chapter_docs': len(chapter_docs),
        'course_level_docs': len(course_level_docs),
    }), 200


# ─── report-data : Structured JSON report data for frontend preview ──────────────────────────────────────

@tn_exams_api_bp.route('/<int:document_id>/report-data', methods=['GET'])
@jwt_required()
def get_report_data(course_id: int, document_id: int):
    """Return structured report data as JSON for frontend preview (no LaTeX required)."""
    from app.services.tn_latex_report_service import validate_exam, _compute_scores

    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    ar = doc.analysis_results or {}
    extracted = ar.get('extracted_questions', [])
    header = ar.get('exam_header') or ar.get('exam_metadata') or {}
    questions = ar.get('questions') or extracted

    analysis_for_val = {
        'exam_metadata': header,
        'questions': questions,
        'time_analysis': ar.get('time_analysis') or {},
        'difficulty_percentages': ar.get('difficulty_percentages') or {},
        'bloom_percentages': ar.get('bloom_percentages') or {},
        'aa_percentages': ar.get('aa_percentages') or {},
        'source_coverage_rate': ar.get('source_coverage_rate') or 0,
        'total_max_points': ar.get('total_max_points'),
    }

    validation = validate_exam(analysis_for_val)
    content_score, quality_score, total_score = _compute_scores(analysis_for_val, validation)

    # AA mapping per question
    aa_mapping = []
    for q in questions:
        aa_nums = q.get('aa_numbers') or []
        if isinstance(aa_nums, int):
            aa_nums = [aa_nums]
        if not aa_nums and q.get('AA#'):
            aa_nums = [q['AA#']] if isinstance(q['AA#'], int) else list(q['AA#'])
        q_num = q.get('question_number') or q.get('Question#') or q.get('id')
        aa_mapping.append({
            'question_number': q_num,
            'aa_numbers': aa_nums,
            'bloom': q.get('bloom_level') or q.get('Bloom Level'),
            'points': q.get('points') or q.get('Points'),
            'exercise_number': q.get('exercise_number'),
        })

    # Question classification
    classification = []
    for q in questions:
        q_num = q.get('question_number') or q.get('Question#') or q.get('id')
        qtype = q.get('question_type') or q.get('Type') or 'Non défini'
        bloom = q.get('bloom_level') or q.get('Bloom Level') or 'Non défini'
        difficulty = q.get('difficulty') or q.get('Difficulty') or 'Non défini'
        classification.append({
            'question_number': q_num,
            'type': qtype,
            'bloom': bloom,
            'difficulty': difficulty,
            'points': q.get('points') or q.get('Points'),
            'exercise_number': q.get('exercise_number'),
            'exercise_title': q.get('exercise_title'),
        })

    # Type distribution
    type_dist: dict = {}
    for q in questions:
        t = q.get('question_type') or q.get('Type') or 'Non défini'
        type_dist[t] = type_dist.get(t, 0) + 1

    return jsonify({
        'general_info': {
            'course_title': course.title,
            'exam_name': header.get('exam_name') or doc.title,
            'class_name': header.get('class_name') or '',
            'language': header.get('language') or 'Français',
            'duration_min': header.get('declared_duration_min'),
            'exam_date': header.get('exam_date') or '',
            'instructors': header.get('instructors') or [],
        },
        'validation': validation,
        'scores': {
            'content': content_score,
            'quality': quality_score,
            'total': total_score,
        },
        'bloom_percentages': ar.get('bloom_percentages') or {},
        'difficulty_percentages': ar.get('difficulty_percentages') or {},
        'aa_percentages': ar.get('aa_percentages') or {},
        'type_distribution': type_dist,
        'aa_mapping': aa_mapping,
        'question_classification': classification,
        'time_analysis': ar.get('time_analysis') or {},
        'source_coverage_rate': ar.get('source_coverage_rate') or 0,
        'total_questions': len(questions),
        'has_full_analysis': bool(ar.get('questions')),
    }), 200


# ─── match-question : Single-question RAG matching ───────────────────────────────────────────────────────

@tn_exams_api_bp.route('/<int:document_id>/match-question', methods=['POST'])
@jwt_required()
def match_single_question(course_id: int, document_id: int):
    """Match a single question text to relevant course documents using RAG."""
    from app.services.vector_store import VectorStore

    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    data = request.get_json(force=True) or {}
    question_text = (data.get('question_text') or '').strip()
    if not question_text:
        return jsonify({'error': 'question_text is required'}), 400

    course_docs = Document.query.filter(
        Document.course_id == course.id,
        Document.document_type.notin_(['tn_exam', 'quiz']),
        Document.id != document_id,
    ).all()

    if not course_docs:
        return jsonify({'sources': [], 'message': 'Aucun document de cours disponible'}), 200

    chapter_ids = {d.chapter_id for d in course_docs if d.chapter_id}
    chapters_map: dict = {}
    if chapter_ids:
        for ch in Chapter.query.filter(Chapter.id.in_(chapter_ids)).all():
            chapters_map[ch.id] = {'title': ch.title, 'order': ch.order}

    chapter_docs = [d for d in course_docs if d.chapter_id is not None]
    course_level_docs = [d for d in course_docs if d.chapter_id is None]

    sources = []
    for cdoc in chapter_docs + course_level_docs:
        try:
            vs = VectorStore(document_id=str(cdoc.id))
            if not vs.collection_exists() or vs.get_vector_count() == 0:
                continue
            chunks = vs.search_text_chunks(question_text, n_results=3)
            for chunk in chunks:
                distance = chunk.get('distance', 1.0)
                similarity = max(0.0, 1.0 - distance / 2.0)
                if similarity < 0.20:
                    continue
                meta = chunk.get('metadata', {})
                chapter_info = chapters_map.get(cdoc.chapter_id) if cdoc.chapter_id else None
                sources.append({
                    'document_id': cdoc.id,
                    'document_name': cdoc.title or f'Document {cdoc.id}',
                    'chapter_id': cdoc.chapter_id,
                    'chapter_name': chapter_info['title'] if chapter_info else None,
                    'chapter_order': chapter_info['order'] if chapter_info else None,
                    'page': int(meta.get('page_number', 1)),
                    'section': meta.get('section_title') or meta.get('section_number') or None,
                    'excerpt': (chunk.get('content', '')[:300]).strip() or None,
                    'similarity': round(similarity, 3),
                })
        except Exception as doc_err:
            current_app.logger.warning(f'[MATCH-QUESTION] Error searching doc {cdoc.id}: {doc_err}')
            continue

    sources.sort(key=lambda s: s['similarity'], reverse=True)
    sources = sources[:5]

    return jsonify({'sources': sources, 'total_docs_searched': len(course_docs)}), 200




@tn_exams_api_bp.route('/<int:document_id>/generate-exercise-questions', methods=['POST'])
@jwt_required()
def generate_exercise_questions(course_id: int, document_id: int):
    """Generate questions for an exercise using per-question config (bloom, difficulty, type, points)."""
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_google_genai import ChatGoogleGenerativeAI
    from app.services.tn_exam_evaluation_service import _extract_json_array, _course_learning_targets

    _, course, error = _get_teacher_course(course_id)
    if error:
        return error

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        return jsonify({'error': 'Exam not found'}), 404

    data = request.get_json(force=True) or {}
    exercise_title = data.get('exercise_title', 'Exercice')
    dependent = bool(data.get('dependent', False))
    questions_config = data.get('questions_config', [])

    if not questions_config:
        return jsonify({'error': 'questions_config is required'}), 400

    count = min(len(questions_config), 15)
    questions_config = questions_config[:count]

    # Load course AAs for context
    aa_targets = _course_learning_targets(course_id)
    aa_context = ""
    if aa_targets:
        aa_context = "Acquis d'apprentissage du cours :\n" + "\n".join(
            [f"  AA#{a['AA#']}: {a['AA Description']}" for a in aa_targets]
        )

    # Load existing questions for variety
    ar = doc.analysis_results or {}
    existing_qs = [q.get('text', '')[:80] for q in (ar.get('extracted_questions') or ar.get('questions') or [])][:5]
    existing_ctx = '\n'.join(f'- {q}' for q in existing_qs if q) or 'Aucune question existante.'

    # Build per-question requirements
    q_requirements = "\n".join([
        f"  Question {i+1}: Bloom={cfg.get('bloom','Comprendre')} | Difficulté={cfg.get('difficulty','Moyen')} | "
        f"Type={cfg.get('type','Ouvert')} | Points={cfg.get('points', 2)}"
        for i, cfg in enumerate(questions_config)
    ])

    dependency_instruction = (
        "Les questions doivent former un scénario DÉPENDANT et progressif : chaque question s'appuie sur les "
        "résultats de la question précédente (même contexte, même données, progression logique)."
        if dependent else
        "Les questions sont INDÉPENDANTES entre elles (peuvent être répondues dans n'importe quel ordre), "
        "mais restent thématiquement cohérentes avec l'exercice."
    )

    prompt = f"""Tu es un expert en pédagogie universitaire tunisienne. Génère exactement {count} questions d'examen
pour l'exercice : "{exercise_title}".

{dependency_instruction}

{aa_context}

Spécifications par question :
{q_requirements}

Questions déjà présentes dans l'examen (à NE PAS répéter) :
{existing_ctx}

RÈGLES :
- Formules mathématiques en LaTeX inline : $formule$
- Pour QCM : inclure 4 choix (A, B, C, D) avec une seule bonne réponse
- Pour Calcul : fournir les données numériques nécessaires
- Langue : français
- Niveau universitaire (bac+1 à bac+3)
- Chaque question doit couvrir l'AA le plus pertinent parmi ceux disponibles

Retourne UNIQUEMENT un tableau JSON valide :
[
  {{
    "text": "Texte complet de la question",
    "bloom_level": "niveau Bloom exact",
    "difficulty": "difficulté exacte",
    "question_type": "type exact",
    "points": nombre,
    "estimated_time_min": entier,
    "aa_numbers": [liste d'entiers AA couverts],
    "rationale": "Justification pédagogique courte"
  }}
]"""

    try:
        api_key = current_app.config.get('GOOGLE_API_KEY', '')
        llm = ChatGoogleGenerativeAI(
            model='gemini-2.5-pro',
            google_api_key=api_key,
            temperature=0.7,
        )
        messages = [
            SystemMessage(content="Tu es un expert pédagogique. Génère des questions d'examen universitaires de haute qualité. Retourne UNIQUEMENT du JSON valide."),
            HumanMessage(content=prompt),
        ]
        resp = llm.invoke(messages)
        generated = _extract_json_array(resp.content) or []

        # Normalize and enrich
        result = []
        for i, q in enumerate(generated[:count]):
            cfg = questions_config[i] if i < len(questions_config) else {}
            aa_raw = q.get('aa_numbers', [])
            aa_list = [int(a) for a in aa_raw if str(a).isdigit() or isinstance(a, int)] if isinstance(aa_raw, list) else []
            result.append({
                'text': q.get('text', ''),
                'bloom_level': q.get('bloom_level', cfg.get('bloom', 'Comprendre')),
                'difficulty': q.get('difficulty', cfg.get('difficulty', 'Moyen')),
                'question_type': q.get('question_type', cfg.get('type', 'Ouvert')),
                'points': float(q.get('points', cfg.get('points', 2))),
                'estimated_time_min': int(q.get('estimated_time_min', 5)),
                'aa_numbers': aa_list,
                'rationale': q.get('rationale', ''),
            })

        current_app.logger.info(f'[GEN-EXERCISE-Q] Generated {len(result)} questions for exercise "{exercise_title}"')
        return jsonify({'questions': result, 'count': len(result)}), 200

    except Exception as e:
        current_app.logger.error(f'[GEN-EXERCISE-Q] Failed: {e}', exc_info=True)
        return jsonify({'error': str(e), 'questions': []}), 500


# ─────────────────────────────────────────────────────────────────────────────
# CORRECTION AUTOMATIQUE DE L'ÉPREUVE TN
# ─────────────────────────────────────────────────────────────────────────────

@tn_exams_api_bp.route('/<int:document_id>/generate-correction', methods=['POST'])
@jwt_required()
def generate_correction(course_id: int, document_id: int):
    """
    Génère une correction pour chaque question validée de l'épreuve TN via Gemini.
    Stocke les corrections dans analysis_results['corrections'].
    """
    user, course, err = _get_teacher_course(course_id)
    if err:
        return err

    doc = Document.query.get_or_404(document_id)
    if doc.document_type != 'tn_exam' or doc.course_id != course_id:
        return jsonify({'error': 'Épreuve TN introuvable'}), 404

    if not doc.analysis_results:
        return jsonify({'error': "L'épreuve TN n'a pas encore été analysée"}), 400

    ar = doc.analysis_results
    questions = ar.get('extracted_questions') or ar.get('questions') or []
    validated_questions = [q for q in questions if q.get('validated')]

    if not validated_questions:
        return jsonify({'error': 'Aucune question validée trouvée'}), 400

    try:
        import google.generativeai as genai
        genai.configure(api_key=current_app.config.get('GOOGLE_API_KEY', ''))
        model = genai.GenerativeModel('gemini-2.5-flash')

        corrections = []
        for i, q in enumerate(validated_questions):
            q_text = q.get('text') or q.get('question_text') or ''
            q_type = q.get('question_type') or q.get('type') or 'Ouvert'
            points = float(q.get('points') or q.get('bareme') or 2)
            bloom = q.get('bloom_level') or q.get('Bloom_Level') or ''
            difficulty = q.get('difficulty') or q.get('Difficulty') or ''
            exercise_num = q.get('exercise_number') or q.get('exercice') or (i + 1)
            exercise_title = q.get('exercise_title') or f'Exercice {exercise_num}'
            aa_numbers = q.get('aa_numbers') or []

            prompt = f"""Tu es un enseignant expert. Génère une correction modèle détaillée pour cette question d'examen.

Question : {q_text}
Type : {q_type}
Bloom : {bloom}
Difficulté : {difficulty}
Barème : {points} points

Retourne un JSON avec :
{{
  "correction": "correction détaillée complète",
  "points_detail": "décomposition des points (ex: 1pt pour X, 2pt pour Y)",
  "criteres": ["critère 1", "critère 2", "critère 3"]
}}"""

            try:
                resp = model.generate_content(prompt)
                text = resp.text.strip()
                start = text.find('{')
                end = text.rfind('}') + 1
                if start >= 0 and end > start:
                    import json
                    parsed = json.loads(text[start:end])
                else:
                    parsed = {'correction': text, 'points_detail': '', 'criteres': []}
            except Exception:
                parsed = {'correction': 'Erreur de génération', 'points_detail': '', 'criteres': []}

            corrections.append({
                'index': i,
                'exercise_number': exercise_num,
                'exercise_title': exercise_title,
                'question_text': q_text,
                'question_type': q_type,
                'points': points,
                'bloom_level': bloom,
                'difficulty': difficulty,
                'aa_numbers': aa_numbers,
                'correction': parsed.get('correction', ''),
                'points_detail': parsed.get('points_detail', ''),
                'criteres': parsed.get('criteres', []),
                'validated': False,
            })

        # Save to analysis_results
        from sqlalchemy.orm.attributes import flag_modified
        ar['corrections'] = corrections
        doc.analysis_results = ar
        flag_modified(doc, 'analysis_results')
        db.session.commit()

        return jsonify({'corrections': corrections, 'count': len(corrections)}), 200

    except Exception as e:
        current_app.logger.error(f'[GEN-CORRECTION] Failed: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500


@tn_exams_api_bp.route('/<int:document_id>/corrections', methods=['GET'])
@jwt_required()
def get_corrections(course_id: int, document_id: int):
    """Retourne les corrections générées pour cette épreuve TN."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    doc = Document.query.get_or_404(document_id)
    if doc.document_type != 'tn_exam' or doc.course_id != course_id:
        return jsonify({'error': 'Épreuve TN introuvable'}), 404

    ar = doc.analysis_results or {}
    corrections = ar.get('corrections', [])
    return jsonify({'corrections': corrections, 'count': len(corrections)}), 200


@tn_exams_api_bp.route('/<int:document_id>/corrections/<int:correction_index>', methods=['PUT'])
@jwt_required()
def update_correction(course_id: int, document_id: int, correction_index: int):
    """Met à jour / valide une correction par son index."""
    user, course, err = _get_teacher_course(course_id)
    if err:
        return err

    doc = Document.query.get_or_404(document_id)
    if doc.document_type != 'tn_exam' or doc.course_id != course_id:
        return jsonify({'error': 'Épreuve TN introuvable'}), 404

    ar = doc.analysis_results or {}
    corrections = ar.get('corrections', [])

    correction = next((c for c in corrections if c.get('index') == correction_index), None)
    if correction is None:
        return jsonify({'error': 'Correction introuvable'}), 404

    data = request.get_json() or {}
    for field in ['correction', 'points_detail', 'criteres', 'validated']:
        if field in data:
            correction[field] = data[field]

    from sqlalchemy.orm.attributes import flag_modified
    doc.analysis_results = ar
    flag_modified(doc, 'analysis_results')
    db.session.commit()

    return jsonify(correction), 200


# ─────────────────────────────────────────────────────────────────────────────
# CORRECTION ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@tn_exams_api_bp.route('/<int:document_id>/generate-correction', methods=['POST'])
@jwt_required()
def generate_tn_correction(course_id, document_id):
    """Génère une correction modèle pour chaque question extraite (via Gemini)."""
    import json as _json
    import google.generativeai as genai

    user, course, err = _get_teacher_course(course_id)
    if err:
        return err

    doc = Document.query.filter_by(id=document_id, course_id=course_id, document_type='tn_exam').first_or_404()

    if not doc.analysis_results:
        return jsonify({'error': "L'épreuve n'a pas été analysée"}), 400

    ar = doc.analysis_results or {}
    questions = ar.get('extracted_questions') or ar.get('questions') or []

    if not questions:
        return jsonify({'error': 'Aucune question trouvée dans l\'épreuve'}), 400

    api_key = current_app.config.get('GOOGLE_API_KEY', '')
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash')

    corrections = []
    module = (ar.get('exam_metadata') or {}).get('module', 'la matière')

    for i, q in enumerate(questions):
        text = q.get('text') or q.get('Text') or q.get('question_text', f'Question {i+1}')
        pts = q.get('points') or q.get('Points') or 1
        bloom = q.get('bloom_level') or q.get('Bloom_Level', '')
        difficulty = q.get('difficulty') or q.get('Difficulty', '')
        qtype = q.get('question_type') or q.get('Type', 'open_ended')
        aa = q.get('aa_numbers') or q.get('AA#') or []
        ex_num = q.get('exercise_number', 1)
        ex_title = q.get('exercise_title', '')

        prompt = (
            f"Tu es un enseignant expert en {module}.\n"
            f"Génère une correction modèle détaillée pour cette question d'examen universitaire.\n\n"
            f"Exercice {ex_num}: {ex_title}\n"
            f"Question: {text}\n"
            f"Points: {pts}\n"
            f"Niveau Bloom: {bloom}\n"
            f"Difficulté: {difficulty}\n"
            f"Type: {qtype}\n\n"
            f"Réponds UNIQUEMENT en JSON valide:\n"
            f'{{"correction": "<correction détaillée en markdown>", "points_detail": "<détail des points>", "criteres": ["<critère 1>", "<critère 2>"]}}'
        )

        try:
            resp = model.generate_content(prompt)
            txt = resp.text.strip()
            start = txt.find('{')
            end = txt.rfind('}') + 1
            if start >= 0 and end > start:
                parsed = _json.loads(txt[start:end])
            else:
                parsed = {'correction': txt, 'points_detail': '', 'criteres': []}
        except Exception as e:
            current_app.logger.warning(f'Correction generation failed for q {i}: {e}')
            parsed = {'correction': 'Correction non disponible.', 'points_detail': '', 'criteres': []}

        corrections.append({
            'index': i,
            'exercise_number': ex_num,
            'exercise_title': ex_title,
            'question_text': text,
            'question_type': qtype,
            'points': pts,
            'bloom_level': bloom,
            'difficulty': difficulty,
            'aa_numbers': aa,
            'correction': parsed.get('correction', ''),
            'points_detail': parsed.get('points_detail', ''),
            'criteres': parsed.get('criteres', []),
            'validated': False,
        })

    updated_ar = dict(ar)
    updated_ar['corrections'] = corrections
    doc.analysis_results = updated_ar
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(doc, 'analysis_results')
    db.session.commit()

    return jsonify({'corrections': corrections, 'count': len(corrections)})


@tn_exams_api_bp.route('/<int:document_id>/corrections', methods=['GET'])
@jwt_required()
def get_tn_corrections(course_id, document_id):
    """Récupère les corrections déjà générées."""
    user, course, err = _get_teacher_course(course_id)
    if err:
        return err

    doc = Document.query.filter_by(id=document_id, course_id=course_id, document_type='tn_exam').first_or_404()
    ar = doc.analysis_results or {}
    corrections = ar.get('corrections', [])
    return jsonify({'corrections': corrections, 'count': len(corrections)})


@tn_exams_api_bp.route('/<int:document_id>/corrections/<int:index>', methods=['PUT'])
@jwt_required()
def update_tn_correction(course_id, document_id, index):
    """Modifie et valide une correction individuelle."""
    user, course, err = _get_teacher_course(course_id)
    if err:
        return err

    doc = Document.query.filter_by(id=document_id, course_id=course_id, document_type='tn_exam').first_or_404()
    ar = doc.analysis_results or {}
    corrections = ar.get('corrections', [])

    if index < 0 or index >= len(corrections):
        return jsonify({'error': 'Index invalide'}), 404

    data = request.get_json() or {}
    corrections[index].update({
        'correction': data.get('correction', corrections[index].get('correction', '')),
        'points_detail': data.get('points_detail', corrections[index].get('points_detail', '')),
        'criteres': data.get('criteres', corrections[index].get('criteres', [])),
        'validated': data.get('validated', corrections[index].get('validated', False)),
    })

    updated_ar = dict(ar)
    updated_ar['corrections'] = corrections
    doc.analysis_results = updated_ar
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(doc, 'analysis_results')
    db.session.commit()

    return jsonify(corrections[index])