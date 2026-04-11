"""
Skills system models for ESB-Learning.
Provides a registry of modular AI capabilities shared across agents.
"""
from datetime import datetime
from app import db


# ── Association tables ────────────────────────────────────────────────────────

skill_agent_link = db.Table(
    'skill_agent_link',
    db.Column('skill_id', db.String(64), db.ForeignKey('skill.id'), primary_key=True),
    db.Column('agent_id', db.String(64), db.ForeignKey('agent_registry.id'), primary_key=True),
)

skill_role_link = db.Table(
    'skill_role_link',
    db.Column('skill_id', db.String(64), db.ForeignKey('skill.id'), primary_key=True),
    db.Column('role', db.String(20), primary_key=True),
)


class AgentRegistry(db.Model):
    """Registered AI agents in the platform."""
    __tablename__ = 'agent_registry'

    id          = db.Column(db.String(64), primary_key=True)
    name        = db.Column(db.String(128), nullable=False)
    description = db.Column(db.Text)
    agent_type  = db.Column(db.String(32), nullable=False)      # react, graph, sequential
    module_path = db.Column(db.String(256), nullable=False)
    is_active   = db.Column(db.Boolean, default=True)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    skills = db.relationship('Skill', secondary=skill_agent_link, back_populates='agents')

    def __repr__(self):
        return f'<AgentRegistry {self.id}>'


class Skill(db.Model):
    """A modular, reusable AI capability."""
    __tablename__ = 'skill'

    id          = db.Column(db.String(64), primary_key=True)
    name        = db.Column(db.String(128), nullable=False)
    description = db.Column(db.Text)
    version     = db.Column(db.String(16), default='1.0.0')
    category    = db.Column(db.String(32), nullable=False)      # analysis, generation, scoring, planning

    # Schema definitions (JSON Schema for input/output contracts)
    input_schema  = db.Column(db.JSON)
    output_schema = db.Column(db.JSON)

    # Implementation reference
    module_path   = db.Column(db.String(256), nullable=False)
    function_name = db.Column(db.String(128), default='execute')

    # LLM config overrides (null = use defaults from app config)
    temperature     = db.Column(db.Float)
    model_override  = db.Column(db.String(64))
    max_tokens      = db.Column(db.Integer)

    # State
    is_active   = db.Column(db.Boolean, default=True)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    agents         = db.relationship('AgentRegistry', secondary=skill_agent_link, back_populates='skills')
    course_configs = db.relationship('SkillCourseConfig', back_populates='skill', cascade='all, delete-orphan')
    executions     = db.relationship('SkillExecution', back_populates='skill', cascade='all, delete-orphan')
    dependencies   = db.relationship(
        'SkillDependency',
        foreign_keys='SkillDependency.skill_id',
        back_populates='skill',
        cascade='all, delete-orphan',
    )

    def __repr__(self):
        return f'<Skill {self.id} v{self.version}>'


class SkillCourseConfig(db.Model):
    """Per-course skill activation and parameter overrides."""
    __tablename__ = 'skill_course_config'

    id        = db.Column(db.Integer, primary_key=True)
    skill_id  = db.Column(db.String(64), db.ForeignKey('skill.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)

    is_enabled = db.Column(db.Boolean, default=True)
    params     = db.Column(db.JSON)

    skill  = db.relationship('Skill', back_populates='course_configs')
    course = db.relationship('Course')

    __table_args__ = (
        db.UniqueConstraint('skill_id', 'course_id', name='uq_skill_course'),
    )

    def __repr__(self):
        return f'<SkillCourseConfig {self.skill_id}@course:{self.course_id}>'


class SkillDependency(db.Model):
    """Declares that a skill depends on another skill's output."""
    __tablename__ = 'skill_dependency'

    id             = db.Column(db.Integer, primary_key=True)
    skill_id       = db.Column(db.String(64), db.ForeignKey('skill.id'), nullable=False)
    depends_on_id  = db.Column(db.String(64), db.ForeignKey('skill.id'), nullable=False)

    skill      = db.relationship('Skill', foreign_keys=[skill_id], back_populates='dependencies')
    depends_on = db.relationship('Skill', foreign_keys=[depends_on_id])

    def __repr__(self):
        return f'<SkillDependency {self.skill_id} → {self.depends_on_id}>'


class SkillExecution(db.Model):
    """Tracks every skill invocation for monitoring & analytics."""
    __tablename__ = 'skill_execution'

    id         = db.Column(db.Integer, primary_key=True)
    skill_id   = db.Column(db.String(64), db.ForeignKey('skill.id'), nullable=False)
    agent_id   = db.Column(db.String(64))
    user_id    = db.Column(db.Integer, db.ForeignKey('user.id'))
    course_id  = db.Column(db.Integer, db.ForeignKey('course.id'))

    input_data  = db.Column(db.JSON)
    output_data = db.Column(db.JSON)
    status      = db.Column(db.String(20), default='pending')   # pending, running, success, error
    error_msg   = db.Column(db.Text)

    started_at    = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at  = db.Column(db.DateTime)
    duration_ms   = db.Column(db.Integer)
    tokens_used   = db.Column(db.Integer)

    skill = db.relationship('Skill', back_populates='executions')

    def __repr__(self):
        return f'<SkillExecution {self.id} skill:{self.skill_id} [{self.status}]>'
