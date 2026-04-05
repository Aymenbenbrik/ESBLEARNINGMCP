from datetime import datetime
from app import db


SUPPORTED_LANGUAGES = ['python', 'sql', 'r', 'java', 'c', 'cpp']


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
