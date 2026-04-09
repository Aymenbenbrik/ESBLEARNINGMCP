from datetime import datetime
from app import db


# ─── Course Progress Tracking ────────────────────────────────────────────────

class ChapterProgress(db.Model):
    """Tracks a student's progress on a specific chapter."""
    __tablename__ = 'chapter_progress'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)

    # Progress indicators
    visited = db.Column(db.Boolean, default=False)
    visited_at = db.Column(db.DateTime)
    documents_opened = db.Column(db.Integer, default=0)
    documents_total = db.Column(db.Integer, default=0)
    quiz_completed = db.Column(db.Boolean, default=False)
    quiz_score = db.Column(db.Float)
    tp_submitted = db.Column(db.Boolean, default=False)

    # Computed progress (0-100)
    progress_percent = db.Column(db.Float, default=0.0)

    last_accessed = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'chapter_id', name='unique_student_chapter_progress'),
    )

    student = db.relationship('User', backref=db.backref('chapter_progress', lazy='dynamic'))
    chapter = db.relationship('Chapter', backref=db.backref('student_progress', lazy='dynamic'))
    course = db.relationship('Course', backref=db.backref('student_chapter_progress', lazy='dynamic'))

    def compute_progress(self):
        """Compute progress percentage based on activities."""
        total_weight = 0
        earned = 0

        # Visiting the chapter = 20%
        total_weight += 20
        if self.visited:
            earned += 20

        # Opening documents = 40%
        if self.documents_total > 0:
            total_weight += 40
            earned += 40 * min(self.documents_opened / self.documents_total, 1.0)
        else:
            total_weight += 40
            earned += 40  # No docs = full credit

        # Quiz = 25%
        total_weight += 25
        if self.quiz_completed:
            earned += 25

        # TP = 15%
        total_weight += 15
        if self.tp_submitted:
            earned += 15

        self.progress_percent = round((earned / total_weight) * 100, 1) if total_weight > 0 else 0.0
        return self.progress_percent

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'chapter_id': self.chapter_id,
            'course_id': self.course_id,
            'chapter_title': self.chapter.title if self.chapter else None,
            'chapter_order': self.chapter.order if self.chapter else None,
            'visited': self.visited,
            'visited_at': self.visited_at.isoformat() if self.visited_at else None,
            'documents_opened': self.documents_opened,
            'documents_total': self.documents_total,
            'quiz_completed': self.quiz_completed,
            'quiz_score': self.quiz_score,
            'tp_submitted': self.tp_submitted,
            'progress_percent': self.progress_percent,
            'last_accessed': self.last_accessed.isoformat() if self.last_accessed else None,
        }


class CourseProgressSnapshot(db.Model):
    """Cached overall course progress for a student (recomputed periodically)."""
    __tablename__ = 'course_progress_snapshot'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)

    # Aggregated stats
    chapters_total = db.Column(db.Integer, default=0)
    chapters_visited = db.Column(db.Integer, default=0)
    chapters_completed = db.Column(db.Integer, default=0)
    quizzes_total = db.Column(db.Integer, default=0)
    quizzes_completed = db.Column(db.Integer, default=0)
    quizzes_avg_score = db.Column(db.Float, default=0.0)
    tps_total = db.Column(db.Integer, default=0)
    tps_submitted = db.Column(db.Integer, default=0)
    documents_total = db.Column(db.Integer, default=0)
    documents_opened = db.Column(db.Integer, default=0)

    overall_progress = db.Column(db.Float, default=0.0)
    last_activity = db.Column(db.DateTime)
    computed_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'course_id', name='unique_student_course_snapshot'),
    )

    student = db.relationship('User', backref=db.backref('course_progress_snapshots', lazy='dynamic'))
    course = db.relationship('Course', backref=db.backref('progress_snapshots', lazy='dynamic'))

    def to_dict(self):
        return {
            'student_id': self.student_id,
            'course_id': self.course_id,
            'chapters_total': self.chapters_total,
            'chapters_visited': self.chapters_visited,
            'chapters_completed': self.chapters_completed,
            'quizzes_total': self.quizzes_total,
            'quizzes_completed': self.quizzes_completed,
            'quizzes_avg_score': round(self.quizzes_avg_score, 1),
            'tps_total': self.tps_total,
            'tps_submitted': self.tps_submitted,
            'documents_total': self.documents_total,
            'documents_opened': self.documents_opened,
            'overall_progress': round(self.overall_progress, 1),
            'last_activity': self.last_activity.isoformat() if self.last_activity else None,
            'computed_at': self.computed_at.isoformat() if self.computed_at else None,
        }
