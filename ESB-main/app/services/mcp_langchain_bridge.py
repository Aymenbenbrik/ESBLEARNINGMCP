"""
mcp_langchain_bridge.py — Convert MCP tools + Skills to LangChain tools.
========================================================================

Provides utility functions to convert:
  1. MCP tool definitions (JSON Schema) + Python implementations → LangChain StructuredTools
  2. SkillManager skills → LangChain StructuredTools (already in skill_manager.py)

This enables any LangGraph agent (ReAct or StateGraph node) to use MCP tools
and Skills as autonomous tool-calling targets.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Callable

from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)


# ─── MCP Tool → LangChain Tool conversion ────────────────────────────────────

def _build_tool_func(func: Callable, tool_name: str) -> Callable:
    """Wrap an MCP tool function so it returns JSON strings for LLM consumption."""
    def _wrapped(**kwargs) -> str:
        try:
            result = func(**kwargs)
            if isinstance(result, str):
                return result
            return json.dumps(result, ensure_ascii=False, default=str)
        except Exception as e:
            logger.error(f"MCP tool '{tool_name}' error: {e}")
            return json.dumps({"error": str(e)}, ensure_ascii=False)
    _wrapped.__name__ = tool_name
    _wrapped.__doc__ = func.__doc__ or tool_name
    return _wrapped


def mcp_tools_to_langchain(
    tool_definitions: List[Dict[str, Any]],
    implementations: Dict[str, Callable],
    include: Optional[List[str]] = None,
    exclude: Optional[List[str]] = None,
) -> List[StructuredTool]:
    """
    Convert MCP tool definitions + implementations into LangChain StructuredTools.

    Args:
        tool_definitions: List of MCP tool dicts with 'name', 'description', 'inputSchema'
        implementations: Dict mapping tool name → Python function
        include: If set, only convert these tool names
        exclude: If set, skip these tool names

    Returns:
        List of LangChain StructuredTool instances ready for create_react_agent()
    """
    tools = []
    for defn in tool_definitions:
        name = defn['name']

        if include and name not in include:
            continue
        if exclude and name in exclude:
            continue

        func = implementations.get(name)
        if func is None:
            logger.warning(f"MCP tool '{name}' has no implementation, skipping")
            continue

        wrapped = _build_tool_func(func, name)

        lc_tool = StructuredTool.from_function(
            func=wrapped,
            name=name,
            description=defn.get('description', name),
        )
        tools.append(lc_tool)

    return tools


# ─── TP MCP Tools → LangChain ─────────────────────────────────────────────────

def get_tp_langchain_tools(
    include: Optional[List[str]] = None,
    exclude: Optional[List[str]] = None,
) -> List[StructuredTool]:
    """Get TP MCP tools as LangChain StructuredTools."""
    from app.services.mcp_tools import (
        MCP_TOOL_DEFINITIONS,
        get_section_context,
        generate_tp_statement,
        suggest_aa_codes,
        generate_reference_solution,
        auto_correct_submission,
        propose_grade,
        parse_tp_questions,
        generate_question_starter,
        chat_with_student,
    )

    implementations = {
        'get_section_context': get_section_context,
        'generate_tp_statement': generate_tp_statement,
        'suggest_aa_codes': suggest_aa_codes,
        'generate_reference_solution': generate_reference_solution,
        'auto_correct_submission': auto_correct_submission,
        'propose_grade': propose_grade,
        'parse_tp_questions': parse_tp_questions,
        'generate_question_starter': generate_question_starter,
        'chat_with_student': chat_with_student,
    }

    return mcp_tools_to_langchain(MCP_TOOL_DEFINITIONS, implementations, include, exclude)


# ─── Exam MCP Tools → LangChain ──────────────────────────────────────────────

def get_exam_langchain_tools(
    include: Optional[List[str]] = None,
    exclude: Optional[List[str]] = None,
) -> List[StructuredTool]:
    """Get Exam MCP tools as LangChain StructuredTools."""
    from app.services.exam_mcp_tools import (
        EXAM_MCP_TOOL_DEFINITIONS,
        extract_exam_text,
        extract_exam_questions,
        classify_questions_aa,
        classify_questions_bloom,
        assess_question_difficulty,
        compare_module_vs_exam,
        generate_exam_feedback,
        suggest_exam_adjustments,
        generate_exam_latex,
        evaluate_exam_proposal,
    )

    implementations = {
        'extract_exam_text': extract_exam_text,
        'extract_exam_questions': extract_exam_questions,
        'classify_questions_aa': classify_questions_aa,
        'classify_questions_bloom': classify_questions_bloom,
        'assess_question_difficulty': assess_question_difficulty,
        'compare_module_vs_exam': compare_module_vs_exam,
        'generate_exam_feedback': generate_exam_feedback,
        'suggest_exam_adjustments': suggest_exam_adjustments,
        'generate_exam_latex': generate_exam_latex,
        'evaluate_exam_proposal': evaluate_exam_proposal,
    }

    return mcp_tools_to_langchain(EXAM_MCP_TOOL_DEFINITIONS, implementations, include, exclude)


# ─── Skill Tools → LangChain (delegate to SkillManager) ──────────────────────

def get_skill_langchain_tools(
    agent_id: str,
    role: str = 'teacher',
    user_id: int = 0,
    course_id: Optional[int] = None,
) -> List[StructuredTool]:
    """Get SkillManager skills as LangChain StructuredTools for an agent."""
    try:
        from app.services.skill_manager import SkillManager
        manager = SkillManager()
        return manager.as_langchain_tools(
            agent_id=agent_id,
            role=role,
            user_id=user_id,
            course_id=course_id,
        )
    except Exception as e:
        logger.warning(f"Skill tools loading failed: {e}")
        return []


# ─── Combined: MCP + Skills for an agent ──────────────────────────────────────

def get_agent_tools(
    agent_id: str,
    role: str = 'teacher',
    user_id: int = 0,
    course_id: Optional[int] = None,
    mcp_include: Optional[List[str]] = None,
    mcp_exclude: Optional[List[str]] = None,
) -> List[StructuredTool]:
    """
    Get all available tools (MCP + Skills) for an agent.

    Combines:
      - MCP tools (TP or Exam depending on agent_id)
      - SkillManager skills resolved for this agent/role

    Args:
        agent_id: 'assistant', 'coach', 'exam', 'tp'
        role: 'student', 'teacher', 'admin'
        user_id: Current user ID
        course_id: Optional course context
        mcp_include/mcp_exclude: Filter MCP tools

    Returns:
        Combined list of LangChain StructuredTools
    """
    tools: List[StructuredTool] = []

    # MCP tools based on agent type
    try:
        if agent_id == 'tp':
            tools.extend(get_tp_langchain_tools(include=mcp_include, exclude=mcp_exclude))
        elif agent_id == 'exam':
            tools.extend(get_exam_langchain_tools(include=mcp_include, exclude=mcp_exclude))
        elif agent_id == 'coach':
            # Coach can use a subset of TP tools for context
            pass
    except Exception as e:
        logger.warning(f"MCP tools loading for {agent_id}: {e}")

    # Skill tools
    skill_tools = get_skill_langchain_tools(
        agent_id=agent_id,
        role=role,
        user_id=user_id,
        course_id=course_id,
    )
    tools.extend(skill_tools)

    logger.debug(f"Agent '{agent_id}' loaded {len(tools)} tools ({len(tools) - len(skill_tools)} MCP + {len(skill_tools)} skills)")
    return tools
