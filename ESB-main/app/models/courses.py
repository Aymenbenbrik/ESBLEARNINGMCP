from datetime import datetime
from app import db


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


# ─── Grade Weights ────────────────────────────────────────────────────────────

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
