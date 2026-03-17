"""
Section Content API — AI-generated content per TNSection with teacher validation.

Endpoints:
  POST /sections/<section_id>/content/generate   generate content with Gemini
  GET  /sections/<section_id>/content            get current content
  PUT  /sections/<section_id>/content            approve / reject / edit content
"""

from datetime import datetime

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.api.v1 import api_v1_bp
from app import db
from app.models import TNSection, TNChapter, SectionContent, ChapterReference, User
import os


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user():
    user_id = int(get_jwt_identity())
    return User.query.get(user_id)


def _is_teacher(user):
    return user and (user.is_teacher or user.is_superuser)


def _build_generation_prompt(section: TNSection) -> str:
    """Build a Gemini prompt from section metadata, AA links, and reference pages."""
    chapter: TNChapter = section.chapter

    # AA list for this section
    aa_items = []
    for link in section.aa_links:
        aa = link.aa
        if aa:
            aa_items.append(f"AA{aa.number}: {aa.description}")

    # If no section-level AA, fall back to chapter-level
    if not aa_items:
        for link in chapter.aa_links:
            aa = link.aa
            if aa:
                aa_items.append(f"AA{aa.number}: {aa.description}")

    aa_text = "\n".join(aa_items) if aa_items else "Non spécifié"

    # Active references for this chapter + their pages
    ref_lines = []
    for link in ChapterReference.query.filter_by(chapter_id=chapter.id, is_active=True).all():
        ref = link.reference
        if ref:
            pages_note = f" (pages: {link.pages})" if link.pages else ""
            ref_lines.append(f"- {ref.title}{pages_note}")
    refs_text = "\n".join(ref_lines) if ref_lines else "Aucune référence spécifiée"

    return f"""Tu es un expert en enseignement universitaire tunisien (ESB/ESPRIT).
Génère un contenu pédagogique structuré pour la section suivante d'un cours universitaire.

## Section
Chapitre : {chapter.index}. {chapter.title}
Section : {section.index}. {section.title}

## Acquis d'Apprentissage (AA) ciblés
{aa_text}

## Références bibliographiques associées au chapitre
{refs_text}

## Instructions
- Écris en français
- Structure le contenu en sous-parties logiques avec des titres Markdown (##, ###)
- Inclure : définitions clés, explications, exemples concrets, points importants à retenir
- Longueur : 400-700 mots
- Adapte le niveau au contenu universitaire de licence (L1-L3)
- Ne répète pas les AA littéralement, mais assure que le contenu les couvre

Génère uniquement le contenu Markdown, sans introduction ni métadonnées."""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@api_v1_bp.route('/sections/<int:section_id>/content/generate', methods=['POST'])
@jwt_required()
def generate_section_content(section_id):
    """Generate AI content for a TN section using Gemini."""
    user = _get_user()
    if not _is_teacher(user):
        return jsonify({'error': 'Unauthorized'}), 403

    section = TNSection.query.get_or_404(section_id)

    api_key = os.environ.get('GOOGLE_API_KEY', '')
    if not api_key:
        return jsonify({'error': 'GOOGLE_API_KEY not configured'}), 500

    prompt = _build_generation_prompt(section)

    try:
        llm = ChatGoogleGenerativeAI(
            model='gemini-2.5-flash',
            google_api_key=api_key,
            temperature=0.7,
        )
        messages = [
            SystemMessage(content="Tu es un expert en pédagogie universitaire. Génère du contenu de cours en Markdown."),
            HumanMessage(content=prompt),
        ]
        response = llm.invoke(messages)
        generated_text = response.content.strip()
    except Exception as exc:
        return jsonify({'error': f'Gemini error: {str(exc)}'}), 500

    # Upsert SectionContent
    sc = SectionContent.query.filter_by(section_id=section_id).first()
    if sc:
        sc.content = generated_text
        sc.status = 'pending'
        sc.generated_at = datetime.utcnow()
        sc.validated_at = None
        sc.validated_by_id = None
    else:
        sc = SectionContent(
            section_id=section_id,
            content=generated_text,
            status='pending',
        )
        db.session.add(sc)

    db.session.commit()
    return jsonify(sc.to_dict()), 201


@api_v1_bp.route('/sections/<int:section_id>/content', methods=['GET'])
@jwt_required()
def get_section_content(section_id):
    """Get the current AI-generated content for a section."""
    TNSection.query.get_or_404(section_id)
    sc = SectionContent.query.filter_by(section_id=section_id).first()
    if not sc:
        return jsonify({'content': None}), 200
    return jsonify(sc.to_dict())


@api_v1_bp.route('/sections/<int:section_id>/content', methods=['PUT'])
@jwt_required()
def update_section_content(section_id):
    """Approve, reject, or manually edit section content."""
    user = _get_user()
    if not _is_teacher(user):
        return jsonify({'error': 'Unauthorized'}), 403

    TNSection.query.get_or_404(section_id)
    sc = SectionContent.query.filter_by(section_id=section_id).first()
    if not sc:
        return jsonify({'error': 'No content found. Generate first.'}), 404

    data = request.get_json() or {}
    status = data.get('status')
    if status and status not in ('pending', 'approved', 'rejected'):
        return jsonify({'error': 'status must be pending, approved, or rejected'}), 400

    if status:
        sc.status = status
        if status in ('approved', 'rejected'):
            sc.validated_at = datetime.utcnow()
            sc.validated_by_id = user.id

    if 'content' in data and data['content']:
        sc.content = data['content']

    db.session.commit()
    return jsonify(sc.to_dict())
