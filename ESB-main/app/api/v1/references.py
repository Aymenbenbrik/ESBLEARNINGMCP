"""
References API — manage course references and chapter-reference links.

Endpoints:
  GET    /courses/<course_id>/references               list all refs for a course (+ chapter link status)
  POST   /courses/<course_id>/references               create a manual reference
  PUT    /references/<ref_id>                          update reference metadata
  DELETE /references/<ref_id>                          delete reference + links
  POST   /courses/<course_id>/references/import-bib    import TN bibliography (idempotent)
  GET    /chapters/<chapter_id>/references             refs linked to a chapter
  POST   /chapters/<chapter_id>/references             link ref to chapter
  PUT    /chapters/<chapter_id>/references/<ref_id>    update pages / active
  DELETE /chapters/<chapter_id>/references/<ref_id>    unlink ref from chapter
"""

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.api.v1 import api_v1_bp
from app import db
from app.models import Course, Chapter, CourseReference, ChapterReference, TNBibliography, Syllabus, User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user():
    user_id = int(get_jwt_identity())
    return User.query.get(user_id)


def _is_teacher(user):
    return user and (user.is_teacher or user.is_superuser)


# ---------------------------------------------------------------------------
# Course-level reference endpoints
# ---------------------------------------------------------------------------

@api_v1_bp.route('/courses/<int:course_id>/references', methods=['GET'])
@jwt_required()
def list_course_references(course_id):
    """Return all references for a course with optional chapter link status."""
    Course.query.get_or_404(course_id)
    chapter_id = request.args.get('chapter_id', type=int)

    refs = CourseReference.query.filter_by(course_id=course_id).order_by(CourseReference.id).all()

    result = []
    for ref in refs:
        d = ref.to_dict()
        if chapter_id:
            link = ChapterReference.query.filter_by(
                chapter_id=chapter_id, reference_id=ref.id
            ).first()
            d['linked_to_chapter'] = link is not None and link.is_active
            d['pages'] = link.pages if link else None
        result.append(d)

    return jsonify({'references': result})


@api_v1_bp.route('/courses/<int:course_id>/references', methods=['POST'])
@jwt_required()
def create_course_reference(course_id):
    """Create a new manual reference for a course."""
    user = _get_user()
    if not _is_teacher(user):
        return jsonify({'error': 'Unauthorized'}), 403

    Course.query.get_or_404(course_id)
    data = request.get_json() or {}

    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title is required'}), 400

    ref = CourseReference(
        course_id=course_id,
        title=title,
        authors=(data.get('authors') or '').strip() or None,
        url=(data.get('url') or '').strip() or None,
        ref_type=data.get('ref_type', 'book'),
        from_bibliography=False,
    )
    db.session.add(ref)
    db.session.flush()

    # Optionally link to all chapters right away
    if data.get('link_all_chapters', False):
        chapters = Chapter.query.filter_by(course_id=course_id).all()
        for ch in chapters:
            link = ChapterReference(chapter_id=ch.id, reference_id=ref.id, is_active=True)
            db.session.add(link)

    db.session.commit()
    return jsonify(ref.to_dict()), 201


@api_v1_bp.route('/references/<int:ref_id>', methods=['PUT'])
@jwt_required()
def update_course_reference(ref_id):
    """Update reference metadata."""
    user = _get_user()
    if not _is_teacher(user):
        return jsonify({'error': 'Unauthorized'}), 403

    ref = CourseReference.query.get_or_404(ref_id)
    data = request.get_json() or {}

    if 'title' in data:
        ref.title = data['title'].strip() or ref.title
    if 'authors' in data:
        ref.authors = data['authors']
    if 'url' in data:
        ref.url = data['url']
    if 'ref_type' in data:
        ref.ref_type = data['ref_type']

    db.session.commit()
    return jsonify(ref.to_dict())


@api_v1_bp.route('/references/<int:ref_id>', methods=['DELETE'])
@jwt_required()
def delete_course_reference(ref_id):
    """Delete a reference and all its chapter links."""
    user = _get_user()
    if not _is_teacher(user):
        return jsonify({'error': 'Unauthorized'}), 403

    ref = CourseReference.query.get_or_404(ref_id)
    db.session.delete(ref)
    db.session.commit()
    return jsonify({'message': 'Reference deleted'})


@api_v1_bp.route('/courses/<int:course_id>/references/import-bib', methods=['POST'])
@jwt_required()
def import_tn_bibliography(course_id):
    """Import TN syllabus bibliography entries as CourseReferences (idempotent)."""
    user = _get_user()
    if not _is_teacher(user):
        return jsonify({'error': 'Unauthorized'}), 403

    Course.query.get_or_404(course_id)

    syllabus = Syllabus.query.filter_by(course_id=course_id, syllabus_type='tn').first()
    if not syllabus:
        return jsonify({'error': 'No TN syllabus found for this course'}), 404

    bib_entries = TNBibliography.query.filter_by(syllabus_id=syllabus.id).order_by(TNBibliography.position).all()
    if not bib_entries:
        return jsonify({'message': 'No bibliography entries found', 'imported': 0})

    imported = 0
    skipped = 0
    chapters = Chapter.query.filter_by(course_id=course_id).all()

    for bib in bib_entries:
        existing = CourseReference.query.filter_by(tn_bib_id=bib.id).first()
        if existing:
            skipped += 1
            continue

        ref = CourseReference(
            course_id=course_id,
            title=bib.entry[:500],
            from_bibliography=True,
            tn_bib_id=bib.id,
            ref_type='book',
        )
        db.session.add(ref)
        db.session.flush()

        for ch in chapters:
            link = ChapterReference(chapter_id=ch.id, reference_id=ref.id, is_active=True)
            db.session.add(link)

        imported += 1

    db.session.commit()
    return jsonify({
        'message': f'{imported} references imported, {skipped} already existed',
        'imported': imported,
        'skipped': skipped,
    })


# ---------------------------------------------------------------------------
# Chapter-level reference link endpoints
# ---------------------------------------------------------------------------

@api_v1_bp.route('/chapters/<int:chapter_id>/references', methods=['GET'])
@jwt_required()
def list_chapter_references(chapter_id):
    """Return all references linked (active) to a chapter."""
    Chapter.query.get_or_404(chapter_id)
    links = ChapterReference.query.filter_by(chapter_id=chapter_id, is_active=True).all()
    return jsonify({'references': [lnk.to_dict() for lnk in links]})


@api_v1_bp.route('/chapters/<int:chapter_id>/references', methods=['POST'])
@jwt_required()
def link_chapter_reference(chapter_id):
    """Link or reactivate a reference for a chapter."""
    user = _get_user()
    if not _is_teacher(user):
        return jsonify({'error': 'Unauthorized'}), 403

    chapter = Chapter.query.get_or_404(chapter_id)
    data = request.get_json() or {}
    ref_id = data.get('reference_id')
    if not ref_id:
        return jsonify({'error': 'reference_id is required'}), 400

    ref = CourseReference.query.get_or_404(ref_id)
    if ref.course_id != chapter.course_id:
        return jsonify({'error': 'Reference does not belong to this course'}), 400

    link = ChapterReference.query.filter_by(chapter_id=chapter_id, reference_id=ref_id).first()
    if link:
        link.is_active = True
        link.pages = data.get('pages', link.pages)
    else:
        link = ChapterReference(
            chapter_id=chapter_id,
            reference_id=ref_id,
            pages=data.get('pages'),
            is_active=True,
        )
        db.session.add(link)

    db.session.commit()
    return jsonify(link.to_dict()), 201


@api_v1_bp.route('/chapters/<int:chapter_id>/references/<int:ref_id>', methods=['PUT'])
@jwt_required()
def update_chapter_reference(chapter_id, ref_id):
    """Update pages or active status for a chapter-reference link."""
    user = _get_user()
    if not _is_teacher(user):
        return jsonify({'error': 'Unauthorized'}), 403

    link = ChapterReference.query.filter_by(chapter_id=chapter_id, reference_id=ref_id).first_or_404()
    data = request.get_json() or {}

    if 'pages' in data:
        link.pages = data['pages']
    if 'is_active' in data:
        link.is_active = bool(data['is_active'])

    db.session.commit()
    return jsonify(link.to_dict())


@api_v1_bp.route('/chapters/<int:chapter_id>/references/<int:ref_id>', methods=['DELETE'])
@jwt_required()
def unlink_chapter_reference(chapter_id, ref_id):
    """Deactivate (uncheck) a reference for a chapter."""
    user = _get_user()
    if not _is_teacher(user):
        return jsonify({'error': 'Unauthorized'}), 403

    link = ChapterReference.query.filter_by(chapter_id=chapter_id, reference_id=ref_id).first_or_404()
    link.is_active = False
    db.session.commit()
    return jsonify({'message': 'Reference unlinked from chapter'})
