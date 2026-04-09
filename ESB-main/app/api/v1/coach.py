"""
Coach API — /api/v1/coach/
AI-powered student performance analysis and recommendations.
"""
import logging
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.users import User
from app.models.courses import Enrollment

logger = logging.getLogger(__name__)

coach_api_bp = Blueprint('coach_api', __name__, url_prefix='/coach')


def _get_current_user():
    user_id = int(get_jwt_identity())
    return User.query.get(user_id)


@coach_api_bp.route('/analyze', methods=['GET'])
@jwt_required()
def analyze_my_performance():
    """Run AI analysis on the current student's performance across all modules."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    from app.services.coach_agent import analyze_student_performance
    result = analyze_student_performance(user.id)

    return jsonify(result), 200


@coach_api_bp.route('/analyze/<int:student_id>', methods=['GET'])
@jwt_required()
def analyze_student(student_id: int):
    """Teacher: run AI analysis on a specific student."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not user.is_teacher and not user.is_superuser and user.id != student_id:
        return jsonify({'error': 'Access denied'}), 403

    course_id = request.args.get('course_id', type=int)
    course_ids = [course_id] if course_id else None

    from app.services.coach_agent import analyze_student_performance
    result = analyze_student_performance(student_id, course_ids)

    return jsonify(result), 200


@coach_api_bp.route('/skill-map/<int:student_id>/<int:course_id>', methods=['GET'])
@jwt_required()
def get_skill_map(student_id: int, course_id: int):
    """Get radar-chart-ready skill map for a student in a course."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not user.is_teacher and not user.is_superuser and user.id != student_id:
        return jsonify({'error': 'Access denied'}), 403

    from app.services.coach_agent import generate_skill_map
    result = generate_skill_map(student_id, course_id)

    return jsonify(result), 200


@coach_api_bp.route('/recommendations', methods=['GET'])
@jwt_required()
def get_my_recommendations():
    """Get cached recommendations for the current student (lightweight version)."""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    from app.services.coach_agent import analyze_student_performance
    result = analyze_student_performance(user.id)

    return jsonify({
        'recommendations': result.get('recommendations', []),
        'skill_gaps': result.get('skill_gaps', []),
        'study_plan': result.get('study_plan', {}),
    }), 200
