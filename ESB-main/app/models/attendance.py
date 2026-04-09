from datetime import datetime
from app import db


# ─── Attendance (Présence) ─────────────────────────────────────────────────────

class AttendanceSession(db.Model):
    """A teaching session for which attendance is tracked."""
    __tablename__ = 'attendance_session'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey('classe.id'), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    date = db.Column(db.Date, nullable=False)
    activities_covered = db.Column(db.Text, nullable=True)  # JSON list of {type, id, title}
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    course = db.relationship('Course', backref=db.backref('attendance_sessions', cascade='all, delete-orphan', lazy='dynamic'))
    classe = db.relationship('Classe', backref=db.backref('attendance_sessions', lazy='dynamic'))
    records = db.relationship('AttendanceRecord', backref='session', cascade='all, delete-orphan', lazy='dynamic')

    def to_dict(self, include_records=False):
        import json as _json
        d = {
            'id': self.id,
            'course_id': self.course_id,
            'class_id': self.class_id,
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
