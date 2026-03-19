"""
Exam API  — upload + évaluation AI de l'examen
================================================
GET   /courses/<id>/exam           get latest exam + AI evaluation
POST  /courses/<id>/exam/upload    upload exam file (multipart)
POST  /courses/<id>/exam/analyze   trigger Gemini AI analysis
DELETE /courses/<id>/exam/<eid>    delete exam
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
from app.models import User, Course, Enrollment, CourseExam

logger = logging.getLogger(__name__)

EXAM_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt', 'md'}


def _course_access(course_id: int):
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    course = Course.query.get_or_404(course_id)
    is_teacher = bool(user.is_teacher and course.teacher_id == user.id) or bool(user.is_superuser)
    is_student = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())
    return user, course, is_teacher, is_student


def _allowed_exam(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in EXAM_EXTENSIONS


def _get_gemini():
    from langchain_google_genai import ChatGoogleGenerativeAI
    api_key = current_app.config.get('GOOGLE_API_KEY', '')
    model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    return ChatGoogleGenerativeAI(model=model, google_api_key=api_key, temperature=0.3, max_tokens=6000)


def _extract_text(file_path: str, ext: str) -> str:
    """Extract plain text from uploaded exam file."""
    full = os.path.join(current_app.config['UPLOAD_FOLDER'], file_path)
    if ext in ('txt', 'md'):
        with open(full, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    if ext == 'pdf':
        try:
            import fitz  # PyMuPDF
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


# ─── GET exam ──────────────────────────────────────────────────────────────────

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


# ─── POST upload ───────────────────────────────────────────────────────────────

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
    )
    db.session.add(exam)
    db.session.commit()
    return jsonify({'exam': exam.to_dict()}), 201


# ─── POST analyze ──────────────────────────────────────────────────────────────

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

        # Collect course AAs for alignment check
        syllabus = course.syllabus
        aa_list = []
        if syllabus:
            for aa in syllabus.tn_aa:
                aa_list.append(f"AA{aa.number}: {aa.description or ''}")
        aa_context = '\n'.join(aa_list[:20]) if aa_list else 'No AAs defined'

        prompt = f"""Tu es un expert pédagogique. Analyse cet examen de cours.

COURS: {course.title}
ACQUIS D'APPRENTISSAGE (AAs):
{aa_context}

TEXTE DE L'EXAMEN:
{text[:8000]}

Retourne UNIQUEMENT un JSON valide avec cette structure exacte:
{{
  "overview": "résumé de l'examen en 2-3 phrases",
  "questions_count": <nombre de questions estimé>,
  "estimated_duration": "<durée estimée ex: 2h>",
  "avg_difficulty": "<facile|moyen|difficile>",
  "bloom_distribution": {{
    "remembering": <% int>,
    "understanding": <% int>,
    "applying": <% int>,
    "analyzing": <% int>,
    "evaluating": <% int>,
    "creating": <% int>
  }},
  "aa_alignment": [
    {{"aa": "AA1", "covered": true, "comment": "..."}}
  ],
  "strengths": ["point fort 1", "point fort 2"],
  "feedback": ["observation 1", "observation 2", "observation 3"],
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"],
  "overall_score": <note sur 10 int>
}}"""

        llm = _get_gemini()
        response = llm.invoke(prompt)
        raw = response.content.strip()
        # Clean markdown code blocks
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
        exam.ai_evaluation = {'error': str(e)}
        db.session.commit()
        return jsonify({'exam': exam.to_dict(), 'error': str(e)}), 500


# ─── DELETE exam ───────────────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/exam/<int:exam_id>', methods=['DELETE'])
@jwt_required()
def delete_course_exam(course_id, exam_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    exam = CourseExam.query.filter_by(id=exam_id, course_id=course_id).first_or_404()
    # Remove physical file
    if exam.file_path:
        try:
            full = os.path.join(current_app.config['UPLOAD_FOLDER'], exam.file_path)
            if os.path.exists(full):
                os.remove(full)
        except Exception:
            pass
    db.session.delete(exam)
    db.session.commit()
    return jsonify({'message': 'Examen supprimé'}), 200
