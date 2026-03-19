"""
Section Assignments API
=======================
Homework/devoir system per TNSection: teacher creates, students submit files.

Endpoints:
  GET    /sections/<id>/assignment                          get assignment (+ my submission for students)
  POST   /sections/<id>/assignment                          create assignment (teacher)
  PUT    /sections/<id>/assignment                          update assignment (teacher)
  DELETE /sections/<id>/assignment                          delete assignment (teacher)
  POST   /sections/<id>/assignment/submit                   student submits files (multipart)
  GET    /sections/<id>/assignment/submissions              teacher: all submissions
  PUT    /sections/<id>/assignment/submissions/<sid>/grade  teacher: grade a submission
"""

import os
import uuid
import logging
from datetime import datetime

from flask import request, jsonify, current_app, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from app.api.v1 import api_v1_bp
from app import db
from app.models import (
    User, TNSection, SectionAssignment, AssignmentSubmission, Enrollment, Course
)

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
                       'txt', 'md', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'webp',
                       'py', 'js', 'ts', 'java', 'c', 'cpp', 'cs', 'ipynb'}


def _allowed(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def _get_section_and_user(section_id: int):
    """Return (user, section, course, is_teacher, is_student) or raise."""
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    section = TNSection.query.get_or_404(section_id)
    # Walk section → tn_chapter → syllabus → course
    tnc = section.tn_chapter
    course = tnc.syllabus.course if tnc and tnc.syllabus else None
    if course is None:
        return user, section, None, False, False
    is_teacher = bool(user.is_teacher and course.teacher_id == user.id) or bool(user.is_superuser)
    is_student = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())
    return user, section, course, is_teacher, is_student


def _save_assignment_file(file, section_id: int):
    """Save an assignment file and return (relative_path, original_name, ext, size)."""
    original_name = secure_filename(file.filename)
    ext = original_name.rsplit('.', 1)[1].lower() if '.' in original_name else ''
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    folder = os.path.join(current_app.config['UPLOAD_FOLDER'], f'assignments', f'section_{section_id}')
    os.makedirs(folder, exist_ok=True)
    full_path = os.path.join(folder, unique_name)
    file.save(full_path)
    size = os.path.getsize(full_path)
    rel_path = os.path.join('assignments', f'section_{section_id}', unique_name)
    return rel_path, original_name, ext, size


# ─── GET / assignment ──────────────────────────────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/assignment', methods=['GET'])
@jwt_required()
def get_section_assignment(section_id):
    user, section, course, is_teacher, is_student = _get_section_and_user(section_id)
    if not is_teacher and not is_student:
        return jsonify({'error': 'Access denied'}), 403

    assignment = SectionAssignment.query.filter_by(section_id=section_id).first()
    if not assignment:
        return jsonify({'assignment': None}), 200

    payload = assignment.to_dict()

    if is_student:
        # Include student's own submissions
        subs = (AssignmentSubmission.query
                .filter_by(assignment_id=assignment.id, student_id=user.id)
                .order_by(AssignmentSubmission.attempt_number.desc())
                .all())
        payload['my_submissions'] = [s.to_dict() for s in subs]
        payload['attempts_used'] = len(subs)
    else:
        payload['submission_count'] = assignment.submissions.count()

    return jsonify({'assignment': payload}), 200


# ─── POST / assignment ─────────────────────────────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/assignment', methods=['POST'])
@jwt_required()
def create_section_assignment(section_id):
    user, section, course, is_teacher, _ = _get_section_and_user(section_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    if SectionAssignment.query.filter_by(section_id=section_id).first():
        return jsonify({'error': 'Un devoir existe déjà pour cette section. Utilisez PUT pour le modifier.'}), 409

    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    deadline = None
    if data.get('deadline'):
        try:
            deadline = datetime.fromisoformat(data['deadline'].replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': 'Invalid deadline format (use ISO 8601)'}), 400

    assignment = SectionAssignment(
        section_id=section_id,
        title=title,
        description=data.get('description'),
        deliverables=data.get('deliverables'),
        deadline=deadline,
        allow_late=bool(data.get('allow_late', False)),
        max_attempts=max(1, int(data.get('max_attempts', 1))),
    )
    db.session.add(assignment)
    db.session.commit()
    return jsonify({'assignment': assignment.to_dict()}), 201


# ─── PUT / assignment ──────────────────────────────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/assignment', methods=['PUT'])
@jwt_required()
def update_section_assignment(section_id):
    user, section, course, is_teacher, _ = _get_section_and_user(section_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    assignment = SectionAssignment.query.filter_by(section_id=section_id).first_or_404()
    data = request.get_json() or {}

    if 'title' in data:
        assignment.title = (data['title'] or '').strip() or assignment.title
    if 'description' in data:
        assignment.description = data['description']
    if 'deliverables' in data:
        assignment.deliverables = data['deliverables']
    if 'allow_late' in data:
        assignment.allow_late = bool(data['allow_late'])
    if 'max_attempts' in data:
        assignment.max_attempts = max(1, int(data['max_attempts']))
    if 'deadline' in data:
        if data['deadline']:
            try:
                assignment.deadline = datetime.fromisoformat(data['deadline'].replace('Z', '+00:00'))
            except ValueError:
                return jsonify({'error': 'Invalid deadline format'}), 400
        else:
            assignment.deadline = None

    assignment.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'assignment': assignment.to_dict()}), 200


# ─── DELETE / assignment ───────────────────────────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/assignment', methods=['DELETE'])
@jwt_required()
def delete_section_assignment(section_id):
    user, section, course, is_teacher, _ = _get_section_and_user(section_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    assignment = SectionAssignment.query.filter_by(section_id=section_id).first_or_404()
    db.session.delete(assignment)
    db.session.commit()
    return jsonify({'message': 'Devoir supprimé'}), 200


# ─── POST / assignment / submit ────────────────────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/assignment/submit', methods=['POST'])
@jwt_required()
def submit_assignment(section_id):
    user, section, course, is_teacher, is_student = _get_section_and_user(section_id)
    if not is_student:
        return jsonify({'error': 'Vous devez être inscrit dans ce cours'}), 403

    assignment = SectionAssignment.query.filter_by(section_id=section_id).first_or_404()
    now = datetime.utcnow()
    is_late = bool(assignment.deadline and now > assignment.deadline)

    if is_late and not assignment.allow_late:
        return jsonify({'error': 'La date limite est dépassée et les rendus tardifs ne sont pas acceptés.'}), 403

    # Count previous attempts
    previous = (AssignmentSubmission.query
                .filter_by(assignment_id=assignment.id, student_id=user.id)
                .count())
    if previous >= assignment.max_attempts:
        return jsonify({'error': f'Nombre maximal de tentatives atteint ({assignment.max_attempts}).'}), 403

    files = request.files.getlist('files')
    if not files or all(f.filename == '' for f in files):
        return jsonify({'error': 'Au moins un fichier est requis.'}), 400

    saved = []
    for f in files:
        if f.filename == '':
            continue
        if not _allowed(f.filename):
            return jsonify({'error': f"Type de fichier non autorisé : {f.filename}"}), 400
        rel_path, orig_name, ext, size = _save_assignment_file(f, section_id)
        saved.append({'path': rel_path, 'original_name': orig_name, 'file_type': ext, 'size': size})

    sub = AssignmentSubmission(
        assignment_id=assignment.id,
        student_id=user.id,
        files=saved,
        attempt_number=previous + 1,
        is_late=is_late,
        status='submitted',
    )
    db.session.add(sub)
    db.session.commit()
    return jsonify({'submission': sub.to_dict()}), 201


# ─── GET / assignment / submissions (teacher) ──────────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/assignment/submissions', methods=['GET'])
@jwt_required()
def get_assignment_submissions(section_id):
    user, section, course, is_teacher, _ = _get_section_and_user(section_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    assignment = SectionAssignment.query.filter_by(section_id=section_id).first_or_404()
    subs = (AssignmentSubmission.query
            .filter_by(assignment_id=assignment.id)
            .order_by(AssignmentSubmission.submitted_at.desc())
            .all())
    return jsonify({'submissions': [s.to_dict() for s in subs]}), 200


# ─── PUT / assignment / submissions / <sid> / grade ────────────────────────────

@api_v1_bp.route('/sections/<int:section_id>/assignment/submissions/<int:sub_id>/grade', methods=['PUT'])
@jwt_required()
def grade_assignment_submission(section_id, sub_id):
    user, section, course, is_teacher, _ = _get_section_and_user(section_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    sub = AssignmentSubmission.query.get_or_404(sub_id)
    data = request.get_json() or {}
    if 'grade' in data:
        sub.grade = float(data['grade'])
    if 'feedback' in data:
        sub.feedback = data['feedback']
    sub.status = 'graded'
    db.session.commit()
    return jsonify({'submission': sub.to_dict()}), 200
