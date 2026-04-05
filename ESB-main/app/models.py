from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from app import db, login_manager
import os
from flask import current_app, url_for
from werkzeug.utils import secure_filename


# ---------------------------
# User Session Tracking
# ---------------------------
class UserSession(db.Model):
    """Model to track user login/logout activities"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    login_time = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    logout_time = db.Column(db.DateTime, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)

    user = db.relationship('User', backref=db.backref('sessions', lazy=True))

    def __init__(self, user_id, ip_address=None, user_agent=None):
        self.user_id = user_id
        self.ip_address = ip_address
        self.user_agent = user_agent

    def record_logout(self):
        self.logout_time = datetime.utcnow()

    @property
    def duration(self):
        if self.logout_time:
            return round((self.logout_time - self.login_time).total_seconds() / 60, 1)
        return None

    @property
    def is_active(self):
        return self.logout_time is None

    def __repr__(self):
        return f'<UserSession {self.id} - User {self.user_id}>'


# ---------------------------
# Relations Teacher <-> Student
# ---------------------------
class TeacherStudent(db.Model):
    __tablename__ = 'teacher_student'
    teacher_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    teacher = db.relationship('User', foreign_keys=[teacher_id], backref='teacher_links')
    student = db.relationship('User', foreign_keys=[student_id], backref='student_links')


# ---------------------------
# Program (Formation)
# ---------------------------
program_course = db.Table(
    'program_course',
    db.Column('program_id', db.Integer, db.ForeignKey('program.id'), primary_key=True),
    db.Column('course_id', db.Integer, db.ForeignKey('course.id'), primary_key=True),
)


# ---------------------------
# Classe ↔ Course ↔ Teacher (assignment per class)
# ---------------------------
class ClassCourseAssignment(db.Model):
    __tablename__ = 'class_course_assignment'

    id = db.Column(db.Integer, primary_key=True)
    class_id = db.Column(db.Integer, db.ForeignKey('classe.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    # ensure one row per class-course
    __table_args__ = (db.UniqueConstraint('class_id', 'course_id', name='uq_class_course'),)

    classe = db.relationship('Classe', back_populates='course_assignments')
    course = db.relationship('Course')
    teacher = db.relationship('User')


class Program(db.Model):
    __tablename__ = 'program'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    courses = db.relationship('Course', secondary=program_course, backref=db.backref('programs', lazy='dynamic'))
    classes = db.relationship('Classe', backref='program', lazy='dynamic')

    def __repr__(self):
        return f'<Program {self.name}>'

    @property
    def courses_count(self) -> int:
        """Safe course count for Program.courses (list relationship)."""
        try:
            return len(self.courses)
        except Exception:
            # fallback if relationship becomes dynamic in the future
            try:
                return self.courses.count()  # type: ignore[attr-defined]
            except Exception:
                return 0


# ---------------------------
# Classe
# ---------------------------
class Classe(db.Model):
    __tablename__ = 'classe'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    # Academic year label (e.g., 2025-2026). Optional but useful for admin organization.
    academic_year = db.Column(db.String(20), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # per-class teaching assignments (course -> teacher)
    course_assignments = db.relationship(
        'ClassCourseAssignment',
        back_populates='classe',
        cascade='all, delete-orphan',
        lazy='dynamic',
    )
    program_id = db.Column(db.Integer, db.ForeignKey('program.id'), nullable=True)

    students = db.relationship('User', backref='classe', lazy='dynamic')

    def __repr__(self):
        return f'<Classe {self.name}>'


# ---------------------------
# User Model
# ---------------------------
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    is_teacher = db.Column(db.Boolean, default=False)
    is_superuser = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_first_login = db.Column(db.Boolean, default=False)

    google_api_key = db.Column(db.String(255), nullable=True)
    class_id = db.Column(db.Integer, db.ForeignKey('classe.id'), nullable=True)

    courses_created = db.relationship('Course', backref='teacher', lazy='dynamic')
    enrollments = db.relationship('Enrollment', backref='student', lazy='dynamic')

    students = db.relationship(
        'User',
        secondary='teacher_student',
        primaryjoin='User.id == TeacherStudent.teacher_id',
        secondaryjoin='User.id == TeacherStudent.student_id',
        backref=db.backref('teachers', lazy='dynamic', overlaps="teacher_links,student_links"),
        lazy='dynamic',
        overlaps="teacher_links,student_links"
    )

    # ---------------- Methods ----------------
    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def add_student(self, student):
        if not (self.is_teacher or self.is_superuser) or student.is_teacher or self.has_student(student):
            return False
        link = TeacherStudent(teacher=self, student=student)
        db.session.add(link)
        return True

    def remove_student(self, student):
        if not (self.is_teacher or self.is_superuser):
            return False
        link = TeacherStudent.query.filter_by(teacher_id=self.id, student_id=student.id).first()
        if link:
            db.session.delete(link)
            return True
        return False

    def has_student(self, student):
        return TeacherStudent.query.filter_by(teacher_id=self.id, student_id=student.id).count() > 0

    def get_all_students(self):
        return [link.student for link in self.teacher_links]

    def create_user(self, username, email, password, is_teacher=False, is_superuser=False, class_id=None):
        if not self.is_superuser:
            return None
        user = User(
            username=username,
            email=email,
            is_teacher=is_teacher,
            is_superuser=is_superuser,
            class_id=class_id
        )
        user.set_password(password)
        db.session.add(user)
        return user

    def link_teacher_student(self, teacher_id, student_id):
        if not self.is_superuser:
            return False
        teacher = User.query.get(teacher_id)
        student = User.query.get(student_id)
        if not teacher or not student or not teacher.is_teacher or student.is_teacher:
            return False
        if TeacherStudent.query.filter_by(teacher_id=teacher_id, student_id=student_id).first():
            return False
        link = TeacherStudent(teacher_id=teacher_id, student_id=student_id)
        db.session.add(link)
        return True

    def link_teacher_to_class(self, teacher_id, class_id):
        if not self.is_superuser:
            return False, "Superuser privileges required"
        teacher = User.query.get(teacher_id)
        class_obj = Classe.query.get(class_id)
        if not teacher or not class_obj:
            return False, "Teacher or class not found"
        if not teacher.is_teacher:
            return False, "Selected user is not a teacher"
        students = User.query.filter_by(class_id=class_id, is_teacher=False).all()
        success_count = 0
        for student in students:
            if not TeacherStudent.query.filter_by(teacher_id=teacher_id, student_id=student.id).first():
                link = TeacherStudent(teacher_id=teacher_id, student_id=student.id)
                db.session.add(link)
                success_count += 1
        return True, f"Added {success_count} students to teacher"

    def unlink_teacher_student(self, teacher_id, student_id):
        if not self.is_superuser:
            return False
        link = TeacherStudent.query.filter_by(teacher_id=teacher_id, student_id=student_id).first()
        if link:
            db.session.delete(link)
            return True
        return False

    def promote_to_teacher(self, user_id):
        if not self.is_superuser:
            return False
        user = User.query.get(user_id)
        if user:
            user.is_teacher = True
            return True
        return False

    def demote_from_teacher(self, user_id):
        if not self.is_superuser:
            return False
        user = User.query.get(user_id)
        if user and user.is_teacher and not user.is_superuser:
            user.is_teacher = False
            return True
        return False

    def get_all_users(self):
        if not self.is_superuser:
            return []
        return User.query.all()

    def get_all_teachers(self):
        if not self.is_superuser:
            return []
        return User.query.filter_by(is_teacher=True).all()

    def __repr__(self):
        return f'<User {self.username}>'


@login_manager.user_loader
def load_user(id):
    return User.query.get(int(id))


def create_superuser(username, email, password):
    user = User.query.filter_by(username=username).first()
    if user:
        return False, "Username already exists"
    user = User.query.filter_by(email=email).first()
    if user:
        return False, "Email already exists"
    superuser = User(
        username=username,
        email=email,
        is_teacher=True,
        is_superuser=True
    )
    superuser.set_password(password)
    db.session.add(superuser)
    db.session.commit()
    return True, f"Superuser {username} created successfully"


# ---------------------------
# Courses / Chapters / Enrollment
# ---------------------------
class Course(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    teacher_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chapters = db.relationship('Chapter', backref='course', lazy='dynamic', cascade='all, delete-orphan')
    enrollments = db.relationship('Enrollment', backref='course', lazy='dynamic', cascade='all, delete-orphan')
    syllabus = db.relationship('Syllabus', backref='course', uselist=False, cascade='all, delete-orphan')
    documents = db.relationship('Document', backref='course', lazy='dynamic', cascade='all, delete-orphan')

    @property
    def chapters_count(self) -> int:
        """Safe chapter count for both lazy='dynamic' (query) and list relationships."""
        try:
            return self.chapters.count()  # dynamic relationship
        except TypeError:
            # In case relationship is configured as a list elsewhere
            return len(self.chapters)  # type: ignore[arg-type]

    def __repr__(self):
        return f'<Course {self.title}>'


class Chapter(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    order = db.Column(db.Integer, nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    summary = db.Column(db.Text)
    description = db.Column(db.Text)
    objectives = db.Column(db.Text)
    description_validated = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = db.relationship('Document', backref='chapter', lazy='dynamic', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Chapter {self.title}>'

    def has_summary(self):
        return self.summary is not None and len(self.summary.strip()) > 0

    def clear_summary(self):
        self.summary = None

    def get_document_count(self):
        return self.documents.count()

    def get_all_documents(self):
        return self.documents.all()

    def has_documents(self):
        return self.get_document_count() > 0

    @property
    def truncated_summary(self, max_length=200):
        if not self.summary:
            return "No summary available."
        if len(self.summary) <= max_length:
            return self.summary
        return self.summary[:max_length] + "..."


class Enrollment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    enrolled_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'course_id', name='unique_enrollment'),
    )

    def __repr__(self):
        return f'<Enrollment {self.student_id} - {self.course_id}>'


# ---------------------------
# Chat Session & Messages
# ---------------------------
class ChatSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    document_id = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=False)
    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), nullable=True)  # NULL for document-level chats
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    messages = db.relationship('ChatMessage', backref='session', lazy='dynamic', cascade='all, delete-orphan')
    chapter = db.relationship('Chapter', backref='chat_sessions')

    def __repr__(self):
        chat_type = "Chapter" if self.chapter_id else "Document"
        return f'<ChatSession {self.id} ({chat_type})>'


class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('chat_session.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_user = db.Column(db.Boolean, default=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<ChatMessage {self.id}>'


# ---------------------------
# Class Group Chat (per Classe)
# ---------------------------
class ClassChatRoom(db.Model):
    __tablename__ = 'class_chat_room'
    id = db.Column(db.Integer, primary_key=True)
    class_id = db.Column(db.Integer, db.ForeignKey('classe.id'), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # One room per class, many messages
    messages = db.relationship(
        'ClassChatMessage',
        backref='room',
        lazy='dynamic',
        cascade='all, delete-orphan'
    )

    def __repr__(self):
        return f'<ClassChatRoom class_id={self.class_id}>'


class ClassChatMessage(db.Model):
    __tablename__ = 'class_chat_message'
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('class_chat_room.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    content = db.Column(db.Text, nullable=False)
    is_bot = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sender = db.relationship('User', foreign_keys=[sender_id])

    def __repr__(self):
        return f'<ClassChatMessage {self.id} room={self.room_id} bot={self.is_bot}>'


# ---------------------------
# Documents & Notes
# ---------------------------
class Document(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    file_path = db.Column(db.String(255), nullable=True)  # Optional for quizzes (no file)
    file_type = db.Column(db.String(10), nullable=True)   # Optional for quizzes
    document_type = db.Column(db.String(50), nullable=False, server_default='general')  # 'quiz', 'pdf', etc.
    summary = db.Column(db.Text, nullable=True)           # Reuse for quiz instructions if needed
    quiz_data = db.Column(db.JSON, nullable=True)         # For quizzes - list of question dicts
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=True)
    # Many parts of the app expect Document -> Chapter linkage (document.chapter_id).
    # The database schema includes this column, and Chapter.documents relies on it.
    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), nullable=True)
    week_number = db.Column(db.Integer, nullable=True)    # For week quizzes
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = db.relationship('Note', backref='document', lazy=True, cascade="all, delete-orphan")
    chat_sessions = db.relationship('ChatSession', backref='document', lazy='dynamic', cascade='all, delete-orphan')
    quizzes = db.relationship('Quiz', backref='document', lazy='dynamic', cascade='all, delete-orphan')
    analysis_results = db.Column(db.JSON, nullable=True)  # For exam analysis (CLO %, Bloom's balance)
    analysis_report_path = db.Column(db.String(500), nullable=True)  # Path to generated PDF report
    content_metadata = db.Column('metadata', db.JSON)

    def __repr__(self):
        return f'<Document {self.title} (Type: {self.document_type}, Week: {self.week_number})>'

    def get_quiz_questions(self):
        if self.document_type != 'quiz' or not self.quiz_data:
            return []
        return self.quiz_data

    @property
    def is_quiz(self):
        return self.document_type == 'quiz'


class Note(db.Model):
    __tablename__ = 'notes'
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=True)
    image_path = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    document_id = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=False)

    user = db.relationship('User', backref=db.backref('notes', lazy=True))

    def __init__(self, user_id, document_id, content=None, image_file=None):
        self.user_id = user_id
        self.document_id = document_id
        self.content = content
        if image_file:
            filename = secure_filename(image_file.filename)
            unique_filename = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{filename}"
            self.image_path = os.path.join('notes_images', unique_filename)
            upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'notes_images')
            if not os.path.exists(upload_dir):
                os.makedirs(upload_dir)
            image_file.save(os.path.join(upload_dir, unique_filename))

    def to_dict(self):
        result = {
            'id': self.id,
            'content': self.content,
            'created_at': self.created_at.strftime('%b %d, %Y, %I:%M %p'),
            'user_id': self.user_id,
            'document_id': self.document_id
        }
        if self.image_path:
            result['image_path'] = self.image_path
            result['image_url'] = url_for('notes.serve_note_image', filename=self.image_path)
        return result

    def delete_file(self):
        if self.image_path:
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], self.image_path)
            if os.path.exists(file_path):
                os.remove(file_path)


# ---------------------------
# Syllabus
# ---------------------------
class Syllabus(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False, unique=True)
    syllabus_type = db.Column(db.String(10), nullable=True, default='bga')  # 'bga' or 'tn'
    clo_data = db.Column(db.JSON, nullable=True)
    clo_stats = db.Column(db.JSON, default=dict)
    plo_data = db.Column(db.JSON, nullable=True)
    weekly_plan = db.Column(db.JSON, nullable=True)
    tn_data = db.Column(db.JSON, nullable=True)  # legacy TN blob
    file_path = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # TN normalized relationships
    tn_admin = db.relationship('TNSyllabusAdministrative', back_populates='syllabus', uselist=False, cascade='all, delete-orphan')
    tn_aa = db.relationship('TNAA', back_populates='syllabus', cascade='all, delete-orphan')
    tn_aap = db.relationship('TNAAP', back_populates='syllabus', cascade='all, delete-orphan')
    tn_chapters = db.relationship('TNChapter', back_populates='syllabus', cascade='all, delete-orphan')
    tn_evaluation = db.relationship('TNEvaluation', back_populates='syllabus', uselist=False, cascade='all, delete-orphan')
    tn_bibliography = db.relationship('TNBibliography', back_populates='syllabus', cascade='all, delete-orphan')
    versions = db.relationship('SyllabusVersion', back_populates='syllabus', cascade='all, delete-orphan',
                               order_by='SyllabusVersion.version_number')

    def __repr__(self):
        return f'<Syllabus for Course {self.course_id} ({self.syllabus_type})>'


# ---------------------------
# TN Syllabus Models (AA, AAP, Chapters/Sections)
# ---------------------------
class TNSyllabusAdministrative(db.Model):
    __tablename__ = 'tn_syllabus_admin'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False, unique=True)
    module_name = db.Column(db.String(255))
    code_ue = db.Column(db.String(50))
    code_ecue = db.Column(db.String(50))
    field = db.Column(db.String(255))
    department = db.Column(db.String(255))
    option = db.Column(db.String(255))
    volume_presentiel = db.Column(db.String(50))
    volume_personnel = db.Column(db.String(50))
    coefficient = db.Column(db.Float)
    credits = db.Column(db.Float)
    responsible = db.Column(db.String(255))
    teachers = db.Column(db.JSON)

    syllabus = db.relationship('Syllabus', back_populates='tn_admin')


class TNAAP(db.Model):
    __tablename__ = 'tn_aap'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    number = db.Column(db.Integer, nullable=False)  # AAP#
    selected = db.Column(db.Boolean, default=False)

    syllabus = db.relationship('Syllabus', back_populates='tn_aap')

    __table_args__ = (
        db.UniqueConstraint('syllabus_id', 'number', name='uq_tn_aap_num'),
    )


class TNAA(db.Model):
    __tablename__ = 'tn_aa'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    number = db.Column(db.Integer, nullable=False)  # AA#
    description = db.Column(db.Text, nullable=False)

    syllabus = db.relationship('Syllabus', back_populates='tn_aa')
    chapter_links = db.relationship('TNChapterAA', back_populates='aa', cascade='all, delete-orphan')
    section_links = db.relationship('TNSectionAA', back_populates='aa', cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('syllabus_id', 'number', name='uq_tn_aa_num'),
    )


class TNChapter(db.Model):
    __tablename__ = 'tn_chapter'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    index = db.Column(db.Integer, nullable=False)  # chapter_index
    title = db.Column(db.Text, nullable=False)

    syllabus = db.relationship('Syllabus', back_populates='tn_chapters')
    sections = db.relationship('TNSection', back_populates='chapter', cascade='all, delete-orphan',
                               order_by='TNSection.position')
    aa_links = db.relationship('TNChapterAA', back_populates='chapter', cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('syllabus_id', 'index', name='uq_tn_chapter_idx'),
    )


class TNSection(db.Model):
    __tablename__ = 'tn_section'
    id = db.Column(db.Integer, primary_key=True)
    chapter_id = db.Column(db.Integer, db.ForeignKey('tn_chapter.id'), nullable=False)
    parent_section_id = db.Column(db.Integer, db.ForeignKey('tn_section.id'), nullable=True)
    index = db.Column(db.String(20), nullable=False)  # e.g. "1.1"
    title = db.Column(db.Text, nullable=False)
    position = db.Column(db.Integer, default=0)  # drag-and-drop order

    chapter = db.relationship('TNChapter', back_populates='sections')
    aa_links = db.relationship('TNSectionAA', back_populates='section', cascade='all, delete-orphan')
    sub_sections = db.relationship(
        'TNSection',
        backref=db.backref('parent', remote_side=[id]),
        foreign_keys='TNSection.parent_section_id',
        cascade='all, delete-orphan',
    )

    __table_args__ = (
        db.UniqueConstraint('chapter_id', 'index', name='uq_tn_section_idx'),
    )

    def to_dict(self, include_sub_sections=True):
        d = {
            'id': self.id,
            'chapter_id': self.chapter_id,
            'parent_section_id': self.parent_section_id,
            'index': self.index,
            'title': self.title,
            'position': self.position,
        }
        if include_sub_sections:
            d['sub_sections'] = [s.to_dict(include_sub_sections=False) for s in self.sub_sections]
        return d


class TNChapterAA(db.Model):
    __tablename__ = 'tn_chapter_aa'
    chapter_id = db.Column(db.Integer, db.ForeignKey('tn_chapter.id'), primary_key=True)
    aa_id = db.Column(db.Integer, db.ForeignKey('tn_aa.id'), primary_key=True)
    description_override = db.Column(db.Text, nullable=True)

    chapter = db.relationship('TNChapter', back_populates='aa_links')
    aa = db.relationship('TNAA', back_populates='chapter_links')


class TNSectionAA(db.Model):
    __tablename__ = 'tn_section_aa'
    section_id = db.Column(db.Integer, db.ForeignKey('tn_section.id'), primary_key=True)
    aa_id = db.Column(db.Integer, db.ForeignKey('tn_aa.id'), primary_key=True)
    description_override = db.Column(db.Text, nullable=True)

    section = db.relationship('TNSection', back_populates='aa_links')
    aa = db.relationship('TNAA', back_populates='section_links')


class TNEvaluation(db.Model):
    __tablename__ = 'tn_evaluation'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False, unique=True)
    methods = db.Column(db.JSON)
    criteria = db.Column(db.JSON)
    measures = db.Column(db.JSON)
    final_grade_formula = db.Column(db.Text)

    syllabus = db.relationship('Syllabus', back_populates='tn_evaluation')


class TNBibliography(db.Model):
    __tablename__ = 'tn_bibliography'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    position = db.Column(db.Integer)
    entry = db.Column(db.Text, nullable=False)

    def __init__(self, *args, **kwargs):
        # Backward/forward compatibility: some extraction workflows may send a 'reference' key.
        kwargs.pop('reference', None)
        super().__init__(*args, **kwargs)


    syllabus = db.relationship('Syllabus', back_populates='tn_bibliography')


# ---------------------------
# Syllabus Versioning
# ---------------------------

class SyllabusVersion(db.Model):
    """
    Immutable snapshot of a syllabus at a given point in time.

    Status lifecycle:
        baseline  — auto-created when syllabus is first extracted (v1, never edited)
        draft     — teacher is composing a revision (not yet submitted)
        proposed  — submitted for responsible/admin validation
        validated — approved, can be applied to the live syllabus
        rejected  — rejected with notes by the responsible
    """
    __tablename__ = 'syllabus_version'

    id               = db.Column(db.Integer, primary_key=True)
    syllabus_id      = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    version_number   = db.Column(db.Integer, nullable=False)          # 1, 2, 3 …
    label            = db.Column(db.String(200), nullable=True)       # e.g. "Révision S1 2024"
    notes            = db.Column(db.Text, nullable=True)              # teacher's rationale
    rejection_notes  = db.Column(db.Text, nullable=True)             # responsible's rejection reason

    # Full serialized state of the syllabus at the time of this version
    snapshot         = db.Column(db.JSON, nullable=False)

    # Computed diff vs the immediately preceding version (None for v1)
    diff_summary     = db.Column(db.JSON, nullable=True)

    status           = db.Column(db.String(20), default='draft', nullable=False)
    # True only for v1 (the original extracted syllabus)
    is_baseline      = db.Column(db.Boolean, default=False, nullable=False)

    created_by_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)
    validated_by_id  = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    validated_at     = db.Column(db.DateTime, nullable=True)
    applied_at       = db.Column(db.DateTime, nullable=True)

    # Relationships
    syllabus         = db.relationship('Syllabus', back_populates='versions')
    created_by       = db.relationship('User', foreign_keys=[created_by_id])
    validated_by     = db.relationship('User', foreign_keys=[validated_by_id])

    __table_args__ = (
        db.UniqueConstraint('syllabus_id', 'version_number', name='uq_sv_number'),
    )

    def to_dict(self, include_snapshot=False):
        d = {
            'id':             self.id,
            'syllabus_id':    self.syllabus_id,
            'version_number': self.version_number,
            'label':          self.label,
            'notes':          self.notes,
            'rejection_notes': self.rejection_notes,
            'status':         self.status,
            'is_baseline':    self.is_baseline,
            'diff_summary':   self.diff_summary,
            'created_by':     {'id': self.created_by.id, 'name': self.created_by.username} if self.created_by else None,
            'created_at':     self.created_at.isoformat() if self.created_at else None,
            'validated_by':   {'id': self.validated_by.id, 'name': self.validated_by.username} if self.validated_by else None,
            'validated_at':   self.validated_at.isoformat() if self.validated_at else None,
            'applied_at':     self.applied_at.isoformat() if self.applied_at else None,
        }
        if include_snapshot:
            d['snapshot'] = self.snapshot
        return d


# ---------------------------
# References & Section Content
# ---------------------------

class CourseReference(db.Model):
    """Bibliographic reference attached to a course (from TN bib or manually added)."""
    __tablename__ = 'course_reference'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    title = db.Column(db.String(500), nullable=False)
    authors = db.Column(db.String(500))
    url = db.Column(db.String(1000))
    ref_type = db.Column(db.String(50), default='book')  # book / article / online / other
    # Origin tracking
    from_bibliography = db.Column(db.Boolean, default=False)
    tn_bib_id = db.Column(db.Integer, db.ForeignKey('tn_bibliography.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    course = db.relationship('Course', backref=db.backref('references', lazy='dynamic', cascade='all, delete-orphan'))
    tn_bib = db.relationship('TNBibliography')
    chapter_links = db.relationship('ChapterReference', back_populates='reference', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<CourseReference {self.title[:40]}>'

    def to_dict(self):
        return {
            'id': self.id,
            'course_id': self.course_id,
            'title': self.title,
            'authors': self.authors,
            'url': self.url,
            'ref_type': self.ref_type,
            'from_bibliography': self.from_bibliography,
            'tn_bib_id': self.tn_bib_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ChapterReference(db.Model):
    """Many-to-many between Chapter and CourseReference with optional page notes."""
    __tablename__ = 'chapter_reference'

    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), primary_key=True)
    reference_id = db.Column(db.Integer, db.ForeignKey('course_reference.id'), primary_key=True)
    pages = db.Column(db.String(500))        # e.g. "pp. 45-67, 89"
    is_active = db.Column(db.Boolean, default=True)

    # Relationships
    chapter = db.relationship('Chapter', backref=db.backref('reference_links', lazy='dynamic', cascade='all, delete-orphan'))
    reference = db.relationship('CourseReference', back_populates='chapter_links')

    def to_dict(self):
        ref = self.reference
        return {
            'reference_id': self.reference_id,
            'chapter_id': self.chapter_id,
            'pages': self.pages,
            'is_active': self.is_active,
            'title': ref.title if ref else None,
            'authors': ref.authors if ref else None,
            'url': ref.url if ref else None,
            'ref_type': ref.ref_type if ref else None,
            'from_bibliography': ref.from_bibliography if ref else False,
        }


class SectionContent(db.Model):
    """AI-generated content for a TNSection, pending teacher validation."""
    __tablename__ = 'section_content'

    id = db.Column(db.Integer, primary_key=True)
    section_id = db.Column(db.Integer, db.ForeignKey('tn_section.id'), nullable=False, unique=True)
    content = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending / approved / rejected
    generated_at = db.Column(db.DateTime, default=datetime.utcnow)
    validated_at = db.Column(db.DateTime)
    validated_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))

    section = db.relationship('TNSection', backref=db.backref('content', uselist=False, cascade='all, delete-orphan'))
    validated_by = db.relationship('User', foreign_keys=[validated_by_id])

    def to_dict(self):
        return {
            'id': self.id,
            'section_id': self.section_id,
            'content': self.content,
            'status': self.status,
            'generated_at': self.generated_at.isoformat() if self.generated_at else None,
            'validated_at': self.validated_at.isoformat() if self.validated_at else None,
            'validated_by_id': self.validated_by_id,
        }


# ---------------------------
# Quiz Statistics
# ---------------------------
class QuizBloomStatistic(db.Model):
    __tablename__ = 'quiz_bloom_statistic'

    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey('quiz.id'), nullable=False)
    bloom_level = db.Column(db.String(50), nullable=False)  # remember, understand, apply, analyze, evaluate, create
    total_questions = db.Column(db.Integer, default=0)
    correct_answers = db.Column(db.Integer, default=0)
    success_rate = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    quiz = db.relationship('Quiz', backref='bloom_statistics')

    def __repr__(self):
        return f'<QuizBloomStatistic quiz_id={self.quiz_id} bloom={self.bloom_level} success={self.success_rate}%>'


class QuizCLOStatistic(db.Model):
    __tablename__ = 'quiz_clo_statistic'

    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey('quiz.id'), nullable=False)
    clo_name = db.Column(db.String(255), nullable=False)
    total_questions = db.Column(db.Integer, default=0)
    correct_answers = db.Column(db.Integer, default=0)
    success_rate = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    quiz = db.relationship('Quiz', backref='clo_statistics')

    def __repr__(self):
        return f'<QuizCLOStatistic quiz_id={self.quiz_id} clo={self.clo_name} success={self.success_rate}%>'


# ---------------------------
# Quizzes
# ---------------------------
class Quiz(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    num_questions = db.Column(db.Integer, default=0)
    score = db.Column(db.Float, nullable=True)
    feedback = db.Column(db.Text, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True, default=None)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # NOTE: Some deployments of this project do NOT have proctoring/disqualification
    # columns in the "quiz" table (is_disqualified/disqualified_at/violations_count).
    # If we map them as DB columns while they don't exist, PostgreSQL will crash on any
    # Quiz query because SQLAlchemy selects all mapped columns.
    #
    # We therefore keep them as *runtime-only* properties for backward compatibility.
    # If you later add these columns via a migration, you can safely convert them back
    # to db.Column definitions.
    _is_disqualified = False
    _disqualified_at = None
    _violations_count = 0

    @property
    def is_disqualified(self):
        return getattr(self, '_is_disqualified', False)

    @is_disqualified.setter
    def is_disqualified(self, value):
        self._is_disqualified = bool(value)

    @property
    def disqualified_at(self):
        return getattr(self, '_disqualified_at', None)

    @disqualified_at.setter
    def disqualified_at(self, value):
        self._disqualified_at = value

    @property
    def violations_count(self):
        return int(getattr(self, '_violations_count', 0) or 0)

    @violations_count.setter
    def violations_count(self, value):
        self._violations_count = int(value or 0)

    __table_args__ = (
        db.UniqueConstraint('document_id', 'student_id', name='uq_one_completed_quiz_per_student'),
    )

    student = db.relationship('User', backref='quizzes')
    questions = db.relationship('QuizQuestion', backref='quiz', cascade="all, delete-orphan")

    def __repr__(self):
        return f'<Quiz {self.id}>'


class QuizViolation(db.Model):
    __tablename__ = 'quiz_violations'
    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey('quiz.id'), nullable=False)
    violation_type = db.Column(db.String(50), nullable=False)  # fullscreen_exit, copy, paste, tab_switch, right_click, print_screen, select_all
    occurred_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_warning = db.Column(db.Boolean, default=True)  # True=1st/warning, False=2nd/disqualified

    quiz = db.relationship('Quiz', backref=db.backref('violations', cascade='all, delete-orphan'))

    def __repr__(self):
        return f'<QuizViolation {self.id} quiz={self.quiz_id} type={self.violation_type}>'


class QuizQuestion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey('quiz.id'), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    choice_a = db.Column(db.Text, nullable=True)
    choice_b = db.Column(db.Text, nullable=True)
    choice_c = db.Column(db.Text, nullable=True)
    correct_choice = db.Column(db.String(1), nullable=True)
    student_choice = db.Column(db.Text, nullable=True)
    is_correct = db.Column(db.Boolean, nullable=True)
    explanation = db.Column(db.Text, nullable=True)

    question_type = db.Column(db.String(20), default='mcq')  # 'mcq' or 'open_ended'
    feedback = db.Column(db.Text, nullable=True)
    score = db.Column(db.Float, nullable=True)

    bloom_level = db.Column(db.String(50), nullable=True)
    clo = db.Column(db.String(255), nullable=True)
    difficulty = db.Column(db.String(20), nullable=True)

    def __repr__(self):
        return f'<QuizQuestion {self.id}>'


# ---------------------------
# Question Bank
# ---------------------------
class QuestionBankQuestion(db.Model):
    __tablename__ = 'question_bank_question'
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    # Optional chapter association (used for chapter-scoped question banks).
    # Even if the underlying DB column exists without an FK constraint, we
    # declare it as a ForeignKey so SQLAlchemy can build relationships.
    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), nullable=True)
    question_text = db.Column(db.Text, nullable=False)
    choice_a = db.Column(db.Text, nullable=True)
    choice_b = db.Column(db.Text, nullable=True)
    choice_c = db.Column(db.Text, nullable=True)
    correct_choice = db.Column(db.String(1), nullable=True)
    explanation = db.Column(db.Text, nullable=True)

    question_type = db.Column(db.String(20), default='mcq')
    bloom_level = db.Column(db.String(50), nullable=True)
    # IMPORTANT:
    # - For BGA syllabi, this field stores a CLO tag (e.g. "CLO 1").
    # - For Tunisian norms (TN), we store the AA code here (e.g. "AA 1").
    # We keep the DB column name `clo` for backward-compatibility.
    clo = db.Column(db.String(255), nullable=True)
    difficulty = db.Column(db.String(20), nullable=True)
    # answer: model answer validated/edited by the teacher.
    # - QCM/VF:       the explanation of the correct choice
    # - drag_drop:    JSON string of [{left, right}] pairs
    # - open_ended:   the model written answer
    # - code:         the complete code solution (AI-generated, hidden from students)
    answer = db.Column(db.Text, nullable=True)
    # Code/practical question fields
    programming_language = db.Column(db.String(30), nullable=True)   # 'python', 'javascript', etc.
    test_cases = db.Column(db.Text, nullable=True)                    # Hidden test code appended to student code

    # Exercise grouping (optional: belongs to a QuestionBankExercise)
    exercise_id    = db.Column(db.Integer, db.ForeignKey('question_bank_exercise.id'), nullable=True)
    exercise_order = db.Column(db.Integer, nullable=True)  # position within the exercise

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def aaa(self):
        """Alias for TN usage: AAA code stored in `clo` column."""
        return self.clo

    approved_at = db.Column(db.DateTime, nullable=True)
    approved_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    # Relationships
    course = db.relationship('Course', backref=db.backref('question_bank_questions', lazy='dynamic', cascade='all, delete-orphan'))
    chapter = db.relationship(
        'Chapter',
        foreign_keys=[chapter_id],
        backref=db.backref('question_bank_questions', lazy='dynamic', cascade='all, delete-orphan')
    )
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])

    @property
    def is_approved(self):
        return self.approved_at is not None

    def __repr__(self):
        return f'<QuestionBankQuestion {self.id} course={self.course_id} approved={self.is_approved}>'


class PracticeQuiz(db.Model):
    """
    Practice quizzes for student self-study from approved Question Bank.
    Separate from document-based course test quizzes.
    """
    __tablename__ = 'practice_quiz'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    attempt_number = db.Column(db.Integer, default=1, nullable=False)
    max_attempts = db.Column(db.Integer, default=3, nullable=False)
    num_questions = db.Column(db.Integer, default=0)
    score = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)

    course = db.relationship('Course', backref=db.backref('practice_quizzes', lazy='dynamic'))
    chapter = db.relationship('Chapter', backref=db.backref('practice_quizzes', lazy='dynamic'))
    student = db.relationship('User', backref=db.backref('practice_quizzes', lazy='dynamic'))
    questions = db.relationship('PracticeQuizQuestion', backref='practice_quiz',
                                cascade='all, delete-orphan', lazy='dynamic')

    @property
    def is_completed(self):
        return self.completed_at is not None

    def __repr__(self):
        return f'<PracticeQuiz {self.id} student={self.student_id} chapter={self.chapter_id} attempt={self.attempt_number}>'


class PracticeQuizQuestion(db.Model):
    """Questions for practice quizzes - copied from QuestionBankQuestion."""
    __tablename__ = 'practice_quiz_question'

    id = db.Column(db.Integer, primary_key=True)
    practice_quiz_id = db.Column(db.Integer, db.ForeignKey('practice_quiz.id'), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    choice_a = db.Column(db.Text, nullable=True)
    choice_b = db.Column(db.Text, nullable=True)
    choice_c = db.Column(db.Text, nullable=True)
    correct_choice = db.Column(db.String(1), nullable=True)
    explanation = db.Column(db.Text, nullable=True)
    student_choice = db.Column(db.Text, nullable=True)
    is_correct = db.Column(db.Boolean, nullable=True)
    question_type = db.Column(db.String(20), default='mcq')
    bloom_level = db.Column(db.String(50), nullable=True)
    clo = db.Column(db.String(255), nullable=True)
    difficulty = db.Column(db.String(20), nullable=True)
    source_question_id = db.Column(db.Integer, db.ForeignKey('question_bank_question.id'), nullable=True)

    def __repr__(self):
        return f'<PracticeQuizQuestion {self.id} quiz={self.practice_quiz_id}>'


# ---------------------------------------------------------------------------
# Section Activities (YouTube & graded Section Quiz)
# ---------------------------------------------------------------------------

class SectionQuiz(db.Model):
    """
    Teacher-defined graded quiz for a section.
    Students take it and the score contributes to their chapter grade.
    """
    __tablename__ = 'section_quiz'

    id = db.Column(db.Integer, primary_key=True)
    section_id = db.Column(db.Integer, db.ForeignKey('tn_section.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), default='draft')   # draft | published
    max_score = db.Column(db.Float, default=10.0)
    weight_percent = db.Column(db.Float, default=10.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Quiz settings
    start_date = db.Column(db.DateTime, nullable=True)
    end_date = db.Column(db.DateTime, nullable=True)
    duration_minutes = db.Column(db.Integer, nullable=True)   # None = unlimited
    max_attempts = db.Column(db.Integer, default=1)
    show_feedback = db.Column(db.Boolean, default=True)       # show result after each attempt
    password = db.Column(db.String(100), nullable=True)       # None = no password
    survey_json = db.Column(db.Text, nullable=True)           # SurveyJS JSON definition

    section = db.relationship('TNSection', backref=db.backref('section_quizzes', cascade='all, delete-orphan'))
    questions = db.relationship('SectionQuizQuestion', backref='quiz',
                                cascade='all, delete-orphan', order_by='SectionQuizQuestion.position')
    submissions = db.relationship('SectionQuizSubmission', backref='quiz',
                                  cascade='all, delete-orphan')

    def to_dict(self, include_questions=False):
        d = {
            'id': self.id,
            'section_id': self.section_id,
            'title': self.title,
            'status': self.status,
            'max_score': self.max_score,
            'weight_percent': self.weight_percent,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'question_count': len(self.questions),
            'approved_count': sum(1 for q in self.questions if q.status == 'approved'),
            # Settings
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'duration_minutes': self.duration_minutes,
            'max_attempts': self.max_attempts or 1,
            'show_feedback': self.show_feedback if self.show_feedback is not None else True,
            'password_protected': bool(self.password),
            'has_survey_json': bool(self.survey_json),
        }
        if include_questions:
            d['questions'] = [q.to_dict() for q in self.questions]
        return d


class SectionQuizQuestion(db.Model):
    __tablename__ = 'section_quiz_question'

    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey('section_quiz.id'), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    question_type = db.Column(db.String(20), default='mcq')
    choice_a = db.Column(db.Text)
    choice_b = db.Column(db.Text)
    choice_c = db.Column(db.Text)
    choice_d = db.Column(db.Text)
    correct_choice = db.Column(db.String(1))
    explanation = db.Column(db.Text)
    points = db.Column(db.Float, default=1.0)
    status = db.Column(db.String(20), default='pending')   # pending | approved | rejected
    bloom_level = db.Column(db.String(50))
    difficulty = db.Column(db.String(20), default='medium')   # easy | medium | hard
    aa_code = db.Column(db.String(20))                         # e.g. "AA 1"
    position = db.Column(db.Integer, default=0)

    def to_dict(self, hide_answer=False):
        d = {
            'id': self.id,
            'quiz_id': self.quiz_id,
            'question_text': self.question_text,
            'question_type': self.question_type,
            'choice_a': self.choice_a,
            'choice_b': self.choice_b,
            'choice_c': self.choice_c,
            'choice_d': self.choice_d,
            'explanation': None if hide_answer else self.explanation,
            'points': self.points,
            'status': self.status,
            'bloom_level': self.bloom_level,
            'difficulty': self.difficulty,
            'aa_code': self.aa_code,
            'position': self.position,
        }
        if not hide_answer:
            d['correct_choice'] = self.correct_choice
        return d


class SectionQuizSubmission(db.Model):
    __tablename__ = 'section_quiz_submission'

    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey('section_quiz.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    attempt_number = db.Column(db.Integer, default=1, nullable=False)
    answers = db.Column(db.JSON)
    # graded_answers: {str(question_id): {proposed, final, comment, validated}}
    graded_answers = db.Column(db.JSON)
    score = db.Column(db.Float)
    max_score = db.Column(db.Float)
    grading_status = db.Column(db.String(20), default='auto')  # auto | pending | graded
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship('User', backref=db.backref('section_quiz_submissions', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'quiz_id': self.quiz_id,
            'student_id': self.student_id,
            'student_name': self.student.username if self.student else None,
            'student_email': self.student.email if self.student else None,
            'attempt_number': self.attempt_number or 1,
            'answers': self.answers,
            'graded_answers': self.graded_answers or {},
            'score': self.score,
            'max_score': self.max_score,
            'grading_status': self.grading_status or 'auto',
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
        }


class SectionActivity(db.Model):
    """An activity attached to a TNSection: YouTube video, quiz, image, text doc, assignment, or pdf extract."""
    __tablename__ = 'section_activity'

    id = db.Column(db.Integer, primary_key=True)
    section_id = db.Column(db.Integer, db.ForeignKey('tn_section.id'), nullable=False)
    activity_type = db.Column(db.String(20), nullable=False)   # 'youtube'|'quiz'|'image'|'text_doc'|'assignment'|'pdf_extract'|'file'
    title = db.Column(db.String(200), nullable=False)
    position = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    youtube_url = db.Column(db.String(500))
    youtube_embed_id = db.Column(db.String(50))
    section_quiz_id = db.Column(db.Integer, db.ForeignKey('section_quiz.id'), nullable=True)
    # RAG: document created from YouTube transcript (indexed in ChromaDB)
    document_id = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=True)
    transcript_status = db.Column(db.String(30), default=None)  # None | 'indexing' | 'indexed' | 'failed'
    # Image activity
    image_url = db.Column(db.String(1000), nullable=True)
    image_filename = db.Column(db.String(300), nullable=True)
    # Text document activity
    text_content = db.Column(db.Text, nullable=True)
    # Assignment reference
    assignment_id = db.Column(db.Integer, db.ForeignKey('section_assignment.id'), nullable=True)
    # File activity
    file_path = db.Column(db.String(500), nullable=True)
    file_name = db.Column(db.String(300), nullable=True)

    section = db.relationship('TNSection', backref=db.backref('activities', cascade='all, delete-orphan',
                                                              order_by='SectionActivity.position'))
    section_quiz_rel = db.relationship('SectionQuiz', foreign_keys=[section_quiz_id])
    document_rel = db.relationship('Document', foreign_keys=[document_id])
    assignment_rel = db.relationship('SectionAssignment', foreign_keys=[assignment_id])

    def to_dict(self):
        return {
            'id': self.id,
            'section_id': self.section_id,
            'activity_type': self.activity_type,
            'title': self.title,
            'position': self.position,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'youtube_url': self.youtube_url,
            'youtube_embed_id': self.youtube_embed_id,
            'section_quiz_id': self.section_quiz_id,
            'document_id': self.document_id,
            'transcript_status': self.transcript_status,
            'image_url': self.image_url,
            'image_filename': self.image_filename,
            'text_content': self.text_content,
            'assignment_id': self.assignment_id,
            'file_path': self.file_path,
            'file_name': self.file_name,
        }


# ─── Assignment (Devoir) ──────────────────────────────────────────────────────

class SectionAssignment(db.Model):
    """A homework/assignment attached to a TNSection. Teacher creates, students submit files."""
    __tablename__ = 'section_assignment'

    id = db.Column(db.Integer, primary_key=True)
    section_id = db.Column(db.Integer, db.ForeignKey('tn_section.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)                   # assignment instructions
    deliverables = db.Column(db.Text)                  # what students must submit
    deadline = db.Column(db.DateTime)                  # submission deadline
    allow_late = db.Column(db.Boolean, default=False)  # accept after deadline?
    max_attempts = db.Column(db.Integer, default=1)    # how many re-submissions allowed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    section = db.relationship('TNSection', backref=db.backref('assignments', cascade='all, delete-orphan'))
    submissions = db.relationship('AssignmentSubmission', backref='assignment',
                                  cascade='all, delete-orphan', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'section_id': self.section_id,
            'title': self.title,
            'description': self.description,
            'deliverables': self.deliverables,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'allow_late': self.allow_late,
            'max_attempts': self.max_attempts,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class AssignmentSubmission(db.Model):
    """A student's file submission for a SectionAssignment."""
    __tablename__ = 'assignment_submission'

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey('section_assignment.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # files: JSON array of {path, original_name, file_type, size}
    files = db.Column(db.JSON)
    attempt_number = db.Column(db.Integer, default=1)
    is_late = db.Column(db.Boolean, default=False)
    status = db.Column(db.String(20), default='submitted')  # submitted | graded
    grade = db.Column(db.Float)
    feedback = db.Column(db.Text)
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship('User', backref=db.backref('assignment_submissions', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'assignment_id': self.assignment_id,
            'student_id': self.student_id,
            'student_name': self.student.username if self.student else None,
            'student_email': self.student.email if self.student else None,
            'files': self.files or [],
            'attempt_number': self.attempt_number,
            'is_late': self.is_late,
            'status': self.status,
            'grade': self.grade,
            'feedback': self.feedback,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
        }


# ─── Attendance (Présence) ─────────────────────────────────────────────────────

class AttendanceSession(db.Model):
    """A teaching session for which attendance is tracked."""
    __tablename__ = 'attendance_session'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    date = db.Column(db.Date, nullable=False)
    activities_covered = db.Column(db.Text, nullable=True)  # JSON list of {type, id, title}
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    course = db.relationship('Course', backref=db.backref('attendance_sessions', cascade='all, delete-orphan', lazy='dynamic'))
    records = db.relationship('AttendanceRecord', backref='session', cascade='all, delete-orphan', lazy='dynamic')

    def to_dict(self, include_records=False):
        import json as _json
        d = {
            'id': self.id,
            'course_id': self.course_id,
            'title': self.title,
            'date': self.date.isoformat() if self.date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'record_count': self.records.count(),
            'activities_covered': _json.loads(self.activities_covered) if self.activities_covered else [],
        }
        if include_records:
            d['records'] = [r.to_dict() for r in self.records]
        return d


class AttendanceRecord(db.Model):
    """Per-student attendance status for a given session."""
    __tablename__ = 'attendance_record'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('attendance_session.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(10), default='absent')  # present | late | absent

    student = db.relationship('User', backref=db.backref('attendance_records', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('session_id', 'student_id', name='uq_attendance_record'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'student_id': self.student_id,
            'student_name': self.student.username if self.student else None,
            'student_email': self.student.email if self.student else None,
            'status': self.status,
        }


# ─── Grade Weights & Exam ──────────────────────────────────────────────────────

class GradeWeight(db.Model):
    """Teacher-configured weights for computing the final grade of a course."""
    __tablename__ = 'grade_weight'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False, unique=True)
    quiz_weight = db.Column(db.Float, default=30.0)        # % of final grade
    assignment_weight = db.Column(db.Float, default=30.0)
    attendance_weight = db.Column(db.Float, default=10.0)
    exam_weight = db.Column(db.Float, default=30.0)
    # custom formula string, e.g. "quiz*0.3 + assignment*0.3 + attendance*0.1 + exam*0.3"
    formula = db.Column(db.Text)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    course = db.relationship('Course', backref=db.backref('grade_weight', uselist=False))

    def to_dict(self):
        return {
            'id': self.id,
            'course_id': self.course_id,
            'quiz_weight': self.quiz_weight,
            'assignment_weight': self.assignment_weight,
            'attendance_weight': self.attendance_weight,
            'exam_weight': self.exam_weight,
            'formula': self.formula,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class CourseExam(db.Model):
    """An exam file uploaded by the teacher with AI evaluation."""
    __tablename__ = 'course_exam'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    file_path = db.Column(db.String(500))       # relative path in uploads/
    original_name = db.Column(db.String(300))
    status = db.Column(db.String(20), default='uploaded')  # uploaded | analyzing | done | error
    # AI result: {overview, questions_count, avg_difficulty, bloom_distribution,
    #              aa_alignment, feedback: [str], suggestions: [str], score: float}
    ai_evaluation = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    exam_type = db.Column(db.String(20), default='examen')   # 'examen' | 'ds' | 'pratique'
    weight = db.Column(db.Float, default=30.0)                # pondération %
    target_aa_ids = db.Column(db.JSON)                        # [1, 2, 3] — AA numbers chosen by teacher
    has_practical_target = db.Column(db.Boolean, default=False)  # teacher says exam should have practical questions
    
    # Exam metadata extracted by AI (duration, calculator, documents allowed, etc.)
    exam_metadata = db.Column(db.JSON)  # {exam_name, class_name, declared_duration_min, calculator_allowed, documents_allowed, etc.}

    course = db.relationship('Course', backref=db.backref('exams', cascade='all, delete-orphan', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'course_id': self.course_id,
            'file_path': self.file_path,
            'original_name': self.original_name,
            'status': self.status,
            'ai_evaluation': self.ai_evaluation,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'exam_type': self.exam_type or 'examen',
            'weight': self.weight or 30.0,
            'target_aa_ids': self.target_aa_ids or [],
            'has_practical_target': self.has_practical_target or False,
            'exam_metadata': self.exam_metadata or {},
        }


# ─────────────────────────────────────────────────────────────────────────────
# EXAM MCP ANALYSIS — Multi-Agent LangGraph System
# ─────────────────────────────────────────────────────────────────────────────

class ExamAnalysisSession(db.Model):
    """Tracks one MCP multi-agent exam analysis run."""
    __tablename__ = 'exam_analysis_session'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    document_id = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=True)
    status = db.Column(db.String(32), default='pending')   # pending|running|done|error
    current_agent = db.Column(db.String(64), nullable=True)
    progress = db.Column(db.Integer, default=0)            # 0-100
    state_json = db.Column(db.Text, nullable=True)         # full ExamEvaluationState as JSON
    latex_source = db.Column(db.Text, nullable=True)
    latex_pdf_path = db.Column(db.String(512), nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    course = db.relationship('Course', backref=db.backref('exam_sessions', lazy='dynamic'))
    document = db.relationship('Document', backref=db.backref('exam_sessions', lazy='dynamic'))
    questions = db.relationship(
        'ExamExtractedQuestion', backref='session',
        lazy='dynamic', cascade='all,delete-orphan'
    )

    def to_dict(self):
        state = {}
        if self.state_json:
            import json as _json
            try:
                state = _json.loads(self.state_json)
            except Exception:
                pass
        return {
            'id': self.id,
            'course_id': self.course_id,
            'document_id': self.document_id,
            'status': self.status,
            'current_agent': self.current_agent,
            'progress': self.progress,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'latex_source': self.latex_source,
            'latex_pdf_path': self.latex_pdf_path,
            'state': state,
        }


class ExamExtractedQuestion(db.Model):
    """One question extracted from the exam by the MCP agents."""
    __tablename__ = 'exam_extracted_question'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('exam_analysis_session.id'), nullable=False)
    number = db.Column(db.Integer, nullable=False)
    text = db.Column(db.Text, nullable=False)
    points = db.Column(db.Float, nullable=True)
    aa_codes = db.Column(db.JSON, nullable=True)
    bloom_level = db.Column(db.String(64), nullable=True)
    difficulty = db.Column(db.String(64), nullable=True)
    difficulty_justification = db.Column(db.Text, nullable=True)
    source_covered = db.Column(db.Boolean, nullable=True)
    adjustment_suggestion = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'number': self.number,
            'text': self.text,
            'points': self.points,
            'aa_codes': self.aa_codes or [],
            'bloom_level': self.bloom_level,
            'difficulty': self.difficulty,
            'difficulty_justification': self.difficulty_justification,
            'source_covered': self.source_covered,
            'adjustment_suggestion': self.adjustment_suggestion,
        }


# ─────────────────────────────────────────────────────────────────────────────
# PRACTICAL WORK (TP Code) — MCP + LangGraph AI System
# ─────────────────────────────────────────────────────────────────────────────

SUPPORTED_LANGUAGES = ['python', 'sql', 'r', 'java', 'c', 'cpp']

class PracticalWork(db.Model):
    """
    A code-based practical work (TP) attached to a TNSection.
    AI workflow: statement generation → AA suggestion → reference solution.
    """
    __tablename__ = 'practical_work'

    id           = db.Column(db.Integer, primary_key=True)
    section_id   = db.Column(db.Integer, db.ForeignKey('tn_section.id'), nullable=False)
    title        = db.Column(db.String(200), nullable=False)
    language     = db.Column(db.String(20), nullable=False)   # python|sql|r|java|c|cpp
    max_grade    = db.Column(db.Float, default=20.0)
    status       = db.Column(db.String(20), default='draft')  # draft|published
    tp_nature    = db.Column(db.String(20), default='formative')  # formative | sommative

    # Énoncé
    statement         = db.Column(db.Text, nullable=True)
    statement_source  = db.Column(db.String(20), default='teacher')  # teacher|ai
    suggestion_context = db.Column(db.Text, nullable=True)  # AI detection context passed at creation

    # Apprentissages Attendus
    aa_codes = db.Column(db.JSON, default=list)   # e.g. ["AA1.1", "AA1.2"]

    # Parsed questions (from AI or teacher)
    questions = db.Column(db.JSON, nullable=True)  # [{id, title, text, points}]

    # AI-generated reference correction
    reference_solution  = db.Column(db.Text, nullable=True)
    reference_validated = db.Column(db.Boolean, default=False)
    correction_criteria = db.Column(db.Text, nullable=True)  # AI evaluation grid

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    section     = db.relationship('TNSection',
                                  backref=db.backref('practical_works',
                                                     cascade='all, delete-orphan'))
    submissions = db.relationship('PracticalWorkSubmission',
                                  backref='practical_work',
                                  cascade='all, delete-orphan',
                                  lazy='dynamic')

    def to_dict(self, include_solution=False):
        d = {
            'id':                 self.id,
            'section_id':         self.section_id,
            'title':              self.title,
            'language':           self.language,
            'max_grade':          self.max_grade,
            'status':             self.status,
            'tp_nature':          self.tp_nature or 'formative',
            'statement':          self.statement,
            'statement_source':   self.statement_source,
            'aa_codes':           self.aa_codes or [],
            'questions':          self.questions or [],
            'reference_validated': self.reference_validated,
            'correction_criteria': self.correction_criteria,
            'created_at':         self.created_at.isoformat() if self.created_at else None,
            'updated_at':         self.updated_at.isoformat() if self.updated_at else None,
            'submission_count':   self.submissions.count(),
        }
        if include_solution:
            d['reference_solution'] = self.reference_solution
        return d


class PracticalWorkSubmission(db.Model):
    """
    A student code submission for a PracticalWork.
    AI automatically corrects it and proposes a grade; teacher validates.
    """
    __tablename__ = 'practical_work_submission'

    id             = db.Column(db.Integer, primary_key=True)
    tp_id          = db.Column(db.Integer, db.ForeignKey('practical_work.id'), nullable=False)
    student_id     = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    code           = db.Column(db.Text, nullable=False)
    answers        = db.Column(db.JSON, nullable=True)   # [{question_id, code}] for multi-zone submissions
    attempt_number = db.Column(db.Integer, default=1)
    submitted_at   = db.Column(db.DateTime, default=datetime.utcnow)

    # AI correction pipeline
    correction_status = db.Column(db.String(20), default='pending')  # pending|correcting|done|failed
    correction_report = db.Column(db.Text, nullable=True)  # Markdown
    proposed_grade    = db.Column(db.Float, nullable=True)

    # Teacher validation
    status          = db.Column(db.String(20), default='submitted')  # submitted|correcting|graded
    final_grade     = db.Column(db.Float, nullable=True)
    teacher_comment = db.Column(db.Text, nullable=True)
    graded_at       = db.Column(db.DateTime, nullable=True)
    graded_by_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    student    = db.relationship('User', foreign_keys=[student_id],
                                 backref=db.backref('tp_submissions', lazy='dynamic'))
    graded_by  = db.relationship('User', foreign_keys=[graded_by_id])

    def to_dict(self, include_code=True):
        d = {
            'id':                self.id,
            'tp_id':             self.tp_id,
            'student_id':        self.student_id,
            'student_name':      self.student.username if self.student else None,
            'attempt_number':    self.attempt_number,
            'submitted_at':      self.submitted_at.isoformat() if self.submitted_at else None,
            'correction_status': self.correction_status,
            'correction_report': self.correction_report,
            'proposed_grade':    self.proposed_grade,
            'status':            self.status,
            'final_grade':       self.final_grade,
            'teacher_comment':   self.teacher_comment,
            'graded_at':         self.graded_at.isoformat() if self.graded_at else None,
        }
        if include_code:
            d['code'] = self.code
            d['answers'] = self.answers or []
        return d


# ============================================================
# AGENTIC PIPELINE — Détection exercices & TPs par chapitre
# ============================================================

class ChapterPipeline(db.Model):
    """
    État du pipeline agentic pour un chapitre.
    Orchestre 10 agents de détection, génération et classification.
    """
    __tablename__ = 'chapter_pipeline'

    id         = db.Column(db.Integer, primary_key=True)
    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), nullable=False, unique=True)

    # idle | running | paused | done | failed
    status        = db.Column(db.String(20), default='idle', nullable=False)
    current_agent = db.Column(db.String(50), nullable=True)

    # JSON: { agent_name: {status, started_at, done_at, result_count, error} }
    agents_state  = db.Column(db.JSON, nullable=True, default=dict)

    # Detected raw data before DB insertion (temporary store)
    detected_exercises = db.Column(db.JSON, nullable=True)  # raw exercise data
    detected_tps       = db.Column(db.JSON, nullable=True)  # raw TP data

    error_message = db.Column(db.Text, nullable=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at    = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chapter = db.relationship('Chapter', backref=db.backref('pipeline', uselist=False))

    AGENTS = [
        'detect_documents',
        'detect_exercises',
        'detect_tp',
        'add_consolidation',
        'generate_answers',
        'add_tp',
        'generate_tp_corrections',
        'generate_scores',
        'generate_durations',
        'add_to_bank',
    ]

    def to_dict(self):
        return {
            'id':           self.id,
            'chapter_id':   self.chapter_id,
            'status':       self.status,
            'current_agent':self.current_agent,
            'agents_state': self.agents_state or {},
            'error_message':self.error_message,
            'created_at':   self.created_at.isoformat() if self.created_at else None,
            'updated_at':   self.updated_at.isoformat() if self.updated_at else None,
        }


class ChapterExercise(db.Model):
    """
    Exercice détecté ou créé dans un chapitre.
    exercise_type: 'consolidation' (Consolidation des acquis) ou 'tp' (Activité pratique).
    """
    __tablename__ = 'chapter_exercise'

    id                 = db.Column(db.Integer, primary_key=True)
    chapter_id         = db.Column(db.Integer, db.ForeignKey('chapter.id'), nullable=False)
    section_id         = db.Column(db.Integer, db.ForeignKey('tn_section.id'), nullable=True)
    source_document_id = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=True)

    title          = db.Column(db.String(300), nullable=False)
    description    = db.Column(db.Text, nullable=True)
    exercise_type  = db.Column(db.String(20), default='consolidation')  # consolidation | tp
    status         = db.Column(db.String(20), default='draft')          # draft | validated | published
    order          = db.Column(db.Integer, default=0)

    total_points          = db.Column(db.Float, nullable=True)
    estimated_duration_min = db.Column(db.Integer, nullable=True)

    # Classification
    aa_codes   = db.Column(db.JSON, nullable=True)   # ['AA1', 'AA2']
    bloom_levels = db.Column(db.JSON, nullable=True) # dominant bloom levels

    # For TP-type exercises
    programming_language = db.Column(db.String(30), nullable=True)
    tp_nature            = db.Column(db.String(20), nullable=True)  # formative | sommative

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chapter   = db.relationship('Chapter',  backref=db.backref('exercises', lazy='dynamic', cascade='all, delete-orphan'))
    questions = db.relationship('ExerciseQuestion', backref='exercise',
                                 cascade='all, delete-orphan', order_by='ExerciseQuestion.order')

    def to_dict(self, include_questions=False):
        d = {
            'id':                    self.id,
            'chapter_id':            self.chapter_id,
            'section_id':            self.section_id,
            'source_document_id':    self.source_document_id,
            'title':                 self.title,
            'description':           self.description,
            'exercise_type':         self.exercise_type,
            'status':                self.status,
            'order':                 self.order,
            'total_points':          self.total_points,
            'estimated_duration_min':self.estimated_duration_min,
            'aa_codes':              self.aa_codes or [],
            'bloom_levels':          self.bloom_levels or [],
            'programming_language':  self.programming_language,
            'tp_nature':             self.tp_nature,
            'question_count':        len(self.questions),
            'created_at':            self.created_at.isoformat() if self.created_at else None,
        }
        if include_questions:
            d['questions'] = [q.to_dict() for q in self.questions]
        return d


class ExerciseQuestion(db.Model):
    """
    Question appartenant à un ChapterExercise.
    Classifiée par AA, Bloom, difficulté avec réponse modèle, barème et durée estimée.
    """
    __tablename__ = 'exercise_question'

    id          = db.Column(db.Integer, primary_key=True)
    exercise_id = db.Column(db.Integer, db.ForeignKey('chapter_exercise.id'), nullable=False)
    order       = db.Column(db.Integer, default=0)

    question_text = db.Column(db.Text, nullable=False)
    question_type = db.Column(db.String(20), default='open_ended')  # open_ended | mcq | code | calculation | true_false

    # MCQ choices
    choice_a = db.Column(db.Text, nullable=True)
    choice_b = db.Column(db.Text, nullable=True)
    choice_c = db.Column(db.Text, nullable=True)
    choice_d = db.Column(db.Text, nullable=True)
    correct_choice = db.Column(db.String(1), nullable=True)

    # Scoring
    points          = db.Column(db.Float, default=1.0)
    scoring_detail  = db.Column(db.Text, nullable=True)   # barème détaillé

    # Classification
    bloom_level = db.Column(db.String(50), nullable=True)
    difficulty  = db.Column(db.String(20), nullable=True)
    aa_codes    = db.Column(db.JSON, nullable=True)        # ['AA1', 'AA2']

    # Timing
    estimated_duration_min = db.Column(db.Integer, nullable=True)

    # Model answer (generated by agent, validated by teacher)
    model_answer        = db.Column(db.Text, nullable=True)
    answer_validated    = db.Column(db.Boolean, default=False)
    correction_criteria = db.Column(db.JSON, nullable=True)  # ['critère 1', 'critère 2']

    # For code questions
    programming_language = db.Column(db.String(30), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':                    self.id,
            'exercise_id':           self.exercise_id,
            'order':                 self.order,
            'question_text':         self.question_text,
            'question_type':         self.question_type,
            'choice_a':              self.choice_a,
            'choice_b':              self.choice_b,
            'choice_c':              self.choice_c,
            'choice_d':              self.choice_d,
            'correct_choice':        self.correct_choice,
            'points':                self.points,
            'scoring_detail':        self.scoring_detail,
            'bloom_level':           self.bloom_level,
            'difficulty':            self.difficulty,
            'aa_codes':              self.aa_codes or [],
            'estimated_duration_min':self.estimated_duration_min,
            'model_answer':          self.model_answer,
            'answer_validated':      self.answer_validated or False,
            'correction_criteria':   self.correction_criteria or [],
            'programming_language':  self.programming_language,
        }


class QuestionBankExercise(db.Model):
    """
    Exercice dans la banque de questions du cours.
    Groupe des questions progressives (du plus simple au plus complexe).
    Peut être généré par IA ou créé manuellement par l'enseignant.
    """
    __tablename__ = 'question_bank_exercise'

    id         = db.Column(db.Integer, primary_key=True)
    course_id  = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), nullable=True)

    # Source link (si créé depuis un ChapterExercise)
    source_exercise_id = db.Column(db.Integer, nullable=True)

    title          = db.Column(db.String(300), nullable=False)
    description    = db.Column(db.Text, nullable=True)
    exercise_type  = db.Column(db.String(20), default='consolidation')  # consolidation | tp | exam
    status         = db.Column(db.String(20), default='draft')          # draft | approved

    total_points           = db.Column(db.Float, nullable=True)
    estimated_duration_min = db.Column(db.Integer, nullable=True)

    # Classification
    aa_codes     = db.Column(db.JSON, nullable=True)
    bloom_levels = db.Column(db.JSON, nullable=True)

    # For progressive exercises: metadata
    progression_notes = db.Column(db.Text, nullable=True)  # Notes sur la logique de progression

    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    approved_at = db.Column(db.DateTime, nullable=True)
    approved_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    course    = db.relationship('Course', backref=db.backref('qbank_exercises', lazy='dynamic'))
    chapter   = db.relationship('Chapter', backref=db.backref('qbank_exercises', lazy='dynamic'))
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])

    # Questions are QuestionBankQuestion rows with exercise_id set
    @property
    def questions(self):
        return QuestionBankQuestion.query.filter_by(exercise_id=self.id).order_by(QuestionBankQuestion.exercise_order).all()

    @property
    def is_approved(self):
        return self.approved_at is not None

    def to_dict(self, include_questions=False):
        d = {
            'id':                    self.id,
            'course_id':             self.course_id,
            'chapter_id':            self.chapter_id,
            'title':                 self.title,
            'description':           self.description,
            'exercise_type':         self.exercise_type,
            'status':                self.status,
            'total_points':          self.total_points,
            'estimated_duration_min':self.estimated_duration_min,
            'aa_codes':              self.aa_codes or [],
            'bloom_levels':          self.bloom_levels or [],
            'progression_notes':     self.progression_notes,
            'is_approved':           self.is_approved,
            'question_count':        QuestionBankQuestion.query.filter_by(exercise_id=self.id).count(),
            'created_at':            self.created_at.isoformat() if self.created_at else None,
        }
        if include_questions:
            d['questions'] = [q.to_dict() for q in self.questions]
        return d


# ============================================================
# EXAM BANK MODELS — Épreuves validées & Safe Exam
# ============================================================

class ValidatedExam(db.Model):
    """Épreuve validée par l'enseignant pour un cours (séparée de la banque questions étudiants)"""
    __tablename__ = 'validated_exam'

    id             = db.Column(db.Integer, primary_key=True)
    course_id      = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    title          = db.Column(db.String(200), nullable=False)
    description    = db.Column(db.Text, nullable=True)
    duration_minutes = db.Column(db.Integer, default=60)
    file_path      = db.Column(db.String(500), nullable=True)   # PDF original uploadé
    total_points   = db.Column(db.Float, default=20.0)
    status         = db.Column(db.String(20), default='draft')  # draft | active | archived
    is_available   = db.Column(db.Boolean, default=False)       # Disponible aux étudiants

    # Tentatives
    allow_retake   = db.Column(db.Boolean, default=False)
    max_attempts   = db.Column(db.Integer, default=1)

    # Safe Exam settings
    safe_exam_enabled   = db.Column(db.Boolean, default=True)
    fullscreen_required = db.Column(db.Boolean, default=True)
    disable_copy_paste  = db.Column(db.Boolean, default=True)
    face_id_required    = db.Column(db.Boolean, default=True)
    camera_monitoring   = db.Column(db.Boolean, default=True)

    # Access control
    exam_password  = db.Column(db.String(200), nullable=True)   # None = no password required
    tn_exam_id     = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=True)  # source TN doc

    created_by_id  = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at     = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    course      = db.relationship('Course',
                                   backref=db.backref('validated_exams', cascade='all, delete-orphan'))
    created_by  = db.relationship('User', foreign_keys=[created_by_id])
    questions   = db.relationship('ExamBankQuestion', backref='exam',
                                   cascade='all, delete-orphan',
                                   order_by='ExamBankQuestion.order')
    sessions    = db.relationship('ExamSession', backref='exam', cascade='all, delete-orphan')

    def to_dict(self, include_questions=False):
        d = {
            'id':                  self.id,
            'course_id':           self.course_id,
            'title':               self.title,
            'description':         self.description,
            'duration_minutes':    self.duration_minutes,
            'total_points':        self.total_points,
            'status':              self.status,
            'is_available':        self.is_available,
            'allow_retake':        self.allow_retake,
            'max_attempts':        self.max_attempts,
            'safe_exam_enabled':   self.safe_exam_enabled,
            'fullscreen_required': self.fullscreen_required,
            'disable_copy_paste':  self.disable_copy_paste,
            'face_id_required':    self.face_id_required,
            'camera_monitoring':   self.camera_monitoring,
            'password_protected':  bool(self.exam_password),
            'tn_exam_id':          self.tn_exam_id,
            'created_by':          self.created_by.username if self.created_by else None,
            'created_at':          self.created_at.isoformat() if self.created_at else None,
            'updated_at':          self.updated_at.isoformat() if self.updated_at else None,
            'question_count':      len(self.questions),
            'has_file':            bool(self.file_path),
        }
        if include_questions:
            d['questions'] = [q.to_dict() for q in self.questions]
        return d


class ExamBankQuestion(db.Model):
    """Question d'une épreuve validée avec réponse générée par Gemini 2.5 Pro"""
    __tablename__ = 'exam_bank_question'

    id            = db.Column(db.Integer, primary_key=True)
    exam_id       = db.Column(db.Integer, db.ForeignKey('validated_exam.id'), nullable=False)
    order         = db.Column(db.Integer, default=0)

    question_text = db.Column(db.Text, nullable=False)
    question_type = db.Column(db.String(30), default='open_ended')
    # Types: mcq | open_ended | code | true_false | practical

    # MCQ choices
    choice_a = db.Column(db.Text, nullable=True)
    choice_b = db.Column(db.Text, nullable=True)
    choice_c = db.Column(db.Text, nullable=True)
    choice_d = db.Column(db.Text, nullable=True)
    correct_choice = db.Column(db.String(10), nullable=True)   # A | B | C | D | True | False

    # Réponse générée par Gemini 2.5 Pro
    answer           = db.Column(db.Text, nullable=True)
    answer_generated = db.Column(db.Boolean, default=False)

    # Metadata pédagogique
    points              = db.Column(db.Float, default=1.0)
    bloom_level         = db.Column(db.String(50), nullable=True)
    clo                 = db.Column(db.String(50), nullable=True)
    difficulty          = db.Column(db.String(20), nullable=True)
    programming_language = db.Column(db.String(30), nullable=True)
    expected_output     = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, include_answer=False):
        d = {
            'id':                   self.id,
            'exam_id':              self.exam_id,
            'order':                self.order,
            'question_text':        self.question_text,
            'question_type':        self.question_type,
            'choice_a':             self.choice_a,
            'choice_b':             self.choice_b,
            'choice_c':             self.choice_c,
            'choice_d':             self.choice_d,
            'correct_choice':       self.correct_choice,
            'points':               self.points,
            'bloom_level':          self.bloom_level,
            'clo':                  self.clo,
            'difficulty':           self.difficulty,
            'programming_language': self.programming_language,
            'expected_output':      self.expected_output,
            'answer_generated':     self.answer_generated,
        }
        if include_answer:
            d['answer'] = self.answer
            d['correct_choice'] = self.correct_choice
        return d


class ExamSession(db.Model):
    """Session de passage d'épreuve par un étudiant"""
    __tablename__ = 'exam_session'

    id             = db.Column(db.Integer, primary_key=True)
    exam_id        = db.Column(db.Integer, db.ForeignKey('validated_exam.id'), nullable=False)
    student_id     = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    attempt_number = db.Column(db.Integer, default=1)

    status         = db.Column(db.String(20), default='started')
    # started | submitted | graded | disqualified

    # FaceID
    face_verified            = db.Column(db.Boolean, default=False)
    face_verification_score  = db.Column(db.Float, nullable=True)

    # Timing
    started_at          = db.Column(db.DateTime, default=datetime.utcnow)
    submitted_at        = db.Column(db.DateTime, nullable=True)
    time_spent_seconds  = db.Column(db.Integer, nullable=True)

    # Résultats
    score        = db.Column(db.Float, nullable=True)
    max_score    = db.Column(db.Float, nullable=True)
    feedback     = db.Column(db.Text, nullable=True)
    feedback_published = db.Column(db.Boolean, default=False, nullable=False, server_default='0')
    graded_at    = db.Column(db.DateTime, nullable=True)
    graded_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    student    = db.relationship('User', foreign_keys=[student_id],
                                  backref=db.backref('exam_sessions', lazy='dynamic'))
    graded_by  = db.relationship('User', foreign_keys=[graded_by_id])
    answers    = db.relationship('ExamSessionAnswer', backref='session',
                                  cascade='all, delete-orphan')
    violations = db.relationship('ExamViolation', backref='session',
                                  cascade='all, delete-orphan')

    def to_dict(self, include_answers=False):
        d = {
            'id':                      self.id,
            'exam_id':                 self.exam_id,
            'student_id':              self.student_id,
            'student_name':            self.student.username if self.student else None,
            'attempt_number':          self.attempt_number,
            'status':                  self.status,
            'face_verified':           self.face_verified,
            'face_verification_score': self.face_verification_score,
            'started_at':              self.started_at.isoformat() if self.started_at else None,
            'submitted_at':            self.submitted_at.isoformat() if self.submitted_at else None,
            'time_spent_seconds':      self.time_spent_seconds,
            'score':                   self.score,
            'max_score':               self.max_score,
            'feedback':                self.feedback,
            'feedback_published':      self.feedback_published or False,
            'graded_at':               self.graded_at.isoformat() if self.graded_at else None,
            'violation_count':         len(self.violations),
        }
        if include_answers:
            d['answers'] = [a.to_dict() for a in self.answers]
        return d


class ExamSessionAnswer(db.Model):
    """Réponse d'un étudiant à une question d'épreuve"""
    __tablename__ = 'exam_session_answer'

    id             = db.Column(db.Integer, primary_key=True)
    session_id     = db.Column(db.Integer, db.ForeignKey('exam_session.id'), nullable=False)
    question_id    = db.Column(db.Integer, db.ForeignKey('exam_bank_question.id'), nullable=False)

    student_answer = db.Column(db.Text, nullable=True)      # Réponse ouverte / code
    student_choice = db.Column(db.String(10), nullable=True) # MCQ: A|B|C|D

    is_correct  = db.Column(db.Boolean, nullable=True)
    score       = db.Column(db.Float, nullable=True)
    ai_feedback = db.Column(db.Text, nullable=True)

    answered_at = db.Column(db.DateTime, default=datetime.utcnow)

    question = db.relationship('ExamBankQuestion',
                                backref=db.backref('session_answers', lazy='dynamic'))

    def to_dict(self):
        return {
            'id':             self.id,
            'session_id':     self.session_id,
            'question_id':    self.question_id,
            'student_answer': self.student_answer,
            'student_choice': self.student_choice,
            'is_correct':     self.is_correct,
            'score':          self.score,
            'ai_feedback':    self.ai_feedback,
            'answered_at':    self.answered_at.isoformat() if self.answered_at else None,
        }


class ExamViolation(db.Model):
    """Violation détectée lors d'une épreuve"""
    __tablename__ = 'exam_violation'

    id             = db.Column(db.Integer, primary_key=True)
    session_id     = db.Column(db.Integer, db.ForeignKey('exam_session.id'), nullable=False)
    violation_type = db.Column(db.String(50), nullable=False)
    # Types: fullscreen_exit | face_not_detected | multiple_faces | copy | paste | tab_switch | window_blur
    occurred_at    = db.Column(db.DateTime, default=datetime.utcnow)
    is_warning     = db.Column(db.Boolean, default=True)
    details        = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id':             self.id,
            'session_id':     self.session_id,
            'violation_type': self.violation_type,
            'occurred_at':    self.occurred_at.isoformat() if self.occurred_at else None,
            'is_warning':     self.is_warning,
            'details':        self.details,
        }


class StudentPhoto(db.Model):
    """Photo de référence d'un étudiant pour la reconnaissance faciale FaceID"""
    __tablename__ = 'student_photo'

    id            = db.Column(db.Integer, primary_key=True)
    student_id    = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    file_path     = db.Column(db.String(500), nullable=False)
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    uploaded_at   = db.Column(db.DateTime, default=datetime.utcnow)

    student     = db.relationship('User', foreign_keys=[student_id],
                                   backref=db.backref('photo', uselist=False))
    uploaded_by = db.relationship('User', foreign_keys=[uploaded_by_id])

    def to_dict(self):
        return {
            'id':          self.id,
            'student_id':  self.student_id,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
        }
