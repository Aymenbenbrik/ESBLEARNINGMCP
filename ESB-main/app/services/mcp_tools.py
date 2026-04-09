"""
MCP Tools for TP (Travaux Pratiques) AI System
================================================
Implements the 6 tools exposed by the MCP server, callable by LangGraph agents.

Each tool is a pure Python function that:
- Receives structured input (validated by Pydantic)
- Calls Gemini AI via LangChain
- Returns structured output

These tools follow the Model Context Protocol (MCP) specification for tool definitions.
They are registered in the MCP server and available to LangGraph agent nodes.
"""

import json
import logging
from typing import Optional

from flask import current_app
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

# ─── Language display names ───────────────────────────────────────────────────

LANGUAGE_LABELS = {
    'python': 'Python 3',
    'sql':    'SQL (PostgreSQL)',
    'r':      'R',
    'java':   'Java 11+',
    'c':      'C (C11)',
    'cpp':    'C++ (C++17)',
}

# ─── MCP Tool Definitions (schema for documentation & MCP registry) ──────────

MCP_TOOL_DEFINITIONS = [
    {
        "name": "get_section_context",
        "description": "Retrieves all available educational content for a section: documents, YouTube transcripts, and existing text activities. Used to provide context for AI generation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "section_id": {"type": "integer", "description": "The TNSection ID"}
            },
            "required": ["section_id"]
        }
    },
    {
        "name": "generate_tp_statement",
        "description": "Generates a practical work statement (énoncé) in the specified programming language, using section course content as context.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "context": {"type": "string", "description": "Educational context from section documents"},
                "language": {"type": "string", "description": "Programming language (python|sql|r|java|c|cpp)"},
                "hint": {"type": "string", "description": "Optional teacher hint for the TP subject"}
            },
            "required": ["context", "language"]
        }
    },
    {
        "name": "suggest_aa_codes",
        "description": "Suggests Apprentissages Attendus (AA) codes relevant to a TP statement, based on section syllabus.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "section_id": {"type": "integer"},
                "statement": {"type": "string", "description": "The TP statement text"}
            },
            "required": ["section_id", "statement"]
        }
    },
    {
        "name": "generate_reference_solution",
        "description": "Generates a reference solution for a TP, along with an evaluation criteria grid.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "statement": {"type": "string"},
                "language": {"type": "string"},
                "max_grade": {"type": "number", "description": "Maximum grade (default 20)"}
            },
            "required": ["statement", "language"]
        }
    },
    {
        "name": "auto_correct_submission",
        "description": "Automatically corrects a student's code submission against the reference solution and returns a detailed correction report.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "statement": {"type": "string"},
                "reference_solution": {"type": "string"},
                "correction_criteria": {"type": "string"},
                "student_code": {"type": "string"},
                "language": {"type": "string"},
                "max_grade": {"type": "number"}
            },
            "required": ["statement", "reference_solution", "student_code", "language"]
        }
    },
    {
        "name": "propose_grade",
        "description": "Proposes a numeric grade (0–max_grade) based on the correction report.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "correction_report": {"type": "string"},
                "max_grade": {"type": "number"}
            },
            "required": ["correction_report"]
        }
    },
    {
        "name": "parse_tp_questions",
        "description": "Parses a TP statement and extracts a structured list of questions/exercises with point allocation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "statement": {"type": "string", "description": "The full TP statement text"},
                "language": {"type": "string", "description": "Programming language"},
                "max_grade": {"type": "number", "description": "Maximum total grade"}
            },
            "required": ["statement", "language"]
        }
    },
    {
        "name": "generate_question_starter",
        "description": "Generates a question as code comments plus a starter code template for the student.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question_text": {"type": "string", "description": "The question text"},
                "language": {"type": "string", "description": "Programming language"}
            },
            "required": ["question_text", "language"]
        }
    },
    {
        "name": "chat_with_student",
        "description": "Socratic chatbot that guides students toward solutions without giving direct answers. Only for formative TPs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question_text": {"type": "string", "description": "The TP question text"},
                "language": {"type": "string", "description": "Programming language"},
                "student_message": {"type": "string", "description": "Student's current message"},
                "conversation_history": {
                    "type": "array",
                    "description": "Previous messages [{role: user|assistant, content: str}]"
                },
                "student_code": {"type": "string", "description": "Current student code (optional)"}
            },
            "required": ["question_text", "language", "student_message"]
        }
    },
]


# ─── Helper: get LLM ─────────────────────────────────────────────────────────

def _llm(temperature: float = 0.3):
    api_key = current_app.config.get('GOOGLE_API_KEY', '')
    model = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=api_key,
        temperature=temperature,
        max_tokens=4096,
    )


def _llm_robust(temperature: float = 0.3):
    """High-quality LLM for complex generation tasks (statement, reference, correction)."""
    api_key = current_app.config.get('GOOGLE_API_KEY', '')
    robust_model = current_app.config.get('GEMINI_MODEL_ROBUST', 'gemini-2.5-pro')
    return ChatGoogleGenerativeAI(
        model=robust_model,
        google_api_key=api_key,
        temperature=temperature,
        max_tokens=8192,
    )


# ─── Tool 1 : get_section_context ─────────────────────────────────────────────

def get_section_context(section_id: int) -> dict:
    """
    MCP Tool: Retrieves educational content for a section.
    Returns a dict with keys: context, aa_codes, section_title.
    """
    from app.models import TNSection, Document, SectionActivity, SectionContent, TNSectionAA, TNAA
    import os

    section = TNSection.query.get(section_id)
    if not section:
        return {"error": f"Section {section_id} not found", "context": "", "aa_codes": []}

    parts = []

    # Section title/objective
    parts.append(f"## Section: {section.title}")

    # Chapter documents
    try:
        chapter = section.chapter
        docs = Document.query.filter_by(chapter_id=chapter.id).all()
        for doc in docs[:3]:
            try:
                file_path = doc.file_path
                if file_path and os.path.exists(file_path):
                    from app.services.file_service import extract_text_from_file
                    text = extract_text_from_file(file_path)
                    if text:
                        parts.append(f"\n### Document: {doc.title}\n{text[:2000]}")
            except Exception as e:
                logger.warning(f"Could not extract text from doc {doc.id}: {e}")
    except Exception as e:
        logger.warning(f"Could not get chapter docs: {e}")

    # Section AI content (already extracted)
    try:
        sc = SectionContent.query.filter_by(section_id=section_id, status='approved').first()
        if sc and sc.content:
            parts.append(f"\n### Contenu de la section\n{sc.content[:2000]}")
    except Exception:
        pass

    # Text activities (cours texte)
    try:
        text_acts = SectionActivity.query.filter_by(
            section_id=section_id, activity_type='text_doc'
        ).all()
        for act in text_acts[:2]:
            if act.text_content:
                parts.append(f"\n### Activité: {act.title}\n{act.text_content[:1000]}")
    except Exception:
        pass

    # AA codes via TNSectionAA → TNAA
    aa_codes = []
    try:
        links = TNSectionAA.query.filter_by(section_id=section_id).all()
        for link in links:
            aa = link.aa
            if aa:
                aa_codes.append(f"AA {aa.number}")
        # Fallback: chapter-level AA codes
        if not aa_codes:
            from app.models import TNChapterAA
            chapter = section.chapter
            ch_links = TNChapterAA.query.filter_by(chapter_id=chapter.id).all()
            for link in ch_links:
                if link.aa:
                    aa_codes.append(f"AA {link.aa.number}")
    except Exception as e:
        logger.warning(f"Could not get AA codes: {e}")

    context = "\n".join(parts)
    return {
        "context": context,
        "aa_codes": aa_codes,
        "section_title": section.title,
    }


# ─── Tool 2 : generate_tp_statement ──────────────────────────────────────────

def generate_tp_statement(context: str, language: str, hint: str = "") -> dict:
    """
    MCP Tool: Generates a complete, structured TP statement from course context.
    Returns: { statement: str, title: str, question_count: int }
    """
    lang_label = LANGUAGE_LABELS.get(language, language)

    system = f"""Tu es un enseignant universitaire expert en {lang_label} qui crée des travaux pratiques pédagogiques complets.

Ta mission est de créer un TP complet, structuré et prêt pour les étudiants.

Le TP doit:
- Avoir un titre accrocheur et précis (max 70 caractères)
- Contenir 3 à 5 questions numérotées progressives (du plus simple au plus complexe)
- Chaque question doit avoir des instructions claires et un objectif mesurable
- Inclure des exemples de données/entrées quand pertinent
- Être formaté en Markdown avec des blocs de code si nécessaire
- Durée estimée: 2-3 heures pour un étudiant de niveau universitaire

Structure de l'énoncé:
1. Une introduction contextualisant le TP (2-3 phrases)
2. Les objectifs pédagogiques (liste à puces)
3. 3 à 5 questions numérotées progressives avec instructions précises
4. Pour chaque question: objectif, données si nécessaire, résultat attendu

Format de réponse JSON strict:
{{
  "title": "Titre précis et accrocheur du TP",
  "statement": "### Introduction\\n...\\n\\n### Objectifs\\n...\\n\\n**Question 1 :**\\n...",
  "question_count": <entier entre 3 et 5>
}}"""

    hint_text = f"\n\nObjectif pédagogique principal (à respecter impérativement) :\n{hint}" if hint else ""
    user_msg = f"""Contexte pédagogique de la section (cours, documents) :
{context[:3500]}
{hint_text}

Génère un TP {lang_label} complet et structuré basé sur ce contexte. L'énoncé doit être directement utilisable par les étudiants (aucune note enseignant à l'intérieur)."""

    try:
        llm = _llm_robust(temperature=0.5)
        response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user_msg)])
        raw = response.content.strip()

        # Extract JSON — try multiple strategies
        json_str = raw
        if '```json' in raw:
            json_str = raw.split('```json')[1].split('```')[0].strip()
        elif '```' in raw:
            json_str = raw.split('```')[1].split('```')[0].strip()

        # Fallback: find JSON object boundaries
        if not json_str.startswith('{'):
            start = json_str.find('{')
            end = json_str.rfind('}')
            if start != -1 and end != -1:
                json_str = json_str[start:end + 1]

        try:
            result = json.loads(json_str)
            return {
                "title": result.get("title", "TP"),
                "statement": result.get("statement", raw),
                "question_count": result.get("question_count", 3),
            }
        except json.JSONDecodeError:
            # Use raw response as statement, extract title from first heading
            lines = raw.split('\n')
            title = "TP"
            for line in lines:
                stripped = line.strip('#').strip()
                if stripped and not stripped.startswith('{'):
                    title = stripped[:70]
                    break
            return {"title": title, "statement": raw, "question_count": 3}
    except Exception as e:
        logger.error(f"generate_tp_statement error: {e}", exc_info=True)
        raise  # Let caller handle with proper HTTP error


# ─── Tool 3 : suggest_aa_codes ────────────────────────────────────────────────

def suggest_aa_codes(section_id: int, statement: str) -> dict:
    """
    MCP Tool: Suggests AA codes based on section syllabus and TP statement.
    Returns: { aa_codes: list[str], justification: str }
    """
    ctx = get_section_context(section_id)
    available_aa = ctx.get("aa_codes", [])

    if not available_aa:
        return {"aa_codes": [], "justification": "Aucun AA trouvé pour cette section."}

    system = """Tu es un expert en ingénierie pédagogique.
Sélectionne les Apprentissages Attendus (AA) les plus pertinents pour le TP décrit.
Réponds en JSON strict: {"selected_aa": ["AA1.1", ...], "justification": "..."}"""

    user_msg = f"""AA disponibles pour la section: {', '.join(available_aa)}

Énoncé du TP:
{statement[:1500]}

Sélectionne 2-4 AA les plus pertinents."""

    try:
        llm = _llm(temperature=0.2)
        response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user_msg)])
        raw = response.content.strip()
        if '```json' in raw:
            raw = raw.split('```json')[1].split('```')[0].strip()
        result = json.loads(raw)
        return {
            "aa_codes": result.get("selected_aa", []),
            "justification": result.get("justification", ""),
        }
    except Exception as e:
        logger.error(f"suggest_aa_codes error: {e}")
        return {"aa_codes": available_aa[:2], "justification": "Sélection automatique."}


# ─── Tool 4 : generate_reference_solution ─────────────────────────────────────

def generate_reference_solution(
    statement: str,
    language: str,
    max_grade: float = 20.0,
    questions: list = None,
) -> dict:
    """
    MCP Tool: Generates a complete reference solution + detailed evaluation grid.
    Uses a high-quality prompt optimized for Gemini 2.0 Flash.
    Returns: { reference_solution: str, correction_criteria: str, per_question_solutions: list }
    """
    lang_label = LANGUAGE_LABELS.get(language, language)
    questions = questions or []

    has_questions = len(questions) > 0
    questions_section = ""
    if has_questions:
        questions_section = "\n\nQuestions identifiées:\n" + "\n".join(
            f"  Q{q['id']} ({q.get('points', '?')} pts): {q.get('title', '')} — {q.get('text', '')[:200]}"
            for q in questions
        )

    system = f"""Tu es un Professeur Expert en {lang_label} et en Ingénierie Pédagogique Universitaire.

Ta mission est de générer UNE SOLUTION DE RÉFÉRENCE COMPLÈTE et EXEMPLAIRE pour ce TP.

EXIGENCES DE QUALITÉ:
✅ La solution doit être COMPLÈTE - résoudre toutes les questions
✅ Le code doit être PARFAITEMENT COMMENTÉ (commentaires pédagogiques explicatifs)
✅ Suivre les MEILLEURES PRATIQUES {lang_label} (style, conventions, performance)
✅ Si plusieurs questions: SÉPARER clairement les solutions par question
✅ Inclure des EXPLICATIONS sur les choix algorithmiques importants

GRILLE D'ÉVALUATION:
✅ Critères PRÉCIS et MESURABLES avec points alloués
✅ Distinguer: correction fonctionnelle / qualité du code / bonnes pratiques
✅ Prévoir des points partiels pour les solutions incomplètes mais pertinentes

FORMAT JSON STRICT (ne pas s'écarter):
{{
  "reference_solution": "code complet, commenté, avec labels clairs (# === Question 1 === etc.)",
  "correction_criteria": "grille détaillée en Markdown avec tableau critères/points",
  "per_question_solutions": [
    {{"question_id": 1, "title": "...", "code": "code pour Q1", "explanation": "explication clé"}}
  ]
}}"""

    user_msg = f"""=== ÉNONCÉ DU TP ({lang_label}) ==={questions_section}

{statement[:3000]}

=== PARAMÈTRES ===
- Langage: {lang_label}
- Note maximale: {max_grade} points
{"- Nombre de questions: " + str(len(questions)) if has_questions else ""}

Génère la solution de référence complète et la grille d'évaluation détaillée."""

    try:
        llm = _llm_robust(temperature=0.2)
        response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user_msg)])
        raw = response.content.strip()
        if '```json' in raw:
            raw = raw.split('```json')[1].split('```')[0].strip()
        elif '```' in raw and raw.strip().startswith('```'):
            raw = raw.split('```')[1].split('```')[0].strip()

        result = json.loads(raw)
        return {
            'reference_solution': result.get('reference_solution', ''),
            'correction_criteria': result.get('correction_criteria', ''),
            'per_question_solutions': result.get('per_question_solutions', []),
        }
    except json.JSONDecodeError:
        # Fallback: return raw as solution
        return {
            'reference_solution': raw,
            'correction_criteria': f"Évaluation globale sur {max_grade} points.",
            'per_question_solutions': [],
        }
    except Exception as e:
        logger.error(f"generate_reference_solution error: {e}")
        return {'error': str(e), 'reference_solution': '', 'correction_criteria': ''}


# ─── Tool 5 : auto_correct_submission ─────────────────────────────────────────

def auto_correct_submission(
    statement: str,
    reference_solution: str,
    student_code: str,
    language: str,
    correction_criteria: str = "",
    max_grade: float = 20.0,
) -> dict:
    """
    MCP Tool: Auto-corrects a student's code submission.
    Returns: { correction_report: str, proposed_grade: float, strengths: list, weaknesses: list }
    """
    lang_label = LANGUAGE_LABELS.get(language, language)

    system = f"""Tu es un correcteur expert en {lang_label}.
Corrige le code étudiant de façon pédagogique, détaillée et bienveillante.
Tu dois être équitable et justifier chaque point.

Format JSON strict:
{{
  "correction_report": "rapport détaillé en Markdown",
  "proposed_grade": <float entre 0 et {max_grade}>,
  "strengths": ["point fort 1", ...],
  "weaknesses": ["point à améliorer 1", ...]
}}"""

    criteria_section = f"\nGrille d'évaluation:\n{correction_criteria}" if correction_criteria else ""

    user_msg = f"""## Énoncé
{statement[:1500]}

## Solution de référence
```{language}
{reference_solution[:2000]}
```
{criteria_section}

## Code de l'étudiant à corriger
```{language}
{student_code[:3000]}
```

Génère le rapport de correction complet sur {max_grade} points."""

    try:
        llm = _llm_robust(temperature=0.1)
        response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user_msg)])
        raw = response.content.strip()
        if '```json' in raw:
            raw = raw.split('```json')[1].split('```')[0].strip()
        result = json.loads(raw)
        return {
            "correction_report": result.get("correction_report", raw),
            "proposed_grade": min(float(result.get("proposed_grade", 0)), max_grade),
            "strengths": result.get("strengths", []),
            "weaknesses": result.get("weaknesses", []),
        }
    except json.JSONDecodeError:
        return {
            "correction_report": raw,
            "proposed_grade": 0.0,
            "strengths": [],
            "weaknesses": [],
        }
    except Exception as e:
        logger.error(f"auto_correct_submission error: {e}")
        return {
            "error": str(e),
            "correction_report": "Erreur lors de la correction automatique.",
            "proposed_grade": 0.0,
        }


# ─── Tool 6 : propose_grade ───────────────────────────────────────────────────

def propose_grade(correction_report: str, max_grade: float = 20.0) -> dict:
    """
    MCP Tool: Extracts/refines the numeric grade from a correction report.
    Returns: { proposed_grade: float, confidence: str }
    """
    system = f"""Tu es un évaluateur académique.
Lis le rapport de correction et propose une note finale justifiée sur {max_grade} points.
Format JSON strict: {{"proposed_grade": <float>, "confidence": "high|medium|low", "justification": "..."}}"""

    user_msg = f"""Rapport de correction:
{correction_report[:3000]}

Propose une note sur {max_grade} points."""

    try:
        llm = _llm(temperature=0.0)
        response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user_msg)])
        raw = response.content.strip()
        if '```json' in raw:
            raw = raw.split('```json')[1].split('```')[0].strip()
        result = json.loads(raw)
        grade = min(float(result.get("proposed_grade", 0)), max_grade)
        return {
            "proposed_grade": grade,
            "confidence": result.get("confidence", "medium"),
            "justification": result.get("justification", ""),
        }
    except Exception as e:
        logger.error(f"propose_grade error: {e}")
        return {"proposed_grade": 0.0, "confidence": "low", "justification": str(e)}


# ─── Tool 7 : parse_tp_questions ─────────────────────────────────────────────

def parse_tp_questions(statement: str, language: str, max_grade: float = 20.0) -> dict:
    """
    MCP Tool: Parses a TP statement and extracts a structured list of questions.
    Returns: { questions: [{id, title, text, points}] }
    """
    lang_label = LANGUAGE_LABELS.get(language, language)

    system = f"""Tu es un expert pédagogique spécialisé en {lang_label}.
Analyse l'énoncé du TP et extrais la liste structurée de toutes les questions/exercices.
Chaque question doit avoir : id (entier à partir de 1), title (titre court), text (texte complet de la question), points (points attribués).
La somme des points doit être proche de {max_grade}.
Si l'énoncé n'a pas de questions distinctes, crée une seule question avec tout l'énoncé.

Format JSON strict:
{{
  "questions": [
    {{"id": 1, "title": "Titre court", "text": "Texte complet de la question", "points": 5}},
    ...
  ]
}}"""

    user_msg = f"""Énoncé du TP ({lang_label}):
{statement[:3000]}

Extrais les questions structurées. Note maximale totale: {max_grade} points."""

    try:
        llm = _llm(temperature=0.2)
        response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user_msg)])
        raw = response.content.strip()
        if '```json' in raw:
            raw = raw.split('```json')[1].split('```')[0].strip()
        elif '```' in raw:
            raw = raw.split('```')[1].split('```')[0].strip()
        result = json.loads(raw)
        questions = result.get('questions', [])
        # Ensure all fields exist
        for i, q in enumerate(questions):
            q.setdefault('id', i + 1)
            q.setdefault('title', f'Question {i + 1}')
            q.setdefault('text', '')
            q.setdefault('points', round(max_grade / len(questions), 1))
        return {'questions': questions}
    except Exception as e:
        logger.error(f"parse_tp_questions error: {e}")
        # Fallback: single question with whole statement
        return {
            'questions': [
                {'id': 1, 'title': 'Exercice', 'text': statement, 'points': max_grade}
            ]
        }


# ─── Tool 8 : generate_question_starter ──────────────────────────────────────

def generate_question_starter(question_text: str, language: str) -> dict:
    """
    MCP Tool: Generates the question text as code comments + a starter code template.
    Returns: { comment_header: str, starter_code: str }
    Used by the frontend to insert into the code editor when student clicks "Insérer l'énoncé".
    """
    lang_label = LANGUAGE_LABELS.get(language, language)

    # Comment syntax per language
    comment_styles = {
        'python': ('#', None),
        'r':      ('#', None),
        'sql':    ('--', None),
        'java':   ('//', ('/*', '*/')),
        'c':      ('//', ('/*', '*/')),
        'cpp':    ('//', ('/*', '*/')),
    }
    single, block = comment_styles.get(language, ('#', None))

    system = f"""Tu es un expert {lang_label} et formateur universitaire.
Pour la question donnée, génère:
1. L'énoncé de la question formaté en commentaires {lang_label} (utilise la syntaxe de commentaire appropriée)
2. Un code de démarrage (template) avec structure/squelette pour aider l'étudiant

Le code de démarrage doit:
- Commencer par l'énoncé en commentaire
- Inclure les signatures de fonctions/classes si approprié
- Contenir des marqueurs TODO pour les parties à compléter
- Inclure les imports nécessaires si pertinent

Format JSON strict:
{{
  "comment_header": "énoncé formaté en commentaires {lang_label}",
  "starter_code": "code complet avec commentaires et TODOs"
}}"""

    user_msg = f"""Question à formater:
{question_text[:1500]}

Génère le commentaire et le code de démarrage en {lang_label}."""

    try:
        llm = _llm(temperature=0.3)
        response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user_msg)])
        raw = response.content.strip()
        if '```json' in raw:
            raw = raw.split('```json')[1].split('```')[0].strip()
        elif '```' in raw:
            raw = raw.split('```')[1].split('```')[0].strip()
        result = json.loads(raw)
        return {
            'comment_header': result.get('comment_header', ''),
            'starter_code': result.get('starter_code', ''),
        }
    except Exception as e:
        logger.error(f"generate_question_starter error: {e}")
        # Fallback: format with single-line comments
        lines = question_text.strip().split('\n')
        comment = '\n'.join(f"{single} {line}" for line in lines)
        return {
            'comment_header': comment,
            'starter_code': f"{comment}\n\n# TODO: Votre solution ici\n",
        }


# ─── Tool 9: chat_with_student ────────────────────────────────────────────────

def chat_with_student(
    question_text: str,
    language: str,
    student_message: str,
    conversation_history: list = None,
    student_code: str = "",
) -> dict:
    """
    MCP Tool: Socratic chatbot for formative TP assistance.
    Guides students without giving direct answers.
    Returns: { reply: str }
    """
    lang_label = LANGUAGE_LABELS.get(language, language)
    conversation_history = conversation_history or []

    system = f"""Tu es un tuteur pédagogique expert en {lang_label}, bienveillant et encourageant.

TON RÔLE: Aider l'étudiant à COMPRENDRE et TROUVER la solution par lui-même (méthode socratique).

RÈGLES STRICTES — À respecter ABSOLUMENT:
❌ NE JAMAIS donner le code solution directement
❌ NE JAMAIS résoudre l'exercice à la place de l'étudiant
✅ Poser des questions guidantes pour stimuler la réflexion
✅ Expliquer les CONCEPTS sous-jacents sans résoudre
✅ Donner des INDICES progressifs si l'étudiant est bloqué
✅ Suggérer de tester, décomposer le problème, chercher dans la doc
✅ Encourager et valoriser les bonnes approches
✅ Corriger les misconceptions avec pédagogie
✅ Si le code est fourni, pointer les pistes d'amélioration sans réécrire

Sois concis (3-5 phrases max par réponse), chaleureux et pédagogique.
Réponds TOUJOURS en français."""

    # Build message history
    messages = [SystemMessage(content=system)]

    # Add context
    code_ctx = f"\n\n[Code actuel de l'étudiant]:\n```{language}\n{student_code[:500]}\n```" if student_code.strip() else ""
    context_msg = f"[Question du TP]:\n{question_text[:600]}{code_ctx}"
    messages.append(HumanMessage(content=context_msg))
    messages.append(SystemMessage(content="Compris. Je vais guider l'étudiant de manière socratique."))

    # Add conversation history (last 8 messages)
    for msg in conversation_history[-8:]:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        if role == 'user':
            messages.append(HumanMessage(content=content))
        else:
            messages.append(SystemMessage(content=content))

    # Add current message
    messages.append(HumanMessage(content=student_message))

    try:
        llm = _llm(temperature=0.6)
        response = llm.invoke(messages)
        return {'reply': response.content.strip()}
    except Exception as e:
        logger.error(f"chat_with_student error: {e}")
        return {'reply': "Je rencontre une difficulté technique. Essayez de décomposer votre problème étape par étape !"}

# ─── detect_tp_opportunities ─────────────────────────────────────────────────

def detect_tp_opportunities(chapter_id: int, language: str = "Python") -> dict:
    """
    Analyzes chapter documents and sections to detect practical work opportunities.
    Uses the regular Chapter model (chapter_id = Chapter.id) to access documents.
    Returns suggestions + metadata about scanned documents.
    """
    import json as _json
    import re as _re
    from app.models import Chapter, TNChapter, Syllabus

    # --- 1. Get the regular Chapter (with documents) ---
    chapter = Chapter.query.get(chapter_id)
    if not chapter:
        return {"suggestions": [], "docs_scanned": 0, "doc_names": [], "error": "Chapitre introuvable"}

    # --- 2. Build context from chapter documents ---
    docs = chapter.documents.all()
    doc_names = [d.title for d in docs]
    context_parts = [f"Titre du chapitre: {chapter.title}"]

    for doc in docs[:5]:  # limit to 5 documents
        doc_text = ""
        # Use summary if available
        if hasattr(doc, 'summary') and doc.summary:
            doc_text = doc.summary[:1200]
        # Fallback to description
        elif hasattr(doc, 'description') and doc.description:
            doc_text = doc.description[:800]
        if doc_text:
            context_parts.append(f"\n--- Document: {doc.title} ---\n{doc_text}")

    # --- 3. Enrich with section titles via Syllabus → TNChapter link ---
    try:
        syllabus = Syllabus.query.filter_by(course_id=chapter.course_id).first()
        if syllabus:
            for tn_ch in syllabus.tn_chapters:
                if tn_ch.index == chapter.order:
                    section_titles = [s.title for s in (tn_ch.sections or [])]
                    if section_titles:
                        context_parts.append("\nSections du chapitre: " + ", ".join(section_titles))
                    break
    except Exception:
        pass

    # --- 4. Enrich with text activities from sections ---
    try:
        from app.models import TNSection, SectionActivity
        if syllabus:
            for tn_ch in syllabus.tn_chapters:
                if tn_ch.index == chapter.order:
                    for section in (tn_ch.sections or [])[:4]:
                        acts = SectionActivity.query.filter_by(
                            section_id=section.id, activity_type='text_doc'
                        ).first()
                        if acts and acts.text_content:
                            context_parts.append(
                                f"\nContenu '{section.title}':\n{acts.text_content[:600]}"
                            )
    except Exception:
        pass

    if len(context_parts) <= 1:
        context_parts.append("(Pas de contenu disponible — génération basée sur le titre du chapitre)")

    context = "\n".join(context_parts)

    # --- 5. Call Gemini ---
    llm = _llm_robust(0.3)
    prompt = f"""Tu es un expert pédagogique universitaire. Analyse le contenu ci-dessous et propose 3 à 5 travaux pratiques (TP) pertinents et progressifs.

{context}

Langage de programmation: {language}

Pour chaque TP proposé, fournis:
1. Un titre court et précis (max 60 caractères)
2. Une description pédagogique de 2-3 phrases (objectif + compétences visées)
3. Le type: "exercice", "projet", "analyse_donnees", "implementation", "simulation"
4. La durée estimée: "1h", "2h", "3h", "4h"
5. La difficulté: "debutant", "intermediaire", "avance"

Réponds UNIQUEMENT en JSON valide:
{{
  "suggestions": [
    {{
      "title": "...",
      "description": "...",
      "type": "exercice",
      "estimated_duration": "2h",
      "difficulty": "intermediaire"
    }}
  ]
}}"""

    try:
        response = llm.invoke(prompt)
        text = response.content if hasattr(response, 'content') else str(response)
        # Extract JSON block
        match = _re.search(r'\{[\s\S]*\}', text)
        if match:
            result = _json.loads(match.group())
            result["docs_scanned"] = len(docs)
            result["doc_names"] = doc_names
            return result
    except Exception as e:
        logger.error(f"detect_tp_opportunities error: {e}")

    return {"suggestions": [], "docs_scanned": len(docs), "doc_names": doc_names}
