from datetime import datetime
from app import db


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
