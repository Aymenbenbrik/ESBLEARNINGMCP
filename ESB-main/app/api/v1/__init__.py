from flask import Blueprint

api_v1_bp = Blueprint('api_v1', __name__, url_prefix='/api/v1')

# Import and register sub-blueprints
from app.api.v1 import auth, users, courses, chapters, documents, quiz, ai, syllabus, notes, chapter_quiz, programs, admin, question_bank, practice_quiz, dashboards, class_chat, references, section_content, syllabus_versions, section_activities, notifications, assignments, attendance, grades, exams, sections
