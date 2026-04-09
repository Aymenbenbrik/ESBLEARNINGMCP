"""
Chapter Agentic Pipeline API
Orchestre 10 agents IA pour détecter, structurer et classifier les exercices
et activités pratiques d'un chapitre.

Routes (prefix: /chapters/<chapter_id>/pipeline):
  GET    /status                  — état du pipeline
  POST   /run                     — démarre le pipeline complet
  POST   /stop                    — interrompt le pipeline
  POST   /run-agent/<agent_name>  — lance un agent individuel
  GET    /exercises                — liste les exercices détectés
  POST   /exercises                — crée un exercice manuellement
  GET    /exercises/<ex_id>        — détail d'un exercice
  PUT    /exercises/<ex_id>        — met à jour un exercice (status, title, etc.)
  DELETE /exercises/<ex_id>        — supprime un exercice
  PUT    /exercises/<ex_id>/questions/<q_id>  — met à jour une question
  POST   /exercises/<ex_id>/publish           — publie un exercice
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm.attributes import flag_modified

from app import db
from app.models import (
    Chapter, Course, User, Document,
    ChapterPipeline, ChapterExercise, ExerciseQuestion,
    QuestionBankExercise, QuestionBankQuestion,
    PracticalWork,
)

logger = logging.getLogger(__name__)

chapter_pipeline_bp = Blueprint(
    'chapter_pipeline',
    __name__,
    url_prefix='/chapters/<int:chapter_id>/pipeline',
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_teacher(chapter_id: int):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return None, None, (jsonify({'error': 'Utilisateur introuvable'}), 404)
    chapter = Chapter.query.get_or_404(chapter_id)
    course = Course.query.get(chapter.course_id)
    if not ((user.is_superuser and not user.is_teacher) or (user.is_teacher and course and course.teacher_id == user.id)):
        return user, chapter, (jsonify({'error': 'Accès refusé'}), 403)
    return user, chapter, None


def _get_or_create_pipeline(chapter_id: int) -> ChapterPipeline:
    pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
    if not pipeline:
        pipeline = ChapterPipeline(
            chapter_id=chapter_id,
            status='idle',
            agents_state={ag: {'status': 'pending'} for ag in ChapterPipeline.AGENTS},
        )
        db.session.add(pipeline)
        db.session.commit()
    return pipeline


def _set_agent_state(pipeline: ChapterPipeline, agent: str, status: str,
                     result_count: int | None = None, error: str | None = None):
    state = dict(pipeline.agents_state or {})
    state[agent] = {
        'status': status,
        'started_at': state.get(agent, {}).get('started_at'),
        'done_at': None,
        'result_count': result_count,
        'error': error,
    }
    if status == 'running':
        state[agent]['started_at'] = datetime.utcnow().isoformat()
    if status in ('done', 'failed', 'skipped'):
        state[agent]['done_at'] = datetime.utcnow().isoformat()
    pipeline.agents_state = state
    flag_modified(pipeline, 'agents_state')
    pipeline.current_agent = agent if status == 'running' else pipeline.current_agent
    pipeline.updated_at = datetime.utcnow()
    db.session.commit()


def _gemini_model():
    import google.generativeai as genai
    genai.configure(api_key=current_app.config.get('GOOGLE_API_KEY', ''))
    return genai.GenerativeModel('gemini-2.5-flash')


def _gemini_configure():
    import google.generativeai as genai
    genai.configure(api_key=current_app.config.get('GOOGLE_API_KEY', ''))
    return genai


def _parse_json_response(text: str) -> dict | list:
    """Extract first JSON object or array from Gemini response text."""
    import re
    text = text.strip()
    # Strip markdown code fences
    text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\s*```\s*$', '', text, flags=re.MULTILINE)
    text = text.strip()
    for start_char, end_char in [('{', '}'), ('[', ']')]:
        start = text.find(start_char)
        end = text.rfind(end_char)
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except Exception:
                pass
    return {}


def _resolve_doc_path(doc) -> str | None:
    """Return the absolute path to a document file, or None if not found."""
    if not doc.file_path:
        return None
    upload_folder = current_app.config.get('UPLOAD_FOLDER', '')
    abs_path = os.path.join(upload_folder, doc.file_path)
    if os.path.exists(abs_path):
        return abs_path
    # Try as absolute path already
    if os.path.exists(doc.file_path):
        return doc.file_path
    return None


def _extract_text_from_doc(doc) -> str:
    """Extract plain text from a document file using best available method."""
    file_path = _resolve_doc_path(doc)
    if not file_path:
        return ''
    ext = file_path.rsplit('.', 1)[-1].lower() if '.' in file_path else ''
    try:
        if ext == 'pdf':
            # Try pdfplumber first (handles complex layouts better)
            try:
                import pdfplumber
                text_parts = []
                with pdfplumber.open(file_path) as pdf:
                    for page in pdf.pages:
                        t = page.extract_text()
                        if t:
                            text_parts.append(t)
                return '\n'.join(text_parts)
            except Exception:
                pass
            # Fallback: PyMuPDF
            try:
                import fitz
                doc_pdf = fitz.open(file_path)
                return '\n'.join(page.get_text() for page in doc_pdf)
            except Exception:
                pass
            # Last fallback: PyPDF2
            from PyPDF2 import PdfReader
            reader = PdfReader(file_path)
            return '\n'.join(p.extract_text() or '' for p in reader.pages)
        elif ext in ('docx',):
            import docx
            d = docx.Document(file_path)
            return '\n'.join(p.text for p in d.paragraphs)
        elif ext in ('txt', 'tex', 'md'):
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
    except Exception as e:
        logger.warning(f'[TEXT-EXTRACT] {doc.title} failed: {e}')
    return ''


def _upload_doc_to_gemini(doc) -> object | None:
    """Upload a document file to Gemini Files API; return uploaded file object or None."""
    file_path = _resolve_doc_path(doc)
    if not file_path:
        return None
    ext = file_path.rsplit('.', 1)[-1].lower() if '.' in file_path else ''
    mime_map = {
        'pdf': 'application/pdf',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'tex': 'text/plain',
    }
    mime = mime_map.get(ext)
    if not mime:
        return None
    try:
        genai = _gemini_configure()
        uploaded = genai.upload_file(path=file_path, mime_type=mime,
                                     display_name=doc.title or f'doc_{doc.id}')
        # Wait for file to be ACTIVE
        import time
        for _ in range(20):
            f = genai.get_file(uploaded.name)
            if f.state.name == 'ACTIVE':
                return f
            if f.state.name == 'FAILED':
                return None
            time.sleep(2)
    except Exception as e:
        logger.warning(f'[GEMINI-UPLOAD] {doc.title} failed: {e}')
    return None


# ── Status ───────────────────────────────────────────────────────────────────

@chapter_pipeline_bp.route('/status', methods=['GET'])
@jwt_required()
def pipeline_status(chapter_id: int):
    """Retourne l'état actuel du pipeline."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
    if not pipeline:
        return jsonify({
            'status': 'idle',
            'current_agent': None,
            'agents_state': {ag: {'status': 'pending'} for ag in ChapterPipeline.AGENTS},
            'exercise_count': 0,
            'tp_count': 0,
        })

    exercise_count = ChapterExercise.query.filter_by(
        chapter_id=chapter_id, exercise_type='consolidation').count()
    tp_count = ChapterExercise.query.filter_by(
        chapter_id=chapter_id, exercise_type='tp').count()

    d = pipeline.to_dict()
    d['exercise_count'] = exercise_count
    d['tp_count'] = tp_count
    return jsonify(d)


# ── Stop ─────────────────────────────────────────────────────────────────────

@chapter_pipeline_bp.route('/stop', methods=['POST'])
@jwt_required()
def stop_pipeline(chapter_id: int):
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err
    pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
    if pipeline and pipeline.status == 'running':
        pipeline.status = 'paused'
        pipeline.updated_at = datetime.utcnow()
        db.session.commit()
    return jsonify({'ok': True, 'status': 'paused'})


# ── Reset ─────────────────────────────────────────────────────────────────────

@chapter_pipeline_bp.route('/reset', methods=['POST'])
@jwt_required()
def reset_pipeline(chapter_id: int):
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err
    pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
    if pipeline:
        pipeline.status = 'idle'
        pipeline.current_agent = None
        pipeline.agents_state = {ag: {'status': 'pending'} for ag in ChapterPipeline.AGENTS}
        pipeline.error_message = None
        pipeline.detected_exercises = None
        pipeline.detected_tps = None
        flag_modified(pipeline, 'agents_state')
        pipeline.updated_at = datetime.utcnow()
        db.session.commit()
    return jsonify({'ok': True})


# ── Run full pipeline ─────────────────────────────────────────────────────────

@chapter_pipeline_bp.route('/run', methods=['POST'])
@jwt_required()
def run_pipeline(chapter_id: int):
    """Lance le pipeline complet en arrière-plan (thread)."""
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err

    pipeline = _get_or_create_pipeline(chapter_id)
    if pipeline.status == 'running':
        return jsonify({'error': 'Pipeline déjà en cours'}), 409

    pipeline.status = 'running'
    pipeline.error_message = None
    pipeline.agents_state = {ag: {'status': 'pending'} for ag in ChapterPipeline.AGENTS}
    flag_modified(pipeline, 'agents_state')
    db.session.commit()

    # Run pipeline in background thread
    app = current_app._get_current_object()
    t = threading.Thread(target=_run_pipeline_thread, args=(app, chapter_id), daemon=True)
    t.start()

    return jsonify({'ok': True, 'status': 'running', 'message': 'Pipeline démarré'})


def _run_pipeline_thread(app, chapter_id: int):
    """Execute all agents sequentially; stop if pipeline.status != 'running'."""
    with app.app_context():
        agents = [
            ('detect_documents', _agent_detect_documents),
            ('detect_exercises', _agent_detect_exercises),
            ('detect_tp', _agent_detect_tp),
            ('add_consolidation', _agent_add_consolidation),
            ('generate_answers', _agent_generate_answers),
            ('add_tp', _agent_add_tp),
            ('generate_tp_corrections', _agent_generate_tp_corrections),
            ('generate_scores', _agent_generate_scores),
            ('generate_durations', _agent_generate_durations),
            ('add_to_bank', _agent_add_to_bank),
        ]
        for agent_name, agent_fn in agents:
            pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
            if not pipeline or pipeline.status != 'running':
                logger.info(f'[PIPELINE] Interrupted before {agent_name}')
                return
            try:
                _set_agent_state(pipeline, agent_name, 'running')
                result_count = agent_fn(chapter_id, pipeline)
                pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
                _set_agent_state(pipeline, agent_name, 'done', result_count=result_count)
            except Exception as e:
                logger.error(f'[PIPELINE] Agent {agent_name} failed: {e}', exc_info=True)
                pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
                if pipeline:
                    _set_agent_state(pipeline, agent_name, 'failed', error=str(e))
                    pipeline.status = 'failed'
                    pipeline.error_message = f'{agent_name}: {e}'
                    db.session.commit()
                return

        pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
        if pipeline:
            pipeline.status = 'done'
            pipeline.current_agent = None
            db.session.commit()
        logger.info(f'[PIPELINE] Chapter {chapter_id} pipeline completed successfully')


# ── Run single agent ──────────────────────────────────────────────────────────

@chapter_pipeline_bp.route('/run-agent/<agent_name>', methods=['POST'])
@jwt_required()
def run_single_agent(chapter_id: int, agent_name: str):
    """Lance un agent individuel."""
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err

    agent_map = {
        'detect_documents':      _agent_detect_documents,
        'detect_exercises':      _agent_detect_exercises,
        'detect_tp':             _agent_detect_tp,
        'add_consolidation':     _agent_add_consolidation,
        'generate_answers':      _agent_generate_answers,
        'add_tp':                _agent_add_tp,
        'generate_tp_corrections': _agent_generate_tp_corrections,
        'generate_scores':       _agent_generate_scores,
        'generate_durations':    _agent_generate_durations,
        'add_to_bank':           _agent_add_to_bank,
    }
    if agent_name not in agent_map:
        return jsonify({'error': f'Agent inconnu: {agent_name}'}), 400

    pipeline = _get_or_create_pipeline(chapter_id)
    try:
        _set_agent_state(pipeline, agent_name, 'running')
        count = agent_map[agent_name](chapter_id, pipeline)
        pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
        _set_agent_state(pipeline, agent_name, 'done', result_count=count)
        return jsonify({'ok': True, 'agent': agent_name, 'result_count': count})
    except Exception as e:
        logger.error(f'[AGENT] {agent_name} failed: {e}', exc_info=True)
        pipeline = ChapterPipeline.query.filter_by(chapter_id=chapter_id).first()
        if pipeline:
            _set_agent_state(pipeline, agent_name, 'failed', error=str(e))
        return jsonify({'error': str(e)}), 500


# ═════════════════════════════════════════════════════════════════════════════
# AGENT IMPLEMENTATIONS
# ═════════════════════════════════════════════════════════════════════════════

def _agent_detect_documents(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 1: Inventory chapter documents and extract their text content."""
    docs = Document.query.filter_by(chapter_id=chapter_id).all()
    doc_list = []
    for d in docs:
        file_path = _resolve_doc_path(d)
        doc_list.append({
            'id': d.id,
            'title': d.title,
            'file_type': d.file_type or 'unknown',
            'file_path': d.file_path,
            'has_file': file_path is not None,
        })
    state = dict(pipeline.agents_state or {})
    state['detect_documents'] = {
        **state.get('detect_documents', {}),
        'status': 'running',
        'documents': doc_list,
    }
    pipeline.agents_state = state
    flag_modified(pipeline, 'agents_state')
    db.session.commit()
    return len(docs)


def _build_gemini_content(doc, prompt: str) -> list:
    """Build Gemini content list: try Files API first, fallback to extracted text."""
    model_input = []

    # Try Gemini Files API upload (best for PDFs with math/diagrams)
    uploaded = _upload_doc_to_gemini(doc)
    if uploaded is not None:
        logger.info(f'[GEMINI] Using Files API for doc {doc.id} ({doc.title})')
        model_input = [uploaded, prompt]
    else:
        # Fallback: extract text and embed in prompt
        text = _extract_text_from_doc(doc)
        if not text:
            logger.warning(f'[GEMINI] No content for doc {doc.id} ({doc.title})')
            return []
        # Trim to ~12000 chars to stay within token limits
        text_snippet = text[:12000]
        logger.info(f'[GEMINI] Using text fallback for doc {doc.id}, {len(text)} chars')
        full_prompt = f"Contenu du document « {doc.title} »:\n\n{text_snippet}\n\n---\n\n{prompt}"
        model_input = [full_prompt]

    return model_input


def _agent_detect_exercises(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 2: Use Gemini to detect consolidation exercises in chapter documents."""
    docs = Document.query.filter_by(chapter_id=chapter_id).all()
    if not docs:
        pipeline.detected_exercises = []
        flag_modified(pipeline, 'detected_exercises')
        db.session.commit()
        return 0

    model = _gemini_model()
    chapter = Chapter.query.get(chapter_id)
    all_exercises = []

    for doc in docs:
        prompt = f"""Tu es un expert pédagogique en mathématiques/informatique. Analyse ce document de cours et extrait TOUS les exercices de consolidation (exercices théoriques, questions de compréhension, problèmes mathématiques, exercices d'algèbre/analyse — PAS les TPs pratiques ni les projets de programmation).

Chapitre: {chapter.title if chapter else 'Inconnu'}
Document: {doc.title}

Pour chaque exercice trouvé, retourne un JSON avec cette structure EXACTE (pas de markdown, juste le JSON):
{{
  "exercises": [
    {{
      "title": "Titre court de l'exercice",
      "description": "Contexte ou énoncé général de l'exercice",
      "total_points": 10,
      "estimated_duration_min": 20,
      "aa_codes": [],
      "questions": [
        {{
          "order": 1,
          "text": "Énoncé complet de la question",
          "type": "open_ended",
          "points": 3,
          "bloom_level": "Comprendre",
          "difficulty": "Moyen",
          "aa_codes": []
        }}
      ]
    }}
  ]
}}

Types valides: open_ended, mcq, code, calculation, true_false
Niveaux Bloom: Mémoriser, Comprendre, Appliquer, Analyser, Évaluer, Créer
Difficultés: Facile, Moyen, Difficile
Si aucun exercice de consolidation trouvé, retourne {{"exercises": []}}
IMPORTANT: Réponds UNIQUEMENT avec le JSON, sans texte avant ou après."""

        try:
            content = _build_gemini_content(doc, prompt)
            if not content:
                logger.warning(f'[DETECT-EX] No content for doc {doc.id}, skipping')
                continue
            resp = model.generate_content(content)
            logger.info(f'[DETECT-EX] Doc {doc.id} response: {resp.text[:300]}')
            parsed = _parse_json_response(resp.text)
            exercises = parsed.get('exercises', []) if isinstance(parsed, dict) else []
            for ex in exercises:
                ex['source_document_id'] = doc.id
            all_exercises.extend(exercises)
            logger.info(f'[DETECT-EX] Doc {doc.id} ({doc.title}): {len(exercises)} exercises found')
        except Exception as e:
            logger.warning(f'[DETECT-EX] Doc {doc.id} failed: {e}', exc_info=True)

    pipeline.detected_exercises = all_exercises
    flag_modified(pipeline, 'detected_exercises')
    db.session.commit()
    return len(all_exercises)


def _agent_detect_tp(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 3: Detect practical activities (TPs) in chapter documents."""
    docs = Document.query.filter_by(chapter_id=chapter_id).all()
    if not docs:
        pipeline.detected_tps = []
        flag_modified(pipeline, 'detected_tps')
        db.session.commit()
        return 0

    model = _gemini_model()
    chapter = Chapter.query.get(chapter_id)
    all_tps = []

    for doc in docs:
        prompt = f"""Tu es un expert pédagogique. Analyse ce document et extrait TOUTES les activités pratiques / TPs / projets (manipulation informatique, code, base de données, algorithmes pratiques — PAS les exercices théoriques purement mathématiques).

Chapitre: {chapter.title if chapter else 'Inconnu'}
Document: {doc.title}

Retourne un JSON (UNIQUEMENT le JSON, sans markdown):
{{
  "tps": [
    {{
      "title": "Titre du TP",
      "description": "Description complète de l'activité pratique",
      "language": "python",
      "tp_nature": "formative",
      "estimated_duration_min": 90,
      "aa_codes": [],
      "questions": [
        {{
          "order": 1,
          "text": "Énoncé complet de la tâche pratique",
          "type": "code",
          "points": 5,
          "bloom_level": "Appliquer",
          "difficulty": "Moyen",
          "aa_codes": []
        }}
      ]
    }}
  ]
}}

Langages valides: python, sql, java, c, cpp, javascript, r, bash, autre
tp_nature: formative | sommative
Si aucun TP/activité pratique trouvé dans ce document, retourne {{"tps": []}}
IMPORTANT: Réponds UNIQUEMENT avec le JSON, sans texte avant ou après."""

        try:
            content = _build_gemini_content(doc, prompt)
            if not content:
                logger.warning(f'[DETECT-TP] No content for doc {doc.id}, skipping')
                continue
            resp = model.generate_content(content)
            logger.info(f'[DETECT-TP] Doc {doc.id} response: {resp.text[:300]}')
            parsed = _parse_json_response(resp.text)
            tps = parsed.get('tps', []) if isinstance(parsed, dict) else []
            for tp in tps:
                tp['source_document_id'] = doc.id
            all_tps.extend(tps)
            logger.info(f'[DETECT-TP] Doc {doc.id} ({doc.title}): {len(tps)} TPs found')
        except Exception as e:
            logger.warning(f'[DETECT-TP] Doc {doc.id} failed: {e}', exc_info=True)

    pipeline.detected_tps = all_tps
    flag_modified(pipeline, 'detected_tps')
    db.session.commit()
    return len(all_tps)


def _agent_add_consolidation(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 4: Create ChapterExercise (consolidation) in DB from detected exercises."""
    exercises = pipeline.detected_exercises or []
    count = 0
    for i, ex_data in enumerate(exercises):
        ex = ChapterExercise(
            chapter_id=chapter_id,
            source_document_id=ex_data.get('source_document_id'),
            title=ex_data.get('title', f'Exercice {i+1}'),
            description=ex_data.get('description'),
            exercise_type='consolidation',
            status='draft',
            order=i,
            total_points=float(ex_data.get('total_points', 0) or 0) or None,
            estimated_duration_min=ex_data.get('estimated_duration_min'),
            aa_codes=ex_data.get('aa_codes', []),
        )
        db.session.add(ex)
        db.session.flush()

        for q_data in (ex_data.get('questions') or []):
            q = ExerciseQuestion(
                exercise_id=ex.id,
                order=q_data.get('order', 1),
                question_text=q_data.get('text', ''),
                question_type=q_data.get('type', 'open_ended'),
                points=float(q_data.get('points', 1) or 1),
                bloom_level=q_data.get('bloom_level'),
                difficulty=q_data.get('difficulty'),
                aa_codes=q_data.get('aa_codes', []),
            )
            db.session.add(q)
        count += 1

    db.session.commit()
    return count


def _agent_generate_answers(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 5: Generate model answers for each exercise question."""
    exercises = ChapterExercise.query.filter_by(
        chapter_id=chapter_id, exercise_type='consolidation').all()
    model = _gemini_model()
    count = 0

    for ex in exercises:
        for q in ex.questions:
            if q.model_answer:
                continue
            prompt = f"""Tu es un enseignant expert. Génère une réponse modèle complète et détaillée pour cette question.

Question: {q.question_text}
Type: {q.question_type}
Bloom: {q.bloom_level or 'Non défini'}
Difficulté: {q.difficulty or 'Moyenne'}
Points: {q.points}

Retourne un JSON:
{{
  "model_answer": "Réponse complète et détaillée",
  "correction_criteria": ["Critère 1", "Critère 2", "Critère 3"],
  "correct_choice": "A"
}}
(correct_choice uniquement pour MCQ, sinon null)"""
            try:
                resp = model.generate_content(prompt)
                parsed = _parse_json_response(resp.text)
                if isinstance(parsed, dict):
                    q.model_answer = parsed.get('model_answer', '')
                    q.correction_criteria = parsed.get('correction_criteria', [])
                    if q.question_type == 'mcq' and parsed.get('correct_choice'):
                        q.correct_choice = parsed['correct_choice']
                count += 1
            except Exception as e:
                logger.warning(f'[GEN-ANS] Q {q.id} failed: {e}')

    db.session.commit()
    return count


def _agent_add_tp(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 6: Create ChapterExercise (tp) in DB from detected TPs."""
    tps = pipeline.detected_tps or []
    count = 0
    for i, tp_data in enumerate(tps):
        ex = ChapterExercise(
            chapter_id=chapter_id,
            source_document_id=tp_data.get('source_document_id'),
            title=tp_data.get('title', f'TP {i+1}'),
            description=tp_data.get('description'),
            exercise_type='tp',
            status='draft',
            order=i,
            estimated_duration_min=tp_data.get('estimated_duration_min'),
            aa_codes=tp_data.get('aa_codes', []),
            programming_language=tp_data.get('language'),
            tp_nature=tp_data.get('tp_nature', 'formative'),
        )
        db.session.add(ex)
        db.session.flush()

        for q_data in (tp_data.get('questions') or []):
            q = ExerciseQuestion(
                exercise_id=ex.id,
                order=q_data.get('order', 1),
                question_text=q_data.get('text', ''),
                question_type=q_data.get('type', 'code'),
                points=float(q_data.get('points', 2) or 2),
                bloom_level=q_data.get('bloom_level'),
                difficulty=q_data.get('difficulty'),
                aa_codes=q_data.get('aa_codes', []),
                programming_language=tp_data.get('language'),
            )
            db.session.add(q)
        count += 1

    db.session.commit()
    return count


def _agent_generate_tp_corrections(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 7: Generate corrections and criteria for TP exercises."""
    tps = ChapterExercise.query.filter_by(
        chapter_id=chapter_id, exercise_type='tp').all()
    model = _gemini_model()
    count = 0

    for tp in tps:
        for q in tp.questions:
            if q.model_answer:
                continue
            prompt = f"""Tu es un enseignant expert en {tp.programming_language or 'informatique'}.
Génère une correction modèle pour cette question pratique.

TP: {tp.title}
Question: {q.question_text}
Type: {q.question_type}
Langage: {tp.programming_language or 'Non spécifié'}
Points: {q.points}

Retourne un JSON:
{{
  "model_answer": "Solution complète avec code si applicable",
  "correction_criteria": ["Critère d'évaluation 1", "Critère 2"],
  "scoring_detail": "1pt pour X, 2pt pour Y, 1pt pour la qualité du code"
}}"""
            try:
                resp = model.generate_content(prompt)
                parsed = _parse_json_response(resp.text)
                if isinstance(parsed, dict):
                    q.model_answer = parsed.get('model_answer', '')
                    q.correction_criteria = parsed.get('correction_criteria', [])
                    q.scoring_detail = parsed.get('scoring_detail', '')
                count += 1
            except Exception as e:
                logger.warning(f'[GEN-TP-COR] Q {q.id} failed: {e}')

    db.session.commit()
    return count


def _agent_generate_scores(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 8: Generate detailed scoring (barème) for every question."""
    exercises = ChapterExercise.query.filter_by(chapter_id=chapter_id).all()
    model = _gemini_model()
    count = 0

    for ex in exercises:
        total_q = len(ex.questions)
        if total_q == 0:
            continue
        total_pts = ex.total_points or (total_q * 2.0)

        for q in ex.questions:
            if q.scoring_detail:
                count += 1
                continue
            prompt = f"""Propose un barème détaillé pour cette question d'examen.

Exercice: {ex.title}
Question: {q.question_text}
Points disponibles: {q.points}
Bloom: {q.bloom_level or 'Non défini'}
Difficulté: {q.difficulty or 'Moyen'}

Retourne un JSON:
{{
  "scoring_detail": "Décomposition détaillée (ex: 1pt définition, 2pt application, 1pt exemple)",
  "points": {q.points}
}}"""
            try:
                resp = model.generate_content(prompt)
                parsed = _parse_json_response(resp.text)
                if isinstance(parsed, dict):
                    q.scoring_detail = parsed.get('scoring_detail', '')
                    new_pts = parsed.get('points')
                    if new_pts and float(new_pts) > 0:
                        q.points = float(new_pts)
                count += 1
            except Exception as e:
                logger.warning(f'[GEN-SCORES] Q {q.id} failed: {e}')

    db.session.commit()
    return count


def _agent_generate_durations(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 9: Estimate duration and confirm classification for each question."""
    exercises = ChapterExercise.query.filter_by(chapter_id=chapter_id).all()
    model = _gemini_model()
    count = 0

    for ex in exercises:
        total_duration = 0
        for q in ex.questions:
            if q.estimated_duration_min:
                total_duration += q.estimated_duration_min
                count += 1
                continue
            prompt = f"""Estime la durée et vérifie la classification pour cette question d'examen.

Question: {q.question_text}
Type: {q.question_type}
Bloom actuel: {q.bloom_level or 'Non défini'}
Difficulté actuelle: {q.difficulty or 'Non définie'}
Points: {q.points}

Retourne un JSON:
{{
  "estimated_duration_min": 5,
  "bloom_level": "Comprendre",
  "difficulty": "Moyen",
  "aa_codes": ["AA1"]
}}
Bloom valides: Mémoriser, Comprendre, Appliquer, Analyser, Évaluer, Créer
Difficultés: Facile, Moyen, Difficile"""
            try:
                resp = model.generate_content(prompt)
                parsed = _parse_json_response(resp.text)
                if isinstance(parsed, dict):
                    q.estimated_duration_min = int(parsed.get('estimated_duration_min', 5) or 5)
                    if parsed.get('bloom_level') and not q.bloom_level:
                        q.bloom_level = parsed['bloom_level']
                    if parsed.get('difficulty') and not q.difficulty:
                        q.difficulty = parsed['difficulty']
                    if parsed.get('aa_codes') and not q.aa_codes:
                        q.aa_codes = parsed['aa_codes']
                    total_duration += q.estimated_duration_min
                count += 1
            except Exception as e:
                logger.warning(f'[GEN-DUR] Q {q.id} failed: {e}')

        if total_duration > 0 and not ex.estimated_duration_min:
            ex.estimated_duration_min = total_duration

        # Update exercise bloom_levels from questions
        bloom_set = list({q.bloom_level for q in ex.questions if q.bloom_level})
        if bloom_set:
            ex.bloom_levels = bloom_set

    db.session.commit()
    return count


def _agent_add_to_bank(chapter_id: int, pipeline: ChapterPipeline) -> int:
    """Agent 10: Add validated exercises to the course question bank."""
    chapter = Chapter.query.get(chapter_id)
    if not chapter:
        return 0

    exercises = ChapterExercise.query.filter_by(chapter_id=chapter_id).all()
    count = 0

    for ex in exercises:
        # Skip if already in bank
        existing = QuestionBankExercise.query.filter_by(source_exercise_id=ex.id).first()
        if existing:
            continue

        qb_ex = QuestionBankExercise(
            course_id=chapter.course_id,
            chapter_id=chapter_id,
            source_exercise_id=ex.id,
            title=ex.title,
            description=ex.description,
            exercise_type=ex.exercise_type,
            status='draft',
            total_points=ex.total_points,
            estimated_duration_min=ex.estimated_duration_min,
            aa_codes=ex.aa_codes,
            bloom_levels=ex.bloom_levels,
        )
        db.session.add(qb_ex)
        db.session.flush()

        for q in ex.questions:
            qbq = QuestionBankQuestion(
                course_id=chapter.course_id,
                chapter_id=chapter_id,
                question_text=q.question_text,
                question_type=_map_question_type(q.question_type),
                choice_a=q.choice_a,
                choice_b=q.choice_b,
                choice_c=q.choice_c,
                correct_choice=q.correct_choice,
                explanation=q.model_answer,
                answer=q.model_answer,
                bloom_level=q.bloom_level,
                clo=(q.aa_codes[0] if q.aa_codes else None),
                difficulty=q.difficulty,
                programming_language=q.programming_language,
                exercise_id=qb_ex.id,
                exercise_order=q.order,
            )
            db.session.add(qbq)
        count += 1

    db.session.commit()
    return count


def _map_question_type(tp: str) -> str:
    mapping = {
        'open_ended': 'open_ended', 'mcq': 'mcq', 'code': 'code',
        'calculation': 'open_ended', 'true_false': 'true_false',
    }
    return mapping.get(tp or '', 'open_ended')


# ═════════════════════════════════════════════════════════════════════════════
# EXERCISE CRUD
# ═════════════════════════════════════════════════════════════════════════════

@chapter_pipeline_bp.route('/exercises', methods=['GET'])
@jwt_required()
def list_exercises(chapter_id: int):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    ex_type = request.args.get('type')  # consolidation | tp | None=all
    q = ChapterExercise.query.filter_by(chapter_id=chapter_id)
    if ex_type:
        q = q.filter_by(exercise_type=ex_type)
    exercises = q.order_by(ChapterExercise.order).all()
    return jsonify([ex.to_dict(include_questions=True) for ex in exercises])


@chapter_pipeline_bp.route('/exercises', methods=['POST'])
@jwt_required()
def create_exercise(chapter_id: int):
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err
    data = request.get_json() or {}
    ex = ChapterExercise(
        chapter_id=chapter_id,
        title=data.get('title', 'Nouvel exercice'),
        description=data.get('description'),
        exercise_type=data.get('exercise_type', 'consolidation'),
        status='draft',
        total_points=data.get('total_points'),
        estimated_duration_min=data.get('estimated_duration_min'),
        aa_codes=data.get('aa_codes', []),
        programming_language=data.get('programming_language'),
        tp_nature=data.get('tp_nature'),
    )
    db.session.add(ex)
    db.session.commit()
    return jsonify(ex.to_dict(include_questions=True)), 201


@chapter_pipeline_bp.route('/exercises/<int:ex_id>', methods=['GET'])
@jwt_required()
def get_exercise(chapter_id: int, ex_id: int):
    ex = ChapterExercise.query.filter_by(id=ex_id, chapter_id=chapter_id).first_or_404()
    return jsonify(ex.to_dict(include_questions=True))


@chapter_pipeline_bp.route('/exercises/<int:ex_id>', methods=['PUT'])
@jwt_required()
def update_exercise(chapter_id: int, ex_id: int):
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err
    ex = ChapterExercise.query.filter_by(id=ex_id, chapter_id=chapter_id).first_or_404()
    data = request.get_json() or {}
    for field in ['title', 'description', 'status', 'total_points',
                  'estimated_duration_min', 'aa_codes', 'tp_nature', 'programming_language']:
        if field in data:
            setattr(ex, field, data[field])
    ex.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(ex.to_dict(include_questions=True))


@chapter_pipeline_bp.route('/exercises/<int:ex_id>', methods=['DELETE'])
@jwt_required()
def delete_exercise(chapter_id: int, ex_id: int):
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err
    ex = ChapterExercise.query.filter_by(id=ex_id, chapter_id=chapter_id).first_or_404()
    db.session.delete(ex)
    db.session.commit()
    return jsonify({'ok': True})


@chapter_pipeline_bp.route('/exercises/<int:ex_id>/publish', methods=['POST'])
@jwt_required()
def publish_exercise(chapter_id: int, ex_id: int):
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err
    ex = ChapterExercise.query.filter_by(id=ex_id, chapter_id=chapter_id).first_or_404()
    ex.status = 'published'
    ex.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(ex.to_dict())


@chapter_pipeline_bp.route('/exercises/<int:ex_id>/questions/<int:q_id>', methods=['PUT'])
@jwt_required()
def update_exercise_question(chapter_id: int, ex_id: int, q_id: int):
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err
    q = ExerciseQuestion.query.filter_by(id=q_id, exercise_id=ex_id).first_or_404()
    data = request.get_json() or {}
    for field in ['question_text', 'question_type', 'points', 'bloom_level', 'difficulty',
                  'aa_codes', 'model_answer', 'answer_validated', 'correction_criteria',
                  'scoring_detail', 'estimated_duration_min', 'choice_a', 'choice_b',
                  'choice_c', 'choice_d', 'correct_choice', 'programming_language']:
        if field in data:
            setattr(q, field, data[field])
    db.session.commit()
    return jsonify(q.to_dict())


@chapter_pipeline_bp.route('/exercises/<int:ex_id>/questions', methods=['POST'])
@jwt_required()
def add_exercise_question(chapter_id: int, ex_id: int):
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err
    ex = ChapterExercise.query.filter_by(id=ex_id, chapter_id=chapter_id).first_or_404()
    data = request.get_json() or {}
    max_order = max((q.order for q in ex.questions), default=0)
    q = ExerciseQuestion(
        exercise_id=ex_id,
        order=max_order + 1,
        question_text=data.get('question_text', 'Nouvelle question'),
        question_type=data.get('question_type', 'open_ended'),
        points=float(data.get('points', 1)),
        bloom_level=data.get('bloom_level'),
        difficulty=data.get('difficulty'),
        aa_codes=data.get('aa_codes', []),
    )
    db.session.add(q)
    db.session.commit()
    return jsonify(q.to_dict()), 201


# ── Question bank exercise CRUD ───────────────────────────────────────────────

@chapter_pipeline_bp.route('/qbank-exercises', methods=['GET'])
@jwt_required()
def list_qbank_exercises(chapter_id: int):
    chapter = Chapter.query.get_or_404(chapter_id)
    exercises = QuestionBankExercise.query.filter_by(
        chapter_id=chapter_id).order_by(QuestionBankExercise.created_at.desc()).all()
    return jsonify([ex.to_dict(include_questions=True) for ex in exercises])


@chapter_pipeline_bp.route('/qbank-exercises/generate', methods=['POST'])
@jwt_required()
def generate_qbank_exercise(chapter_id: int):
    """Generate a progressive exercise using AI for the question bank."""
    user, chapter, err = _get_teacher(chapter_id)
    if err:
        return err
    data = request.get_json() or {}
    title = data.get('title', 'Exercice généré')
    aa_codes = data.get('aa_codes', [])
    bloom_target = data.get('bloom_target', 'Appliquer')
    question_count = int(data.get('question_count', 4))
    exercise_type = data.get('exercise_type', 'consolidation')
    language = data.get('language', '')

    prompt = f"""Tu es un expert pédagogique. Génère un exercice progressif de {question_count} questions sur le thème "{title}".

Contraintes:
- Acquis d'apprentissage cibles: {', '.join(aa_codes) if aa_codes else 'Non spécifiés'}
- Niveau Bloom cible: {bloom_target}
- Type: {exercise_type}
{"- Langage: " + language if language else ""}
- Les questions doivent être progressives: commencer par Mémoriser/Comprendre et monter progressivement vers {bloom_target}
- Chaque question doit s'appuyer sur la précédente (logique d'enchaînement)

Retourne un JSON:
{{
  "title": "{title}",
  "description": "Description de l'exercice et son objectif pédagogique",
  "progression_notes": "Explication de la logique de progression",
  "total_points": 20,
  "estimated_duration_min": 30,
  "questions": [
    {{
      "order": 1,
      "text": "Question 1 (niveau Mémoriser/Comprendre)",
      "type": "open_ended",
      "points": 3,
      "bloom_level": "Comprendre",
      "difficulty": "Facile",
      "aa_codes": {json.dumps(aa_codes)},
      "model_answer": "Réponse modèle",
      "correction_criteria": ["Critère 1", "Critère 2"],
      "scoring_detail": "2pt définition, 1pt exemple",
      "estimated_duration_min": 5
    }}
  ]
}}"""

    try:
        model = _gemini_model()
        resp = model.generate_content(prompt)
        parsed = _parse_json_response(resp.text)
        if not isinstance(parsed, dict) or 'questions' not in parsed:
            return jsonify({'error': 'Réponse AI invalide'}), 500

        qb_ex = QuestionBankExercise(
            course_id=chapter.course_id,
            chapter_id=chapter_id,
            title=parsed.get('title', title),
            description=parsed.get('description'),
            exercise_type=exercise_type,
            status='draft',
            total_points=float(parsed.get('total_points', 20) or 20),
            estimated_duration_min=int(parsed.get('estimated_duration_min', 30) or 30),
            aa_codes=aa_codes,
            progression_notes=parsed.get('progression_notes'),
        )
        db.session.add(qb_ex)
        db.session.flush()

        for q_data in parsed.get('questions', []):
            qbq = QuestionBankQuestion(
                course_id=chapter.course_id,
                chapter_id=chapter_id,
                question_text=q_data.get('text', ''),
                question_type=_map_question_type(q_data.get('type', 'open_ended')),
                explanation=q_data.get('model_answer', ''),
                answer=q_data.get('model_answer', ''),
                bloom_level=q_data.get('bloom_level'),
                clo=(q_data.get('aa_codes', [None])[0]),
                difficulty=q_data.get('difficulty'),
                programming_language=language or None,
                exercise_id=qb_ex.id,
                exercise_order=q_data.get('order', 1),
            )
            db.session.add(qbq)

        db.session.commit()
        return jsonify(qb_ex.to_dict(include_questions=True)), 201

    except Exception as e:
        logger.error(f'[GEN-QB-EX] Failed: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500
