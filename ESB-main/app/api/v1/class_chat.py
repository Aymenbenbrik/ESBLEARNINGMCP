"""Class group chat API v1

Provides a Messenger/WhatsApp-style group chat per class (Classe), with an optional
chatbot assistant.

Behavior:
- Students in the class can read/write messages.
- Teachers assigned to the class (via ClassCourseAssignment) can read/write.
- Superusers can access any class.

Chatbot:
- If a message contains @bot / @assistant / @chatbot (case-insensitive), the system
  generates a bot reply and stores it as a message (is_bot=True).
- If not tagged, the bot does not reply, but messages are still stored and used
  as context for future tagged questions.

This is implemented as a simple polling-based API (no websockets) to keep the
system deployable with minimal extra infrastructure.
"""

import re
import logging
from typing import List, Optional

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

from app import db
from app.models import (
    Classe,
    User,
    Course,
    Enrollment,
    Document,
    ClassCourseAssignment,
    ClassChatRoom,
    ClassChatMessage,
)
from app.api.v1.utils import get_current_user

logger = logging.getLogger(__name__)


class_chat_api_bp = Blueprint('class_chat_api', __name__, url_prefix='/class-chat')


BOT_TAG_RE = re.compile(r'@(?:bot|assistant|chatbot)\b', flags=re.IGNORECASE)

# Basic PII redaction for public class chat (best-effort)
EMAIL_RE = re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', flags=re.IGNORECASE)
PHONE_RE = re.compile(r'(?:\+?\d[\d\s().-]{7,}\d)')


def _redact_pii(text: str) -> str:
    """Best-effort redaction of obvious PII (email/phone) from bot replies."""
    if not text:
        return text
    redacted = EMAIL_RE.sub('[email removed]', text)
    redacted = PHONE_RE.sub('[phone removed]', redacted)
    return redacted


def _detect_language(text: str) -> str:
    """Very small language heuristic (fr/ar/en) to keep answers consistent."""
    if not text:
        return 'en'

    t = text.lower()
    # Arabic unicode block
    if re.search(r'[\u0600-\u06FF]', text):
        return 'ar'

    # French keywords
    fr_markers = [
        'bonjour', 'salut', 'svp', "s'il vous", 'classe', 'cours', 'module',
        'inscrit', 'inscrite', 'inscription', 'quelles', 'quel', 'dans quelle',
        'étudiant', 'etudiant', 'enseignant', 'prof', 'programme',
    ]
    if any(k in t for k in fr_markers):
        return 'fr'

    return 'en'


def _get_class_courses(classe: Classe) -> List[Course]:
    """Return the list of courses/modules associated with a class."""
    assignments = ClassCourseAssignment.query.filter_by(class_id=classe.id).all()
    course_ids = sorted({a.course_id for a in assignments}) if assignments else []

    if not course_ids and classe.program_id and classe.program:
        try:
            return list(classe.program.courses)
        except Exception:
            return []

    if not course_ids:
        return []

    return Course.query.filter(Course.id.in_(course_ids)).order_by(Course.title).all()


def _get_class_teachers(classe: Classe) -> List[User]:
    """Return teachers assigned to the class (via assignments or course owners)."""
    teacher_ids = set()
    assignments = ClassCourseAssignment.query.filter_by(class_id=classe.id).all()
    for a in assignments:
        if a.teacher_id:
            teacher_ids.add(a.teacher_id)
        elif a.course and a.course.teacher_id:
            teacher_ids.add(a.course.teacher_id)

    if not teacher_ids:
        return []

    return User.query.filter(User.id.in_(sorted(teacher_ids))).order_by(User.username).all()


def _get_class_students(classe: Classe, limit: int = 200) -> List[User]:
    q = (
        User.query
        .filter(
            User.class_id == classe.id,
            User.is_teacher.is_(False),
            User.is_superuser.is_(False),
        )
        .order_by(User.username)
    )
    if limit:
        q = q.limit(limit)
    return q.all()


def _get_user_courses(user: User) -> List[Course]:
    try:
        enrollments = user.enrollments.all()  # dynamic relationship
    except Exception:
        enrollments = Enrollment.query.filter_by(student_id=user.id).all()

    course_ids = sorted({e.course_id for e in enrollments}) if enrollments else []
    if not course_ids:
        return []
    return Course.query.filter(Course.id.in_(course_ids)).order_by(Course.title).all()


def _get_class_quiz_documents(classe: Classe, limit: int = 20) -> List[Document]:
    """Return quiz-type documents for courses linked to this class.

    This is *class-level* information and is safe to share in the group chat.
    """
    courses = _get_class_courses(classe)
    course_ids = [c.id for c in courses]
    if not course_ids:
        return []

    q = (
        Document.query
        .filter(Document.course_id.in_(course_ids), Document.document_type == 'quiz')
        .order_by(Document.created_at.desc())
    )
    if limit:
        q = q.limit(max(1, min(int(limit), 100)))
    return q.all()


def _is_sensitive_request(text: str) -> bool:
    """Detect requests that are likely to involve private student data.

    We keep this lightweight and conservative: when in doubt, treat as sensitive
    and avoid leaking personal information in a public class chat.
    """
    if not text:
        return False
    t = text.lower()
    # Allow obvious aggregate/class-wide analytics requests (no personal attribution).
    aggregate_ok = [
        r'\b(moyenne|average|taux\s+de\s+reussite|taux\s+de\s+réussite|success\s+rate)\b.*\b(classe|class)\b',
        r'\b(classe|class)\b.*\b(moyenne|average|taux\s+de\s+reussite|taux\s+de\s+réussite|success\s+rate)\b',
    ]
    if any(re.search(p, t) for p in aggregate_ok):
        return False

    patterns = [
        r'\b(note|notes|score|resultat|résultat|moyenne|grade|grades)\b',
        r'\b(mon\s+score|ma\s+note|mes\s+notes|my\s+score|my\s+grade)\b',
        r'\b(qui\s+n[’\']?a\s+pas|who\s+hasn\'t)\b.*\b(quiz|quizz|test|exam)\b',
        r'\b(enrol|enroll|inscrit|inscription)\b',
    ]
    return any(re.search(p, t) for p in patterns)


def _privacy_safe_reply(lang: str) -> str:
    """Default safe reply when a user asks for personal data inside class chat."""
    if lang == 'fr':
        return (
            "🔒 Pour protéger la vie privée, je ne partage pas d'informations personnelles "
            "(notes, scores, état de complétion, inscriptions) dans le chat de classe.\n\n"
            "➡️ Consulte **My Dashboard** pour tes informations personnelles."
        )
    if lang == 'ar':
        return (
            "🔒 لحماية الخصوصية، لا أشارك المعلومات الشخصية (العلامات/النتائج/حالة الإكمال/التسجيل) "
            "داخل دردشة المجموعة.\n\n"
            "➡️ راجع **My Dashboard** لمعرفة معلوماتك الشخصية."
        )
    return (
        "🔒 To protect privacy, I don't share personal information (grades, scores, completion status, enrollments) "
        "inside the class group chat.\n\n"
        "➡️ Please check **My Dashboard** for your personal details."
    )


def _maybe_answer_with_platform_data(user: User, classe: Classe, content: str) -> Optional[str]:
    """Handle a few common intents deterministically using platform DB data.

    This makes the bot feel connected to the platform (classes, courses, members)
    and avoids LLM hallucinations for simple questions.
    """
    if not content:
        return None

    t = content.strip().lower()
    lang = _detect_language(content)

    # Sensitive requests (grades/enrollments/completion status) should never be answered
    # with personal details in a public class chat.
    if _is_sensitive_request(content):
        return _privacy_safe_reply(lang)

    # Intent: quizzes available in this class (class-level only)
    quiz_patterns = [
        r'\bquiz\b',
        r'\bquizz\b',
        r'\btest\b',
        r'\bexamen\b',
    ]
    ask_patterns = [
        r'\by\s*a\s*-?t-?il\b',
        r'\best\s*-?ce\s*qu\b',
        r'\bdo\s+we\s+have\b',
        r'\bis\s+there\b',
        r'\bavez?-vous\b',
    ]
    if any(re.search(p, t) for p in quiz_patterns) and any(re.search(p, t) for p in ask_patterns):
        quiz_docs = _get_class_quiz_documents(classe, limit=10)
        if quiz_docs:
            # Map course_id -> title to avoid extra queries
            course_map = {c.id: c.title for c in _get_class_courses(classe)}
            lines = []
            for d in quiz_docs:
                c_title = course_map.get(d.course_id) if getattr(d, 'course_id', None) else None
                meta = []
                if c_title:
                    meta.append(c_title)
                if getattr(d, 'week_number', None):
                    meta.append(f"week {d.week_number}")
                meta_str = f" ({' • '.join(meta)})" if meta else ""
                lines.append(f"- {d.title}{meta_str}")

            if lang == 'fr':
                return (
                    f"📌 **Quiz disponibles** pour la classe **{classe.name}** :\n" +
                    "\n".join(lines) +
                    "\n\nℹ️ Pour voir **ton statut personnel** (fait/pas fait, score), consulte **My Dashboard**."
                )
            if lang == 'ar':
                return (
                    f"📌 **اختبارات متاحة** للمجموعة **{classe.name}**:\n" +
                    "\n".join(lines) +
                    "\n\nℹ️ لمعرفة **حالتك الشخصية** (تم/لم يتم، النتيجة)، راجع **My Dashboard**."
                )
            return (
                f"📌 **Available quizzes** for **{classe.name}**:\n" +
                "\n".join(lines) +
                "\n\nℹ️ For your **personal status** (done/not done, score), check **My Dashboard**."
            )

        if lang == 'fr':
            return (
                f"Je ne vois pas de quiz publié pour la classe **{classe.name}** pour le moment.\n\n"
                "Si un quiz vient d'être ajouté, actualise la page ou vérifie le module concerné."
            )
        if lang == 'ar':
            return (
                f"لا أرى اختبارًا منشورًا للمجموعة **{classe.name}** حاليًا.\n\n"
                "إذا تمت إضافة اختبار للتو، حدّث الصفحة أو تحقق من المادة." 
            )
        return (
            f"I don't see any published quiz for **{classe.name}** yet.\n\n"
            "If a quiz was just added, refresh the page or check the relevant course/module."
        )

    # Intent: enrollment / classes / courses (personal -> do not disclose in group chat)
    enroll_patterns = [
        r'\bwhat\s+classes\s+am\s+i\s+enrol',
        r'\bwhich\s+classes\s+am\s+i\s+enrol',
        r'\bwhat\s+courses\s+am\s+i\s+enrol',
        r'\bwhich\s+courses\s+am\s+i\s+enrol',
        r'\bmes\s+(classes|cours|modules)\b',
        r'\bquelles?\s+(classes|cours|modules)\b',
        r'\bdans\s+quelle\s+classe\b',
        r'\b(cours|modules)\s+suis-je\s+inscrit',
        r'\b(inscrit|inscription)\b.*\b(cours|module|classe)',
    ]
    if any(re.search(p, t) for p in enroll_patterns):
        # Personal info request -> redirect to private dashboard.
        return _privacy_safe_reply(lang)

    # Intent: list courses in this class
    class_courses_patterns = [
        r'\b(courses|modules)\b.*\b(this\s+class|our\s+class)\b',
        r'\bquels?\s+(cours|modules)\b',
        r'\bmodules?\s+de\s+la\s+classe\b',
    ]
    if any(re.search(p, t) for p in class_courses_patterns):
        courses = _get_class_courses(classe)
        lines = "\n".join([f"- {c.title}" for c in courses]) if courses else ""
        if lang == 'fr':
            if courses:
                return "\n".join([
                    f"Cours/Modules de la classe **{classe.name}** :",
                    lines,
                ])
            return f"Je ne vois pas encore de cours/modules associés à la classe **{classe.name}**."
        if lang == 'ar':
            if courses:
                return "\n".join([
                    f"المواد/الوحدات الخاصة بالمجموعة **{classe.name}**:",
                    lines,
                ])
            return f"لا أرى مواد/وحدات مرتبطة بالمجموعة **{classe.name}** بعد."
        if courses:
            return "\n".join([
                f"Courses/Modules in **{classe.name}**:",
                lines,
            ])
        return f"I don't see any courses/modules linked to **{classe.name}** yet."

    # Intent: teachers
    teacher_patterns = [
        r'\b(teacher|professor|instructor)\b',
        r'\benseignant\b',
        r'\bprof\b',
    ]
    if any(re.search(p, t) for p in teacher_patterns) and ('who' in t or 'qui' in t or "c'est" in t):
        teachers = _get_class_teachers(classe)
        if teachers:
            names = ", ".join([u.username for u in teachers])
            if lang == 'fr':
                return f"Enseignant(s) associé(s) à la classe **{classe.name}** : {names}"
            if lang == 'ar':
                return f"الأساتذة المرتبطون بالمجموعة **{classe.name}**: {names}"
            return f"Teacher(s) linked to **{classe.name}**: {names}"
        if lang == 'fr':
            return f"Je n'ai pas trouvé d'enseignant assigné à la classe **{classe.name}** pour le moment."
        if lang == 'ar':
            return f"لم أجد أستاذًا مرتبطًا بالمجموعة **{classe.name}** حاليًا."
        return f"I couldn't find any teacher assigned to **{classe.name}** yet."

    # Intent: who is in the class / students
    members_patterns = [
        r'\b(who|list)\b.*\b(students|members|people)\b',
        r'\bqui\b.*\b(étudiants|etudiants|membres)\b',
        r'\bliste\b.*\b(étudiants|etudiants)\b',
    ]
    if any(re.search(p, t) for p in members_patterns):
        count = (
            User.query
            .filter(
                User.class_id == classe.id,
                User.is_teacher.is_(False),
                User.is_superuser.is_(False),
            )
            .count()
        )
        if lang == 'fr':
            if count == 0:
                return f"Je ne vois aucun étudiant dans la classe **{classe.name}** pour le moment."
            return (
                f"Classe **{classe.name}** : {count} étudiant(s).\n"
                "🔒 Pour la confidentialité, je n'affiche pas la liste complète des étudiants dans le chat."
            )
        if lang == 'ar':
            if count == 0:
                return f"لا أرى أي طالب في المجموعة **{classe.name}** حاليًا."
            return (
                f"المجموعة **{classe.name}**: عدد الطلاب {count}.\n"
                "🔒 حفاظًا على الخصوصية، لا أعرض قائمة الأسماء داخل الدردشة."
            )
        # English
        if count == 0:
            return f"I don't see any students in **{classe.name}** yet."
        return (
            f"**{classe.name}** has {count} student(s).\n"
            "🔒 For privacy, I don't list student names inside the group chat."
        )

    return None


def _user_can_access_class(user: User, class_id: int) -> bool:
    if user.is_superuser:
        return True

    if not user.is_teacher:
        return user.class_id == class_id

    # teacher: assigned to the class
    if ClassCourseAssignment.query.filter_by(class_id=class_id, teacher_id=user.id).first():
        return True

    # fallback: teacher owns a course assigned to the class
    assigned_course_ids = [a.course_id for a in ClassCourseAssignment.query.filter_by(class_id=class_id).all()]
    if assigned_course_ids and Course.query.filter(Course.id.in_(assigned_course_ids), Course.teacher_id == user.id).first():
        return True

    return False


def _ensure_room(class_id: int) -> ClassChatRoom:
    room = ClassChatRoom.query.filter_by(class_id=class_id).first()
    if room:
        return room

    room = ClassChatRoom(class_id=class_id)
    db.session.add(room)
    db.session.commit()
    return room


def _serialize_message(msg: ClassChatMessage):
    sender_name = 'ClassBot' if msg.is_bot else (msg.user.username if msg.user else 'Unknown')
    return {
        'id': msg.id,
        'room_id': msg.room_id,
        'class_id': msg.room.class_id if msg.room else None,
        'content': msg.content,
        'is_bot': bool(msg.is_bot),
        'created_at': msg.created_at.isoformat() if msg.created_at else None,
        'sender': {
            'id': msg.user.id,
            'username': msg.user.username,
        } if msg.user else None,
        'sender_name': sender_name,
    }


def _should_trigger_bot(content: str) -> bool:
    return bool(content and BOT_TAG_RE.search(content))


def _build_bot_prompt(classe: Classe, history: List[ClassChatMessage], current_user: User, content: str) -> List:
    """Build a list of LangChain messages."""

    # Platform facts (shared between students)
    try:
        class_courses = _get_class_courses(classe)
        course_titles = [c.title for c in class_courses]
    except Exception:
        course_titles = []

    try:
        teachers = _get_class_teachers(classe)
        teacher_names = [t.username for t in teachers]
    except Exception:
        teacher_names = []

    try:
        students_count = (
            User.query
            .filter(
                User.class_id == classe.id,
                User.is_teacher.is_(False),
                User.is_superuser.is_(False),
            )
            .count()
        )
    except Exception:
        students_count = 0

    sys = SystemMessage(
        content=(
            "You are ESB Class Assistant, a helpful chatbot embedded inside a university e-learning platform.\n"
            "You assist students in a public class group chat: answering questions, clarifying concepts, organizing teamwork, "
            "suggesting task splits, and creating simple study plans.\n\n"
            "Rules:\n"
            "- Reply in the same language as the last student message (French/Arabic/English).\n"
            "- Be concise, structured (bullet points), and actionable.\n"
            "- If the question is missing details (deadline, requirements), ask 1-2 clarifying questions.\n"
            "- You MAY use the platform facts provided below (class/courses/members) to answer.\n"
            "- Do not invent data that is not in the platform facts or the conversation.\n"
            "- PRIVACY: This is a public class chat. Never reveal ANY personal student data (grades, scores, completion status, enrollments, private reminders) about anyone, including the current user.\n"
            "  If a question requires personal data, answer with a short privacy-safe message and redirect the user to My Dashboard.\n"
            "- You can share ONLY class-level/common information (e.g., list of quizzes published for the class, list of modules, general advice).\n"
            "- If students ask for a task division, propose a fair split and a quick plan.\n"
            "- If the user message includes a tag like @bot, treat it as directed to you.\n"
            "- You can reference the recent conversation for context.\n\n"
            "Platform facts (trusted):\n"
            f"- Class: {classe.name}\n"
            f"- Program: {classe.program.name if getattr(classe, 'program', None) else 'N/A'}\n"
            f"- Teachers linked to this class: {', '.join(teacher_names) if teacher_names else 'N/A'}\n"
            f"- Courses/modules in this class: {', '.join(course_titles) if course_titles else 'N/A'}\n"
            f"- Students count: {students_count}\n"
            f"- Current user role: teacher={bool(current_user.is_teacher)}, superuser={bool(current_user.is_superuser)}\n"
        )
    )

    # Build a condensed transcript
    transcript_lines = []
    for m in history:
        role = 'Assistant' if m.is_bot else 'Student'
        transcript_lines.append(f"{role}: {m.content}")

    transcript = "\n".join(transcript_lines[-25:])

    user_msg = HumanMessage(
        content=(
            "Recent conversation (most recent last):\n"
            f"{transcript}\n\n"
            f"New message: {content}\n\n"
            "Write the best possible response for the group."
        )
    )

    return [sys, user_msg]


def _generate_bot_reply(classe: Classe, history: List[ClassChatMessage], current_user: User, content: str) -> str:
    """Generate a bot reply using Gemini (if configured)."""
    api_key = current_app.config.get('GOOGLE_API_KEY') or current_user.google_api_key
    if not api_key:
        return "🤖 (Bot) La clé API Google (Gemini) n'est pas configurée sur le serveur. Contactez l'administrateur."

    try:
        llm = ChatGoogleGenerativeAI(
            model='gemini-2.5-flash',
            temperature=0.3,
            google_api_key=api_key,
        )

        messages = _build_bot_prompt(classe, history, current_user, content)
        resp = llm.invoke(messages)
        text = getattr(resp, 'content', None) or str(resp)
        return _redact_pii(text.strip())
    except Exception as e:
        logger.error(f"Bot generation error: {e}")
        return "🤖 Désolé, une erreur est survenue lors de la génération de la réponse du chatbot."


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@class_chat_api_bp.route('/my', methods=['GET'])
@jwt_required()
def my_class_chats():
    """List classes the current user can access (for chat/dashboard navigation)."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    classes: List[Classe] = []

    if user.is_superuser:
        classes = Classe.query.order_by(Classe.name).all()
    elif user.is_teacher:
        class_ids = (
            db.session.query(ClassCourseAssignment.class_id)
            .filter(ClassCourseAssignment.teacher_id == user.id)
            .distinct()
            .all()
        )
        class_ids = [cid for (cid,) in class_ids]
        if class_ids:
            classes = Classe.query.filter(Classe.id.in_(class_ids)).order_by(Classe.name).all()
    else:
        if user.class_id:
            classe = Classe.query.get(user.class_id)
            if classe:
                classes = [classe]

    data = []
    for c in classes:
        # students count
        students_count = (
            User.query
            .filter(
                User.class_id == c.id,
                User.is_teacher.is_(False),
                User.is_superuser.is_(False),
            )
            .count()
        )

        # courses count: assignments if exist, else program courses
        assignments = ClassCourseAssignment.query.filter_by(class_id=c.id).all()
        course_ids = sorted({a.course_id for a in assignments}) if assignments else []
        if not course_ids and c.program_id and c.program:
            course_ids = [cc.id for cc in c.program.courses]

        data.append({
            'id': c.id,
            'name': c.name,
            'program_id': c.program_id,
            'program_name': c.program.name if c.program else None,
            'students_count': int(students_count),
            'courses_count': int(len(course_ids)),
        })

    return jsonify({'classes': data}), 200


@class_chat_api_bp.route('/<int:class_id>/info', methods=['GET'])
@jwt_required()
def get_class_chat_info(class_id: int):
    """Return shared class information for the chat UI and the bot.

    This endpoint is intentionally "common" information: class identity, members count,
    courses/modules list, and assigned teachers. It avoids exposing any private grades.
    """
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not _user_can_access_class(user, class_id):
        return jsonify({'error': 'Access denied'}), 403

    classe = Classe.query.get_or_404(class_id)
    room = _ensure_room(class_id)

    # shared facts
    courses = _get_class_courses(classe)
    teachers = _get_class_teachers(classe)

    students_count = (
        User.query
        .filter(
            User.class_id == classe.id,
            User.is_teacher.is_(False),
            User.is_superuser.is_(False),
        )
        .count()
    )
    students_preview = []
    # Only teachers/admin can see the full member list (PII). Students see only the count.
    if user.is_teacher or user.is_superuser:
        students_preview = _get_class_students(classe, limit=80)

    # current user courses (if student enrolled)
    current_user_courses = _get_user_courses(user)

    return jsonify({
        'room': {
            'id': room.id,
            'class_id': classe.id,
        },
        'class': {
            'id': classe.id,
            'name': classe.name,
            'academic_year': getattr(classe, 'academic_year', None),
            'program_id': classe.program_id,
            'program_name': classe.program.name if classe.program else None,
        },
        'courses': [
            {
                'id': c.id,
                'title': c.title,
                'description': c.description,
            }
            for c in courses
        ],
        'teachers': [
            {
                'id': t.id,
                'username': t.username,
            }
            for t in teachers
        ],
        'students_count': int(students_count),
        'students': [
            {
                'id': s.id,
                'username': s.username,
            }
            for s in students_preview
        ],
        'current_user': {
            'id': user.id,
            'username': user.username,
            'is_teacher': bool(user.is_teacher),
            'is_superuser': bool(user.is_superuser),
        },
        'current_user_courses': [
            {
                'id': c.id,
                'title': c.title,
            }
            for c in current_user_courses
        ],
    }), 200


@class_chat_api_bp.route('/<int:class_id>/messages', methods=['GET'])
@jwt_required()
def get_messages(class_id: int):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not _user_can_access_class(user, class_id):
        return jsonify({'error': 'Access denied'}), 403

    Classe.query.get_or_404(class_id)
    room = _ensure_room(class_id)

    try:
        limit = int(request.args.get('limit', 50))
    except Exception:
        limit = 50
    limit = max(1, min(limit, 200))

    messages = (
        ClassChatMessage.query
        .filter_by(room_id=room.id)
        .order_by(ClassChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    messages.reverse()

    return jsonify({
        'room': {
            'id': room.id,
            'class_id': class_id,
        },
        'messages': [_serialize_message(m) for m in messages],
    }), 200


@class_chat_api_bp.route('/<int:class_id>/messages', methods=['POST'])
@jwt_required()
def post_message(class_id: int):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not _user_can_access_class(user, class_id):
        return jsonify({'error': 'Access denied'}), 403

    classe = Classe.query.get_or_404(class_id)
    room = _ensure_room(class_id)

    data = request.get_json() or {}
    content = (data.get('content') or '').strip()

    if not content:
        return jsonify({'error': 'Message content is required'}), 400

    # Save user message
    msg = ClassChatMessage(
        room_id=room.id,
        user_id=user.id,
        content=content,
        is_bot=False,
    )
    db.session.add(msg)
    db.session.commit()

    # If tagged, generate bot reply
    bot_msg_obj: Optional[ClassChatMessage] = None
    if _should_trigger_bot(content):
        # remove the @bot tag before sending to the assistant logic
        bot_input = BOT_TAG_RE.sub('', content).strip()

        history = (
            ClassChatMessage.query
            .filter_by(room_id=room.id)
            .order_by(ClassChatMessage.created_at.desc())
            .limit(25)
            .all()
        )
        history.reverse()

        # 1) Deterministic answers using platform DB data (preferred for enrollment/common facts)
        bot_reply = _maybe_answer_with_platform_data(user, classe, bot_input)

        # 2) Fallback to LLM if no deterministic intent matched
        if not bot_reply:
            bot_reply = _generate_bot_reply(classe, history, user, bot_input)
        if bot_reply:
            bot_msg_obj = ClassChatMessage(
                room_id=room.id,
                user_id=None,
                content=bot_reply,
                is_bot=True,
            )
            db.session.add(bot_msg_obj)
            db.session.commit()

    return jsonify({
        'message': _serialize_message(msg),
        'bot_message': _serialize_message(bot_msg_obj) if bot_msg_obj else None,
    }), 201
