"""
SkillManager — Central orchestrator for modular AI skills.
Handles discovery, resolution, execution, composition, and monitoring.
"""
from __future__ import annotations

import importlib
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from flask import current_app
from app import db
from app.models.skills import (
    Skill, AgentRegistry, SkillCourseConfig,
    SkillDependency, SkillExecution, skill_role_link,
)

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# Data classes
# ══════════════════════════════════════════════════════════════════════════════

class SkillContext:
    """Immutable context passed to every skill execution."""

    def __init__(
        self,
        user_id: int,
        course_id: Optional[int] = None,
        role: str = 'student',
        agent_id: Optional[str] = None,
        params: Optional[Dict] = None,
        parent_execution_id: Optional[int] = None,
    ):
        self.user_id = user_id
        self.course_id = course_id
        self.role = role
        self.agent_id = agent_id
        self.params = params or {}
        self.parent_execution_id = parent_execution_id
        self.timestamp = datetime.utcnow()

    def with_overrides(self, **kwargs) -> 'SkillContext':
        """Create a new context with some fields overridden."""
        data = {
            'user_id': self.user_id,
            'course_id': self.course_id,
            'role': self.role,
            'agent_id': self.agent_id,
            'params': self.params.copy(),
            'parent_execution_id': self.parent_execution_id,
        }
        data.update(kwargs)
        return SkillContext(**data)


class SkillResult:
    """Standardized skill output."""

    def __init__(
        self,
        success: bool,
        data: Any = None,
        error: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ):
        self.success = success
        self.data = data
        self.error = error
        self.metadata = metadata or {}

    def to_dict(self) -> Dict:
        return {
            'success': self.success,
            'data': self.data,
            'error': self.error,
            'metadata': self.metadata,
        }


# ══════════════════════════════════════════════════════════════════════════════
# SkillManager
# ══════════════════════════════════════════════════════════════════════════════

class SkillManager:
    """
    Central skill orchestrator.

    Usage::

        manager = SkillManager()
        ctx = SkillContext(user_id=1, course_id=5, role='student', agent_id='assistant')
        result = manager.execute('bloom-classifier', ctx, {'content': '...'})
    """

    def __init__(self):
        self._cache: Dict[str, Any] = {}

    # ── Discovery & Resolution ────────────────────────────────────────────

    def list_skills(
        self,
        agent_id: Optional[str] = None,
        role: Optional[str] = None,
        course_id: Optional[int] = None,
        category: Optional[str] = None,
    ) -> List[Dict]:
        """List available skills, filtered by agent/role/course/category."""
        query = Skill.query.filter_by(is_active=True)

        if category:
            query = query.filter_by(category=category)
        if agent_id:
            query = query.filter(Skill.agents.any(AgentRegistry.id == agent_id))

        skills = query.all()
        result = []

        for skill in skills:
            if role:
                allowed = self._get_allowed_roles(skill.id)
                if allowed and role not in allowed:
                    continue
            if course_id:
                config = SkillCourseConfig.query.filter_by(
                    skill_id=skill.id, course_id=course_id,
                ).first()
                if config and not config.is_enabled:
                    continue

            result.append(self._skill_to_dict(skill))

        return result

    def get_skill(self, skill_id: str) -> Optional[Skill]:
        """Get a skill by ID."""
        return Skill.query.filter_by(id=skill_id, is_active=True).first()

    def resolve_for_agent(
        self,
        agent_id: str,
        role: str,
        course_id: Optional[int] = None,
    ) -> List[str]:
        """Resolve which skills are available for a specific agent + role + course."""
        return [
            s['id']
            for s in self.list_skills(agent_id=agent_id, role=role, course_id=course_id)
        ]

    # ── Execution ─────────────────────────────────────────────────────────

    def execute(
        self,
        skill_id: str,
        context: SkillContext,
        input_data: Dict[str, Any],
    ) -> SkillResult:
        """
        Execute a skill with full lifecycle:
        1. Validate access
        2. Resolve dependencies
        3. Run skill function
        4. Track metrics
        """
        skill = self.get_skill(skill_id)
        if not skill:
            return SkillResult(success=False, error=f"Skill '{skill_id}' not found")

        # Access control
        if not self._check_access(skill, context):
            return SkillResult(success=False, error=f"Access denied for role '{context.role}'")

        # Course enablement + param merge
        if context.course_id:
            config = SkillCourseConfig.query.filter_by(
                skill_id=skill_id, course_id=context.course_id,
            ).first()
            if config and not config.is_enabled:
                return SkillResult(
                    success=False,
                    error=f"Skill '{skill_id}' disabled for course {context.course_id}",
                )
            if config and config.params:
                input_data = {**input_data, **config.params}

        # Create execution record
        execution = SkillExecution(
            skill_id=skill_id,
            agent_id=context.agent_id,
            user_id=context.user_id,
            course_id=context.course_id,
            input_data=input_data,
            status='running',
        )
        db.session.add(execution)
        db.session.commit()

        start_time = time.time()
        try:
            # Resolve dependencies
            dep_results = self._resolve_dependencies(skill, context, input_data)
            if dep_results:
                input_data['_dependencies'] = dep_results

            # Load and call
            func = self._load_skill_function(skill)
            result_data = func(context, input_data)

            elapsed_ms = int((time.time() - start_time) * 1000)

            execution.status = 'success'
            execution.output_data = result_data if isinstance(result_data, dict) else {'result': result_data}
            execution.completed_at = datetime.utcnow()
            execution.duration_ms = elapsed_ms
            db.session.commit()

            return SkillResult(
                success=True,
                data=result_data,
                metadata={'execution_id': execution.id, 'duration_ms': elapsed_ms},
            )

        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Skill '{skill_id}' failed: {e}", exc_info=True)

            execution.status = 'error'
            execution.error_msg = str(e)
            execution.completed_at = datetime.utcnow()
            execution.duration_ms = elapsed_ms
            db.session.commit()

            return SkillResult(
                success=False,
                error=str(e),
                metadata={'execution_id': execution.id},
            )

    # ── Composition ───────────────────────────────────────────────────────

    def compose(
        self,
        skill_ids: List[str],
        context: SkillContext,
        initial_input: Dict[str, Any],
    ) -> SkillResult:
        """
        Execute a chain of skills sequentially.
        Output of skill N feeds into skill N+1 via _dependencies.
        """
        current_data = initial_input
        results_chain = []

        for skill_id in skill_ids:
            result = self.execute(skill_id, context, current_data)
            results_chain.append({'skill_id': skill_id, 'result': result.to_dict()})

            if not result.success:
                return SkillResult(
                    success=False,
                    error=f"Chain failed at '{skill_id}': {result.error}",
                    data={'partial_results': results_chain},
                )

            # Feed output as dependency for next skill
            if isinstance(result.data, dict):
                current_data = {**current_data}
                current_data.setdefault('_dependencies', {})
                current_data['_dependencies'][skill_id] = result.data
            else:
                current_data = {**current_data, '_prev': result.data}

        return SkillResult(
            success=True,
            data=current_data.get('_dependencies', current_data),
            metadata={'chain': results_chain},
        )

    # ── LangChain Tool Bridge ─────────────────────────────────────────────

    def as_langchain_tools(
        self,
        agent_id: str,
        role: str,
        user_id: int = 0,
        course_id: Optional[int] = None,
    ):
        """Convert available skills into LangChain tools for ReAct agents."""
        from langchain_core.tools import StructuredTool

        skill_ids = self.resolve_for_agent(agent_id, role, course_id)
        tools = []

        for skill_id in skill_ids:
            skill = self.get_skill(skill_id)
            if not skill:
                continue

            def _make_executor(sid, uid, cid, r, aid):
                def _execute(**kwargs):
                    ctx = SkillContext(
                        user_id=uid,
                        course_id=cid,
                        role=r,
                        agent_id=aid,
                    )
                    result = self.execute(sid, ctx, kwargs)
                    return json.dumps(result.to_dict(), ensure_ascii=False, default=str)
                return _execute

            lc_tool = StructuredTool.from_function(
                func=_make_executor(skill_id, user_id, course_id, role, agent_id),
                name=f"skill_{skill_id.replace('-', '_')}",
                description=skill.description or skill.name,
            )
            tools.append(lc_tool)

        return tools

    # ── Analytics ─────────────────────────────────────────────────────────

    def get_usage_stats(
        self,
        skill_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        days: int = 30,
    ) -> Dict:
        """Get usage statistics for skills."""
        from sqlalchemy import func as sqla_func

        since = datetime.utcnow() - timedelta(days=days)

        query = db.session.query(
            SkillExecution.skill_id,
            sqla_func.count(SkillExecution.id).label('total_calls'),
            sqla_func.avg(SkillExecution.duration_ms).label('avg_duration_ms'),
            sqla_func.sum(SkillExecution.tokens_used).label('total_tokens'),
            sqla_func.sum(
                sqla_func.case(
                    (SkillExecution.status == 'error', 1), else_=0,
                )
            ).label('error_count'),
        ).filter(SkillExecution.started_at >= since)

        if skill_id:
            query = query.filter(SkillExecution.skill_id == skill_id)
        if agent_id:
            query = query.filter(SkillExecution.agent_id == agent_id)

        rows = query.group_by(SkillExecution.skill_id).all()

        return {
            'period_days': days,
            'skills': [
                {
                    'skill_id': r.skill_id,
                    'total_calls': r.total_calls,
                    'avg_duration_ms': round(r.avg_duration_ms or 0),
                    'total_tokens': r.total_tokens or 0,
                    'error_count': r.error_count or 0,
                    'error_rate': round((r.error_count or 0) / max(r.total_calls, 1) * 100, 1),
                }
                for r in rows
            ],
        }

    # ── Internal helpers ──────────────────────────────────────────────────

    def _load_skill_function(self, skill: Skill):
        """Dynamically import and cache the skill's execute function."""
        cache_key = f"{skill.module_path}.{skill.function_name}:{skill.version}"
        if cache_key not in self._cache:
            module = importlib.import_module(skill.module_path)
            self._cache[cache_key] = getattr(module, skill.function_name)
        return self._cache[cache_key]

    def _check_access(self, skill: Skill, context: SkillContext) -> bool:
        """Check if the role is allowed to use this skill."""
        allowed = self._get_allowed_roles(skill.id)
        if not allowed:
            return True
        return context.role in allowed

    def _get_allowed_roles(self, skill_id: str) -> List[str]:
        """Get roles allowed for a skill."""
        from sqlalchemy import text
        rows = db.session.execute(
            text("SELECT role FROM skill_role_link WHERE skill_id = :sid"),
            {'sid': skill_id},
        ).fetchall()
        return [r[0] for r in rows]

    def _resolve_dependencies(
        self,
        skill: Skill,
        context: SkillContext,
        input_data: Dict,
    ) -> Optional[Dict]:
        """Execute dependency skills and return their results."""
        deps = SkillDependency.query.filter_by(skill_id=skill.id).all()
        if not deps:
            return None

        dep_results = {}
        for dep in deps:
            sub_ctx = context.with_overrides(parent_execution_id=None)
            result = self.execute(dep.depends_on_id, sub_ctx, input_data)
            if result.success:
                dep_results[dep.depends_on_id] = result.data

        return dep_results

    @staticmethod
    def _skill_to_dict(skill: Skill) -> Dict:
        return {
            'id': skill.id,
            'name': skill.name,
            'description': skill.description,
            'category': skill.category,
            'version': skill.version,
            'input_schema': skill.input_schema,
            'output_schema': skill.output_schema,
            'agents': [a.id for a in skill.agents],
        }
