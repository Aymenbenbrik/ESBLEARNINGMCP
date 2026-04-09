from datetime import datetime
from app import db


class EvaluationFeedback(db.Model):
    """AI-generated post-evaluation feedback for a student exam session."""
    __tablename__ = 'evaluation_feedback'

    id                   = db.Column(db.Integer, primary_key=True)
    exam_session_id      = db.Column(db.Integer, db.ForeignKey('exam_session.id'), nullable=False)
    student_id           = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    feedback_text        = db.Column(db.Text, nullable=True)
    strengths_json       = db.Column(db.Text, nullable=True)      # JSON array of strings
    weaknesses_json      = db.Column(db.Text, nullable=True)      # JSON array of strings
    recommendations_json = db.Column(db.Text, nullable=True)      # JSON array of strings

    generated_at         = db.Column(db.DateTime, nullable=True)
    created_at           = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at           = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    exam_session = db.relationship('ExamSession', backref=db.backref('ai_feedback', uselist=False))
    student      = db.relationship('User', foreign_keys=[student_id])

    def to_dict(self):
        import json
        return {
            'id':               self.id,
            'exam_session_id':  self.exam_session_id,
            'student_id':       self.student_id,
            'feedback_text':    self.feedback_text,
            'strengths':        json.loads(self.strengths_json) if self.strengths_json else [],
            'weaknesses':       json.loads(self.weaknesses_json) if self.weaknesses_json else [],
            'recommendations':  json.loads(self.recommendations_json) if self.recommendations_json else [],
            'generated_at':     self.generated_at.isoformat() if self.generated_at else None,
            'created_at':       self.created_at.isoformat() if self.created_at else None,
            'updated_at':       self.updated_at.isoformat() if self.updated_at else None,
        }
