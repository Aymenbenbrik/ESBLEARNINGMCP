"""
Attendance API  — présence par séance
=====================================
GET    /courses/<id>/attendance/sessions               list sessions (+ summary)
POST   /courses/<id>/attendance/sessions               create session
PUT    /courses/<id>/attendance/sessions/<sid>         update session (title/date)
DELETE /courses/<id>/attendance/sessions/<sid>         delete session
GET    /courses/<id>/attendance/sessions/<sid>/records  get records (fill absent if missing)
PUT    /courses/<id>/attendance/sessions/<sid>/records  bulk-save records
GET    /courses/<id>/attendance/my                     student: own attendance across sessions
"""
import logging
import json
from datetime import datetime, date as date_type

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api.v1 import api_v1_bp
from app import db
from app.models import User, Course, Enrollment, AttendanceSession, AttendanceRecord, Classe

logger = logging.getLogger(__name__)


def _course_access(course_id: int):
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    course = Course.query.get_or_404(course_id)
    is_teacher = bool(user.is_teacher and course.teacher_id == user.id) or bool(user.is_superuser)
    is_student = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())
    return user, course, is_teacher, is_student


def _enrolled_students(course_id: int, class_id: int | None = None):
    """Return enrolled students, optionally filtered by class."""
    enrollments = Enrollment.query.filter_by(course_id=course_id).all()
    students = [User.query.get(e.student_id) for e in enrollments]
    if class_id is not None:
        students = [s for s in students if s and s.class_id == class_id]
    return [s for s in students if s]


# ─── Sessions ─────────────────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/attendance/sessions', methods=['GET'])
@jwt_required()
def list_attendance_sessions(course_id):
    user, course, is_teacher, is_student = _course_access(course_id)
    if not is_teacher and not is_student:
        return jsonify({'error': 'Access denied'}), 403

    class_id = request.args.get('class_id', type=int)

    sessions_q = (AttendanceSession.query
                .filter_by(course_id=course_id)
                .order_by(AttendanceSession.date.desc()))
    if class_id is not None:
        sessions_q = sessions_q.filter_by(class_id=class_id)
    sessions = sessions_q.all()

    total_students = len(_enrolled_students(course_id, class_id))

    result = []
    for s in sessions:
        d = s.to_dict()
        d['total_students'] = total_students
        d['present_count'] = s.records.filter_by(status='present').count()
        d['late_count'] = s.records.filter_by(status='late').count()
        d['absent_count'] = s.records.filter_by(status='absent').count()
        result.append(d)

    return jsonify({'sessions': result, 'total_students': total_students}), 200


@api_v1_bp.route('/courses/<int:course_id>/attendance/sessions', methods=['POST'])
@jwt_required()
def create_attendance_session(course_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    try:
        session_date = date_type.fromisoformat(data.get('date', str(date_type.today())))
    except ValueError:
        return jsonify({'error': 'Invalid date format (YYYY-MM-DD)'}), 400

    class_id = data.get('class_id')
    if class_id is not None:
        class_id = int(class_id)
        if not Classe.query.get(class_id):
            return jsonify({'error': 'Class not found'}), 404

    session = AttendanceSession(course_id=course_id, title=title, date=session_date)
    if class_id is not None:
        session.class_id = class_id
    activities = data.get('activities_covered', [])
    session.activities_covered = json.dumps(activities) if activities else None
    db.session.add(session)
    db.session.flush()

    # Pre-populate records for enrolled students (filtered by class if provided)
    students = _enrolled_students(course_id, class_id)
    for s in students:
        db.session.add(AttendanceRecord(session_id=session.id, student_id=s.id, status='absent'))

    db.session.commit()

    d = session.to_dict(include_records=True)
    d['total_students'] = len(students)
    return jsonify({'session': d}), 201


@api_v1_bp.route('/courses/<int:course_id>/attendance/sessions/<int:session_id>', methods=['PUT'])
@jwt_required()
def update_attendance_session(course_id, session_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    session = AttendanceSession.query.filter_by(id=session_id, course_id=course_id).first_or_404()
    data = request.get_json() or {}
    if 'title' in data:
        session.title = data['title']
    if 'date' in data:
        try:
            session.date = date_type.fromisoformat(data['date'])
        except ValueError:
            return jsonify({'error': 'Invalid date'}), 400
    if 'activities_covered' in data:
        session.activities_covered = json.dumps(data['activities_covered']) if data['activities_covered'] else None
    db.session.commit()
    return jsonify({'session': session.to_dict()}), 200


@api_v1_bp.route('/courses/<int:course_id>/attendance/sessions/<int:session_id>', methods=['DELETE'])
@jwt_required()
def delete_attendance_session(course_id, session_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    session = AttendanceSession.query.filter_by(id=session_id, course_id=course_id).first_or_404()
    db.session.delete(session)
    db.session.commit()
    return jsonify({'message': 'Session supprimée'}), 200


# ─── Records ──────────────────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/attendance/sessions/<int:session_id>/records', methods=['GET'])
@jwt_required()
def get_session_records(course_id, session_id):
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    session = AttendanceSession.query.filter_by(id=session_id, course_id=course_id).first_or_404()
    class_id = request.args.get('class_id', type=int)
    students = _enrolled_students(course_id, class_id)

    records = []
    for student in students:
        rec = AttendanceRecord.query.filter_by(session_id=session_id, student_id=student.id).first()
        if rec:
            records.append(rec.to_dict())
        else:
            # Create missing record
            rec = AttendanceRecord(session_id=session_id, student_id=student.id, status='absent')
            db.session.add(rec)
            records.append(rec.to_dict())
    db.session.commit()

    return jsonify({'records': records, 'session': session.to_dict()}), 200


@api_v1_bp.route('/courses/<int:course_id>/attendance/sessions/<int:session_id>/records', methods=['PUT'])
@jwt_required()
def save_session_records(course_id, session_id):
    """Bulk save: body = {records: [{student_id, status}]}"""
    user, course, is_teacher, _ = _course_access(course_id)
    if not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    session = AttendanceSession.query.filter_by(id=session_id, course_id=course_id).first_or_404()
    data = request.get_json() or {}
    for item in data.get('records', []):
        sid = item.get('student_id')
        status = item.get('status', 'absent')
        if status not in ('present', 'late', 'absent'):
            continue
        rec = AttendanceRecord.query.filter_by(session_id=session_id, student_id=sid).first()
        if rec:
            rec.status = status
        else:
            db.session.add(AttendanceRecord(session_id=session_id, student_id=sid, status=status))

    db.session.commit()
    return jsonify({'session': session.to_dict(include_records=True)}), 200


# ─── Student own attendance ────────────────────────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/attendance/my', methods=['GET'])
@jwt_required()
def my_attendance(course_id):
    user, course, is_teacher, is_student = _course_access(course_id)
    if not is_student and not is_teacher:
        return jsonify({'error': 'Access denied'}), 403

    target_id = user.id
    sessions = (AttendanceSession.query
                .filter_by(course_id=course_id)
                .order_by(AttendanceSession.date.asc())
                .all())

    result = []
    for s in sessions:
        rec = AttendanceRecord.query.filter_by(session_id=s.id, student_id=target_id).first()
        result.append({
            'session_id': s.id,
            'title': s.title,
            'date': s.date.isoformat() if s.date else None,
            'status': rec.status if rec else 'absent',
        })

    total = len(result)
    present = sum(1 for r in result if r['status'] == 'present')
    late = sum(1 for r in result if r['status'] == 'late')
    return jsonify({
        'attendance': result,
        'summary': {
            'total': total,
            'present': present,
            'late': late,
            'absent': total - present - late,
            'rate': round((present + late * 0.5) / total * 100, 1) if total else 0,
        }
    }), 200


# ─── Course activities (for session planning) ─────────────────────────────────

@api_v1_bp.route('/courses/<int:course_id>/attendance/activities', methods=['GET'])
@jwt_required()
def list_course_activities(course_id):
    """Return all quizzes and assignments in the course, grouped by chapter/section."""
    user, course, is_teacher, is_student = _course_access(course_id)
    if not is_teacher and not is_student:
        return jsonify({'error': 'Access denied'}), 403

    from app.models import TnSyllabus, TnChapter, CourseSection, SectionQuiz, SectionAssignment

    activities = []

    try:
        syllabus = TnSyllabus.query.filter_by(course_id=course_id).first()
        if syllabus:
            chapters = TnChapter.query.filter_by(syllabus_id=syllabus.id).order_by(TnChapter.chapter_index).all()
            for ch in chapters:
                sections = CourseSection.query.filter_by(chapter_id=ch.id).order_by(CourseSection.section_index).all()
                for sec in sections:
                    # Quizzes
                    quizzes = SectionQuiz.query.filter_by(section_id=sec.id).all()
                    for q in quizzes:
                        activities.append({
                            'type': 'quiz',
                            'id': q.id,
                            'title': q.title or f'Quiz – {sec.title}',
                            'section_title': sec.title,
                            'chapter_title': ch.title,
                        })
                    # Assignments
                    assignments = SectionAssignment.query.filter_by(section_id=sec.id).all()
                    for a in assignments:
                        activities.append({
                            'type': 'assignment',
                            'id': a.id,
                            'title': a.title,
                            'section_title': sec.title,
                            'chapter_title': ch.title,
                        })
    except Exception as exc:
        logger.warning('list_course_activities error: %s', exc)

    return jsonify({'activities': activities}), 200
