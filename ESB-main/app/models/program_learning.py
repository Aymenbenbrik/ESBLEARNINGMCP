"""
Program-level learning outcomes: AAP, Competences, AA↔AAP links, and student evaluation scores.

Hierarchy:
  Program (Formation) → ProgramAAP (acquis d'apprentissage programme)
                       → ProgramCompetence (compétences)
  ProgramAAP ↔ ProgramCompetence  (M2M via aap_competence_link)
  TNAA (module AA) → ProgramAAP   (M2M via aa_aap_link, scoped per syllabus)

  StudentAAScore   — per-student, per-AA, per-course score
  StudentAAPScore  — per-student, per-AAP, per-program score (aggregated)
"""
from datetime import datetime
from app import db


# ── M2M: AAP ↔ Compétence ───────────────────────────────────────────────────
aap_competence_link = db.Table(
    'aap_competence_link',
    db.Column('aap_id', db.Integer, db.ForeignKey('program_aap.id', ondelete='CASCADE'), primary_key=True),
    db.Column('competence_id', db.Integer, db.ForeignKey('program_competence.id', ondelete='CASCADE'), primary_key=True),
)


# ── ProgramAAP ──────────────────────────────────────────────────────────────
class ProgramAAP(db.Model):
    """Acquis d'Apprentissage du Programme (formation-level learning outcome)."""
    __tablename__ = 'program_aap'

    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(db.Integer, db.ForeignKey('program.id', ondelete='CASCADE'), nullable=False)
    code = db.Column(db.String(20), nullable=False)       # e.g. "AAP1"
    description = db.Column(db.Text, nullable=False)
    order = db.Column(db.Integer, default=0)

    program = db.relationship('Program', backref=db.backref('aaps', lazy='dynamic', cascade='all, delete-orphan'))
    competences = db.relationship(
        'ProgramCompetence',
        secondary=aap_competence_link,
        backref=db.backref('aaps', lazy='dynamic'),
    )
    aa_links = db.relationship('AAAapLink', back_populates='aap', cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('program_id', 'code', name='uq_program_aap_code'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'program_id': self.program_id,
            'code': self.code,
            'description': self.description,
            'order': self.order,
            'competence_ids': [c.id for c in self.competences],
        }


# ── ProgramCompetence ───────────────────────────────────────────────────────
class ProgramCompetence(db.Model):
    """Compétence liée à une formation."""
    __tablename__ = 'program_competence'

    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(db.Integer, db.ForeignKey('program.id', ondelete='CASCADE'), nullable=False)
    code = db.Column(db.String(20), nullable=False)       # e.g. "C1"
    description = db.Column(db.Text, nullable=False)

    program = db.relationship('Program', backref=db.backref('competences', lazy='dynamic', cascade='all, delete-orphan'))

    __table_args__ = (
        db.UniqueConstraint('program_id', 'code', name='uq_program_competence_code'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'program_id': self.program_id,
            'code': self.code,
            'description': self.description,
            'aap_ids': [a.id for a in self.aaps],
        }


# ── AA ↔ AAP Link (per syllabus) ────────────────────────────────────────────
class AAAapLink(db.Model):
    """Links a module-level AA (TNAA) to a program-level AAP (ProgramAAP).
    Scoped per syllabus so the mapping can vary between courses."""
    __tablename__ = 'aa_aap_link'

    id = db.Column(db.Integer, primary_key=True)
    aa_id = db.Column(db.Integer, db.ForeignKey('tn_aa.id', ondelete='CASCADE'), nullable=False)
    aap_id = db.Column(db.Integer, db.ForeignKey('program_aap.id', ondelete='CASCADE'), nullable=False)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id', ondelete='CASCADE'), nullable=False)

    aa = db.relationship('TNAA', backref=db.backref('aap_links', lazy='dynamic'))
    aap = db.relationship('ProgramAAP', back_populates='aa_links')
    syllabus = db.relationship('Syllabus', backref=db.backref('aa_aap_links', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('aa_id', 'aap_id', 'syllabus_id', name='uq_aa_aap_syllabus'),
    )


# ── Student AA Score (per module) ───────────────────────────────────────────
class StudentAAScore(db.Model):
    """Score d'un étudiant sur un AA donné pour un cours (module)."""
    __tablename__ = 'student_aa_score'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    aa_id = db.Column(db.Integer, db.ForeignKey('tn_aa.id', ondelete='CASCADE'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id', ondelete='CASCADE'), nullable=False)
    score = db.Column(db.Float, nullable=False, default=0.0)  # 0–100
    calculated_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship('User', backref=db.backref('aa_scores', lazy='dynamic'))
    aa = db.relationship('TNAA')
    course = db.relationship('Course')

    __table_args__ = (
        db.UniqueConstraint('student_id', 'aa_id', 'course_id', name='uq_student_aa_course'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'aa_id': self.aa_id,
            'aa_code': f"AA{self.aa.number}" if self.aa else None,
            'aa_description': self.aa.description if self.aa else None,
            'course_id': self.course_id,
            'score': round(self.score, 1),
            'calculated_at': self.calculated_at.isoformat() if self.calculated_at else None,
        }


# ── Student AAP Score (per formation) ───────────────────────────────────────
class StudentAAPScore(db.Model):
    """Score agrégé d'un étudiant sur un AAP pour une formation."""
    __tablename__ = 'student_aap_score'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    aap_id = db.Column(db.Integer, db.ForeignKey('program_aap.id', ondelete='CASCADE'), nullable=False)
    program_id = db.Column(db.Integer, db.ForeignKey('program.id', ondelete='CASCADE'), nullable=False)
    score = db.Column(db.Float, nullable=False, default=0.0)  # 0–100
    calculated_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship('User', backref=db.backref('aap_scores', lazy='dynamic'))
    aap = db.relationship('ProgramAAP')
    program = db.relationship('Program')

    __table_args__ = (
        db.UniqueConstraint('student_id', 'aap_id', 'program_id', name='uq_student_aap_program'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'aap_id': self.aap_id,
            'aap_code': self.aap.code if self.aap else None,
            'aap_description': self.aap.description if self.aap else None,
            'program_id': self.program_id,
            'score': round(self.score, 1),
            'calculated_at': self.calculated_at.isoformat() if self.calculated_at else None,
        }
