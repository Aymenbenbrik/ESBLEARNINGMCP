"""
Grades API  — notes agrégées par étudiant
==========================================
GET  /courses/<id>/grade-weights         get current weights
PUT  /courses/<id>/grade-weights         save weights
GET  /courses/<id>/grades                computed grades for all students (teacher)
GET  /courses/<id>/grades/me             student: own computed grade
"""
import logging
from datetime import datetime

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api.v1 import api_v1_bp
from app import db
from app.models import (User, Course, Enrollment, GradeWeight,
                         SectionQuiz, SectionQuizSubmission,
                         SectionAssignment, AssignmentSubmission,
                         AttendanceSession, AttendanceRecord)

logger = logging.getLogger(__name__)


def _course_access(course_id: int):
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    course = Course.query.get_or_404(course_id)
    is_teacher = bool(user.is_teacher and course.teacher_id == user.id) or bool(user.is_superuser)
    is_student = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())
    return user, course, is_teacher, is_student


def _get_or_create_weights(course_id: int) -> GradeWeight:
    w = GradeWeight.query.filter_by(course_id=course_id).first()
    if not w:
        w = GradeWeight(course_id=course_id)
        db.session.add(w)
        db.session.commit()
    return w


def _compute_student_grade(student_id: int, course: Course, weights: GradeWeight) -> dict:
    """Return computed grade breakdown for one student."""
    # --- Quiz average ---
    quizzes = []
    syllabus = course.syllabus
    if syllabus:
        for tn_chapter in syllabus.tn_chapters:
            for section in tn_chapter.sections:
                sq = SectionQuiz.query.filter_by(section_id=section.id, status='published').first()
                if sq:
                    sub = SectionQuizSubmission.query.filter_by(quiz_id=sq.id, student_id=student_id).first()
                    if sub and sub.max_score:
                        quizzes.append((sub.score or 0) / sub.max_score * 20)

    quiz_avg = (sum(quizzes) / len(quizzes)) if quizzes else None

    # --- Assignment average ---
    assignments = []
    if syllabus:
        for tn_chapter in syllabus.tn_chapters:
            for section in tn_chapter.sections:
                sa = SectionAssignment.query.filter_by(section_id=section.id).first()
                if sa:
                    sub = (AssignmentSubmission.query
                           .filter_by(assignment_id=sa.id, student_id=student_id)
                           .order_by(AssignmentSubmission.attempt_number.desc())
                           .first())
                    if sub and sub.grade is not None:
                        assignments.append(sub.grade)

    assignment_avg = (sum(assignments) / len(assignments)) if assignments else None

    # --- Attendance score (present=1, late=0.5, absent=0) ---
    sessions = AttendanceSession.query.filter_by(course_id=course.id).all()
    total_sessions = len(sessions)
    attendance_score = None
    if total_sessions:
        pts = 0.0
        for s in sessions:
            rec = AttendanceRecord.query.filter_by(session_id=s.id, student_id=student_id).first()
            if rec:
                if rec.status == 'present':
                    pts += 1
                elif rec.status == 'late':
                    pts += 0.5
        attendance_score = (pts / total_sessions) * 20

    # --- Exam grade: not stored per student (teacher sets globally) ---
    exam_score = None

    # --- Final grade ---
    total_w = 0.0
    final = 0.0
    components = {}

    def _add(name, value, weight):
        nonlocal total_w, final
        components[name] = {'value': value, 'weight': weight}
        if value is not None:
            total_w += weight
            final += value * weight / 100

    _add('quiz', quiz_avg, weights.quiz_weight)
    _add('assignment', assignment_avg, weights.assignment_weight)
    _add('attendance', attendance_score, weights.attendance_weight)
    _add('exam', exam_score, weights.exam_weight)

    final_grade = (final / total_w * 100) if total_w else None

    return {
        'quiz_avg': round(quiz_avg, 2) if quiz_avg is not None else None,
        'assignment_avg': round(assignment_avg, 2) if assignment_avg is not None else None,
        'attendance_score': round(attendance_score, 2) if attendance_score is not None else None,
        'exam_score': exam_score,
        'final_grade': round(final_grade, 2) if final_grade is not None else None,
        'quiz_count': len(quizzes),
        'assignment_count': len(assignments),
        'total_sessions': total_sessions,
    }


# ─── Weights ──────────────────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/grade-weights', methods=['GET'])
@jwt_required()
def get_grade_weights(course_id):
    user, course, is_teacher, is_student = _course_access(course_id)
    if not is_teacher and not is_student:
        return jsonify({'error': 'Access denied'}), 403
    weights = _get_or_create_weights(course_id)
    return jsonify({'weights': weights.to_dict()}), 200


@api_v1_bp.route('/courses/<int:course_id>/grade-weights', methods=['PUT'])
@jwt_required()
def update_grade_weights(course_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json() or {}
    weights = _get_or_create_weights(course_id)

    for field in ('quiz_weight', 'assignment_weight', 'attendance_weight', 'exam_weight'):
        if field in data:
            setattr(weights, field, float(data[field]))
    if 'formula' in data:
        weights.formula = data['formula']
    weights.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'weights': weights.to_dict()}), 200


# ─── Grades ───────────────────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/grades', methods=['GET'])
@jwt_required()
def get_all_grades(course_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    weights = _get_or_create_weights(course_id)
    enrollments = Enrollment.query.filter_by(course_id=course_id).all()

    result = []
    for enr in enrollments:
        student = User.query.get(enr.student_id)
        if not student:
            continue
        grade_data = _compute_student_grade(student.id, course, weights)
        grade_data['student_id'] = student.id
        grade_data['student_name'] = student.username
        grade_data['student_email'] = student.email
        result.append(grade_data)

    return jsonify({
        'grades': result,
        'weights': weights.to_dict(),
    }), 200


@api_v1_bp.route('/courses/<int:course_id>/grades/me', methods=['GET'])
@jwt_required()
def get_my_grade(course_id):
    user, course, is_teacher, is_student = _course_access(course_id)
    if not is_student and not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    weights = _get_or_create_weights(course_id)
    grade_data = _compute_student_grade(user.id, course, weights)
    grade_data['weights'] = weights.to_dict()
    return jsonify(grade_data), 200
