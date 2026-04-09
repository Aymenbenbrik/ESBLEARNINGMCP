from datetime import datetime
from app import db


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
    is_preview     = db.Column(db.Boolean, default=False)

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
            'is_preview':              self.is_preview or False,
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
