"""
feedback_service.py — Generate personalized post-evaluation feedback using Gemini.

Analyses student exam answers vs correct answers and produces structured
feedback: strengths, weaknesses, tips, and recommended resources.
"""
import json
import logging
from datetime import datetime

from flask import current_app
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

from app import db
from app.models.exam_bank import ExamSession, ExamSessionAnswer, ExamBankQuestion
from app.models.feedback import EvaluationFeedback

logger = logging.getLogger(__name__)


def _get_llm():
    """Get a Gemini LLM instance."""
    api_key = current_app.config.get('GOOGLE_API_KEY')
    model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.4,
    )


def _build_answers_summary(session: ExamSession) -> str:
    """Build a text summary of every question / correct answer / student answer."""
    lines = []
    for ans in session.answers:
        q: ExamBankQuestion = ans.question
        q_type = q.question_type or 'open_ended'

        block = f"### Question {q.order} ({q_type}, {q.points} pts)\n"
        block += f"**Question:** {q.question_text}\n"

        if q_type == 'mcq':
            choices = []
            for label in ('a', 'b', 'c', 'd'):
                val = getattr(q, f'choice_{label}', None)
                if val:
                    choices.append(f"  {label.upper()}) {val}")
            block += "\n".join(choices) + "\n"
            block += f"**Correct choice:** {q.correct_choice}\n"
            block += f"**Student choice:** {ans.student_choice or '(no answer)'}\n"
        else:
            block += f"**Correct answer:** {q.answer or '(not provided)'}\n"
            block += f"**Student answer:** {ans.student_answer or '(no answer)'}\n"

        block += f"**Score:** {ans.score if ans.score is not None else '?'} / {q.points}\n"
        lines.append(block)

    return "\n---\n".join(lines)


SYSTEM_PROMPT = """\
You are an expert educational assessment analyst. You will receive a student's exam
results: each question with its correct answer and the student's answer plus their score.

Produce a JSON object with exactly these keys:
- "strengths": array of 2-5 short strings describing what the student did well
- "weaknesses": array of 2-5 short strings describing areas to improve
- "recommendations": array of 3-5 actionable tips (study strategies, resources, topics to revisit)
- "feedback_markdown": a rich Markdown text (3-6 paragraphs) providing an encouraging,
  personalised analysis covering strengths, areas for improvement, and concrete next steps.

Rules:
- Be encouraging but honest.
- Reference specific questions when relevant (e.g. "Question 3").
- Keep each strength / weakness item to one sentence.
- Return ONLY valid JSON, no extra text.
"""


def generate_feedback(exam_session_id: int) -> EvaluationFeedback:
    """Generate AI feedback for a completed exam session.

    Returns the persisted EvaluationFeedback object.
    Raises ValueError for invalid states, RuntimeError for LLM errors.
    """
    session = ExamSession.query.get(exam_session_id)
    if not session:
        raise ValueError(f"Exam session {exam_session_id} not found")
    if session.status not in ('submitted', 'graded'):
        raise ValueError("Feedback can only be generated for submitted or graded sessions")

    # Check for existing feedback
    existing = EvaluationFeedback.query.filter_by(exam_session_id=exam_session_id).first()
    if existing:
        # Re-generate: delete old then create new
        db.session.delete(existing)
        db.session.flush()

    answers_summary = _build_answers_summary(session)
    score_line = f"Total score: {session.score} / {session.max_score}" if session.score is not None else ""

    user_prompt = (
        f"## Exam results for student\n\n{score_line}\n\n{answers_summary}"
    )

    llm = _get_llm()
    try:
        response = llm.invoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ])
        raw = response.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].rstrip()
        if raw.startswith("json"):
            raw = raw[4:].lstrip()

        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("LLM returned invalid JSON: %s", exc)
        raise RuntimeError("Failed to parse LLM response as JSON")
    except Exception as exc:
        logger.error("LLM invocation failed: %s", exc)
        raise RuntimeError(f"LLM error: {exc}")

    feedback = EvaluationFeedback(
        exam_session_id=exam_session_id,
        student_id=session.student_id,
        feedback_text=data.get('feedback_markdown', ''),
        strengths_json=json.dumps(data.get('strengths', [])),
        weaknesses_json=json.dumps(data.get('weaknesses', [])),
        recommendations_json=json.dumps(data.get('recommendations', [])),
        generated_at=datetime.utcnow(),
    )
    db.session.add(feedback)
    db.session.commit()

    return feedback
