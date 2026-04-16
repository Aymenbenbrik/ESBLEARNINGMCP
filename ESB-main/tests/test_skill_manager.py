"""
Tests for SkillManager — no real LLM required.
"""
import pytest
from unittest.mock import patch, MagicMock

from app.models.skills import Skill, AgentRegistry, skill_role_link
from app.services.skill_manager import SkillManager, SkillContext, SkillResult


# ── Seed helper ──────────────────────────────────────────────────────────────

def _seed_test_skill(db_session):
    """Insert a minimal Skill + AgentRegistry + role link for testing."""
    agent = AgentRegistry(
        id='test-agent',
        name='Test Agent',
        agent_type='react',
        module_path='test',
    )
    skill = Skill(
        id='test-skill',
        name='Test Skill',
        category='analysis',
        module_path='test.module',
    )
    db_session.add_all([agent, skill])
    db_session.flush()
    db_session.execute(
        skill_role_link.insert().values(skill_id='test-skill', role='teacher')
    )
    db_session.commit()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestSkillNotFound:
    def test_skill_not_found(self, db):
        """execute() on a non-existent skill_id must return SkillResult(success=False)."""
        manager = SkillManager()
        ctx = SkillContext(user_id=1, role='teacher')
        result = manager.execute('non-existent-skill-xyz', ctx, {})
        assert isinstance(result, SkillResult)
        assert result.success is False
        assert result.error is not None


class TestAccessControl:
    def test_access_denied_wrong_role(self, db):
        """execute() with a role NOT in allowed_roles returns success=False with 'Access denied'."""
        _seed_test_skill(db.session)

        manager = SkillManager()
        ctx = SkillContext(user_id=1, role='student')  # only 'teacher' is allowed

        with patch.object(manager, '_load_skill_function') as mock_load:
            mock_load.return_value = MagicMock(return_value={'ok': True})
            result = manager.execute('test-skill', ctx, {})

        assert result.success is False
        assert 'Access denied' in (result.error or '')

    def test_access_granted(self, db):
        """execute() with the correct role calls the skill function."""
        _seed_test_skill(db.session)

        manager = SkillManager()
        ctx = SkillContext(user_id=1, role='teacher', agent_id='test-agent')

        mock_fn = MagicMock(return_value={'result': 'ok'})
        with patch.object(manager, '_load_skill_function', return_value=mock_fn):
            result = manager.execute('test-skill', ctx, {'input': 'data'})

        mock_fn.assert_called_once()
        assert result.success is True


class TestListSkills:
    def test_list_skills_empty(self, db):
        """list_skills() when there are no skills returns an empty list."""
        # Ensure table is clear (session scope app creates a fresh in-memory DB)
        from app.models.skills import Skill as SkillModel
        SkillModel.query.delete()
        db.session.commit()

        manager = SkillManager()
        skills = manager.list_skills()
        assert isinstance(skills, list)
        assert len(skills) == 0


class TestUsageStats:
    def test_get_usage_stats_empty(self, db):
        """get_usage_stats() with no executions returns the expected empty structure."""
        from app.models.skills import SkillExecution
        SkillExecution.query.delete()
        db.session.commit()

        manager = SkillManager()
        stats = manager.get_usage_stats(days=7)

        assert stats['period_days'] == 7
        assert isinstance(stats['skills'], list)
        assert len(stats['skills']) == 0
