"""
Skills API — /api/v1/skills/
REST endpoints for skill management, execution, and monitoring.
"""

import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.services.skill_manager import SkillManager, SkillContext

logger = logging.getLogger(__name__)

skills_api_bp = Blueprint('skills_api', __name__, url_prefix='/skills')

_manager = SkillManager()


def _get_current_user():
    from app.models.users import User
    try:
        user_id = int(get_jwt_identity())
        return User.query.get(user_id)
    except (ValueError, TypeError):
        return None


def _determine_role(user) -> str:
    if user.is_superuser:
        return 'admin'
    if user.is_teacher:
        return 'teacher'
    return 'student'


# ── List / Get ────────────────────────────────────────────────────────────

@skills_api_bp.route('/', methods=['GET'])
@jwt_required()
def list_skills():
    """GET /api/v1/skills/?agent=assistant&category=analysis&course_id=5"""
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 401

    role = _determine_role(user)
    agent_id = request.args.get('agent')
    course_id = request.args.get('course_id', type=int)
    category = request.args.get('category')

    skills = _manager.list_skills(
        agent_id=agent_id, role=role,
        course_id=course_id, category=category,
    )
    return jsonify({'skills': skills, 'count': len(skills)})


@skills_api_bp.route('/<skill_id>', methods=['GET'])
@jwt_required()
def get_skill(skill_id):
    """GET /api/v1/skills/bloom-classifier"""
    skill = _manager.get_skill(skill_id)
    if not skill:
        return jsonify({'error': 'Skill not found'}), 404
    return jsonify(_manager._skill_to_dict(skill))


# ── Execute ───────────────────────────────────────────────────────────────

@skills_api_bp.route('/<skill_id>/execute', methods=['POST'])
@jwt_required()
def execute_skill(skill_id):
    """
    POST /api/v1/skills/bloom-classifier/execute
    Body: {"input": {"content": "...", "content_type": "question"}, "course_id": 5}
    """
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 401

    body = request.get_json() or {}
    role = _determine_role(user)

    ctx = SkillContext(
        user_id=user.id,
        course_id=body.get('course_id'),
        role=role,
    )
    result = _manager.execute(skill_id, ctx, body.get('input', {}))
    status_code = 200 if result.success else 500
    return jsonify(result.to_dict()), status_code


# ── Compose ───────────────────────────────────────────────────────────────

@skills_api_bp.route('/compose', methods=['POST'])
@jwt_required()
def compose_skills():
    """
    POST /api/v1/skills/compose
    Body: {"skill_ids": ["bloom-classifier", "feedback-writer"], "input": {...}, "course_id": 5}
    """
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 401

    body = request.get_json() or {}
    skill_ids = body.get('skill_ids', [])
    if not skill_ids:
        return jsonify({'error': 'skill_ids is required'}), 400

    role = _determine_role(user)
    ctx = SkillContext(
        user_id=user.id,
        course_id=body.get('course_id'),
        role=role,
    )
    result = _manager.compose(skill_ids, ctx, body.get('input', {}))
    status_code = 200 if result.success else 500
    return jsonify(result.to_dict()), status_code


# ── Analytics ─────────────────────────────────────────────────────────────

@skills_api_bp.route('/stats', methods=['GET'])
@jwt_required()
def skill_stats():
    """GET /api/v1/skills/stats?days=30&skill_id=bloom-classifier"""
    user = _get_current_user()
    if not user or not (user.is_teacher or user.is_superuser):
        return jsonify({'error': 'Teacher or admin access required'}), 403

    days = request.args.get('days', 30, type=int)
    skill_id = request.args.get('skill_id')
    agent_id = request.args.get('agent_id')

    stats = _manager.get_usage_stats(skill_id=skill_id, agent_id=agent_id, days=days)
    return jsonify(stats)


# ── Course config ─────────────────────────────────────────────────────────

@skills_api_bp.route('/<skill_id>/config', methods=['PUT'])
@jwt_required()
def configure_skill(skill_id):
    """
    PUT /api/v1/skills/bloom-classifier/config
    Body: {"course_id": 5, "is_enabled": true, "params": {"threshold": 0.8}}
    """
    user = _get_current_user()
    if not user or not (user.is_teacher or user.is_superuser):
        return jsonify({'error': 'Teacher or admin access required'}), 403

    body = request.get_json() or {}
    course_id = body.get('course_id')
    if not course_id:
        return jsonify({'error': 'course_id is required'}), 400

    from app.models.skills import SkillCourseConfig
    from app import db

    config = SkillCourseConfig.query.filter_by(
        skill_id=skill_id, course_id=course_id,
    ).first()

    if not config:
        config = SkillCourseConfig(skill_id=skill_id, course_id=course_id)
        db.session.add(config)

    config.is_enabled = body.get('is_enabled', True)
    if 'params' in body:
        config.params = body['params']
    db.session.commit()

    return jsonify({'status': 'updated', 'skill_id': skill_id, 'course_id': course_id})


# ── Agents list ───────────────────────────────────────────────────────────

@skills_api_bp.route('/agents', methods=['GET'])
@jwt_required()
def list_agents():
    """GET /api/v1/skills/agents — list registered AI agents."""
    from app.models.skills import AgentRegistry
    agents = AgentRegistry.query.filter_by(is_active=True).all()
    return jsonify({
        'agents': [
            {
                'id': a.id,
                'name': a.name,
                'description': a.description,
                'agent_type': a.agent_type,
                'skills_count': len(a.skills),
            }
            for a in agents
        ],
    })
