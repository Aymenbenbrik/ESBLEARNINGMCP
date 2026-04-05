from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from app import db, login_manager


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
        from app.models import Classe  # lazy import to avoid circular dependency
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
