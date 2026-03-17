import os

from flask import Blueprint, abort, current_app, render_template, request, send_from_directory, url_for, redirect, flash
from flask_login import login_required, current_user

from app.models import Document, Enrollment
from app.services.document_extraction_service import analyze_document


documents_bp = Blueprint('documents', __name__)


def _get_course_for_document(doc: Document):
    if doc.course_id and doc.course:
        return doc.course
    if doc.chapter_id and doc.chapter:
        return doc.chapter.course
    return None


def _require_access(doc: Document):
    course = _get_course_for_document(doc)
    if course is None:
        abort(404)
    if current_user.is_teacher:
        # Teachers can access only their own courses
        if course.teacher_id != current_user.id:
            abort(403)
    else:
        if not Enrollment.query.filter_by(student_id=current_user.id, course_id=course.id).first():
            abort(403)
    return course


@documents_bp.get('/documents/<int:document_id>/extraction')
@login_required
def view_extraction(document_id):
    doc = Document.query.get_or_404(document_id)
    course = _require_access(doc)
    force = request.args.get('force') == '1'
    results = None
    error = None
    try:
        results = analyze_document(doc, force=force)
    except Exception as e:
        current_app.logger.exception('Document extraction failed')
        error = str(e)

    return render_template(
        'documents/extraction.html',
        document=doc,
        course=course,
        chapter=doc.chapter if doc.chapter_id else None,
        extraction=results,
        extraction_error=error,
    )


@documents_bp.get('/documents/<int:document_id>/extraction/report')
@login_required
def download_extraction_report(document_id):
    doc = Document.query.get_or_404(document_id)
    _require_access(doc)

    # Ensure analysis exists
    if not doc.analysis_report_path or not doc.analysis_results:
        analyze_document(doc, force=False)

    if not doc.analysis_report_path:
        abort(404)

    uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
    rel = doc.analysis_report_path
    directory = os.path.join(uploads_dir, os.path.dirname(rel))
    filename = os.path.basename(rel)
    return send_from_directory(directory, filename, as_attachment=True, download_name=filename)
