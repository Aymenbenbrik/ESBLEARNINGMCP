"""
Progress tracking API — /api/v1/progress/
Computes and returns student progression per course and per chapter.
"""
import logging
from datetime import datetime
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from app import db
from app.models.users import User
from app.models.courses import Course, Chapter, Enrollment
from app.models.documents import Document
from app.models.assessments import Quiz, QuizQuestion
from app.models.progress import ChapterProgress, CourseProgressSnapshot

logger = logging.getLogger(__name__)

progress_api_bp = Blueprint('progress_api', __name__, url_prefix='/progress')


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_current_user():
    user_id = int(get_jwt_identity())
    return User.query.get(user_id)


def _recompute_course_snapshot(student_id: int, course_id: int) -> CourseProgressSnapshot:
    """Recompute the overall course progress snapshot from chapter-level data."""
    course = Course.query.get(course_id)
    if not course:
        return None

    chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).all()
    chapter_ids = [ch.id for ch in chapters]

    # Get or create snapshot
    snap = CourseProgressSnapshot.query.filter_by(
        student_id=student_id, course_id=course_id
    ).first()
    if not snap:
        snap = CourseProgressSnapshot(student_id=student_id, course_id=course_id)
        db.session.add(snap)

    snap.chapters_total = len(chapters)

    if not chapter_ids:
        snap.chapters_visited = 0
        snap.chapters_completed = 0
        snap.quizzes_total = 0
        snap.quizzes_completed = 0
        snap.quizzes_avg_score = 0.0
        snap.tps_total = 0
        snap.tps_submitted = 0
        snap.documents_total = 0
        snap.documents_opened = 0
        snap.overall_progress = 0.0
        snap.computed_at = datetime.utcnow()
        db.session.commit()
        return snap

    # Aggregate from chapter progress records
    cp_records = ChapterProgress.query.filter(
        ChapterProgress.student_id == student_id,
        ChapterProgress.course_id == course_id,
    ).all()

    cp_map = {cp.chapter_id: cp for cp in cp_records}

    visited = 0
    completed = 0
    total_docs = 0
    opened_docs = 0
    quiz_done = 0
    quiz_total_count = 0
    quiz_scores = []
    tp_done = 0
    tp_total = 0
    last_act = None

    for ch in chapters:
        cp = cp_map.get(ch.id)

        # Count documents in this chapter
        doc_count = Document.query.filter_by(chapter_id=ch.id).count()
        total_docs += doc_count

        # Count quizzes for this chapter (documents with quiz data)
        quiz_docs = Document.query.filter(
            Document.chapter_id == ch.id,
            Document.document_type == 'quiz'
        ).count()
        quiz_total_count += max(quiz_docs, 0)

        if cp:
            if cp.visited:
                visited += 1
            opened_docs += cp.documents_opened
            if cp.quiz_completed:
                quiz_done += 1
                if cp.quiz_score is not None:
                    quiz_scores.append(cp.quiz_score)
            if cp.tp_submitted:
                tp_done += 1
            if cp.progress_percent >= 100:
                completed += 1
            if cp.last_accessed:
                if last_act is None or cp.last_accessed > last_act:
                    last_act = cp.last_accessed

    # Also count quizzes from quiz model directly
    completed_quizzes = Quiz.query.join(Document, Quiz.document_id == Document.id).filter(
        Quiz.student_id == student_id,
        Quiz.completed_at.isnot(None),
        (Document.course_id == course_id) | (Document.chapter_id.in_(chapter_ids))
    ).all()

    for q in completed_quizzes:
        if q.score is not None:
            quiz_scores.append(q.score)

    snap.chapters_visited = visited
    snap.chapters_completed = completed
    snap.documents_total = total_docs
    snap.documents_opened = opened_docs
    snap.quizzes_total = max(quiz_total_count, len(completed_quizzes))
    snap.quizzes_completed = max(quiz_done, len(completed_quizzes))
    snap.quizzes_avg_score = round(sum(quiz_scores) / len(quiz_scores), 1) if quiz_scores else 0.0
    snap.tps_total = tp_total
    snap.tps_submitted = tp_done
    snap.last_activity = last_act

    # Overall progress: weighted average of chapter progresses
    if cp_records:
        total_pct = sum(cp.progress_percent for cp in cp_records)
        snap.overall_progress = round(total_pct / len(chapters), 1)
    else:
        snap.overall_progress = 0.0

    snap.computed_at = datetime.utcnow()
    db.session.commit()
    return snap


# ─── Routes ───────────────────────────────────────────────────────────────────

@progress_api_bp.route('/my', methods=['GET'])
@jwt_required()
def get_my_progress_all():
    """Get progress overview for all enrolled courses of the current student."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    enrollments = Enrollment.query.filter_by(student_id=user.id).all()
    results = []

    for enrollment in enrollments:
        snap = _recompute_course_snapshot(user.id, enrollment.course_id)
        if snap:
            course = Course.query.get(enrollment.course_id)
            d = snap.to_dict()
            d['course_title'] = course.title if course else 'Unknown'
            results.append(d)

    return jsonify({'progress': results}), 200


@progress_api_bp.route('/my/<int:course_id>', methods=['GET'])
@jwt_required()
def get_my_course_progress(course_id: int):
    """Get detailed progress for a specific course (current student)."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    # Recompute snapshot
    snap = _recompute_course_snapshot(user.id, course_id)

    # Get chapter-level details
    chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).all()
    chapter_progress = []

    for ch in chapters:
        cp = ChapterProgress.query.filter_by(
            student_id=user.id, chapter_id=ch.id
        ).first()

        if cp:
            chapter_progress.append(cp.to_dict())
        else:
            # Return default (not started) entry
            doc_count = Document.query.filter_by(chapter_id=ch.id).count()
            chapter_progress.append({
                'chapter_id': ch.id,
                'chapter_title': ch.title,
                'chapter_order': ch.order,
                'visited': False,
                'visited_at': None,
                'documents_opened': 0,
                'documents_total': doc_count,
                'quiz_completed': False,
                'quiz_score': None,
                'tp_submitted': False,
                'progress_percent': 0.0,
                'last_accessed': None,
                'status': 'not_started',
            })

    # Add status field
    for cp in chapter_progress:
        if 'status' not in cp:
            pct = cp.get('progress_percent', 0)
            if pct >= 100:
                cp['status'] = 'completed'
            elif pct > 0:
                cp['status'] = 'in_progress'
            else:
                cp['status'] = 'not_started'

    return jsonify({
        'course': {
            'id': course.id,
            'title': course.title,
        },
        'snapshot': snap.to_dict() if snap else None,
        'chapters': chapter_progress,
    }), 200


@progress_api_bp.route('/track', methods=['POST'])
@jwt_required()
def track_progress():
    """Record a progress event (chapter visit, document open, etc.)."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    action = data.get('action')
    chapter_id = data.get('chapter_id')
    course_id = data.get('course_id')

    if not action or not chapter_id:
        return jsonify({'error': 'action and chapter_id are required'}), 400

    chapter = Chapter.query.get(chapter_id)
    if not chapter:
        return jsonify({'error': 'Chapter not found'}), 404

    if not course_id:
        course_id = chapter.course_id

    # Get or create chapter progress
    cp = ChapterProgress.query.filter_by(
        student_id=user.id, chapter_id=chapter_id
    ).first()

    if not cp:
        doc_count = Document.query.filter_by(chapter_id=chapter_id).count()
        cp = ChapterProgress(
            student_id=user.id,
            chapter_id=chapter_id,
            course_id=course_id,
            documents_total=doc_count,
        )
        db.session.add(cp)

    now = datetime.utcnow()

    if action == 'visit_chapter':
        cp.visited = True
        cp.visited_at = cp.visited_at or now

    elif action == 'open_document':
        cp.visited = True
        cp.visited_at = cp.visited_at or now
        # Refresh total docs count
        cp.documents_total = Document.query.filter_by(chapter_id=chapter_id).count()
        cp.documents_opened = min(cp.documents_opened + 1, cp.documents_total)

    elif action == 'complete_quiz':
        cp.quiz_completed = True
        cp.quiz_score = data.get('score')

    elif action == 'submit_tp':
        cp.tp_submitted = True

    else:
        return jsonify({'error': f'Unknown action: {action}'}), 400

    cp.last_accessed = now
    cp.compute_progress()
    db.session.commit()

    return jsonify({
        'message': 'Progress recorded',
        'chapter_progress': cp.to_dict(),
    }), 200


@progress_api_bp.route('/course/<int:course_id>/students', methods=['GET'])
@jwt_required()
def get_course_students_progress(course_id: int):
    """Teacher view: get all students' progress for a course."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not user.is_teacher and not user.is_superuser:
        return jsonify({'error': 'Access denied'}), 403

    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    # Get all enrolled students
    enrollments = Enrollment.query.filter_by(course_id=course_id).all()
    students_progress = []

    for enrollment in enrollments:
        student = User.query.get(enrollment.student_id)
        if not student:
            continue

        snap = _recompute_course_snapshot(student.id, course_id)
        if snap:
            d = snap.to_dict()
            d['student_name'] = student.username
            d['student_email'] = student.email
            d['enrolled_at'] = enrollment.enrolled_at.isoformat() if enrollment.enrolled_at else None
            students_progress.append(d)

    # Sort by overall progress descending
    students_progress.sort(key=lambda x: x.get('overall_progress', 0), reverse=True)

    return jsonify({
        'course': {'id': course.id, 'title': course.title},
        'students': students_progress,
    }), 200
