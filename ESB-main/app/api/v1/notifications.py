"""
Notifications API
=================
Computed notifications for the current user — no persistent DB table needed.
Derived from existing quiz/submission data.

Endpoints:
  GET /api/v1/notifications/me    — list notifications for the authenticated user
"""

from datetime import datetime, timedelta
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api.v1 import api_v1_bp
from app import db
from app.models import (
    User, Course, Enrollment,
    SectionQuiz, SectionQuizSubmission,
    TNSection,
)

# ─── Helper ───────────────────────────────────────────────────────────────────

def _chapter_course_id(section):
    """Walk section → chapter → course_id."""
    try:
        return section.chapter.course_id
    except Exception:
        return None


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@api_v1_bp.route('/notifications/me', methods=['GET'])
@jwt_required()
def get_my_notifications():
    """
    Returns a list of notifications for the authenticated user.

    For students:
      - quiz_pending  : published quiz in an enrolled course not yet submitted
      - grade_available : submission where teacher has validated open-ended grades
        (grading_status = 'graded')

    For teachers:
      - grading_needed : submissions waiting for teacher validation
        (grading_status = 'pending')
    """
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)

    notifications = []

    if user.is_teacher or user.is_superuser:
        # ── Teacher: find submissions waiting for grading ─────────────────────
        pending_subs = (
            SectionQuizSubmission.query
            .filter_by(grading_status='pending')
            .join(SectionQuiz, SectionQuizSubmission.quiz_id == SectionQuiz.id)
            .all()
        )

        for sub in pending_subs:
            quiz = sub.quiz if hasattr(sub, 'quiz') else SectionQuiz.query.get(sub.quiz_id)
            if not quiz:
                continue
            section = TNSection.query.get(quiz.section_id)
            course_id = _chapter_course_id(section) if section else None

            notifications.append({
                'id': f'grade_needed_{sub.id}',
                'type': 'grading_needed',
                'title': 'Correction requise',
                'message': f'Un étudiant attend la correction de « {quiz.title} ».',
                'quiz_id': quiz.id,
                'section_id': quiz.section_id,
                'submission_id': sub.id,
                'course_id': course_id,
                'created_at': sub.submitted_at.isoformat() if sub.submitted_at else None,
                'read': False,
            })

    else:
        # ── Student: quizzes to do ────────────────────────────────────────────
        enrolled_course_ids = [
            e.course_id
            for e in Enrollment.query.filter_by(student_id=user_id).all()
        ]

        if enrolled_course_ids:
            # All published section quizzes in enrolled courses
            published_quizzes = (
                SectionQuiz.query
                .filter_by(status='published')
                .all()
            )

            submitted_quiz_ids = {
                s.quiz_id
                for s in SectionQuizSubmission.query.filter_by(student_id=user_id).all()
            }

            for quiz in published_quizzes:
                section = TNSection.query.get(quiz.section_id)
                if not section:
                    continue
                course_id = _chapter_course_id(section)
                if course_id not in enrolled_course_ids:
                    continue

                if quiz.id not in submitted_quiz_ids:
                    # Get course title
                    course = Course.query.get(course_id)
                    course_title = course.title if course else ''
                    notifications.append({
                        'id': f'quiz_pending_{quiz.id}',
                        'type': 'quiz_pending',
                        'title': 'Quiz à faire',
                        'message': f'Le quiz « {quiz.title} » est disponible dans {course_title}.',
                        'quiz_id': quiz.id,
                        'section_id': quiz.section_id,
                        'course_id': course_id,
                        'created_at': quiz.created_at.isoformat() if quiz.created_at else None,
                        'read': False,
                    })

        # ── Student: grades now available ─────────────────────────────────────
        graded_subs = (
            SectionQuizSubmission.query
            .filter_by(student_id=user_id, grading_status='graded')
            .all()
        )

        for sub in graded_subs:
            quiz = SectionQuiz.query.get(sub.quiz_id)
            if not quiz:
                continue
            section = TNSection.query.get(quiz.section_id)
            course_id = _chapter_course_id(section) if section else None

            pct = round((sub.score / sub.max_score) * 100) if sub.max_score else 0
            notifications.append({
                'id': f'grade_available_{sub.id}',
                'type': 'grade_available',
                'title': 'Note disponible',
                'message': f'Votre note pour « {quiz.title} » : {sub.score:.1f}/{sub.max_score:.1f} ({pct}%).',
                'quiz_id': quiz.id,
                'section_id': quiz.section_id,
                'submission_id': sub.id,
                'course_id': course_id,
                'score': sub.score,
                'max_score': sub.max_score,
                'created_at': sub.submitted_at.isoformat() if sub.submitted_at else None,
                'read': False,
            })

    # Sort: most recent first
    notifications.sort(key=lambda n: n.get('created_at') or '', reverse=True)

    return jsonify({
        'notifications': notifications,
        'count': len(notifications),
        'unread': len([n for n in notifications if not n['read']]),
    })
