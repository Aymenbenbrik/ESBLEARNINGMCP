"""
Practice Quiz API Endpoints
Separate from course test quiz system.
"""

import logging
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models import User
from app.services import practice_quiz_service

logger = logging.getLogger(__name__)

practice_quiz_api_bp = Blueprint('practice_quiz_api', __name__, url_prefix='/practice-quiz')


def get_current_user():
    """Get current user from JWT token."""
    user_id = get_jwt_identity()
    return User.query.get(user_id)


@practice_quiz_api_bp.route('/chapters/<int:chapter_id>/availability', methods=['GET'])
@jwt_required()
def check_availability(chapter_id):
    """Check if approved questions are available for a chapter."""
    user = get_current_user()

    if user.is_teacher:
        return jsonify({'error': 'Practice quizzes are for students only'}), 403

    try:
        result = practice_quiz_service.check_question_availability(chapter_id)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error checking availability: {e}")
        return jsonify({'error': 'Failed to check question availability'}), 500


@practice_quiz_api_bp.route('/attempts/<int:chapter_id>', methods=['GET'])
@jwt_required()
def get_attempts(chapter_id):
    """Get attempt count for current student in a chapter."""
    user = get_current_user()

    if user.is_teacher:
        return jsonify({'error': 'Practice quizzes are for students only'}), 403

    try:
        result = practice_quiz_service.get_attempt_count(user.id, chapter_id)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error getting attempts: {e}")
        return jsonify({'error': 'Failed to get attempt count'}), 500


@practice_quiz_api_bp.route('/chapters/<int:chapter_id>/start', methods=['POST'])
@jwt_required()
def start_practice_quiz(chapter_id):
    """Create and start a new practice quiz."""
    user = get_current_user()

    if user.is_teacher:
        return jsonify({'error': 'Practice quizzes are for students only'}), 403

    data = request.get_json() or {}
    num_questions = data.get('num_questions', 8)

    # Validate num_questions
    try:
        num_questions = int(num_questions)
        if num_questions < 1 or num_questions > 8:
            return jsonify({'error': 'Number of questions must be between 1 and 8'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid number of questions'}), 400

    try:
        quiz = practice_quiz_service.create_practice_quiz(user.id, chapter_id, num_questions)
        return jsonify({
            'quiz_id': quiz.id,
            'num_questions': quiz.num_questions,
            'attempt_number': quiz.attempt_number,
            'message': 'Practice quiz created successfully'
        }), 201
    except ValueError as e:
        logger.warning(f"Validation error creating quiz: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating practice quiz: {e}")
        return jsonify({'error': 'Failed to create practice quiz'}), 500


@practice_quiz_api_bp.route('/<int:quiz_id>', methods=['GET'])
@jwt_required()
def get_quiz(quiz_id):
    """Get practice quiz metadata."""
    user = get_current_user()

    try:
        quiz = practice_quiz_service.get_practice_quiz(quiz_id)
        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        # Verify ownership
        if quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        return jsonify({
            'id': quiz.id,
            'course_id': quiz.course_id,
            'chapter_id': quiz.chapter_id,
            'chapter_title': quiz.chapter.title if quiz.chapter else None,
            'attempt_number': quiz.attempt_number,
            'max_attempts': quiz.max_attempts,
            'num_questions': quiz.num_questions,
            'score': quiz.score,
            'is_completed': quiz.is_completed,
            'created_at': quiz.created_at.isoformat() if quiz.created_at else None,
            'completed_at': quiz.completed_at.isoformat() if quiz.completed_at else None
        }), 200
    except Exception as e:
        logger.error(f"Error getting quiz: {e}")
        return jsonify({'error': 'Failed to get quiz'}), 500


@practice_quiz_api_bp.route('/<int:quiz_id>/questions', methods=['GET'])
@jwt_required()
def get_questions(quiz_id):
    """Get questions for a practice quiz (answers hidden until completed)."""
    user = get_current_user()

    try:
        quiz = practice_quiz_service.get_practice_quiz(quiz_id)
        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        # Verify ownership
        if quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        questions = practice_quiz_service.get_practice_quiz_questions(quiz_id)
        return jsonify({'questions': questions}), 200
    except Exception as e:
        logger.error(f"Error getting questions: {e}")
        return jsonify({'error': 'Failed to get questions'}), 500


@practice_quiz_api_bp.route('/<int:quiz_id>/answer/<int:question_index>', methods=['POST'])
@jwt_required()
def submit_answer(quiz_id, question_index):
    """Submit an answer for a specific question."""
    user = get_current_user()

    try:
        quiz = practice_quiz_service.get_practice_quiz(quiz_id)
        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        # Verify ownership
        if quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json() or {}
        answer = data.get('answer', '').strip().upper()

        if not answer or answer not in ['A', 'B', 'C']:
            return jsonify({'error': 'Invalid answer. Must be A, B, or C'}), 400

        result = practice_quiz_service.submit_answer(quiz_id, question_index, answer)
        return jsonify(result), 200
    except ValueError as e:
        logger.warning(f"Validation error submitting answer: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error submitting answer: {e}")
        return jsonify({'error': 'Failed to submit answer'}), 500


@practice_quiz_api_bp.route('/<int:quiz_id>/complete', methods=['POST'])
@jwt_required()
def complete_quiz(quiz_id):
    """Complete and grade a practice quiz."""
    user = get_current_user()

    try:
        quiz = practice_quiz_service.get_practice_quiz(quiz_id)
        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        # Verify ownership
        if quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        result = practice_quiz_service.complete_practice_quiz(quiz_id)
        return jsonify(result), 200
    except ValueError as e:
        logger.warning(f"Validation error completing quiz: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error completing quiz: {e}")
        return jsonify({'error': 'Failed to complete quiz'}), 500


@practice_quiz_api_bp.route('/<int:quiz_id>/results', methods=['GET'])
@jwt_required()
def get_results(quiz_id):
    """Get results for a completed practice quiz."""
    user = get_current_user()

    try:
        quiz = practice_quiz_service.get_practice_quiz(quiz_id)
        if not quiz:
            return jsonify({'error': 'Quiz not found'}), 404

        # Verify ownership
        if quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        result = practice_quiz_service.get_practice_quiz_results(quiz_id)
        return jsonify(result), 200
    except ValueError as e:
        logger.warning(f"Validation error getting results: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error getting results: {e}")
        return jsonify({'error': 'Failed to get results'}), 500
