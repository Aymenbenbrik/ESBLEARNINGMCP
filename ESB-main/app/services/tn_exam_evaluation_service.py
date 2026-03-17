import os
import re
from typing import Any, Dict, List, Optional, Tuple

from flask import current_app
from langchain_core.messages import HumanMessage


from app.models import Course, Document, Syllabus, TNAA, TNChapter, TNSection
from app import db
from app.services.syllabus_service import SyllabusService
from app.services.evaluate_service import (
    extract_text_from_file,
    extract_questions_from_text,
    normalize_question_keys,
    classify_questions_bloom,
)
from app.services.vector_store import VectorStore


def _get_gemini_model_instance():
    # Reuse the helper from evaluate_service
    from app.services.evaluate_service import _get_gemini_model  # type: ignore
    return _get_gemini_model()


def _extract_json_array(text: str):
    from app.services.evaluate_service import _extract_json_array as _eja  # type: ignore
    return _eja(text)


def _course_learning_targets(course_id: int) -> List[Dict[str, Any]]:
    """Return TN AAs for a course's syllabus."""
    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    if not syllabus or (syllabus.syllabus_type or '').lower() != 'tn':
        return []
    aas = syllabus.tn_aa or []
    aas_sorted = sorted(aas, key=lambda a: int(a.number))
    return [{"AA#": int(a.number), "AA Description": a.description} for a in aas_sorted]


def _aa_to_chapters_sections(course_id: int) -> Tuple[Dict[int, List[Dict[str, Any]]], Dict[int, List[Dict[str, Any]]]]:
    """Map AA number -> related chapters / sections (TN normalized tables)."""
    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    if not syllabus or (syllabus.syllabus_type or '').lower() != 'tn':
        return {}, {}

    aa_to_chapters: Dict[int, List[Dict[str, Any]]] = {}
    aa_to_sections: Dict[int, List[Dict[str, Any]]] = {}

    # Build quick lookup for chapters/sections by relationships
    for aa in syllabus.tn_aa or []:
        n = int(aa.number)
        # Chapter links
        chapters = []
        for link in aa.chapter_links or []:
            ch = link.chapter
            if ch:
                chapters.append({"index": int(ch.index), "title": ch.title})
        chapters = sorted(chapters, key=lambda x: x["index"])
        if chapters:
            aa_to_chapters[n] = chapters

        sections = []
        for link in aa.section_links or []:
            sec = link.section
            if sec and sec.chapter:
                sections.append({
                    "chapter_index": int(sec.chapter.index),
                    "chapter_title": sec.chapter.title,
                    "index": sec.index,
                    "title": sec.title,
                })
        if sections:
            # sort by chapter then section index
            sections = sorted(sections, key=lambda x: (x["chapter_index"], str(x["index"])))
            aa_to_sections[n] = sections

    return aa_to_chapters, aa_to_sections


def _classify_questions_aa(questions: List[Dict[str, Any]], aa_targets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """LLM classification of questions to AAs."""
    if not questions:
        return []
    if not aa_targets:
        # No AA available; still return questions with AA=None
        out = []
        for q in questions:
            q2 = dict(q)
            q2["AA#"] = None
            out.append(q2)
        return out

    aa_text = "\n".join([f"AA#{a['AA#']}: {a['AA Description']}" for a in aa_targets])
    questions_text = "\n".join([f"{q['Question#']}: {q.get('Text') or q.get('QuestionText') or ''}" for q in questions])

    prompt = f"""
[INST]
Tu es un assistant qui classe des questions d'examen selon les acquis d'apprentissage (AA) du module.

Règles:
- Pour chaque question, retourne 1 à 3 AA maximum.
- Si une question est trop générale, choisis l'AA le plus proche.
- Retourne uniquement un JSON array valide.

Liste des AA disponibles:
{aa_text}

Questions:
{questions_text}

Format de sortie:
[
  {{"Question#": 1, "AA#": [1,2]}},
  ...
]
[/INST]
"""

    llm = _get_gemini_model_instance()
    messages = [
        HumanMessage(content=prompt)
    ]
    completion = llm.invoke(messages)
    response = completion.content
    classified = _extract_json_array(response) or []

    by_q = {int(x.get("Question#")): x for x in classified if x.get("Question#") is not None}
    out = []
    for q in questions:
        qn = int(q.get("Question#"))
        aa_val = by_q.get(qn, {}).get("AA#")
        # normalize
        if isinstance(aa_val, list):
            aa_list = [int(a) for a in aa_val if str(a).isdigit()]
        elif aa_val is None:
            aa_list = []
        else:
            aa_list = [int(aa_val)] if str(aa_val).isdigit() else []
        q2 = dict(q)
        q2["AA#"] = aa_list
        out.append(q2)
    return out


def _classify_questions_difficulty_5(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not questions:
        return []

    questions_text = "\n".join([f"{q['Question#']}: {q.get('Text') or q.get('QuestionText') or ''}" for q in questions])
    prompt = f"""
[INST]
Tu classes la difficulté d'une question d'examen, indépendamment de Bloom.

Niveaux:
1) Très facile: 1 étape directe, rappel simple, <2 minutes.
2) Facile: application simple, peu d'étapes, 2-4 minutes.
3) Moyen: plusieurs étapes, combinaison de concepts, 4-8 minutes.
4) Difficile: raisonnement profond, multi-concepts, pièges possibles, >8 minutes.
5) Très difficile: preuve/justification complexe, multi-volets, forte abstraction.

Retourne uniquement un JSON array comme:
[
  {{"Question#":1, "Difficulty":"Très facile"}},
  ...
]

Questions:
{questions_text}
[/INST]
"""
    llm = _get_gemini_model_instance()
    messages = [
        HumanMessage(content=prompt)
    ]
    completion = llm.invoke(messages)
    response = completion.content
    arr = _extract_json_array(response) or []
    by_q = {int(x.get("Question#")): x.get("Difficulty") for x in arr if x.get("Question#") is not None}
    out = []
    for q in questions:
        qn = int(q.get("Question#"))
        q2 = dict(q)
        diff = by_q.get(qn) or "Moyen"
        # Normalize spelling
        allowed = {"Très facile", "Facile", "Moyen", "Difficile", "Très difficile"}
        if diff not in allowed:
            diff = "Moyen"
        q2["Difficulty"] = diff
        out.append(q2)
    return out


def _get_course_documents_for_rag(course: Course) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Collect module + chapter docs and provide extracted text + metadata."""
    attachments_texts: List[str] = []
    metadata: List[Dict[str, Any]] = []

    # Module attachments
    module_docs = Document.query.filter_by(course_id=course.id, document_type='module_attachment').all()

    # Chapter docs (any document attached to a chapter of this course)
    chapter_ids = [c.id for c in course.chapters] if course.chapters else []
    chapter_docs = []
    if chapter_ids:
        chapter_docs = Document.query.filter(Document.chapter_id.in_(chapter_ids)).all()

    all_docs = []
    for d in module_docs:
        all_docs.append((d, None))
    for d in chapter_docs:
        # attach chapter meta
        ch = d.chapter
        all_docs.append((d, ch))

    upload_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')

    for i, (doc, chapter) in enumerate(all_docs):
        abs_path = os.path.join(upload_dir, doc.file_path) if doc.file_path else None
        if not abs_path or not os.path.exists(abs_path):
            continue

        # Ensure we have extraction text for non-pdf; if analysis_results exists, reuse extracted_text
        extracted_text = None
        try:
            if doc.analysis_results and isinstance(doc.analysis_results, dict):
                extracted_text = doc.analysis_results.get('extracted_text') or doc.analysis_results.get('text')
        except Exception:
            extracted_text = None

        meta = {
            "source_id": f"SRC{i+1}",
            "title": doc.title,
            "file_path": doc.file_path,
            "abs_path": abs_path,
            "filename": os.path.basename(doc.file_path) if doc.file_path else doc.title,
            "document_id": doc.id,
            "chapter": None,
        }
        if chapter is not None:
            meta["chapter"] = {"order": int(chapter.order), "title": chapter.title}
        if extracted_text:
            meta["extracted_text"] = extracted_text

        # We pass empty text list; PageIndex path uses files. But local fallback needs text.
        if extracted_text:
            attachments_texts.append(extracted_text)
        else:
            attachments_texts.append("")
        metadata.append(meta)

    return attachments_texts, metadata


_SOURCE_LINE_RE = re.compile(r"^\[SOURCE\s+(?P<src>[^\|\]]+)\s*\|\s*PAGE\s+(?P<page>[^\]]+)\]\s*(?P<excerpt>.*)$")


def _extract_sources_from_context(ctx: str, sources_meta: List[Dict[str, Any]], max_sources: int = 2) -> List[Dict[str, Any]]:
    """Parse [SOURCE SRCx | PAGE y] lines and map to file/chapter."""
    by_src = {m.get('source_id'): m for m in sources_meta}
    out: List[Dict[str, Any]] = []
    for line in (ctx or '').splitlines():
        line = line.strip()
        m = _SOURCE_LINE_RE.match(line)
        if not m:
            continue
        sid = m.group('src').strip()
        page = str(m.group('page')).strip()
        excerpt = (m.group('excerpt') or '').strip()
        meta = by_src.get(sid) or {}
        file_name = meta.get('filename') or meta.get('title')
        ch = meta.get('chapter')
        ch_label = None
        if isinstance(ch, dict) and ch.get('order'):
            ch_label = f"Chapitre {ch.get('order')}" if not ch.get('title') else f"Chapitre {ch.get('order')}: {ch.get('title')}"
        out.append({
            "file": file_name,
            "chapter": ch_label,
            "page": page,
            "excerpt": excerpt[:240],
            "document_id": meta.get('document_id'),
        })
        if len(out) >= max_sources:
            break
    return out


def analyze_tn_exam(course: Course, exam_document: Document) -> Dict[str, Any]:
    """Analyze a TN exam and return a dict suitable for storing in Document.analysis_results."""
    upload_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
    exam_abs = os.path.join(upload_dir, exam_document.file_path) if exam_document.file_path else None
    if not exam_abs or not os.path.exists(exam_abs):
        raise FileNotFoundError("Exam file not found")

    extracted_text = extract_text_from_file(exam_abs)
    if not extracted_text:
        raise ValueError("Failed to extract text from exam")

    # Extract + normalize questions
    questions_raw = extract_questions_from_text(extracted_text)
    questions = [normalize_question_keys(q) for q in questions_raw]

    # AA
    aa_targets = _course_learning_targets(course.id)
    q_with_aa = _classify_questions_aa(questions, aa_targets)

    # Bloom
    q_with_bloom = classify_questions_bloom(q_with_aa)

    # Difficulty (5)
    q_with_diff = _classify_questions_difficulty_5(q_with_bloom)

    aa_to_chapters, aa_to_sections = _aa_to_chapters_sections(course.id)

    # RAG sources per question
    attachments_texts, attachments_meta = _get_course_documents_for_rag(course)

    enriched_questions = []
    for q in q_with_diff:
        qtext = q.get('Text') or q.get('QuestionText') or ''
        # Use VectorStore for context retrieval
        ctx = ""
        used = []
        try:
            # Try to get context from indexed documents
            for i, meta in enumerate(attachments_meta):
                doc_id = meta.get('document_id') or meta.get('id')
                if doc_id:
                    vs = VectorStore(document_id=str(doc_id))
                    if vs.collection_exists():
                        doc_ctx = vs.get_context_for_query(qtext, max_chars=2000)
                        if doc_ctx:
                            ctx += f"\n{doc_ctx}"
                            used.append({'source_id': f'SRC{i+1}', **meta})
        except Exception:
            pass
        
        # Fallback: use raw text if no vector store results
        if not ctx and attachments_texts:
            for i, (text, meta) in enumerate(zip(attachments_texts, attachments_meta)):
                if qtext.lower() in text.lower():
                    ctx += f"\n{text[:1500]}"
                    used.append({'source_id': f'SRC{i+1}', **meta})
        
        sources = _extract_sources_from_context(ctx, used, max_sources=2)

        aa_list = q.get('AA#') or []
        chapters = []
        sections = []
        for a in aa_list:
            chapters.extend(aa_to_chapters.get(int(a), []))
            sections.extend(aa_to_sections.get(int(a), []))

        q2 = dict(q)
        q2['sources'] = sources
        q2['related_chapters'] = chapters[:5]
        q2['related_sections'] = sections[:8]
        enriched_questions.append(q2)

    # -----------------------------
    # Distributions (observed)
    # -----------------------------
    bloom_counts: Dict[str, int] = {}
    diff_counts: Dict[str, int] = {}
    aa_counts: Dict[str, int] = {}
    for q in enriched_questions:
        b = q.get('Bloom_Level') or 'Unknown'
        bloom_counts[b] = bloom_counts.get(b, 0) + 1
        d = q.get('Difficulty') or 'Moyen'
        diff_counts[d] = diff_counts.get(d, 0) + 1
        for a in (q.get('AA#') or []):
            aa_counts[str(a)] = aa_counts.get(str(a), 0) + 1

    total = len(enriched_questions) or 1
    bloom_pct = {k: round((v/total)*100, 1) for k, v in bloom_counts.items()}
    diff_pct = {k: round((v/total)*100, 1) for k, v in diff_counts.items()}
    aa_pct = {k: round((v/total)*100, 1) for k, v in aa_counts.items()}

    # -----------------------------
    # Expectations (heuristics)
    # -----------------------------
    # NOTE: If you want fully custom expectations, we can later add a small UI
    # (per-course settings) and store them in Syllabus / Course metadata.
    # Default expectations (can become configurable per-course later).
    # Bloom: equal distribution by default (simple + interpretable).
    expected_bloom = {
        "Mémoriser": 16.7,
        "Comprendre": 16.7,
        "Appliquer": 16.7,
        "Analyser": 16.7,
        "Évaluer": 16.6,
        "Créer": 16.6,
    }
    # Difficulty: target a "normal" mid-heavy exam.
    expected_difficulty = {
        "Très facile": 10.0,
        "Facile": 20.0,
        "Moyen": 40.0,
        "Difficile": 20.0,
        "Très difficile": 10.0,
    }

    # Expected AA coverage: uniform by default across all AAs in TN syllabus.
    expected_aa: Dict[str, float] = {}
    if aa_targets:
        per = round(100.0 / max(len(aa_targets), 1), 1)
        expected_aa = {str(a["AA#"]): per for a in aa_targets}

    def _delta(observed: Dict[str, float], expected: Dict[str, float]) -> Dict[str, float]:
        keys = set(observed.keys()) | set(expected.keys())
        return {k: round((observed.get(k, 0.0) - expected.get(k, 0.0)), 1) for k in keys}

    bloom_delta = _delta(bloom_pct, expected_bloom)
    diff_delta = _delta(diff_pct, expected_difficulty)
    aa_delta = _delta(aa_pct, expected_aa) if expected_aa else {}

    # -----------------------------
    # Alignment metrics
    # -----------------------------
    questions_with_sources = sum(1 for q in enriched_questions if (q.get('sources') or []))
    source_coverage_rate = round((questions_with_sources / max(len(enriched_questions), 1)) * 100, 1)

    aa_missing = []
    if aa_targets:
        covered = set(int(k) for k in aa_pct.keys() if str(k).isdigit())
        for a in aa_targets:
            if int(a["AA#"]) not in covered:
                aa_missing.append(int(a["AA#"]))
        aa_missing = sorted(aa_missing)

    bloom_missing = []
    for lvl in ["Mémoriser", "Comprendre", "Appliquer", "Analyser", "Évaluer", "Créer"]:
        if bloom_counts.get(lvl, 0) == 0:
            bloom_missing.append(lvl)

    # -----------------------------
    # Recommendations (simple, actionable)
    # -----------------------------
    recs: List[str] = []

    if aa_missing:
        # Mention related chapters/sections for first few missing AAs.
        for aa_num in aa_missing[:4]:
            ch = aa_to_chapters.get(aa_num, [])
            sec = aa_to_sections.get(aa_num, [])
            hint = ""
            if ch:
                hint = f" (chapitres: {', '.join([str(x['index']) for x in ch[:3]])})"
            elif sec:
                hint = f" (sections: {', '.join([str(x['index']) for x in sec[:3]])})"
            recs.append(f"Ajouter au moins 1 question pour couvrir AA#{aa_num}{hint}.")
        if len(aa_missing) > 4:
            recs.append(f"Couvrir aussi les autres AA non présents: {', '.join(map(lambda x: f'AA#{x}', aa_missing[4:]))}.")

    # Bloom balance
    low = (bloom_pct.get("Mémoriser", 0) + bloom_pct.get("Comprendre", 0))
    high = (bloom_pct.get("Analyser", 0) + bloom_pct.get("Évaluer", 0) + bloom_pct.get("Créer", 0))
    if low > 60:
        recs.append("Rééquilibrer Bloom: trop de (Mémoriser+Comprendre). Ajouter des questions d’Appliquer/Analyser.")
    if high < 15:
        recs.append("Augmenter les questions de haut niveau (Analyser/Évaluer/Créer) pour mieux tester le raisonnement.")
    if bloom_missing:
        recs.append(f"Niveaux Bloom absents: {', '.join(bloom_missing)}. Vérifier si c’est voulu (type d’examen) et ajuster.")

    # Difficulty balance
    if diff_pct.get("Très difficile", 0) > 20:
        recs.append("Attention: beaucoup de questions 'Très difficile'. Vérifier le temps et la charge cognitive.")
    if diff_pct.get("Très facile", 0) > 25:
        recs.append("Réduire les 'Très facile' (ou les regrouper en QCM rapides) pour libérer du temps aux questions clés.")

    # Source alignment
    if source_coverage_rate < 70:
        recs.append("Améliorer l’alignement aux supports: plusieurs questions n’ont pas de source claire dans les documents du module.")
        recs.append("Astuce: ajouter/compléter les documents (PDF/PPT/notes) ou reformuler les questions pour mieux coller au contenu enseigné.")

    if not recs:
        recs.append("L’examen est globalement équilibré et bien aligné avec les AA et les supports du module.")

    # -----------------------------
    # Overall interpretation (simple, high-signal)
    # -----------------------------
    diff_weight = {
        "Très facile": 1,
        "Facile": 2,
        "Moyen": 3,
        "Difficile": 4,
        "Très difficile": 5,
    }
    bloom_weight = {
        "Mémoriser": 1,
        "Comprendre": 2,
        "Appliquer": 3,
        "Analyser": 4,
        "Évaluer": 5,
        "Créer": 6,
    }

    def _weighted_avg(pct: Dict[str, float], weights: Dict[str, int]) -> float:
        s = 0.0
        w = 0.0
        for k, v in pct.items():
            if k in weights:
                s += float(v) * float(weights[k])
                w += float(v)
        return round((s / w), 2) if w else 0.0

    difficulty_index = _weighted_avg(diff_pct, diff_weight)  # 1..5
    bloom_index = _weighted_avg(bloom_pct, bloom_weight)     # 1..6

    if difficulty_index >= 3.6:
        difficulty_label = "difficile"
    elif difficulty_index <= 2.4:
        difficulty_label = "plutôt facile"
    else:
        difficulty_label = "modéré"

    if bloom_index >= 4.2:
        bloom_label = "haut niveau (Analyse/Évaluer/Créer)"
    elif bloom_index <= 2.6:
        bloom_label = "bas niveau (Mémoriser/Comprendre)"
    else:
        bloom_label = "mix équilibré"

    overall_interpretation = (
        f"Interprétation générale: examen {difficulty_label} (indice difficulté: {difficulty_index}/5) "
        f"avec un niveau cognitif {bloom_label} (indice Bloom: {bloom_index}/6). "
        f"Alignement aux supports: {source_coverage_rate}%."
    )

    return {
        "exam_title": exam_document.title,
        "extracted_text_len": len(extracted_text),
        "total_questions": len(enriched_questions),
        "questions": enriched_questions,
        "bloom_percentages": bloom_pct,
        "difficulty_percentages": diff_pct,
        "aa_percentages": aa_pct,

        # Expectations + deltas
        "expected_bloom_percentages": expected_bloom,
        "expected_difficulty_percentages": expected_difficulty,
        "expected_aa_percentages": expected_aa,
        "bloom_delta": bloom_delta,
        "difficulty_delta": diff_delta,
        "aa_delta": aa_delta,

        # Extra metrics
        "source_coverage_rate": source_coverage_rate,
        "aa_missing": aa_missing,
        "bloom_missing": bloom_missing,
        "recommendations": recs,
        "difficulty_index": difficulty_index,
        "bloom_index": bloom_index,
        "overall_interpretation": overall_interpretation,
    }
