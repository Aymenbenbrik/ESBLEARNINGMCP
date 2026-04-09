"""
Feedback API — /api/v1/feedback/
AI-generated post-evaluation feedback for exam sessions.
"""
import logging
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.users import User
from app.models.exam_bank import ExamSession
from app.models.feedback import EvaluationFeedback

logger = logging.getLogger(__name__)

feedback_api_bp = Blueprint('feedback_api', __name__, url_prefix='/feedback')


def _get_current_user():
    user_id = int(get_jwt_identity())
    return User.query.get(user_id)


@feedback_api_bp.route('/generate/<int:exam_session_id>', methods=['POST'])
@jwt_required()
def generate_feedback(exam_session_id: int):
    """Generate AI feedback for a completed exam session."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    session = ExamSession.query.get(exam_session_id)
    if not session:
        return jsonify({'error': 'Exam session not found'}), 404

    # Only the student, teacher, or admin can generate feedback
    if not user.is_teacher and not user.is_superuser and user.id != session.student_id:
        return jsonify({'error': 'Access denied'}), 403

    try:
        from app.services.feedback_service import generate_feedback as gen_fb
        feedback = gen_fb(exam_session_id)
        return jsonify(feedback.to_dict()), 201
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except RuntimeError as exc:
        logger.error("Feedback generation failed: %s", exc)
        return jsonify({'error': str(exc)}), 502


@feedback_api_bp.route('/<int:exam_session_id>', methods=['GET'])
@jwt_required()
def get_feedback(exam_session_id: int):
    """Get existing feedback for an exam session."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    session = ExamSession.query.get(exam_session_id)
    if not session:
        return jsonify({'error': 'Exam session not found'}), 404

    if not user.is_teacher and not user.is_superuser and user.id != session.student_id:
        return jsonify({'error': 'Access denied'}), 403

    feedback = EvaluationFeedback.query.filter_by(exam_session_id=exam_session_id).first()
    if not feedback:
        return jsonify({'error': 'No feedback generated yet'}), 404

    return jsonify(feedback.to_dict()), 200
