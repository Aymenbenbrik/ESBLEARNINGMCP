"""
YouTube RAG Service
===================
Fetches a YouTube video transcript and indexes it into ChromaDB so the
chapter chatbot can answer questions about the video content.
"""

import logging
import uuid
from typing import Optional

from flask import current_app

logger = logging.getLogger(__name__)

# Maximum characters to index per video (keep token cost reasonable)
MAX_TRANSCRIPT_CHARS = 60_000
CHUNK_SIZE = 1_200      # characters per chunk
CHUNK_OVERLAP = 200


def fetch_transcript(video_id: str, languages: list[str] | None = None) -> Optional[str]:
    """
    Fetch the full transcript text for a YouTube video.
    Returns concatenated plain text or None if unavailable.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
        langs = languages or ['fr', 'en', 'ar']
        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=langs)
        except NoTranscriptFound:
            # Try any available language
            transcripts = YouTubeTranscriptApi.list_transcripts(video_id)
            transcript_obj = transcripts.find_manually_created_transcript(
                [t.language_code for t in transcripts]
            ) if any(True for _ in transcripts._manually_created_transcripts.values()) else \
                transcripts.find_generated_transcript(
                    [t.language_code for t in transcripts._generated_transcripts.values()]
                )
            transcript_list = transcript_obj.fetch()

        text = ' '.join(entry['text'] for entry in transcript_list)
        return text[:MAX_TRANSCRIPT_CHARS]
    except Exception as e:
        logger.warning(f"Transcript fetch failed for video {video_id}: {e}")
        return None


def _chunk_text(text: str) -> list[dict]:
    """Split transcript into overlapping chunks suitable for embedding."""
    chunks = []
    start = 0
    chunk_index = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunk_text = text[start:end]
        chunks.append({
            'content': chunk_text,
            'section_number': '1',
            'section_title': 'Transcript',
            'page_number': 1,
            'chunk_index': chunk_index,
            'metadata': {'source': 'youtube_transcript'},
        })
        start += CHUNK_SIZE - CHUNK_OVERLAP
        chunk_index += 1
    return chunks


def index_youtube_transcript(document_id: int, transcript_text: str) -> bool:
    """
    Index transcript text into ChromaDB under collection `doc_{document_id}`.
    Returns True on success.
    """
    try:
        from app.services.vector_store import VectorStore
        vs = VectorStore(document_id=str(document_id))
        chunks = _chunk_text(transcript_text)
        if chunks:
            vs.add_text_chunks(chunks)
            logger.info(f"Indexed {len(chunks)} transcript chunks for doc {document_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to index transcript for doc {document_id}: {e}")
        return False


def process_youtube_activity(
    video_id: str,
    video_title: str,
    chapter_id: int,
    course_id: int,
) -> Optional[int]:
    """
    Full pipeline: fetch transcript → create Document record → index in ChromaDB.
    Returns the new Document.id or None on failure.

    Must be called inside a Flask app context with an active DB session.
    """
    from app import db
    from app.models import Document

    transcript = fetch_transcript(video_id)
    if not transcript:
        logger.warning(f"No transcript for video {video_id} — activity will not be RAG-enabled")
        return None

    # Generate a short summary via Gemini (optional but helpful for chat context)
    summary = None
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import HumanMessage, SystemMessage
        model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
        api_key = current_app.config.get('GOOGLE_API_KEY', '')
        llm = ChatGoogleGenerativeAI(model=model_name, google_api_key=api_key, temperature=0.2, max_tokens=600)
        resp = llm.invoke([
            SystemMessage(content="Tu résumes des transcriptions de vidéos pédagogiques en 3-5 phrases clés."),
            HumanMessage(content=f"Résume cette transcription en 3-5 phrases :\n\n{transcript[:4000]}"),
        ])
        summary = resp.content.strip()
    except Exception as e:
        logger.warning(f"Summary generation failed: {e}")

    # Create Document record (document_type='youtube', no file_path)
    doc = Document(
        title=f"[YouTube] {video_title}",
        file_path=None,
        file_type='youtube',
        document_type='youtube',
        chapter_id=chapter_id,
        course_id=course_id,
        summary=summary,
        content_metadata={'youtube_video_id': video_id, 'transcript_length': len(transcript)},
    )
    db.session.add(doc)
    db.session.flush()  # get doc.id without full commit

    # Index transcript
    success = index_youtube_transcript(doc.id, transcript)
    if not success:
        db.session.rollback()
        return None

    db.session.commit()
    return doc.id
