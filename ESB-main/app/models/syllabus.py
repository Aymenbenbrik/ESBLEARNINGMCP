from datetime import datetime
from app import db


# ---------------------------
# Syllabus
# ---------------------------
class Syllabus(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False, unique=True)
    syllabus_type = db.Column(db.String(10), nullable=True, default='bga')  # 'bga' or 'tn'
    clo_data = db.Column(db.JSON, nullable=True)
    clo_stats = db.Column(db.JSON, default=dict)
    plo_data = db.Column(db.JSON, nullable=True)
    weekly_plan = db.Column(db.JSON, nullable=True)
    tn_data = db.Column(db.JSON, nullable=True)  # legacy TN blob
    file_path = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # TN normalized relationships
    tn_admin = db.relationship('TNSyllabusAdministrative', back_populates='syllabus', uselist=False, cascade='all, delete-orphan')
    tn_aa = db.relationship('TNAA', back_populates='syllabus', cascade='all, delete-orphan')
    tn_aap = db.relationship('TNAAP', back_populates='syllabus', cascade='all, delete-orphan')
    tn_chapters = db.relationship('TNChapter', back_populates='syllabus', cascade='all, delete-orphan')
    tn_evaluation = db.relationship('TNEvaluation', back_populates='syllabus', uselist=False, cascade='all, delete-orphan')
    tn_bibliography = db.relationship('TNBibliography', back_populates='syllabus', cascade='all, delete-orphan')
    versions = db.relationship('SyllabusVersion', back_populates='syllabus', cascade='all, delete-orphan',
                               order_by='SyllabusVersion.version_number')

    def __repr__(self):
        return f'<Syllabus for Course {self.course_id} ({self.syllabus_type})>'


# ---------------------------
# TN Syllabus Models (AA, AAP, Chapters/Sections)
# ---------------------------
class TNSyllabusAdministrative(db.Model):
    __tablename__ = 'tn_syllabus_admin'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False, unique=True)
    module_name = db.Column(db.String(255))
    code_ue = db.Column(db.String(50))
    code_ecue = db.Column(db.String(50))
    field = db.Column(db.String(255))
    department = db.Column(db.String(255))
    option = db.Column(db.String(255))
    volume_presentiel = db.Column(db.String(50))
    volume_personnel = db.Column(db.String(50))
    coefficient = db.Column(db.Float)
    credits = db.Column(db.Float)
    responsible = db.Column(db.String(255))
    teachers = db.Column(db.JSON)

    syllabus = db.relationship('Syllabus', back_populates='tn_admin')


class TNAAP(db.Model):
    __tablename__ = 'tn_aap'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    number = db.Column(db.Integer, nullable=False)  # AAP#
    selected = db.Column(db.Boolean, default=False)

    syllabus = db.relationship('Syllabus', back_populates='tn_aap')

    __table_args__ = (
        db.UniqueConstraint('syllabus_id', 'number', name='uq_tn_aap_num'),
    )


class TNAA(db.Model):
    __tablename__ = 'tn_aa'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    number = db.Column(db.Integer, nullable=False)  # AA#
    description = db.Column(db.Text, nullable=False)

    syllabus = db.relationship('Syllabus', back_populates='tn_aa')
    chapter_links = db.relationship('TNChapterAA', back_populates='aa', cascade='all, delete-orphan')
    section_links = db.relationship('TNSectionAA', back_populates='aa', cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('syllabus_id', 'number', name='uq_tn_aa_num'),
    )


class TNChapter(db.Model):
    __tablename__ = 'tn_chapter'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    index = db.Column(db.Integer, nullable=False)  # chapter_index
    title = db.Column(db.Text, nullable=False)

    syllabus = db.relationship('Syllabus', back_populates='tn_chapters')
    sections = db.relationship('TNSection', back_populates='chapter', cascade='all, delete-orphan',
                               order_by='TNSection.position')
    aa_links = db.relationship('TNChapterAA', back_populates='chapter', cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('syllabus_id', 'index', name='uq_tn_chapter_idx'),
    )


class TNSection(db.Model):
    __tablename__ = 'tn_section'
    id = db.Column(db.Integer, primary_key=True)
    chapter_id = db.Column(db.Integer, db.ForeignKey('tn_chapter.id'), nullable=False)
    parent_section_id = db.Column(db.Integer, db.ForeignKey('tn_section.id'), nullable=True)
    index = db.Column(db.String(20), nullable=False)  # e.g. "1.1"
    title = db.Column(db.Text, nullable=False)
    position = db.Column(db.Integer, default=0)  # drag-and-drop order

    chapter = db.relationship('TNChapter', back_populates='sections')
    aa_links = db.relationship('TNSectionAA', back_populates='section', cascade='all, delete-orphan')
    sub_sections = db.relationship(
        'TNSection',
        backref=db.backref('parent', remote_side=[id]),
        foreign_keys='TNSection.parent_section_id',
        cascade='all, delete-orphan',
    )

    __table_args__ = (
        db.UniqueConstraint('chapter_id', 'index', name='uq_tn_section_idx'),
    )

    def to_dict(self, include_sub_sections=True):
        d = {
            'id': self.id,
            'chapter_id': self.chapter_id,
            'parent_section_id': self.parent_section_id,
            'index': self.index,
            'title': self.title,
            'position': self.position,
        }
        if include_sub_sections:
            d['sub_sections'] = [s.to_dict(include_sub_sections=False) for s in self.sub_sections]
        return d


class TNChapterAA(db.Model):
    __tablename__ = 'tn_chapter_aa'
    chapter_id = db.Column(db.Integer, db.ForeignKey('tn_chapter.id'), primary_key=True)
    aa_id = db.Column(db.Integer, db.ForeignKey('tn_aa.id'), primary_key=True)
    description_override = db.Column(db.Text, nullable=True)

    chapter = db.relationship('TNChapter', back_populates='aa_links')
    aa = db.relationship('TNAA', back_populates='chapter_links')


class TNSectionAA(db.Model):
    __tablename__ = 'tn_section_aa'
    section_id = db.Column(db.Integer, db.ForeignKey('tn_section.id'), primary_key=True)
    aa_id = db.Column(db.Integer, db.ForeignKey('tn_aa.id'), primary_key=True)
    description_override = db.Column(db.Text, nullable=True)

    section = db.relationship('TNSection', back_populates='aa_links')
    aa = db.relationship('TNAA', back_populates='section_links')


class TNEvaluation(db.Model):
    __tablename__ = 'tn_evaluation'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False, unique=True)
    methods = db.Column(db.JSON)
    criteria = db.Column(db.JSON)
    measures = db.Column(db.JSON)
    final_grade_formula = db.Column(db.Text)

    syllabus = db.relationship('Syllabus', back_populates='tn_evaluation')


class TNBibliography(db.Model):
    __tablename__ = 'tn_bibliography'
    id = db.Column(db.Integer, primary_key=True)
    syllabus_id = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    position = db.Column(db.Integer)
    entry = db.Column(db.Text, nullable=False)

    def __init__(self, *args, **kwargs):
        # Backward/forward compatibility: some extraction workflows may send a 'reference' key.
        kwargs.pop('reference', None)
        super().__init__(*args, **kwargs)

    syllabus = db.relationship('Syllabus', back_populates='tn_bibliography')


# ---------------------------
# Syllabus Versioning
# ---------------------------

class SyllabusVersion(db.Model):
    """
    Immutable snapshot of a syllabus at a given point in time.

    Status lifecycle:
        baseline  — auto-created when syllabus is first extracted (v1, never edited)
        draft     — teacher is composing a revision (not yet submitted)
        proposed  — submitted for responsible/admin validation
        validated — approved, can be applied to the live syllabus
        rejected  — rejected with notes by the responsible
    """
    __tablename__ = 'syllabus_version'

    id               = db.Column(db.Integer, primary_key=True)
    syllabus_id      = db.Column(db.Integer, db.ForeignKey('syllabus.id'), nullable=False)
    version_number   = db.Column(db.Integer, nullable=False)          # 1, 2, 3 …
    label            = db.Column(db.String(200), nullable=True)       # e.g. "Révision S1 2024"
    notes            = db.Column(db.Text, nullable=True)              # teacher's rationale
    rejection_notes  = db.Column(db.Text, nullable=True)             # responsible's rejection reason

    # Full serialized state of the syllabus at the time of this version
    snapshot         = db.Column(db.JSON, nullable=False)

    # Computed diff vs the immediately preceding version (None for v1)
    diff_summary     = db.Column(db.JSON, nullable=True)

    status           = db.Column(db.String(20), default='draft', nullable=False)
    # True only for v1 (the original extracted syllabus)
    is_baseline      = db.Column(db.Boolean, default=False, nullable=False)

    created_by_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)
    validated_by_id  = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    validated_at     = db.Column(db.DateTime, nullable=True)
    applied_at       = db.Column(db.DateTime, nullable=True)

    # Relationships
    syllabus         = db.relationship('Syllabus', back_populates='versions')
    created_by       = db.relationship('User', foreign_keys=[created_by_id])
    validated_by     = db.relationship('User', foreign_keys=[validated_by_id])

    __table_args__ = (
        db.UniqueConstraint('syllabus_id', 'version_number', name='uq_sv_number'),
    )

    def to_dict(self, include_snapshot=False):
        d = {
            'id':             self.id,
            'syllabus_id':    self.syllabus_id,
            'version_number': self.version_number,
            'label':          self.label,
            'notes':          self.notes,
            'rejection_notes': self.rejection_notes,
            'status':         self.status,
            'is_baseline':    self.is_baseline,
            'diff_summary':   self.diff_summary,
            'created_by':     {'id': self.created_by.id, 'name': self.created_by.username} if self.created_by else None,
            'created_at':     self.created_at.isoformat() if self.created_at else None,
            'validated_by':   {'id': self.validated_by.id, 'name': self.validated_by.username} if self.validated_by else None,
            'validated_at':   self.validated_at.isoformat() if self.validated_at else None,
            'applied_at':     self.applied_at.isoformat() if self.applied_at else None,
        }
        if include_snapshot:
            d['snapshot'] = self.snapshot
        return d


# ---------------------------
# References & Section Content
# ---------------------------

class CourseReference(db.Model):
    """Bibliographic reference attached to a course (from TN bib or manually added)."""
    __tablename__ = 'course_reference'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    title = db.Column(db.String(500), nullable=False)
    authors = db.Column(db.String(500))
    url = db.Column(db.String(1000))
    ref_type = db.Column(db.String(50), default='book')  # book / article / online / other
    # Origin tracking
    from_bibliography = db.Column(db.Boolean, default=False)
    tn_bib_id = db.Column(db.Integer, db.ForeignKey('tn_bibliography.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    course = db.relationship('Course', backref=db.backref('references', lazy='dynamic', cascade='all, delete-orphan'))
    tn_bib = db.relationship('TNBibliography')
    chapter_links = db.relationship('ChapterReference', back_populates='reference', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<CourseReference {self.title[:40]}>'

    def to_dict(self):
        return {
            'id': self.id,
            'course_id': self.course_id,
            'title': self.title,
            'authors': self.authors,
            'url': self.url,
            'ref_type': self.ref_type,
            'from_bibliography': self.from_bibliography,
            'tn_bib_id': self.tn_bib_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ChapterReference(db.Model):
    """Many-to-many between Chapter and CourseReference with optional page notes."""
    __tablename__ = 'chapter_reference'

    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), primary_key=True)
    reference_id = db.Column(db.Integer, db.ForeignKey('course_reference.id'), primary_key=True)
    pages = db.Column(db.String(500))        # e.g. "pp. 45-67, 89"
    is_active = db.Column(db.Boolean, default=True)

    # Relationships
    chapter = db.relationship('Chapter', backref=db.backref('reference_links', lazy='dynamic', cascade='all, delete-orphan'))
    reference = db.relationship('CourseReference', back_populates='chapter_links')

    def to_dict(self):
        ref = self.reference
        return {
            'reference_id': self.reference_id,
            'chapter_id': self.chapter_id,
            'pages': self.pages,
            'is_active': self.is_active,
            'title': ref.title if ref else None,
            'authors': ref.authors if ref else None,
            'url': ref.url if ref else None,
            'ref_type': ref.ref_type if ref else None,
            'from_bibliography': ref.from_bibliography if ref else False,
        }


class SectionContent(db.Model):
    """AI-generated content for a TNSection, pending teacher validation."""
    __tablename__ = 'section_content'

    id = db.Column(db.Integer, primary_key=True)
    section_id = db.Column(db.Integer, db.ForeignKey('tn_section.id'), nullable=False, unique=True)
    content = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending / approved / rejected
    generated_at = db.Column(db.DateTime, default=datetime.utcnow)
    validated_at = db.Column(db.DateTime)
    validated_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))

    section = db.relationship('TNSection', backref=db.backref('content', uselist=False, cascade='all, delete-orphan'))
    validated_by = db.relationship('User', foreign_keys=[validated_by_id])

    def to_dict(self):
        return {
            'id': self.id,
            'section_id': self.section_id,
            'content': self.content,
            'status': self.status,
            'generated_at': self.generated_at.isoformat() if self.generated_at else None,
            'validated_at': self.validated_at.isoformat() if self.validated_at else None,
            'validated_by_id': self.validated_by_id,
        }
