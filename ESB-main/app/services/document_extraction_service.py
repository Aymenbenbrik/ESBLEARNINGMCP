import os
import shutil
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional

from datetime import datetime

from flask import current_app

from app import db
from app.models import Document


def _uploads_dir() -> str:
    return current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')


def _abs_doc_path(doc: Document) -> str:
    """Return absolute filesystem path for a Document."""
    if not doc.file_path:
        raise ValueError("Document has no file_path")
    return os.path.join(_uploads_dir(), doc.file_path)


def _normalize_text(s: str) -> str:
    if not s:
        return ""
    return unicodedata.normalize('NFC', s)


def _ensure_reports_dir() -> str:
    reports_dir = os.path.join(_uploads_dir(), 'reports')
    os.makedirs(reports_dir, exist_ok=True)
    return reports_dir


def _ensure_video_frames_dir(doc_id: int) -> str:
    frames_dir = os.path.join(_uploads_dir(), 'video_frames', f'doc_{doc_id}')
    os.makedirs(frames_dir, exist_ok=True)
    return frames_dir


def analyze_document(doc: Document, force: bool = False) -> Dict[str, Any]:
    """Analyze/extract a document so the user can *see* the extraction.

    Stores results in doc.analysis_results and a downloadable PDF in doc.analysis_report_path.
    """

    if doc.analysis_results and not force:
        return doc.analysis_results

    file_type = (doc.file_type or '').lower().strip()
    path = _abs_doc_path(doc)
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    results: Dict[str, Any] = {
        'file_type': file_type,
        'file_name': os.path.basename(doc.file_path or ''),
        'document_title': doc.title,
        'generated_at': datetime.utcnow().isoformat() + 'Z',
    }

    # VIDEO
    if file_type in ['mp4', 'mov', 'mkv', 'avi', 'webm']:
        google_key = current_app.config.get('GOOGLE_API_KEY') or os.getenv('GOOGLE_API_KEY')
        if not google_key:
            raise ValueError("GOOGLE_API_KEY not configured (needed for video analysis)")

        from app.services.video_service import VideoAnalysisService

        svc = VideoAnalysisService(google_api_key=google_key)
        course_id = doc.course_id or (doc.chapter.course_id if doc.chapter_id and doc.chapter else None)
        course_id = course_id or 0
        analysis = svc.analyze_video_complete(path, course_id=course_id, week_num=None)

        # Copy screenshots to uploads/ so we can serve them in the web UI.
        frames_dir = _ensure_video_frames_dir(doc.id)
        visual_items = []
        for item in analysis.get('visual_analysis') or []:
            src = item.get('screenshot_path')
            if src and os.path.exists(src):
                dst_name = os.path.basename(src)
                dst = os.path.join(frames_dir, dst_name)
                try:
                    shutil.copy2(src, dst)
                except Exception:
                    pass
                rel = os.path.relpath(dst, _uploads_dir()).replace('\\', '/')
                item = dict(item)
                item['screenshot_relpath'] = rel
            visual_items.append(item)

        results.update({
            'type': 'video',
            'duration': analysis.get('duration'),
            'audio_transcription': _normalize_text(analysis.get('audio_transcription') or ''),
            'summary': _normalize_text(analysis.get('summary') or ''),
            'visual_analysis': visual_items,
            'timeline': analysis.get('timeline') or [],
        })

        # Copy PDF report into uploads/reports
        pdf_src = analysis.get('pdf_path')
        if pdf_src and os.path.exists(pdf_src):
            reports_dir = _ensure_reports_dir()
            dst_name = f"doc_{doc.id}_video_report.pdf"
            dst = os.path.join(reports_dir, dst_name)
            shutil.copy2(pdf_src, dst)
            doc.analysis_report_path = os.path.join('reports', dst_name).replace('\\', '/')

    # # PPTX
    # elif file_type in ['ppt', 'pptx']:
    #     slides: List[Dict[str, Any]] = []
    #     try:
    #         if file_type == 'pptx':
    #             from pptx import Presentation
    #             prs = Presentation(path)
    #             for i, slide in enumerate(prs.slides, start=1):
    #                 texts = []
    #                 for shape in slide.shapes:
    #                     if hasattr(shape, 'text') and shape.text and shape.text.strip():
    #                         texts.append(shape.text.strip())
    #                 notes_text = ''
    #                 try:
    #                     if slide.has_notes_slide and slide.notes_slide and slide.notes_slide.notes_text_frame:
    #                         notes_text = slide.notes_slide.notes_text_frame.text.strip()
    #                 except Exception:
    #                     notes_text = ''
    #                 slides.append({
    #                     'index': i,
    #                     'text': _normalize_text("\n".join(texts)),
    #                     'notes': _normalize_text(notes_text),
    #                 })
    #         else:
    #             # legacy .ppt: reuse textlike extraction
    #             from app.services.file_service import extract_text_from_ppt
    #             t = extract_text_from_ppt(path)
    #             slides.append({'index': 1, 'text': _normalize_text(t), 'notes': ''})
    #     except Exception as e:
    #         slides.append({'index': 1, 'text': f"Erreur extraction PPTX: {e}", 'notes': ''})

    #     results.update({'type': 'pptx', 'slides': slides})

    #     # Generate a PDF report for PPTX extraction
    #     from app.services.extraction_report_service import generate_pptx_report_pdf
    #     reports_dir = _ensure_reports_dir()
    #     dst_name = f"doc_{doc.id}_pptx_report.pdf"
    #     dst = os.path.join(reports_dir, dst_name)
    #     generate_pptx_report_pdf(dst, doc_title=doc.title, file_name=results['file_name'], slides=slides)
    #     doc.analysis_report_path = os.path.join('reports', dst_name).replace('\\', '/')

    # # OTHER FILES: store extracted text for display
    # else:
    #     from app.services.file_service import extract_text_from_file
    #     extracted = extract_text_from_file(path)
    #     results.update({'type': 'text', 'extracted_text': _normalize_text(extracted or '')})

    #     from app.services.extraction_report_service import generate_text_report_pdf
    #     reports_dir = _ensure_reports_dir()
    #     dst_name = f"doc_{doc.id}_text_report.pdf"
    #     dst = os.path.join(reports_dir, dst_name)
    #     generate_text_report_pdf(dst, doc_title=doc.title, file_name=results['file_name'], text=results['extracted_text'])
    #     doc.analysis_report_path = os.path.join('reports', dst_name).replace('\\', '/')

    doc.analysis_results = results
    db.session.commit()
    return results
