"""
YouTube RAG Service
===================
Multi-source enrichment pipeline for YouTube videos:

1. TRANSCRIPT  — youtube-transcript-api (fast, SRT subtitles)
2. VISUAL ANALYSIS — Gemini native YouTube URL processing
   (scene descriptions, diagrams, equations on screen, key moments)
3. COMBINED INDEXING — all content chunked into ChromaDB so the
   chapter chatbot can answer questions about the video.

Gemini 2.0+ can process a YouTube URL directly as a video part,
analyzing both audio and visual frames without downloading the file.
"""

import logging
import json
from typing import Optional

from flask import current_app

logger = logging.getLogger(__name__)

# Tuning constants
MAX_TRANSCRIPT_CHARS = 80_000
CHUNK_SIZE = 1_400
CHUNK_OVERLAP = 250


# ---------------------------------------------------------------------------
# 1. Transcript via youtube-transcript-api
# ---------------------------------------------------------------------------

def fetch_transcript(video_id: str) -> Optional[str]:
    """Return full subtitle/transcript text, or None if unavailable."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound

        api = YouTubeTranscriptApi()
        # Prefer French/English/Arabic; fall back to any available language
        for langs in [('fr', 'en', 'ar'), ('en', 'fr'), ('en',)]:
            try:
                fetched = api.fetch(video_id, languages=langs)
                text = ' '.join(s.text for s in fetched)
                logger.info(f"Transcript fetched for {video_id}: {len(text)} chars")
                return text[:MAX_TRANSCRIPT_CHARS]
            except NoTranscriptFound:
                continue
            except Exception:
                break

        # Last resort: any transcript from any language
        try:
            transcript_list = api.list(video_id)
            for t in transcript_list:
                fetched = t.fetch()
                text = ' '.join(s.text for s in fetched)
                logger.info(f"Fallback transcript ({t.language_code}) for {video_id}: {len(text)} chars")
                return text[:MAX_TRANSCRIPT_CHARS]
        except Exception as e2:
            logger.warning(f"All transcript attempts failed for {video_id}: {e2}")

    except Exception as e:
        logger.warning(f"Transcript fetch error for {video_id}: {e}")
    return None


# ---------------------------------------------------------------------------
# 2. Visual + audio analysis via Gemini (native YouTube URL support)
# ---------------------------------------------------------------------------

_GEMINI_VIDEO_PROMPT = """Tu es un assistant pédagogique expert. Analyse cette vidéo YouTube de cours.

Fournis une analyse structurée en JSON avec les champs suivants :
{
  "visual_summary": "Description générale de ce qui est montré visuellement (slides, tableau, animations, démonstrations, équations à l'écran, schémas, code affiché...)",
  "key_moments": [
    {"timestamp_approx": "0:30", "description": "Ce qui se passe / s'explique à ce moment"},
    ...
  ],
  "visual_elements": ["liste des éléments visuels clés : formules, diagrammes, algorithmes, tableaux..."],
  "topics_covered": ["liste des sujets et concepts abordés"],
  "transcript_enhanced": "Transcription complète ou partielle si disponible, sinon résumé détaillé",
  "pedagogical_summary": "Résumé pédagogique de 3-5 phrases pour aider les étudiants à comprendre les points clés",
  "language": "fr/en/ar"
}

IMPORTANT: Réponds UNIQUEMENT avec le JSON valide, sans texte avant ou après."""

_GEMINI_FALLBACK_PROMPT = """Tu es un assistant pédagogique. Voici la transcription d'une vidéo YouTube de cours intitulée "{title}".

À partir de cette transcription, génère une analyse pédagogique structurée en JSON:
{{
  "visual_summary": "Ce que la vidéo semble montrer visuellement d'après le contexte de la transcription",
  "key_moments": [
    {{"timestamp_approx": "debut", "description": "Concept introduit"}},
    {{"timestamp_approx": "milieu", "description": "Développement principal"}},
    {{"timestamp_approx": "fin", "description": "Conclusion/synthèse"}}
  ],
  "visual_elements": ["éléments pédagogiques probablement montrés d'après le contenu"],
  "topics_covered": ["concepts et sujets abordés dans la transcription"],
  "transcript_enhanced": "{transcript_excerpt}",
  "pedagogical_summary": "Résumé pédagogique de 3-5 phrases",
  "language": "fr"
}}

IMPORTANT: Réponds UNIQUEMENT avec le JSON valide.

TRANSCRIPTION:
{transcript}"""


def analyze_video_with_gemini(video_id: str, video_title: str, transcript: Optional[str] = None) -> Optional[dict]:
    """
    Ask Gemini to analyze the YouTube video natively.
    Gemini 2.0 can process YouTube URLs directly (audio + visual frames).
    Falls back to transcript-based analysis if native video fails.
    """
    import google.generativeai as genai
    from google.generativeai import protos

    api_key = current_app.config.get('GOOGLE_API_KEY', '')
    model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    genai.configure(api_key=api_key)

    # --- Attempt 1: Native YouTube URL (audio + visual via protos.Part) ---
    try:
        model = genai.GenerativeModel(model_name)
        youtube_url = f"https://www.youtube.com/watch?v={video_id}"

        video_part = protos.Part(
            file_data=protos.FileData(
                file_uri=youtube_url,
                mime_type="video/mp4",
            )
        )
        response = model.generate_content([video_part, _GEMINI_VIDEO_PROMPT])
        raw = response.text.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json\n'):
                raw = raw[5:]
        analysis = json.loads(raw)
        logger.info(f"Gemini native video analysis succeeded for {video_id}")
        analysis['source'] = 'gemini_native_video'
        return analysis
    except Exception as e:
        logger.warning(f"Gemini native video analysis failed for {video_id}: {e}")

    # --- Attempt 2: Transcript-based analysis (fallback) ---
    if transcript:
        try:
            model = genai.GenerativeModel(model_name)
            prompt = _GEMINI_FALLBACK_PROMPT.format(
                title=video_title,
                transcript=transcript[:6000],
                transcript_excerpt=transcript[:500].replace('"', "'") + '...',
            )
            response = model.generate_content(prompt)
            raw = response.text.strip()
            if raw.startswith('```'):
                raw = raw.split('```')[1]
                if raw.startswith('json\n'):
                    raw = raw[5:]
            analysis = json.loads(raw)
            logger.info(f"Transcript-based analysis succeeded for {video_id}")
            analysis['source'] = 'gemini_transcript_analysis'
            return analysis
        except Exception as e:
            logger.warning(f"Transcript-based analysis also failed for {video_id}: {e}")

    return None


# ---------------------------------------------------------------------------
# 3. Build rich ChromaDB chunks from all sources
# ---------------------------------------------------------------------------

def _chunk_text(text: str, section_title: str = 'Transcript', source: str = 'youtube') -> list[dict]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    idx = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunks.append({
            'content': text[start:end],
            'section_number': str(idx + 1),
            'section_title': section_title,
            'page_number': 1,
            'chunk_index': idx,
            'metadata': {'source': source},
        })
        start += CHUNK_SIZE - CHUNK_OVERLAP
        idx += 1
    return chunks


def _build_indexable_content(
    video_id: str,
    video_title: str,
    transcript: Optional[str],
    analysis: Optional[dict],
) -> tuple[list[dict], list[dict], str]:
    """
    Build:
    - text_chunks  (for add_text_chunks)
    - visual_chunks (image-like entries for add_image-style content)
    - summary       (stored on Document.summary)
    """
    text_chunks: list[dict] = []
    visual_chunks: list[dict] = []

    # — Transcript chunks —
    if transcript:
        text_chunks.extend(_chunk_text(transcript, 'Transcription vidéo', 'youtube_transcript'))

    # — Analysis-derived content —
    summary_parts = []
    if analysis:
        # Enhanced transcript / full analysis from Gemini
        if analysis.get('transcript_enhanced'):
            enhanced = analysis['transcript_enhanced']
            if len(enhanced) > 100:
                text_chunks.extend(_chunk_text(enhanced, 'Transcription enrichie (Gemini)', 'youtube_gemini_transcript'))

        # Pedagogical summary → section summary for CAG layer
        if analysis.get('pedagogical_summary'):
            ps = analysis['pedagogical_summary']
            text_chunks.append({
                'content': f"Résumé pédagogique de la vidéo \"{video_title}\": {ps}",
                'section_number': '0',
                'section_title': 'Résumé pédagogique',
                'page_number': 1,
                'chunk_index': 0,
                'metadata': {'source': 'youtube_summary'},
            })
            summary_parts.append(ps)

        # Visual summary
        if analysis.get('visual_summary'):
            vs = analysis['visual_summary']
            visual_chunks.append({
                'content': f"[Contenu visuel de la vidéo \"{video_title}\"]\n{vs}",
                'section_number': '0',
                'section_title': 'Analyse visuelle',
                'page_number': 1,
                'chunk_index': 0,
                'metadata': {'source': 'youtube_visual'},
            })

        # Key moments — each as its own chunk for precise retrieval
        for i, moment in enumerate(analysis.get('key_moments', [])):
            ts = moment.get('timestamp_approx', '?')
            desc = moment.get('description', '')
            if desc:
                visual_chunks.append({
                    'content': f"[Vidéo {video_title} — {ts}] {desc}",
                    'section_number': str(i + 1),
                    'section_title': f'Moment clé {ts}',
                    'page_number': 1,
                    'chunk_index': i,
                    'metadata': {'source': 'youtube_moment', 'timestamp': ts},
                })

        # Visual elements (formulas, diagrams...)
        visual_elements = analysis.get('visual_elements', [])
        if visual_elements:
            content = (
                f"Éléments visuels dans la vidéo \"{video_title}\": "
                + ", ".join(visual_elements)
            )
            visual_chunks.append({
                'content': content,
                'section_number': '99',
                'section_title': 'Éléments visuels',
                'page_number': 1,
                'chunk_index': 0,
                'metadata': {'source': 'youtube_visual_elements'},
            })

        # Topics covered
        topics = analysis.get('topics_covered', [])
        if topics:
            text_chunks.append({
                'content': f"Sujets abordés dans la vidéo \"{video_title}\": " + ", ".join(topics),
                'section_number': '98',
                'section_title': 'Sujets abordés',
                'page_number': 1,
                'chunk_index': 0,
                'metadata': {'source': 'youtube_topics'},
            })

    # Build final document summary
    if not summary_parts and transcript:
        # Minimal summary from transcript
        summary_parts.append(transcript[:500])
    doc_summary = ' | '.join(summary_parts) if summary_parts else f"Vidéo YouTube: {video_title}"

    return text_chunks, visual_chunks, doc_summary


def _index_into_chromadb(document_id: int, text_chunks: list[dict], visual_chunks: list[dict]) -> bool:
    """Push all content into the ChromaDB collection for this document."""
    try:
        from app.services.vector_store import VectorStore
        vs = VectorStore(document_id=str(document_id))

        all_chunks = text_chunks + visual_chunks  # visual chunks added as text_chunks too
        if all_chunks:
            vs.add_text_chunks(all_chunks)
            logger.info(
                f"Indexed {len(text_chunks)} text + {len(visual_chunks)} visual chunks "
                f"for document {document_id}"
            )

        # Store an overview for the CAG/summary layer
        overview_parts = []
        for vc in visual_chunks[:3]:
            overview_parts.append(vc['content'])
        for tc in text_chunks[:2]:
            overview_parts.append(tc['content'][:300])
        if overview_parts:
            vs.store_document_overview('\n\n'.join(overview_parts))

        return True
    except Exception as e:
        logger.error(f"ChromaDB indexing failed for document {document_id}: {e}")
        return False


# ---------------------------------------------------------------------------
# 4. Main pipeline entry point
# ---------------------------------------------------------------------------

def process_youtube_activity(
    video_id: str,
    video_title: str,
    chapter_id: Optional[int],
    course_id: Optional[int],
) -> Optional[int]:
    """
    Full pipeline:
      1. Fetch transcript (youtube-transcript-api)
      2. Analyze video with Gemini (native YouTube URL → visual + audio)
      3. Build rich chunk set from both sources
      4. Create Document DB record
      5. Index all content into ChromaDB

    Returns the new Document.id, or None on complete failure.
    Must be called inside a Flask app context.
    """
    from app import db
    from app.models import Document

    logger.info(f"Starting YouTube RAG pipeline for video {video_id} — '{video_title}'")

    # Step 1: Transcript
    transcript = fetch_transcript(video_id)
    if transcript:
        logger.info(f"Transcript: {len(transcript)} chars")
    else:
        logger.info("No transcript available — will rely on Gemini vision analysis")

    # Step 2: Gemini analysis (visual + audio)
    analysis = analyze_video_with_gemini(video_id, video_title, transcript)
    if analysis:
        logger.info(f"Gemini analysis: source={analysis.get('source')}, "
                    f"key_moments={len(analysis.get('key_moments', []))}, "
                    f"visual_elements={len(analysis.get('visual_elements', []))}")

    # If we have neither transcript nor analysis, abort
    if not transcript and not analysis:
        logger.error(f"No content could be extracted for video {video_id}")
        return None

    # Step 3: Build chunks
    text_chunks, visual_chunks, doc_summary = _build_indexable_content(
        video_id, video_title, transcript, analysis
    )

    # Persist metadata for later debugging
    meta = {
        'youtube_video_id': video_id,
        'transcript_chars': len(transcript) if transcript else 0,
        'gemini_analysis_source': analysis.get('source') if analysis else None,
        'key_moments_count': len(analysis.get('key_moments', [])) if analysis else 0,
        'visual_elements_count': len(analysis.get('visual_elements', [])) if analysis else 0,
        'text_chunks': len(text_chunks),
        'visual_chunks': len(visual_chunks),
    }

    # Step 4: Create Document record
    doc = Document(
        title=f"[YouTube] {video_title}",
        file_path=None,
        file_type='youtube',
        document_type='youtube',
        chapter_id=chapter_id,
        course_id=course_id,
        summary=doc_summary,
        content_metadata=meta,
    )
    db.session.add(doc)
    db.session.flush()  # get doc.id

    # Step 5: Index into ChromaDB
    success = _index_into_chromadb(doc.id, text_chunks, visual_chunks)
    if not success:
        db.session.rollback()
        return None

    db.session.commit()
    logger.info(f"YouTube RAG pipeline complete — document_id={doc.id}, "
                f"{len(text_chunks)+len(visual_chunks)} total chunks indexed")
    return doc.id

