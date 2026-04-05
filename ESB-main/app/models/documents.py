from datetime import datetime
import os
from flask import current_app, url_for
from werkzeug.utils import secure_filename
from app import db


# ---------------------------
# Documents & Notes
# ---------------------------
class Document(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    file_path = db.Column(db.String(255), nullable=True)  # Optional for quizzes (no file)
    file_type = db.Column(db.String(10), nullable=True)   # Optional for quizzes
    document_type = db.Column(db.String(50), nullable=False, server_default='general')  # 'quiz', 'pdf', etc.
    summary = db.Column(db.Text, nullable=True)           # Reuse for quiz instructions if needed
    quiz_data = db.Column(db.JSON, nullable=True)         # For quizzes - list of question dicts
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=True)
    # Many parts of the app expect Document -> Chapter linkage (document.chapter_id).
    # The database schema includes this column, and Chapter.documents relies on it.
    chapter_id = db.Column(db.Integer, db.ForeignKey('chapter.id'), nullable=True)
    week_number = db.Column(db.Integer, nullable=True)    # For week quizzes
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = db.relationship('Note', backref='document', lazy=True, cascade="all, delete-orphan")
    chat_sessions = db.relationship('ChatSession', backref='document', lazy='dynamic', cascade='all, delete-orphan')
    quizzes = db.relationship('Quiz', backref='document', lazy='dynamic', cascade='all, delete-orphan')
    analysis_results = db.Column(db.JSON, nullable=True)  # For exam analysis (CLO %, Bloom's balance)
    analysis_report_path = db.Column(db.String(500), nullable=True)  # Path to generated PDF report
    content_metadata = db.Column('metadata', db.JSON)

    def __repr__(self):
        return f'<Document {self.title} (Type: {self.document_type}, Week: {self.week_number})>'

    def get_quiz_questions(self):
        if self.document_type != 'quiz' or not self.quiz_data:
            return []
        return self.quiz_data

    @property
    def is_quiz(self):
        return self.document_type == 'quiz'


class Note(db.Model):
    __tablename__ = 'notes'
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=True)
    image_path = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    document_id = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=False)

    user = db.relationship('User', backref=db.backref('notes', lazy=True))

    def __init__(self, user_id, document_id, content=None, image_file=None):
        self.user_id = user_id
        self.document_id = document_id
        self.content = content
        if image_file:
            filename = secure_filename(image_file.filename)
            unique_filename = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{filename}"
            self.image_path = os.path.join('notes_images', unique_filename)
            upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'notes_images')
            if not os.path.exists(upload_dir):
                os.makedirs(upload_dir)
            image_file.save(os.path.join(upload_dir, unique_filename))

    def to_dict(self):
        result = {
            'id': self.id,
            'content': self.content,
            'created_at': self.created_at.strftime('%b %d, %Y, %I:%M %p'),
            'user_id': self.user_id,
            'document_id': self.document_id
        }
        if self.image_path:
            result['image_path'] = self.image_path
            result['image_url'] = url_for('notes.serve_note_image', filename=self.image_path)
        return result

    def delete_file(self):
        if self.image_path:
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], self.image_path)
            if os.path.exists(file_path):
                os.remove(file_path)
