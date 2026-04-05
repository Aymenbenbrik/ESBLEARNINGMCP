from datetime import datetime
from app import db


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
