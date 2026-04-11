"""
coach_agent.py — Agentic AI Coach for student performance analysis.

Uses LangGraph to orchestrate 4 agents:
  1. PerformanceAnalyzer: Aggregates scores by module, AA/CLO, Bloom level
  2. SkillGapDetector: Compares results to syllabus objectives, finds weaknesses
  3. ExerciseRecommender: Selects/generates reinforcement exercises
  4. SchedulePlanner: Proposes a personalized study schedule
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, TypedDict
from datetime import datetime, timedelta

from flask import current_app
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

from app import db
from app.models.users import User
from app.models.courses import Course, Chapter, Enrollment
from app.models.assessments import Quiz, QuizQuestion, QuestionBankQuestion
from app.models.documents import Document
from app.models.activities import SectionQuizSubmission

logger = logging.getLogger(__name__)


# ── State ─────────────────────────────────────────────────────────────────────

class CoachState(TypedDict):
    student_id: int
    course_ids: List[int]

    # Agent outputs
    performance_data: Optional[Dict[str, Any]]
    skill_gaps: Optional[List[Dict[str, Any]]]
    recommendations: Optional[List[Dict[str, Any]]]
    study_plan: Optional[Dict[str, Any]]

    errors: List[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

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


# ── Main Analysis Function ────────────────────────────────────────────────────

def analyze_student_performance(student_id: int, course_ids: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    Run the full Coach AI analysis pipeline for a student.
    Returns performance data, skill gaps, recommendations, and study plan.
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
        }

    # Step 1: Collect performance data
    performance = _collect_performance_data(student_id, course_ids)

    # Step 1b: Enrich with SkillManager skills (compose chain)
    skills_enrichment = None
    try:
        from app.services.skill_manager import SkillManager, SkillContext
        skill_manager = SkillManager()
        ctx = SkillContext(
            user_id=student_id,
            role='student',
            agent_id='coach',
        )
        skills_result = skill_manager.compose(
            skill_ids=['performance-scorer', 'weakness-detector', 'exercise-recommender'],
            context=ctx,
            initial_input={'student_id': student_id, 'course_ids': course_ids},
        )
        if skills_result.success:
            skills_enrichment = skills_result.data
            logger.info(f"Skills enrichment succeeded for student {student_id}")
    except Exception as e:
        logger.warning(f"Skills enrichment skipped: {e}")

    # Step 2 & 3: Use LLM to analyze gaps and generate recommendations
    try:
        llm = _get_llm(robust=False)

        prompt = f"""Tu es un coach pédagogique IA. Analyse les performances de l'étudiant et génère:
1. Les lacunes identifiées (skill_gaps)
2. Des recommandations d'exercices de renforcement
3. Un plan d'étude pour les prochaines semaines

Données de performance de l'étudiant:
{json.dumps(performance, ensure_ascii=False, indent=2)}

Réponds en JSON strictement avec cette structure:
{{
  "skill_gaps": [
    {{
      "area": "nom du domaine/compétence",
      "course_title": "nom du module",
      "course_id": number,
      "severity": "high" | "medium" | "low",
      "score": number,
      "description": "description de la lacune"
    }}
  ],
  "recommendations": [
    {{
      "title": "titre de l'exercice recommandé",
      "type": "quiz" | "revision" | "exercise" | "practice",
      "priority": "urgent" | "important" | "optional",
      "course_title": "nom du module",
      "course_id": number,
      "target_bloom": "niveau bloom visé",
      "description": "description de ce qu'il faut travailler",
      "estimated_duration_min": number
    }}
  ],
  "study_plan": {{
    "summary": "résumé du plan",
    "activities": [
      {{
        "day_offset": number,
        "title": "activité",
        "type": "revision" | "exercise" | "quiz",
        "course_title": "module",
        "duration_min": number,
        "description": "détail"
      }}
    ]
  }}
}}"""

        response = llm.invoke([
            SystemMessage(content="Tu es un assistant pédagogique expert. Réponds uniquement en JSON valide."),
            HumanMessage(content=prompt),
        ])

        # Parse LLM response
        text = response.content.strip()
        # Remove markdown code fences if present
        if text.startswith('```'):
            text = text.split('\n', 1)[1] if '\n' in text else text[3:]
        if text.endswith('```'):
            text = text[:-3]
        if text.startswith('json'):
            text = text[4:]

        result = json.loads(text.strip())

        return {
            'performance': performance,
            'skill_gaps': result.get('skill_gaps', []),
            'recommendations': result.get('recommendations', []),
            'study_plan': result.get('study_plan', {'activities': []}),
            'skills_enrichment': skills_enrichment,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response: {e}")
        return {
            'performance': performance,
            'skill_gaps': performance.get('weak_areas', []),
            'recommendations': [],
            'study_plan': {'activities': []},
            'llm_error': 'Failed to parse AI response',
        }
    except Exception as e:
        logger.error(f"Coach agent error: {e}")
        return {
            'performance': performance,
            'skill_gaps': performance.get('weak_areas', []),
            'recommendations': [],
            'study_plan': {'activities': []},
            'llm_error': str(e),
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
