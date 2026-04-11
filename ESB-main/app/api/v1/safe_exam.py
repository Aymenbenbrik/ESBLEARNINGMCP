"""
SafeExam Configuration API
===========================
GET  /courses/<id>/safe-exam-config   get SafeExam config for a course
PUT  /courses/<id>/safe-exam-config   update SafeExam config (teacher only)
"""
import logging

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api.v1 import api_v1_bp
from app import db
from app.models import User, Course, Enrollment, CourseSafeExamConfig

logger = logging.getLogger(__name__)


@api_v1_bp.route('/courses/<int:course_id>/safe-exam-config', methods=['GET'])
@jwt_required()
def get_safe_exam_config(course_id):
    """Get SafeExam configuration for a course."""
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    course = Course.query.get_or_404(course_id)

    is_teacher = (user.is_teacher and course.teacher_id == user.id) or user.is_superuser
    is_student = bool(Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first())

    if not is_teacher and not is_student:
        return jsonify({'error': 'Access denied'}), 403

    config = CourseSafeExamConfig.query.filter_by(course_id=course_id).first()
    if not config:
        # Return defaults (not yet configured)
        return jsonify({
            'config': {
                'course_id': course_id,
                'safe_exam_enabled': False,
                'fullscreen_required': True,
                'disable_copy_paste': True,
                'disable_right_click': True,
                'disable_print_screen': True,
                'tab_switch_detection': True,
                'max_violations_before_disqualify': 3,
                'configured_by': None,
                'updated_at': None,
            }
        }), 200

    return jsonify({'config': config.to_dict()}), 200


@api_v1_bp.route('/courses/<int:course_id>/safe-exam-config', methods=['PUT'])
@jwt_required()
def update_safe_exam_config(course_id):
    """Update SafeExam configuration (teacher only)."""
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    course = Course.query.get_or_404(course_id)

    if not user.is_teacher or course.teacher_id != user.id:
        if not user.is_superuser:
            return jsonify({'error': 'Teacher access required'}), 403

    data = request.get_json() or {}
    config = CourseSafeExamConfig.query.filter_by(course_id=course_id).first()
    if not config:
        config = CourseSafeExamConfig(course_id=course_id, configured_by_id=user_id)
        db.session.add(config)

    for field in ('safe_exam_enabled', 'fullscreen_required', 'disable_copy_paste',
                  'disable_right_click', 'disable_print_screen', 'tab_switch_detection',
                  'max_violations_before_disqualify'):
        if field in data:
            setattr(config, field, data[field])

    config.configured_by_id = user_id
    db.session.commit()

    return jsonify({'config': config.to_dict()}), 200
