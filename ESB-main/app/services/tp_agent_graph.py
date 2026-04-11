"""
LangGraph Agent Graph — TP (Travaux Pratiques) AI Workflow
===========================================================

Agentic Architecture (ReAct sub-agents + MCP + Skills):
  Each key node is powered by a ReAct tool-calling sub-agent that autonomously
  orchestrates MCP tools and SkillManager skills.  If the ReAct agent fails,
  the node falls back to a deterministic direct MCP call, guaranteeing reliability.

  Only ``get_context`` remains a pure deterministic node (no LLM reasoning needed).

State machine (unchanged):

  TEACHER WORKFLOW:
    START → get_context → generate_statement → parse_questions
         → suggest_aa → generate_reference → END

  STUDENT WORKFLOW:
    START → auto_correct → propose_grade → END

Agentic nodes and their tool sets:
  generate_statement  → generate_tp_statement MCP  + quiz-generator skill
  parse_questions     → parse_tp_questions MCP     + bloom-classifier skill
  suggest_aa          → suggest_aa_codes MCP       + syllabus-mapper skill
  generate_reference  → generate_reference_solution MCP + rubric-builder skill
  auto_correct        → auto_correct_submission MCP + code-reviewer skill
  propose_grade       → propose_grade MCP          + feedback-writer skill
"""

import json
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


# ─── ReAct helpers ────────────────────────────────────────────────────────────

def _get_react_llm():
    """Get LLM configured for ReAct tool-calling sub-agents."""
    from flask import current_app
    from langchain_google_genai import ChatGoogleGenerativeAI
    api_key = current_app.config.get('GOOGLE_API_KEY')
    model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    return ChatGoogleGenerativeAI(model=model, google_api_key=api_key, temperature=0.1)


def _extract_data_from_agent(result, key=None):
    """Extract structured data from ReAct agent messages, looking for tool results."""
    from langchain_core.messages import AIMessage, ToolMessage
    messages = result.get("messages", [])

    # First check ToolMessages for raw tool output
    for m in reversed(messages):
        if isinstance(m, ToolMessage) and m.content:
            try:
                data = json.loads(m.content) if isinstance(m.content, str) else m.content
                if isinstance(data, dict):
                    if key and key in data:
                        return data[key]
                    return data
                if isinstance(data, list):
                    return data
            except (json.JSONDecodeError, TypeError):
                continue

    # Fallback: check final AI message for JSON
    for m in reversed(messages):
        if isinstance(m, AIMessage) and m.content:
            try:
                raw = m.content
                if isinstance(raw, list):
                    text = " ".join(
                        p.get("text", "") if isinstance(p, dict) else str(p)
                        for p in raw
                    ).strip()
                else:
                    text = raw.strip()
                if text.startswith('```'):
                    text = text.split('\n', 1)[1] if '\n' in text else text[3:]
                if text.endswith('```'):
                    text = text[:-3]
                if text.startswith('json'):
                    text = text[4:]
                return json.loads(text.strip())
            except (json.JSONDecodeError, TypeError):
                continue
    return None


def _load_react_tools(mcp_names, skill_filter, role='teacher'):
    """Load MCP + skill LangChain tools for a ReAct sub-agent.

    Args:
        mcp_names: list of MCP tool names to include.
        skill_filter: substring to match in skill tool names (e.g. 'bloom').
        role: 'teacher' or 'student'.

    Returns:
        list of LangChain StructuredTool instances (may be empty).
    """
    from app.services.mcp_langchain_bridge import get_tp_langchain_tools, get_skill_langchain_tools

    mcp_tools = get_tp_langchain_tools(include=mcp_names)
    skill_tools = get_skill_langchain_tools(agent_id='tp', role=role)
    relevant_skills = [t for t in skill_tools if skill_filter in t.name]
    return mcp_tools + relevant_skills


def _run_react_agent(tools, system_prompt, user_message):
    """Create and invoke a ReAct sub-agent, returning the raw result dict.

    Raises RuntimeError if no tools are available.
    """
    if not tools:
        raise RuntimeError("No tools available for ReAct agent")

    from langgraph.prebuilt import create_react_agent
    from langchain_core.messages import HumanMessage

    llm = _get_react_llm()
    agent = create_react_agent(llm, tools, prompt=system_prompt)
    return agent.invoke({"messages": [HumanMessage(content=user_message)]})


# ─── Node implementations ─────────────────────────────────────────────────────

def _node_get_context(state: TPCreationState) -> dict:
    """Deterministic node: Fetch section documents & content for context."""
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


# ─── Agentic creation nodes ──────────────────────────────────────────────────

def _node_generate_statement(state: TPCreationState) -> dict:
    """ReAct agent node: Generate TP statement with quiz-generator enrichment."""
    if state.get('statement_source') == 'teacher' and state.get('statement'):
        return {}

    hint = state.get('hint', '') or ''
    suggestion_context = state.get('suggestion_context', '') or ''
    merged_hint = f"{suggestion_context}\n\n{hint}".strip() if suggestion_context else hint
    context = state.get('section_context', '')

    try:
        tools = _load_react_tools(['generate_tp_statement'], 'quiz')
        system_prompt = (
            "Tu es un expert en pédagogie et en création de travaux pratiques. "
            "Génère un énoncé de TP structuré à partir du contexte fourni, puis "
            "génère quelques questions pratiques complémentaires avec l'outil quiz-generator. "
            "Utilise les outils disponibles."
        )
        user_msg = (
            f"Génère un énoncé de TP.\n"
            f"Contexte pédagogique:\n{context[:2000]}\n"
            f"Langage: {state['language']}\n"
            f"Indications: {merged_hint or 'aucune'}"
        )

        result = _run_react_agent(tools, system_prompt, user_msg)
        data = _extract_data_from_agent(result)
        if data and isinstance(data, dict):
            output = {
                "title": data.get("title", "TP"),
                "statement": data.get("statement", ""),
                "statement_source": "ai",
            }
            # Capture any quiz-generator enrichment from agent output
            if data.get("practice_questions") or data.get("skill_practice_questions"):
                output["skill_practice_questions"] = (
                    data.get("skill_practice_questions") or data.get("practice_questions")
                )
            if output["statement"]:
                return output

        raise RuntimeError("Insufficient data from ReAct agent")

    except Exception as e:
        logger.info(f"ReAct generate_statement fallback: {e}")
        # FALLBACK: Original direct MCP call
        try:
            from app.services.mcp_tools import generate_tp_statement
            result = generate_tp_statement(
                context=context,
                language=state['language'],
                hint=merged_hint,
            )
            return {
                "title": result.get("title", "TP"),
                "statement": result.get("statement", ""),
                "statement_source": "ai",
            }
        except Exception as e2:
            logger.error(f"[TPGraph] generate_statement error: {e2}")
            return {"errors": state.get("errors", []) + [str(e2)]}


def _node_parse_questions(state: TPCreationState) -> dict:
    """ReAct agent node: Parse statement into structured questions with Bloom classification."""
    statement = state.get('statement', '')
    if not statement:
        return {'questions': []}

    try:
        tools = _load_react_tools(['parse_tp_questions'], 'bloom')
        system_prompt = (
            "Tu es un expert en pédagogie. Parse l'énoncé de TP en questions structurées "
            "et classifie chaque question par niveau de Bloom. Utilise les outils disponibles."
        )
        user_msg = (
            f"Parse cet énoncé en questions et classifie-les:\n{statement[:2000]}\n"
            f"Langage: {state['language']}\n"
            f"Note maximale: {state.get('max_grade', 20.0)}"
        )

        result = _run_react_agent(tools, system_prompt, user_msg)
        questions = _extract_data_from_agent(result, key='questions')
        if questions and isinstance(questions, list):
            return {'questions': questions}

        raise RuntimeError("No questions extracted from ReAct agent")

    except Exception as e:
        logger.info(f"ReAct parse_questions fallback: {e}")
        # FALLBACK: Original direct MCP call
        try:
            from app.services.mcp_tools import parse_tp_questions
            result = parse_tp_questions(
                statement=statement,
                language=state['language'],
                max_grade=state.get('max_grade', 20.0),
            )
            return {'questions': result.get('questions', [])}
        except Exception as e2:
            logger.error(f"[TPGraph] parse_questions error: {e2}")
            return {'questions': [], 'errors': state.get('errors', []) + [str(e2)]}


def _node_suggest_aa(state: TPCreationState) -> dict:
    """ReAct agent node: Suggest AA codes with syllabus-mapper cross-validation."""
    statement = state.get('statement', '')
    if not statement:
        return {}

    try:
        tools = _load_react_tools(['suggest_aa_codes'], 'syllabus')
        system_prompt = (
            "Tu es un expert en ingénierie pédagogique. Suggère les codes AA (acquis "
            "d'apprentissage) pertinents pour cet énoncé de TP, puis valide-les avec "
            "le syllabus-mapper. Utilise les outils disponibles."
        )
        user_msg = (
            f"Suggère les codes AA pour ce TP:\n{statement[:2000]}\n"
            f"Section ID: {state['section_id']}"
        )

        result = _run_react_agent(tools, system_prompt, user_msg)
        data = _extract_data_from_agent(result)
        if data and isinstance(data, dict):
            output = {"suggested_aa": data.get("aa_codes", [])}
            if data.get("mappings"):
                output["skill_aa_mappings"] = data["mappings"]
            if output["suggested_aa"]:
                return output

        raise RuntimeError("No AA codes from ReAct agent")

    except Exception as e:
        logger.info(f"ReAct suggest_aa fallback: {e}")
        # FALLBACK: Original direct MCP call
        try:
            from app.services.mcp_tools import suggest_aa_codes
            result = suggest_aa_codes(
                section_id=state['section_id'],
                statement=statement,
            )
            return {"suggested_aa": result.get("aa_codes", [])}
        except Exception as e2:
            logger.error(f"[TPGraph] suggest_aa error: {e2}")
            return {"suggested_aa": [], "errors": state.get("errors", []) + [str(e2)]}


def _node_generate_reference(state: TPCreationState) -> dict:
    """ReAct agent node: Generate reference solution + criteria with rubric-builder."""
    statement = state.get('statement', '')
    if not statement:
        return {}

    try:
        tools = _load_react_tools(['generate_reference_solution'], 'rubric')
        system_prompt = (
            "Tu es un expert en programmation et en évaluation pédagogique. "
            "Génère une solution de référence et des critères de correction pour ce TP, "
            "puis construis une grille d'évaluation structurée avec le rubric-builder. "
            "Utilise les outils disponibles."
        )
        questions_summary = json.dumps(state.get('questions') or [], ensure_ascii=False, default=str)
        user_msg = (
            f"Génère la solution de référence pour ce TP:\n{statement[:2000]}\n"
            f"Langage: {state['language']}\n"
            f"Note maximale: {state.get('max_grade', 20.0)}\n"
            f"Questions: {questions_summary[:1000]}"
        )

        result = _run_react_agent(tools, system_prompt, user_msg)
        data = _extract_data_from_agent(result)
        if data and isinstance(data, dict):
            output = {
                "reference_solution": data.get("reference_solution", ""),
                "correction_criteria": data.get("correction_criteria", ""),
            }
            if data.get("rubric") or data.get("skill_rubric"):
                output["skill_rubric"] = data.get("skill_rubric") or data.get("rubric")
            if output["reference_solution"]:
                return output

        raise RuntimeError("Insufficient data from ReAct agent")

    except Exception as e:
        logger.info(f"ReAct generate_reference fallback: {e}")
        # FALLBACK: Original direct MCP call
        try:
            from app.services.mcp_tools import generate_reference_solution
            result = generate_reference_solution(
                statement=statement,
                language=state['language'],
                max_grade=state.get('max_grade', 20.0),
                questions=state.get('questions') or [],
            )
            return {
                "reference_solution": result.get("reference_solution", ""),
                "correction_criteria": result.get("correction_criteria", ""),
            }
        except Exception as e2:
            logger.error(f"[TPGraph] generate_reference error: {e2}")
            return {"errors": state.get("errors", []) + [str(e2)]}


# ─── Agentic correction nodes ────────────────────────────────────────────────

def _node_auto_correct(state: TPCorrectionState) -> dict:
    """ReAct agent node: Auto-correct submission with code-reviewer enrichment."""
    try:
        tools = _load_react_tools(['auto_correct_submission'], 'code_review', role='teacher')
        system_prompt = (
            "Tu es un correcteur expert en programmation. Corrige la soumission de "
            "l'étudiant en comparant avec la solution de référence, puis fais une "
            "revue de code pédagogique avec le code-reviewer. Utilise les outils disponibles."
        )
        user_msg = (
            f"Corrige cette soumission:\n"
            f"Énoncé: {state['statement'][:1000]}\n"
            f"Solution de référence: {state['reference_solution'][:1000]}\n"
            f"Code étudiant: {state['student_code'][:1500]}\n"
            f"Langage: {state['language']}\n"
            f"Critères: {state.get('correction_criteria', '')[:500]}\n"
            f"Note max: {state.get('max_grade', 20.0)}"
        )

        result = _run_react_agent(tools, system_prompt, user_msg)
        data = _extract_data_from_agent(result)
        if data and isinstance(data, dict):
            output = {
                "correction_report": data.get("correction_report", ""),
                "proposed_grade": data.get("proposed_grade", 0.0),
                "strengths": data.get("strengths", []),
                "weaknesses": data.get("weaknesses", []),
            }
            if data.get("code_review") or data.get("skill_code_review"):
                output["skill_code_review"] = (
                    data.get("skill_code_review") or data.get("code_review")
                )
            if output["correction_report"]:
                return output

        raise RuntimeError("Insufficient data from ReAct agent")

    except Exception as e:
        logger.info(f"ReAct auto_correct fallback: {e}")
        # FALLBACK: Original direct MCP call
        try:
            from app.services.mcp_tools import auto_correct_submission
            result = auto_correct_submission(
                statement=state['statement'],
                reference_solution=state['reference_solution'],
                student_code=state['student_code'],
                language=state['language'],
                correction_criteria=state.get('correction_criteria', ''),
                max_grade=state.get('max_grade', 20.0),
            )
            return {
                "correction_report": result.get("correction_report", ""),
                "proposed_grade": result.get("proposed_grade", 0.0),
                "strengths": result.get("strengths", []),
                "weaknesses": result.get("weaknesses", []),
            }
        except Exception as e2:
            logger.error(f"[TPGraph] auto_correct error: {e2}")
            return {
                "correction_report": "Erreur lors de la correction automatique.",
                "proposed_grade": 0.0,
                "errors": state.get("errors", []) + [str(e2)],
            }


def _node_propose_grade(state: TPCorrectionState) -> dict:
    """ReAct agent node: Propose grade with feedback-writer enrichment."""
    report = state.get('correction_report', '')
    if not report:
        return {}

    try:
        tools = _load_react_tools(['propose_grade'], 'feedback', role='teacher')
        system_prompt = (
            "Tu es un évaluateur pédagogique expert. Propose une note finale basée "
            "sur le rapport de correction, puis rédige un feedback constructif pour "
            "l'étudiant avec le feedback-writer. Utilise les outils disponibles."
        )
        user_msg = (
            f"Propose une note pour cette correction:\n"
            f"Rapport: {report[:2000]}\n"
            f"Note max: {state.get('max_grade', 20.0)}\n"
            f"Points forts: {json.dumps(state.get('strengths', []), ensure_ascii=False)}\n"
            f"Points faibles: {json.dumps(state.get('weaknesses', []), ensure_ascii=False)}\n"
            f"Langage: {state.get('language', 'python')}"
        )

        result = _run_react_agent(tools, system_prompt, user_msg)
        data = _extract_data_from_agent(result)
        if data and isinstance(data, dict):
            output = {
                "proposed_grade": data.get("proposed_grade", state.get("proposed_grade", 0.0)),
                "confidence": data.get("confidence", "low"),
            }
            if data.get("feedback") or data.get("skill_feedback"):
                output["skill_feedback"] = (
                    data.get("skill_feedback") or data.get("feedback")
                )
            return output

        raise RuntimeError("Insufficient data from ReAct agent")

    except Exception as e:
        logger.info(f"ReAct propose_grade fallback: {e}")
        # FALLBACK: Original direct MCP call
        try:
            from app.services.mcp_tools import propose_grade
            result = propose_grade(
                correction_report=report,
                max_grade=state.get('max_grade', 20.0),
            )
            return {
                "proposed_grade": result.get("proposed_grade", state.get("proposed_grade", 0.0)),
                "confidence": result.get("confidence", "low"),
            }
        except Exception as e2:
            logger.error(f"[TPGraph] propose_grade error: {e2}")
            return {"errors": state.get("errors", []) + [str(e2)]}


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
