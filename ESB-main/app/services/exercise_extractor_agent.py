"""
Exercise Extractor Agent — AI-powered extraction of exercises from course documents.

LangGraph StateGraph pipeline:
  collect_documents → extract_text → identify_exercises → generate_mcq → classify → store → END

Reads PDF/DOCX documents attached to a course, uses Gemini to identify exercises,
transforms each exercise into QCM questions, classifies by Bloom level / AA code,
and stores them in QuestionBankQuestion (grouped via QuestionBankExercise).
"""

import json
import logging
import os
import re
from datetime import datetime
from typing import Dict, List, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)

# ── Maximum text length per LLM call (characters) ────────────────────────────
_CHUNK_SIZE = 4000


# ── State ─────────────────────────────────────────────────────────────────────

class ExerciseExtractionState(TypedDict):
    course_id: int
    chapter_id: Optional[int]
    user_id: int

    # Progressive results
    documents: Optional[List[Dict]]
    raw_texts: Optional[List[Dict]]       # [{doc_id, title, text}]
    exercises: Optional[List[Dict]]       # [{doc_id, exercise_text, exercise_type, context}]
    mcq_questions: Optional[List[Dict]]   # [{question_text, choice_a/b/c, correct_choice, ...}]
    stored_count: int

    errors: List[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_llm(temperature: float = 0.3):
    """Return a ChatGoogleGenerativeAI instance using app config."""
    from app.services.mcp_tools import _llm
    return _llm(temperature)


def _get_llm_robust(temperature: float = 0.2):
    from app.services.mcp_tools import _llm_robust
    return _llm_robust(temperature)


def _parse_json_from_llm(text: str):
    """Extract a JSON array or object from an LLM response that may contain markdown fences."""
    if not text:
        return []
    # Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = cleaned.strip().rstrip("`")

    # Try direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try to find a JSON array
    match = re.search(r"\[\s*\{.*}\s*]", cleaned, re.DOTALL)
    if match:
        candidate = match.group(0)
        candidate = re.sub(r",\s*]", "]", candidate)
        candidate = re.sub(r",\s*}", "}", candidate)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass
    return []


def _chunk_text(text: str, chunk_size: int = _CHUNK_SIZE) -> List[str]:
    """Split text into chunks, trying to break on paragraph boundaries."""
    if len(text) <= chunk_size:
        return [text]

    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunks.append(text[start:])
            break
        # Try to break at a paragraph boundary
        newline_pos = text.rfind("\n\n", start, end)
        if newline_pos > start:
            end = newline_pos
        chunks.append(text[start:end])
        start = end
    return chunks


# ── Node 1: Collect Documents ────────────────────────────────────────────────

def _node_collect_documents(state: ExerciseExtractionState) -> dict:
    """Collect all course documents (PDFs, DOCXs)."""
    from flask import current_app
    from app.models.documents import Document

    course_id = state["course_id"]
    chapter_id = state.get("chapter_id")

    query = Document.query.filter_by(course_id=course_id)
    if chapter_id:
        query = query.filter_by(chapter_id=chapter_id)

    docs = query.all()
    upload_folder = current_app.config.get("UPLOAD_FOLDER", "uploads")

    documents: List[Dict] = []
    errors: List[str] = list(state.get("errors") or [])

    for doc in docs:
        if not doc.file_path:
            continue
        ext = os.path.splitext(doc.file_path)[1].lower()
        if ext not in (".pdf", ".docx", ".doc"):
            continue
        full_path = (
            doc.file_path
            if os.path.isabs(doc.file_path)
            else os.path.join(upload_folder, doc.file_path)
        )
        if not os.path.exists(full_path):
            errors.append(f"File not found for document '{doc.title}': {full_path}")
            continue
        documents.append({
            "id": doc.id,
            "title": doc.title,
            "file_path": full_path,
            "chapter_id": doc.chapter_id,
        })

    logger.info("Collected %d documents for course %d", len(documents), course_id)
    return {"documents": documents, "errors": errors}


# ── Node 2: Extract Text ─────────────────────────────────────────────────────

def _node_extract_text(state: ExerciseExtractionState) -> dict:
    """Extract text from all collected documents."""
    from app.services.evaluate_service import extract_text_from_file

    documents = state.get("documents") or []
    raw_texts: List[Dict] = []
    errors: List[str] = list(state.get("errors") or [])

    for doc in documents:
        try:
            text = extract_text_from_file(doc["file_path"])
            if text and text.strip():
                raw_texts.append({
                    "doc_id": doc["id"],
                    "title": doc["title"],
                    "chapter_id": doc.get("chapter_id"),
                    "text": text,
                })
            else:
                errors.append(f"Empty text extracted from '{doc['title']}'")
        except Exception as e:
            errors.append(f"Error extracting text from '{doc['title']}': {e}")
            logger.exception("Text extraction failed for doc %s", doc["id"])

    logger.info("Extracted text from %d documents", len(raw_texts))
    return {"raw_texts": raw_texts, "errors": errors}


# ── Node 3: Identify Exercises ───────────────────────────────────────────────

_IDENTIFY_PROMPT = """\
You are an expert at analysing educational documents.
Given the following text extracted from a course document, identify ALL exercises,
problems, questions, and practice activities.

For each exercise found, return a JSON object with:
- "exercise_text": the full text of the exercise / problem
- "exercise_type": one of "calculation", "theory", "application", "analysis", "programming", "other"
- "context": a short summary of the topic / chapter context (1-2 sentences)

Return a JSON array of objects. If no exercises are found, return an empty array [].
Only return the JSON, no extra text.

--- DOCUMENT TEXT ---
{text}
"""


def _node_identify_exercises(state: ExerciseExtractionState) -> dict:
    """Use Gemini AI to identify exercises in the extracted text."""
    raw_texts = state.get("raw_texts") or []
    errors: List[str] = list(state.get("errors") or [])
    exercises: List[Dict] = []

    llm = _get_llm_robust(temperature=0.1)

    for rt in raw_texts:
        chunks = _chunk_text(rt["text"])
        for chunk in chunks:
            try:
                prompt = _IDENTIFY_PROMPT.format(text=chunk)
                response = llm.invoke(prompt)
                content = response.content if hasattr(response, "content") else str(response)
                found = _parse_json_from_llm(content)
                if isinstance(found, list):
                    for ex in found:
                        ex["doc_id"] = rt["doc_id"]
                        ex["chapter_id"] = rt.get("chapter_id")
                    exercises.extend(found)
            except Exception as e:
                errors.append(f"LLM exercise identification failed for doc {rt['doc_id']}: {e}")
                logger.exception("identify_exercises LLM error")

    logger.info("Identified %d exercises across all documents", len(exercises))
    return {"exercises": exercises, "errors": errors}


# ── Node 4: Generate MCQ ─────────────────────────────────────────────────────

_MCQ_PROMPT = """\
You are an expert in creating multiple-choice questions (QCM) for university courses.

Given the exercise below, generate 1 to 3 multiple-choice questions that test the
same knowledge or skills as the exercise.

Each question must have EXACTLY 3 choices (A, B, C) with exactly ONE correct answer.

Return a JSON array where each object has:
- "question_text": the question
- "choice_a": first option
- "choice_b": second option
- "choice_c": third option
- "correct_choice": "A", "B", or "C"
- "explanation": why the correct answer is right (1-2 sentences)
- "difficulty": "easy", "medium", or "hard"

Only return the JSON array, no extra text.

--- EXERCISE ---
{exercise_text}

--- CONTEXT ---
{context}
"""


def _node_generate_mcq(state: ExerciseExtractionState) -> dict:
    """Transform each identified exercise into MCQ questions."""
    exercises = state.get("exercises") or []
    errors: List[str] = list(state.get("errors") or [])
    mcq_questions: List[Dict] = []

    llm = _get_llm_robust(temperature=0.3)

    for idx, ex in enumerate(exercises):
        try:
            prompt = _MCQ_PROMPT.format(
                exercise_text=ex.get("exercise_text", ""),
                context=ex.get("context", ""),
            )
            response = llm.invoke(prompt)
            content = response.content if hasattr(response, "content") else str(response)
            questions = _parse_json_from_llm(content)
            if isinstance(questions, list):
                for q in questions:
                    q["doc_id"] = ex.get("doc_id")
                    q["chapter_id"] = ex.get("chapter_id")
                    q["exercise_index"] = idx
                    q["exercise_type"] = ex.get("exercise_type", "other")
                    q["source_exercise_text"] = ex.get("exercise_text", "")[:300]
                mcq_questions.extend(questions)
        except Exception as e:
            errors.append(f"MCQ generation failed for exercise {idx}: {e}")
            logger.exception("generate_mcq LLM error")

    logger.info("Generated %d MCQ questions from %d exercises", len(mcq_questions), len(exercises))
    return {"mcq_questions": mcq_questions, "errors": errors}


# ── Node 5: Classify ─────────────────────────────────────────────────────────

_CLASSIFY_PROMPT = """\
You are an expert in Bloom's taxonomy and curriculum alignment.

For each question below, determine:
1. bloom_level: one of "remember", "understand", "apply", "analyze", "evaluate", "create"
2. aa_code: the most relevant AA (Activité d'Apprentissage) code, e.g. "AA 1", "AA 2", etc.
   If uncertain, use "AA 1".

Return a JSON array with one object per question, each containing:
- "index": the question index (0-based, matching input order)
- "bloom_level": the Bloom level
- "aa_code": the AA code

Only return the JSON array, no extra text.

--- QUESTIONS ---
{questions_json}
"""


def _node_classify(state: ExerciseExtractionState) -> dict:
    """Classify each MCQ question by Bloom level and AA code."""
    mcq_questions = state.get("mcq_questions") or []
    errors: List[str] = list(state.get("errors") or [])

    if not mcq_questions:
        return {"mcq_questions": mcq_questions, "errors": errors}

    llm = _get_llm(temperature=0.1)

    # Process in batches of 10
    batch_size = 10
    for start in range(0, len(mcq_questions), batch_size):
        batch = mcq_questions[start: start + batch_size]
        summary = [
            {"index": i, "question_text": q.get("question_text", "")}
            for i, q in enumerate(batch)
        ]
        try:
            prompt = _CLASSIFY_PROMPT.format(questions_json=json.dumps(summary, ensure_ascii=False))
            response = llm.invoke(prompt)
            content = response.content if hasattr(response, "content") else str(response)
            classifications = _parse_json_from_llm(content)
            if isinstance(classifications, list):
                for cls in classifications:
                    idx = cls.get("index")
                    if idx is not None and 0 <= idx < len(batch):
                        batch[idx]["bloom_level"] = cls.get("bloom_level", "understand")
                        batch[idx]["clo"] = cls.get("aa_code", "AA 1")
        except Exception as e:
            errors.append(f"Classification failed for batch starting at {start}: {e}")
            logger.exception("classify LLM error")
            # Set defaults for this batch
            for q in batch:
                q.setdefault("bloom_level", "understand")
                q.setdefault("clo", "AA 1")

    # Ensure every question has classification defaults
    for q in mcq_questions:
        q.setdefault("bloom_level", "understand")
        q.setdefault("clo", "AA 1")
        q.setdefault("difficulty", "medium")

    logger.info("Classified %d questions", len(mcq_questions))
    return {"mcq_questions": mcq_questions, "errors": errors}


# ── Node 6: Store ─────────────────────────────────────────────────────────────

def _node_store(state: ExerciseExtractionState) -> dict:
    """Store generated questions in QuestionBankQuestion, grouped via QuestionBankExercise."""
    from app import db
    from app.models.assessments import QuestionBankQuestion
    from app.models.pipeline import QuestionBankExercise

    mcq_questions = state.get("mcq_questions") or []
    errors: List[str] = list(state.get("errors") or [])
    course_id = state["course_id"]
    chapter_id = state.get("chapter_id")
    stored_count = 0

    if not mcq_questions:
        return {"stored_count": 0, "errors": errors}

    try:
        # Group questions by exercise_index to create QuestionBankExercise records
        exercise_groups: Dict[int, List[Dict]] = {}
        for q in mcq_questions:
            ex_idx = q.get("exercise_index", 0)
            exercise_groups.setdefault(ex_idx, []).append(q)

        for ex_idx, questions in exercise_groups.items():
            # Create a QuestionBankExercise for each group
            first_q = questions[0]
            q_chapter_id = first_q.get("chapter_id") or chapter_id

            exercise = QuestionBankExercise(
                course_id=course_id,
                chapter_id=q_chapter_id,
                title=f"Extracted Exercise {ex_idx + 1}",
                description=first_q.get("source_exercise_text", ""),
                exercise_type="consolidation",
                status="draft",
                aa_codes=list({q.get("clo", "AA 1") for q in questions}),
                bloom_levels=list({q.get("bloom_level", "understand") for q in questions}),
            )
            db.session.add(exercise)
            db.session.flush()  # Get exercise.id

            for order, q in enumerate(questions, start=1):
                correct = (q.get("correct_choice") or "A").upper()
                if correct not in ("A", "B", "C"):
                    correct = "A"

                qb = QuestionBankQuestion(
                    course_id=course_id,
                    chapter_id=q.get("chapter_id") or chapter_id,
                    question_text=q.get("question_text", ""),
                    choice_a=q.get("choice_a", ""),
                    choice_b=q.get("choice_b", ""),
                    choice_c=q.get("choice_c", ""),
                    correct_choice=correct,
                    explanation=q.get("explanation", ""),
                    question_type="mcq",
                    bloom_level=q.get("bloom_level", "understand"),
                    clo=q.get("clo", "AA 1"),
                    difficulty=q.get("difficulty", "medium"),
                    exercise_id=exercise.id,
                    exercise_order=order,
                    approved_at=None,
                )
                db.session.add(qb)
                stored_count += 1

        db.session.commit()
        logger.info("Stored %d questions in %d exercises for course %d",
                     stored_count, len(exercise_groups), course_id)

    except Exception as e:
        db.session.rollback()
        errors.append(f"Database storage failed: {e}")
        logger.exception("store node error")
        stored_count = 0

    return {"stored_count": stored_count, "errors": errors}


# ── Graph Builder ─────────────────────────────────────────────────────────────

def build_exercise_extractor_graph():
    """Build and compile the LangGraph StateGraph for exercise extraction."""
    g = StateGraph(ExerciseExtractionState)

    g.add_node("collect_documents", _node_collect_documents)
    g.add_node("extract_text", _node_extract_text)
    g.add_node("identify_exercises", _node_identify_exercises)
    g.add_node("generate_mcq", _node_generate_mcq)
    g.add_node("classify", _node_classify)
    g.add_node("store", _node_store)

    g.add_edge(START, "collect_documents")
    g.add_edge("collect_documents", "extract_text")
    g.add_edge("extract_text", "identify_exercises")
    g.add_edge("identify_exercises", "generate_mcq")
    g.add_edge("generate_mcq", "classify")
    g.add_edge("classify", "store")
    g.add_edge("store", END)

    return g.compile()


# ── Public API ────────────────────────────────────────────────────────────────

def run_exercise_extraction(
    course_id: int,
    user_id: int,
    chapter_id: Optional[int] = None,
) -> dict:
    """
    Run the full exercise extraction pipeline for a course.

    Returns a dict with keys: stored_count, exercises, errors.
    """
    graph = build_exercise_extractor_graph()

    initial_state: ExerciseExtractionState = {
        "course_id": course_id,
        "chapter_id": chapter_id,
        "user_id": user_id,
        "documents": None,
        "raw_texts": None,
        "exercises": None,
        "mcq_questions": None,
        "stored_count": 0,
        "errors": [],
    }

    logger.info("Starting exercise extraction for course=%d chapter=%s user=%d",
                course_id, chapter_id, user_id)

    result = graph.invoke(initial_state)

    logger.info("Exercise extraction completed: stored=%d errors=%d",
                result.get("stored_count", 0), len(result.get("errors", [])))

    return {
        "stored_count": result.get("stored_count", 0),
        "exercises": result.get("exercises") or [],
        "mcq_questions": result.get("mcq_questions") or [],
        "errors": result.get("errors", []),
    }
