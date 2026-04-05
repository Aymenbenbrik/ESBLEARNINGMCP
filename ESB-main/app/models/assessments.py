from datetime import datetime
from app import db


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
