"""
exam_agent_graph.py — LangGraph multi-agent graph for exam evaluation.

Pipeline:
  extract_text → extract_questions → classify_aa → classify_bloom
  → assess_difficulty → compare_content → analyze_feedback
  → suggest_adjustments → generate_corrections → generate_latex
  → evaluate_proposal → END

Architecture:
  - 5 **agentic nodes** (classify_aa, classify_bloom, analyze_feedback,
    suggest_adjustments, generate_corrections) use ReAct sub-agents via
    ``create_react_agent``.  Each receives both MCP tools and AI skills
    as LangChain tools so the LLM can autonomously decide which
    tools/skills to invoke.  A fallback to the original direct-call
    logic is triggered when tool-calling fails.
  - 6 **deterministic nodes** (extract_text, extract_questions,
    assess_difficulty, compare_content, generate_latex, evaluate_proposal)
    call MCP tool functions directly — they don't need autonomy.

Each node updates the shared ExamEvaluationState and persists progress
to ExamAnalysisSession in the DB.
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import StateGraph, START, END

from app import db
from app.models import ExamAnalysisSession, ExamExtractedQuestion

logger = logging.getLogger(__name__)


# ── State ─────────────────────────────────────────────────────────────────────

class ExamEvaluationState(TypedDict):
    session_id: int
    course_id: int
    document_id: Optional[int]
    file_path: str
    exam_title: str
    course_name: str

    # Agent outputs (built up progressively)
    exam_text: Optional[str]
    questions: Optional[List[Dict[str, Any]]]
    aa_list: Optional[List[Dict[str, Any]]]
    course_context: Optional[str]
    comparison_report: Optional[Dict[str, Any]]
    feedback: Optional[str]
    adjustments: Optional[List[Dict[str, Any]]]
    latex_source: Optional[str]
    latex_pdf_path: Optional[str]
    proposal_evaluation: Optional[Dict[str, Any]]

    # Correction outputs
    corrections: Optional[List[Dict[str, Any]]]

    # Orchestration
    errors: List[str]
    current_node: str


# ── Progress tracker ──────────────────────────────────────────────────────────

AGENT_STEPS = [
    "extract_text", "extract_questions", "classify_aa", "classify_bloom",
    "assess_difficulty", "compare_content", "analyze_feedback",
    "suggest_adjustments", "generate_corrections", "generate_latex", "evaluate_proposal",
]

AGENT_LABELS = {
    "extract_text":          "Extraction du texte de l'examen",
    "extract_questions":     "Extraction et structuration des questions",
    "classify_aa":           "Classification par Apprentissages Attendus",
    "classify_bloom":        "Classification Taxonomie de Bloom",
    "assess_difficulty":     "Évaluation de la difficulté",
    "compare_content":       "Comparaison Module ↔ Examen",
    "analyze_feedback":      "Génération du feedback pédagogique",
    "suggest_adjustments":   "Proposition d'ajustements",
    "generate_corrections":  "Génération des corrections modèles",
    "generate_latex":        "Génération LaTeX et compilation PDF",
    "evaluate_proposal":     "Évaluation de la nouvelle proposition",
}


def _persist_progress(session_id: int, node_name: str, state: ExamEvaluationState) -> None:
    """Persist current agent progress to DB (call within app context)."""
    try:
        step_idx = AGENT_STEPS.index(node_name) if node_name in AGENT_STEPS else 0
        progress = int((step_idx / len(AGENT_STEPS)) * 100)
        session = ExamAnalysisSession.query.get(session_id)
        if session:
            session.current_agent = AGENT_LABELS.get(node_name, node_name)
            session.progress = progress
            session.status = 'running'
            partial_state = {
                k: v for k, v in state.items()
                if k not in ('exam_text', 'course_context', 'latex_source')
            }
            session.state_json = json.dumps(partial_state, ensure_ascii=False, default=str)
            db.session.commit()
    except Exception:
        db.session.rollback()


# ── ReAct helpers ─────────────────────────────────────────────────────────────

def _get_react_llm():
    """Get LLM configured for tool-calling in ReAct agents."""
    from flask import current_app
    from langchain_google_genai import ChatGoogleGenerativeAI
    api_key = current_app.config.get('GOOGLE_API_KEY')
    model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    return ChatGoogleGenerativeAI(model=model, google_api_key=api_key, temperature=0.1)


def _extract_tool_results(messages) -> list:
    """Extract tool call results from agent message history."""
    results = []
    for m in messages:
        if hasattr(m, 'content') and m.content:
            try:
                data = json.loads(m.content) if isinstance(m.content, str) else m.content
                if isinstance(data, (list, dict)):
                    results.append(data)
            except (json.JSONDecodeError, TypeError):
                pass
    return results


# ── Node Implementations ──────────────────────────────────────────────────────

def _node_extract_text(state: ExamEvaluationState) -> ExamEvaluationState:
    from app.services.exam_mcp_tools import extract_exam_text
    _persist_progress(state['session_id'], 'extract_text', state)
    try:
        text = extract_exam_text(state['file_path'])
        return {**state, 'exam_text': text, 'current_node': 'extract_text'}
    except Exception as e:
        return {**state, 'errors': state.get('errors', []) + [f"extract_text: {e}"], 'current_node': 'extract_text'}


def _node_extract_questions(state: ExamEvaluationState) -> ExamEvaluationState:
    from app.services.exam_mcp_tools import extract_exam_questions, _get_course_context
    from app.services.tn_exam_evaluation_service import _course_learning_targets
    _persist_progress(state['session_id'], 'extract_questions', state)
    try:
        questions = extract_exam_questions(state.get('exam_text') or '', 'fr')
        context = _get_course_context(state['course_id'])
        aa_list = _course_learning_targets(state['course_id'])
        return {
            **state,
            'questions': questions,
            'course_context': context,
            'aa_list': aa_list,
            'current_node': 'extract_questions',
        }
    except Exception as e:
        return {**state, 'errors': state.get('errors', []) + [f"extract_questions: {e}"], 'current_node': 'extract_questions'}


def _node_classify_aa(state: ExamEvaluationState) -> ExamEvaluationState:
    _persist_progress(state['session_id'], 'classify_aa', state)
    try:
        from app.services.mcp_langchain_bridge import get_exam_langchain_tools, get_skill_langchain_tools

        mcp_tools = get_exam_langchain_tools(include=['classify_questions_aa'])
        skill_tools = get_skill_langchain_tools(agent_id='exam', role='teacher', course_id=state['course_id'])
        relevant_skills = [t for t in skill_tools if 'syllabus' in t.name or 'mapper' in t.name]

        all_tools = mcp_tools + relevant_skills

        if all_tools:
            from langgraph.prebuilt import create_react_agent
            from langchain_core.messages import HumanMessage, AIMessage

            llm = _get_react_llm()

            system_prompt = (
                "Tu es un expert en classification pédagogique. "
                "Utilise les outils disponibles pour classifier les questions d'examen "
                "par Apprentissages Attendus (AA). Tu as accès aux outils MCP et aux skills AI."
            )

            questions_json = json.dumps(state.get('questions', []), ensure_ascii=False)
            aa_json = json.dumps(state.get('aa_list', []), ensure_ascii=False)

            agent = create_react_agent(llm, all_tools, prompt=system_prompt)
            result = agent.invoke({
                "messages": [HumanMessage(content=f"Classifie ces questions par AA:\nQuestions: {questions_json}\nAA disponibles: {aa_json}")]
            })

            ai_msgs = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
            tool_results = _extract_tool_results(result.get("messages", []))
            classified = None
            for r in tool_results:
                if isinstance(r, list) and r:
                    classified = r
                    break
            if classified is None:
                classified = state.get('questions', [])
            return {**state, 'questions': classified, 'current_node': 'classify_aa'}

        raise RuntimeError("No tools available, using fallback")

    except Exception as e:
        logger.info(f"ReAct classify_aa fallback to direct call: {e}")
        try:
            from app.services.exam_mcp_tools import classify_questions_aa
            questions = classify_questions_aa(state.get('questions') or [], state.get('aa_list') or [])
            return {**state, 'questions': questions, 'current_node': 'classify_aa'}
        except Exception as e2:
            return {**state, 'errors': state.get('errors', []) + [f"classify_aa: {e2}"], 'current_node': 'classify_aa'}


def _node_classify_bloom(state: ExamEvaluationState) -> ExamEvaluationState:
    _persist_progress(state['session_id'], 'classify_bloom', state)
    try:
        from app.services.mcp_langchain_bridge import get_exam_langchain_tools, get_skill_langchain_tools

        mcp_tools = get_exam_langchain_tools(include=['classify_questions_bloom'])
        skill_tools = get_skill_langchain_tools(agent_id='exam', role='teacher', course_id=state['course_id'])
        relevant_skills = [t for t in skill_tools if 'bloom' in t.name or 'classifier' in t.name]

        all_tools = mcp_tools + relevant_skills

        if all_tools:
            from langgraph.prebuilt import create_react_agent
            from langchain_core.messages import HumanMessage, AIMessage

            llm = _get_react_llm()

            system_prompt = (
                "Tu es un expert en taxonomie de Bloom. "
                "Utilise les outils disponibles pour classifier les questions d'examen "
                "selon les niveaux de la taxonomie de Bloom. Tu as accès aux outils MCP et aux skills AI."
            )

            questions_json = json.dumps(state.get('questions', []), ensure_ascii=False)

            agent = create_react_agent(llm, all_tools, prompt=system_prompt)
            result = agent.invoke({
                "messages": [HumanMessage(content=f"Classifie ces questions selon la taxonomie de Bloom:\nQuestions: {questions_json}")]
            })

            ai_msgs = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
            tool_results = _extract_tool_results(result.get("messages", []))
            classified = None
            for r in tool_results:
                if isinstance(r, list) and r:
                    classified = r
                    break
            if classified is None:
                classified = state.get('questions', [])
            return {**state, 'questions': classified, 'current_node': 'classify_bloom'}

        raise RuntimeError("No tools available, using fallback")

    except Exception as e:
        logger.info(f"ReAct classify_bloom fallback to direct call: {e}")
        try:
            from app.services.exam_mcp_tools import classify_questions_bloom
            questions = classify_questions_bloom(state.get('questions') or [])
            return {**state, 'questions': questions, 'current_node': 'classify_bloom'}
        except Exception as e2:
            return {**state, 'errors': state.get('errors', []) + [f"classify_bloom: {e2}"], 'current_node': 'classify_bloom'}


def _node_assess_difficulty(state: ExamEvaluationState) -> ExamEvaluationState:
    from app.services.exam_mcp_tools import assess_question_difficulty
    _persist_progress(state['session_id'], 'assess_difficulty', state)
    try:
        questions = assess_question_difficulty(state.get('questions') or [], state.get('course_context') or '')
        # Persist extracted questions to DB
        ExamExtractedQuestion.query.filter_by(session_id=state['session_id']).delete()
        for q in questions:
            db.session.add(ExamExtractedQuestion(
                session_id=state['session_id'],
                number=q['number'],
                text=q['text'],
                points=q.get('points'),
                aa_codes=q.get('aa_codes'),
                bloom_level=q.get('bloom_level'),
                difficulty=q.get('difficulty'),
                difficulty_justification=q.get('difficulty_justification'),
            ))
        db.session.commit()
        return {**state, 'questions': questions, 'current_node': 'assess_difficulty'}
    except Exception as e:
        db.session.rollback()
        return {**state, 'errors': state.get('errors', []) + [f"assess_difficulty: {e}"], 'current_node': 'assess_difficulty'}


def _node_compare_content(state: ExamEvaluationState) -> ExamEvaluationState:
    from app.services.exam_mcp_tools import compare_module_vs_exam
    _persist_progress(state['session_id'], 'compare_content', state)
    try:
        report = compare_module_vs_exam(
            state.get('questions') or [],
            state.get('aa_list') or [],
            state.get('course_context') or '',
        )
        return {**state, 'comparison_report': report, 'current_node': 'compare_content'}
    except Exception as e:
        return {**state, 'errors': state.get('errors', []) + [f"compare_content: {e}"], 'current_node': 'compare_content'}


def _node_analyze_feedback(state: ExamEvaluationState) -> ExamEvaluationState:
    _persist_progress(state['session_id'], 'analyze_feedback', state)
    try:
        from app.services.mcp_langchain_bridge import get_exam_langchain_tools, get_skill_langchain_tools

        mcp_tools = get_exam_langchain_tools(include=['generate_exam_feedback'])
        skill_tools = get_skill_langchain_tools(agent_id='exam', role='teacher', course_id=state['course_id'])
        relevant_skills = [t for t in skill_tools if 'feedback' in t.name or 'writer' in t.name]

        all_tools = mcp_tools + relevant_skills

        if all_tools:
            from langgraph.prebuilt import create_react_agent
            from langchain_core.messages import HumanMessage, AIMessage

            llm = _get_react_llm()

            system_prompt = (
                "Tu es un expert en évaluation pédagogique. "
                "Utilise les outils disponibles pour générer un feedback détaillé "
                "sur l'examen. Tu as accès aux outils MCP et aux skills AI."
            )

            report_json = json.dumps(state.get('comparison_report', {}), ensure_ascii=False)
            questions_json = json.dumps(state.get('questions', []), ensure_ascii=False)

            agent = create_react_agent(llm, all_tools, prompt=system_prompt)
            result = agent.invoke({
                "messages": [HumanMessage(content=(
                    f"Génère un feedback pédagogique pour cet examen:\n"
                    f"Rapport de comparaison: {report_json}\n"
                    f"Questions: {questions_json}"
                ))]
            })

            ai_msgs = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
            tool_results = _extract_tool_results(result.get("messages", []))
            feedback = None
            for r in tool_results:
                if isinstance(r, (dict, str)):
                    feedback = r
                    break
            if feedback is None and ai_msgs:
                raw = ai_msgs[-1].content
                if isinstance(raw, list):
                    feedback = " ".join(
                        p.get("text", "") if isinstance(p, dict) else str(p)
                        for p in raw
                    ).strip()
                else:
                    feedback = raw
            if feedback is None:
                feedback = ''
            return {**state, 'feedback': feedback, 'current_node': 'analyze_feedback'}

        raise RuntimeError("No tools available, using fallback")

    except Exception as e:
        logger.info(f"ReAct analyze_feedback fallback to direct call: {e}")
        try:
            from app.services.exam_mcp_tools import generate_exam_feedback
            feedback = generate_exam_feedback(
                state.get('comparison_report') or {},
                state.get('questions') or [],
            )
            return {**state, 'feedback': feedback, 'current_node': 'analyze_feedback'}
        except Exception as e2:
            return {**state, 'errors': state.get('errors', []) + [f"analyze_feedback: {e2}"], 'current_node': 'analyze_feedback'}


def _node_suggest_adjustments(state: ExamEvaluationState) -> ExamEvaluationState:
    _persist_progress(state['session_id'], 'suggest_adjustments', state)
    try:
        from app.services.mcp_langchain_bridge import get_exam_langchain_tools, get_skill_langchain_tools

        mcp_tools = get_exam_langchain_tools(include=['suggest_exam_adjustments'])
        skill_tools = get_skill_langchain_tools(agent_id='exam', role='teacher', course_id=state['course_id'])
        relevant_skills = [t for t in skill_tools if 'rubric' in t.name or 'builder' in t.name]

        all_tools = mcp_tools + relevant_skills

        if all_tools:
            from langgraph.prebuilt import create_react_agent
            from langchain_core.messages import HumanMessage, AIMessage

            llm = _get_react_llm()

            system_prompt = (
                "Tu es un expert en conception d'examens. "
                "Utilise les outils disponibles pour proposer des ajustements "
                "à l'examen. Tu as accès aux outils MCP et aux skills AI."
            )

            feedback_json = json.dumps(state.get('feedback', ''), ensure_ascii=False)
            questions_json = json.dumps(state.get('questions', []), ensure_ascii=False)
            aa_json = json.dumps(state.get('aa_list', []), ensure_ascii=False)

            agent = create_react_agent(llm, all_tools, prompt=system_prompt)
            result = agent.invoke({
                "messages": [HumanMessage(content=(
                    f"Propose des ajustements pour cet examen:\n"
                    f"Feedback: {feedback_json}\n"
                    f"Questions: {questions_json}\n"
                    f"AA disponibles: {aa_json}"
                ))]
            })

            ai_msgs = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
            tool_results = _extract_tool_results(result.get("messages", []))
            adjustments = None
            for r in tool_results:
                if isinstance(r, (list, dict)):
                    adjustments = r
                    break
            if adjustments is None:
                adjustments = []
            return {**state, 'adjustments': adjustments, 'current_node': 'suggest_adjustments'}

        raise RuntimeError("No tools available, using fallback")

    except Exception as e:
        logger.info(f"ReAct suggest_adjustments fallback to direct call: {e}")
        try:
            from app.services.exam_mcp_tools import suggest_exam_adjustments
            adjustments = suggest_exam_adjustments(
                state.get('feedback') or '',
                state.get('questions') or [],
                state.get('aa_list') or [],
            )
            return {**state, 'adjustments': adjustments, 'current_node': 'suggest_adjustments'}
        except Exception as e2:
            return {**state, 'errors': state.get('errors', []) + [f"suggest_adjustments: {e2}"], 'current_node': 'suggest_adjustments'}


def _node_generate_latex(state: ExamEvaluationState) -> ExamEvaluationState:
    from app.services.exam_mcp_tools import generate_exam_latex
    _persist_progress(state['session_id'], 'generate_latex', state)
    try:
        result = generate_exam_latex(
            questions=state.get('questions') or [],
            adjustments=state.get('adjustments') or [],
            exam_title=state.get('exam_title') or 'Examen Final',
            course_name=state.get('course_name') or 'Module',
            course_id=state.get('course_id') or 0,
        )
        session = ExamAnalysisSession.query.get(state['session_id'])
        if session:
            session.latex_source = result.get('latex_source', '')
            session.latex_pdf_path = result.get('pdf_path')
            db.session.commit()
        return {
            **state,
            'latex_source': result.get('latex_source', ''),
            'latex_pdf_path': result.get('pdf_path'),
            'questions': result.get('adjusted_questions', state.get('questions')),
            'current_node': 'generate_latex',
        }
    except Exception as e:
        db.session.rollback()
        return {**state, 'errors': state.get('errors', []) + [f"generate_latex: {e}"], 'current_node': 'generate_latex'}


def _node_evaluate_proposal(state: ExamEvaluationState) -> ExamEvaluationState:
    from app.services.exam_mcp_tools import evaluate_exam_proposal
    _persist_progress(state['session_id'], 'evaluate_proposal', state)
    try:
        evaluation = evaluate_exam_proposal(
            state.get('latex_source') or '',
            state.get('feedback') or '',
            state.get('aa_list') or [],
        )
        session = ExamAnalysisSession.query.get(state['session_id'])
        if session:
            session.status = 'done'
            session.progress = 100
            session.current_agent = 'Terminé'
            final_state = {
                k: v for k, v in state.items()
                if k not in ('exam_text', 'course_context')
            }
            final_state['proposal_evaluation'] = evaluation
            final_state['corrections'] = state.get('corrections', [])
            session.state_json = json.dumps(final_state, ensure_ascii=False, default=str)
            db.session.commit()
        return {**state, 'proposal_evaluation': evaluation, 'current_node': 'evaluate_proposal'}
    except Exception as e:
        db.session.rollback()
        return {**state, 'errors': state.get('errors', []) + [f"evaluate_proposal: {e}"], 'current_node': 'evaluate_proposal'}


def _node_generate_corrections(state: ExamEvaluationState) -> ExamEvaluationState:
    """ReAct agent that generates model corrections for validated questions."""
    _persist_progress(state['session_id'], 'generate_corrections', state)

    questions = state.get('questions') or []
    validated_qs = [q for q in questions if q.get('validated', True)]

    if not validated_qs:
        return {**state, 'corrections': [], 'current_node': 'generate_corrections'}

    # Try ReAct agent first
    try:
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
        from langgraph.prebuilt import create_react_agent
        from app.services.mcp_langchain_bridge import get_exam_langchain_tools, get_skill_langchain_tools

        llm = _get_react_llm()
        tools = get_exam_langchain_tools() + get_skill_langchain_tools()

        if tools:
            system_msg = (
                "Tu es un agent de correction d'examens. Pour chaque question validée, "
                "utilise l'outil generate_question_correction pour créer une correction modèle. "
                "Traite toutes les questions une par une."
            )
            agent = create_react_agent(llm, tools, prompt=system_msg)

            q_list_str = "\n".join([
                f"Q{q.get('number', i+1)}: {q.get('text', '')[:200]} ({q.get('points', '?')} pts, "
                f"Bloom: {q.get('bloom_level', '?')}, Type: {q.get('type', '?')})"
                for i, q in enumerate(validated_qs)
            ])

            result = agent.invoke({
                "messages": [HumanMessage(
                    content=f"Génère les corrections pour ces {len(validated_qs)} questions:\n{q_list_str}"
                )],
            })

            # Extract corrections from tool results
            tool_results = _extract_tool_results(result.get("messages", []))
            if tool_results:
                corrections = []
                for i, q in enumerate(validated_qs):
                    corr_data = tool_results[i] if i < len(tool_results) else {}
                    if not isinstance(corr_data, dict):
                        corr_data = {}
                    corrections.append({
                        'index': i,
                        'exercise_number': q.get('exercise_number', q.get('number', i + 1)),
                        'exercise_title': q.get('exercise_title', f"Question {i + 1}"),
                        'question_text': q.get('text', ''),
                        'question_type': q.get('type', 'Ouvert'),
                        'points': q.get('points', 0),
                        'bloom_level': q.get('bloom_level', ''),
                        'difficulty': q.get('difficulty', ''),
                        'aa_numbers': q.get('aa_codes', []),
                        'correction': corr_data.get('correction', ''),
                        'points_detail': corr_data.get('points_detail', ''),
                        'criteres': corr_data.get('criteres', []),
                        'validated': False,
                    })
                return {**state, 'corrections': corrections, 'current_node': 'generate_corrections'}

        raise RuntimeError("No tools available, using fallback")

    except Exception as e:
        logger.info(f"ReAct generate_corrections fallback: {e}")
        # Fallback: direct MCP tool calls
        from app.services.exam_mcp_tools import generate_question_correction

        course_context = state.get('course_context', '')
        corrections = []
        for i, q in enumerate(validated_qs):
            try:
                corr_data = generate_question_correction(
                    question_text=q.get('text', ''),
                    question_type=q.get('type', 'Ouvert'),
                    points=q.get('points', 0),
                    bloom_level=q.get('bloom_level', ''),
                    difficulty=q.get('difficulty', ''),
                    aa_codes=q.get('aa_codes', []),
                    course_context=course_context,
                )
            except Exception as e2:
                logger.warning(f"Correction generation failed for Q{i + 1}: {e2}")
                corr_data = {}

            corrections.append({
                'index': i,
                'exercise_number': q.get('exercise_number', q.get('number', i + 1)),
                'exercise_title': q.get('exercise_title', f"Question {i + 1}"),
                'question_text': q.get('text', ''),
                'question_type': q.get('type', 'Ouvert'),
                'points': q.get('points', 0),
                'bloom_level': q.get('bloom_level', ''),
                'difficulty': q.get('difficulty', ''),
                'aa_numbers': q.get('aa_codes', []),
                'correction': corr_data.get('correction', ''),
                'points_detail': corr_data.get('points_detail', ''),
                'criteres': corr_data.get('criteres', []),
                'validated': False,
            })

        return {**state, 'corrections': corrections, 'current_node': 'generate_corrections'}


# ── Graph Builder ─────────────────────────────────────────────────────────────

def build_exam_graph():
    g = StateGraph(ExamEvaluationState)
    g.add_node("extract_text",        _node_extract_text)
    g.add_node("extract_questions",   _node_extract_questions)
    g.add_node("classify_aa",         _node_classify_aa)
    g.add_node("classify_bloom",      _node_classify_bloom)
    g.add_node("assess_difficulty",   _node_assess_difficulty)
    g.add_node("compare_content",     _node_compare_content)
    g.add_node("analyze_feedback",    _node_analyze_feedback)
    g.add_node("suggest_adjustments", _node_suggest_adjustments)
    g.add_node("generate_corrections", _node_generate_corrections)
    g.add_node("generate_latex",      _node_generate_latex)
    g.add_node("evaluate_proposal",   _node_evaluate_proposal)

    g.add_edge(START,                 "extract_text")
    g.add_edge("extract_text",        "extract_questions")
    g.add_edge("extract_questions",   "classify_aa")
    g.add_edge("classify_aa",         "classify_bloom")
    g.add_edge("classify_bloom",      "assess_difficulty")
    g.add_edge("assess_difficulty",   "compare_content")
    g.add_edge("compare_content",     "analyze_feedback")
    g.add_edge("analyze_feedback",    "suggest_adjustments")
    g.add_edge("suggest_adjustments", "generate_corrections")
    g.add_edge("generate_corrections", "generate_latex")
    g.add_edge("generate_latex",      "evaluate_proposal")
    g.add_edge("evaluate_proposal",   END)
    return g.compile()


_exam_graph = None


def get_exam_graph():
    global _exam_graph
    if _exam_graph is None:
        _exam_graph = build_exam_graph()
    return _exam_graph


# ── Public API ────────────────────────────────────────────────────────────────

def run_exam_evaluation(
    course_id: int,
    file_path: str,
    exam_title: str = "Examen Final",
    document_id: Optional[int] = None,
) -> int:
    """
    Launch exam evaluation in a background thread.
    Returns the ExamAnalysisSession.id immediately.
    """
    from flask import current_app
    from app.models import Course

    app = current_app._get_current_object()

    course = Course.query.get(course_id)
    course_name = course.title if course else "Module"

    session = ExamAnalysisSession(
        course_id=course_id,
        document_id=document_id,
        status='running',
        current_agent='Initialisation...',
        progress=0,
    )
    db.session.add(session)
    db.session.commit()
    session_id = session.id

    initial_state: ExamEvaluationState = {
        'session_id': session_id,
        'course_id': course_id,
        'document_id': document_id,
        'file_path': file_path,
        'exam_title': exam_title,
        'course_name': course_name,
        'exam_text': None,
        'questions': None,
        'aa_list': None,
        'course_context': None,
        'comparison_report': None,
        'feedback': None,
        'adjustments': None,
        'latex_source': None,
        'latex_pdf_path': None,
        'proposal_evaluation': None,
        'errors': [],
        'current_node': '',
    }

    def _run():
        with app.app_context():
            try:
                graph = get_exam_graph()
                final_state = graph.invoke(initial_state)
                sess = ExamAnalysisSession.query.get(session_id)
                if sess:
                    if sess.status != 'done':
                        # Graph completed but final agent didn't mark done — mark error
                        sess.status = 'error'
                        sess.progress = 100
                    if final_state.get('errors'):
                        existing = sess.error_message or ''
                        sess.error_message = (existing + ' | ' if existing else '') + '; '.join(final_state['errors'])
                    db.session.commit()
            except Exception as e:
                try:
                    sess = ExamAnalysisSession.query.get(session_id)
                    if sess:
                        sess.status = 'error'
                        sess.error_message = str(e)
                        db.session.commit()
                except Exception:
                    pass

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return session_id
