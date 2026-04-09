"""
Calendar API — /api/v1/calendar/
Aggregate upcoming activities for the current student.
"""

import logging
from datetime import datetime, date, timedelta
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.api.v1.utils import get_current_user
from app.models.courses import Course, Enrollment
from app.models.activities import SectionQuiz, SectionAssignment
from app.models.attendance import AttendanceSession

logger = logging.getLogger(__name__)

calendar_api_bp = Blueprint('calendar_api', __name__, url_prefix='/calendar')


@calendar_api_bp.route('/activities', methods=['GET'])
@jwt_required()
def get_activities():
    """Aggregate upcoming activities for the current student."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    today = date.today()
    activities = []

    # Get enrolled course IDs
    enrolled = Enrollment.query.filter_by(student_id=user.id).all()
    enrolled_course_ids = [e.course_id for e in enrolled]

    if not enrolled_course_ids:
        return jsonify({'activities': []})

    # 1. Upcoming attendance sessions
    att_sessions = (
        AttendanceSession.query
        .filter(
            AttendanceSession.course_id.in_(enrolled_course_ids),
            AttendanceSession.date >= today,
        )
        .order_by(AttendanceSession.date)
        .all()
    )
    for s in att_sessions:
        activities.append({
            'id': f'attendance-{s.id}',
            'title': s.title,
            'type': 'attendance',
            'date': s.date.isoformat() if s.date else None,
            'course_title': s.course.title if s.course else None,
            'description': f'Séance de cours — {s.title}',
        })

    # 2. Section quizzes with deadlines
    # SectionQuiz → section → chapter → course via TNSection
    quizzes = (
        SectionQuiz.query
        .filter(
            SectionQuiz.status == 'published',
            SectionQuiz.end_date >= datetime.utcnow(),
        )
        .order_by(SectionQuiz.end_date)
        .all()
    )
    for q in quizzes:
        # Resolve course title through section → chapter → syllabus → course
        course_title = _resolve_course_title_for_section(q.section_id, enrolled_course_ids)
        if course_title is None:
            continue
        activities.append({
            'id': f'quiz-{q.id}',
            'title': q.title,
            'type': 'quiz',
            'date': q.end_date.strftime('%Y-%m-%d') if q.end_date else None,
            'course_title': course_title,
            'description': f'Quiz — Date limite: {q.end_date.strftime("%d/%m/%Y %H:%M") if q.end_date else "N/A"}',
        })

    # 3. Assignments with deadlines
    assignments = (
        SectionAssignment.query
        .filter(
            SectionAssignment.deadline >= datetime.utcnow(),
        )
        .order_by(SectionAssignment.deadline)
        .all()
    )
    for a in assignments:
        course_title = _resolve_course_title_for_section(a.section_id, enrolled_course_ids)
        if course_title is None:
            continue
        activities.append({
            'id': f'assignment-{a.id}',
            'title': a.title,
            'type': 'assignment',
            'date': a.deadline.strftime('%Y-%m-%d') if a.deadline else None,
            'course_title': course_title,
            'description': a.description or f'Devoir — Date limite: {a.deadline.strftime("%d/%m/%Y %H:%M") if a.deadline else "N/A"}',
        })

    # 4. Validated exams that are available
    from app.models.exam_bank import ValidatedExam
    exams = (
        ValidatedExam.query
        .filter(
            ValidatedExam.course_id.in_(enrolled_course_ids),
            ValidatedExam.is_available == True,
            ValidatedExam.status == 'active',
        )
        .all()
    )
    for e in exams:
        activities.append({
            'id': f'exam-{e.id}',
            'title': e.title,
            'type': 'exam',
            'date': e.created_at.strftime('%Y-%m-%d') if e.created_at else today.isoformat(),
            'course_title': e.course.title if e.course else None,
            'description': e.description or f'Épreuve — {e.duration_minutes} min',
        })

    # Sort all activities by date
    activities.sort(key=lambda x: x.get('date') or '9999-12-31')

    return jsonify({'activities': activities})


def _resolve_course_title_for_section(section_id, enrolled_course_ids):
    """Resolve course title from a TNSection id, returning None if the
    student is not enrolled in the corresponding course."""
    from app.models.syllabus import TNSection, TNChapter, Syllabus

    section = TNSection.query.get(section_id)
    if not section:
        return None
    chapter = TNChapter.query.get(section.chapter_id)
    if not chapter:
        return None
    syllabus = Syllabus.query.get(chapter.syllabus_id)
    if not syllabus or syllabus.course_id not in enrolled_course_ids:
        return None
    course = Course.query.get(syllabus.course_id)
    return course.title if course else None
