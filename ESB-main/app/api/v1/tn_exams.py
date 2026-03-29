from __future__ import annotations

import os
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from app import db
from app.models import Course, Document, User
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
    if not (user.is_superuser or (user.is_teacher and course.teacher_id == user.id)):
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
        pdf_path = generate_tn_latex_report(
            analysis=doc.analysis_results,
            course_title=course.title,
            exam_title=doc.title or 'Examen',
        )
        if pdf_path and os.path.exists(pdf_path):
            safe_name = (doc.title or 'rapport').replace(' ', '_')
            return send_file(pdf_path, as_attachment=True,
                             download_name=f'rapport_evaluation_{safe_name}.pdf',
                             mimetype='application/pdf')
        return jsonify({'error': 'PDF generation failed'}), 500
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