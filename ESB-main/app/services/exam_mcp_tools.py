"""
exam_mcp_tools.py — MCP Tool definitions for exam multi-agent evaluation.

Each tool is a plain Python function callable within Flask app context.
Used by exam_agent_graph.py LangGraph nodes.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from typing import Any, Dict, List, Optional

from flask import current_app

# Reuse LLM helpers from mcp_tools
from app.services.mcp_tools import _llm, _llm_robust  # noqa: F401


# ── Unified Tag Constants ──────────────────────────────────────────────────────
# Single source of truth for all exam tags. Used by MCP tools, agent nodes, and API.

BLOOM_LEVELS = ['Mémoriser', 'Comprendre', 'Appliquer', 'Analyser', 'Évaluer', 'Créer']

BLOOM_DISTRIBUTION_IDEAL = {
    'Mémoriser': 10,
    'Comprendre': 20,
    'Appliquer': 30,
    'Analyser': 20,
    'Évaluer': 15,
    'Créer': 5,
}

DIFFICULTY_LEVELS = ['Très facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile']

QUESTION_TYPES = ['QCM', 'Ouvert', 'Pratique', 'Vrai/Faux', 'Calcul', 'Étude de cas']

BLOOM_COLORS = {
    'Mémoriser': '#3b82f6',
    'Comprendre': '#22c55e',
    'Appliquer': '#eab308',
    'Analyser': '#f97316',
    'Évaluer': '#ef4444',
    'Créer': '#a855f7',
}

DIFFICULTY_COLORS = {
    'Très facile': '#22c55e',
    'Facile': '#86efac',
    'Moyen': '#eab308',
    'Difficile': '#f97316',
    'Très difficile': '#ef4444',
}


# ── MCP Tool Schema Registry ───────────────────────────────────────────────────
EXAM_MCP_TOOL_DEFINITIONS = [
    {
        "name": "extract_exam_text",
        "description": "Extracts raw text from an uploaded exam file (PDF, DOCX, TXT).",
        "inputSchema": {
            "type": "object",
            "properties": {"file_path": {"type": "string"}},
            "required": ["file_path"],
        },
    },
    {
        "name": "extract_exam_questions",
        "description": "Uses AI to parse the raw exam text and extract a structured list of questions with points.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "exam_text": {"type": "string"},
                "language": {"type": "string"},
            },
            "required": ["exam_text"],
        },
    },
    {
        "name": "classify_questions_aa",
        "description": "Classifies each extracted question against the course Apprentissages Attendus (AA) codes.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "questions": {"type": "array"},
                "aa_list": {"type": "array"},
            },
            "required": ["questions", "aa_list"],
        },
    },
    {
        "name": "classify_questions_bloom",
        "description": "Classifies each question by Bloom's Taxonomy level.",
        "inputSchema": {
            "type": "object",
            "properties": {"questions": {"type": "array"}},
            "required": ["questions"],
        },
    },
    {
        "name": "assess_question_difficulty",
        "description": "For each question, assesses its difficulty level relative to the course content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "questions": {"type": "array"},
                "course_context": {"type": "string"},
            },
            "required": ["questions"],
        },
    },
    {
        "name": "compare_module_vs_exam",
        "description": "Compares the content distribution of the module syllabus with the exam.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "questions": {"type": "array"},
                "aa_list": {"type": "array"},
                "course_context": {"type": "string"},
            },
            "required": ["questions", "aa_list"],
        },
    },
    {
        "name": "generate_exam_feedback",
        "description": "Generates detailed pedagogical feedback based on the comparison analysis.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "comparison_report": {"type": "object"},
                "questions": {"type": "array"},
            },
            "required": ["comparison_report", "questions"],
        },
    },
    {
        "name": "suggest_exam_adjustments",
        "description": "Suggests specific question-level and exam-level adjustments to improve balance, difficulty, and AA coverage.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "feedback": {"type": "string"},
                "questions": {"type": "array"},
                "aa_list": {"type": "array"},
            },
            "required": ["feedback", "questions", "aa_list"],
        },
    },
    {
        "name": "generate_exam_latex",
        "description": "Generates a complete LaTeX document for the adjusted exam and compiles it to PDF.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "questions": {"type": "array"},
                "exam_title": {"type": "string"},
                "course_name": {"type": "string"},
            },
            "required": ["questions"],
        },
    },
    {
        "name": "evaluate_exam_proposal",
        "description": "Evaluates the newly generated exam proposal against pedagogical criteria.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "latex_source": {"type": "string"},
                "original_feedback": {"type": "string"},
            },
            "required": ["latex_source"],
        },
    },
    {
        "name": "generate_question_correction",
        "description": "Generates a model correction/answer for a single validated exam question, including grading criteria and point breakdown.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question_text": {"type": "string"},
                "question_type": {"type": "string"},
                "bloom_level": {"type": "string"},
                "difficulty": {"type": "string"},
                "points": {"type": "number"},
                "aa_codes": {"type": "array", "items": {"type": "string"}},
                "course_context": {"type": "string"},
            },
            "required": ["question_text", "question_type", "points"],
        },
    },
    {
        "name": "correct_student_answer",
        "description": "Evaluates a student's answer against a reference correction, assigning a score and providing detailed feedback.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question_text": {"type": "string"},
                "question_type": {"type": "string"},
                "reference_correction": {"type": "string"},
                "student_answer": {"type": "string"},
                "max_points": {"type": "number"},
                "grading_criteria": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["question_text", "reference_correction", "student_answer", "max_points"],
        },
    },
    {
        "name": "sync_question_tags",
        "description": "Re-classifies a question's Bloom level, difficulty, and AA codes after modification. Ensures tag consistency.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question_text": {"type": "string"},
                "question_type": {"type": "string"},
                "current_bloom": {"type": "string"},
                "current_difficulty": {"type": "string"},
                "current_aa_codes": {"type": "array"},
                "aa_list": {"type": "array"},
                "course_context": {"type": "string"},
            },
            "required": ["question_text"],
        },
    },
]


# ── Helper: get course context from documents ─────────────────────────────────

def _get_course_context(course_id: int, max_chars: int = 12000) -> str:
    """Return concatenated text from all course documents (for RAG context)."""
    from app.models import Document
    from app.services.tn_exam_evaluation_service import extract_text_from_file

    upload_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')

    docs = Document.query.filter_by(course_id=course_id).filter(
        Document.document_type.notin_(['tn_exam'])
    ).all()
    parts: List[str] = []
    total = 0
    for doc in docs:
        if not doc.file_path or total >= max_chars:
            continue
        # Resolve to absolute path (stored as relative to UPLOAD_FOLDER)
        abs_path = os.path.join(upload_dir, doc.file_path)
        if not os.path.exists(abs_path):
            continue
        try:
            txt = extract_text_from_file(abs_path)
            if txt:
                parts.append(f"=== {doc.title} ===\n{txt[:3000]}")
                total += len(txt)
        except Exception:
            pass
    return "\n\n".join(parts) or "Aucun document de cours disponible."


# ── Tool Implementations ──────────────────────────────────────────────────────

def extract_exam_text(file_path: str) -> str:
    """Extract raw text from exam file."""
    from app.services.tn_exam_evaluation_service import extract_text_from_file
    return extract_text_from_file(file_path)


def extract_exam_questions(exam_text: str, language: str = "fr") -> List[Dict[str, Any]]:
    """Parse exam text and return structured questions list."""
    llm = _llm_robust(0.1)
    prompt = f"""Tu es un expert en analyse pédagogique. Analyse ce texte d'examen et extrais toutes les questions/exercices.

TEXTE DE L'EXAMEN:
{exam_text[:8000]}

Pour chaque question, extrais:
- number: numéro de la question (entier)
- text: texte complet de la question (inclure l'énoncé principal)
- points: nombre de points si mentionné (float ou null)
- sub_questions: liste des sous-questions si présentes

Réponds UNIQUEMENT avec un tableau JSON valide, sans commentaires:
[{{"number": 1, "text": "...", "points": 4, "sub_questions": [{{"text": "...", "points": 2}}]}}, ...]"""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        match = re.search(r'\[.*\]', content, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        current_app.logger.error(f"extract_exam_questions error: {e}")
    return []


def classify_questions_aa(questions: List[Dict], aa_list: List[Dict]) -> List[Dict]:
    """Classify each question by AA codes."""
    if not questions or not aa_list:
        return questions
    llm = _llm_robust(0.1)
    aa_str = "\n".join([f"AA{a['AA#']}: {a['AA Description']}" for a in aa_list])
    q_str = "\n".join([f"Q{q['number']}: {q['text'][:300]}" for q in questions])
    prompt = f"""Pour chaque question d'examen, identifie les Apprentissages Attendus (AA) couverts.

LISTE DES AA DU MODULE:
{aa_str}

QUESTIONS DE L'EXAMEN:
{q_str}

Réponds UNIQUEMENT avec un objet JSON mapping numéro de question → liste d'AA:
{{"1": [1, 2], "2": [3], "3": [1, 3, 4], ...}}

Règle: assigne au moins 1 AA par question. Si aucun AA ne correspond, assigne l'AA le plus proche."""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            mapping = json.loads(match.group())
            for q in questions:
                codes = mapping.get(str(q['number']), [])
                q['aa_codes'] = [int(c) for c in codes] if codes else []
    except Exception as e:
        current_app.logger.error(f"classify_questions_aa error: {e}")
    return questions


def classify_questions_bloom(questions: List[Dict]) -> List[Dict]:
    """Classify each question by Bloom's Taxonomy level."""
    if not questions:
        return questions
    llm = _llm_robust(0.1)
    q_str = "\n".join([f"Q{q['number']}: {q['text'][:300]}" for q in questions])
    prompt = f"""Classifie chaque question selon la Taxonomie de Bloom.

Niveaux (du plus bas au plus haut):
1. Mémoriser - rappel de faits, définitions
2. Comprendre - expliquer, résumer, interpréter
3. Appliquer - utiliser dans un nouveau contexte
4. Analyser - décomposer, comparer, distinguer
5. Évaluer - juger, critiquer, justifier
6. Créer - concevoir, construire, formuler

QUESTIONS:
{q_str}

Réponds UNIQUEMENT avec un objet JSON:
{{"1": "Appliquer", "2": "Analyser", "3": "Mémoriser", ...}}"""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            mapping = json.loads(match.group())
            for q in questions:
                q['bloom_level'] = mapping.get(str(q['number']), 'Non classifié')
    except Exception as e:
        current_app.logger.error(f"classify_questions_bloom error: {e}")
    return questions


def assess_question_difficulty(questions: List[Dict], course_context: str) -> List[Dict]:
    """Assess difficulty of each question relative to course content."""
    if not questions:
        return questions
    llm = _llm_robust(0.2)
    q_str = "\n".join([f"Q{q['number']}: {q['text'][:300]}" for q in questions])
    context_preview = course_context[:4000]
    prompt = f"""Évalue la difficulté de chaque question d'examen par rapport au contenu du cours.

CONTENU DU COURS (extrait):
{context_preview}

QUESTIONS:
{q_str}

Niveaux de difficulté: Très facile | Facile | Moyen | Difficile | Très difficile

Réponds UNIQUEMENT avec un objet JSON:
{{"1": {{"difficulty": "Moyen", "justification": "La question teste l'application directe du cours"}}, "2": {{"difficulty": "Difficile", "justification": "..."}}, ...}}"""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            mapping = json.loads(match.group())
            for q in questions:
                info = mapping.get(str(q['number']), {})
                q['difficulty'] = info.get('difficulty', 'Moyen')
                q['difficulty_justification'] = info.get('justification', '')
    except Exception as e:
        current_app.logger.error(f"assess_question_difficulty error: {e}")
    return questions


def compare_module_vs_exam(
    questions: List[Dict],
    aa_list: List[Dict],
    course_context: str,
) -> Dict[str, Any]:
    """Compare module content distribution vs exam content."""
    if not questions:
        return {}

    total_q = len(questions)
    total_pts = sum(q.get('points') or 1 for q in questions)

    # AA coverage analysis
    all_aa_nums = {int(a['AA#']) for a in aa_list}
    covered_aa: set = set()
    aa_question_count: Dict[int, int] = {}
    for q in questions:
        for aa in (q.get('aa_codes') or []):
            covered_aa.add(int(aa))
            aa_question_count[int(aa)] = aa_question_count.get(int(aa), 0) + 1
    missing_aa = sorted(all_aa_nums - covered_aa)

    # Bloom distribution
    bloom_counts: Dict[str, int] = {}
    for q in questions:
        level = q.get('bloom_level', 'Non classifié')
        bloom_counts[level] = bloom_counts.get(level, 0) + 1
    bloom_pct = {k: round(v / total_q * 100, 1) for k, v in bloom_counts.items()}

    # Difficulty distribution
    diff_counts: Dict[str, int] = {}
    for q in questions:
        d = q.get('difficulty', 'Moyen')
        diff_counts[d] = diff_counts.get(d, 0) + 1
    diff_pct = {k: round(v / total_q * 100, 1) for k, v in diff_counts.items()}

    aa_coverage = round(len(covered_aa) / len(all_aa_nums) * 100, 1) if all_aa_nums else 0

    return {
        "total_questions": total_q,
        "total_points": total_pts,
        "aa_coverage_rate": aa_coverage,
        "covered_aa": sorted(covered_aa),
        "missing_aa": missing_aa,
        "aa_question_distribution": aa_question_count,
        "bloom_distribution": bloom_counts,
        "bloom_percentages": bloom_pct,
        "expected_bloom_distribution": {
            "Mémoriser": 10, "Comprendre": 20, "Appliquer": 30,
            "Analyser": 20, "Évaluer": 15, "Créer": 5,
        },
        "difficulty_distribution": diff_counts,
        "difficulty_percentages": diff_pct,
        "aa_list": aa_list,
    }


def generate_exam_feedback(comparison_report: Dict[str, Any], questions: List[Dict]) -> str:
    """Generate pedagogical feedback from the comparison analysis."""
    llm = _llm_robust(0.4)
    report_str = json.dumps(comparison_report, ensure_ascii=False, indent=2)[:3000]
    prompt = f"""Tu es un expert en ingénierie pédagogique. Analyse ce rapport de comparaison entre le module et l'examen, et génère un feedback détaillé.

RAPPORT D'ANALYSE:
{report_str}

NOMBRE DE QUESTIONS: {len(questions)}

Génère un feedback structuré en 3 parties:
1. **Points forts** (ce qui est bien dans cet examen)
2. **Points d'amélioration** (lacunes identifiées: AA manquants, déséquilibre Bloom, difficulté inadaptée)
3. **Analyse critique** (comparaison avec la distribution idéale TN)

Sois précis, cite les AA et niveaux Bloom concernés. Réponds en français, format Markdown."""

    try:
        response = llm.invoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)
    except Exception as e:
        current_app.logger.error(f"generate_exam_feedback error: {e}")
        return "Erreur lors de la génération du feedback."


def suggest_exam_adjustments(
    feedback: str,
    questions: List[Dict],
    aa_list: List[Dict],
) -> List[Dict]:
    """Suggest specific adjustments for the exam."""
    llm = _llm_robust(0.5)
    aa_str = "\n".join([f"AA{a['AA#']}: {a['AA Description']}" for a in aa_list])
    q_str = "\n".join([
        f"Q{q['number']} ({q.get('bloom_level','?')}, {q.get('difficulty','?')}, AA{q.get('aa_codes',[])}): {q['text'][:200]}"
        for q in questions
    ])
    prompt = f"""Basé sur ce feedback pédagogique, propose des ajustements concrets pour améliorer l'examen.

FEEDBACK:
{feedback[:2000]}

QUESTIONS ACTUELLES:
{q_str[:3000]}

AA DU MODULE:
{aa_str}

Pour chaque ajustement, précise:
- type: "modifier_question" | "ajouter_question" | "supprimer_question" | "ajuster_points"
- target_question: numéro de question concernée (ou null si nouvelle question)
- description: description précise de l'ajustement
- new_text: nouveau texte de question si modification (ou null)
- bloom_target: niveau Bloom visé
- aa_target: AA cibles [liste de numéros]
- points: points suggérés

Réponds UNIQUEMENT avec un tableau JSON:
[{{"type": "modifier_question", "target_question": 2, "description": "...", "new_text": "...", "bloom_target": "Analyser", "aa_target": [1,2], "points": 4}}, ...]"""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        match = re.search(r'\[.*\]', content, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        current_app.logger.error(f"suggest_exam_adjustments error: {e}")
    return []


def generate_exam_latex(
    questions: List[Dict],
    adjustments: List[Dict],
    exam_title: str = "Examen Final",
    course_name: str = "Module",
    course_id: int = 0,
) -> Dict[str, Any]:
    """Generate a LaTeX exam document and compile to PDF."""
    llm = _llm_robust(0.3)

    # Apply adjustments to questions
    adjusted_questions = list(questions)
    for adj in (adjustments or []):
        if adj.get('type') == 'modifier_question' and adj.get('target_question'):
            for q in adjusted_questions:
                if q['number'] == adj['target_question']:
                    if adj.get('new_text'):
                        q['text'] = adj['new_text']
                    if adj.get('points'):
                        q['points'] = adj['points']
                    q['bloom_level'] = adj.get('bloom_target', q.get('bloom_level', ''))
                    break
        elif adj.get('type') == 'ajouter_question' and adj.get('new_text'):
            new_num = max((q['number'] for q in adjusted_questions), default=0) + 1
            adjusted_questions.append({
                'number': new_num,
                'text': adj['new_text'],
                'points': adj.get('points', 2),
                'bloom_level': adj.get('bloom_target', ''),
                'aa_codes': adj.get('aa_target', []),
            })

    q_descriptions = "\n".join([
        f"Q{q['number']} ({q.get('points', '?')} pts, {q.get('bloom_level', '?')}): {q['text'][:200]}"
        for q in adjusted_questions
    ])

    prompt = f"""Génère un document LaTeX complet et compilable pour cet examen universitaire.

TITRE: {exam_title}
MODULE: {course_name}
QUESTIONS:
{q_descriptions}

Règles LaTeX:
- Utilise \\documentclass[12pt]{{article}}
- Inclure: \\usepackage[utf8]{{inputenc}}, \\usepackage[french]{{babel}}, \\usepackage{{geometry}}, \\usepackage{{amsmath}}, \\usepackage{{enumitem}}
- En-tête: établissement "École Supérieure de Biologie", module, durée, date
- Une section par question avec \\section*{{Question N (X points)}}
- Format propre et professionnel
- Le document doit compiler sans erreurs avec pdflatex

Réponds UNIQUEMENT avec le code LaTeX complet (depuis \\documentclass jusqu'à \\end{{document}}).
N'inclus PAS de blocs markdown. Le LaTeX doit commencer directement par \\documentclass."""

    latex_source = ""
    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        # Remove markdown code blocks if present
        content = re.sub(r'^```(?:latex|tex)?\s*', '', content.strip(), flags=re.MULTILINE)
        content = re.sub(r'\s*```$', '', content.strip(), flags=re.MULTILINE)
        if '\\documentclass' in content:
            latex_source = content[content.index('\\documentclass'):]
        else:
            latex_source = content
    except Exception as e:
        current_app.logger.error(f"generate_exam_latex LLM error: {e}")
        return {"latex_source": "", "pdf_path": None, "error": str(e), "adjusted_questions": adjusted_questions}

    # Compile to PDF
    pdf_path = None
    compile_error = None
    pdflatex_bin = r"C:\Users\aymen\AppData\Local\Programs\MiKTeX\miktex\bin\x64\pdflatex.exe"

    if os.path.exists(pdflatex_bin) and latex_source:
        try:
            output_dir = os.path.join(
                current_app.config.get('UPLOAD_FOLDER', 'uploads'),
                'exam_latex',
                str(course_id),
            )
            os.makedirs(output_dir, exist_ok=True)
            tex_file = os.path.join(output_dir, f'exam_{course_id}.tex')
            pdf_file = os.path.join(output_dir, f'exam_{course_id}.pdf')

            with open(tex_file, 'w', encoding='utf-8') as f:
                f.write(latex_source)

            result = subprocess.run(
                [pdflatex_bin, '-interaction=nonstopmode', '-output-directory', output_dir, tex_file],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if os.path.exists(pdf_file):
                pdf_path = pdf_file
            else:
                compile_error = result.stdout[-2000:] if result.stdout else "Compilation failed"
                current_app.logger.warning(f"pdflatex failed: {compile_error}")
        except Exception as e:
            compile_error = str(e)
            current_app.logger.error(f"pdflatex compilation error: {e}")

    return {
        "latex_source": latex_source,
        "pdf_path": pdf_path,
        "compile_error": compile_error,
        "adjusted_questions": adjusted_questions,
    }


def evaluate_exam_proposal(
    latex_source: str,
    original_feedback: str,
    aa_list: List[Dict],
) -> Dict[str, Any]:
    """Evaluate the new exam proposal quality."""
    llm = _llm_robust(0.3)
    aa_str = "\n".join([f"AA{a['AA#']}: {a['AA Description']}" for a in aa_list])
    latex_preview = latex_source[:3000] if latex_source else "Aucun LaTeX généré"
    prompt = f"""Évalue la qualité de cette nouvelle proposition d'examen.

AA DU MODULE:
{aa_str}

FEEDBACK ORIGINAL (problèmes identifiés):
{original_feedback[:1500]}

EXTRAIT DU NOUVEL EXAMEN (LaTeX):
{latex_preview}

Évalue selon ces critères (note /20 chacun):
1. Couverture des AA (tous les AA importants sont testés)
2. Équilibre Bloom (répartition des niveaux cognitifs)
3. Cohérence difficulté (progressivité, adaptation au niveau)
4. Qualité des questions (clarté, précision, faisabilité)
5. Amélioration par rapport à l'original

Réponds avec un objet JSON:
{{
  "scores": {{"aa_coverage": 16, "bloom_balance": 14, "difficulty_coherence": 17, "question_quality": 15, "improvement": 18}},
  "overall_score": 16,
  "overall_grade": "Bien",
  "strengths": ["...", "..."],
  "remaining_issues": ["...", "..."],
  "final_recommendation": "..."
}}"""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        current_app.logger.error(f"evaluate_exam_proposal error: {e}")
    return {"overall_score": 0, "final_recommendation": "Évaluation non disponible."}


# ── Correction & Tag-Sync Tool Implementations ────────────────────────────────

def generate_question_correction(
    question_text: str,
    question_type: str,
    points: float,
    bloom_level: str = '',
    difficulty: str = '',
    aa_codes: List[str] = None,
    course_context: str = '',
) -> Dict[str, Any]:
    """Generate a model correction for a single exam question using unified LLM."""
    llm = _llm_robust(0.2)

    context_section = f"\nContexte du cours:\n{course_context[:2000]}" if course_context else ""

    prompt = f"""Tu es un enseignant expert. Génère une correction modèle complète pour cette question d'examen.

Question: {question_text}
Type: {question_type}
Bloom: {bloom_level or 'Non classifié'}
Difficulté: {difficulty or 'Non évaluée'}
Barème: {points} points
AA concernés: {', '.join(aa_codes or [])}
{context_section}

Retourne un objet JSON avec:
{{
    "correction": "<correction modèle détaillée>",
    "points_detail": "<répartition des points: ex. 1pt pour X, 2pts pour Y>",
    "criteres": ["<critère d'évaluation 1>", "<critère 2>", ...],
    "mots_cles": ["<mot-clé attendu 1>", "<mot-clé 2>", ...],
    "erreurs_courantes": ["<erreur fréquente 1>", "<erreur 2>", ...]
}}"""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        if isinstance(content, list):
            content = " ".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        current_app.logger.error(f"generate_question_correction error: {e}")

    return {
        "correction": "Correction non disponible.",
        "points_detail": f"{points} points",
        "criteres": [],
        "mots_cles": [],
        "erreurs_courantes": [],
    }


def correct_student_answer(
    question_text: str,
    reference_correction: str,
    student_answer: str,
    max_points: float,
    question_type: str = 'open_ended',
    grading_criteria: List[str] = None,
) -> Dict[str, Any]:
    """Evaluate a student answer against the reference correction using unified LLM."""
    llm = _llm_robust(0.1)

    criteria_section = ""
    if grading_criteria:
        criteria_section = "\nCritères d'évaluation:\n" + "\n".join(f"- {c}" for c in grading_criteria)

    prompt = f"""Tu es un correcteur d'examen universitaire. Évalue cette réponse d'étudiant.

Question: {question_text}
Type: {question_type}
Correction modèle: {reference_correction}
Réponse de l'étudiant: {student_answer or '(Aucune réponse)'}
Barème maximum: {max_points} points
{criteria_section}

Règles:
- Sois juste et précis dans la notation
- Accorde des points partiels quand pertinent
- Le score doit être entre 0 et {max_points}

Retourne un objet JSON:
{{
    "score": <nombre entre 0 et {max_points}>,
    "feedback": "<feedback détaillé pour l'étudiant>",
    "is_correct": <true si score >= {max_points * 0.5}>,
    "points_breakdown": "<détail des points accordés/retirés>",
    "improvement_suggestions": ["<suggestion 1>", ...]
}}"""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        if isinstance(content, list):
            content = " ".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            result = json.loads(match.group())
            result['score'] = min(float(result.get('score', 0)), max_points)
            return result
    except Exception as e:
        current_app.logger.error(f"correct_student_answer error: {e}")

    return {
        "score": 0,
        "feedback": "Correction automatique non disponible.",
        "is_correct": False,
        "points_breakdown": "",
        "improvement_suggestions": [],
    }


def sync_question_tags(
    question_text: str,
    question_type: str = '',
    current_bloom: str = '',
    current_difficulty: str = '',
    current_aa_codes: List[str] = None,
    aa_list: List[Dict] = None,
    course_context: str = '',
) -> Dict[str, Any]:
    """Re-classify a question's tags to ensure consistency. Uses pro model."""
    llm = _llm_robust(0.1)

    aa_str = ""
    if aa_list:
        aa_str = "\n".join([f"AA{a.get('AA#', a.get('number', '?'))}: {a.get('AA Description', a.get('description', ''))}" for a in aa_list])

    bloom_levels_str = ", ".join(BLOOM_LEVELS)
    difficulty_levels_str = ", ".join(DIFFICULTY_LEVELS)

    prompt = f"""Reclassifie cette question d'examen avec précision.

Question: {question_text}
Type: {question_type or 'Non spécifié'}

Tags actuels (à vérifier/corriger):
- Bloom: {current_bloom or 'Non classifié'}
- Difficulté: {current_difficulty or 'Non évaluée'}
- AA: {', '.join(current_aa_codes or []) or 'Non assignés'}

Niveaux Bloom valides: {bloom_levels_str}
Niveaux difficulté valides: {difficulty_levels_str}

AA disponibles du module:
{aa_str or 'Non disponibles'}

{f'Contexte du cours: {course_context[:1500]}' if course_context else ''}

Retourne un JSON:
{{
    "bloom_level": "<niveau Bloom exact parmi la liste>",
    "difficulty": "<niveau difficulté exact parmi la liste>",
    "aa_codes": ["AA1", "AA2"],
    "bloom_justification": "<pourquoi ce niveau>",
    "difficulty_justification": "<pourquoi cette difficulté>",
    "tags_changed": <true si au moins un tag a changé par rapport aux tags actuels>
}}"""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        if isinstance(content, list):
            content = " ".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            result = json.loads(match.group())
            # Validate against allowed values
            if result.get('bloom_level') not in BLOOM_LEVELS:
                result['bloom_level'] = current_bloom or 'Appliquer'
            if result.get('difficulty') not in DIFFICULTY_LEVELS:
                result['difficulty'] = current_difficulty or 'Moyen'
            return result
    except Exception as e:
        current_app.logger.error(f"sync_question_tags error: {e}")

    return {
        "bloom_level": current_bloom or 'Appliquer',
        "difficulty": current_difficulty or 'Moyen',
        "aa_codes": current_aa_codes or [],
        "tags_changed": False,
    }
