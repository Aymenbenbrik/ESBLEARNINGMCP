from datetime import datetime
from app import db
from app.models.assessments import QuestionBankQuestion


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
