"""
Sections API — CRUD for TNSection + new activity types + chapter sidebar data
=============================================================================

Endpoints:
  POST   /chapters/<id>/sections                   create a section
  PUT    /sections/<id>                             update section title/index
  DELETE /sections/<id>                             delete a section

  POST   /sections/<id>/activities/image           upload image activity
  POST   /sections/<id>/activities/text-doc        add text/markdown activity
  PUT    /sections/<id>/activities/<aid>/text-doc  update text doc content
  POST   /sections/<id>/activities/pdf-extract     extract PDF slice from chapter doc

  GET    /chapters/<id>/deadlines                  upcoming deadlines (quizzes + assignments)
  GET    /chapters/<id>/activity-progress          student completed activities
"""
import os
import json
import logging
import uuid
from datetime import datetime

from flask import request, jsonify, current_app, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api.v1 import api_v1_bp
from app import db
from app.models import (
    User, TNChapter, TNSection, SectionActivity, SectionQuiz,
    SectionAssignment, SectionQuizSubmission, AssignmentSubmission,
    Enrollment
)

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_EXTS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}


def _get_user():
    return User.query.get(int(get_jwt_identity()))


def _chapter_access(chapter_id: int):
    """Return (user, tn_chapter, course, is_teacher)."""
    user = _get_user()
    tn_chapter = TNChapter.query.get_or_404(chapter_id)
    syllabus = tn_chapter.syllabus
    course = syllabus.course if syllabus else None
    if not course:
        return user, tn_chapter, None, False
    is_teacher = bool(user.is_teacher and course.teacher_id == user.id) or bool(user.is_superuser)
    return user, tn_chapter, course, is_teacher


def _section_access(section_id: int):
    """Return (user, section, course, is_teacher)."""
    user = _get_user()
    section = TNSection.query.get_or_404(section_id)
    chapter = section.chapter
    syllabus = chapter.syllabus
    course = syllabus.course if syllabus else None
    is_teacher = bool(course and user.is_teacher and course.teacher_id == user.id) or bool(user.is_superuser)
    return user, section, course, is_teacher


# ─── Section CRUD ─────────────────────────────────────────────────────────────

@api_v1_bp.route('/chapters/<int:chapter_id>/sections', methods=['POST'])
@jwt_required()
def create_section(chapter_id):
    """Teacher adds a section to a chapter."""
    user, tn_chapter, course, is_teacher = _chapter_access(chapter_id)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title required'}), 400

    # Auto-generate index: chapter_label.N
    existing = TNSection.query.filter_by(chapter_id=tn_chapter.id).all()
    chapter_label = str(tn_chapter.index) if tn_chapter.index else str(len(existing) + 1)
    max_n = max((int(s.index.split('.')[-1]) for s in existing if '.' in s.index), default=0)
    index = f"{chapter_label}.{max_n + 1}"

    section = TNSection(chapter_id=tn_chapter.id, index=index, title=title)
    db.session.add(section)
    db.session.commit()
    return jsonify({'section': {'id': section.id, 'index': section.index, 'title': section.title}}), 201


@api_v1_bp.route('/sections/<int:section_id>', methods=['PUT'])
@jwt_required()
def update_section(section_id):
    user, section, course, is_teacher = _section_access(section_id)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        section.title = data['title'].strip() or section.title
    if 'index' in data:
        section.index = data['index'].strip() or section.index
    db.session.commit()
    return jsonify({'section': {'id': section.id, 'index': section.index, 'title': section.title}}), 200


@api_v1_bp.route('/sections/<int:section_id>', methods=['DELETE'])
@jwt_required()
def delete_section(section_id):
    user, section, course, is_teacher = _section_access(section_id)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403
    db.session.delete(section)
    db.session.commit()
    return jsonify({'message': 'Section supprimée'}), 200


# ─── Image activity ────────────────────────────────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/activities/image', methods=['POST'])
@jwt_required()
def add_image_activity(section_id):
    """Upload an image and attach it as a section activity."""
    user, section, course, is_teacher = _section_access(section_id)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    ext = (file.filename or '').rsplit('.', 1)[-1].lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        return jsonify({'error': f'Extension non autorisée. Autorisées: {", ".join(ALLOWED_IMAGE_EXTS)}'}), 400

    title = request.form.get('title', file.filename or 'Image')
    upload_dir = os.path.join(current_app.root_path, '..', 'uploads', 'section_images')
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)
    image_url = f"/uploads/section_images/{filename}"

    max_pos = db.session.query(db.func.max(SectionActivity.position)).filter_by(section_id=section_id).scalar() or 0
    act = SectionActivity(
        section_id=section_id, activity_type='image', title=title,
        image_url=image_url, image_filename=filename, position=max_pos + 1,
    )
    db.session.add(act); db.session.commit()
    return jsonify({'activity': act.to_dict()}), 201


# ─── Text document activity ────────────────────────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/activities/text-doc', methods=['POST'])
@jwt_required()
def add_text_doc_activity(section_id):
    """Add a Markdown/text content block as a section activity."""
    user, section, course, is_teacher = _section_access(section_id)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    data = request.get_json(silent=True) or {}
    title = (data.get('title') or 'Document texte').strip()
    content = (data.get('content') or '').strip()

    max_pos = db.session.query(db.func.max(SectionActivity.position)).filter_by(section_id=section_id).scalar() or 0
    act = SectionActivity(
        section_id=section_id, activity_type='text_doc', title=title,
        text_content=content, position=max_pos + 1,
    )
    db.session.add(act); db.session.commit()
    return jsonify({'activity': act.to_dict()}), 201


@api_v1_bp.route('/sections/<int:section_id>/activities/<int:activity_id>/text-doc', methods=['PUT'])
@jwt_required()
def update_text_doc_activity(section_id, activity_id):
    user, section, course, is_teacher = _section_access(section_id)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    act = SectionActivity.query.filter_by(id=activity_id, section_id=section_id, activity_type='text_doc').first_or_404()
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        act.title = data['title'] or act.title
    if 'content' in data:
        act.text_content = data['content']
    db.session.commit()
    return jsonify({'activity': act.to_dict()}), 200


# ─── PDF Extract activity ──────────────────────────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/activities/pdf-extract', methods=['POST'])
@jwt_required()
def add_pdf_extract_activity(section_id):
    """
    Extract a page range from the chapter document and save as PDF activity.
    Body: { document_id, start_page, end_page, title? }
    """
    user, section, course, is_teacher = _section_access(section_id)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    data = request.get_json(silent=True) or {}
    doc_id = data.get('document_id')
    start_page = int(data.get('start_page', 1))
    end_page = int(data.get('end_page', start_page))

    from app.models import Document
    doc = Document.query.get_or_404(doc_id)

    doc_path = os.path.join(current_app.root_path, '..', doc.file_path.lstrip('/'))
    if not os.path.exists(doc_path):
        return jsonify({'error': 'Document file not found on disk'}), 404

    try:
        import fitz  # PyMuPDF
        src = fitz.open(doc_path)
        total = src.page_count
        s = max(0, start_page - 1)
        e = min(total - 1, end_page - 1)
        if s > e:
            return jsonify({'error': 'Invalid page range'}), 400

        out_dir = os.path.join(current_app.root_path, '..', 'uploads', 'section_pdfs')
        os.makedirs(out_dir, exist_ok=True)
        out_name = f"{uuid.uuid4().hex}.pdf"
        out_path = os.path.join(out_dir, out_name)
        out_doc = fitz.open()
        out_doc.insert_pdf(src, from_page=s, to_page=e)
        out_doc.save(out_path)
        out_doc.close(); src.close()

        title = data.get('title') or f"Pages {start_page}–{end_page} — {doc.title or doc.filename}"
        image_url = f"/uploads/section_pdfs/{out_name}"
        max_pos = db.session.query(db.func.max(SectionActivity.position)).filter_by(section_id=section_id).scalar() or 0
        act = SectionActivity(
            section_id=section_id, activity_type='pdf_extract', title=title,
            image_url=image_url, position=max_pos + 1, document_id=doc_id,
        )
        db.session.add(act); db.session.commit()
        return jsonify({'activity': act.to_dict()}), 201

    except Exception as exc:
        logger.error(f'PDF extract error: {exc}', exc_info=True)
        return jsonify({'error': str(exc)}), 500


# ─── Chapter sidebar: deadlines + activity progress ───────────────────────────

@api_v1_bp.route('/chapters/<int:chapter_id>/deadlines', methods=['GET'])
@jwt_required()
def get_chapter_deadlines(chapter_id):
    """Return upcoming quiz deadlines and assignment deadlines for this chapter."""
    user, tn_chapter, course, is_teacher = _chapter_access(chapter_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    is_enrolled = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())
    if not is_enrolled and not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    now = datetime.utcnow()
    deadlines = []

    for section in (tn_chapter.sections or []):
        # Quiz deadlines
        quiz = SectionQuiz.query.filter_by(section_id=section.id, status='published').first()
        if quiz and quiz.end_date:
            delta = (quiz.end_date - now).total_seconds()
            if delta > 0:
                submitted = 0
                if not is_teacher:
                    submitted = SectionQuizSubmission.query.filter_by(
                        quiz_id=quiz.id, student_id=user.id
                    ).count()
                deadlines.append({
                    'type': 'quiz',
                    'id': quiz.id,
                    'title': quiz.title,
                    'section_title': section.title,
                    'deadline': quiz.end_date.isoformat(),
                    'seconds_remaining': int(delta),
                    'completed': submitted > 0,
                })

        # Assignment deadlines
        for assignment in section.assignments:
            if assignment.deadline:
                delta = (assignment.deadline - now).total_seconds()
                if delta > 0 or assignment.allow_late:
                    submitted = 0
                    if not is_teacher:
                        submitted = AssignmentSubmission.query.filter_by(
                            assignment_id=assignment.id, student_id=user.id
                        ).count()
                    deadlines.append({
                        'type': 'assignment',
                        'id': assignment.id,
                        'title': assignment.title,
                        'section_title': section.title,
                        'deadline': assignment.deadline.isoformat(),
                        'seconds_remaining': int(delta),
                        'completed': submitted > 0,
                        'allow_late': assignment.allow_late,
                    })

    deadlines.sort(key=lambda d: d['seconds_remaining'])
    return jsonify({'deadlines': deadlines}), 200


@api_v1_bp.route('/chapters/<int:chapter_id>/activity-progress', methods=['GET'])
@jwt_required()
def get_activity_progress(chapter_id):
    """Return list of activities completed by the current user in this chapter."""
    user, tn_chapter, course, is_teacher = _chapter_access(chapter_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    is_enrolled = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())
    if not is_enrolled and not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    completed = []
    for section in (tn_chapter.sections or []):
        quiz = SectionQuiz.query.filter_by(section_id=section.id, status='published').first()
        if quiz:
            subs = SectionQuizSubmission.query.filter_by(quiz_id=quiz.id, student_id=user.id).all()
            for sub in subs:
                completed.append({
                    'type': 'quiz',
                    'title': quiz.title,
                    'section_title': section.title,
                    'score': sub.score,
                    'max_score': sub.max_score,
                    'attempt': sub.attempt_number,
                    'submitted_at': sub.submitted_at.isoformat() if sub.submitted_at else None,
                })

        for assignment in section.assignments:
            subs = AssignmentSubmission.query.filter_by(
                assignment_id=assignment.id, student_id=user.id
            ).all()
            for sub in subs:
                completed.append({
                    'type': 'assignment',
                    'title': assignment.title,
                    'section_title': section.title,
                    'grade': sub.grade,
                    'submitted_at': sub.submitted_at.isoformat() if sub.submitted_at else None,
                })

    completed.sort(key=lambda x: x.get('submitted_at') or '', reverse=True)
    return jsonify({'completed': completed}), 200


# ─── Drag-and-drop reordering ─────────────────────────────────────────────────

@api_v1_bp.route('/chapters/<int:chapter_id>/sections/reorder', methods=['POST'])
@jwt_required()
def reorder_sections(chapter_id):
    """
    Reorder sections in a chapter.
    Body: { section_ids: [id1, id2, id3, ...] }  — ordered list
    """
    user, tn_chapter, course, is_teacher = _chapter_access(chapter_id)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    data = request.get_json(silent=True) or {}
    section_ids = data.get('section_ids', [])
    if not section_ids:
        return jsonify({'error': 'section_ids required'}), 400

    # Verify all sections belong to this chapter
    sections = TNSection.query.filter(
        TNSection.id.in_(section_ids),
        TNSection.chapter_id == chapter_id
    ).all()
    section_map = {s.id: s for s in sections}

    for pos, sid in enumerate(section_ids):
        if sid in section_map:
            section_map[sid].position = pos

    db.session.commit()
    return jsonify({'message': 'Sections réordonnées', 'order': section_ids}), 200


@api_v1_bp.route('/activities/<int:activity_id>/move', methods=['PATCH'])
@jwt_required()
def move_activity(activity_id):
    """
    Move or reorder an activity.
    Body: { section_id: int, position: int }
    — section_id can be same (reorder) or different (cross-section move)
    """
    user = _get_user()
    act = SectionActivity.query.get_or_404(activity_id)
    old_section = TNSection.query.get_or_404(act.section_id)
    chapter = old_section.chapter
    syllabus = chapter.syllabus
    course = syllabus.course if syllabus else None
    is_teacher = bool(course and user.is_teacher and course.teacher_id == user.id) or bool(user.is_superuser)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    data = request.get_json(silent=True) or {}
    new_section_id = data.get('section_id', act.section_id)
    new_position = data.get('position', act.position)

    # If moving to a different section, verify it's in same chapter
    if new_section_id != act.section_id:
        new_section = TNSection.query.get_or_404(new_section_id)
        if new_section.chapter_id != chapter.id:
            return jsonify({'error': 'Cannot move activity to a different chapter'}), 400
        act.section_id = new_section_id

    # Shift other activities to make room at new position
    activities_in_target = SectionActivity.query.filter(
        SectionActivity.section_id == new_section_id,
        SectionActivity.id != activity_id,
    ).order_by(SectionActivity.position).all()

    for i, a in enumerate(activities_in_target):
        a.position = i if i < new_position else i + 1

    act.position = new_position
    db.session.commit()
    return jsonify({'activity': act.to_dict()}), 200


@api_v1_bp.route('/sections/<int:section_id>/activities/reorder', methods=['POST'])
@jwt_required()
def reorder_activities(section_id):
    """
    Reorder activities within a section.
    Body: { activity_ids: [id1, id2, id3, ...] }
    """
    user, section, course, is_teacher = _section_access(section_id)
    if not is_teacher:
        return jsonify({'error': 'Teachers only'}), 403

    data = request.get_json(silent=True) or {}
    activity_ids = data.get('activity_ids', [])
    if not activity_ids:
        return jsonify({'error': 'activity_ids required'}), 400

    activities = SectionActivity.query.filter(
        SectionActivity.id.in_(activity_ids),
        SectionActivity.section_id == section_id,
    ).all()
    activity_map = {a.id: a for a in activities}

    for pos, aid in enumerate(activity_ids):
        if aid in activity_map:
            activity_map[aid].position = pos

    db.session.commit()
    return jsonify({'message': 'Activités réordonnées'}), 200


