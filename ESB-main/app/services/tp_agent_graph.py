"""
LangGraph Agent Graph — TP (Travaux Pratiques) AI Workflow
===========================================================

Architecture MCP + LangGraph :
  - Les outils MCP (mcp_tools.py) sont encapsulés en LangChain Tools
  - Un StateGraph LangGraph orchestre deux workflows :
      1. Workflow enseignant : génération énoncé → suggestion AA → solution référence
      2. Workflow correction : correction automatique → proposition note

State machine:

  TEACHER WORKFLOW:
    START → generate_statement → suggest_aa → generate_reference → END

  STUDENT WORKFLOW:
    START → auto_correct → propose_grade_node → END

Each node calls the corresponding MCP tool and stores results in the shared State.
"""

import logging
from typing import TypedDict, Optional, Literal, Any
from typing_extensions import Annotated

from langgraph.graph import StateGraph, END, START

logger = logging.getLogger(__name__)


# ─── State Definitions ────────────────────────────────────────────────────────

class TPCreationState(TypedDict):
    """Shared state for the TP creation workflow (teacher)."""
    # Inputs
    section_id: int
    language: str
    hint: Optional[str]
    suggestion_context: Optional[str]
    max_grade: float

    # Results — updated by nodes
    section_context: Optional[str]
    available_aa: Optional[list]
    title: Optional[str]
    statement: Optional[str]
    statement_source: str           # 'teacher' | 'ai'
    suggested_aa: Optional[list]
    questions: Optional[list]          # [{id, title, text, points}] — parsed by agent
    reference_solution: Optional[str]
    correction_criteria: Optional[str]

    # Errors
    errors: list


class TPCorrectionState(TypedDict):
    """Shared state for the submission correction workflow (student)."""
    # Inputs
    tp_id: int
    submission_id: int
    statement: str
    reference_solution: str
    correction_criteria: str
    student_code: str
    language: str
    max_grade: float

    # Results
    correction_report: Optional[str]
    proposed_grade: Optional[float]
    strengths: Optional[list]
    weaknesses: Optional[list]
    confidence: Optional[str]

    # Errors
    errors: list


# ─── Node implementations ─────────────────────────────────────────────────────

def _node_get_context(state: TPCreationState) -> dict:
    """Node: Fetch section documents & content for context."""
    from app.services.mcp_tools import get_section_context
    try:
        result = get_section_context(state['section_id'])
        return {
            "section_context": result.get("context", ""),
            "available_aa": result.get("aa_codes", []),
        }
    except Exception as e:
        logger.error(f"[TPGraph] get_context error: {e}")
        return {"section_context": "", "available_aa": [], "errors": state.get("errors", []) + [str(e)]}


def _node_generate_statement(state: TPCreationState) -> dict:
    """Node: Generate TP statement from context (if teacher chose AI generation)."""
    from app.services.mcp_tools import generate_tp_statement
    if state.get('statement_source') == 'teacher' and state.get('statement'):
        # Teacher provided their own statement — skip AI generation
        return {}
    try:
        # Merge suggestion_context (from AI detection) into hint for richer generation
        hint = state.get('hint', '') or ''
        suggestion_context = state.get('suggestion_context', '') or ''
        merged_hint = f"{suggestion_context}\n\n{hint}".strip() if suggestion_context else hint
        result = generate_tp_statement(
            context=state.get('section_context', ''),
            language=state['language'],
            hint=merged_hint,
        )
        return {
            "title": result.get("title", "TP"),
            "statement": result.get("statement", ""),
            "statement_source": "ai",
        }
    except Exception as e:
        logger.error(f"[TPGraph] generate_statement error: {e}")
        return {"errors": state.get("errors", []) + [str(e)]}


def _node_parse_questions(state: TPCreationState) -> dict:
    """Node: Parse statement into structured questions."""
    from app.services.mcp_tools import parse_tp_questions
    statement = state.get('statement', '')
    if not statement:
        return {'questions': []}
    try:
        result = parse_tp_questions(
            statement=statement,
            language=state['language'],
            max_grade=state.get('max_grade', 20.0),
        )
        return {'questions': result.get('questions', [])}
    except Exception as e:
        logger.error(f"[TPGraph] parse_questions error: {e}")
        return {'questions': [], 'errors': state.get('errors', []) + [str(e)]}


def _node_suggest_aa(state: TPCreationState) -> dict:
    """Node: Suggest AA codes based on section and statement."""
    from app.services.mcp_tools import suggest_aa_codes
    statement = state.get('statement', '')
    if not statement:
        return {}
    try:
        result = suggest_aa_codes(
            section_id=state['section_id'],
            statement=statement,
        )
        return {"suggested_aa": result.get("aa_codes", [])}
    except Exception as e:
        logger.error(f"[TPGraph] suggest_aa error: {e}")
        return {"suggested_aa": [], "errors": state.get("errors", []) + [str(e)]}


def _node_generate_reference(state: TPCreationState) -> dict:
    """Node: Generate reference solution + correction criteria, enriched with rubric-builder skill."""
    from app.services.mcp_tools import generate_reference_solution
    statement = state.get('statement', '')
    if not statement:
        return {}
    try:
        result = generate_reference_solution(
            statement=statement,
            language=state['language'],
            max_grade=state.get('max_grade', 20.0),
            questions=state.get('questions') or [],
        )

        output = {
            "reference_solution": result.get("reference_solution", ""),
            "correction_criteria": result.get("correction_criteria", ""),
        }

        # Enrich with rubric-builder skill for structured evaluation rubric
        try:
            from app.services.skill_manager import SkillManager, SkillContext
            manager = SkillManager()
            ctx = SkillContext(user_id=0, role='teacher', agent_id='tp',
                              course_id=state.get('section_id'))
            rubric = manager.execute('rubric-builder', ctx, {
                'type': 'tp',
                'content': statement,
                'max_score': state.get('max_grade', 20.0),
            })
            if rubric.success:
                output['skill_rubric'] = rubric.data
        except Exception as e:
            logger.debug(f"Skill rubric-builder enrichment skipped: {e}")

        return output
    except Exception as e:
        logger.error(f"[TPGraph] generate_reference error: {e}")
        return {"errors": state.get("errors", []) + [str(e)]}


def _node_auto_correct(state: TPCorrectionState) -> dict:
    """Node: Auto-correct student submission, enriched with code-reviewer skill."""
    from app.services.mcp_tools import auto_correct_submission
    try:
        result = auto_correct_submission(
            statement=state['statement'],
            reference_solution=state['reference_solution'],
            student_code=state['student_code'],
            language=state['language'],
            correction_criteria=state.get('correction_criteria', ''),
            max_grade=state.get('max_grade', 20.0),
        )

        output = {
            "correction_report": result.get("correction_report", ""),
            "proposed_grade":    result.get("proposed_grade", 0.0),
            "strengths":         result.get("strengths", []),
            "weaknesses":        result.get("weaknesses", []),
        }

        # Enrich with code-reviewer skill for pedagogical feedback
        try:
            from app.services.skill_manager import SkillManager, SkillContext
            manager = SkillManager()
            ctx = SkillContext(user_id=0, role='teacher', agent_id='tp')
            review = manager.execute('code-reviewer', ctx, {
                'student_code': state['student_code'],
                'language': state['language'],
                'reference_solution': state['reference_solution'],
            })
            if review.success:
                output['skill_code_review'] = review.data
        except Exception as e:
            logger.debug(f"Skill code-reviewer enrichment skipped: {e}")

        return output
    except Exception as e:
        logger.error(f"[TPGraph] auto_correct error: {e}")
        return {
            "correction_report": "Erreur lors de la correction automatique.",
            "proposed_grade": 0.0,
            "errors": state.get("errors", []) + [str(e)],
        }


def _node_propose_grade(state: TPCorrectionState) -> dict:
    """Node: Refine/confirm the proposed grade."""
    from app.services.mcp_tools import propose_grade
    report = state.get('correction_report', '')
    if not report:
        return {}
    try:
        result = propose_grade(
            correction_report=report,
            max_grade=state.get('max_grade', 20.0),
        )
        return {
            "proposed_grade": result.get("proposed_grade", state.get("proposed_grade", 0.0)),
            "confidence":     result.get("confidence", "low"),
        }
    except Exception as e:
        logger.error(f"[TPGraph] propose_grade error: {e}")
        return {"errors": state.get("errors", []) + [str(e)]}


# ─── Graph builders ───────────────────────────────────────────────────────────

def build_creation_graph() -> Any:
    """
    Build the LangGraph StateGraph for TP creation (teacher workflow).

    Nodes:
      get_context → generate_statement → parse_questions → suggest_aa → generate_reference → END
    """
    g = StateGraph(TPCreationState)

    g.add_node("get_context",          _node_get_context)
    g.add_node("generate_statement",   _node_generate_statement)
    g.add_node("parse_questions",      _node_parse_questions)
    g.add_node("suggest_aa",           _node_suggest_aa)
    g.add_node("generate_reference",   _node_generate_reference)

    g.add_edge(START,                  "get_context")
    g.add_edge("get_context",          "generate_statement")
    g.add_edge("generate_statement",   "parse_questions")
    g.add_edge("parse_questions",      "suggest_aa")
    g.add_edge("suggest_aa",           "generate_reference")
    g.add_edge("generate_reference",   END)

    return g.compile()


def build_correction_graph() -> Any:
    """
    Build the LangGraph StateGraph for submission correction (student workflow).

    Nodes:
      auto_correct → propose_grade → END
    """
    g = StateGraph(TPCorrectionState)

    g.add_node("auto_correct",   _node_auto_correct)
    g.add_node("propose_grade",  _node_propose_grade)

    g.add_edge(START,            "auto_correct")
    g.add_edge("auto_correct",   "propose_grade")
    g.add_edge("propose_grade",  END)

    return g.compile()


# ─── Public API ──────────────────────────────────────────────────────────────

# Compiled graphs (initialized once per app lifetime)
_creation_graph = None
_correction_graph = None


def get_creation_graph():
    global _creation_graph
    if _creation_graph is None:
        _creation_graph = build_creation_graph()
    return _creation_graph


def get_correction_graph():
    global _correction_graph
    if _correction_graph is None:
        _correction_graph = build_correction_graph()
    return _correction_graph


def run_tp_creation(
    section_id: int,
    language: str,
    hint: str = "",
    max_grade: float = 20.0,
    teacher_statement: str = "",
    suggestion_context: str = "",
) -> TPCreationState:
    """
    Run the full TP creation workflow.
    If teacher_statement is provided, skips AI generation and uses it directly.
    Always generates reference solution and suggests AA codes.
    """
    initial_state: TPCreationState = {
        "section_id":         section_id,
        "language":           language,
        "hint":               hint,
        "suggestion_context": suggestion_context or None,
        "max_grade":          max_grade,
        "section_context":    None,
        "available_aa":       None,
        "title":              None,
        "statement":          teacher_statement or None,
        "statement_source":   "teacher" if teacher_statement else "ai",
        "suggested_aa":       None,
        "questions":          None,
        "reference_solution": None,
        "correction_criteria": None,
        "errors":             [],
    }
    graph = get_creation_graph()
    result = graph.invoke(initial_state)
    return result


def run_tp_correction(
    tp_id: int,
    submission_id: int,
    statement: str,
    reference_solution: str,
    student_code: str,
    language: str,
    correction_criteria: str = "",
    max_grade: float = 20.0,
) -> TPCorrectionState:
    """
    Run the TP correction workflow for a student submission.
    Returns correction report + proposed grade.
    """
    initial_state: TPCorrectionState = {
        "tp_id":              tp_id,
        "submission_id":      submission_id,
        "statement":          statement,
        "reference_solution": reference_solution,
        "correction_criteria": correction_criteria,
        "student_code":       student_code,
        "language":           language,
        "max_grade":          max_grade,
        "correction_report":  None,
        "proposed_grade":     None,
        "strengths":          None,
        "weaknesses":         None,
        "confidence":         None,
        "errors":             [],
    }
    graph = get_correction_graph()
    result = graph.invoke(initial_state)
    return result
