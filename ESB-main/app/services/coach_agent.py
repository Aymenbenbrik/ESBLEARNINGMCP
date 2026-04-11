"""
coach_agent.py — Agentic AI Coach for student performance analysis.

Uses a LangGraph StateGraph with ReAct tool-calling nodes to orchestrate
an autonomous coaching pipeline:

  START → collect_data → analyze_performance → detect_gaps → generate_plan → finalize → END

Nodes:
  1. collect_data          — Pure function: aggregates scores by module, Bloom level
  2. analyze_performance   — ReAct agent: performance-scorer, bloom-classifier
  3. detect_gaps           — ReAct agent: weakness-detector, syllabus-mapper
  4. generate_plan         — ReAct agent: exercise-recommender, study-planner,
                             feedback-writer, language-adapter
  5. finalize              — Pure function: assembles backward-compatible response dict
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, TypedDict

from flask import current_app
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import create_react_agent

from app import db
from app.models.users import User
from app.models.courses import Course, Chapter, Enrollment
from app.models.assessments import Quiz, QuizQuestion, QuestionBankQuestion
from app.models.documents import Document
from app.models.activities import SectionQuizSubmission

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# State
# ══════════════════════════════════════════════════════════════════════════════

class CoachState(TypedDict):
    student_id: int
    course_ids: List[int]

    # Node outputs
    performance_data: Optional[Dict[str, Any]]
    analysis: Optional[Dict[str, Any]]
    skill_gaps: Optional[List[Dict[str, Any]]]
    recommendations: Optional[List[Dict[str, Any]]]
    study_plan: Optional[Dict[str, Any]]
    feedback: Optional[str]

    errors: List[str]


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _get_llm(robust: bool = False):
    """Get a Gemini LLM instance."""
    api_key = current_app.config.get('GOOGLE_API_KEY')
    model_name = current_app.config.get(
        'GEMINI_MODEL_ROBUST' if robust else 'GEMINI_MODEL',
        'gemini-2.5-flash'
    )
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.3,
    )


def _parse_json_or_text(text: str) -> dict:
    """Parse JSON from LLM response, handling markdown code fences."""
    text = text.strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1] if '\n' in text else text[3:]
    if text.endswith('```'):
        text = text[:-3]
    if text.startswith('json'):
        text = text[4:]
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {"raw_text": text}


def _collect_performance_data(student_id: int, course_ids: List[int]) -> Dict[str, Any]:
    """Collect all student performance data across modules."""
    data = {
        'courses': [],
        'overall_avg': 0.0,
        'total_quizzes': 0,
        'bloom_scores': {},
        'weak_areas': [],
    }

    all_scores = []

    for course_id in course_ids:
        course = Course.query.get(course_id)
        if not course:
            continue

        # Get quizzes for this student in this course
        chapter_ids = [ch.id for ch in Chapter.query.filter_by(course_id=course_id).all()]
        doc_ids = []
        if chapter_ids:
            docs = Document.query.filter(
                (Document.course_id == course_id) | (Document.chapter_id.in_(chapter_ids))
            ).all()
            doc_ids = [d.id for d in docs]

        quizzes = Quiz.query.filter(
            Quiz.student_id == student_id,
            Quiz.completed_at.isnot(None),
            Quiz.document_id.in_(doc_ids) if doc_ids else Quiz.id < 0,
        ).all()

        quiz_scores = [q.score for q in quizzes if q.score is not None]
        avg_score = sum(quiz_scores) / len(quiz_scores) if quiz_scores else 0.0

        # Bloom-level breakdown
        bloom_breakdown = {}
        for quiz in quizzes:
            questions = QuizQuestion.query.filter_by(quiz_id=quiz.id).all()
            for q in questions:
                bloom = q.bloom_level or 'unknown'
                if bloom not in bloom_breakdown:
                    bloom_breakdown[bloom] = {'correct': 0, 'total': 0}
                bloom_breakdown[bloom]['total'] += 1
                if q.is_correct:
                    bloom_breakdown[bloom]['correct'] += 1

        # Compute bloom success rates
        bloom_rates = {}
        for bloom, counts in bloom_breakdown.items():
            rate = (counts['correct'] / counts['total'] * 100) if counts['total'] > 0 else 0
            bloom_rates[bloom] = round(rate, 1)
            # Track overall bloom scores
            if bloom not in data['bloom_scores']:
                data['bloom_scores'][bloom] = {'correct': 0, 'total': 0}
            data['bloom_scores'][bloom]['correct'] += counts['correct']
            data['bloom_scores'][bloom]['total'] += counts['total']

        course_data = {
            'course_id': course_id,
            'course_title': course.title,
            'quizzes_completed': len(quizzes),
            'avg_score': round(avg_score, 1),
            'bloom_rates': bloom_rates,
            'chapters_count': len(chapter_ids),
        }
        data['courses'].append(course_data)
        all_scores.extend(quiz_scores)
        data['total_quizzes'] += len(quizzes)

    data['overall_avg'] = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0.0

    # Compute overall bloom rates
    for bloom, counts in data['bloom_scores'].items():
        rate = (counts['correct'] / counts['total'] * 100) if counts['total'] > 0 else 0
        data['bloom_scores'][bloom] = round(rate, 1)
        if rate < 50:
            data['weak_areas'].append({'type': 'bloom', 'name': bloom, 'score': rate})

    # Identify weak courses
    for c in data['courses']:
        if c['avg_score'] < 50:
            data['weak_areas'].append({
                'type': 'course', 'name': c['course_title'],
                'score': c['avg_score'], 'course_id': c['course_id']
            })

    return data


# ══════════════════════════════════════════════════════════════════════════════
# Fallback functions (graceful degradation when ReAct tool-calling fails)
# ══════════════════════════════════════════════════════════════════════════════

def _fallback_analyze(state: CoachState) -> dict:
    """Direct LLM analysis when ReAct tool-calling is unavailable."""
    try:
        llm = _get_llm()
        perf_json = json.dumps(state.get('performance_data', {}), ensure_ascii=False, indent=2)
        prompt = (
            "Tu es un analyseur de performance pédagogique. "
            "Analyse les données suivantes et produis un JSON avec les clés: "
            '"overall_level" (str), "bloom_analysis" (dict bloom→note), '
            '"strengths" (list), "weaknesses" (list), "summary" (str).\n\n'
            f"Données:\n{perf_json}"
        )
        response = llm.invoke([
            SystemMessage(content="Réponds uniquement en JSON valide."),
            HumanMessage(content=prompt),
        ])
        return {"analysis": _parse_json_or_text(response.content)}
    except Exception as e:
        logger.error(f"Fallback analyze failed: {e}")
        perf = state.get('performance_data', {})
        return {"analysis": {
            "overall_level": "unknown",
            "bloom_analysis": perf.get('bloom_scores', {}),
            "strengths": [],
            "weaknesses": [w['name'] for w in perf.get('weak_areas', [])],
            "summary": "Analyse automatique indisponible.",
        }}


def _fallback_detect_gaps(state: CoachState) -> dict:
    """Direct LLM gap detection when ReAct tool-calling is unavailable."""
    try:
        llm = _get_llm()
        perf_json = json.dumps(state.get('performance_data', {}), ensure_ascii=False, indent=2)
        analysis_json = json.dumps(state.get('analysis', {}), ensure_ascii=False, indent=2)
        prompt = (
            "Tu es un détecteur de lacunes pédagogiques. "
            "À partir des données de performance et de l'analyse, identifie les lacunes.\n"
            "Produis un JSON avec la clé \"skill_gaps\": liste d'objets avec "
            '"area", "course_title", "course_id", "severity" (high/medium/low), '
            '"score", "description".\n\n'
            f"Performance:\n{perf_json}\n\nAnalyse:\n{analysis_json}"
        )
        response = llm.invoke([
            SystemMessage(content="Réponds uniquement en JSON valide."),
            HumanMessage(content=prompt),
        ])
        parsed = _parse_json_or_text(response.content)
        return {"skill_gaps": parsed.get('skill_gaps', parsed.get('raw_text', []))}
    except Exception as e:
        logger.error(f"Fallback detect_gaps failed: {e}")
        perf = state.get('performance_data', {})
        return {"skill_gaps": [
            {"area": w['name'], "severity": "high" if w['score'] < 30 else "medium",
             "score": w['score'], "description": f"Score faible: {w['score']}%"}
            for w in perf.get('weak_areas', [])
        ]}


def _fallback_generate_plan(state: CoachState) -> dict:
    """Direct LLM plan generation when ReAct tool-calling is unavailable."""
    try:
        llm = _get_llm()
        gaps_json = json.dumps(state.get('skill_gaps', []), ensure_ascii=False, indent=2)
        perf_json = json.dumps(state.get('performance_data', {}), ensure_ascii=False, indent=2)
        prompt = (
            "Tu es un planificateur pédagogique. Génère des recommandations et un plan d'étude.\n"
            "Produis un JSON avec:\n"
            '- "recommendations": liste d\'objets avec "title", "type", "priority", '
            '"course_title", "course_id", "target_bloom", "description", "estimated_duration_min"\n'
            '- "study_plan": {"summary": str, "activities": [{"day_offset", "title", "type", '
            '"course_title", "duration_min", "description"}]}\n'
            '- "feedback": str (message motivationnel pour l\'étudiant)\n\n'
            f"Lacunes:\n{gaps_json}\n\nPerformance:\n{perf_json}"
        )
        response = llm.invoke([
            SystemMessage(content="Réponds uniquement en JSON valide."),
            HumanMessage(content=prompt),
        ])
        parsed = _parse_json_or_text(response.content)
        return {
            "recommendations": parsed.get('recommendations', []),
            "study_plan": parsed.get('study_plan', {'activities': []}),
            "feedback": parsed.get('feedback'),
        }
    except Exception as e:
        logger.error(f"Fallback generate_plan failed: {e}")
        return {
            "recommendations": [],
            "study_plan": {"summary": "Plan indisponible.", "activities": []},
            "feedback": None,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Graph nodes
# ══════════════════════════════════════════════════════════════════════════════

def _node_collect_data(state: CoachState) -> dict:
    """Pure function node: collect raw performance data from the database."""
    try:
        performance = _collect_performance_data(state['student_id'], state['course_ids'])
        return {"performance_data": performance}
    except Exception as e:
        logger.error(f"[CoachGraph] collect_data error: {e}")
        return {
            "performance_data": {
                'courses': [], 'overall_avg': 0.0,
                'total_quizzes': 0, 'bloom_scores': {}, 'weak_areas': [],
            },
            "errors": state.get("errors", []) + [f"collect_data: {e}"],
        }


def _node_analyze_performance(state: CoachState) -> dict:
    """ReAct agent that autonomously analyzes student performance."""
    from app.services.mcp_langchain_bridge import get_skill_langchain_tools

    tools = get_skill_langchain_tools(
        agent_id='coach', role='student', user_id=state['student_id'],
    )
    relevant_tools = [t for t in tools if any(k in t.name for k in ['performance', 'bloom'])]

    if not relevant_tools:
        logger.info("[CoachGraph] No performance/bloom tools found, using fallback")
        return _fallback_analyze(state)

    perf_json = json.dumps(state.get('performance_data', {}), ensure_ascii=False, indent=2)
    system_prompt = (
        "Tu es un analyseur de performance pédagogique expert. "
        "Utilise les outils disponibles pour analyser les données de l'étudiant. "
        "Produis une analyse structurée avec: overall_level, bloom_analysis, "
        "strengths, weaknesses, summary.\n\n"
        f"Données de performance:\n{perf_json}"
    )

    try:
        llm = _get_llm()
        agent = create_react_agent(llm, relevant_tools, prompt=system_prompt)
        result = agent.invoke({
            "messages": [HumanMessage(
                content="Analyse les performances de cet étudiant en utilisant les outils disponibles."
            )],
        })

        ai_messages = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
        analysis_text = ai_messages[-1].content if ai_messages else ""
        return {"analysis": _parse_json_or_text(analysis_text)}
    except Exception as e:
        logger.warning(f"[CoachGraph] ReAct analyze failed, using fallback: {e}")
        return _fallback_analyze(state)


def _node_detect_gaps(state: CoachState) -> dict:
    """ReAct agent that autonomously detects skill gaps and maps to syllabus."""
    from app.services.mcp_langchain_bridge import get_skill_langchain_tools

    tools = get_skill_langchain_tools(
        agent_id='coach', role='student', user_id=state['student_id'],
    )
    relevant_tools = [t for t in tools if any(k in t.name for k in ['weakness', 'syllabus'])]

    if not relevant_tools:
        logger.info("[CoachGraph] No weakness/syllabus tools found, using fallback")
        return _fallback_detect_gaps(state)

    perf_json = json.dumps(state.get('performance_data', {}), ensure_ascii=False, indent=2)
    analysis_json = json.dumps(state.get('analysis', {}), ensure_ascii=False, indent=2)
    system_prompt = (
        "Tu es un détecteur de lacunes pédagogiques. "
        "Utilise les outils disponibles pour identifier les lacunes de l'étudiant "
        "et les mapper aux objectifs du syllabus.\n"
        "Produis une liste de skill_gaps avec: area, course_title, course_id, "
        "severity (high/medium/low), score, description.\n\n"
        f"Performance:\n{perf_json}\n\nAnalyse:\n{analysis_json}"
    )

    try:
        llm = _get_llm()
        agent = create_react_agent(llm, relevant_tools, prompt=system_prompt)
        result = agent.invoke({
            "messages": [HumanMessage(
                content=(
                    "Identifie les lacunes de cet étudiant et mappe-les au syllabus "
                    "en utilisant les outils disponibles."
                )
            )],
        })

        ai_messages = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
        gaps_text = ai_messages[-1].content if ai_messages else ""
        parsed = _parse_json_or_text(gaps_text)
        gaps = parsed.get('skill_gaps', parsed if isinstance(parsed, list) else [])
        if isinstance(gaps, dict):
            gaps = [gaps]
        return {"skill_gaps": gaps}
    except Exception as e:
        logger.warning(f"[CoachGraph] ReAct detect_gaps failed, using fallback: {e}")
        return _fallback_detect_gaps(state)


def _node_generate_plan(state: CoachState) -> dict:
    """ReAct agent that autonomously generates recommendations and study plan."""
    from app.services.mcp_langchain_bridge import get_skill_langchain_tools

    tools = get_skill_langchain_tools(
        agent_id='coach', role='student', user_id=state['student_id'],
    )
    relevant_tools = [
        t for t in tools
        if any(k in t.name for k in ['exercise', 'recommender', 'planner', 'feedback', 'language'])
    ]

    if not relevant_tools:
        logger.info("[CoachGraph] No plan/recommendation tools found, using fallback")
        return _fallback_generate_plan(state)

    perf_json = json.dumps(state.get('performance_data', {}), ensure_ascii=False, indent=2)
    gaps_json = json.dumps(state.get('skill_gaps', []), ensure_ascii=False, indent=2)
    analysis_json = json.dumps(state.get('analysis', {}), ensure_ascii=False, indent=2)
    system_prompt = (
        "Tu es un planificateur pédagogique expert. "
        "Utilise les outils disponibles pour générer des recommandations d'exercices, "
        "un plan d'étude personnalisé, et un feedback motivationnel.\n"
        "Produis un JSON avec: recommendations (list), study_plan (dict avec activities), "
        "feedback (str).\n\n"
        f"Performance:\n{perf_json}\n\nAnalyse:\n{analysis_json}\n\nLacunes:\n{gaps_json}"
    )

    try:
        llm = _get_llm()
        agent = create_react_agent(llm, relevant_tools, prompt=system_prompt)
        result = agent.invoke({
            "messages": [HumanMessage(
                content=(
                    "Génère des recommandations, un plan d'étude et un feedback motivationnel "
                    "en utilisant les outils disponibles."
                )
            )],
        })

        ai_messages = [m for m in result.get("messages", []) if isinstance(m, AIMessage)]
        plan_text = ai_messages[-1].content if ai_messages else ""
        parsed = _parse_json_or_text(plan_text)
        return {
            "recommendations": parsed.get('recommendations', []),
            "study_plan": parsed.get('study_plan', {'activities': []}),
            "feedback": parsed.get('feedback'),
        }
    except Exception as e:
        logger.warning(f"[CoachGraph] ReAct generate_plan failed, using fallback: {e}")
        return _fallback_generate_plan(state)


def _node_finalize(state: CoachState) -> dict:
    """Pure function node: assemble all outputs into the final response dict."""
    # Ensure study_plan always has an 'activities' key
    study_plan = state.get('study_plan') or {}
    if 'activities' not in study_plan:
        study_plan['activities'] = []

    # Build skill_extras from analysis artifacts
    skill_extras: Dict[str, Any] = {}
    analysis = state.get('analysis')
    if analysis:
        if 'bloom_analysis' in analysis:
            skill_extras['bloom_analysis'] = analysis['bloom_analysis']
        if 'raw_text' not in analysis:
            skill_extras['performance_analysis'] = analysis

    feedback = state.get('feedback')
    if feedback:
        skill_extras['feedback'] = feedback

    return {
        "errors": state.get("errors", []),
        # Final state fields are already set by previous nodes;
        # finalize just ensures consistency via the state updates above.
        "study_plan": study_plan,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Graph builder
# ══════════════════════════════════════════════════════════════════════════════

def build_coach_graph():
    """Build and compile the Coach StateGraph."""
    g = StateGraph(CoachState)

    g.add_node("collect_data", _node_collect_data)
    g.add_node("analyze_performance", _node_analyze_performance)
    g.add_node("detect_gaps", _node_detect_gaps)
    g.add_node("generate_plan", _node_generate_plan)
    g.add_node("finalize", _node_finalize)

    g.add_edge(START, "collect_data")
    g.add_edge("collect_data", "analyze_performance")
    g.add_edge("analyze_performance", "detect_gaps")
    g.add_edge("detect_gaps", "generate_plan")
    g.add_edge("generate_plan", "finalize")
    g.add_edge("finalize", END)

    return g.compile()


# ══════════════════════════════════════════════════════════════════════════════
# Public API (backward-compatible)
# ══════════════════════════════════════════════════════════════════════════════

def analyze_student_performance(student_id: int, course_ids: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    Run the full Coach AI analysis pipeline for a student.
    Returns performance data, skill gaps, recommendations, and study plan.

    Uses a LangGraph StateGraph with ReAct tool-calling nodes.
    """
    student = User.query.get(student_id)
    if not student:
        return {'error': 'Student not found'}

    # Get enrolled courses if not specified
    if not course_ids:
        enrollments = Enrollment.query.filter_by(student_id=student_id).all()
        course_ids = [e.course_id for e in enrollments]

    if not course_ids:
        return {
            'performance': {'courses': [], 'overall_avg': 0, 'total_quizzes': 0},
            'skill_gaps': [],
            'recommendations': [],
            'study_plan': {'activities': []},
            'skills_enrichment': None,
            'skill_extras': None,
        }

    # Build and invoke the graph
    graph = build_coach_graph()
    initial_state: CoachState = {
        "student_id": student_id,
        "course_ids": course_ids,
        "performance_data": None,
        "analysis": None,
        "skill_gaps": None,
        "recommendations": None,
        "study_plan": None,
        "feedback": None,
        "errors": [],
    }

    try:
        final_state = graph.invoke(initial_state)
    except Exception as e:
        logger.error(f"Coach graph execution failed: {e}")
        # Emergency fallback: collect data directly and return minimal result
        try:
            perf = _collect_performance_data(student_id, course_ids)
        except Exception:
            perf = {'courses': [], 'overall_avg': 0, 'total_quizzes': 0,
                    'bloom_scores': {}, 'weak_areas': []}
        return {
            'performance': perf,
            'skill_gaps': perf.get('weak_areas', []),
            'recommendations': [],
            'study_plan': {'activities': []},
            'skills_enrichment': None,
            'skill_extras': None,
            'llm_error': str(e),
        }

    # Assemble backward-compatible response from final graph state
    performance = final_state.get('performance_data', {})
    analysis = final_state.get('analysis')
    skill_extras: Optional[Dict[str, Any]] = {}

    if analysis:
        if 'bloom_analysis' in analysis:
            skill_extras['bloom_analysis'] = analysis['bloom_analysis']
        if 'raw_text' not in analysis:
            skill_extras['performance_analysis'] = analysis

    feedback = final_state.get('feedback')
    if feedback:
        skill_extras['feedback'] = feedback

    if not skill_extras:
        skill_extras = None

    errors = final_state.get('errors', [])
    if errors:
        logger.warning(f"Coach graph completed with errors: {errors}")

    return {
        'performance': performance,
        'skill_gaps': final_state.get('skill_gaps', performance.get('weak_areas', [])),
        'recommendations': final_state.get('recommendations', []),
        'study_plan': final_state.get('study_plan', {'activities': []}),
        'skills_enrichment': None,
        'skill_extras': skill_extras,
    }


def generate_skill_map(student_id: int, course_id: int) -> Dict[str, Any]:
    """Generate a radar-chart-ready skill map for a student in a course."""
    performance = _collect_performance_data(student_id, [course_id])

    # Build skill map from bloom scores
    bloom_order = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    skill_map = []

    bloom_scores = performance.get('bloom_scores', {})
    for bloom in bloom_order:
        # Match various bloom level naming conventions
        score = 0
        for key, val in bloom_scores.items():
            if key.lower().startswith(bloom[:4]):
                score = val if isinstance(val, (int, float)) else 0
                break
        skill_map.append({
            'skill': bloom.capitalize(),
            'score': round(score, 1),
            'target': 70,
        })

    # Enrich with SkillManager performance-scorer if available
    skill_insights = None
    try:
        from app.services.skill_manager import SkillManager, SkillContext
        manager = SkillManager()
        ctx = SkillContext(
            user_id=student_id,
            course_id=course_id,
            role='student',
            agent_id='coach',
        )
        result = manager.execute('performance-scorer', ctx, {
            'student_id': student_id,
            'course_ids': [course_id],
        })
        if result.success:
            skill_insights = result.data.get('bloom_breakdown')
    except Exception:
        pass

    return {
        'course_id': course_id,
        'student_id': student_id,
        'skills': skill_map,
        'overall_avg': performance.get('overall_avg', 0),
        'skill_insights': skill_insights,
    }
