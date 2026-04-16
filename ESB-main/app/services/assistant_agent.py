"""
assistant_agent.py — Agentic AI Assistant for the ESB-Learning platform.

Uses LangGraph ReAct agent with Gemini function-calling to provide a
conversational assistant that adapts to user role (student / teacher / admin)
and communicates in French, English, or Tunisian dialect.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional

from flask import current_app
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from app import db

logger = logging.getLogger(__name__)


# ── LLM helper ───────────────────────────────────────────────────────────────

def _get_llm():
    """Get a Gemini LLM instance configured from Flask app config."""
    api_key = current_app.config.get('GOOGLE_API_KEY')
    model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.4,
    )


# ── JSON serialization helper ────────────────────────────────────────────────

def _safe_json(obj: Any, max_items: int = 50) -> str:
    """Serialize *obj* to a JSON string, truncating long lists."""
    def _default(o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        return str(o)

    if isinstance(obj, list) and len(obj) > max_items:
        obj = obj[:max_items]
    try:
        return json.dumps(obj, ensure_ascii=False, default=_default, indent=1)
    except Exception:
        return str(obj)


# ══════════════════════════════════════════════════════════════════════════════
# TOOLS — All Roles
# ══════════════════════════════════════════════════════════════════════════════

@tool
def get_my_courses(user_id: int) -> str:
    """Get the list of courses the user is enrolled in or teaches."""
    try:
        from app.models.users import User
        from app.models.courses import Course, Enrollment

        user = User.query.get(user_id)
        if not user:
            return "User not found."

        courses = []
        if user.is_teacher or user.is_superuser:
            taught = Course.query.filter_by(teacher_id=user_id).all()
            for c in taught:
                student_count = c.enrollments.count()
                courses.append({
                    'course_id': c.id,
                    'title': c.title,
                    'role': 'teacher',
                    'students_enrolled': student_count,
                    'chapters': c.chapters_count,
                })

        enrollments = Enrollment.query.filter_by(student_id=user_id).all()
        for e in enrollments:
            c = Course.query.get(e.course_id)
            if c:
                courses.append({
                    'course_id': c.id,
                    'title': c.title,
                    'role': 'student',
                    'enrolled_at': e.enrolled_at.isoformat() if e.enrolled_at else None,
                })

        if not courses:
            return "No courses found for this user."
        return _safe_json(courses)
    except Exception as e:
        logger.error(f"get_my_courses error: {e}")
        return f"Error retrieving courses: {e}"


@tool
def get_calendar_activities(user_id: int) -> str:
    """Get upcoming activities (quizzes, exams, assignments, sessions) for this user."""
    try:
        from app.models.users import User
        from app.models.courses import Course, Enrollment
        from app.models.activities import SectionQuiz, SectionAssignment
        from app.models.attendance import AttendanceSession

        user = User.query.get(user_id)
        if not user:
            return "User not found."

        today = date.today()
        activities: list[dict] = []

        # Determine relevant course IDs
        course_ids: list[int] = []
        if user.is_teacher or user.is_superuser:
            taught = Course.query.filter_by(teacher_id=user_id).all()
            course_ids.extend(c.id for c in taught)
        enrollments = Enrollment.query.filter_by(student_id=user_id).all()
        course_ids.extend(e.course_id for e in enrollments)
        course_ids = list(set(course_ids))

        if not course_ids:
            return "No upcoming activities (not enrolled in any courses)."

        # Attendance sessions
        att_sessions = (
            AttendanceSession.query
            .filter(
                AttendanceSession.course_id.in_(course_ids),
                AttendanceSession.date >= today,
            )
            .order_by(AttendanceSession.date)
            .limit(20)
            .all()
        )
        for s in att_sessions:
            activities.append({
                'type': 'session',
                'title': s.title,
                'date': s.date.isoformat() if s.date else None,
                'course': s.course.title if s.course else None,
            })

        # Section quizzes with upcoming deadlines
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
            course_title = _resolve_course_for_section(q.section_id, course_ids)
            if course_title is None:
                continue
            activities.append({
                'type': 'quiz',
                'title': q.title,
                'deadline': q.end_date.isoformat() if q.end_date else None,
                'course': course_title,
            })

        # Assignments with upcoming deadlines
        assignments = (
            SectionAssignment.query
            .filter(SectionAssignment.deadline >= datetime.utcnow())
            .order_by(SectionAssignment.deadline)
            .all()
        )
        for a in assignments:
            course_title = _resolve_course_for_section(a.section_id, course_ids)
            if course_title is None:
                continue
            activities.append({
                'type': 'assignment',
                'title': a.title,
                'deadline': a.deadline.isoformat() if a.deadline else None,
                'course': course_title,
            })

        # Validated exams
        try:
            from app.models.exam_bank import ValidatedExam
            exams = (
                ValidatedExam.query
                .filter(
                    ValidatedExam.course_id.in_(course_ids),
                    ValidatedExam.is_available == True,
                    ValidatedExam.status == 'active',
                )
                .all()
            )
            for ex in exams:
                activities.append({
                    'type': 'exam',
                    'title': ex.title,
                    'course': ex.course.title if ex.course else None,
                    'duration_min': ex.duration_minutes,
                })
        except Exception:
            pass  # exam_bank may not exist

        activities.sort(key=lambda x: x.get('date') or x.get('deadline') or '9999-12-31')

        if not activities:
            return "No upcoming activities found."
        return _safe_json(activities)
    except Exception as e:
        logger.error(f"get_calendar_activities error: {e}")
        return f"Error retrieving activities: {e}"


@tool
def get_course_details(course_id: int) -> str:
    """Get details about a specific course including chapters, sections, progress."""
    try:
        from app.models.courses import Course, Chapter

        course = Course.query.get(course_id)
        if not course:
            return f"Course {course_id} not found."

        chapters_list = []
        chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).all()
        for ch in chapters:
            chapters_list.append({
                'id': ch.id,
                'title': ch.title,
                'order': ch.order,
                'has_summary': ch.has_summary(),
                'documents': ch.get_document_count(),
            })

        student_count = course.enrollments.count()

        info = {
            'course_id': course.id,
            'title': course.title,
            'description': (course.description or '')[:500],
            'teacher_id': course.teacher_id,
            'students_enrolled': student_count,
            'chapters_count': len(chapters_list),
            'chapters': chapters_list,
        }
        return _safe_json(info)
    except Exception as e:
        logger.error(f"get_course_details error: {e}")
        return f"Error retrieving course details: {e}"


# ══════════════════════════════════════════════════════════════════════════════
# TOOLS — Students Only
# ══════════════════════════════════════════════════════════════════════════════

@tool
def get_my_performance(student_id: int) -> str:
    """Get student's quiz scores, averages, completion rates across all courses."""
    try:
        from app.models.users import User
        from app.models.courses import Course, Chapter, Enrollment
        from app.models.assessments import Quiz, QuizQuestion
        from app.models.documents import Document
        from app.models.activities import SectionQuizSubmission

        enrollments = Enrollment.query.filter_by(student_id=student_id).all()
        if not enrollments:
            return "Student is not enrolled in any courses."

        result: list[dict] = []
        all_scores: list[float] = []

        for enrollment in enrollments:
            course = Course.query.get(enrollment.course_id)
            if not course:
                continue

            # Document-based quizzes
            chapter_ids = [ch.id for ch in Chapter.query.filter_by(course_id=course.id).all()]
            doc_ids = []
            if chapter_ids:
                from app.models.documents import Document
                docs = Document.query.filter(
                    (Document.course_id == course.id) | (Document.chapter_id.in_(chapter_ids))
                ).all()
                doc_ids = [d.id for d in docs]

            quizzes = []
            if doc_ids:
                quizzes = Quiz.query.filter(
                    Quiz.student_id == student_id,
                    Quiz.completed_at.isnot(None),
                    Quiz.document_id.in_(doc_ids),
                ).all()

            quiz_scores = [q.score for q in quizzes if q.score is not None]

            # Section quiz submissions
            section_subs = SectionQuizSubmission.query.filter_by(student_id=student_id).all()
            section_scores = [s.score for s in section_subs if s.score is not None]

            all_course_scores = quiz_scores + section_scores
            avg = round(sum(all_course_scores) / len(all_course_scores), 1) if all_course_scores else 0.0
            all_scores.extend(all_course_scores)

            # Bloom breakdown
            bloom = {}
            for q in quizzes:
                for qq in QuizQuestion.query.filter_by(quiz_id=q.id).all():
                    bl = qq.bloom_level or 'unknown'
                    bloom.setdefault(bl, {'correct': 0, 'total': 0})
                    bloom[bl]['total'] += 1
                    if qq.is_correct:
                        bloom[bl]['correct'] += 1

            bloom_rates = {}
            for bl, c in bloom.items():
                bloom_rates[bl] = round(c['correct'] / c['total'] * 100, 1) if c['total'] > 0 else 0

            result.append({
                'course': course.title,
                'course_id': course.id,
                'quizzes_completed': len(quizzes),
                'section_quizzes_completed': len([s for s in section_subs if s.score is not None]),
                'average_score': avg,
                'bloom_rates': bloom_rates,
            })

        overall_avg = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0.0

        return _safe_json({
            'overall_average': overall_avg,
            'total_assessments': len(all_scores),
            'courses': result,
        })
    except Exception as e:
        logger.error(f"get_my_performance error: {e}")
        return f"Error retrieving performance: {e}"


@tool
def get_my_grades_summary(student_id: int) -> str:
    """Get a summary of grades by module for this student."""
    try:
        from app.models.courses import Course, Enrollment
        from app.models.assessments import Quiz
        from app.models.activities import SectionQuizSubmission, AssignmentSubmission
        from app.models.attendance import AttendanceSession, AttendanceRecord

        enrollments = Enrollment.query.filter_by(student_id=student_id).all()
        if not enrollments:
            return "Student is not enrolled in any courses."

        grades: list[dict] = []
        for enrollment in enrollments:
            course = Course.query.get(enrollment.course_id)
            if not course:
                continue

            # Quiz average
            doc_quizzes = Quiz.query.filter(
                Quiz.student_id == student_id,
                Quiz.completed_at.isnot(None),
            ).all()
            quiz_scores = [q.score for q in doc_quizzes if q.score is not None]
            quiz_avg = round(sum(quiz_scores) / len(quiz_scores), 1) if quiz_scores else None

            # Section quiz average
            sec_subs = SectionQuizSubmission.query.filter_by(student_id=student_id).all()
            sec_scores = [s.score for s in sec_subs if s.score is not None and s.max_score]
            sec_avg = round(
                sum(s / mx * 100 for s, mx in zip(sec_scores, [sub.max_score for sub in sec_subs if sub.score is not None and sub.max_score]))
                / len(sec_scores), 1
            ) if sec_scores else None

            # Assignment average
            asn_subs = AssignmentSubmission.query.filter_by(student_id=student_id, status='graded').all()
            asn_scores = [a.grade for a in asn_subs if a.grade is not None]
            asn_avg = round(sum(asn_scores) / len(asn_scores), 1) if asn_scores else None

            # Attendance rate
            sessions = AttendanceSession.query.filter_by(course_id=course.id).all()
            session_ids = [s.id for s in sessions]
            if session_ids:
                records = AttendanceRecord.query.filter(
                    AttendanceRecord.session_id.in_(session_ids),
                    AttendanceRecord.student_id == student_id,
                ).all()
                present_count = sum(1 for r in records if r.status in ('present', 'late'))
                att_rate = round(present_count / len(session_ids) * 100, 1) if session_ids else None
            else:
                att_rate = None

            grades.append({
                'course': course.title,
                'course_id': course.id,
                'quiz_average': quiz_avg,
                'section_quiz_average': sec_avg,
                'assignment_average': asn_avg,
                'attendance_rate': att_rate,
            })

        return _safe_json(grades)
    except Exception as e:
        logger.error(f"get_my_grades_summary error: {e}")
        return f"Error retrieving grades: {e}"


@tool
def get_recommendations(student_id: int) -> str:
    """Get AI-generated recommendations for exercises and study activities."""
    try:
        from app.services.coach_agent import analyze_student_performance
        result = analyze_student_performance(student_id)

        recs = result.get('recommendations', [])
        gaps = result.get('skill_gaps', [])
        plan = result.get('study_plan', {})

        return _safe_json({
            'skill_gaps': gaps[:10],
            'recommendations': recs[:10],
            'study_plan_summary': plan.get('summary', ''),
            'next_activities': (plan.get('activities') or [])[:5],
        })
    except Exception as e:
        logger.error(f"get_recommendations error: {e}")
        return f"Error generating recommendations: {e}"


# ══════════════════════════════════════════════════════════════════════════════
# TOOLS — Teachers Only
# ══════════════════════════════════════════════════════════════════════════════

@tool
def get_at_risk_students(teacher_id: int) -> str:
    """Detect students at risk (low scores, missing quizzes) in teacher's courses."""
    try:
        from app.models.users import User
        from app.models.courses import Course, Enrollment
        from app.models.assessments import Quiz
        from app.models.activities import SectionQuizSubmission
        from app.models.attendance import AttendanceSession, AttendanceRecord

        courses = Course.query.filter_by(teacher_id=teacher_id).all()
        if not courses:
            return "No courses found for this teacher."

        at_risk: list[dict] = []

        for course in courses:
            enrolled = Enrollment.query.filter_by(course_id=course.id).all()
            sessions = AttendanceSession.query.filter_by(course_id=course.id).all()
            total_sessions = len(sessions)
            session_ids = [s.id for s in sessions]

            for enrollment in enrolled:
                sid = enrollment.student_id
                student = User.query.get(sid)
                if not student:
                    continue

                reasons: list[str] = []

                # Check quiz scores
                quizzes = Quiz.query.filter(
                    Quiz.student_id == sid,
                    Quiz.completed_at.isnot(None),
                ).all()
                quiz_scores = [q.score for q in quizzes if q.score is not None]
                if quiz_scores:
                    avg = sum(quiz_scores) / len(quiz_scores)
                    if avg < 50:
                        reasons.append(f"Low quiz average: {round(avg, 1)}%")
                elif total_sessions > 2:
                    reasons.append("No quizzes completed")

                # Check section quiz scores
                sec_subs = SectionQuizSubmission.query.filter_by(student_id=sid).all()
                sec_scores = [s.score for s in sec_subs if s.score is not None and s.max_score and s.max_score > 0]
                if sec_scores:
                    sec_pcts = [s.score / s.max_score * 100 for s in sec_subs if s.score is not None and s.max_score and s.max_score > 0]
                    sec_avg = sum(sec_pcts) / len(sec_pcts) if sec_pcts else 0
                    if sec_avg < 50:
                        reasons.append(f"Low section-quiz average: {round(sec_avg, 1)}%")

                # Check attendance
                if total_sessions >= 3 and session_ids:
                    records = AttendanceRecord.query.filter(
                        AttendanceRecord.session_id.in_(session_ids),
                        AttendanceRecord.student_id == sid,
                    ).all()
                    present = sum(1 for r in records if r.status in ('present', 'late'))
                    rate = present / total_sessions * 100
                    if rate < 60:
                        reasons.append(f"Low attendance: {round(rate, 1)}%")

                if reasons:
                    at_risk.append({
                        'student_id': sid,
                        'student_name': student.username,
                        'student_email': student.email,
                        'course': course.title,
                        'course_id': course.id,
                        'reasons': reasons,
                    })

        if not at_risk:
            return "No at-risk students detected across your courses."
        return _safe_json(at_risk)
    except Exception as e:
        logger.error(f"get_at_risk_students error: {e}")
        return f"Error detecting at-risk students: {e}"


@tool
def get_class_performance(course_id: int) -> str:
    """Get performance summary for all students in a course."""
    try:
        from app.models.users import User
        from app.models.courses import Course, Enrollment
        from app.models.assessments import Quiz
        from app.models.activities import SectionQuizSubmission

        course = Course.query.get(course_id)
        if not course:
            return f"Course {course_id} not found."

        enrolled = Enrollment.query.filter_by(course_id=course_id).all()
        if not enrolled:
            return f"No students enrolled in '{course.title}'."

        students_data: list[dict] = []
        all_avgs: list[float] = []

        for enrollment in enrolled:
            sid = enrollment.student_id
            student = User.query.get(sid)
            if not student:
                continue

            quizzes = Quiz.query.filter(
                Quiz.student_id == sid,
                Quiz.completed_at.isnot(None),
            ).all()
            quiz_scores = [q.score for q in quizzes if q.score is not None]

            sec_subs = SectionQuizSubmission.query.filter_by(student_id=sid).all()
            sec_pcts = []
            for s in sec_subs:
                if s.score is not None and s.max_score and s.max_score > 0:
                    sec_pcts.append(s.score / s.max_score * 100)

            all_scores = quiz_scores + sec_pcts
            avg = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0.0
            all_avgs.append(avg)

            students_data.append({
                'student_id': sid,
                'name': student.username,
                'quiz_count': len(quiz_scores),
                'section_quiz_count': len(sec_pcts),
                'average': avg,
            })

        class_avg = round(sum(all_avgs) / len(all_avgs), 1) if all_avgs else 0.0
        students_data.sort(key=lambda x: x['average'])

        return _safe_json({
            'course': course.title,
            'course_id': course_id,
            'student_count': len(enrolled),
            'class_average': class_avg,
            'students': students_data,
        })
    except Exception as e:
        logger.error(f"get_class_performance error: {e}")
        return f"Error retrieving class performance: {e}"


@tool
def suggest_quiz_for_student(student_id: int, course_id: int) -> str:
    """Suggest quiz topics targeting a student's weak areas in a specific course."""
    try:
        from app.models.users import User
        from app.models.courses import Course, Chapter
        from app.models.assessments import Quiz, QuizQuestion
        from app.models.documents import Document

        student = User.query.get(student_id)
        course = Course.query.get(course_id)
        if not student or not course:
            return "Student or course not found."

        # Gather bloom breakdown
        chapter_ids = [ch.id for ch in Chapter.query.filter_by(course_id=course_id).all()]
        doc_ids = []
        if chapter_ids:
            docs = Document.query.filter(
                (Document.course_id == course_id) | (Document.chapter_id.in_(chapter_ids))
            ).all()
            doc_ids = [d.id for d in docs]

        bloom_breakdown: dict[str, dict] = {}
        if doc_ids:
            quizzes = Quiz.query.filter(
                Quiz.student_id == student_id,
                Quiz.completed_at.isnot(None),
                Quiz.document_id.in_(doc_ids),
            ).all()
            for q in quizzes:
                for qq in QuizQuestion.query.filter_by(quiz_id=q.id).all():
                    bl = qq.bloom_level or 'unknown'
                    bloom_breakdown.setdefault(bl, {'correct': 0, 'total': 0})
                    bloom_breakdown[bl]['total'] += 1
                    if qq.is_correct:
                        bloom_breakdown[bl]['correct'] += 1

        weak_areas: list[dict] = []
        for bl, counts in bloom_breakdown.items():
            rate = counts['correct'] / counts['total'] * 100 if counts['total'] > 0 else 0
            if rate < 60:
                weak_areas.append({'bloom_level': bl, 'success_rate': round(rate, 1), 'total_questions': counts['total']})

        weak_areas.sort(key=lambda x: x['success_rate'])

        suggestions = {
            'student': student.username,
            'course': course.title,
            'weak_areas': weak_areas,
            'recommendation': (
                f"Focus quiz questions on: {', '.join(w['bloom_level'] for w in weak_areas[:3])}"
                if weak_areas
                else "Student is performing well across all Bloom levels."
            ),
            'suggested_difficulty': 'medium' if not weak_areas else 'easy' if weak_areas[0]['success_rate'] < 30 else 'medium',
        }
        return _safe_json(suggestions)
    except Exception as e:
        logger.error(f"suggest_quiz_for_student error: {e}")
        return f"Error generating suggestions: {e}"


# ── Section→Course resolver (reuses calendar pattern) ────────────────────────

def _resolve_course_for_section(section_id: int, course_ids: list[int]) -> Optional[str]:
    """Resolve course title from a TNSection id, returning None if the
    course is not in the allowed list."""
    try:
        from app.models.syllabus import TNSection, TNChapter, Syllabus
        from app.models.courses import Course

        section = TNSection.query.get(section_id)
        if not section:
            return None
        chapter = TNChapter.query.get(section.chapter_id)
        if not chapter:
            return None
        syllabus = Syllabus.query.get(chapter.syllabus_id)
        if not syllabus or syllabus.course_id not in course_ids:
            return None
        course = Course.query.get(syllabus.course_id)
        return course.title if course else None
    except Exception:
        return None


# ══════════════════════════════════════════════════════════════════════════════
# System prompt builder
# ══════════════════════════════════════════════════════════════════════════════

def _build_system_prompt(role: str, user_name: str, user_id: int = 0) -> str:
    """Build a role-aware system prompt for the assistant."""

    base = f"""You are **ESB Assistant**, the official pedagogical AI assistant of the ESB-Learning platform.
The current user is "{user_name}" (user_id={user_id}) with role: **{role}**.
Today's date is {date.today().isoformat()}.
IMPORTANT: When calling any tool, always use user_id={user_id} for the current user's data.

## Core instructions
1. **Always consult your tools** before answering any question about courses, grades, performance, calendar, or students. Never guess or hallucinate data.
2. **Language**: Respond in the SAME language the user writes in. Detect French, English, or Tunisian Arabic dialect.
   - If the user writes in Tunisian dialect (Tounsi, Derja), switch to a friendly informal tone, use Tunisian expressions, and adopt a fun "fennec 🦊" personality (e.g. "Ahla bik!", "Yezzi men el stress 😄").
3. Use Markdown formatting for readability (headers, bullet points, tables when appropriate).
4. Be encouraging, constructive, and pedagogically supportive.
5. When presenting data, summarize the key insights first, then show details if the user wants more.
6. If a tool returns an error, acknowledge it gracefully and suggest what the user can do.
"""

    if role == 'student':
        base += """
## Student-specific behavior
- Encourage the student and celebrate progress.
- Proactively suggest study tips and exercises when relevant.
- When discussing grades, frame them constructively ("You've improved in X, let's work on Y").
- You can access: courses, calendar, performance, grades, recommendations.
- You CANNOT access teacher-only tools (class performance, at-risk students).
"""
    elif role == 'teacher':
        base += """
## Teacher-specific behavior
- Provide analytics-oriented insights about class performance.
- Help identify students who need attention.
- Suggest pedagogical interventions and quiz topics for weak areas.
- You can access: courses, calendar, course details, class performance, at-risk students, quiz suggestions.
- Present data in a structured, actionable format.
"""
    elif role == 'admin':
        base += """
## Admin-specific behavior
- You have an overview perspective across the platform.
- Help with platform-wide insights when asked.
- You can access all general tools (courses, calendar, course details).
"""

    return base


# ══════════════════════════════════════════════════════════════════════════════
# Main chat function
# ══════════════════════════════════════════════════════════════════════════════

def chat_with_assistant(
    user_id: int,
    message: str,
    conversation_history: list[dict],
    role: str = "student",
) -> dict:
    """
    Run the conversational assistant agent.

    Args:
        user_id: The authenticated user's ID.
        message: The latest user message.
        conversation_history: Previous turns [{"role": "user"/"assistant", "content": "..."}].
        role: "student", "teacher", or "admin".

    Returns:
        {
            "response": str,
            "language": str,
            "tools_used": list[str],
        }
    """
    from app.models.users import User

    user = User.query.get(user_id)
    user_name = user.username if user else f"User#{user_id}"

    # Select tools by role
    common_tools = [get_my_courses, get_calendar_activities, get_course_details]
    student_tools = [get_my_performance, get_my_grades_summary, get_recommendations]
    teacher_tools = [get_at_risk_students, get_class_performance, suggest_quiz_for_student]

    if role == 'teacher':
        tools = common_tools + teacher_tools
    elif role == 'admin':
        tools = common_tools + student_tools + teacher_tools
    else:
        tools = common_tools + student_tools

    # ── Inject modular skills as LangChain tools ──
    try:
        from app.services.skill_manager import SkillManager
        skill_manager = SkillManager()
        skill_tools = skill_manager.as_langchain_tools(
            agent_id='assistant',
            role=role,
            user_id=user_id,
        )
        tools = tools + skill_tools
        logger.debug(f"Injected {len(skill_tools)} skill tools for role={role}")
    except Exception as e:
        logger.warning(f"Skills injection skipped: {e}")

    # Build messages
    system_prompt = _build_system_prompt(role, user_name, user_id)

    messages: list = []
    for turn in conversation_history[-20:]:  # Keep last 20 turns for context
        r = turn.get('role', 'user')
        content = turn.get('content', '')
        if r == 'user':
            messages.append(HumanMessage(content=content))
        elif r == 'assistant':
            messages.append(AIMessage(content=content))
    # ── TunBERT enrichment for Tunisian dialect ──
    language = _detect_language(message)
    tunbert_context = ""
    if language == "tn":
        try:
            from app.services.tunbert_service import enhance_tunisian_prompt
            tunbert_context = enhance_tunisian_prompt(message, language)
        except Exception as e:
            logger.debug(f"TunBERT enrichment skipped: {e}")

    # If TunBERT provided context, append it to the user message so the LLM
    # has semantic hints about what the Tunisian text means.
    enriched_message = message
    if tunbert_context:
        enriched_message = f"{message}\n\n{tunbert_context}"

    messages.append(HumanMessage(content=enriched_message))

    try:
        llm = _get_llm()
        agent = create_react_agent(llm, tools, prompt=system_prompt)

        result = agent.invoke({"messages": messages})

        # Extract the final AI response
        ai_messages = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
        raw_content = ai_messages[-1].content if ai_messages else "I'm sorry, I couldn't generate a response."

        # Gemini may return structured content parts [{text, type, extras}] instead of a string
        if isinstance(raw_content, list):
            response_text = " ".join(
                part.get("text", "") if isinstance(part, dict) else str(part)
                for part in raw_content
            ).strip() or "I'm sorry, I couldn't generate a response."
        else:
            response_text = str(raw_content)

        # Track which tools were called
        tools_used: list[str] = []
        for m in result.get("messages", []):
            if hasattr(m, 'tool_calls') and m.tool_calls:
                for tc in m.tool_calls:
                    name = tc.get('name') or tc.get('function', {}).get('name', '')
                    if name and name not in tools_used:
                        tools_used.append(name)

        # Language already detected above (before TunBERT enrichment)
        tunbert_intents = []
        if language == "tn":
            try:
                from app.services.tunbert_service import classify_tunisian_intent
                tunbert_intents = classify_tunisian_intent(message, top_k=2)
            except Exception:
                pass

        return {
            "response": response_text,
            "language": language,
            "tools_used": tools_used,
            "tunbert_intents": tunbert_intents,
        }

    except Exception as e:
        logger.error(f"Assistant agent error: {e}", exc_info=True)
        # Provide a graceful fallback
        language = _detect_language(message)
        if language == 'tn':
            fallback = "Samehni, sar mochkol technique. Aaawed jarreb ba3d chwaya. 🦊"
        elif language == 'fr':
            fallback = "Désolé, une erreur technique est survenue. Veuillez réessayer dans un moment."
        else:
            fallback = "Sorry, a technical error occurred. Please try again in a moment."

        return {
            "response": fallback,
            "language": language,
            "tools_used": [],
        }


def stream_assistant(
    user_id: int,
    message: str,
    conversation_history: list[dict],
    role: str = "student",
):
    """
    Streaming version of chat_with_assistant.

    Yields (event_type: str, data: str) tuples as the LangGraph ReAct agent
    processes the request.  Consumers should send each tuple as an SSE event.

    Event types
    -----------
    ``thinking``   — the LLM is reasoning / writing a response chunk
    ``tool_call``  — the agent is calling a tool (data = tool name)
    ``tool_result``— a tool returned a result (data = tool name)
    ``done``       — final assembled response (data = JSON string with
     ``{"response": ..., "language": ..., "tools_used": [...]}`` )
    ``error``      — unrecoverable error (data = error message)
    """
    from app.models.users import User

    user = User.query.get(user_id)
    user_name = user.username if user else f"User#{user_id}"

    common_tools = [get_my_courses, get_calendar_activities, get_course_details]
    student_tools = [get_my_performance, get_my_grades_summary, get_recommendations]
    teacher_tools = [get_at_risk_students, get_class_performance, suggest_quiz_for_student]

    if role == 'teacher':
        tools = common_tools + teacher_tools
    elif role == 'admin':
        tools = common_tools + student_tools + teacher_tools
    else:
        tools = common_tools + student_tools

    try:
        from app.services.skill_manager import SkillManager
        skill_tools = SkillManager().as_langchain_tools(
            agent_id='assistant', role=role, user_id=user_id,
        )
        tools = tools + skill_tools
    except Exception as e:
        logger.warning("Skills injection skipped in stream: %s", e)

    system_prompt = _build_system_prompt(role, user_name, user_id)

    messages: list = []
    for turn in conversation_history[-20:]:
        r = turn.get('role', 'user')
        content = turn.get('content', '')
        if r == 'user':
            messages.append(HumanMessage(content=content))
        elif r == 'assistant':
            messages.append(AIMessage(content=content))

    language = _detect_language(message)
    enriched_message = message
    if language == "tn":
        try:
            from app.services.tunbert_service import enhance_tunisian_prompt
            enriched_message = f"{message}\n\n{enhance_tunisian_prompt(message, language)}"
        except Exception:
            pass

    messages.append(HumanMessage(content=enriched_message))

    try:
        llm = _get_llm()
        agent = create_react_agent(llm, tools, prompt=system_prompt)

        tools_used: list[str] = []
        final_text: str = ""

        for event in agent.stream({"messages": messages}):
            for node_name, node_output in event.items():
                for msg in node_output.get("messages", []):
                    # Tool calls from the LLM
                    if hasattr(msg, 'tool_calls') and msg.tool_calls:
                        for tc in msg.tool_calls:
                            name = tc.get('name') or tc.get('function', {}).get('name', '')
                            if name:
                                if name not in tools_used:
                                    tools_used.append(name)
                                yield ('tool_call', name)

                    # AI response text
                    if isinstance(msg, AIMessage):
                        content = msg.content
                        if isinstance(content, list):
                            content = " ".join(
                                p.get("text", "") if isinstance(p, dict) else str(p)
                                for p in content
                            ).strip()
                        if content:
                            final_text = content
                            yield ('thinking', content)

                    # Tool results
                    elif hasattr(msg, 'name') and node_name == 'tools':
                        yield ('tool_result', msg.name or 'tool')

        # Emit the final done event with full metadata
        yield ('done', json.dumps({
            "response": final_text,
            "language": language,
            "tools_used": tools_used,
        }, ensure_ascii=False))

    except Exception as e:
        logger.error("stream_assistant error: %s", e, exc_info=True)
        yield ('error', str(e))

_TUNISIAN_MARKERS = {
    'chnou', 'chnowa', 'kifech', 'winou', 'bech', 'mouch', 'ey', 'ena',
    'enti', 'houa', 'hiya', 'ahla', 'yezzi', 'barcha', 'chbik', 'fama',
    'mahich', 'mahouch', 'win', 'waqteh', 'aaslema', 'bahi', 'mriguel',
    'sahbi', 'sahbti', 'ya3tik', 'bessif', 'taw', 'nchalah', 'inchallah',
    'fhemni', 'na3ref', 'manich', 'mzel', 'hkeya', 'aaleh', 'chkoun',
    'kemmel', 'klemni', 'a7ki', 'brabi', 'rabbi', 'najem', 'chwaya',
    'hedhi', 'hedha', 'heka', 'lkol', 'kima', 'aamalt', 'nhabek',
    '9ra', '9rit', 'quiz', 'el', 'fil', 'mel', 'lel',
}

_FRENCH_MARKERS = {
    'je', 'tu', 'nous', 'vous', 'les', 'des', 'une', 'est', 'sont',
    'mes', 'tes', 'ses', 'mon', 'ton', 'son', 'qui', 'que', 'quoi',
    'comment', 'pourquoi', 'quand', 'bonjour', 'merci', 'cours',
    'notes', 'moyenne', 'étudiant', 'devoir', 'examen',
}


def _detect_language(text: str) -> str:
    """Detect if text is French, English, or Tunisian dialect."""
    words = set(text.lower().split())

    tn_hits = len(words & _TUNISIAN_MARKERS)
    fr_hits = len(words & _FRENCH_MARKERS)

    if tn_hits >= 2:
        return 'tn'
    if tn_hits >= 1 and fr_hits >= 1:
        return 'tn'
    if fr_hits >= 2:
        return 'fr'

    # Fallback: check for common French patterns
    lower = text.lower()
    fr_patterns = ["qu'est", "c'est", "j'ai", "l'", "d'", "n'", "s'"]
    if any(p in lower for p in fr_patterns):
        return 'fr'

    return 'en'
