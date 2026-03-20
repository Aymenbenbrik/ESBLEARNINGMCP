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


tn_exams_api_bp = Blueprint('tn_exams_api', __name__, url_prefix='/courses/<int:course_id>/tn-exams')
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx'}


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
    doc.content_metadata = {'exam_type': exam_type}
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

    try:
        analysis = analyze_tn_exam(course, doc)
        doc.analysis_results = analysis

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
        doc.updated_at = datetime.utcnow()
        db.session.commit()
    except Exception as e:
        current_app.logger.exception('TN exam evaluation failed')
        db.session.rollback()
        return jsonify({'error': f"Échec de l'évaluation: {str(e)}"}), 500

    return jsonify({
        'message': 'Évaluation terminée. Rapport PDF généré.',
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
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': f'File not found: {file_path}'}), 404

    from app.services.exam_agent_graph import run_exam_evaluation
    session_id = run_exam_evaluation(
        course_id=course.id,
        file_path=file_path,
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
