import os
import json
import re
import requests
import unicodedata
from flask import current_app
from app.services.file_service import get_file_path, extract_text_from_file
from app.models import Chapter, Document, Course
from flask_login import current_user
from typing import List, Dict, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage


class RateLimitExceeded(Exception):
    """Raised when the upstream LLM provider returns a long Retry-After."""
    def __init__(self, retry_after_s: float | None = None, message: str | None = None):
        self.retry_after_s = retry_after_s
        super().__init__(message or "API rate limit exceeded")

# Import new document processing services
from app.services.vector_store import VectorStore
from app.services.document_processor import PDFProcessor
from app.services.summarizer import DocumentSummarizer
from app.services import document_manager

from app.services.evaluate_service import (
       extract_questions_from_text,
       classify_questions_clo,
       classify_questions_bloom,
       normalize_question_keys
   )

# ============================================
# NEW HELPER FUNCTION: Build Activity-Aware Prompt
# ============================================


# ============================================
# AI_SERVICE.PY - RAG-Enhanced generate_quiz_questions
# ============================================
def build_quiz_prompt(
    num_mcq, num_open, 
    week_content, clo_text, attachments_text,
    bloom_distribution, difficulty_distribution,
    language='en',
    theory_ratio: Optional[float] = None,
    focus: str = 'mixed'
):
    """
    Simple quiz generation prompt - REMPLACE build_activity_aware_prompt()
    
    Args:
        num_mcq: Number of MCQ questions
        num_open: Number of open-ended questions
        week_content: Week learning objectives and context
        clo_text: Formatted CLO descriptions
        attachments_text: RAG-retrieved course materials
        bloom_distribution: Dict with bloom percentages
        difficulty_distribution: Dict with difficulty percentages
        language: Language code (en, fr, ar)
    
    Returns:
        Formatted user prompt for the AI model
    """
    
    total = num_mcq + num_open

    # Defensive defaults: some callers (e.g., question bank) may not provide
    # bloom/difficulty distributions. We fall back to sane defaults instead of
    # crashing with NoneType.items().
    if not isinstance(bloom_distribution, dict) or not bloom_distribution:
        bloom_distribution = {
            'remember': 17,
            'understand': 25,
            'apply': 25,
            'analyze': 20,
            'evaluate': 8,
            'create': 5,
        }
    if not isinstance(difficulty_distribution, dict) or not difficulty_distribution:
        difficulty_distribution = {
            'easy': 33,
            'medium': 34,
            'hard': 33,
        }

    # Normalize totals to 100 when possible
    try:
        bsum = sum(float(v) for v in bloom_distribution.values())
        if bsum and bsum != 100:
            bloom_distribution = {k: round(float(v) * 100.0 / bsum, 1) for k, v in bloom_distribution.items()}
    except Exception:
        pass
    try:
        dsum = sum(float(v) for v in difficulty_distribution.values())
        if dsum and dsum != 100:
            difficulty_distribution = {k: round(float(v) * 100.0 / dsum, 1) for k, v in difficulty_distribution.items()}
    except Exception:
        pass

    bloom_text = "\n".join([
        f"- {level}: {pct}% (~{int(float(pct)/100*total)} q)"
        for level, pct in bloom_distribution.items()
    ])

    difficulty_text = "\n".join([
        f"- {level}: {pct}% (~{int(float(pct)/100*total)} q)"
        for level, pct in difficulty_distribution.items()
    ])
    
    focus = (focus or 'mixed').strip().lower()

    # Optional: steer the quiz to include both theoretical and practical questions.
    # We do NOT forbid definition-style questions; we ensure they don't dominate.
    theory_block = ""
    if theory_ratio is not None and focus == 'mixed':
        try:
            r = float(theory_ratio)
        except Exception:
            r = 0.3
        r = max(0.0, min(1.0, r))
        theory_n = max(1, int(round(total * r))) if total >= 3 else int(round(total * r))
        practice_n = max(0, total - theory_n)
        theory_block = f"""

**THEORY vs PRACTICE MIX (REQUIRED):**
- Theory questions: about **definitions, properties, recognition of correct statements**. Target ≈ {theory_n}/{total}.
- Practice questions: about **application, calculation, solving, choosing a method, finding an error**. Target ≈ {practice_n}/{total}.

Guidance:
- If the course is mathematical/scientific, practice questions MUST include symbolic or numeric examples (equations, expressions, transformations).
- Definition questions are allowed, but practical questions must dominate.
"""

    focus_block = ""
    if focus == 'theory':
        focus_block = """

**FOCUS (THEORY-ONLY):**
- Generate ONLY theory questions (definitions, properties, recognition of correct statements).
- Definitions are allowed.
- However, DO NOT create tautological MCQs where an option repeats the question wording.
- Prefer precise statements, formulas, conditions of applicability, and correct notation.
- Distractors must be plausible within the same chapter (common confusions, near-misses).
"""
    elif focus == 'practice':
        focus_block = """

**FOCUS (PRACTICE-ONLY):**
- Generate ONLY practical questions (application, calculation, solving, method-choice, error-detection).
- Each practical question MUST include at least one of:
  (a) a numeric example, (b) a symbolic expression/equation, (c) a transformation step, or (d) a short worked scenario.
- MCQ distractors must be derived from realistic mistakes (wrong index shift, missing term, sign error, wrong formula, etc.).
- Open-ended questions must require steps/method, not just restating a definition.
"""

    prompt = f"""Generate EXACTLY {num_mcq} MCQ + {num_open} open-ended = {total} total questions.{focus_block}{theory_block}

**COURSE MATERIALS:**
{attachments_text}

**CLOs (Course Learning Outcomes):**
{clo_text}

**CONTEXT:**
{week_content}

**MATH NOTATION & TEXT QUALITY (REQUIRED):**
- Keep the output in the SAME language as the course materials (preserve accents like é, è, à, ç if French).
- If the course is mathematical/scientific, write ALL mathematical expressions in **LaTeX** wrapped with `$...$` (inline) or `$$...$$` (display).
- Do NOT copy broken/garbled PDF glyphs (e.g., strange symbols or corrupted characters). Always rewrite using LaTeX commands:
  - Use `\\sum` for sums, `\\prod` for products, `\\le`/`\\ge` for ≤/≥, `\\in` for ∈, etc.
- Ensure formulas are readable and unambiguous.

**BLOOM DISTRIBUTION (REQUIRED - apply independently):**
{bloom_text}

**DIFFICULTY DISTRIBUTION (REQUIRED - apply independently):**
{difficulty_text}

**MCQ FORMAT:**
Each MCQ must have:
- question: The question text
- choice_a, choice_b, choice_c: Three answer options (all plausible, one correct)
- correct_choice: A, B, or C
- explanation: Why this answer is correct
- clo: Which CLO this tests (e.g., "CLO 1")
- bloom_level: Bloom's level (remember, understand, apply, analyze, evaluate, create)
- difficulty_level: easy, medium, or hard
- source_id: SRC1, SRC2, etc. (from materials above)
- source_page: Exact location (e.g., "Section 2.1")
- source_text: Direct quote from material (1-2 sentences)

**OPEN-ENDED FORMAT:**
Each open-ended question must have:
- question: The question text
- question_type: "open_ended"
- open_ended_type: short_answer, essay, explanation, problem_solving, description, or discussion
- model_answer: Expected/model answer
- evaluation_criteria: List of grading criteria
- grading_rubric: How to grade this answer
- clo: Which CLO this tests
- bloom_level: Bloom's level
- difficulty_level: easy, medium, or hard
- explanation: Grading guidance
- source_id: SRC1, SRC2, etc.
- source_page: Exact location
- source_text: Direct quote from material

**CRITICAL REQUIREMENTS:**
1. Generate EXACTLY {num_mcq} MCQ and {num_open} open-ended ({total} total) - NO MORE, NO LESS
2. Apply Bloom and Difficulty distributions independently (don't force exact match per question)
3. ALL questions must reference source materials (source_id, source_page, source_text REQUIRED)
4. NEVER use "N/A" for source fields - always provide actual references
5. source_page MUST include section/page number AND language
6. source_text MUST be direct quotes (1-2 sentences max) from provided context
7. Questions must be in SAME language as materials
8. Output MUST be valid, parseable JSON only
9. Each question must have ALL required fields

**OUTPUT: Valid JSON only**
{{
  "questions": [
    {{
      "question_type": "mcq",
      "question": "Question text here",
      "choice_a": "Option A",
      "choice_b": "Option B",
      "choice_c": "Option C",
      "correct_choice": "A",
      "clo": "CLO 1",
      "bloom_level": "understand",
      "difficulty_level": "medium",
      "explanation": "Why A is correct",
      "source_id": "SRC1",
      "source_page": "Section 2.1",
      "source_text": "Relevant quote from material"
    }},
    {{
      "question_type": "open_ended",
      "question": "Question text here",
      "open_ended_type": "explanation",
      "model_answer": "Expected answer",
      "evaluation_criteria": ["Criterion 1", "Criterion 2", "Criterion 3"],
      "grading_rubric": "How to score this",
      "clo": "CLO 2",
      "bloom_level": "apply",
      "difficulty_level": "medium",
      "explanation": "Grading guidance",
      "source_id": "SRC2",
      "source_page": "Section 3.2",
      "source_text": "Relevant quote from material"
    }}
  ]
}}

IMPORTANT: Return ONLY valid JSON. No extra text."""

    return prompt


def _is_practice_question(q: dict) -> bool:
    """Heuristic to decide if a question is practical/application-oriented.

    We keep it lightweight and language-agnostic where possible.
    """
    try:
        bloom = str(q.get('bloom_level', '')).lower()
        text = (q.get('question') or '').lower()

        # Practicality signals (language-agnostic where possible)
        has_math_or_code = bool(re.search(r"\d", text)) or any(ch in text for ch in ['=', '+', '-', '*', '/', '^', '(', ')', '≥', '≤', '{', '}', ';'])
        verbs = [
            # FR
            'calcule', 'calculer', 'résous', 'résoudre', 'simplifie', 'simplifier',
            'détermine', 'déterminer', 'applique', 'appliquer', 'factorise', 'factoriser',
            'développe', 'développer', 'trouve', 'trouver', 'montre', 'montrer',
            'étape', 'etape', 'erreur', 'corriger', 'justifie', 'justifier',
            # EN
            'compute', 'calculate', 'solve', 'simplify', 'apply', 'evaluate', 'debug',
            'find the error', 'where is the error', 'trace'
        ]
        has_action = any(v in text for v in verbs)

        # If Bloom suggests practice, we still REQUIRE at least one practice signal.
        if bloom in {'apply', 'analyze', 'evaluate', 'create'}:
            return has_math_or_code or has_action

        # For other Bloom levels, we allow practical questions when they contain signals.
        return has_math_or_code or has_action
    except Exception:
        return False


def _practice_ratio(questions: List[Dict]) -> float:
    if not questions:
        return 0.0
    p = sum(1 for q in questions if _is_practice_question(q))
    return p / max(1, len(questions))


def _looks_garbled_text(s: Optional[str]) -> bool:
    """Detect common mojibake / corrupted glyphs often produced by PDF extraction."""
    if not s:
        return False
    # Replacement char, mojibake, and a few frequent corrupt glyphs seen in logs/screenshots
    # Include common mojibake markers seen when UTF-8 text is decoded as latin-1/cp1252
    bad_chars = ['�', '¡', '£', 'Æ', 'Å', '¿', 'Ã', 'Â', 'â', '¤', '§', '¬', 'µ']
    if any(c in s for c in bad_chars):
        return True
    # Heuristic: standalone "X k=" / "Y k=" patterns used as broken Σ/Π
    if re.search(r"\b[XY]\s*k\s*=", s):
        return True
    return False


def _repair_questions_to_meet_practice(
    *,
    api_key: str,
    model: str,
    attachments_text: str,
    clos_text: str,
    week_content: str,
    questions: List[Dict],
    target_practice_ratio: float,
    max_fix: int = 6,
) -> List[Dict]:
    """Ask the model to rewrite a subset of questions to be more practical.

    Keeps the same schema; only rewrites low-practice questions.
    """
    current_ratio = _practice_ratio(questions)

    any_garbled = False
    for q in questions:
        fields = [
            q.get('question'), q.get('choice_a'), q.get('choice_b'), q.get('choice_c'),
            q.get('model_answer'), q.get('explanation')
        ]
        if any(_looks_garbled_text(x) for x in fields):
            any_garbled = True
            break

    # If we already meet practice ratio and there are no garbled glyphs, skip repair.
    if (current_ratio >= target_practice_ratio) and not any_garbled:
        return questions

    # Pick candidates that look too theoretical/generic OR contain garbled glyphs
    candidates = []
    for idx, q in enumerate(questions):
        if _looks_garbled_text(q.get('question')) or _looks_garbled_text(q.get('explanation')):
            candidates.append((idx, q))
            continue
        if any(_looks_garbled_text(q.get(k)) for k in ['choice_a','choice_b','choice_c','model_answer']):
            candidates.append((idx, q))
            continue
        if not _is_practice_question(q):
            candidates.append((idx, q))
    if not candidates:
        return questions

    deficit = int(round((target_practice_ratio - current_ratio) * len(questions)))
    # If the trigger is garbled text, still fix a few questions even if deficit <= 0.
    k = max(1, min(max_fix, max(deficit, 1 if any_garbled else 0), len(candidates)))
    to_fix = candidates[:k]

    # Build a compact rewrite request
    subset = []
    for idx, q in to_fix:
        subset.append({
            'index': idx,
            'question_type': q.get('question_type'),
            'question': q.get('question'),
            'choice_a': q.get('choice_a'),
            'choice_b': q.get('choice_b'),
            'choice_c': q.get('choice_c'),
            'correct_choice': q.get('correct_choice'),
            'open_ended_type': q.get('open_ended_type'),
            'model_answer': q.get('model_answer'),
            'evaluation_criteria': q.get('evaluation_criteria'),
            'grading_rubric': q.get('grading_rubric'),
            'clo': q.get('clo'),
            'bloom_level': q.get('bloom_level'),
            'difficulty_level': q.get('difficulty_level'),
            'source_id': q.get('source_id'),
            'source_page': q.get('source_page'),
            'source_text': q.get('source_text'),
        })

    repair_prompt = f"""You are improving quiz questions quality.

Task:
- Rewrite the provided questions to be MORE PRACTICAL and SPECIFIC to the course materials.
- Keep the SAME: index, question_type, clo, bloom_level, difficulty_level.
- For MCQ: keep exactly 3 options (A/B/C) and one correct_choice.
- For open_ended: keep open_ended_type and provide a better model_answer and criteria.
- Do NOT remove or rename fields.

Rules:
- Prefer application/calculation/method-choice/error-detection questions when the subject allows (math/science: include symbolic/numeric examples).
- You may keep a definition-style question if it is clearly tied to the provided materials, but make these rewrites practical whenever possible.
- Keep source_id/source_page/source_text consistent (do not fabricate new sources).

Math/text quality:
- If you see corrupted PDF glyphs (e.g., characters like "¡", "£", "Æ", or broken "X k=" patterns), rewrite the expression cleanly.
- For mathematical/scientific content, write ALL math in LaTeX wrapped in `$...$` or `$$...$$`.
- Use LaTeX commands (`\\sum`, `\\prod`, `\\le`, `\\ge`, `\\in`, etc.) instead of copying weird symbols.

- IMPORTANT: Fix any garbled/corrupted characters coming from PDF extraction.
  - Rewrite ALL mathematical notation in clean LaTeX wrapped in `$...$` or `$$...$$`.
  - Never output corrupted glyph sequences like "¡", "£", "Æ", or "X k=" used as a broken sum symbol.

COURSE MATERIALS (excerpts):
{attachments_text[:8000]}

CLO/AA list:
{clos_text}

Context:
{week_content[:1200]}

INPUT JSON:
{json.dumps({'questions_to_fix': subset}, ensure_ascii=False)}

OUTPUT: valid JSON only in this exact format:
{{"fixed": [ {{...question object with same fields...}} ]}}
"""

    try:
        llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0.4,
            max_tokens=2500,
            model_kwargs={"response_mime_type": "application/json"}
        )
        
        messages = [
            SystemMessage(content="You are a strict JSON editor for assessment questions."),
            HumanMessage(content=repair_prompt)
        ]
        
        resp = llm.invoke(messages)
        content = resp.content.strip()
        parsed = json.loads(content)
        fixed = parsed.get('fixed', [])
        if not isinstance(fixed, list) or not fixed:
            return questions

        # Apply fixes by index
        new_qs = list(questions)
        for fq in fixed:
            idx = fq.get('index')
            if isinstance(idx, int) and 0 <= idx < len(new_qs):
                fq.pop('index', None)
                # Keep original source fields if missing
                for k2 in ['source_id', 'source_page', 'source_text']:
                    if not fq.get(k2):
                        fq[k2] = new_qs[idx].get(k2)
                new_qs[idx] = fq
        return new_qs
    except Exception as e:
        current_app.logger.warning(f"Practice-repair step failed: {e}")
        return questions

def generate_quiz_questions(
    week_content: str,
    clos: list,
    attachments_texts: list,
    num_mcq: int = 8,
    num_open: int = 4,
    num_questions: int = None,
    difficulty: str = 'medium',
    attachments_metadata: list = None,
    clo_distribution: dict = None,
    bloom_distribution: dict = None,
    difficulty_distribution: dict = None,
    question_similarity: int = 40,
    variation_mode: str = 'standard',
    activity_patterns: dict = None,
    theory_ratio: Optional[float] = None,
    language: str = 'en'
) -> dict:
    """
    Generate high-quality quiz questions with TWO constraints:
    1. QUIZ SETUP: num_mcq, num_open, bloom_distribution, clo_distribution, difficulty_distribution
    2. ACTIVITY FILE: Inspire from question types, Bloom levels, CLOs in activity
    
    The AI will:
    - Generate EXACTLY num_mcq MCQ and num_open open-ended (from setup)
    - Use the SAME Bloom levels as activity when possible
    - Use the SAME CLOs as activity when possible
    - Use the SAME question types as activity
    
    Returns dict with:
    - 'questions': List of validated question dicts with activity alignment tracking
    - 'mcq_count': Number of MCQ questions generated
    - 'open_count': Number of open-ended questions generated
    - 'sources_used': List of source metadata
    """
    api_key = current_app.config.get('GOOGLE_API_KEY')
    if not api_key:
        raise ValueError("Google API key not configured")

    model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')

    # Handle backward compatibility
    if num_questions and not (num_mcq or num_open):
        num_mcq = num_questions
        num_open = 0
    
    total_questions = num_mcq + num_open
    
    if total_questions < 3:
        raise ValueError("Total questions must be at least 3")

    # Build CLO text from CLO list
    if clos:
        clo_text = "\n".join([
            f"CLO {c.get('CLO#', 'N/A')}: {c.get('CLO Description', c.get('Description', ''))[:150]}"
            for c in clos
        ])
    else:
        clo_text = "No CLOs provided."

    # ============================================
    # VECTOR STORE CONTEXT RETRIEVAL
    # ============================================
    
    attachments_text = ""
    sources_map = {}
    
    if attachments_texts and attachments_metadata:
        current_app.logger.info(f"🔍 VectorStore: Processing {len(attachments_texts)} documents")
        
        query_context = f"""
        {week_content}
        
        Learning Outcomes:
        {clo_text}
        """
        
        try:
            # Use VectorStore to retrieve relevant context
            all_context_parts = []
            
            for i, (text, meta) in enumerate(zip(attachments_texts, attachments_metadata)):
                source_id = f"SRC{i+1}"
                sources_map[source_id] = meta
                
                # Check if document is indexed in VectorStore
                doc_id = meta.get('document_id') or meta.get('id')
                if doc_id:
                    try:
                        vs = VectorStore(document_id=str(doc_id))
                        if vs.collection_exists():
                            # Document is indexed - use semantic search
                            context = vs.get_context_for_query(query_context, max_chars=3000)
                            if context:
                                all_context_parts.append(f"[{source_id}] {meta.get('title', 'Document')}\n{context}")
                                current_app.logger.info(f"✅ Retrieved context from VectorStore for doc {doc_id}")
                                continue
                    except Exception as e:
                        current_app.logger.warning(f"VectorStore search failed for doc {doc_id}: {e}")
                
                # Fallback: use raw text (truncated)
                truncated_text = text[:3500] if len(text) > 3500 else text
                source_type = meta.get('source_type', 'material')
                all_context_parts.append(f"[{source_id}] {meta.get('title', 'Doc')} ({source_type})\n{truncated_text}")
            
            attachments_text = "\n---\n".join(all_context_parts)[:12000]
            current_app.logger.info(f"✅ VectorStore: Prepared context from {len(sources_map)} sources")
            
        except Exception as e:
            current_app.logger.error(f"❌ VectorStore processing failed: {str(e)}")
            
            # Fallback to simple text truncation
            attachments_with_sources = []
            for i, (text, meta) in enumerate(zip(attachments_texts, attachments_metadata)):
                source_id = f"SRC{i+1}"
                sources_map[source_id] = meta
                truncated_text = text[:4000]
                source_type = meta.get('source_type', 'material')
                attachments_with_sources.append(f"""[{source_id}] {meta.get('title', 'Doc')} ({source_type})
{truncated_text}
---""")
            
            attachments_text = "\n".join(attachments_with_sources)[:12000]
    else:
        attachments_text = "No materials provided"
        current_app.logger.warning("⚠️  No attachments provided for quiz generation")

    # ============================================
    # BUILD SYSTEM PROMPT (UPDATED FOR ACTIVITY STYLE)
    # ============================================
    
    # If an "activity/exam style" was provided, we mimic its phrasing.
    # Otherwise, we focus on relevance and practicality grounded in the provided materials.
    if activity_patterns:
        system_prompt = f"""You are an expert educational assessment designer creating high-quality quiz questions.

CRITICAL: MATCH ACTIVITY FILE PHRASING AND STYLE

Your questions MUST:
1. Use the SAME question openers as the activity file
2. Use vocabulary from the activity file
3. Mimic the tone, language, and phrasing style
4. Reference the question EXAMPLES provided - learn their style!

CRITICAL REQUIREMENTS:
1. Generate EXACTLY {num_mcq} MCQ + {num_open} Open-Ended = {total_questions} total questions
2. Apply CLO, Bloom, and Difficulty distributions INDEPENDENTLY
3. Similarity: {question_similarity}% | Variation Mode: {variation_mode}

QUALITY:
- Questions must be aligned with the learning outcomes and the provided course materials.
- Avoid low-quality distractors; make wrong answers plausible.
- Include practical questions when the subject allows it (e.g., math/science: equations, calculations, transformations).

SOURCE REQUIREMENTS:
- source_id: MUST be SRC1, SRC2, SRC3, etc.
- source_page: MUST specify exact location
- source_text: MUST be 1-2 sentence direct quote
- NEVER use "N/A""" 
    else:
        system_prompt = f"""You are an expert educational assessment designer creating high-quality quiz questions.

GOAL:
- Create questions that are **relevant, aligned, and logical** for the specific course content.
- Use the provided materials as the ONLY source of truth; do not invent content.

QUALITY RULES:
- Definitions/theory questions are allowed, but the quiz must also include practical/application questions when the subject allows it.
- For math/science/engineering: include computations, equations, transformations, method-choice, and error-detection questions.
- MCQ distractors must be plausible (common misconceptions, close alternatives).

CRITICAL REQUIREMENTS:
1. Generate EXACTLY {num_mcq} MCQ + {num_open} Open-Ended = {total_questions} total questions
2. Apply CLO, Bloom, and Difficulty distributions INDEPENDENTLY
3. Similarity: {question_similarity}% | Variation Mode: {variation_mode}

SOURCE REQUIREMENTS:
- source_id: MUST be SRC1, SRC2, SRC3, etc.
- source_page: MUST specify exact location
- source_text: MUST be 1-2 sentence direct quote
- NEVER use "N/A"""

    # ============================================
    # BUILD USER PROMPT USING NEW FUNCTION
    # ============================================
    
    # Language is passed as parameter (defaults to 'en' if not specified)
    current_app.logger.info(f"Generating quiz in language: {language}")
    
    def _call_gemini_json(user_prompt_local: str) -> dict:
        """Call Gemini chat completions expecting JSON object."""
        
        max_retries = 2
        retry_delay = 2
        attempt = 0

        while attempt < max_retries:
            try:
                llm = ChatGoogleGenerativeAI(
                    model=model,
                    google_api_key=api_key,
                    temperature=0.7,
                    max_tokens=6000,
                    model_kwargs={"response_mime_type": "application/json"}
                )
                
                messages = [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_prompt_local)
                ]
                
                resp = llm.invoke(messages)
                raw = resp.content.strip()
                
                def _fix_json_escapes(s: str) -> str:
                    """Fix invalid JSON backslash escapes from LLM output."""
                    import re
                    # Replace invalid \X escapes but preserve valid ones: \\ \" \/ \b \f \n \r \t \uXXXX
                    return re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', s)

                try:
                    return json.loads(raw)
                except json.JSONDecodeError:
                    # Clean markdown code blocks if present
                    raw = raw.replace('```json', '').replace('```', '').strip()
                    try:
                        return json.loads(raw)
                    except json.JSONDecodeError:
                        raw = _fix_json_escapes(raw)
                        return json.loads(raw)
                    
            except Exception as e:
                current_app.logger.error(f"Gemini API attempt {attempt+1} failed: {str(e)}")
                attempt += 1
                import time
                time.sleep(retry_delay)

        raise ValueError("Failed to call AI after multiple attempts")

    def _normalize_text(s: str) -> str:
        s = (s or "").lower()
        s = re.sub(r"\s+", " ", s)
        s = re.sub(r"[^\w\sàâäçéèêëîïôöùûüÿœæ]", "", s, flags=re.UNICODE)
        return s.strip()

    # ----------------------------
    # Math/Text Cleanup Helpers
    # ----------------------------
    # Some PDFs yield mojibake like: "n X kÆ1 (k^2)" instead of "\sum_{k=1}^{n} (k^2)".
    # We normalize a few common patterns to LaTeX so KaTeX can render correctly.
    _SUM_RE = re.compile(r"(?P<up>[A-Za-z0-9]+)\s*X\s*(?P<var>[A-Za-z])\s*=?\s*(?P<low>-?\d+|[A-Za-z0-9]+)")
    _PROD_RE = re.compile(r"(?P<up>[A-Za-z0-9]+)\s*Y\s*(?P<var>[A-Za-z])\s*=?\s*(?P<low>-?\d+|[A-Za-z0-9]+)")

    def _clean_mojibake_math(text: str) -> str:
        t = text or ""
        # Unicode normalize (fixes many accent issues)
        t = unicodedata.normalize("NFC", t)

        # Try to undo classic mojibake when UTF-8 was decoded as latin-1/cp1252.
        # Example: "Ã©" -> "é", "âˆ‘" -> "∑" (and then we convert to LaTeX).
        if any(c in t for c in ("Ã", "Â", "â", "Å", "¿")):
            try:
                t2 = t.encode("latin1").decode("utf-8")
                # Prefer the decoded version if it reduces garbled markers.
                if _looks_garbled_text(t) and not _looks_garbled_text(t2):
                    t = t2
                elif len(re.findall(r"[ÃÂâÅ¿Æ£¡]", t2)) < len(re.findall(r"[ÃÂâÅ¿Æ£¡]", t)):
                    t = t2
            except Exception:
                pass

        # Replace common mojibake separators for equality in indices
        # Example: kÆ1 -> k=1
        t = re.sub(r"([A-Za-z])Æ(\d)", r"\1=\2", t)
        t = re.sub(r"([A-Za-z])£(\d)", r"\1=\2", t)

        # Common mojibake for superscripts (e.g., k¿2 intended as k^2)
        t = re.sub(r"¿(\d+)", r"^\1", t)

        # Fix missing backslash in common LaTeX commands produced by models
        t = re.sub(r"(?<!\\)rac\s*\{", r"\\frac{", t)
        t = re.sub(r"(?<!\\)frac\s*\{", r"\\frac{", t)
        t = re.sub(r"(?<!\\)ln\b", r"\\ln", t)

        # Convert some recovered unicode math symbols into LaTeX commands
        t = t.replace("∑", "\\sum")
        t = t.replace("Π", "\\prod")
        t = t.replace("≤", "\\le")
        t = t.replace("≥", "\\ge")
        t = t.replace("∈", "\\in")

        # Convert "qX k=p" or "n X k=1" style sums into LaTeX \sum_{k=p}^{q}
        def _sum_repl(m):
            up = m.group('up')
            var = m.group('var')
            low = m.group('low')
            return f"\\sum_{{{var}={low}}}^{{{up}}}"
        t = _SUM_RE.sub(_sum_repl, t)

        # Convert products similarly (Y used as product sign in some extractions)
        def _prod_repl(m):
            up = m.group('up')
            var = m.group('var')
            low = m.group('low')
            return f"\\prod_{{{var}={low}}}^{{{up}}}"
        t = _PROD_RE.sub(_prod_repl, t)

        return t

    def _is_tautological_mcq(q: dict) -> bool:
        question_n = _normalize_text(q.get('question', ''))
        if not question_n:
            return True
        choices = [q.get('choice_a', ''), q.get('choice_b', ''), q.get('choice_c', '')]
        for c in choices:
            c_n = _normalize_text(c)
            if not c_n:
                return True
            # identical or very close to question wording
            if c_n == question_n:
                return True
            # if the choice is basically the question repeated (high overlap)
            if len(c_n) > 20 and (c_n in question_n or question_n in c_n):
                return True
        return False

    PRACTICE_KEYWORDS = {
        # FR
        'calculez', 'calculer', 'résoudre', 'resoudre', 'simplifier', 'déterminer', 'determiner',
        'appliquer', 'appliquez', 'montrer', 'démontrer', 'demontrez', 'trouver', 'factoriser',
        'développer', 'developper', 'évaluer', 'evaluer', 'identifier l\'erreur', 'erreur',
        # EN
        'compute', 'calculate', 'solve', 'simplify', 'derive', 'evaluate', 'find the error',
        'factor', 'expand', 'apply'
    }

    def _looks_practical(qtext: str) -> bool:
        t = (qtext or '').lower()
        if any(k in t for k in PRACTICE_KEYWORDS):
            return True
        # math/code symbols
        if re.search(r"[0-9]|\+|\-|\*|/|=|\^|\(|\)|\[|\]|\\sum|\\prod|\bΣ\b|\bΠ\b", qtext or ""):
            return True
        return False

    def _split_counts(total_n: int, mcq_n: int, open_n: int, ratio: float):
        r = max(0.0, min(1.0, float(ratio)))
        theory_total = max(1, int(round(total_n * r))) if total_n >= 3 else int(round(total_n * r))
        theory_open = min(open_n, max(0, int(round(open_n * r))))
        theory_mcq = min(mcq_n, max(0, theory_total - theory_open))
        # adjust if we under-allocated
        theory_total = theory_mcq + theory_open
        practice_mcq = mcq_n - theory_mcq
        practice_open = open_n - theory_open
        return theory_mcq, theory_open, practice_mcq, practice_open

    def _fallback_generate_questions(n_mcq: int, n_open: int) -> List[Dict]:
        """Local, no-API fallback when the LLM provider is rate limited.

        It produces *relevant-enough* questions by sampling lines from the retrieved
        RAG context (attachments_text). This keeps the UX responsive instead of
        forcing multi-minute waits.
        """
        import random

        def _candidate_lines(text: str) -> List[str]:
            lines = []
            for raw in (text or "").splitlines():
                s = raw.strip()
                # Skip very short/very long lines and obvious boilerplate
                if len(s) < 40 or len(s) > 220:
                    continue
                if s.lower().startswith("source"):
                    continue
                lines.append(s)
            # De-duplicate while preserving order
            seen = set()
            out = []
            for s in lines:
                k = _normalize_text(s)
                if k and k not in seen:
                    seen.add(k)
                    out.append(s)
            return out

        pool = _candidate_lines(attachments_text) or _candidate_lines(week_content)
        if not pool:
            pool = ["Contenu du cours indisponible."]

        # Determine available source IDs from attachments metadata
        source_ids = []
        try:
            for m in (attachments_metadata or []):
                sid = m.get('source_id') if isinstance(m, dict) else None
                if sid:
                    source_ids.append(str(sid))
        except Exception:
            source_ids = []
        if not source_ids:
            source_ids = ['SRC1']

        # Extract a small vocabulary for distractors
        words = []
        for s in pool[:80]:
            for w in re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]{4,}", s):
                lw = w.lower()
                if lw not in ('dans', 'avec', 'pour', 'plus', 'moins', 'ainsi', 'donc', 'comme', 'cette', 'celles', 'leurs'):
                    words.append(w)

        def _make_mcq(i: int) -> Dict:
            base = random.choice(pool)
            # Pick a key word to blank
            tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]{4,}", base)
            key = max(tokens, key=len) if tokens else (random.choice(words) if words else "terme")
            stem = base.replace(key, "____", 1)
            distractors = [w for w in random.sample(words, min(10, len(words))) if w != key]
            while len(distractors) < 2:
                distractors.append("option")
            a, b = distractors[0], distractors[1]
            c = key
            choices = [a, b, c]
            random.shuffle(choices)
            correct = ['A', 'B', 'C'][choices.index(key)]
            return {
                'question': f"Compléter l'énoncé : {stem}",
                'question_type': 'mcq',
                'clo': format_clo_number(clos[0].get('CLO#', 'AA 1') if clos else 'AA 1'),
                'bloom_level': 'apply',
                'difficulty_level': 'medium',
                'choice_a': choices[0],
                'choice_b': choices[1],
                'choice_c': choices[2],
                'correct_choice': correct,
                'explanation': "Réponse basée sur un extrait du cours.",
                'source_id': source_ids[0],
                'source_page': 'Extrait du document',
                'source_text': base
            }

        def _make_open(i: int) -> Dict:
            base = random.choice(pool)
            return {
                'question': f"Expliquez brièvement (en vous appuyant sur le cours) : {base}",
                'question_type': 'open_ended',
                'clo': format_clo_number(clos[0].get('CLO#', 'AA 1') if clos else 'AA 1'),
                'bloom_level': 'understand',
                'difficulty_level': 'medium',
                'open_ended_type': 'explanation',
                'model_answer': "Réponse attendue : reformulation de l'extrait et justification.",
                'evaluation_criteria': ["Exactitude", "Clarté", "Lien explicite avec l'extrait"],
                'grading_rubric': "0-2: incomplet; 3-4: correct; 5: excellent.",
                'explanation': "Réponse basée sur un extrait du cours.",
                'source_id': source_ids[0],
                'source_page': 'Extrait du document',
                'source_text': base
            }

        out = []
        for i in range(n_mcq):
            out.append(_make_mcq(i))
        for i in range(n_open):
            out.append(_make_open(i))
        random.shuffle(out)
        return out

    try:
        current_app.logger.info(f"🤖 Sending request(s) to AI")
        current_app.logger.info(f"📊 Setup: {num_mcq} MCQ + {num_open} Open-Ended")
        current_app.logger.info(f"🎯 Activity: {activity_patterns.get('questions_count', 0) if activity_patterns else 0} questions")

        questions = []

        # Split generation into THEORY + PRACTICE when we have a theory_ratio and no strict activity-style constraint.
        do_split = (theory_ratio is not None) and (not activity_patterns) and (total_questions >= 6)

        if do_split:
            t_mcq, t_open, p_mcq, p_open = _split_counts(total_questions, num_mcq, num_open, float(theory_ratio))
            current_app.logger.info(f"🧩 Split gen: theory={t_mcq}mcq/{t_open}open, practice={p_mcq}mcq/{p_open}open")

            if t_mcq + t_open > 0:
                prompt_theory = build_quiz_prompt(
                    num_mcq=t_mcq,
                    num_open=t_open,
                    week_content=week_content,
                    clo_text=clo_text,
                    attachments_text=attachments_text,
                    bloom_distribution=bloom_distribution,
                    difficulty_distribution=difficulty_distribution,
                    language=language,
                    theory_ratio=None,
                    focus='theory'
                )
                current_app.logger.info(f"✓ Theory prompt built ({len(prompt_theory)} chars)")
                try:
                    parsed_theory = _call_gemini_json(prompt_theory)
                    questions.extend(parsed_theory.get('questions', []))
                except Exception:
                    current_app.logger.warning("⚠️  Split generation failed/rate-limited; using local fallback")
                    questions.extend(_fallback_generate_questions(t_mcq, t_open))

            if p_mcq + p_open > 0:
                prompt_practice = build_quiz_prompt(
                    num_mcq=p_mcq,
                    num_open=p_open,
                    week_content=week_content,
                    clo_text=clo_text,
                    attachments_text=attachments_text,
                    bloom_distribution=bloom_distribution,
                    difficulty_distribution=difficulty_distribution,
                    language=language,
                    theory_ratio=None,
                    focus='practice'
                )
                current_app.logger.info(f"✓ Practice prompt built ({len(prompt_practice)} chars)")
                try:
                    parsed_practice = _call_gemini_json(prompt_practice)
                    questions.extend(parsed_practice.get('questions', []))
                except Exception:
                    current_app.logger.warning("⚠️  Split generation failed/rate-limited; using local fallback")
                    questions.extend(_fallback_generate_questions(p_mcq, p_open))
        else:
            user_prompt = build_quiz_prompt(
                num_mcq=num_mcq,
                num_open=num_open,
                week_content=week_content,
                clo_text=clo_text,
                attachments_text=attachments_text,
                bloom_distribution=bloom_distribution,
                difficulty_distribution=difficulty_distribution,
                language=language,
                theory_ratio=theory_ratio,
                focus='mixed'
            )
            current_app.logger.info(f"✓ Prompt built ({len(user_prompt)} chars)")
            try:
                parsed = _call_gemini_json(user_prompt)
                questions = parsed.get('questions', [])
            except Exception:
                current_app.logger.warning("⚠️  Generation failed/rate-limited; using local fallback")
                questions = _fallback_generate_questions(num_mcq, num_open)

        if len(questions) < 3:
            raise ValueError(f"Only {len(questions)} questions generated, minimum 3 required")

        current_app.logger.info(f"✅ AI returned {len(questions)} questions")

        # ============================================
        # SCORE EACH QUESTION FOR ACTIVITY ALIGNMENT
        # ============================================
        
        validated_questions = []
        mcq_count = 0
        open_count = 0

        for q in questions:
            question_type = q.get('question_type', 'mcq').lower()

            # Clean common mojibake / missing-LaTeX issues in math-heavy text (PDF extraction artifacts)
            # This improves rendering with KaTeX and fixes broken symbols like "n X kÆ1".
            q_question = _clean_mojibake_math(q.get('question', ''))
            q_expl = _clean_mojibake_math(q.get('explanation', ''))
            
            if not q_question or len(q_question) < 10:
                current_app.logger.warning(f"⚠️  Skipping question: invalid or missing text")
                continue
            
            # Build base validated question
            validated_q = {
                'question': q_question.strip(),
                'question_type': question_type,
                'clo': format_clo_number(q.get('clo', clos[0].get('CLO#', 'CLO 1') if clos else 'CLO 1')),
                'bloom_level': q.get('bloom_level', 'understand').lower(),
                'difficulty_level': q.get('difficulty_level', 'medium').lower(),
                'explanation': (q_expl or 'Based on course materials').strip(),
                'source_id': q.get('source_id', 'SRC1').strip(),
                'source_page': q.get('source_page', 'Section 1').strip(),
                'source_text': q.get('source_text', 'Reference material').strip()
            }
            
            # Validate Bloom, Difficulty, and Source fields
            if validated_q['bloom_level'] not in ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']:
                validated_q['bloom_level'] = 'understand'
            if validated_q['difficulty_level'] not in ['easy', 'medium', 'hard']:
                validated_q['difficulty_level'] = 'medium'
            if validated_q['source_id'] == 'N/A' or not validated_q['source_id']:
                validated_q['source_id'] = 'SRC1'
            if validated_q['source_page'] == 'N/A' or not validated_q['source_page']:
                validated_q['source_page'] = 'Section 1'
            if validated_q['source_text'] == 'N/A' or not validated_q['source_text']:
                validated_q['source_text'] = 'Reference material'
            
            # ============================================
            # SCORE ACTIVITY ALIGNMENT (STRUCTURAL)
            # ============================================
            
            if activity_patterns and activity_patterns.get('questions_count', 0) > 0:
                is_inspired, score, details = score_question_activity_alignment(validated_q, activity_patterns)
                validated_q['_activity_inspired'] = is_inspired
                validated_q['_activity_alignment_score'] = score
                validated_q['_activity_alignment_details'] = details
            else:
                validated_q['_activity_inspired'] = False
                validated_q['_activity_alignment_score'] = 0
                validated_q['_activity_alignment_details'] = "No activity file"
            
            # ============================================
            # MCQ VALIDATION
            # ============================================
            
            if question_type == 'mcq':
                if not all(k in q for k in ['choice_a', 'choice_b', 'choice_c', 'correct_choice']):
                    current_app.logger.warning(f"⚠️  Skipping MCQ: missing choice fields")
                    continue
                
                validated_q['choice_a'] = _clean_mojibake_math(q.get('choice_a', '')).strip()
                validated_q['choice_b'] = _clean_mojibake_math(q.get('choice_b', '')).strip()
                validated_q['choice_c'] = _clean_mojibake_math(q.get('choice_c', '')).strip()
                validated_q['correct_choice'] = str(q['correct_choice']).upper().strip()
                
                if not all([validated_q['choice_a'], validated_q['choice_b'], validated_q['choice_c']]):
                    current_app.logger.warning(f"⚠️  Skipping MCQ: empty choices")
                    continue
                
                if validated_q['correct_choice'] not in ['A', 'B', 'C']:
                    validated_q['correct_choice'] = 'A'

                # Quality guard: reject tautological MCQs (e.g., correct option repeats the question)
                if _is_tautological_mcq({
                    'question': validated_q.get('question', ''),
                    'choice_a': validated_q.get('choice_a', ''),
                    'choice_b': validated_q.get('choice_b', ''),
                    'choice_c': validated_q.get('choice_c', ''),
                }):
                    current_app.logger.warning("⚠️  Skipping MCQ: tautological/low-quality options")
                    continue
                
                mcq_count += 1
            
            # ============================================
            # OPEN-ENDED VALIDATION
            # ============================================
            
            elif question_type == 'open_ended':
                if not q.get('model_answer') or len(q.get('model_answer', '')) < 10:
                    current_app.logger.warning(f"⚠️  Skipping open-ended: missing or short model answer")
                    continue
                
                bloom_level = validated_q['bloom_level']
                suggested_type = get_open_ended_type_for_bloom(bloom_level)
                open_ended_type = q.get('open_ended_type', suggested_type).lower()
                valid_types = ['short_answer', 'essay', 'code_correction', 'explanation', 'problem_solving', 'description', 'discussion']
                
                if open_ended_type not in valid_types:
                    open_ended_type = suggested_type
                
                validated_q['open_ended_type'] = open_ended_type
                validated_q['model_answer'] = _clean_mojibake_math(q.get('model_answer', '')).strip()
                validated_q['evaluation_criteria'] = q.get('evaluation_criteria', ['Check understanding of key concepts'])
                
                if isinstance(validated_q['evaluation_criteria'], str):
                    validated_q['evaluation_criteria'] = [validated_q['evaluation_criteria']]
                
                validated_q['evaluation_criteria'] = [c.strip() for c in validated_q['evaluation_criteria'] if c.strip()]
                
                if not validated_q['evaluation_criteria']:
                    validated_q['evaluation_criteria'] = ['Assess based on model answer']
                
                validated_q['grading_rubric'] = q.get('grading_rubric', 'Assess based on model answer').strip()
                
                open_count += 1
            
            else:
                current_app.logger.warning(f"⚠️  Skipping question: unknown type '{question_type}'")
                continue
            
            if not validated_q.get('question') or not validated_q.get('question_type'):
                current_app.logger.warning(f"⚠️  Skipping question: missing required fields")
                continue
            
            validated_questions.append(validated_q)

        # ============================================
        # Enforce requested counts (MCQ/Open) and top-up if needed
        # ============================================

        mcqs = [q for q in validated_questions if q.get('question_type') == 'mcq']
        opens = [q for q in validated_questions if q.get('question_type') == 'open_ended']

        mcqs = mcqs[:num_mcq]
        opens = opens[:num_open]

        missing_mcq = max(0, num_mcq - len(mcqs))
        missing_open = max(0, num_open - len(opens))

        if missing_mcq or missing_open:
            current_app.logger.warning(
                f"⚠️  Not enough validated questions (missing: {missing_mcq} MCQ, {missing_open} Open). Topping up..."
            )
            # Try a quick additional call to the provider (short retry); if still limited, use local fallback.
            try:
                topup_prompt = build_quiz_prompt(
                    num_mcq=missing_mcq,
                    num_open=missing_open,
                    week_content=week_content,
                    clo_text=clo_text,
                    attachments_text=attachments_text,
                    bloom_distribution=bloom_distribution,
                    difficulty_distribution=difficulty_distribution,
                    language=language,
                    theory_ratio=None,
                    focus='mixed'
                )
                parsed_topup = _call_gemini_json(topup_prompt)
                topup_raw = parsed_topup.get('questions', [])
            except Exception:
                topup_raw = _fallback_generate_questions(missing_mcq, missing_open)

            # Validate the top-up questions with the same pipeline (simpler: reuse existing loop logic by recursion)
            for q in topup_raw:
                question_type = (q.get('question_type', 'mcq') or 'mcq').lower()
                q_question = _clean_mojibake_math(q.get('question', ''))
                if not q_question or len(q_question) < 10:
                    continue
                validated_q = {
                    'question': q_question.strip(),
                    'question_type': question_type,
                    'clo': format_clo_number(q.get('clo', clos[0].get('CLO#', 'AA 1') if clos else 'AA 1')),
                    'bloom_level': (q.get('bloom_level', 'understand') or 'understand').lower(),
                    'difficulty_level': (q.get('difficulty_level', 'medium') or 'medium').lower(),
                    'explanation': (_clean_mojibake_math(q.get('explanation', '')) or 'Based on course materials').strip(),
                    'source_id': (q.get('source_id', 'SRC1') or 'SRC1').strip(),
                    'source_page': (q.get('source_page', 'Extrait') or 'Extrait').strip(),
                    'source_text': (q.get('source_text', '') or 'Reference material').strip()
                }
                if question_type == 'mcq' and missing_mcq:
                    if not all(k in q for k in ['choice_a', 'choice_b', 'choice_c', 'correct_choice']):
                        continue
                    validated_q['choice_a'] = _clean_mojibake_math(q.get('choice_a', '')).strip()
                    validated_q['choice_b'] = _clean_mojibake_math(q.get('choice_b', '')).strip()
                    validated_q['choice_c'] = _clean_mojibake_math(q.get('choice_c', '')).strip()
                    validated_q['correct_choice'] = str(q.get('correct_choice', 'A')).upper().strip()
                    if validated_q['correct_choice'] not in ['A', 'B', 'C']:
                        validated_q['correct_choice'] = 'A'
                    if _is_tautological_mcq(validated_q):
                        continue
                    mcqs.append(validated_q)
                    missing_mcq -= 1
                elif question_type == 'open_ended' and missing_open:
                    if not q.get('model_answer') or len(q.get('model_answer', '')) < 10:
                        continue
                    validated_q['open_ended_type'] = (q.get('open_ended_type') or get_open_ended_type_for_bloom(validated_q['bloom_level'])).lower()
                    validated_q['model_answer'] = _clean_mojibake_math(q.get('model_answer', '')).strip()
                    validated_q['evaluation_criteria'] = q.get('evaluation_criteria', ['Assess based on model answer'])
                    if isinstance(validated_q['evaluation_criteria'], str):
                        validated_q['evaluation_criteria'] = [validated_q['evaluation_criteria']]
                    validated_q['grading_rubric'] = (q.get('grading_rubric') or 'Assess based on model answer').strip()
                    opens.append(validated_q)
                    missing_open -= 1
                if missing_mcq <= 0 and missing_open <= 0:
                    break

        # Final list in a deterministic order: MCQ first, then Open (as in BGA)
        validated_questions = mcqs[:num_mcq] + opens[:num_open]
        mcq_count = len(mcqs[:num_mcq])
        open_count = len(opens[:num_open])

        # ============================================
        # OPTIONAL QUALITY PASS: ensure practical coverage
        # ============================================

        if theory_ratio is not None:
            try:
                target_practice = max(0.0, min(1.0, 1.0 - float(theory_ratio)))
            except Exception:
                target_practice = 0.7

            current_app.logger.info(
                f"Practice ratio before repair: {_practice_ratio(validated_questions):.2f} (target ≥ {target_practice:.2f})"
            )

            # Only run a repair call if we are clearly below target (saves tokens/time)
            if _practice_ratio(validated_questions) + 0.10 < target_practice:
                validated_questions = _repair_questions_to_meet_practice(
                    api_key=api_key,
                    model=model,
                    attachments_text=attachments_text,
                    clos_text=clo_text,
                    week_content=week_content,
                    questions=validated_questions,
                    target_practice_ratio=target_practice,
                )
                current_app.logger.info(
                    f"Practice ratio after repair: {_practice_ratio(validated_questions):.2f}"
                )

        # ============================================
        # LOG COMPLIANCE
        # ============================================
        
        bloom_counts = {}
        difficulty_counts = {}
        clo_counts = {}
        activity_inspired_count = 0
        
        for q in validated_questions:
            bloom_counts[q['bloom_level']] = bloom_counts.get(q['bloom_level'], 0) + 1
            difficulty_counts[q['difficulty_level']] = difficulty_counts.get(q['difficulty_level'], 0) + 1
            clo_counts[q['clo']] = clo_counts.get(q['clo'], 0) + 1
            if q.get('_activity_inspired'):
                activity_inspired_count += 1
        
        current_app.logger.info(f"✅ Generated {len(validated_questions)} questions ({mcq_count} MCQ, {open_count} open-ended)")
        current_app.logger.info(f"📊 Bloom: {bloom_counts}")
        current_app.logger.info(f"📊 Difficulty: {difficulty_counts}")
        current_app.logger.info(f"📊 CLO: {clo_counts}")
        current_app.logger.info(f"🎯 Activity-Aligned: {activity_inspired_count}/{len(validated_questions)} questions")
        
        return {
            'questions': validated_questions,
            'sources_used': list(sources_map.values()),
            'mcq_count': mcq_count,
            'open_count': open_count
        }

    except Exception as e:
        current_app.logger.error(f"❌ Error generating questions: {str(e)}")
        import traceback
        current_app.logger.error(traceback.format_exc())
        
        # Provide specific error messages
        error_msg = str(e)
        if "429" in error_msg or "rate limit" in error_msg.lower():
            raise ValueError("API rate limit exceeded. Please wait a few minutes before trying again.")
        elif "timeout" in error_msg.lower():
            raise ValueError("Request timed out. Please try again with fewer questions or smaller materials.")
        elif "connection" in error_msg.lower():
            raise ValueError("Connection error. Please check your internet and try again.")
        else:
            raise ValueError(f"Failed to generate questions: {str(e)}")

# ============================================
# HELPER FUNCTIONS FOR AI SERVICE
# ============================================

def get_open_ended_type_for_bloom(bloom_level: str) -> str:
    """Map Bloom's taxonomy level to appropriate open-ended question type"""
    mapping = {
        'remember': 'short_answer',
        'understand': 'explanation',
        'apply': 'problem_solving',
        'analyze': 'description',
        'evaluate': 'explanation',
        'create': 'discussion'
    }
    return mapping.get(bloom_level, 'short_answer')


def build_variation_prompt(variation_mode: str) -> str:
    """Build variation-specific guidance for AI prompt"""
    
    if variation_mode == 'high':
        return """VARIATION STRATEGY (High Diversity):
For questions on the same topic:
- Vary question structure (direct vs. scenario-based)
- Use different key terms and contexts
- Mix question types and approaches
- Ensure unique phrasing for each question
EXAMPLE: Instead of "Define X" and "What is X?", ask "How does X apply to Y?" and "Compare X and Z"."""
    
    elif variation_mode == 'focused':
        return """VARIATION STRATEGY (Focused):
- Questions closely tied to specific material passages
- Use consistent terminology from source materials
- Direct connection to provided content
- Minimal reformulation or variation
EXAMPLE: Quote or closely paraphrase material when forming questions."""
    
    else:
        return """VARIATION STRATEGY (Standard):
- Mix direct and reformulated questions
- Natural variation in phrasing
- Balance between recall and synthesis
- Diverse but coherent question set
EXAMPLE: Mix "What is X?", "How does X relate to Y?", and "Apply X to scenario Z"."""


def get_similarity_description(similarity: int) -> str:
    """Get description for similarity percentage"""
    if similarity <= 20:
        return "Highly original - minimal material copying"
    elif similarity <= 40:
        return "Moderate originality - good balance"
    elif similarity <= 60:
        return "Material-focused - questions use content context"
    elif similarity <= 80:
        return "Content-aligned - questions closely match materials"
    else:
        return "Maximum alignment - direct material usage acceptable"


def get_variation_description(mode: str) -> str:
    """Get description for variation mode"""
    modes = {
        'standard': 'Mix question types and approaches naturally',
        'high': 'Maximize variation in phrasing and structure',
        'focused': 'Align closely with provided material'
    }
    return modes.get(mode, 'Standard mode applied')


def format_clo_distribution(clo_dist):
    """Format CLO distribution"""
    if not clo_dist:
        return "Distribute evenly across all CLOs"
    return "\n".join([f"- {clo}: {count} question(s)" for clo, count in clo_dist.items()])


def format_bloom_distribution(bloom_dist):
    """Format Bloom distribution"""
    if not bloom_dist:
        return "Distribute evenly across Bloom levels"
    return "\n".join([f"- {level.capitalize()}: {count} question(s)" for level, count in bloom_dist.items()])


def format_difficulty_distribution(diff_dist):
    """Format difficulty distribution"""
    if not diff_dist:
        return "Distribute evenly: 33% easy, 34% medium, 33% hard"
    return "\n".join([f"- {level.capitalize()}: {count} question(s)" for level, count in diff_dist.items()])


def calculate_question_distribution(num_questions, clo_dist, bloom_dist, difficulty_dist):
    """Calculate exact distribution per attribute"""
    distribution = {'clo': {}, 'bloom': {}, 'difficulty': {}}
    
    # CLO distribution
    for clo, percentage in clo_dist.items():
        count = round((percentage / 100) * num_questions)
        distribution['clo'][clo] = count
    
    if distribution['clo']:
        clo_total = sum(distribution['clo'].values())
        if clo_total != num_questions:
            max_clo = max(distribution['clo'], key=distribution['clo'].get)
            distribution['clo'][max_clo] += (num_questions - clo_total)
    
    # Bloom distribution
    for level, percentage in bloom_dist.items():
        count = round((percentage / 100) * num_questions)
        distribution['bloom'][level] = count
    
    if distribution['bloom']:
        bloom_total = sum(distribution['bloom'].values())
        if bloom_total != num_questions:
            max_bloom = max(distribution['bloom'], key=distribution['bloom'].get)
            distribution['bloom'][max_bloom] += (num_questions - bloom_total)
    
    # Difficulty distribution
    for level, percentage in difficulty_dist.items():
        count = round((percentage / 100) * num_questions)
        distribution['difficulty'][level] = count
    
    if distribution['difficulty']:
        diff_total = sum(distribution['difficulty'].values())
        if diff_total != num_questions:
            max_diff = max(distribution['difficulty'], key=distribution['difficulty'].get)
            distribution['difficulty'][max_diff] += (num_questions - diff_total)
    
    return distribution


def format_clo_number(clo_str):
    """Ensure CLO is formatted as 'CLO 1', 'CLO 2', etc."""
    if not clo_str or clo_str == 'N/A':
        return 'CLO 1'
    
    match = re.search(r'(\d+)', str(clo_str))
    if match:
        num = match.group(1)
        return f'CLO {num}'
    
    return str(clo_str)


def extract_key_concepts(text: str) -> list:
    """
    Extract key concepts and terms from text for better context.
    Helps AI understand what's important in the material.
    """
    lines = [l.strip() for l in text.split('\n') if l.strip() and len(l.strip()) > 10]
    
    concepts = []
    for line in lines[:20]:
        if any(keyword in line.lower() for keyword in ['is defined as', 'means', 'refers to', 'represents']):
            parts = line.split(':')
            if len(parts) > 1:
                concept = parts[0].strip()
                if len(concept) < 50:
                    concepts.append(concept)
    
    for line in lines:
        words = re.findall(r'\b[A-Z]{3,}\b', line)
        concepts.extend(words)
    
    return list(set(concepts))[:10]


def generate_summary(file_path=None, file_type=None, text_content=None):
    """Generate a summary of document content using Gemini API"""
    api_key = current_app.config['GOOGLE_API_KEY']

    if not api_key:
        raise ValueError("Google API key is not configured")
   
    model = current_app.config.get('GEMINI_MODEL')
   
    if file_path and not text_content:
        from app.services.file_service import get_file_path, extract_text_from_file
        full_path = get_file_path(file_path)
        text_content = extract_text_from_file(full_path)
   
    if not text_content:
        raise ValueError("No content available to summarize")
   
    prompt = f"""Provide a concise summary (200-300 words) of the following educational content. 
Focus on key concepts, learning objectives, and important relationships.

CONTENT:
{text_content[:5000]}

SUMMARY:"""
   
    try:
        llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0.3,
            max_tokens=1000
        )
        response = llm.invoke([
            SystemMessage(content="You are an educational assistant that creates clear, focused summaries."),
            HumanMessage(content=prompt)
        ])
        return response.content.strip()
    except Exception as e:
        current_app.logger.error(f"Error calling Gemini API: {str(e)}")
        raise ValueError(f"Error generating summary: {str(e)}")


def get_ai_response(user_message, document_summary, chat_history=None):
    """Get AI response for chat-based Q&A"""
    api_key = current_app.config['GOOGLE_API_KEY']

    if not api_key:
        raise ValueError("Google API key is not configured")
   
    model = current_app.config.get('GEMINI_MODEL')
   
    messages = [
        {
            "role": "system",
            "content": f"""You are an educational assistant helping students learn from course materials.
Answer questions based on the provided document summary. Be accurate and specific.
Document Summary: {document_summary}"""
        }
    ]
   
    if chat_history:
        for msg in chat_history:
            role = "user" if msg.is_user else "assistant"
            messages.append({"role": role, "content": msg.content})
   
    messages.append({"role": "user", "content": user_message})
   
    formatted_messages = []
    for msg in messages:
        if msg["role"] == "system":
            formatted_messages.append(SystemMessage(content=msg["content"]))
        else:
            formatted_messages.append(HumanMessage(content=msg["content"]))

    try:
        llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0.7,
            max_tokens=1000
        )
        response = llm.invoke(formatted_messages)
        return response.content.strip()
    except Exception as e:
        current_app.logger.error(f"Error calling Gemini API: {str(e)}")
        raise ValueError(f"Error generating response: {str(e)}")


def generate_quiz_feedback(questions, score, document_summary):
    """
    Generate personalized feedback based on quiz performance
   
    Args:
        questions (list): List of QuizQuestion objects or dicts (for week quizzes)
        score (float): Quiz score percentage
        document_summary (str): Summary of the document or week content
       
    Returns:
        str: Personalized feedback
    """
    api_key = current_app.config['GOOGLE_API_KEY']

    if not api_key:
        raise ValueError("Google API key is not configured")
   
    model = current_app.config.get('GEMINI_MODEL')
   
    # Prepare information about incorrect answers (handles both QuizQuestion objects and dicts)
    incorrect_questions = []
    correct_questions = []
   
    for q in questions:
        if hasattr(q, 'is_correct'):  # QuizQuestion object
            is_correct = q.is_correct
            student_choice = q.student_choice
            correct_choice = q.correct_choice
            choice_a = q.choice_a
            choice_b = q.choice_b
            choice_c = q.choice_c
            explanation = q.explanation
            question_text = q.question_text
        else:  # Dict (for week quizzes)
            is_correct = (q.get('student_choice') == q.get('correct_choice'))
            student_choice = q.get('student_choice')
            correct_choice = q.get('correct_choice')
            choice_a = q.get('choice_a')
            choice_b = q.get('choice_b')
            choice_c = q.get('choice_c')
            explanation = q.get('explanation')
            question_text = q.get('question')
       
        if is_correct:
            correct_questions.append(q)
        else:
            incorrect_questions.append({
                "question": question_text,
                "student_choice": student_choice,
                "correct_choice": correct_choice,
                "choice_a": choice_a,
                "choice_b": choice_b,
                "choice_c": choice_c,
                "explanation": explanation
            })
   
    # Prepare the prompt
    prompt = f"""
    Generate personalized feedback for a student who completed a multiple-choice quiz on the following topic:
   
    Document Summary:
    {document_summary}
   
    Quiz Performance:
    - Score: {score:.1f}%
    - {len(correct_questions)} correct answers out of {len(questions)} questions
   
    Incorrect Answers:
    {json.dumps(incorrect_questions, indent=2)}
   
    Please provide:
    1. An overall assessment of their performance
    2. Specific feedback on areas they should focus on based on their incorrect answers
    3. Recommendations for improvement
    4. Encouragement and positive reinforcement
   
    The feedback should be constructive, specific to their mistakes, and reference the content they were tested on.
    The feedback should be in the same language as the Document Summary.
    """
   
    # Call Gemini API
    try:
        llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0.7,
            max_tokens=1000
        )
        response = llm.invoke([
            SystemMessage(content="You are an educational assistant that provides personalized and constructive feedback on quiz performance."),
            HumanMessage(content=prompt)
        ])
        
        return response.content.strip()
    except Exception as e:
        current_app.logger.error(f"Error generating quiz feedback: {str(e)}")
        raise ValueError(f"Error generating quiz feedback: {str(e)}")    


def evaluate_quiz_answer(student_answer, correct_answer, question_text):
    """
    Evaluate if a student's answer is correct using AI
   
    Args:
        student_answer (str): The student's response
        correct_answer (str): The correct answer
        question_text (str): The question being asked
       
    Returns:
        bool: Whether the answer is correct
        str: Feedback on the answer (optional)
    """
    if not current_app.config.get('GOOGLE_API_KEY'):
        return False, "Google API key is not configured" # Changed return for consistency with new error handling
        
    api_key = current_app.config['GOOGLE_API_KEY']
    
    if not api_key:
        raise ValueError("Google API key is not configured")
        
    model = current_app.config.get('GEMINI_MODEL')
   
    # Prepare the prompt
    prompt = f"""
    Please evaluate the student's answer to the following question:
   
    Question: {question_text}
   
    Correct answer: {correct_answer}
   
    Student's answer: {student_answer}
   
    Is the student's answer conceptually correct? Consider the meaning rather than exact wording.
    The answer is correct if it demonstrates understanding of the core concept, even if it doesn't
    match the expected answer word-for-word. Spelling mistakes, grammatical errors, and
    slightly different phrasing should be tolerated if the main point is correct.
    The evaluation should be in the same language as the student answer.

    Respond in JSON format with two fields:
    1. "is_correct": true or false
    2. "feedback": brief specific feedback on the answer (what was good or what was missing)
   
    Example response:
    {{
        "is_correct": true,
        "feedback": "Your answer correctly identifies the main concept but could be more specific about X."
    }}
    """
    
    # Call Gemini API
    try:
        llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0.3,
            max_tokens=500,
            response_mime_type="application/json"
        )
        response = llm.invoke([
            HumanMessage(content=prompt)
        ])
        
        # Simple/Naive JSON parsing if response.content is pure JSON
        try:
             # Clean markdown code blocks if present
             content = clean_markdown(response.content)
             data = json.loads(content)
             return data.get('is_correct', False), data.get('feedback', '')
        except json.JSONDecodeError: # Specific error for JSON parsing
             current_app.logger.error(f"Error parsing AI evaluation JSON: {response.content}")
             return False, "Error parsing AI evaluation"

    except Exception as e:
        current_app.logger.error(f"Error evaluating quiz answer: {str(e)}")
        return False, "Error evaluating answer"


# ============================================
# ACTIVITY PATTERN EXTRACTION & SCORING
# ============================================

def extract_activity_patterns(activity_text: str, clo_data: list, course_id: int) -> dict:
    """
    Extract patterns from activity file for quiz alignment.
    Uses existing functions to classify questions and extract metadata.
    
    Args:
        activity_text: Raw text from activity file
        clo_data: List of CLO dicts with 'CLO#' and 'CLO Description'
        course_id: Course ID for context
        
    Returns:
        Dict with clo_distribution, bloom_distribution, keywords_pool, questions_count
    """
    current_app.logger.info(f"🎯 Extracting activity patterns from {len(activity_text)} chars")
    
    try:
        # Step 1: Extract questions from activity text
        questions_raw = extract_questions_from_text(activity_text)
        questions = [normalize_question_keys(q) for q in questions_raw]
        
        current_app.logger.info(f"✓ Extracted {len(questions)} questions from activity")
        
        if len(questions) < 2:
            current_app.logger.warning("⚠️  Activity has too few questions for pattern analysis")
            return {
                'questions_count': 0,
                'clo_distribution': {},
                'bloom_distribution': {},
                'keywords_pool': {}
            }
        
        # Step 2: Classify by CLO
        clo_classified_raw = classify_questions_clo(questions, clo_data)
        
        # IMPORTANT: Normalize keys after CLO classification
        clo_classified = [normalize_question_keys(q) for q in clo_classified_raw]
        
        # Step 3: Classify by Bloom
        bloom_classified = classify_questions_bloom(clo_classified)
        
        current_app.logger.info(f"✓ Classified {len(bloom_classified)} questions")
        
        # Step 4: Calculate CLO distribution
        clo_counts = {}
        for q in bloom_classified:
            clos = q.get("CLO#")
            if isinstance(clos, list):
                for c in clos:
                    clo_counts[c] = clo_counts.get(c, 0) + 1
            elif clos:
                clo_counts[clos] = clo_counts.get(clos, 0) + 1
        
        total_q = len(bloom_classified)
        clo_distribution = {str(k): round((v / total_q) * 100, 1) for k, v in clo_counts.items()}
        
        # Step 5: Calculate Bloom distribution
        bloom_counts = {
            'remember': 0, 'understand': 0, 'apply': 0,
            'analyze': 0, 'evaluate': 0, 'create': 0
        }
        for q in bloom_classified:
            level = q.get("Bloom_Level", "understand").lower()
            if level in bloom_counts:
                bloom_counts[level] += 1
        
        bloom_distribution = {k: round((v / total_q) * 100, 1) if total_q > 0 else 0 
                             for k, v in bloom_counts.items()}
        
        # Step 6: Extract keywords pool from questions
        keywords_pool = {}
        for q in bloom_classified:
            text = q.get('Text', '').lower()
            # Extract key terms (3+ chars, not common words)
            terms = re.findall(r'\b[a-zA-Z]{3,}\b', text)
            for term in terms:
                if term not in ['the', 'and', 'for', 'are', 'you', 'with', 'from']:
                    keywords_pool[term] = keywords_pool.get(term, 0) + 1
        
        # Keep top 30 keywords by frequency
        top_keywords = dict(sorted(keywords_pool.items(), 
                                   key=lambda x: x[1], 
                                   reverse=True)[:30])
        
        result = {
            'questions_count': len(bloom_classified),
            'clo_distribution': clo_distribution,
            'bloom_distribution': bloom_distribution,
            'keywords_pool': top_keywords
        }
        
        current_app.logger.info(f"✓ Activity patterns: {len(bloom_classified)} Q, "
                               f"{len(clo_distribution)} CLOs, {len(top_keywords)} keywords")
        
        return result
        
    except Exception as e:
        current_app.logger.error(f"❌ Failed to extract activity patterns: {str(e)}")
        import traceback
        current_app.logger.error(traceback.format_exc())
        
        return {
            'questions_count': 0,
            'clo_distribution': {},
            'bloom_distribution': {},
            'keywords_pool': {}
        }


def score_question_activity_alignment(
    question: dict, 
    activity_patterns: dict
) -> tuple:
    """
    Score how well a question aligns with activity patterns.
    Uses STRUCTURAL matching (types, Bloom levels, CLOs) NOT keywords.
    
    Args:
        question: Generated question dict with clo, bloom_level, question_type
        activity_patterns: Dict from extract_activity_patterns()
        
    Returns:
        (is_activity_inspired: bool, alignment_score: float, alignment_details: str)
    """
    if not activity_patterns or not activity_patterns.get('questions_count'):
        return False, 0.0, "No activity file"
    
    alignment_points = 0
    total_checks = 4
    details = []
    
    # ============================================
    # Check 1: Question Type Match
    # ============================================
    q_type = question.get('question_type', 'mcq').lower()
    
    if q_type == 'mcq' or not q_type:
        activity_qtype = 'mcq'
    else:
        activity_qtype = 'open_ended'
    
    activity_types = activity_patterns.get('question_types', {})
    
    # Does activity have this type of question?
    if activity_qtype == 'mcq' and activity_types.get('mcq', 0) > 0:
        alignment_points += 1
        details.append("✓ Question type matches activity (MCQ)")
    elif activity_qtype == 'open_ended' and sum(activity_types.get(k, 0) for k in ['short_answer', 'essay', 'problem_solving']) > 0:
        alignment_points += 1
        details.append("✓ Question type matches activity (Open-Ended)")
    else:
        details.append("✗ Question type not prevalent in activity")
    
    # ============================================
    # Check 2: Bloom Level Match
    # ============================================
    q_bloom = question.get('bloom_level', 'understand').lower()
    activity_bloom = activity_patterns.get('bloom_distribution', {})
    
    if q_bloom in activity_bloom and activity_bloom[q_bloom] > 0:
        alignment_points += 1
        details.append(f"✓ Bloom level '{q_bloom}' is used in activity ({activity_bloom[q_bloom]:.0f}%)")
    else:
        details.append(f"✗ Bloom level '{q_bloom}' not common in activity")
    
    # ============================================
    # Check 3: CLO Match
    # ============================================
    q_clo = str(question.get('clo', 'CLO 1')).strip()
    activity_clos = activity_patterns.get('clo_distribution', {})
    
    # Check if this CLO is tested in activity
    clo_match = False
    for activity_clo in activity_clos.keys():
        if str(activity_clo) in q_clo or q_clo in str(activity_clo):
            clo_match = True
            details.append(f"✓ CLO '{q_clo}' is covered in activity")
            break
    
    if clo_match:
        alignment_points += 1
    else:
        details.append(f"✗ CLO '{q_clo}' not emphasized in activity")
    
    # ============================================
    # Check 4: Question Distribution Match
    # ============================================
    total_activity_q = activity_patterns.get('questions_count', 0)
    if total_activity_q > 0:
        activity_mcq_pct = (activity_patterns.get('total_mcq_in_activity', 0) / total_activity_q) * 100
        activity_open_pct = (activity_patterns.get('total_open_in_activity', 0) / total_activity_q) * 100
        
        # If activity is mostly MCQ, give points for MCQ questions
        if activity_mcq_pct > 60 and q_type in ['mcq', None]:
            alignment_points += 1
            details.append(f"✓ Activity is {activity_mcq_pct:.0f}% MCQ; this is MCQ")
        # If activity is mostly open-ended, give points for open-ended
        elif activity_open_pct > 60 and q_type == 'open_ended':
            alignment_points += 1
            details.append(f"✓ Activity is {activity_open_pct:.0f}% open-ended; this is open-ended")
        else:
            details.append("≈ Question type distribution reasonable")
            alignment_points += 0.5
    
    # ============================================
    # Calculate Final Alignment Score
    # ============================================
    alignment_score = (alignment_points / total_checks) * 100
    is_activity_inspired = alignment_score >= 50  # Threshold: >50% alignment
    
    alignment_summary = "; ".join(details)
    
    return is_activity_inspired, round(alignment_score, 1), alignment_summary


def score_chunk_by_activity_patterns(chunk_text: str, activity_patterns: dict) -> float:
    """
    Score how well a chunk matches activity patterns (0-1).
    Used by RAG service for weighted retrieval.
    
    Args:
        chunk_text: Text chunk to score
        activity_patterns: Dict from extract_activity_patterns()
        
    Returns:
        Similarity score (0.0-1.0)
    """
    if not activity_patterns or not activity_patterns.get('keywords_pool'):
        return 0.0
    
    keywords_pool = activity_patterns['keywords_pool']
    chunk_lower = chunk_text.lower()
    keyword_matches = 0
    
    for keyword in keywords_pool.keys():
        if keyword in chunk_lower:
            keyword_matches += 1
    
    score = keyword_matches / len(keywords_pool) if keywords_pool else 0.0
    return min(score, 1.0)


def verify_activity_integration(generated_questions: list, activity_patterns: dict) -> dict:
    """
    Verify that generated quiz aligns with activity patterns.
    Returns alignment report with metrics.
    
    Args:
        generated_questions: List of question dicts from generate_quiz_questions()
        activity_patterns: Dict from extract_activity_patterns()
        
    Returns:
        Dict with alignment metrics and report
    """
    if not activity_patterns or not activity_patterns.get('questions_count'):
        return {
            'activity_used': False,
            'message': 'No activity file was used for alignment.',
            'clo_alignment_percent': 0,
            'bloom_alignment_percent': 0,
            'keyword_matches': 0
        }
    
    try:
        # Extract CLOs from generated questions
        generated_clos = {}
        for q in generated_questions:
            clo = q.get('clo', 'CLO 1')
            generated_clos[clo] = generated_clos.get(clo, 0) + 1
        
        # Compare with activity CLO distribution
        activity_clos = activity_patterns.get('clo_distribution', {})
        clo_matches = 0
        for clo in generated_clos:
            if any(str(clo) in str(k) or str(k) in str(clo) for k in activity_clos.keys()):
                clo_matches += 1
        
        total_clos = max(len(generated_clos), len(activity_clos)) or 1
        clo_alignment = round((clo_matches / total_clos) * 100)
        
        # Extract Bloom levels from generated questions
        generated_bloom = {}
        for q in generated_questions:
            bloom = q.get('bloom_level', 'understand')
            generated_bloom[bloom] = generated_bloom.get(bloom, 0) + 1
        
        # Compare with activity Bloom distribution
        activity_bloom = activity_patterns.get('bloom_distribution', {})
        bloom_matches = 0
        for bloom in generated_bloom:
            if bloom in activity_bloom:
                bloom_matches += 1
        
        total_bloom = max(len(generated_bloom), len(activity_bloom)) or 1
        bloom_alignment = round((bloom_matches / total_bloom) * 100)
        
        # Count keyword matches in generated questions
        keywords_pool = activity_patterns.get('keywords_pool', {})
        keyword_count = 0
        
        full_text = ' '.join([q.get('question', '') + ' ' + 
                             q.get('explanation', '') 
                             for q in generated_questions]).lower()
        
        for keyword in keywords_pool.keys():
            if keyword in full_text:
                keyword_count += 1
        
        message = (f"✓ Quiz aligned with activity file: "
                  f"{clo_alignment}% CLO match, "
                  f"{bloom_alignment}% Bloom match, "
                  f"{keyword_count}/{len(keywords_pool)} keywords covered")
        
        current_app.logger.info(f"📊 Activity alignment: CLO {clo_alignment}%, "
                               f"Bloom {bloom_alignment}%, Keywords {keyword_count}")
        
        return {
            'activity_used': True,
            'message': message,
            'clo_alignment_percent': clo_alignment,
            'bloom_alignment_percent': bloom_alignment,
            'keyword_matches': keyword_count
        }
        
    except Exception as e:
        current_app.logger.error(f"❌ Failed to verify alignment: {str(e)}")
        return {
            'activity_used': True,
            'message': f'Alignment verification incomplete: {str(e)}',
            'clo_alignment_percent': 0,
            'bloom_alignment_percent': 0,
            'keyword_matches': 0
        }

# ============================================
# IMPROVED EVALUATION FUNCTIONS
# ============================================

def evaluate_quiz_answer_enhanced(
    student_answer: str,
    model_answer: str,
    question_text: str,
    bloom_level: str = 'understand',
    evaluation_criteria: list = None,
    grading_rubric: str = None
) -> dict:
    """
    Enhanced evaluation of student answers with detailed assessment.
    
    Args:
        student_answer (str): The student's response
        model_answer (str): The expected/model answer
        question_text (str): The question being asked
        bloom_level (str): Bloom's taxonomy level (remember, understand, apply, etc.)
        evaluation_criteria (list): Specific criteria to evaluate
        grading_rubric (str): Custom grading guidance
        
    Returns:
        dict with:
            - is_correct (bool): Overall correctness
            - score (float): Score 0-100
            - feedback (str): Detailed feedback
            - strengths (list): What was done well
            - areas_for_improvement (list): What could be better
            - detailed_assessment (str): Full assessment
    """
    api_key = current_app.config['GOOGLE_API_KEY']
    if not api_key:
        raise ValueError("Google API key is not configured")
    
    model = current_app.config.get('GEMINI_MODEL')
    
    # Build evaluation criteria string
    criteria_str = ""
    if evaluation_criteria:
        criteria_str = "Evaluation Criteria:\n" + "\n".join([f"- {c}" for c in evaluation_criteria])
    
    rubric_str = ""
    if grading_rubric:
        rubric_str = f"\nGrading Rubric:\n{grading_rubric}"
    
    # Build comprehensive prompt
    prompt = f"""
Evaluate the student's answer comprehensively and fairly.

QUESTION:
{question_text}

BLOOM'S LEVEL: {bloom_level.upper()}

MODEL ANSWER:
{model_answer}

STUDENT'S ANSWER:
{student_answer}

{criteria_str}
{rubric_str}

EVALUATION GUIDELINES:
1. Assess CONCEPTUAL UNDERSTANDING, not just exact wording
2. Consider:
   - Accuracy of core concepts
   - Completeness of response
   - Clarity of explanation
   - Use of appropriate terminology
   - Supporting details or examples
   - Understanding depth appropriate to Bloom's level

3. Scoring:
   - 90-100: Excellent (complete, accurate, well-explained)
   - 75-89: Good (mostly correct with minor gaps)
   - 60-74: Fair (correct core concepts but incomplete)
   - 40-59: Poor (significant gaps in understanding)
   - 0-39: Failing (major misunderstandings)

4. Be CONSTRUCTIVE and ENCOURAGING

Respond ONLY in valid JSON format:
{{
    "is_correct": true/false,
    "score": 0-100,
    "feedback": "brief overall feedback",
    "strengths": ["strength 1", "strength 2"],
    "areas_for_improvement": ["area 1", "area 2"],
    "detailed_assessment": "detailed explanation of the assessment",
    "model_answer_comparison": "how the student answer compares to model answer"
}}
"""
    
    # Correct replacement for lines 2165+:
    try:
        llm = ChatGoogleGenerativeAI(
             model=model,
             google_api_key=api_key,
             temperature=0.4, 
             response_mime_type="application/json"
        )
        # Using prompt constructed above
        response = llm.invoke([HumanMessage(content=prompt)])
        
        # Parse result...
        try:
             content = clean_markdown(response.content)
             json_data = json.loads(content)
             
             current_app.logger.info(f"✓ Enhanced evaluation: Score {json_data.get('score', 0)}/100")
             
             return {
                'is_correct': json_data.get('is_correct', False),
                'score': json_data.get('score', 0),
                'feedback': json_data.get('feedback', ''),
                'strengths': json_data.get('strengths', []),
                'areas_for_improvement': json_data.get('areas_for_improvement', []),
                'detailed_assessment': json_data.get('detailed_assessment', ''),
                'model_answer_comparison': json_data.get('model_answer_comparison', '')
            }
        except json.JSONDecodeError:
             current_app.logger.error(f"Error parsing AI evaluation JSON: {response.content}")
             return simple_evaluate_answer(student_answer, model_answer, question_text)

    except Exception as e:
             current_app.logger.error(f"Error in enhanced evaluation: {str(e)}")
             return simple_evaluate_answer(student_answer, model_answer, question_text)


def simple_evaluate_answer(student_answer: str, model_answer: str, question_text: str) -> dict:
    """
    Simple fallback evaluation using basic similarity metrics.
    Used when AI evaluation fails.
    
    Args:
        student_answer (str): Student response
        model_answer (str): Expected answer
        question_text (str): Question
        
    Returns:
        dict with basic evaluation
    """
    # Calculate basic similarity
    student_lower = student_answer.lower().strip()
    model_lower = model_answer.lower().strip()
    
    # Simple metrics
    exact_match = student_lower == model_lower
    contains_key_words = sum(1 for word in model_lower.split() 
                            if len(word) > 3 and word in student_lower) / max(len([w for w in model_lower.split() if len(w) > 3]), 1)
    
    # Calculate score
    if exact_match:
        score = 100
        is_correct = True
    elif contains_key_words > 0.7:
        score = 80
        is_correct = True
    elif contains_key_words > 0.5:
        score = 60
        is_correct = False
    else:
        score = 30
        is_correct = False
    
    return {
        'is_correct': is_correct,
        'score': score,
        'feedback': f"Answer scored {score}/100 based on key concept coverage.",
        'strengths': ["Response was provided"] if student_answer.strip() else [],
        'areas_for_improvement': ["Consider including more details from the model answer"],
        'detailed_assessment': f"Basic comparison shows {contains_key_words*100:.0f}% key concept coverage.",
        'model_answer_comparison': "See model answer for complete reference."
    }


def evaluate_open_ended_with_context(
    student_answer: str,
    question: dict,
    course_context: str = None
) -> dict:
    """
    Evaluate an open-ended answer with full context.
    
    Args:
        student_answer (str): Student's response
        question (dict): Question data with model_answer, evaluation_criteria, grading_rubric, bloom_level
        course_context (str): Additional course/material context
        
    Returns:
        dict with comprehensive evaluation
    """
    try:
        evaluation = evaluate_quiz_answer_enhanced(
            student_answer=student_answer,
            model_answer=question.get('model_answer', ''),
            question_text=question.get('question', ''),
            bloom_level=question.get('bloom_level', 'understand'),
            evaluation_criteria=question.get('evaluation_criteria', []),
            grading_rubric=question.get('grading_rubric', '')
        )
        
        return evaluation
        
    except Exception as e:
        current_app.logger.error(f"Error in context-based evaluation: {str(e)}")
        return simple_evaluate_answer(
            student_answer,
            question.get('model_answer', ''),
            question.get('question', '')
        )


def batch_evaluate_open_ended(questions_with_answers: list) -> list:
    """
    Evaluate multiple open-ended answers efficiently.
    
    Args:
        questions_with_answers (list): List of dicts with:
            - question (str)
            - student_answer (str)
            - model_answer (str)
            - bloom_level (str)
            - evaluation_criteria (list)
            - grading_rubric (str)
        
    Returns:
        list of evaluation results
    """
    results = []
    
    for item in questions_with_answers:
        try:
            result = evaluate_quiz_answer_enhanced(
                student_answer=item.get('student_answer', ''),
                model_answer=item.get('model_answer', ''),
                question_text=item.get('question', ''),
                bloom_level=item.get('bloom_level', 'understand'),
                evaluation_criteria=item.get('evaluation_criteria', []),
                grading_rubric=item.get('grading_rubric', '')
            )
            result['question_id'] = item.get('question_id', '')
            results.append(result)
            
        except Exception as e:
            current_app.logger.warning(f"Skipping evaluation due to error: {str(e)}")
            results.append({
                'question_id': item.get('question_id', ''),
                'is_correct': None,
                'score': 0,
                'feedback': 'Evaluation pending',
                'error': str(e)
            })
    
    return results


def generate_detailed_model_answer(
    question_text: str,
    clo: str,
    bloom_level: str,
    course_context: str,
    source_material: str
) -> str:
    """
    Generate a comprehensive model answer for an open-ended question.
    
    Args:
        question_text (str): The question
        clo (str): Related CLO
        bloom_level (str): Bloom's taxonomy level
        course_context (str): Course context/objectives
        source_material (str): Relevant course material
        
    Returns:
        str: Detailed model answer
    """
    api_key = current_app.config['GOOGLE_API_KEY']
    if not api_key:
        raise ValueError("Google API key is not configured")
    
    model = current_app.config.get('GEMINI_MODEL')
    
    prompt = f"""
Generate a comprehensive model answer for this open-ended question.

QUESTION:
{question_text}

RELATED CLO:
{clo}

BLOOM'S LEVEL: {bloom_level.upper()}

COURSE CONTEXT:
{course_context}

RELEVANT MATERIAL:
{source_material[:2000]}

REQUIREMENTS:
1. Appropriate depth for Bloom's level: {bloom_level}
2. Address the CLO: {clo}
3. Use course terminology
4. Include specific examples from materials if relevant
5. Be clear and well-structured
6. Include key concepts that must appear in student answers

Generate the model answer:
"""
    
    # Gemini replacement for score matching
    try:
        llm = ChatGoogleGenerativeAI(model=model, google_api_key=api_key, temperature=0.1) # Removed response_mime_type as it's not returning JSON directly here
        response = llm.invoke([HumanMessage(content=prompt)])
        return response.content.strip() # Return the string content directly
    except Exception as e:
        current_app.logger.error(f"Error generating model answer: {str(e)}")
        raise ValueError(f"Failed to generate model answer: {str(e)}")


def create_evaluation_criteria_for_question(
    question_text: str,
    bloom_level: str,
    clo: str
) -> dict:
    """
    Auto-generate evaluation criteria for an open-ended question.
    
    Args:
        question_text (str): The question
        bloom_level (str): Bloom's level
        clo (str): Related CLO
        
    Returns:
        dict with:
            - criteria (list): Evaluation criteria
            - rubric (str): Grading rubric
            - key_concepts (list): Key concepts to include
    """
    api_key = current_app.config['GOOGLE_API_KEY']
    if not api_key:
        raise ValueError("Google API key is not configured")
    
    model = current_app.config.get('GEMINI_MODEL')
    
    prompt = f"""
Create evaluation criteria for this open-ended question.

QUESTION:
{question_text}

BLOOM'S LEVEL: {bloom_level.upper()}
CLO: {clo}

Generate in JSON format:
{{
    "criteria": [
        "criterion 1",
        "criterion 2",
        "criterion 3"
    ],
    "rubric": "How to grade (brief)",
    "key_concepts": ["concept1", "concept2", "concept3"]
}}
"""
    
    try:
        llm = ChatGoogleGenerativeAI(model=model, google_api_key=api_key, temperature=0.2, response_mime_type="application/json")
        response = llm.invoke([HumanMessage(content=prompt)])
        content = clean_markdown(response.content)
        data = json.loads(content)
        return data # Return the parsed dictionary directly
    except json.JSONDecodeError:
        current_app.logger.error(f"Error parsing AI criteria JSON: {response.content}")
        return {
            'criteria': ['Demonstrates understanding of core concepts', 'Clear explanation', 'Proper terminology'],
            'rubric': 'Score based on completeness and accuracy',
            'key_concepts': []
        }
    except Exception as e:
        current_app.logger.error(f"Error creating criteria: {str(e)}")
        return {
            'criteria': ['Demonstrates understanding of core concepts', 'Clear explanation', 'Proper terminology'],
            'rubric': 'Score based on completeness and accuracy',
            'key_concepts': []
        }