"""Dashboards API v1

Provides aggregated analytics dashboards for:
- Programs (formation)
- Classes
- Students
- "My dashboard" (role-aware)

These endpoints are designed to power the Next.js dashboards UI.

Note: We intentionally reuse the same distribution shapes as the course dashboard:
  - bloom_distribution: [{ bloom_level, count, avg_score }]
  - difficulty_distribution: [{ difficulty, count, avg_score }]
  - aaa_distribution: [{ aaa_code, count, avg_score }]

Where "aaa_code" represents the question's `clo` tag:
- For BGA syllabi: usually CLO tags
- For TN syllabi: usually AAA/AAP-style tags
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, case
from typing import List, Optional

from app import db
from app.models import (
    Program,
    Classe,
    Course,
    User,
    Enrollment,
    Document,
    Chapter,
    Quiz,
    QuizQuestion,
    ClassCourseAssignment,
    TeacherStudent,
    CourseExam,
)
from app.api.v1.utils import get_current_user, superuser_required
import logging

logger = logging.getLogger(__name__)


dashboards_api_bp = Blueprint('dashboards_api', __name__, url_prefix='/dashboards')


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _quiz_doc_count_for_courses(course_ids: List[int]) -> int:
    if not course_ids:
        return 0
    try:
        return (
            Document.query
            .outerjoin(Chapter, Document.chapter_id == Chapter.id)
            .filter(
                ((Document.course_id.in_(course_ids)) | (Chapter.course_id.in_(course_ids))),
                Document.document_type == 'quiz',
            )
            .count()
        )
    except Exception as e:
        logger.error(f"Error counting quiz documents for courses {course_ids}: {e}")
        return 0


def _completed_quiz_query(course_ids: List[int], student_ids: Optional[List[int]] = None):
    if not course_ids:
        # empty query
        return db.session.query(Quiz.id).filter(db.text('1=0'))

    q = (
        db.session.query(Quiz.id)
        .select_from(Quiz)
        .join(Document, Quiz.document_id == Document.id)
        .outerjoin(Chapter, Document.chapter_id == Chapter.id)
        .filter(
            ((Document.course_id.in_(course_ids)) | (Chapter.course_id.in_(course_ids))),
            Quiz.completed_at.isnot(None),
        )
    )
    if student_ids:
        q = q.filter(Quiz.student_id.in_(student_ids))
    return q


def _completed_quiz_question_query(course_ids: List[int], student_ids: Optional[List[int]] = None):
    if not course_ids:
        return db.session.query(QuizQuestion).filter(db.text('1=0'))

    q = (
        db.session.query(QuizQuestion)
        .join(Quiz, QuizQuestion.quiz_id == Quiz.id)
        .join(Document, Quiz.document_id == Document.id)
        .outerjoin(Chapter, Document.chapter_id == Chapter.id)
        .filter(
            ((Document.course_id.in_(course_ids)) | (Chapter.course_id.in_(course_ids))),
            Quiz.completed_at.isnot(None),
        )
    )
    if student_ids:
        q = q.filter(Quiz.student_id.in_(student_ids))
    return q


def _distribution_from_questions(base_query, label_expr, key_name: str, preferred_order: Optional[List[str]] = None):
    try:
        correct_sum = func.sum(case((QuizQuestion.is_correct.is_(True), 1), else_=0))
        total_count = func.count(QuizQuestion.id)
        avg_score_expr = (correct_sum * 100.0) / func.nullif(total_count, 0)

        rows = (
            base_query
            .with_entities(
                label_expr.label(key_name),
                total_count.label('count'),
                func.coalesce(avg_score_expr, 0.0).label('avg_score'),
            )
            .group_by(label_expr)
            .all()
        )

        items: List[dict] = []
        for label, count, avg_score in rows:
            if label is None or str(label).strip() == '':
                label = 'unknown'
            items.append({
                key_name: str(label),
                'count': int(count or 0),
                'avg_score': float(avg_score or 0.0),
            })

        if preferred_order:
            order_index = {str(v).lower(): i for i, v in enumerate(preferred_order)}
            items.sort(key=lambda x: (order_index.get(str(x[key_name]).lower(), 999), -x['count']))
        else:
            items.sort(key=lambda x: (-x['count'], str(x[key_name]).lower()))

        return items
    except Exception as e:
        logger.error(f"Error computing distribution {key_name}: {e}")
        return []


def _compute_common_dashboard(course_ids: List[int], total_students: int, student_ids: Optional[List[int]] = None):
    """Compute the common dashboard payload used by program/class dashboards."""
    total_quiz_docs = _quiz_doc_count_for_courses(course_ids)

    completed_q = _completed_quiz_query(course_ids, student_ids=student_ids)
    completed_count = completed_q.count()

    total_questions_answered = (
        _completed_quiz_question_query(course_ids, student_ids=student_ids)
        .with_entities(func.count(QuizQuestion.id))
        .scalar()
    ) or 0

    avg_score = (
        completed_q
        .with_entities(func.avg(Quiz.score))
        .scalar()
    )
    avg_score = float(avg_score or 0.0)

    denom = float(total_students * total_quiz_docs)
    completion_rate = (float(completed_count) / denom * 100.0) if denom > 0 else 0.0

    stats = {
        'total_students': int(total_students),
        'total_quizzes': int(total_quiz_docs),
        'total_questions': int(total_questions_answered),
        'avg_score': round(avg_score, 2),
        'completion_rate': round(completion_rate, 2),
    }

    base_questions = _completed_quiz_question_query(course_ids, student_ids=student_ids)

    bloom_distribution = _distribution_from_questions(
        base_questions,
        func.lower(func.coalesce(QuizQuestion.bloom_level, 'unknown')),
        key_name='bloom_level',
        preferred_order=['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create', 'unknown'],
    )

    difficulty_distribution = _distribution_from_questions(
        base_questions,
        func.lower(func.coalesce(QuizQuestion.difficulty, 'unknown')),
        key_name='difficulty',
        preferred_order=['easy', 'medium', 'hard', 'unknown'],
    )

    aaa_distribution = _distribution_from_questions(
        base_questions,
        func.coalesce(QuizQuestion.clo, 'unknown'),
        key_name='aaa_code',
    )

    recent_rows = (
        completed_q
        .join(User, Quiz.student_id == User.id)
        .with_entities(Quiz.id, User.username, Quiz.score, Quiz.completed_at)
        .order_by(Quiz.completed_at.desc())
        .limit(10)
        .all()
    )
    recent_quizzes = [
        {
            'id': int(qid),
            'student_name': uname,
            'score': float(score or 0.0),
            'completed_at': completed_at.isoformat() if completed_at else None,
        }
        for qid, uname, score, completed_at in recent_rows
    ]

    return {
        'stats': stats,
        'bloom_distribution': bloom_distribution,
        'difficulty_distribution': difficulty_distribution,
        'aaa_distribution': aaa_distribution,
        'recent_quizzes': recent_quizzes,
    }


def _course_ids_for_class(classe: Classe) -> List[int]:
    assignments = ClassCourseAssignment.query.filter_by(class_id=classe.id).all()
    if assignments:
        return sorted({a.course_id for a in assignments})
    if classe.program_id and classe.program:
        return [c.id for c in classe.program.courses]
    return []


def _user_can_access_class(user: User, class_id: int) -> bool:
    if user.is_superuser:
        return True
    if not user.is_teacher:
        return user.class_id == class_id

    # teacher: either assigned to the class or owns a course assigned to the class
    if ClassCourseAssignment.query.filter_by(class_id=class_id, teacher_id=user.id).first():
        return True

    # Fallback: teacher owns a course that is assigned to this class
    assigned_course_ids = [a.course_id for a in ClassCourseAssignment.query.filter_by(class_id=class_id).all()]
    if assigned_course_ids and Course.query.filter(Course.id.in_(assigned_course_ids), Course.teacher_id == user.id).first():
        return True

    return False


def _user_can_access_student(user: User, student_id: int) -> bool:
    if user.is_superuser:
        return True
    if user.id == student_id:
        return True

    if user.is_teacher:
        # teacher-student roster link
        if TeacherStudent.query.filter_by(teacher_id=user.id, student_id=student_id).first():
            return True

        # or teacher is assigned to student's class
        student = User.query.get(student_id)
        if student and student.class_id:
            if ClassCourseAssignment.query.filter_by(class_id=student.class_id, teacher_id=user.id).first():
                return True

    return False


# ---------------------------------------------------------------------------
# Exam stats helper
# ---------------------------------------------------------------------------


def _compute_exam_stats(course_ids: List[int]) -> dict:
    """Aggregate exam/épreuve KPIs across a list of course IDs."""
    if not course_ids:
        return _empty_exam_stats()

    exams = CourseExam.query.filter(CourseExam.course_id.in_(course_ids)).all()
    if not exams:
        return _empty_exam_stats()

    total = len(exams)
    analyzed = [e for e in exams if e.status == 'done' and e.ai_evaluation]

    by_type: dict = {}
    for e in exams:
        t = e.exam_type or 'examen'
        by_type[t] = by_type.get(t, 0) + 1

    scores, aa_coverages, practical_count = [], [], 0
    for e in analyzed:
        ev = e.ai_evaluation or {}
        s = ev.get('overall_score')
        if s is not None:
            try:
                scores.append(float(s))
            except (TypeError, ValueError):
                pass

        aa_list = ev.get('aa_alignment') or []
        if aa_list:
            covered = sum(1 for a in aa_list if a.get('covered'))
            aa_coverages.append(round(covered / len(aa_list) * 100, 1))

        if ev.get('has_practical_questions'):
            practical_count += 1

    return {
        'total_exams': total,
        'exams_analyzed': len(analyzed),
        'by_type': by_type,
        'avg_overall_score': round(sum(scores) / len(scores), 2) if scores else None,
        'avg_aa_coverage': round(sum(aa_coverages) / len(aa_coverages), 1) if aa_coverages else None,
        'practical_exams_count': practical_count,
        'exams': [_exam_summary(e) for e in exams],
    }


def _empty_exam_stats() -> dict:
    return {
        'total_exams': 0, 'exams_analyzed': 0, 'by_type': {},
        'avg_overall_score': None, 'avg_aa_coverage': None,
        'practical_exams_count': 0, 'exams': [],
    }


def _exam_summary(e: 'CourseExam') -> dict:
    ev = e.ai_evaluation or {}
    aa_list = ev.get('aa_alignment') or []
    covered = sum(1 for a in aa_list if a.get('covered'))
    aa_coverage = round(covered / len(aa_list) * 100, 1) if aa_list else None
    return {
        'id': e.id,
        'course_id': e.course_id,
        'original_name': e.original_name,
        'exam_type': e.exam_type,
        'weight': e.weight,
        'status': e.status,
        'overall_score': ev.get('overall_score'),
        'questions_count': ev.get('questions_count'),
        'has_practical_questions': ev.get('has_practical_questions', False),
        'aa_coverage': aa_coverage,
        'bloom_distribution': ev.get('bloom_distribution'),
        'created_at': e.created_at.isoformat() if e.created_at else None,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@dashboards_api_bp.route('/me', methods=['GET'])
@jwt_required()
def get_my_dashboard():
    """Role-aware dashboard for the current user."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Student dashboard
    if (not user.is_teacher) and (not user.is_superuser):
        return _student_dashboard_payload(user.id)

    # Teacher or superuser: show overview across courses
    if user.is_superuser:
        course_ids = [c.id for c in Course.query.all()]
        label = 'global'
    else:
        owned_course_ids = [c.id for c in Course.query.filter_by(teacher_id=user.id).all()]
        assigned_course_ids = [a.course_id for a in ClassCourseAssignment.query.filter_by(teacher_id=user.id).all()]
        course_ids = sorted(set(owned_course_ids + assigned_course_ids))
        label = 'teacher'

    # Unique students across those courses
    total_students = 0
    if course_ids:
        total_students = (
            db.session.query(func.count(func.distinct(Enrollment.student_id)))
            .filter(Enrollment.course_id.in_(course_ids))
            .scalar()
        ) or 0

    payload = _compute_common_dashboard(course_ids=course_ids, total_students=int(total_students))
    exam_stats = _compute_exam_stats(course_ids)

    # Per-course quick cards (small subset)
    courses_data = []
    for c in Course.query.filter(Course.id.in_(course_ids)).order_by(Course.title).all():
        c_students = Enrollment.query.filter_by(course_id=c.id).count()
        c_payload = _compute_common_dashboard(course_ids=[c.id], total_students=int(c_students))
        c_exam_stats = _compute_exam_stats([c.id])
        courses_data.append({
            'id': c.id,
            'title': c.title,
            'description': c.description,
            'stats': c_payload['stats'],
            'exam_stats': c_exam_stats,
        })

    return jsonify({
        'kind': label,
        'user': {
            'id': user.id,
            'username': user.username,
            'is_teacher': user.is_teacher,
            'is_superuser': user.is_superuser,
        },
        **payload,
        'exam_stats': exam_stats,
        'courses': courses_data,
    }), 200


@dashboards_api_bp.route('/program/<int:program_id>', methods=['GET'])
@jwt_required()
@superuser_required
def get_program_dashboard(program_id: int):
    program = Program.query.get_or_404(program_id)

    course_ids = [c.id for c in program.courses]

    # Students in all classes of the program
    total_students = (
        User.query
        .join(Classe, User.class_id == Classe.id)
        .filter(
            Classe.program_id == program_id,
            User.is_teacher.is_(False),
            User.is_superuser.is_(False),
        )
        .count()
    )

    payload = _compute_common_dashboard(course_ids=course_ids, total_students=int(total_students))

    return jsonify({
        'program': {
            'id': program.id,
            'name': program.name,
            'description': program.description,
            'courses_count': len(program.courses),
            'classes_count': program.classes.count() if hasattr(program.classes, 'count') else len(program.classes),
        },
        **payload,
    }), 200


@dashboards_api_bp.route('/class/<int:class_id>', methods=['GET'])
@jwt_required()
def get_class_dashboard(class_id: int):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not _user_can_access_class(user, class_id):
        return jsonify({'error': 'Access denied'}), 403

    classe = Classe.query.get_or_404(class_id)
    course_ids = _course_ids_for_class(classe)

    # Students in this class (used for aggregation; do NOT expose personal data to students)
    students = (
        User.query
        .filter(
            User.class_id == class_id,
            User.is_teacher.is_(False),
            User.is_superuser.is_(False),
        )
        .order_by(User.username)
        .all()
    )
    student_ids = [s.id for s in students]

    include_sensitive = bool(user.is_teacher or user.is_superuser)

    payload = _compute_common_dashboard(
        course_ids=course_ids,
        total_students=len(student_ids),
        student_ids=student_ids,
    )

    # Students should not see other students' scores/names in a class dashboard.
    if not include_sensitive:
        payload['recent_quizzes'] = []

    per_student = []
    if include_sensitive:
        # Per-student performance table (teachers/admin only)
        per_student_rows = (
            _completed_quiz_query(course_ids, student_ids=student_ids)
            .with_entities(
                Quiz.student_id,
                func.count(Quiz.id).label('quizzes_completed'),
                func.avg(Quiz.score).label('avg_score'),
            )
            .group_by(Quiz.student_id)
            .all()
        )
        per_student_map = {sid: {'quizzes_completed': int(qc), 'avg_score': float(avg or 0.0)} for sid, qc, avg in per_student_rows}

        for s in students:
            d = per_student_map.get(s.id, {'quizzes_completed': 0, 'avg_score': 0.0})
            per_student.append({
                'id': s.id,
                'username': s.username,
                # email omitted on purpose (PII)
                'quizzes_completed': d['quizzes_completed'],
                'avg_score': round(d['avg_score'], 2),
            })

    return jsonify({
        'class': {
            'id': classe.id,
            'name': classe.name,
            'program_id': classe.program_id,
            'program_name': classe.program.name if classe.program else None,
            'courses_count': len(course_ids),
            'students_count': len(student_ids),
        },
        **payload,
        'students': per_student,
    }), 200


@dashboards_api_bp.route('/student/<int:student_id>', methods=['GET'])
@jwt_required()
def get_student_dashboard(student_id: int):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not _user_can_access_student(user, student_id):
        return jsonify({'error': 'Access denied'}), 403

    return _student_dashboard_payload(student_id)


# ---------------------------------------------------------------------------
# Student dashboard payload
# ---------------------------------------------------------------------------


def _student_dashboard_payload(student_id: int):
    student = User.query.get_or_404(student_id)

    enrollments = Enrollment.query.filter_by(student_id=student_id).all()
    course_ids = [e.course_id for e in enrollments]

    total_courses = len(course_ids)
    total_quiz_docs = _quiz_doc_count_for_courses(course_ids)

    completed_q = _completed_quiz_query(course_ids, student_ids=[student_id])
    quizzes_completed = completed_q.count()

    total_questions_answered = (
        _completed_quiz_question_query(course_ids, student_ids=[student_id])
        .with_entities(func.count(QuizQuestion.id))
        .scalar()
    ) or 0

    avg_score = (
        completed_q
        .with_entities(func.avg(Quiz.score))
        .scalar()
    )
    avg_score = float(avg_score or 0.0)

    denom = float(total_quiz_docs) if total_quiz_docs > 0 else 0.0
    completion_rate = (float(quizzes_completed) / denom * 100.0) if denom > 0 else 0.0

    stats = {
        'total_courses': int(total_courses),
        'total_quizzes': int(total_quiz_docs),
        'quizzes_completed': int(quizzes_completed),
        'total_questions': int(total_questions_answered),
        'avg_score': round(avg_score, 2),
        'completion_rate': round(completion_rate, 2),
    }

    base_questions = _completed_quiz_question_query(course_ids, student_ids=[student_id])

    bloom_distribution = _distribution_from_questions(
        base_questions,
        func.lower(func.coalesce(QuizQuestion.bloom_level, 'unknown')),
        key_name='bloom_level',
        preferred_order=['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create', 'unknown'],
    )

    difficulty_distribution = _distribution_from_questions(
        base_questions,
        func.lower(func.coalesce(QuizQuestion.difficulty, 'unknown')),
        key_name='difficulty',
        preferred_order=['easy', 'medium', 'hard', 'unknown'],
    )

    aaa_distribution = _distribution_from_questions(
        base_questions,
        func.coalesce(QuizQuestion.clo, 'unknown'),
        key_name='aaa_code',
    )

    recent_rows = (
        completed_q
        .with_entities(Quiz.id, Quiz.score, Quiz.completed_at, Quiz.document_id)
        .order_by(Quiz.completed_at.desc())
        .limit(10)
        .all()
    )

    # Resolve document titles for recent quizzes (best effort)
    doc_ids = [r[3] for r in recent_rows if r[3]]
    doc_map = {}
    if doc_ids:
        for d in Document.query.filter(Document.id.in_(doc_ids)).all():
            doc_map[d.id] = d.title

    recent_quizzes = [
        {
            'id': int(qid),
            'student_name': student.username,
            'score': float(score or 0.0),
            'completed_at': completed_at.isoformat() if completed_at else None,
            'quiz_title': doc_map.get(doc_id),
        }
        for qid, score, completed_at, doc_id in recent_rows
    ]

    # Per-course progress
    by_course = []
    for c in Course.query.filter(Course.id.in_(course_ids)).order_by(Course.title).all():
        c_total_quiz_docs = _quiz_doc_count_for_courses([c.id])
        c_completed = _completed_quiz_query([c.id], student_ids=[student_id])
        c_completed_count = c_completed.count()
        c_avg = c_completed.with_entities(func.avg(Quiz.score)).scalar()
        c_avg = float(c_avg or 0.0)
        c_completion = (float(c_completed_count) / float(c_total_quiz_docs) * 100.0) if c_total_quiz_docs > 0 else 0.0

        by_course.append({
            'id': c.id,
            'title': c.title,
            'total_quizzes': int(c_total_quiz_docs),
            'quizzes_completed': int(c_completed_count),
            'avg_score': round(c_avg, 2),
            'completion_rate': round(c_completion, 2),
        })

    return jsonify({
        'student': {
            'id': student.id,
            'username': student.username,
            'email': student.email,
            'class_id': student.class_id,
        },
        'stats': stats,
        'bloom_distribution': bloom_distribution,
        'difficulty_distribution': difficulty_distribution,
        'aaa_distribution': aaa_distribution,
        'recent_quizzes': recent_quizzes,
        'courses': by_course,
    }), 200
