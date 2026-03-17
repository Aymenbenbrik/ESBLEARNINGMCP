from __future__ import annotations

from typing import Any, Dict, List

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from xml.sax.saxutils import escape as _xml_escape


def _para_safe(text: str) -> str:
    """Escape extracted text so ReportLab Paragraph won't treat it as markup.

    We frequently extract snippets containing things like <script>, <body>, <br>, etc.
    ReportLab's Paragraph parser treats these as tags and can crash when tags are
    unbalanced. Escaping ensures we render the content literally.
    """
    t = (text or "")
    # Escape &, <, >
    t = _xml_escape(t)
    # Preserve newlines using ReportLab-friendly line breaks
    t = t.replace("\n", "<br/>")
    return t


def _styles():
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#dc3545'),
        alignment=TA_CENTER,
        spaceAfter=18,
    )
    h_style = ParagraphStyle(
        'H2',
        parent=styles['Heading2'],
        fontSize=13,
        textColor=colors.HexColor('#667eea'),
        spaceAfter=10,
        spaceBefore=12,
    )
    body = ParagraphStyle(
        'Body',
        parent=styles['BodyText'],
        fontSize=10.5,
        leading=15,
        alignment=TA_JUSTIFY,
        spaceAfter=10,
    )
    mono = ParagraphStyle(
        'Mono',
        parent=styles['BodyText'],
        fontName='Courier',
        fontSize=9.5,
        leading=12,
        spaceAfter=8,
    )
    return title_style, h_style, body, mono


def generate_pptx_report_pdf(out_path: str, *, doc_title: str, file_name: str, slides: List[Dict[str, Any]]):
    """Generate a PDF report showing slide-by-slide extracted content."""
    title_style, h_style, body, mono = _styles()
    doc = SimpleDocTemplate(out_path, pagesize=A4, leftMargin=0.75*inch, rightMargin=0.75*inch, topMargin=0.9*inch, bottomMargin=0.75*inch)

    story = []
    story.append(Paragraph("Rapport d'extraction (PPTX)", title_style))
    story.append(Spacer(1, 0.15*inch))

    meta = [["Document", doc_title], ["Fichier", file_name], ["Nombre de slides", str(len(slides))]]
    t = Table(meta, colWidths=[1.6*inch, 4.6*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f0f0f0')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.grey),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(PageBreak())

    for s in slides:
        idx = s.get('index')
        story.append(Paragraph(f"Slide {idx}", h_style))
        txt = (s.get('text') or '').strip()
        notes = (s.get('notes') or '').strip()
        story.append(Paragraph("Texte extrait:", body))
        story.append(Paragraph(_para_safe(txt) or "(vide)", body))
        if notes:
            story.append(Spacer(1, 0.05*inch))
            story.append(Paragraph("Notes (speaker notes):", body))
            story.append(Paragraph(_para_safe(notes), body))
        story.append(Spacer(1, 0.15*inch))
    doc.build(story)


def generate_text_report_pdf(out_path: str, *, doc_title: str, file_name: str, text: str):
    """Generate a PDF report for text-like extraction (pdf/docx/code/ipynb)."""
    title_style, h_style, body, mono = _styles()
    doc = SimpleDocTemplate(out_path, pagesize=A4, leftMargin=0.75*inch, rightMargin=0.75*inch, topMargin=0.9*inch, bottomMargin=0.75*inch)

    story = []
    story.append(Paragraph("Rapport d'extraction", title_style))
    story.append(Spacer(1, 0.15*inch))
    meta = [["Document", doc_title], ["Fichier", file_name]]
    t = Table(meta, colWidths=[1.6*inch, 4.6*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f0f0f0')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.grey),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("Contenu extrait:", h_style))

    # Avoid super-long PDFs (still keep useful content)
    safe = (text or "").strip()
    if len(safe) > 25000:
        safe = safe[:25000] + "\n\n[...] (tronqué)"

    # Render as monospaced blocks to preserve code-like formatting.
    for block in safe.split("\n\n"):
        story.append(Paragraph(_para_safe(block), mono))
        story.append(Spacer(1, 0.08*inch))
    doc.build(story)
