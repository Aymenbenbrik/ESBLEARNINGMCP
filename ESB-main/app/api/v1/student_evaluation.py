"""
Student Evaluation API v1
Endpoints for AA-level (per module) and AAP-level (per formation) evaluation.
"""

from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func
from app import db
from app.models import (
    User, Course, Enrollment, Syllabus, TNAA, Program,
    SectionQuiz, SectionQuizQuestion, SectionQuizSubmission,
    QuestionBankQuestion, TNSectionAA, TNChapterAA,
)
from app.models.program_learning import (
    ProgramAAP, AAAapLink, StudentAAScore, StudentAAPScore,
)
import logging
import json

logger = logging.getLogger(__name__)

student_eval_bp = Blueprint('student_eval', __name__, url_prefix='/evaluation')


def _get_user():
    return User.query.get(int(get_jwt_identity()))


# ─── Calculate AA scores for a course ───────────────────────────────────────

def _calculate_aa_scores_for_student(student_id: int, course_id: int) -> list:
    """Calculate per-AA scores for a student in a course.
    
    Strategy: For each AA linked to a section, find quiz submissions for
    that section's quizzes. Weight by evaluation type (exam vs quiz).
    """
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus:
        return []

    aas = TNAA.query.filter_by(syllabus_id=syllabus.id).all()
    if not aas:
        return []

    scores = []
    for aa in aas:
        # Find sections linked to this AA
        section_links = TNSectionAA.query.filter_by(aa_id=aa.id).all()
        section_ids = [link.section_id for link in section_links]

        # Also check chapter-level AA links
        chapter_links = TNChapterAA.query.filter_by(aa_id=aa.id).all()
        for ch_link in chapter_links:
            try:
                chapter = ch_link.chapter
                if chapter:
                    for section in chapter.sections:
                        if section.id not in section_ids:
                            section_ids.append(section.id)
            except Exception:
                pass

        if not section_ids:
            scores.append({'aa_id': aa.id, 'aa_number': aa.number, 'score': None})
            continue

        # Find quizzes in those sections
        quizzes = SectionQuiz.query.filter(
            SectionQuiz.section_id.in_(section_ids),
            SectionQuiz.is_published == True,
        ).all()

        if not quizzes:
            scores.append({'aa_id': aa.id, 'aa_number': aa.number, 'score': None})
            continue

        # Get student's best submission for each quiz
        quiz_scores = []
        for quiz in quizzes:
            submission = SectionQuizSubmission.query.filter_by(
                quiz_id=quiz.id,
                student_id=student_id,
            ).order_by(SectionQuizSubmission.score.desc()).first()

            if submission and submission.score is not None:
                max_score = quiz.max_score or 20
                pct = (submission.score / max_score * 100) if max_score > 0 else 0
                quiz_scores.append(min(pct, 100))

        if quiz_scores:
            avg_score = sum(quiz_scores) / len(quiz_scores)
        else:
            avg_score = None

        scores.append({
            'aa_id': aa.id,
            'aa_number': aa.number,
            'score': round(avg_score, 1) if avg_score is not None else None,
        })

    return scores


@student_eval_bp.route('/courses/<int:course_id>/calculate-aa-scores', methods=['POST'])
@jwt_required()
def calculate_aa_scores(course_id):
    """Recalculate AA scores for all enrolled students in a course."""
    user = _get_user()
    course = Course.query.get_or_404(course_id)

    # Only teacher of this course or superuser
    if not ((user.is_superuser and not user.is_teacher) or (user.is_teacher and course.teacher_id == user.id)):
        return jsonify({'error': 'Access denied'}), 403

    enrollments = Enrollment.query.filter_by(course_id=course_id).all()
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus:
        return jsonify({'error': 'No syllabus found for this course'}), 400

    updated = 0
    for enrollment in enrollments:
        aa_scores = _calculate_aa_scores_for_student(enrollment.student_id, course_id)
        for item in aa_scores:
            if item['score'] is None:
                continue

            existing = StudentAAScore.query.filter_by(
                student_id=enrollment.student_id,
                aa_id=item['aa_id'],
                course_id=course_id,
            ).first()

            if existing:
                existing.score = item['score']
                existing.calculated_at = datetime.utcnow()
            else:
                db.session.add(StudentAAScore(
                    student_id=enrollment.student_id,
                    aa_id=item['aa_id'],
                    course_id=course_id,
                    score=item['score'],
                ))
            updated += 1

    db.session.commit()
    return jsonify({'message': f'{updated} AA scores calculated', 'count': updated}), 200


@student_eval_bp.route('/students/<int:student_id>/aa-scores', methods=['GET'])
@jwt_required()
def get_student_aa_scores(student_id):
    """Get AA scores for a student, optionally filtered by course."""
    user = _get_user()
    # Students can see their own, teachers and admins can see anyone
    if not (user.is_superuser or user.is_teacher or user.id == student_id):
        return jsonify({'error': 'Access denied'}), 403

    course_id = request.args.get('course_id', type=int)

    query = StudentAAScore.query.filter_by(student_id=student_id)
    if course_id:
        query = query.filter_by(course_id=course_id)

    scores = query.all()
    return jsonify({'scores': [s.to_dict() for s in scores]}), 200


@student_eval_bp.route('/courses/<int:course_id>/aa-evaluation', methods=['GET'])
@jwt_required()
def get_course_aa_evaluation(course_id):
    """Get AA evaluation matrix for all students in a course (teacher view)."""
    user = _get_user()
    course = Course.query.get_or_404(course_id)

    if not ((user.is_superuser and not user.is_teacher) or (user.is_teacher and course.teacher_id == user.id)):
        return jsonify({'error': 'Access denied'}), 403

    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus:
        return jsonify({'aas': [], 'students': []}), 200

    aas = TNAA.query.filter_by(syllabus_id=syllabus.id).order_by(TNAA.number).all()
    enrollments = Enrollment.query.filter_by(course_id=course_id).all()

    students_data = []
    for enrollment in enrollments:
        student = User.query.get(enrollment.student_id)
        if not student:
            continue

        scores = StudentAAScore.query.filter_by(
            student_id=student.id, course_id=course_id
        ).all()
        score_map = {s.aa_id: s.score for s in scores}

        students_data.append({
            'id': student.id,
            'username': student.username,
            'email': student.email,
            'scores': [score_map.get(aa.id) for aa in aas],
        })

    return jsonify({
        'aas': [{'id': aa.id, 'number': aa.number, 'description': aa.description} for aa in aas],
        'students': students_data,
    }), 200


# ─── AAP Evaluation (per formation) ─────────────────────────────────────────

def _calculate_aap_scores_for_student(student_id: int, program_id: int) -> list:
    """Calculate per-AAP scores for a student in a program.
    
    Aggregates AA scores via AA_AAP_Link relationships.
    """
    aaps = ProgramAAP.query.filter_by(program_id=program_id).order_by(ProgramAAP.order).all()
    if not aaps:
        return []

    scores = []
    for aap in aaps:
        # Find all AA linked to this AAP
        links = AAAapLink.query.filter_by(aap_id=aap.id).all()
        if not links:
            scores.append({'aap_id': aap.id, 'aap_code': aap.code, 'score': None})
            continue

        # Get AA scores for this student for all linked AAs
        aa_ids = [link.aa_id for link in links]
        aa_scores = StudentAAScore.query.filter(
            StudentAAScore.student_id == student_id,
            StudentAAScore.aa_id.in_(aa_ids),
        ).all()

        if aa_scores:
            avg = sum(s.score for s in aa_scores) / len(aa_scores)
            scores.append({'aap_id': aap.id, 'aap_code': aap.code, 'score': round(avg, 1)})
        else:
            scores.append({'aap_id': aap.id, 'aap_code': aap.code, 'score': None})

    return scores


@student_eval_bp.route('/programs/<int:program_id>/calculate-aap-scores', methods=['POST'])
@jwt_required()
def calculate_aap_scores(program_id):
    """Recalculate AAP scores for all students in a program."""
    user = _get_user()
    if not user.is_superuser:
        return jsonify({'error': 'Superuser access required'}), 403

    program = Program.query.get_or_404(program_id)

    # Find all students in this program's classes
    from app.models import Classe
    classes = Classe.query.filter_by(program_id=program_id).all()
    student_ids = set()
    for cls in classes:
        for student in cls.students.all():
            student_ids.add(student.id)

    updated = 0
    for sid in student_ids:
        aap_scores = _calculate_aap_scores_for_student(sid, program_id)
        for item in aap_scores:
            if item['score'] is None:
                continue

            existing = StudentAAPScore.query.filter_by(
                student_id=sid, aap_id=item['aap_id'], program_id=program_id,
            ).first()

            if existing:
                existing.score = item['score']
                existing.calculated_at = datetime.utcnow()
            else:
                db.session.add(StudentAAPScore(
                    student_id=sid, aap_id=item['aap_id'],
                    program_id=program_id, score=item['score'],
                ))
            updated += 1

    db.session.commit()
    return jsonify({'message': f'{updated} AAP scores calculated', 'count': updated}), 200


@student_eval_bp.route('/students/<int:student_id>/aap-scores', methods=['GET'])
@jwt_required()
def get_student_aap_scores(student_id):
    """Get AAP scores for a student, optionally filtered by program."""
    user = _get_user()
    if not (user.is_superuser or user.is_teacher or user.id == student_id):
        return jsonify({'error': 'Access denied'}), 403

    program_id = request.args.get('program_id', type=int)

    query = StudentAAPScore.query.filter_by(student_id=student_id)
    if program_id:
        query = query.filter_by(program_id=program_id)

    scores = query.all()
    return jsonify({'scores': [s.to_dict() for s in scores]}), 200


@student_eval_bp.route('/programs/<int:program_id>/aap-evaluation', methods=['GET'])
@jwt_required()
def get_program_aap_evaluation(program_id):
    """Get AAP evaluation matrix for all students in a program (admin view)."""
    user = _get_user()
    if not user.is_superuser:
        return jsonify({'error': 'Superuser access required'}), 403

    program = Program.query.get_or_404(program_id)
    aaps = ProgramAAP.query.filter_by(program_id=program_id).order_by(ProgramAAP.order).all()

    # Get students from program's classes
    from app.models import Classe
    classes = Classe.query.filter_by(program_id=program_id).all()
    students = set()
    for cls in classes:
        for s in cls.students.all():
            students.add(s)

    students_data = []
    for student in students:
        scores = StudentAAPScore.query.filter_by(
            student_id=student.id, program_id=program_id
        ).all()
        score_map = {s.aap_id: s.score for s in scores}

        students_data.append({
            'id': student.id,
            'username': student.username,
            'email': student.email,
            'class_name': student.classe.name if student.classe else None,
            'scores': [score_map.get(aap.id) for aap in aaps],
        })

    return jsonify({
        'aaps': [a.to_dict() for a in aaps],
        'students': students_data,
    }), 200
