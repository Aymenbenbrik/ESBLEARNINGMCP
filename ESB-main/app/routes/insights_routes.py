from datetime import datetime, timedelta
from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify, abort
from flask_login import login_required, current_user
from sqlalchemy import func, text, extract
from app import db
from app.models import User, Course, Enrollment, Quiz, QuizQuestion, Document, ChatSession, ChatMessage, Chapter, UserSession, Syllabus, TNAA
import calendar
from collections import defaultdict
import json
import re
import logging

logger = logging.getLogger(__name__)
insights_bp = Blueprint('insights', __name__)


# ============================================================
# TN helper: normalize CLO -> AAA label (AA# + description)
# ============================================================

_AA_CACHE: dict[int, dict[int, str]] = {}


def _parse_aa_number(value: str | None):
    if not value:
        return None
    v = str(value).strip()
    # If already formatted as "AAx — ..." keep number
    m = re.search(r"\bAA\s*#?\s*(\d+)\b", v, flags=re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r"\bCLO\s*#?\s*(\d+)\b", v, flags=re.IGNORECASE)
    if m:
        return int(m.group(1))
    # Pure number
    if re.fullmatch(r"\d{1,2}", v):
        return int(v)
    return None


def _get_course_aa_map(course_id: int) -> dict[int, str]:
    """Return {aa_number: description} for a TN syllabus course."""
    if course_id in _AA_CACHE:
        return _AA_CACHE[course_id]

    s = Syllabus.query.filter_by(course_id=course_id).first()
    if not s or s.syllabus_type != 'tn':
        _AA_CACHE[course_id] = {}
        return _AA_CACHE[course_id]

    rows = TNAA.query.filter_by(syllabus_id=s.id).all()
    mp = {int(r.number): (r.description or '').strip() for r in rows if r.number is not None}
    _AA_CACHE[course_id] = mp
    return mp


def _normalize_clo_to_aa_label(raw_clo: str | None, course_id: int | None) -> str | None:
    """For TN, display AAA as "AA# — description".

    Returns a normalized label or the original value.
    """
    if not raw_clo or raw_clo == 'N/A':
        return None

    v = str(raw_clo).strip()
    # If already good
    if v.lower().startswith('aa') and '—' in v:
        return v

    num = _parse_aa_number(v)
    if not num:
        return v

    if not course_id:
        return f"AA{num}"

    desc = _get_course_aa_map(course_id).get(int(num))
    if desc:
        return f"AA{num} — {desc}"
    return f"AA{num}"


# ============================================================
# STUDENT DASHBOARD HELPERS
# ============================================================

def _collect_course_document_ids(course_id: int):
    """Return all document IDs that belong to a course (module + chapters)."""
    doc_ids = set()

    # Direct course documents (module attachments, exams, etc.)
    for d in Document.query.filter_by(course_id=course_id).all():
        doc_ids.add(d.id)

    # Chapter documents
    chapter_ids = [c.id for c in Chapter.query.filter_by(course_id=course_id).all()]
    if chapter_ids:
        for d in Document.query.filter(Document.chapter_id.in_(chapter_ids)).all():
            doc_ids.add(d.id)

    return list(doc_ids)


def _student_quiz_analytics(student_id: int, course_ids=None):
    """Aggregate quiz performance for a student (optionally filtered by courses)."""
    if course_ids:
        all_doc_ids = set()
        for cid in course_ids:
            for did in _collect_course_document_ids(cid):
                all_doc_ids.add(did)
        if not all_doc_ids:
            return {
                'quizzes': [],
                'bloom': {},
                'clo': {},
                'difficulty': {},
                'avg_score': 0.0,
                'completed_quiz_count': 0,
                'total_questions': 0,
            }

        quizzes = Quiz.query.filter(
            Quiz.student_id == student_id,
            Quiz.document_id.in_(list(all_doc_ids)),
            Quiz.completed_at.isnot(None)
        ).order_by(Quiz.completed_at.desc()).all()
    else:
        quizzes = Quiz.query.filter(
            Quiz.student_id == student_id,
            Quiz.completed_at.isnot(None)
        ).order_by(Quiz.completed_at.desc()).all()

    if not quizzes:
        return {
            'quizzes': [],
            'bloom': {},
            'clo': {},
            'difficulty': {},
            'avg_score': 0.0,
            'completed_quiz_count': 0,
            'total_questions': 0,
        }

    bloom_stats = defaultdict(lambda: {'total': 0, 'correct': 0})
    clo_stats = defaultdict(lambda: {'total': 0, 'correct': 0})
    diff_stats = defaultdict(lambda: {'total': 0, 'correct': 0})

    total_questions = 0
    total_score_sum = 0.0
    scored_quiz_count = 0

    for quiz in quizzes:
        # best-effort: infer course_id for TN AAA labels
        course_id_for_quiz = None
        try:
            if quiz.document:
                course_id_for_quiz = quiz.document.course_id or (quiz.document.chapter.course_id if quiz.document.chapter else None)
        except Exception:
            course_id_for_quiz = None

        if quiz.score is not None:
            total_score_sum += float(quiz.score)
            scored_quiz_count += 1

        questions = QuizQuestion.query.filter_by(quiz_id=quiz.id).all()
        for q in questions:
            total_questions += 1
            is_correct = bool(q.is_correct) if q.is_correct is not None else False

            if q.bloom_level and q.bloom_level != 'N/A':
                bloom_stats[q.bloom_level]['total'] += 1
                if is_correct:
                    bloom_stats[q.bloom_level]['correct'] += 1

            clo_label = _normalize_clo_to_aa_label(q.clo, course_id_for_quiz)
            if clo_label and clo_label != 'N/A':
                clo_stats[clo_label]['total'] += 1
                if is_correct:
                    clo_stats[clo_label]['correct'] += 1

            if q.difficulty and q.difficulty != 'N/A':
                diff_stats[q.difficulty]['total'] += 1
                if is_correct:
                    diff_stats[q.difficulty]['correct'] += 1

    def _to_list(stats_map, order=None):
        items = []
        for k, v in stats_map.items():
            total = v['total']
            correct = v['correct']
            sr = round((correct / total) * 100, 1) if total else 0.0
            items.append({'name': k, 'total': total, 'correct': correct, 'success_rate': sr})
        if order:
            return sorted(items, key=lambda x: order.get(str(x['name']).lower(), 999))
        return sorted(items, key=lambda x: x['name'])

    bloom_order = {'remember': 0, 'understand': 1, 'apply': 2, 'analyze': 3, 'evaluate': 4, 'create': 5,
                   'mémoriser': 0, 'comprendre': 1, 'appliquer': 2, 'analyser': 3, 'évaluer': 4, 'créer': 5}
    diff_order = {'easy': 0, 'medium': 1, 'hard': 2,
                  'très facile': 0, 'facile': 1, 'moyen': 2, 'difficile': 3, 'très difficile': 4}

    avg_score = round((total_score_sum / scored_quiz_count), 2) if scored_quiz_count else 0.0

    return {
        'quizzes': quizzes,
        'bloom': _to_list(bloom_stats, bloom_order),
        'clo': _to_list(clo_stats),
        'difficulty': _to_list(diff_stats, diff_order),
        'avg_score': avg_score,
        'completed_quiz_count': len(quizzes),
        'total_questions': total_questions,
    }


def _student_courses_summary(student_id: int, course_ids):
    """Per-course (module) progress cards."""
    out = []
    for cid in course_ids:
        course = Course.query.get(cid)
        if not course:
            continue
        doc_ids = _collect_course_document_ids(cid)
        completed_quizzes = Quiz.query.filter(
            Quiz.student_id == student_id,
            Quiz.document_id.in_(doc_ids) if doc_ids else False,
            Quiz.completed_at.isnot(None)
        ).all() if doc_ids else []

        avg_score = 0.0
        scores = [float(q.score) for q in completed_quizzes if q.score is not None]
        if scores:
            avg_score = round(sum(scores) / len(scores), 2)

        out.append({
            'course': course,
            'documents': len(doc_ids),
            'completed_quizzes': len(completed_quizzes),
            'avg_score': avg_score,
        })
    return out


# ============================================================
# CLASS DASHBOARD (teacher / superuser)
# ============================================================

def _teacher_classes(teacher_id: int):
    """Return classes that contain at least one student linked to this teacher."""
    teacher = User.query.get(teacher_id)
    if not teacher:
        return []
    student_ids = [s.id for s in teacher.get_all_students()]
    if not student_ids:
        return []
    classes = (
        db.session.query(User.class_id)
        .filter(User.id.in_(student_ids), User.class_id.isnot(None))
        .distinct()
        .all()
    )
    class_ids = [cid for (cid,) in classes if cid]
    if not class_ids:
        return []
    from app.models import Classe
    return Classe.query.filter(Classe.id.in_(class_ids)).order_by(Classe.name.asc()).all()


def _class_quiz_analytics(class_id: int):
    """Aggregate quiz performance for all students in a class."""
    from app.models import Classe
    c = Classe.query.get(class_id)
    if not c:
        return {
            "students": 0,
            "completed_quiz_count": 0,
            "avg_score": 0.0,
            "bloom": [],
            "difficulty": [],
            "clo": [],
            "courses": [],
        }

    students = list(c.students.filter_by(is_teacher=False).all())
    student_ids = [s.id for s in students]
    if not student_ids:
        return {
            "students": 0,
            "completed_quiz_count": 0,
            "avg_score": 0.0,
            "bloom": [],
            "difficulty": [],
            "clo": [],
            "courses": [],
        }

    # Pull all completed quizzes in one go
    quizzes = Quiz.query.filter(Quiz.student_id.in_(student_ids), Quiz.completed_at.isnot(None)).all()
    quiz_ids = [q.id for q in quizzes]
    quiz_course_map = {}
    for qz in quizzes:
        try:
            if qz.document:
                quiz_course_map[qz.id] = qz.document.course_id or (qz.document.chapter.course_id if qz.document.chapter else None)
        except Exception:
            pass

    bloom_stats = defaultdict(lambda: {"total": 0, "correct": 0})
    diff_stats = defaultdict(lambda: {"total": 0, "correct": 0})
    clo_stats = defaultdict(lambda: {"total": 0, "correct": 0})
    course_stats = defaultdict(lambda: {"quizzes": 0, "score_sum": 0.0, "score_n": 0})

    # Avg score
    for qz in quizzes:
        if qz.score is not None:
            course_id = qz.document.course_id if qz.document else None
            if course_id:
                course_stats[course_id]["quizzes"] += 1
                course_stats[course_id]["score_sum"] += float(qz.score)
                course_stats[course_id]["score_n"] += 1

    if quiz_ids:
        questions = QuizQuestion.query.filter(QuizQuestion.quiz_id.in_(quiz_ids)).all()
        for q in questions:
            is_correct = bool(q.is_correct) if q.is_correct is not None else False
            if q.bloom_level and q.bloom_level != "N/A":
                bloom_stats[q.bloom_level]["total"] += 1
                if is_correct:
                    bloom_stats[q.bloom_level]["correct"] += 1
            if q.difficulty and q.difficulty != "N/A":
                diff_stats[q.difficulty]["total"] += 1
                if is_correct:
                    diff_stats[q.difficulty]["correct"] += 1
            clo_label = _normalize_clo_to_aa_label(q.clo, quiz_course_map.get(q.quiz_id))
            if clo_label and clo_label != "N/A":
                clo_stats[clo_label]["total"] += 1
                if is_correct:
                    clo_stats[clo_label]["correct"] += 1

    def _to_list(stats_map, order=None):
        items = []
        for k, v in stats_map.items():
            total = v["total"]
            correct = v["correct"]
            sr = round((correct / total) * 100, 1) if total else 0.0
            items.append({"name": k, "total": total, "correct": correct, "success_rate": sr})
        if order:
            return sorted(items, key=lambda x: order.get(str(x["name"]).lower(), 999))
        return sorted(items, key=lambda x: x["name"])

    bloom_order = {
        "remember": 0,
        "understand": 1,
        "apply": 2,
        "analyze": 3,
        "evaluate": 4,
        "create": 5,
        "mémoriser": 0,
        "comprendre": 1,
        "appliquer": 2,
        "analyser": 3,
        "évaluer": 4,
        "créer": 5,
    }
    diff_order = {
        "très facile": 0,
        "facile": 1,
        "moyen": 2,
        "difficile": 3,
        "très difficile": 4,
        "easy": 0,
        "medium": 1,
        "hard": 2,
    }

    bloom_list = _to_list(bloom_stats, bloom_order)
    diff_list = _to_list(diff_stats, diff_order)
    clo_list = _to_list(clo_stats)

    total_score_sum = sum(float(q.score) for q in quizzes if q.score is not None)
    total_score_n = sum(1 for q in quizzes if q.score is not None)
    avg_score = round((total_score_sum / total_score_n), 2) if total_score_n else 0.0

    courses_out = []
    for cid, st in course_stats.items():
        course = Course.query.get(cid)
        if not course:
            continue
        avg = round((st["score_sum"] / st["score_n"]), 2) if st["score_n"] else 0.0
        courses_out.append({"course": course, "avg_score": avg, "quizzes": st["quizzes"]})
    courses_out = sorted(courses_out, key=lambda x: x["course"].title)

    return {
        "students": len(students),
        "completed_quiz_count": len(quizzes),
        "avg_score": avg_score,
        "bloom": bloom_list,
        "difficulty": diff_list,
        "clo": clo_list,
        "courses": courses_out,
    }


# ============================================================
# HELPER: Extract metadata from explanation
# ============================================================

def extract_metadata_from_question(question):
    """Extract CLO, Bloom level, and difficulty from question explanation"""
    if not question.explanation:
        return {'clo': 'N/A', 'bloom': 'N/A', 'difficulty': 'N/A'}
    
    explanation = question.explanation
    metadata_match = re.search(
        r'\[METADATA: CLO=([^,]+), BLOOM=([^,]+), DIFFICULTY=([^,]+), TYPE=([^\]]+)\]',
        explanation
    )
    
    if metadata_match:
        return {
            'clo': metadata_match.group(1).strip(),
            'bloom': metadata_match.group(2).strip(),
            'difficulty': metadata_match.group(3).strip()
        }
    
    return {'clo': 'N/A', 'bloom': 'N/A', 'difficulty': 'N/A'}


# ============================================================
# HELPER: Get CLO and Bloom analytics from completed quizzes
# ============================================================

def get_clo_bloom_analytics_from_completed_quizzes(course_id):
    """Get comprehensive analytics by CLO and Bloom's Taxonomy"""
    
    # Get all documents for the course (DIRECT from course, not through chapters)
    documents = Document.query.filter_by(course_id=course_id).all()
    document_ids = [doc.id for doc in documents]
    
    print(f"DEBUG (analytics): Found {len(document_ids)} documents for course {course_id}")
    
    # Also try through chapters if they exist
    chapters = Chapter.query.filter_by(course_id=course_id).all()
    if chapters:
        chapter_ids = [chapter.id for chapter in chapters]
        chapter_documents = Document.query.filter(Document.chapter_id.in_(chapter_ids)).all()
        for doc in chapter_documents:
            if doc.id not in document_ids:
                document_ids.append(doc.id)
        print(f"DEBUG (analytics): Added {len(chapter_documents)} documents from chapters")
    
    if not document_ids:
        print("DEBUG (analytics): No documents found!")
        return {
            'clo': [],
            'bloom': [],
            'difficulty': [],
            'total_questions': 0,
            'total_completed_quizzes': 0
        }
    
    # Get ALL COMPLETED quizzes for these documents
    completed_quizzes = Quiz.query.filter(
        Quiz.document_id.in_(document_ids),
        Quiz.completed_at.isnot(None)
    ).all()
    
    print(f"DEBUG (analytics): Found {len(completed_quizzes)} completed quizzes")
    
    if not completed_quizzes:
        return {
            'clo': [],
            'bloom': [],
            'difficulty': [],
            'total_questions': 0,
            'total_completed_quizzes': 0
        }
    
    # Analytics dictionaries
    clo_stats = defaultdict(lambda: {'total': 0, 'correct': 0, 'avg_score': 0, 'students': set()})
    bloom_stats = defaultdict(lambda: {'total': 0, 'correct': 0, 'avg_score': 0, 'students': set()})
    difficulty_stats = defaultdict(lambda: {'total': 0, 'correct': 0, 'avg_score': 0, 'students': set()})
    
    total_questions_count = 0
    
    # Process each completed quiz
    for quiz in completed_quizzes:
        questions = QuizQuestion.query.filter_by(quiz_id=quiz.id).all()
        print(f"DEBUG (analytics): Quiz {quiz.id} has {len(questions)} questions")
        
        for question in questions:
            total_questions_count += 1
            
            # Use the stored metadata fields directly from QuizQuestion model
            clo = _normalize_clo_to_aa_label(question.clo, course_id)
            clo = clo if clo and clo != 'N/A' else None
            bloom = question.bloom_level if question.bloom_level and question.bloom_level != 'N/A' else None
            difficulty = question.difficulty if question.difficulty and question.difficulty != 'N/A' else None
            
            print(f"DEBUG (analytics): Question {question.id} - CLO: {clo}, Bloom: {bloom}, Difficulty: {difficulty}")
            
            # Determine if answer is correct
            is_correct = question.is_correct if question.is_correct is not None else False
            score = 100 if is_correct else 0
            
            # CLO Statistics
            if clo:
                clo_stats[clo]['total'] += 1
                clo_stats[clo]['students'].add(quiz.student_id)
                if is_correct:
                    clo_stats[clo]['correct'] += 1
                current_avg = clo_stats[clo]['avg_score']
                total_before = clo_stats[clo]['total'] - 1
                clo_stats[clo]['avg_score'] = (current_avg * total_before + score) / clo_stats[clo]['total']
            
            # Bloom Statistics
            if bloom:
                bloom_stats[bloom]['total'] += 1
                bloom_stats[bloom]['students'].add(quiz.student_id)
                if is_correct:
                    bloom_stats[bloom]['correct'] += 1
                current_avg = bloom_stats[bloom]['avg_score']
                total_before = bloom_stats[bloom]['total'] - 1
                bloom_stats[bloom]['avg_score'] = (current_avg * total_before + score) / bloom_stats[bloom]['total']
            
            # Difficulty Statistics
            if difficulty:
                difficulty_stats[difficulty]['total'] += 1
                difficulty_stats[difficulty]['students'].add(quiz.student_id)
                if is_correct:
                    difficulty_stats[difficulty]['correct'] += 1
                current_avg = difficulty_stats[difficulty]['avg_score']
                total_before = difficulty_stats[difficulty]['total'] - 1
                difficulty_stats[difficulty]['avg_score'] = (current_avg * total_before + score) / difficulty_stats[difficulty]['total']
    
    print(f"DEBUG (analytics): Total questions processed: {total_questions_count}")
    print(f"DEBUG (analytics): CLO stats found: {len(clo_stats)}")
    print(f"DEBUG (analytics): Bloom stats found: {len(bloom_stats)}")
    print(f"DEBUG (analytics): CLO stats: {dict(clo_stats)}")
    print(f"DEBUG (analytics): Bloom stats: {dict(bloom_stats)}")
    
    # Convert to list and calculate percentages
    clo_list = []
    for clo, stats in sorted(clo_stats.items()):
        if stats['total'] > 0:
            success_rate = (stats['correct'] / stats['total']) * 100
            clo_list.append({
                'name': clo,
                'total': stats['total'],
                'correct': stats['correct'],
                'success_rate': round(success_rate, 1),
                'avg_score': round(stats['avg_score'], 1),
                'student_count': len(stats['students'])
            })
    
    bloom_list = []
    bloom_order = {
        'remember': 0, 'understand': 1, 'apply': 2, 
        'analyze': 3, 'evaluate': 4, 'create': 5
    }
    for bloom, stats in sorted(bloom_stats.items(), key=lambda x: bloom_order.get(x[0].lower(), 999)):
        if stats['total'] > 0:
            success_rate = (stats['correct'] / stats['total']) * 100
            bloom_list.append({
                'name': bloom,
                'total': stats['total'],
                'correct': stats['correct'],
                'success_rate': round(success_rate, 1),
                'avg_score': round(stats['avg_score'], 1),
                'student_count': len(stats['students'])
            })
    
    difficulty_list = []
    difficulty_order = {'easy': 0, 'medium': 1, 'hard': 2}
    for difficulty, stats in sorted(difficulty_stats.items(), key=lambda x: difficulty_order.get(x[0].lower(), 999)):
        if stats['total'] > 0:
            success_rate = (stats['correct'] / stats['total']) * 100
            difficulty_list.append({
                'name': difficulty,
                'total': stats['total'],
                'correct': stats['correct'],
                'success_rate': round(success_rate, 1),
                'avg_score': round(stats['avg_score'], 1),
                'student_count': len(stats['students'])
            })
    
    print(f"DEBUG (analytics): Final CLO list: {clo_list}")
    print(f"DEBUG (analytics): Final Bloom list: {bloom_list}")
    
    return {
        'clo': clo_list,
        'bloom': bloom_list,
        'difficulty': difficulty_list,
        'total_questions': total_questions_count,
        'total_completed_quizzes': len(completed_quizzes)
    }

# ============================================================
# ROUTE 1: Teacher Dashboard
# ============================================================

@insights_bp.route('/teacher/insights')
@login_required
def teacher_insights_dashboard():
    """Main insights dashboard for teachers"""
    if not current_user.is_teacher:
        flash('Access denied. Teacher permissions required.', 'danger')
        return redirect(url_for('courses.index'))
    
    # Get all courses taught by teacher
    courses = Course.query.filter_by(teacher_id=current_user.id).all()
    
    course_stats = []
    for course in courses:
        student_count = Enrollment.query.filter_by(course_id=course.id).count()
        
        # Get quiz count
        chapter_ids = [chapter.id for chapter in course.chapters]
        document_ids = []
        if chapter_ids:
            documents = Document.query.filter(Document.chapter_id.in_(chapter_ids)).all()
            document_ids = [doc.id for doc in documents]
        
        quiz_count = 0
        if document_ids:
            quiz_count = Quiz.query.filter(Quiz.document_id.in_(document_ids)).count()
        
        # Calculate average score
        avg_score = 0
        if quiz_count > 0 and document_ids:
            result = db.session.query(func.avg(Quiz.score).label('avg_score')).filter(
                Quiz.document_id.in_(document_ids),
                Quiz.score.isnot(None)
            ).first()
            avg_score = round(result.avg_score, 2) if result.avg_score else 0
        
        course_stats.append({
            'course': course,
            'student_count': student_count,
            'quiz_count': quiz_count,
            'avg_score': avg_score
        })
    
    return render_template(
        'insights/teacher_dashboard.html',
        title='Teacher Insights Dashboard',
        courses=courses,
        course_stats=course_stats
    )


# ============================================================
# ROUTES: Class dashboards (teacher / superuser)
# ============================================================

@insights_bp.route('/teacher/classes')
@login_required
def teacher_classes_list():
    if not current_user.is_teacher and not getattr(current_user, 'is_superuser', False):
        abort(403)

    if getattr(current_user, 'is_superuser', False):
        from app.models import Classe
        classes = Classe.query.order_by(Classe.name.asc()).all()
    else:
        classes = _teacher_classes(current_user.id)

    return render_template('insights/class_list.html', title='Classes', classes=classes)


@insights_bp.route('/teacher/classes/<int:class_id>/dashboard')
@login_required
def class_dashboard(class_id):
    if not current_user.is_teacher and not getattr(current_user, 'is_superuser', False):
        abort(403)

    # Access control: teacher must have at least one student in the class
    if not getattr(current_user, 'is_superuser', False):
        allowed = {c.id for c in _teacher_classes(current_user.id)}
        if class_id not in allowed:
            abort(403)

    from app.models import Classe
    class_obj = Classe.query.get_or_404(class_id)
    analytics = _class_quiz_analytics(class_id)
    return render_template(
        'insights/class_dashboard.html',
        title=f"Classe — {class_obj.name}",
        class_obj=class_obj,
        analytics=analytics,
    )


# ============================================================
# ROUTE: Student Dashboard (self)
# ============================================================

@insights_bp.route('/student/dashboard')
@login_required
def student_dashboard():
    """Student dashboard: quizzes, scores, Bloom/CLO/Difficulty, modules."""
    if current_user.is_teacher:
        return redirect(url_for('insights.teacher_insights_dashboard'))

    student = current_user
    enrollments = Enrollment.query.filter_by(student_id=student.id).order_by(Enrollment.enrolled_at.desc()).all()
    course_ids = [e.course_id for e in enrollments]

    analytics = _student_quiz_analytics(student.id, course_ids=course_ids)
    courses_summary = _student_courses_summary(student.id, course_ids)

    recent_quizzes = analytics['quizzes'][:8]

    return render_template(
        'insights/student_dashboard.html',
        title='Student Dashboard',
        student=student,
        enrollments=enrollments,
        courses_summary=courses_summary,
        bloom_stats=analytics['bloom'],
        clo_stats=analytics['clo'],
        difficulty_stats=analytics['difficulty'],
        avg_score=analytics['avg_score'],
        total_questions=analytics['total_questions'],
        completed_quiz_count=analytics['completed_quiz_count'],
        recent_quizzes=recent_quizzes,
        viewer_is_teacher=False,
    )


# ============================================================
# ROUTE: Teacher view of a student's dashboard
# ============================================================

@insights_bp.route('/teacher/students/<int:student_id>/dashboard')
@login_required
def teacher_student_dashboard(student_id):
    """Teacher-facing dashboard for one student (cleaner than the legacy insights view)."""
    if not current_user.is_teacher and not getattr(current_user, 'is_superuser', False):
        abort(403)

    student = User.query.filter_by(id=student_id, is_teacher=False).first_or_404()

    # Access control: teacher must be linked to student (unless superuser)
    if not getattr(current_user, 'is_superuser', False):
        if not current_user.has_student(student):
            flash('Access denied. This student is not associated with you.', 'danger')
            return redirect(url_for('auth.manage_students'))

        teacher_course_ids = [c.id for c in Course.query.filter_by(teacher_id=current_user.id).all()]
        enrollments = Enrollment.query.filter(
            Enrollment.student_id == student.id,
            Enrollment.course_id.in_(teacher_course_ids) if teacher_course_ids else False
        ).order_by(Enrollment.enrolled_at.desc()).all()
        course_ids = [e.course_id for e in enrollments]
    else:
        enrollments = Enrollment.query.filter_by(student_id=student.id).order_by(Enrollment.enrolled_at.desc()).all()
        course_ids = [e.course_id for e in enrollments]

    analytics = _student_quiz_analytics(student.id, course_ids=course_ids)
    courses_summary = _student_courses_summary(student.id, course_ids)
    recent_quizzes = analytics['quizzes'][:8]

    return render_template(
        'insights/student_dashboard.html',
        title=f"Dashboard — {student.username}",
        student=student,
        enrollments=enrollments,
        courses_summary=courses_summary,
        bloom_stats=analytics['bloom'],
        clo_stats=analytics['clo'],
        difficulty_stats=analytics['difficulty'],
        avg_score=analytics['avg_score'],
        total_questions=analytics['total_questions'],
        completed_quiz_count=analytics['completed_quiz_count'],
        recent_quizzes=recent_quizzes,
        viewer_is_teacher=True,
    )


# ============================================================
# ROUTE 2: Course Insights with CLO/Bloom Analytics
# ============================================================

# ============================================================
# UPDATED: Course Insights Route with Complete Analytics
# Replace the course_insights() function in insights_routes.py
# ============================================================

@insights_bp.route('/teacher/insights/course/<int:course_id>')
@login_required
def course_insights(course_id):
    """
    Insights for a specific course with:
    - Student performance statistics
    - Class overall performance
    - CLO and Bloom's taxonomy analytics
    - Chapter performance analysis
    """
    if not current_user.is_teacher:
        flash('Access denied. Teacher permissions required.', 'danger')
        return redirect(url_for('courses.index'))
    
    # Check if course belongs to teacher
    course = Course.query.filter_by(id=course_id, teacher_id=current_user.id).first_or_404()
    
    # DEBUG: Print course info
    print(f"DEBUG: Course {course.title} (ID: {course_id})")
    
    # ============================================================
    # GET DOCUMENTS - TRY MULTIPLE WAYS
    # ============================================================
    
    # Method 1: Get documents directly from course
    documents_direct = Document.query.filter_by(course_id=course_id).all()
    print(f"DEBUG: Found {len(documents_direct)} documents directly from course")
    
    # Method 2: Get documents through chapters
    chapters = Chapter.query.filter_by(course_id=course_id).all()
    print(f"DEBUG: Found {len(chapters)} chapters")
    
    chapter_ids = [chapter.id for chapter in chapters]
    documents_from_chapters = []
    if chapter_ids:
        documents_from_chapters = Document.query.filter(Document.chapter_id.in_(chapter_ids)).all()
        print(f"DEBUG: Found {len(documents_from_chapters)} documents from chapters")
    
    # Combine both sources
    all_document_ids = set()
    for doc in documents_direct:
        all_document_ids.add(doc.id)
    for doc in documents_from_chapters:
        all_document_ids.add(doc.id)
    
    document_ids = list(all_document_ids)
    print(f"DEBUG: Total unique document IDs: {len(document_ids)} - {document_ids}")
    
    # ============================================================
    # SECTION 1: Get enrolled students with their performance
    # ============================================================
    enrollments = Enrollment.query.filter_by(course_id=course_id).all()
    print(f"DEBUG: Found {len(enrollments)} enrollments")
    
    enrolled_students = []
    all_scores = []
    total_completed_quizzes_class = 0
    
    for enrollment in enrollments:
        student = User.query.get(enrollment.student_id)
        print(f"DEBUG: Processing student {student.username}")
        
        # Get quiz statistics for this student
        total_quizzes = 0
        avg_score = 0
        completed_quizzes = 0
        
        if document_ids:
            # Total quizzes started
            total_quizzes = Quiz.query.filter(
                Quiz.student_id == student.id,
                Quiz.document_id.in_(document_ids)
            ).count()
            print(f"  - Total quizzes: {total_quizzes}")
            
            # Completed quizzes
            student_completed_quizzes = Quiz.query.filter(
                Quiz.student_id == student.id,
                Quiz.document_id.in_(document_ids),
                Quiz.completed_at.isnot(None)
            ).all()
            
            completed_quizzes = len(student_completed_quizzes)
            print(f"  - Completed quizzes: {completed_quizzes}")
            
            total_completed_quizzes_class += completed_quizzes
            
            # Average score
            if completed_quizzes > 0:
                scores = [q.score for q in student_completed_quizzes if q.score is not None]
                print(f"  - Scores: {scores}")
                if scores:
                    avg_score = sum(scores) / len(scores)
                    all_scores.extend(scores)
                    print(f"  - Avg score: {avg_score}")
        
        # Get engagement (chat sessions)
        engagement = 0
        if document_ids:
            engagement = ChatSession.query.filter(
                ChatSession.user_id == student.id,
                ChatSession.document_id.in_(document_ids)
            ).count()
        
        enrolled_students.append({
            'student': student,
            'enrolled_at': enrollment.enrolled_at,
            'total_quizzes': total_quizzes,
            'completed_quizzes': completed_quizzes,
            'avg_score': round(avg_score, 1),
            'engagement': engagement
        })
    
    print(f"DEBUG: Total all_scores: {all_scores}")
    print(f"DEBUG: Total completed quizzes class: {total_completed_quizzes_class}")
    
    # Sort by average score (descending)
    enrolled_students.sort(key=lambda x: x['avg_score'], reverse=True)
    
    # Limit to first 50 students for display
    enrolled_students_paginated = enrolled_students[:50]
    
    # Convert to enumerated list for template
    enrolled_students_with_index = list(enumerate(enrolled_students_paginated))
    
    # ============================================================
    # SECTION 2: Class Overall Statistics
    # ============================================================
    class_stats = {
        'total_students': len(enrolled_students),
        'avg_class_score': 0,
        'highest_score': 0,
        'lowest_score': 100,
        'total_quizzes_completed': total_completed_quizzes_class,
        'class_engagement': 0
    }
    
    if all_scores:
        class_stats['avg_class_score'] = round(sum(all_scores) / len(all_scores), 1)
        class_stats['highest_score'] = round(max(all_scores), 1)
        class_stats['lowest_score'] = round(min(all_scores), 1)
    else:
        # Default values when no scores
        class_stats['lowest_score'] = 0
    
    # Calculate class engagement
    class_stats['class_engagement'] = sum([s['engagement'] for s in enrolled_students])
    
    print(f"DEBUG: Class stats: {class_stats}")
    
    # ============================================================
    # SECTION 3: Get performance by chapter
    # ============================================================
    chapter_performance = []
    chapters_ordered = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).all()
    
    for chapter in chapters_ordered:
        documents = Document.query.filter_by(chapter_id=chapter.id).all()
        document_ids_chapter = [doc.id for doc in documents]
        
        if not document_ids_chapter:
            continue
        
        # Get all quizzes for this chapter
        chapter_quizzes = Quiz.query.filter(
            Quiz.document_id.in_(document_ids_chapter),
            Quiz.score.isnot(None),
            Quiz.completed_at.isnot(None)
        ).all()
        
        if not chapter_quizzes:
            continue
        
        scores = [q.score for q in chapter_quizzes]
        avg_score = sum(scores) / len(scores) if scores else 0
        quiz_count = len(chapter_quizzes)
        
        chapter_performance.append({
            'chapter': chapter.title,
            'avg_score': round(avg_score, 1),
            'quiz_count': quiz_count,
            'highest_score': round(max(scores), 1) if scores else 0,
            'lowest_score': round(min(scores), 1) if scores else 0
        })
    
    print(f"DEBUG: Chapter performance: {chapter_performance}")
    
    # ============================================================
    # SECTION 4: Get CLO and Bloom analytics
    # ============================================================
    clo_bloom_analytics = get_clo_bloom_analytics_from_completed_quizzes(course_id)
    print(f"DEBUG: Total questions: {clo_bloom_analytics['total_questions']}")
    print(f"DEBUG: Total completed quizzes (analytics): {clo_bloom_analytics['total_completed_quizzes']}")
    print(f"DEBUG: CLO analytics: {clo_bloom_analytics['clo']}")
    print(f"DEBUG: Bloom analytics: {clo_bloom_analytics['bloom']}")
    
    # ============================================================
    # SECTION 5: Student performance distribution
    # ============================================================
    performance_distribution = {
        'excellent': 0,  # 90-100%
        'good': 0,       # 70-89%
        'satisfactory': 0,  # 50-69%
        'poor': 0        # 0-49%
    }
    
    for student in enrolled_students:
        score = student['avg_score']
        if score >= 90:
            performance_distribution['excellent'] += 1
        elif score >= 70:
            performance_distribution['good'] += 1
        elif score >= 50:
            performance_distribution['satisfactory'] += 1
        else:
            performance_distribution['poor'] += 1
    
    print(f"DEBUG: Performance distribution: {performance_distribution}")
    
    # ============================================================
    # SECTION 6: Quiz completion rate
    # ============================================================
    total_possible_quizzes = 0
    if document_ids:
        total_possible_quizzes = Quiz.query.filter(
            Quiz.document_id.in_(document_ids)
        ).count()
    
    quiz_completion_rate = 0
    if total_possible_quizzes > 0:
        quiz_completion_rate = round((total_completed_quizzes_class / total_possible_quizzes) * 100, 1)
    
    print(f"DEBUG: Total possible quizzes: {total_possible_quizzes}, Completion rate: {quiz_completion_rate}%")
    
    # ============================================================
    # SECTION 7: Top performing CLOs and Bloom levels
    # ============================================================
    top_clos = sorted(
        clo_bloom_analytics['clo'], 
        key=lambda x: x['success_rate'], 
        reverse=True
    )[:5]
    
    bottom_clos = sorted(
        clo_bloom_analytics['clo'], 
        key=lambda x: x['success_rate']
    )[:5]
    
    top_bloom = sorted(
        clo_bloom_analytics['bloom'], 
        key=lambda x: x['success_rate'], 
        reverse=True
    )[:3]
    
    bottom_bloom = sorted(
        clo_bloom_analytics['bloom'], 
        key=lambda x: x['success_rate']
    )[:3]
    
    print(f"DEBUG: Top CLOs: {top_clos}")
    print(f"DEBUG: Top Bloom: {top_bloom}")
    
    return render_template(
        'insights/course_insights.html',
        title=f'Insights for {course.title}',
        course=course,
        enrolled_students=enrolled_students_with_index,
        total_students=len(enrolled_students),
        chapter_performance=chapter_performance,
        clo_analytics=clo_bloom_analytics['clo'],
        bloom_analytics=clo_bloom_analytics['bloom'],
        difficulty_analytics=clo_bloom_analytics['difficulty'],
        total_questions=clo_bloom_analytics['total_questions'],
        total_completed_quizzes=clo_bloom_analytics['total_completed_quizzes'],
        class_stats=class_stats,
        performance_distribution=performance_distribution,
        quiz_completion_rate=quiz_completion_rate,
        top_clos=top_clos,
        bottom_clos=bottom_clos,
        top_bloom=top_bloom,
        bottom_bloom=bottom_bloom
    )


@insights_bp.route('/api/insights/student/<int:student_id>/activity')
@login_required
def student_activity_api(student_id):
    """API endpoint for student activity data - for AJAX charts"""
    if not current_user.is_teacher:
        return jsonify({'error': 'Access denied'}), 403
    
    # Verify the student exists
    student = User.query.filter_by(id=student_id, is_teacher=False).first_or_404()
    
    # Check if the student is enrolled in any of the teacher's courses
    student_enrollments = db.session.query(Enrollment)\
        .join(Course, Enrollment.course_id == Course.id)\
        .filter(
            Enrollment.student_id == student_id,
            Course.teacher_id == current_user.id
        ).all()
    
    if not student_enrollments:
        return jsonify({'error': 'Student not enrolled in your courses'}), 403
    
    # Get course IDs where the student is enrolled
    course_ids = [enrollment.course_id for enrollment in student_enrollments]
    
    # Get document IDs from the courses the student is enrolled in
    chapter_ids = []
    for course_id in course_ids:
        chapters = Chapter.query.filter_by(course_id=course_id).all()
        chapter_ids.extend([chapter.id for chapter in chapters])
    
    document_ids = []
    if chapter_ids:
        documents = Document.query.filter(Document.chapter_id.in_(chapter_ids)).all()
        document_ids = [doc.id for doc in documents]
    
    # Get activity data for the last 30 days
    days = 30
    data = {
        'dates': [],
        'quiz_count': [],
        'chat_count': []
    }
    
    today = datetime.now().date()
    
    for i in range(days-1, -1, -1):
        date = today - timedelta(days=i)
        data['dates'].append(date.strftime('%b %d'))
        
        # Count quizzes on this date
        quiz_count = 0
        if document_ids:
            quiz_count = Quiz.query.filter(
                Quiz.student_id == student_id,
                Quiz.document_id.in_(document_ids),
                func.date(Quiz.created_at) == date
            ).count()
        
        data['quiz_count'].append(quiz_count)
        
        # Count chat sessions on this date
        chat_count = 0
        if document_ids:
            chat_count = ChatSession.query.filter(
                ChatSession.user_id == student_id,
                ChatSession.document_id.in_(document_ids),
                func.date(ChatSession.created_at) == date
            ).count()
        
        data['chat_count'].append(chat_count)
    
    return jsonify(data)

@insights_bp.route('/teacher/insights/student/<int:student_id>/course/<int:course_id>')
@login_required
def student_course_details(student_id, course_id):
    """Detailed insights for a student in a specific course"""
    if not current_user.is_teacher:
        flash('Access denied. Teacher permissions required.', 'danger')
        return redirect(url_for('courses.index'))
    
    student = User.query.filter_by(id=student_id, is_teacher=False).first_or_404()
    course = Course.query.filter_by(id=course_id, teacher_id=current_user.id).first_or_404()
    
    enrollment = Enrollment.query.filter_by(
        student_id=student_id,
        course_id=course_id
    ).first_or_404()
    
    # Get chapters for course
    chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).all()
    chapter_data = []
    
    for chapter in chapters:
        documents = Document.query.filter_by(chapter_id=chapter.id).all()
        document_data = []
        
        chapter_quiz_count = 0
        chapter_avg_score = 0
        total_quiz_scores = 0
        quiz_count_with_scores = 0
        
        for document in documents:
            doc_quizzes = Quiz.query.filter_by(
                document_id=document.id,
                student_id=student_id
            ).order_by(Quiz.created_at.desc()).all()
            
            document_quiz_count = len(doc_quizzes)
            document_avg_score = 0
            
            if document_quiz_count > 0:
                doc_scores = [q.score for q in doc_quizzes if q.score is not None]
                if doc_scores:
                    document_avg_score = sum(doc_scores) / len(doc_scores)
                    total_quiz_scores += sum(doc_scores)
                    quiz_count_with_scores += len(doc_scores)
            
            chat_sessions = ChatSession.query.filter_by(
                document_id=document.id,
                user_id=student_id
            ).order_by(ChatSession.created_at.desc()).all()
            
            document_chat_data = []
            
            for chat in chat_sessions:
                messages = ChatMessage.query.filter_by(session_id=chat.id).order_by(ChatMessage.timestamp).all()
                
                duration = None
                if messages:
                    last_message = messages[-1]
                    duration = (last_message.timestamp - chat.created_at).total_seconds() / 60
                
                document_chat_data.append({
                    'session': chat,
                    'message_count': len(messages),
                    'messages': messages,
                    'duration': round(duration, 1) if duration else None
                })
            
            chapter_quiz_count += document_quiz_count
            
            document_data.append({
                'document': document,
                'quizzes': doc_quizzes,
                'quiz_count': document_quiz_count,
                'avg_score': document_avg_score,
                'chat_sessions': document_chat_data,
                'chat_count': len(document_chat_data)
            })
        
        if quiz_count_with_scores > 0:
            chapter_avg_score = total_quiz_scores / quiz_count_with_scores
        
        chapter_data.append({
            'chapter': chapter,
            'documents': document_data,
            'quiz_count': chapter_quiz_count,
            'avg_score': chapter_avg_score
        })
    
    return render_template(
        'insights/student_course_details.html',
        title=f'{student.username} - {course.title}',
        student=student,
        course=course,
        enrollment=enrollment,
        chapters=chapter_data
    )


# Add this function to the insights_routes.py file

def get_teacher_students(teacher_id):
    """Get all students for a specific teacher"""
    teacher = User.query.get_or_404(teacher_id)
    if not teacher.is_teacher:
        return []
    
    return teacher.get_all_students()

# Then update all relevant routes in insights_routes.py to only show students for this teacher



@insights_bp.route('/teacher/insights/student/<int:student_id>')
@login_required
def student_insights(student_id):
    """Detailed insights for a specific student"""
    # Import needed modules at the beginning of the function
    from sqlalchemy import func, extract, text
    import calendar
    from datetime import datetime
    
    if not current_user.is_teacher:
        flash('Access denied. Teacher permissions required.', 'danger')
        return redirect(url_for('courses.index'))
    
    # Verify the student exists
    student = User.query.filter_by(id=student_id, is_teacher=False).first_or_404()
    
    # Check if student belongs to this teacher
    is_teacher_student = False
    try:
        if hasattr(current_user, 'has_student'):
            is_teacher_student = current_user.has_student(student)
        
        if not is_teacher_student:
            # Try direct query to the association table
            result = db.session.execute(text(
                "SELECT 1 FROM teacher_student WHERE teacher_id = :teacher_id AND student_id = :student_id"
            ), {"teacher_id": current_user.id, "student_id": student_id}).fetchone()
            
            is_teacher_student = result is not None
        
        if not is_teacher_student:
            flash('Access denied. This student is not associated with you.', 'danger')
            return redirect(url_for('insights.teacher_insights_dashboard'))
    except Exception as e:
        print(f"Error checking teacher-student relationship: {e}")
        flash('Error checking student relationship. Please try again.', 'danger')
        return redirect(url_for('insights.teacher_insights_dashboard'))
    
    # Get basic student info
    try:
        # Find enrollments in teacher's courses
        course_ids = [course.id for course in current_user.courses_created]
        student_enrollments = Enrollment.query.filter(
            Enrollment.student_id == student_id,
            Enrollment.course_id.in_(course_ids) if course_ids else False
        ).all()
        
        courses_enrolled = []
        for enrollment in student_enrollments:
            course = Course.query.get(enrollment.course_id)
            if course:
                courses_enrolled.append({
                    'course': course,
                    'enrolled_at': enrollment.enrolled_at
                })
    except Exception as e:
        print(f"Error getting student enrollments: {e}")
        courses_enrolled = []
    
    # Get quiz statistics
    try:
        # Get document IDs from the courses the student is enrolled in
        chapter_ids = []
        for course_id in course_ids:
            chapters = Chapter.query.filter_by(course_id=course_id).all()
            chapter_ids.extend([chapter.id for chapter in chapters])
        
        document_ids = []
        if chapter_ids:
            documents = Document.query.filter(Document.chapter_id.in_(chapter_ids)).all()
            document_ids = [doc.id for doc in documents]
        
        # Get quiz data
        student_quizzes = []
        if document_ids:
            quizzes = Quiz.query.filter(
                Quiz.student_id == student_id,
                Quiz.document_id.in_(document_ids)
            ).order_by(Quiz.created_at.desc()).all()
            
            for quiz in quizzes:
                document = Document.query.get(quiz.document_id) if quiz.document_id else None
                chapter = Chapter.query.get(document.chapter_id) if document else None
                course = Course.query.get(chapter.course_id) if chapter else None
                
                correct_answers = QuizQuestion.query.filter(
                    QuizQuestion.quiz_id == quiz.id,
                    QuizQuestion.is_correct == True
                ).count()
                
                total_questions = QuizQuestion.query.filter(
                    QuizQuestion.quiz_id == quiz.id
                ).count()
                
                student_quizzes.append({
                    'quiz': quiz,
                    'document': document,
                    'chapter': chapter,
                    'course': course,
                    'correct_answers': correct_answers,
                    'total_questions': total_questions
                })
    except Exception as e:
        print(f"Error getting quiz data: {e}")
        student_quizzes = []
    
    # Get chat session data
    try:
        chat_sessions = []
        if document_ids:
            sessions = ChatSession.query.filter(
                ChatSession.user_id == student_id,
                ChatSession.document_id.in_(document_ids)
            ).order_by(ChatSession.created_at.desc()).all()
            
            for session in sessions:
                document = Document.query.get(session.document_id)
                chapter = Chapter.query.get(document.chapter_id) if document else None
                course = Course.query.get(chapter.course_id) if chapter else None
                
                # Count messages in this session
                message_count = ChatMessage.query.filter_by(session_id=session.id).count()
                user_messages = ChatMessage.query.filter_by(
                    session_id=session.id, 
                    is_user=True
                ).count()
                
                # Get the last message timestamp to calculate session duration
                last_message = ChatMessage.query.filter_by(session_id=session.id)\
                    .order_by(ChatMessage.timestamp.desc()).first()
                
                duration = None
                if last_message:
                    duration = (last_message.timestamp - session.created_at).total_seconds() / 60  # in minutes
                
                chat_sessions.append({
                    'session': session,
                    'document': document,
                    'chapter': chapter,
                    'course': course,
                    'message_count': message_count,
                    'user_messages': user_messages,
                    'duration': round(duration, 1) if duration else None
                })
    except Exception as e:
        print(f"Error getting chat sessions: {e}")
        chat_sessions = []
    
    # Get login/logout activity
    try:
        login_sessions = UserSession.query.filter_by(user_id=student_id)\
            .order_by(UserSession.login_time.desc())\
            .limit(30).all()
    except Exception as e:
        print(f"Error getting login sessions: {e}")
        login_sessions = []
    
    # Calculate activity statistics
    try:
        # Calculate total time spent (from login sessions)
        total_session_time = 0
        completed_sessions = [s for s in login_sessions if s.logout_time is not None]
        for session in completed_sessions:
            total_session_time += (session.logout_time - session.login_time).total_seconds() / 60  # in minutes
        
        # Calculate session activity
        session_dates = [session.login_time.date() for session in login_sessions]
        unique_session_dates = len(set(session_dates))
        
        # Last login date
        last_login = login_sessions[0].login_time if login_sessions else None
        
        # Calculate average session time
        avg_session_time = round(total_session_time / len(completed_sessions), 1) if completed_sessions else 0
        
        # Calculate quiz time (if completions are tracked)
        quiz_time = 0
        completed_quizzes = [q['quiz'] for q in student_quizzes if q['quiz'].completed_at is not None]
        for quiz in completed_quizzes:
            if quiz.created_at and quiz.completed_at:
                quiz_time += (quiz.completed_at - quiz.created_at).total_seconds() / 60  # in minutes
        
        # Calculate chat session time
        chat_time = sum([s['duration'] for s in chat_sessions if s['duration'] is not None])
        
        # Total estimated study time
        total_study_time = total_session_time  # Use login sessions as the primary metric
    except Exception as e:
        print(f"Error calculating activity statistics: {e}")
        total_study_time = 0
        avg_session_time = 0
        unique_session_dates = 0
        last_login = None
        quiz_time = 0
        chat_time = 0
    
    # Calculate monthly activity
    try:
        current_year = datetime.utcnow().year
        monthly_activity = [0] * 12  # Initialize with zeros for each month
        
        # Count login activity by month
        monthly_login_counts = db.session.query(
            extract('month', UserSession.login_time).label('month'),
            func.count(UserSession.id).label('count')
        ).filter(
            UserSession.user_id == student_id,
            extract('year', UserSession.login_time) == current_year
        ).group_by('month').all()
        
        for month, count in monthly_login_counts:
            if 1 <= month <= 12:
                monthly_activity[int(month)-1] += count
        
        # Count quiz activity by month
        if document_ids:
            monthly_quiz_counts = db.session.query(
                extract('month', Quiz.created_at).label('month'),
                func.count(Quiz.id).label('count')
            ).filter(
                Quiz.student_id == student_id,
                Quiz.document_id.in_(document_ids),
                extract('year', Quiz.created_at) == current_year
            ).group_by('month').all()
            
            for month, count in monthly_quiz_counts:
                if 1 <= month <= 12:
                    monthly_activity[int(month)-1] += count
        
        # Format for chart
        import json
        activity_labels = [calendar.month_name[i+1] for i in range(12)]
        activity_data = monthly_activity
    except Exception as e:
        print(f"Error calculating monthly activity: {e}")
        activity_labels = [calendar.month_name[i+1] for i in range(12)]
        activity_data = [0] * 12
    
    # Get performance by course
    try:
        performance_by_course = []
        
        for course_id in course_ids:
            course = Course.query.get(course_id)
            if not course:
                continue
                
            chapters = Chapter.query.filter_by(course_id=course_id).all()
            chapter_ids = [chapter.id for chapter in chapters]
            
            course_documents = []
            if chapter_ids:
                course_documents = Document.query.filter(Document.chapter_id.in_(chapter_ids)).all()
            
            document_ids = [doc.id for doc in course_documents]
            
            avg_score = 0
            quiz_count = 0
            
            if document_ids:
                # Get average quiz score for this course
                result = db.session.query(func.avg(Quiz.score).label('avg_score')).filter(
                    Quiz.student_id == student_id,
                    Quiz.document_id.in_(document_ids),
                    Quiz.score.isnot(None)
                ).first()
                
                avg_score = round(result.avg_score , 2) if result.avg_score else 0
                
                # Get quiz count
                quiz_count = Quiz.query.filter(
                    Quiz.student_id == student_id,
                    Quiz.document_id.in_(document_ids)
                ).count()
            
            # Skip courses with no quiz activity
            if quiz_count > 0:
                performance_by_course.append({
                    'course': course.title,
                    'avg_score': avg_score,
                    'quiz_count': quiz_count
                })
    except Exception as e:
        print(f"Error calculating course performance: {e}")
        performance_by_course = []
    
    # Make sure to return a proper response
    return render_template(
        'insights/student_insights.html',
        title=f'Insights for {student.username}',
        student=student,
        courses_enrolled=courses_enrolled,
        student_quizzes=student_quizzes,
        chat_sessions=chat_sessions,
        login_sessions=login_sessions,
        total_study_time=round(total_study_time, 1),
        avg_session_time=avg_session_time,
        unique_session_dates=unique_session_dates,
        last_login=last_login,
        quiz_time=round(quiz_time, 1),
        chat_time=round(chat_time, 1),
        activity_labels=json.dumps(activity_labels),
        activity_data=json.dumps(activity_data),
        performance_by_course=performance_by_course
    )