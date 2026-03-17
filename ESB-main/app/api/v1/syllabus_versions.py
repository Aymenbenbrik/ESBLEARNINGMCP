"""
Syllabus Versioning API
=======================
Manages snapshots of a TN syllabus over time, allowing teachers to propose
revisions that are validated by the responsible before being applied to the
live syllabus data.

Status lifecycle:
    baseline  → v1, auto-created at first extraction (read-only)
    draft     → teacher composing a revision
    proposed  → submitted for validation
    validated → approved, ready to apply
    rejected  → refused with notes
"""
import logging
from datetime import datetime

from flask import jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models import (
    Course, Syllabus, SyllabusVersion, User,
    TNSyllabusAdministrative, TNAA, TNAAP,
    TNChapter, TNSection, TNChapterAAA, TNSectionAAA,
    TNEvaluation, TNBibliography,
)
from app.api.v1 import api_v1_bp

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Snapshot helpers
# ---------------------------------------------------------------------------

def _snapshot_syllabus(syllabus: Syllabus) -> dict:
    """Serialize the current live syllabus to a plain dict (the snapshot format)."""
    admin = syllabus.tn_admin
    admin_dict = {}
    if admin:
        admin_dict = {
            'module_name':       admin.module_name,
            'code_ue':           admin.code_ue,
            'code_ecue':         admin.code_ecue,
            'field':             admin.field,
            'department':        admin.department,
            'option':            admin.option,
            'volume_presentiel': admin.volume_presentiel,
            'volume_personnel':  admin.volume_personnel,
            'coefficient':       admin.coefficient,
            'credits':           admin.credits,
            'responsible':       admin.responsible,
            'teachers':          admin.teachers,
        }

    aa_list = [
        {'number': aa.number, 'description': aa.description}
        for aa in sorted(syllabus.tn_aa, key=lambda x: x.number)
    ]

    aap_list = [
        {'number': aap.number, 'selected': aap.selected}
        for aap in sorted(syllabus.tn_aap, key=lambda x: x.number)
    ]

    chapters_list = []
    for tnc in sorted(syllabus.tn_chapters, key=lambda x: x.index):
        sections = [
            {
                'index': s.index,
                'title': s.title,
                'aa_links': [link.aa.number for link in s.aa_links],
            }
            for s in sorted(tnc.sections, key=lambda s: s.index)
        ]
        chapters_list.append({
            'index':    tnc.index,
            'title':    tnc.title,
            'aa_links': [link.aa.number for link in tnc.aa_links],
            'sections': sections,
        })

    ev = syllabus.tn_evaluation
    evaluation_dict = {}
    if ev:
        evaluation_dict = {
            'methods':              ev.methods,
            'criteria':             ev.criteria,
            'measures':             ev.measures,
            'final_grade_formula':  ev.final_grade_formula,
        }

    bib_list = [
        {'position': b.position, 'entry': b.entry}
        for b in sorted(syllabus.tn_bibliography, key=lambda x: (x.position or 0))
    ]

    return {
        'admin':        admin_dict,
        'aa':           aa_list,
        'aap':          aap_list,
        'chapters':     chapters_list,
        'evaluation':   evaluation_dict,
        'bibliography': bib_list,
    }


def _compute_diff(old_snap: dict, new_snap: dict) -> dict:
    """Return a structured diff summary between two snapshots."""
    diff = {}

    # Admin changes
    admin_changes = {}
    old_admin = old_snap.get('admin', {})
    new_admin = new_snap.get('admin', {})
    for key in set(list(old_admin.keys()) + list(new_admin.keys())):
        if old_admin.get(key) != new_admin.get(key):
            admin_changes[key] = {'from': old_admin.get(key), 'to': new_admin.get(key)}
    if admin_changes:
        diff['admin'] = admin_changes

    # AA changes
    old_aa = {a['number']: a['description'] for a in old_snap.get('aa', [])}
    new_aa = {a['number']: a['description'] for a in new_snap.get('aa', [])}
    aa_diff = {'added': [], 'removed': [], 'modified': []}
    for num, desc in new_aa.items():
        if num not in old_aa:
            aa_diff['added'].append({'number': num, 'description': desc})
        elif old_aa[num] != desc:
            aa_diff['modified'].append({'number': num, 'from': old_aa[num], 'to': desc})
    for num in old_aa:
        if num not in new_aa:
            aa_diff['removed'].append({'number': num})
    if any(aa_diff.values()):
        diff['aa'] = aa_diff

    # Chapter / section changes
    old_chaps = {c['index']: c for c in old_snap.get('chapters', [])}
    new_chaps = {c['index']: c for c in new_snap.get('chapters', [])}
    chap_diff = {'added': [], 'removed': [], 'modified': []}
    for idx, chap in new_chaps.items():
        if idx not in old_chaps:
            chap_diff['added'].append({'index': idx, 'title': chap['title']})
        else:
            old = old_chaps[idx]
            mod = {}
            if old['title'] != chap['title']:
                mod['title'] = {'from': old['title'], 'to': chap['title']}
            # sections
            old_secs = {s['index']: s for s in old.get('sections', [])}
            new_secs = {s['index']: s for s in chap.get('sections', [])}
            sec_diff = {'added': [], 'removed': [], 'modified': []}
            for sidx, sec in new_secs.items():
                if sidx not in old_secs:
                    sec_diff['added'].append({'index': sidx, 'title': sec['title']})
                elif old_secs[sidx]['title'] != sec['title']:
                    sec_diff['modified'].append({'index': sidx, 'from': old_secs[sidx]['title'], 'to': sec['title']})
            for sidx in old_secs:
                if sidx not in new_secs:
                    sec_diff['removed'].append({'index': sidx})
            if any(sec_diff.values()):
                mod['sections'] = sec_diff
            if mod:
                chap_diff['modified'].append({'index': idx, **mod})
    for idx in old_chaps:
        if idx not in new_chaps:
            chap_diff['removed'].append({'index': idx, 'title': old_chaps[idx]['title']})
    if any(chap_diff.values()):
        diff['chapters'] = chap_diff

    # Bibliography changes
    old_bib = {b['position']: b['entry'] for b in old_snap.get('bibliography', [])}
    new_bib = {b['position']: b['entry'] for b in new_snap.get('bibliography', [])}
    bib_diff = {'added': [], 'removed': [], 'modified': []}
    for pos, entry in new_bib.items():
        if pos not in old_bib:
            bib_diff['added'].append({'position': pos, 'entry': entry})
        elif old_bib[pos] != entry:
            bib_diff['modified'].append({'position': pos, 'from': old_bib[pos], 'to': entry})
    for pos in old_bib:
        if pos not in new_bib:
            bib_diff['removed'].append({'position': pos})
    if any(bib_diff.values()):
        diff['bibliography'] = bib_diff

    return diff


def ensure_baseline_version(syllabus: Syllabus, user_id: int) -> SyllabusVersion:
    """Create version 1 (baseline) if it doesn't exist yet. Idempotent."""
    existing = SyllabusVersion.query.filter_by(syllabus_id=syllabus.id, is_baseline=True).first()
    if existing:
        return existing

    snap = _snapshot_syllabus(syllabus)
    v = SyllabusVersion(
        syllabus_id=syllabus.id,
        version_number=1,
        label='Version initiale',
        notes='Syllabus original extrait automatiquement.',
        snapshot=snap,
        diff_summary=None,
        status='baseline',
        is_baseline=True,
        created_by_id=user_id,
    )
    db.session.add(v)
    db.session.commit()
    return v


# ---------------------------------------------------------------------------
# Apply a snapshot to the live Syllabus (smart-merge, preserves AA links)
# ---------------------------------------------------------------------------

def _apply_snapshot(syllabus: Syllabus, snap: dict):
    """Apply a version snapshot to the live Syllabus.

    Strategy:
    - Admin / Evaluation: update fields in-place
    - TNAA: match by number → update; add new; remove missing
    - TNAAP: replace entirely
    - TNChapter: match by index → update title; add new; remove missing
    - TNSection: match by (chapter_index, section_index) → update; add; remove
      NOTE: removing a section also removes its TNSectionAAA links + SectionContent
    - TNBibliography: replace entirely (simple ordered list)
    """
    # --- Admin ---
    admin_data = snap.get('admin', {})
    if admin_data:
        adm = syllabus.tn_admin
        if adm:
            for field, val in admin_data.items():
                if hasattr(adm, field):
                    setattr(adm, field, val)
        else:
            adm = TNSyllabusAdministrative(syllabus_id=syllabus.id, **{k: v for k, v in admin_data.items() if hasattr(TNSyllabusAdministrative, k)})
            db.session.add(adm)

    # --- TNAA ---
    snap_aa = {a['number']: a['description'] for a in snap.get('aa', [])}
    existing_aa = {aa.number: aa for aa in syllabus.tn_aa}
    for num, desc in snap_aa.items():
        if num in existing_aa:
            existing_aa[num].description = desc
        else:
            db.session.add(TNAA(syllabus_id=syllabus.id, number=num, description=desc))
    for num, aa in existing_aa.items():
        if num not in snap_aa:
            db.session.delete(aa)

    # --- TNAAP ---
    TNAAP.query.filter_by(syllabus_id=syllabus.id).delete()
    for a in snap.get('aap', []):
        db.session.add(TNAAP(syllabus_id=syllabus.id, number=a['number'], selected=a.get('selected', False)))

    db.session.flush()

    # Rebuild AA lookup after potential additions
    aa_by_number = {aa.number: aa for aa in TNAA.query.filter_by(syllabus_id=syllabus.id).all()}

    # --- TNChapters & TNSections ---
    snap_chaps = {c['index']: c for c in snap.get('chapters', [])}
    existing_chaps = {tnc.index: tnc for tnc in syllabus.tn_chapters}

    # Remove chapters not in snapshot
    for idx, tnc in existing_chaps.items():
        if idx not in snap_chaps:
            db.session.delete(tnc)

    db.session.flush()

    for idx, chap_data in snap_chaps.items():
        if idx in existing_chaps:
            tnc = existing_chaps[idx]
            tnc.title = chap_data['title']
        else:
            tnc = TNChapter(syllabus_id=syllabus.id, index=idx, title=chap_data['title'])
            db.session.add(tnc)
            db.session.flush()

        # Sections
        snap_secs = {s['index']: s for s in chap_data.get('sections', [])}
        existing_secs = {s.index: s for s in tnc.sections}

        for sidx, sec in existing_secs.items():
            if sidx not in snap_secs:
                db.session.delete(sec)

        db.session.flush()

        for sidx, sec_data in snap_secs.items():
            if sidx in existing_secs:
                existing_secs[sidx].title = sec_data['title']
            else:
                db.session.add(TNSection(chapter_id=tnc.id, index=sidx, title=sec_data['title']))

    # --- Evaluation ---
    ev_data = snap.get('evaluation', {})
    if ev_data:
        ev = syllabus.tn_evaluation
        if ev:
            ev.methods = ev_data.get('methods', ev.methods)
            ev.criteria = ev_data.get('criteria', ev.criteria)
            ev.measures = ev_data.get('measures', ev.measures)
            ev.final_grade_formula = ev_data.get('final_grade_formula', ev.final_grade_formula)
        else:
            db.session.add(TNEvaluation(
                syllabus_id=syllabus.id,
                methods=ev_data.get('methods'),
                criteria=ev_data.get('criteria'),
                measures=ev_data.get('measures'),
                final_grade_formula=ev_data.get('final_grade_formula'),
            ))

    # --- Bibliography (full replacement) ---
    TNBibliography.query.filter_by(syllabus_id=syllabus.id).delete()
    for b in snap.get('bibliography', []):
        db.session.add(TNBibliography(syllabus_id=syllabus.id, position=b.get('position'), entry=b.get('entry', '')))

    db.session.flush()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _get_course_and_syllabus(course_id, user):
    """Common guard: return (course, syllabus) or raise."""
    course = Course.query.get_or_404(course_id)
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus:
        return None, None
    return course, syllabus


@api_v1_bp.route('/syllabus/<int:course_id>/versions', methods=['GET'])
@jwt_required()
def list_syllabus_versions(course_id):
    """List all versions for a course syllabus."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course, syllabus = _get_course_and_syllabus(course_id, user)
        if not syllabus:
            return jsonify({'versions': [], 'total': 0})

        versions = SyllabusVersion.query.filter_by(syllabus_id=syllabus.id)\
            .order_by(SyllabusVersion.version_number).all()

        return jsonify({
            'versions': [v.to_dict() for v in versions],
            'total': len(versions),
            'syllabus_id': syllabus.id,
        })
    except Exception as e:
        logger.error(f"list_syllabus_versions error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/syllabus/<int:course_id>/versions/<int:version_id>', methods=['GET'])
@jwt_required()
def get_syllabus_version(course_id, version_id):
    """Get a specific version, including its full snapshot."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course, syllabus = _get_course_and_syllabus(course_id, user)
        if not syllabus:
            return jsonify({'error': 'Syllabus not found'}), 404

        version = SyllabusVersion.query.filter_by(id=version_id, syllabus_id=syllabus.id).first_or_404()
        return jsonify(version.to_dict(include_snapshot=True))
    except Exception as e:
        logger.error(f"get_syllabus_version error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/syllabus/<int:course_id>/versions', methods=['POST'])
@jwt_required()
def create_syllabus_version(course_id):
    """
    Create a new draft version.

    The teacher optionally provides a partial or full snapshot of proposed changes.
    If no snapshot is provided, the current live state is snapshotted as-is (a "save point").

    Body (all optional):
    {
      "label": "Révision S1 2025",
      "notes": "Ajout de 2 sections sur les réseaux bayésiens",
      "snapshot": { ...full or partial proposed syllabus... }
    }

    If snapshot.chapters is provided, it FULLY replaces the chapters section.
    Same for snapshot.admin, snapshot.bibliography, snapshot.aa, snapshot.evaluation.
    Missing keys fall back to the current live state.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course, syllabus = _get_course_and_syllabus(course_id, user)
        if not syllabus:
            return jsonify({'error': 'Syllabus not found'}), 404

        if not (user.is_teacher or user.is_superuser):
            return jsonify({'error': 'Only teachers can create versions'}), 403

        data = request.get_json(silent=True) or {}

        # Ensure baseline exists first
        ensure_baseline_version(syllabus, user_id)

        # Build snapshot: start from current live state, merge provided overrides
        live_snap = _snapshot_syllabus(syllabus)
        proposed_snap_override = data.get('snapshot', {})
        merged_snap = {**live_snap}
        for key in ('admin', 'aa', 'aap', 'chapters', 'evaluation', 'bibliography'):
            if key in proposed_snap_override:
                merged_snap[key] = proposed_snap_override[key]

        # Compute version number
        max_version = db.session.query(db.func.max(SyllabusVersion.version_number))\
            .filter_by(syllabus_id=syllabus.id).scalar() or 0
        new_number = max_version + 1

        # Compute diff vs previous version
        prev = SyllabusVersion.query.filter_by(syllabus_id=syllabus.id)\
            .order_by(SyllabusVersion.version_number.desc()).first()
        diff = _compute_diff(prev.snapshot if prev else {}, merged_snap)

        label = data.get('label') or f'Version {new_number}'
        version = SyllabusVersion(
            syllabus_id=syllabus.id,
            version_number=new_number,
            label=label,
            notes=data.get('notes'),
            snapshot=merged_snap,
            diff_summary=diff if diff else None,
            status='draft',
            is_baseline=False,
            created_by_id=user_id,
        )
        db.session.add(version)
        db.session.commit()

        return jsonify(version.to_dict(include_snapshot=True)), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"create_syllabus_version error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/syllabus/<int:course_id>/versions/<int:version_id>', methods=['PATCH'])
@jwt_required()
def update_syllabus_version(course_id, version_id):
    """
    Update label, notes, or snapshot of a DRAFT version.
    Only the creator or a superuser can update.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course, syllabus = _get_course_and_syllabus(course_id, user)
        if not syllabus:
            return jsonify({'error': 'Syllabus not found'}), 404

        version = SyllabusVersion.query.filter_by(id=version_id, syllabus_id=syllabus.id).first_or_404()

        if version.status not in ('draft',):
            return jsonify({'error': f'Cannot edit a version with status "{version.status}"'}), 400

        if version.created_by_id != user_id and not user.is_superuser:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json(silent=True) or {}

        if 'label' in data:
            version.label = data['label']
        if 'notes' in data:
            version.notes = data['notes']
        if 'snapshot' in data:
            # Merge into current snapshot
            for key in ('admin', 'aa', 'aap', 'chapters', 'evaluation', 'bibliography'):
                if key in data['snapshot']:
                    version.snapshot[key] = data['snapshot'][key]
            db.session.execute(db.text(
                "UPDATE syllabus_version SET snapshot=:snap WHERE id=:id"
            ), {'snap': __import__('json').dumps(version.snapshot), 'id': version.id})

            # Recompute diff
            prev = SyllabusVersion.query.filter_by(syllabus_id=syllabus.id)\
                .filter(SyllabusVersion.version_number < version.version_number)\
                .order_by(SyllabusVersion.version_number.desc()).first()
            version.diff_summary = _compute_diff(prev.snapshot if prev else {}, version.snapshot)

        db.session.commit()
        return jsonify(version.to_dict(include_snapshot=True))

    except Exception as e:
        db.session.rollback()
        logger.error(f"update_syllabus_version error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/syllabus/<int:course_id>/versions/<int:version_id>/submit', methods=['POST'])
@jwt_required()
def submit_syllabus_version(course_id, version_id):
    """Submit a draft version for validation (draft → proposed)."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course, syllabus = _get_course_and_syllabus(course_id, user)
        version = SyllabusVersion.query.filter_by(id=version_id, syllabus_id=syllabus.id).first_or_404()

        if version.status != 'draft':
            return jsonify({'error': f'Only drafts can be submitted. Current status: {version.status}'}), 400
        if version.created_by_id != user_id and not user.is_superuser:
            return jsonify({'error': 'Access denied'}), 403

        version.status = 'proposed'
        db.session.commit()
        return jsonify(version.to_dict())

    except Exception as e:
        db.session.rollback()
        logger.error(f"submit_syllabus_version error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/syllabus/<int:course_id>/versions/<int:version_id>/validate', methods=['POST'])
@jwt_required()
def validate_syllabus_version(course_id, version_id):
    """Validate a proposed version (proposed → validated). Only teacher/superuser."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        if not (user.is_teacher or user.is_superuser):
            return jsonify({'error': 'Only teachers or admins can validate versions'}), 403

        course, syllabus = _get_course_and_syllabus(course_id, user)
        version = SyllabusVersion.query.filter_by(id=version_id, syllabus_id=syllabus.id).first_or_404()

        if version.status != 'proposed':
            return jsonify({'error': f'Only proposed versions can be validated. Current: {version.status}'}), 400

        version.status = 'validated'
        version.validated_by_id = user_id
        version.validated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(version.to_dict())

    except Exception as e:
        db.session.rollback()
        logger.error(f"validate_syllabus_version error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/syllabus/<int:course_id>/versions/<int:version_id>/reject', methods=['POST'])
@jwt_required()
def reject_syllabus_version(course_id, version_id):
    """Reject a proposed version with optional notes (proposed → rejected)."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        if not (user.is_teacher or user.is_superuser):
            return jsonify({'error': 'Only teachers or admins can reject versions'}), 403

        course, syllabus = _get_course_and_syllabus(course_id, user)
        version = SyllabusVersion.query.filter_by(id=version_id, syllabus_id=syllabus.id).first_or_404()

        if version.status != 'proposed':
            return jsonify({'error': f'Only proposed versions can be rejected. Current: {version.status}'}), 400

        data = request.get_json(silent=True) or {}
        version.status = 'rejected'
        version.rejection_notes = data.get('rejection_notes') or data.get('notes')
        db.session.commit()
        return jsonify(version.to_dict())

    except Exception as e:
        db.session.rollback()
        logger.error(f"reject_syllabus_version error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/syllabus/<int:course_id>/versions/<int:version_id>/apply', methods=['POST'])
@jwt_required()
def apply_syllabus_version(course_id, version_id):
    """
    Apply a validated version's snapshot to the live syllabus.
    This is a smart-merge operation: preserves AA links on unchanged chapters/sections.
    Only teacher (course owner) or superuser.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course, syllabus = _get_course_and_syllabus(course_id, user)
        if course.teacher_id != user_id and not user.is_superuser:
            return jsonify({'error': 'Only the course owner or an admin can apply a version'}), 403

        version = SyllabusVersion.query.filter_by(id=version_id, syllabus_id=syllabus.id).first_or_404()

        if version.status != 'validated':
            return jsonify({'error': f'Only validated versions can be applied. Current: {version.status}'}), 400

        _apply_snapshot(syllabus, version.snapshot)

        version.applied_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'message': f'Version {version.version_number} applied to live syllabus.',
            'version': version.to_dict(),
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"apply_syllabus_version error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/syllabus/<int:course_id>/versions/diff', methods=['GET'])
@jwt_required()
def diff_syllabus_versions(course_id):
    """
    Compute diff between two versions.
    Query params: from=<version_id>&to=<version_id>
    If 'from' is omitted, compares against the baseline (v1).
    If 'to' is omitted, compares against the latest version.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course, syllabus = _get_course_and_syllabus(course_id, user)
        if not syllabus:
            return jsonify({'error': 'Syllabus not found'}), 404

        from_id = request.args.get('from', type=int)
        to_id   = request.args.get('to',   type=int)

        if from_id:
            v_from = SyllabusVersion.query.filter_by(id=from_id, syllabus_id=syllabus.id).first_or_404()
        else:
            v_from = SyllabusVersion.query.filter_by(syllabus_id=syllabus.id, is_baseline=True).first()

        if to_id:
            v_to = SyllabusVersion.query.filter_by(id=to_id, syllabus_id=syllabus.id).first_or_404()
        else:
            v_to = SyllabusVersion.query.filter_by(syllabus_id=syllabus.id)\
                .order_by(SyllabusVersion.version_number.desc()).first()

        if not v_from or not v_to:
            return jsonify({'error': 'Not enough versions to compute diff'}), 400

        diff = _compute_diff(v_from.snapshot, v_to.snapshot)
        return jsonify({
            'from': v_from.to_dict(),
            'to':   v_to.to_dict(),
            'diff': diff,
            'has_changes': bool(diff),
        })

    except Exception as e:
        logger.error(f"diff_syllabus_versions error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_v1_bp.route('/syllabus/<int:course_id>/versions/report', methods=['GET'])
@jwt_required()
def syllabus_change_report(course_id):
    """
    Generate an AI-written end-of-course change report.
    Compares the baseline (v1) to the latest validated version and produces
    a structured French-language narrative report.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course, syllabus = _get_course_and_syllabus(course_id, user)
        if not syllabus:
            return jsonify({'error': 'Syllabus not found'}), 404

        baseline = SyllabusVersion.query.filter_by(syllabus_id=syllabus.id, is_baseline=True).first()
        latest   = SyllabusVersion.query.filter_by(syllabus_id=syllabus.id)\
            .filter(SyllabusVersion.status.in_(['validated', 'baseline']))\
            .order_by(SyllabusVersion.version_number.desc()).first()

        if not baseline:
            return jsonify({'error': 'No baseline version found. Please ensure the syllabus has been extracted.'}), 400

        all_versions = SyllabusVersion.query.filter_by(syllabus_id=syllabus.id)\
            .order_by(SyllabusVersion.version_number).all()

        diff = _compute_diff(baseline.snapshot, latest.snapshot) if latest and latest.id != baseline.id else {}

        # Build version timeline for context
        timeline = [
            {
                'version_number': v.version_number,
                'label':          v.label,
                'status':         v.status,
                'created_at':     v.created_at.isoformat() if v.created_at else None,
                'notes':          v.notes,
                'diff_summary':   v.diff_summary,
            }
            for v in all_versions
        ]

        # AI generation (optional — returns structured report even without AI)
        api_key = current_app.config.get('GOOGLE_API_KEY', '')
        ai_narrative = None
        if api_key and diff:
            try:
                import json as _json
                from langchain_google_genai import ChatGoogleGenerativeAI
                from langchain_core.messages import SystemMessage, HumanMessage

                llm = ChatGoogleGenerativeAI(
                    model=current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash'),
                    google_api_key=api_key,
                    temperature=0.2,
                )

                prompt = f"""Tu rédiges un rapport pédagogique de fin de cours pour le module "{course.title}".

Ce rapport compare la version initiale du syllabus (v{baseline.version_number}) à la version finale (v{latest.version_number})
et documente toutes les modifications apportées par l'enseignant au fil du semestre.

HISTORIQUE DES VERSIONS :
{_json.dumps(timeline, ensure_ascii=False, indent=2)}

DIFFÉRENCES ENTRE VERSION INITIALE ET VERSION FINALE :
{_json.dumps(diff, ensure_ascii=False, indent=2)}

Rédige un rapport structuré en français avec les sections suivantes :
1. **Résumé** (2-3 phrases)
2. **Modifications du contenu pédagogique** (chapitres et sections)
3. **Évolution des acquis d'apprentissage** (AA)
4. **Modifications bibliographiques**
5. **Justification pédagogique** (synthèse des notes de l'enseignant)
6. **Conclusion**

Utilise un style formel académique. Sois concis mais précis."""

                resp = llm.invoke([
                    SystemMessage(content="Tu es un expert en ingénierie pédagogique universitaire."),
                    HumanMessage(content=prompt),
                ])
                ai_narrative = resp.content
            except Exception as ai_err:
                logger.warning(f"AI report generation failed: {ai_err}")

        return jsonify({
            'course':       {'id': course.id, 'title': course.title},
            'baseline':     baseline.to_dict(),
            'latest':       latest.to_dict() if latest else None,
            'timeline':     timeline,
            'diff':         diff,
            'has_changes':  bool(diff),
            'ai_narrative': ai_narrative,
            'total_versions': len(all_versions),
        })

    except Exception as e:
        logger.error(f"syllabus_change_report error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
