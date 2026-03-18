from __future__ import annotations

from datetime import datetime

import os
import re
import random

from flask import Blueprint, render_template, redirect, url_for, flash, request, current_app, jsonify
from flask_login import login_required, current_user
from sqlalchemy import or_, func

from app import db
from app.models import Course, Chapter, Document, QuestionBankQuestion, Enrollment
from app.services.ai_service import generate_quiz_questions

# NOTE:
# The Question Bank generation must use the EXACT same RAG flow as the TN quiz.
# We therefore reuse the TN setup wizard (syllabus.tn_quiz_setup) with target=bank
# and implement a TN-compatible generator here.

question_bank_bp = Blueprint('question_bank', __name__, url_prefix='/question-bank')


def _teacher_guard():
    if not (current_user.is_teacher or current_user.is_superuser):
        flash('Access denied.', 'danger')
        return False
    return True


def _syllabus_week_text(course_id: int, week_num: int) -> tuple[str, list]:
    """Reuse syllabus weekly plan text + CLOs when available."""
    from app.models import Syllabus
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus or not syllabus.weekly_plan:
        return '', []

    for week_data in syllabus.weekly_plan:
        if str(week_data.get('Week#')) == str(week_num):
            return week_data.get('Class Objectives', '') or '', (week_data.get('CLOs', []) or [])
    return '', []


@question_bank_bp.route('/', methods=['GET'])
@login_required
def index():
    if not _teacher_guard():
        return redirect(url_for('courses.index'))

    # Cleanup: remove truly orphan questions only.
    # IMPORTANT: do NOT delete approved questions just because chapter_id is missing; keep them,
    # and simply filter them out of the UI until they are properly linked.
    try:
        QuestionBankQuestion.query.filter(
            (QuestionBankQuestion.course_id.is_(None)) |
            ((QuestionBankQuestion.chapter_id.is_(None)) & (QuestionBankQuestion.approved_at.is_(None)))
        ).delete(synchronize_session=False)
        db.session.commit()
    except Exception:
        db.session.rollback()

    # Courses list
    # NOTE: in some datasets Course.teacher_id can be NULL.
    # We don't want the bank UI to look empty for teachers in that case.
    if current_user.is_superuser and not current_user.is_teacher:
        courses = Course.query.order_by(Course.created_at.desc()).all()
    else:
        courses = Course.query.filter(
            (Course.teacher_id == current_user.id) | (Course.teacher_id.is_(None))
        ).order_by(Course.created_at.desc()).all()

    # Final fallback (never show an empty module dropdown if courses exist)
    if not courses:
        courses = Course.query.order_by(Course.created_at.desc()).all()

    # optional selected course
    course_id = request.args.get('course_id', type=int)
    selected_course = Course.query.get(course_id) if course_id else (courses[0] if courses else None)

    # Backward-compatibility: older TN question-bank approvals stored AAA codes as "CLO X".
    # Normalize to "AAA X" so the UI + filters remain coherent.
    if selected_course:
        try:
            (QuestionBankQuestion.query
                .filter(QuestionBankQuestion.course_id == selected_course.id)
                .filter(QuestionBankQuestion.clo.like('CLO%'))
                .update({QuestionBankQuestion.clo: func.replace(QuestionBankQuestion.clo, 'CLO', 'AA')}, synchronize_session=False)
            )
            db.session.commit()
        except Exception:
            db.session.rollback()

    # Safe defaults (template expects these variables even when no course exists)
    chapters = []
    questions = []
    available_aaas = []
    available_blooms = []
    available_difficulties = []
    chapter_labels = {}

    # Current filter selections (for keeping UI state)
    chapter_ids: list[int] = []
    aaa_values: list[str] = []
    bloom_values: list[str] = []
    difficulty_values: list[str] = []

    if selected_course:
        # Prefer normalized Chapter rows (legacy / BGA flow).
        chapters = Chapter.query.filter_by(course_id=selected_course.id).order_by(Chapter.order.asc()).all()

        # TN flow: chapters live under Syllabus -> TNChapter
        # (Course model does not necessarily have syllabus_id; syllabus is linked by course_id.)
        if not chapters:
            try:
                from app.models import Syllabus, TNChapter
                syllabus = Syllabus.query.filter_by(course_id=selected_course.id).first()
                if syllabus:
                    chapters = (
                        TNChapter.query.filter_by(syllabus_id=syllabus.id)
                        .order_by(TNChapter.index.asc())
                        .all()
                    )
            except Exception:
                chapters = []

        # For UI display (question cards)
        chapter_labels = {}
        for ch in chapters:
            idx = getattr(ch, 'index', None) or getattr(ch, 'order', None) or getattr(ch, 'id', None)
            title = getattr(ch, 'title', '')
            chapter_labels[ch.id] = f"#{idx} — {title}" if title else f"#{idx}"

        # IMPORTANT: Bank page shows ONLY approved questions.
        q = QuestionBankQuestion.query.filter(
            QuestionBankQuestion.course_id == selected_course.id,
            QuestionBankQuestion.approved_at.isnot(None),
        )

        # Multi-select filters (GET lists)
        def _to_int_list(values):
            out = []
            for v in values:
                try:
                    iv = int(v)
                    if iv:
                        out.append(iv)
                except Exception:
                    continue
            return out

        chapter_ids = _to_int_list(request.args.getlist('chapter_id'))
        if chapter_ids:
            q = q.filter(QuestionBankQuestion.chapter_id.in_(chapter_ids))

        # In the TN module view, the syllabus uses "AAA" (acquis) rather than "CLO".
        # Internally we still store the tag in QuestionBankQuestion.clo for compatibility,
        # but on the UI we treat it as "AAA".
        aaa_values = [v.strip() for v in request.args.getlist('aaa') if (v or '').strip()]
        if aaa_values:
            # Stored tag may be "CLO 1", "AAA1", "AA1", etc. Match by token inclusion.
            q = q.filter(or_(*[QuestionBankQuestion.clo.ilike(f"%{v}%") for v in aaa_values]))

        bloom_values = [v.strip() for v in request.args.getlist('bloom') if (v or '').strip()]
        if bloom_values:
            q = q.filter(QuestionBankQuestion.bloom_level.in_(bloom_values))

        difficulty_values = [v.strip() for v in request.args.getlist('difficulty') if (v or '').strip()]
        if difficulty_values:
            q = q.filter(QuestionBankQuestion.difficulty.in_(difficulty_values))

        questions = q.order_by(QuestionBankQuestion.created_at.desc()).all()

        # Build option lists dynamically based on approved questions (optionally constrained by course+chapter).
        base = QuestionBankQuestion.query.filter(
            QuestionBankQuestion.course_id == selected_course.id,
            QuestionBankQuestion.approved_at.isnot(None),
        )
        if chapter_ids:
            base = base.filter(QuestionBankQuestion.chapter_id.in_(chapter_ids))
        # AAA list: prefer TN syllabus mapping when available so the UI can show
        # "AAA in selected chapters" even before lots of questions exist.
        try:
            from app.models import TNChapter, TNChapterAA, TNAA

            chapter_orders = []
            if chapter_ids:
                chapter_orders = [c.order for c in Chapter.query.filter(Chapter.id.in_(chapter_ids)).all()]

            tnq = TNAA.query.join(TNChapterAA).join(TNChapter).filter(
                TNChapter.syllabus_id == syllabus.id
            )
            if chapter_orders:
                tnq = tnq.filter(TNChapter.index.in_(chapter_orders))

            available_aaas = sorted({(x[0] or '').strip() for x in tnq.with_entities(TNAA.code).distinct().all() if (x[0] or '').strip()})
        except Exception:
            # Fallback: derive AAA/CLO values from approved questions (historic data)
            available_aaas = sorted({(x[0] or '').strip() for x in base.with_entities(QuestionBankQuestion.clo).distinct().all() if (x[0] or '').strip()})
        available_blooms = sorted({(x[0] or '').strip() for x in base.with_entities(QuestionBankQuestion.bloom_level).distinct().all() if (x[0] or '').strip()})
        available_difficulties = sorted({(x[0] or '').strip() for x in base.with_entities(QuestionBankQuestion.difficulty).distinct().all() if (x[0] or '').strip()})

    return render_template(
        'question_bank/index.html',
        courses=courses,
        selected_course=selected_course,
        chapters=chapters,
        chapter_labels=chapter_labels,
        questions=questions,
        available_aaas=available_aaas,
        available_blooms=available_blooms,
        available_difficulties=available_difficulties,
        chapter_ids=chapter_ids,
        aaa_values=aaa_values,
        bloom_values=bloom_values,
        difficulty_values=difficulty_values,
    )





@question_bank_bp.route('/approve-selected', methods=['POST'])
@login_required
def approve_selected():
    """Bulk-approve existing bank questions from the bank list (optional helper)."""
    if not _teacher_guard():
        return redirect(url_for('courses.index'))

    course_id = request.form.get('course_id', type=int)
    if not course_id:
        flash('Missing course_id.', 'danger')
        return redirect(url_for('question_bank.index'))

    course = Course.query.get_or_404(course_id)
    if not (current_user.is_superuser or (current_user.is_teacher and course.teacher_id == current_user.id)):
        flash('Access denied.', 'danger')
        return redirect(url_for('courses.view', course_id=course_id, tab='bank'))

    ids = [int(x) for x in request.form.getlist('question_ids') if str(x).isdigit()]
    if not ids:
        flash('No questions selected.', 'warning')
        return redirect(url_for('courses.view', course_id=course_id, tab='bank'))

    updated = 0
    now = datetime.utcnow()
    for qid in ids:
        q = QuestionBankQuestion.query.get(qid)
        if not q or q.course_id != course_id:
            continue

        # allow editing before approval
        q.clo = (request.form.get(f'clo_{qid}') or q.clo)
        q.bloom_level = (request.form.get(f'bloom_{qid}') or q.bloom_level)
        q.difficulty = (request.form.get(f'difficulty_{qid}') or q.difficulty)

        if not q.approved_at:
            q.approved_at = now
            updated += 1

    if updated:
        db.session.commit()
        flash(f'Approved {updated} question(s).', 'success')
    else:
        flash('Nothing to approve.', 'info')

    return redirect(url_for('courses.view', course_id=course_id, tab='bank'))

@question_bank_bp.route('/tn/generate/<int:course_id>', methods=['POST'])
@login_required
def tn_generate(course_id: int):
    """Generate QUESTIONS for the Question Bank using the SAME TN RAG as the TN quiz.

    This uses the exact same TN wizard payload (chapters/sections/AA numbers + bloom/difficulty + volumes)
    and the exact same generate_quiz_questions pipeline.

    Difference vs graded quiz: we do NOT create a Quiz record; we show a per-question approval screen
    and only approved questions are stored in QuestionBankQuestion.
    """

    if not _teacher_guard():
        return redirect(url_for('courses.index'))

    course = Course.query.get_or_404(course_id)
    if not (current_user.is_superuser or (current_user.is_teacher and course.teacher_id == current_user.id)):
        flash("Only the course teacher can generate questions.", "danger")
        return redirect(url_for('courses.view', course_id=course_id))

    # Reuse TN selection logic from syllabus routes (helpers are in syllabus.py)
    from app.models import Syllabus
    from app.routes.syllabus import (
        _tn_compute_aa_distribution_rows,
        _tn_rows_to_clo_distribution,
    )

    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus or (getattr(syllabus, 'syllabus_type', '') or '').lower() != 'tn' or not getattr(syllabus, 'tn_chapters', None):
        flash("Please upload & extract a TN syllabus first.", "warning")
        return redirect(url_for('courses.view', course_id=course_id))

    mode = (request.form.get('mode') or 'chapter').lower()

    # Volume
    num_mcq = int(request.form.get('num_mcq') or 8)
    num_open = int(request.form.get('num_open') or 4)
    num_questions = max(0, num_mcq) + max(0, num_open)
    if num_questions < 1 or num_questions > 50:
        flash("Total questions must be 1-50.", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'))

    # Bloom + difficulty
    try:
        bloom_distribution = {
            'remember': int(request.form.get('bloom_remember') or 17),
            'understand': int(request.form.get('bloom_understand') or 25),
            'apply': int(request.form.get('bloom_apply') or 25),
            'analyze': int(request.form.get('bloom_analyze') or 20),
            'evaluate': int(request.form.get('bloom_evaluate') or 8),
            'create': int(request.form.get('bloom_create') or 5),
        }
        difficulty_distribution = {
            'easy': int(request.form.get('difficulty_easy') or 33),
            'medium': int(request.form.get('difficulty_medium') or 34),
            'hard': int(request.form.get('difficulty_hard') or 33),
        }
    except Exception as e:
        flash(f"Invalid bloom/difficulty values: {e}", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'))

    if sum(bloom_distribution.values()) != 100:
        flash("Bloom Taxonomy must total 100%.", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'))

    if sum(difficulty_distribution.values()) != 100:
        flash("Difficulty distribution must total 100%.", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'))

    # Selection parsing (EXACTLY like TN quiz setup)
    # Robust selection parsing (accepts alternative field names)
    def _get_int_list(*keys):
        vals = []
        for k in keys:
            for v in request.form.getlist(k):
                if str(v).isdigit():
                    vals.append(int(v))
        return vals

    selected_course_chapter_ids = _get_int_list('chapters', 'chapter_ids', 'chapter_id', 'selected_chapters')
    selected_tn_section_ids = _get_int_list('sections', 'section_ids', 'section_id', 'selected_sections')
    selected_aa_numbers = _get_int_list('aa_numbers', 'aa', 'aa_nums', 'selected_aa')

    # Resolve selection into TN sections + chapters (same logic as syllabus.tn_generate_quiz)
    selected_chapter_orders: set[int] = set()
    selected_sections = []

    try:
        from app.models import TNSection, TNSectionAA, TNAA

        if mode == 'aaa':
            if not selected_aa_numbers:
                flash("Please select at least one AA.", "warning")
                return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank', mode='aaa'))

            selected_sections = (
                TNSection.query
                .join(TNSectionAA, TNSectionAA.section_id == TNSection.id)
                .join(TNAA, TNAA.id == TNSectionAA.aa_id)
                .filter(TNAA.syllabus_id == syllabus.id)
                .filter(TNAA.number.in_(selected_aa_numbers))
                .all()
            )
            selected_tn_section_ids = [s.id for s in selected_sections]
        else:
            if not selected_course_chapter_ids and not selected_tn_section_ids:
                flash("Nothing selected.", "danger")
                return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'))

            if selected_tn_section_ids:
                selected_sections = TNSection.query.filter(TNSection.id.in_(selected_tn_section_ids)).all()
            else:
                selected_sections = []

        # Derive chapter orders from sections
        for sec in selected_sections:
            try:
                selected_chapter_orders.add(int(sec.chapter.index))
            except Exception:
                pass

        # If only chapter IDs are selected (no section IDs), include all TN sections for those chapters
        if mode != 'aaa' and selected_course_chapter_ids and not selected_tn_section_ids:
            course_chapters = Chapter.query.filter(Chapter.id.in_(selected_course_chapter_ids)).all()
            selected_chapter_orders.update({int(c.order) for c in course_chapters})

            selected_sections = []
            for ch in (syllabus.tn_chapters or []):
                if int(ch.index) in selected_chapter_orders:
                    selected_sections.extend(list(ch.sections or []))
            selected_tn_section_ids = [s.id for s in selected_sections]

    except Exception as e:
        current_app.logger.error(f"TN bank selection resolution failed: {e}")

    if not selected_chapter_orders and not selected_tn_section_ids:
        flash("Nothing selected.", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'))

    # Build AA/CLO distribution (same as quiz)
    selection_rows = _tn_compute_aa_distribution_rows(
        syllabus,
        section_ids=selected_tn_section_ids if selected_tn_section_ids else None,
        chapter_indices=list(selected_chapter_orders) if selected_chapter_orders else None,
    )
    if not selection_rows:
        flash("No AA links found for the selected content.", "warning")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'))

    clo_distribution = _tn_rows_to_clo_distribution(selection_rows)

    aa_by_num = {int(a.number): (a.description or '') for a in (syllabus.tn_aa or [])}
    selected_nums = [int(r['number']) for r in selection_rows]

    # IMPORTANT: Tunisian norm uses "AAA" (acquis). We store AAA codes in the existing `clo` field.
    # We still keep the keys expected by the generator (CLO# / CLO Description), but the value is AAA.
    clos = [{'CLO#': f"AA {n}", 'CLO Description': aa_by_num.get(n, '')} for n in selected_nums]

    chapters_label = ", ".join([str(x) for x in sorted(selected_chapter_orders)]) if selected_chapter_orders else "(sections)"
    week_content = (
        f"TN Question Bank Generation Context\n"
        f"Course: {course.title}\n"
        f"Chapters: {chapters_label}\n\n"
        f"Acquis (AA) to cover:\n"
        + '\n'.join([f"AA {n}: {aa_by_num.get(n, '')[:220]}" for n in selected_nums])
    )

    # Enrich prompt with chapter/section titles to keep generations on-topic even when no attachments exist
    try:
        course_chapters_all = Chapter.query.filter_by(course_id=course_id).all()
        ch_by_order = {int(c.order): c for c in course_chapters_all if c.order is not None}
        selected_ch_titles = []
        for o in sorted(list(selected_chapter_orders)):
            c = ch_by_order.get(int(o))
            if c:
                selected_ch_titles.append(f"Chapter {c.order}: {c.title}")
        sec_titles = []
        for s in selected_sections or []:
            t = (getattr(s, 'title', None) or getattr(s, 'name', None) or '').strip()
            if t:
                sec_titles.append(f"- {t}")
        if selected_ch_titles or sec_titles:
            week_content += "\n\nSelected content titles:\n"
            if selected_ch_titles:
                week_content += "\n".join(selected_ch_titles) + "\n"
            if sec_titles:
                week_content += "\nSection titles:\n" + "\n".join(sec_titles) + "\n"
    except Exception:
        pass


    # RAG attachments: chapter docs + module docs (same as quiz)
    attachments_texts = []
    attachments_metadata = []
    sources_map = {}

    chapters_by_id = {c.id: c for c in Chapter.query.filter_by(course_id=course_id).all()}

    docs_to_use = []
    # module-level docs
    module_docs = Document.query.filter_by(course_id=course_id, chapter_id=None).all()
    docs_to_use.extend(module_docs)

    # chapter docs (only selected chapters if possible)
    if selected_course_chapter_ids:
        chapter_docs = Document.query.filter(Document.course_id == course_id, Document.chapter_id.in_(selected_course_chapter_ids)).all()
    else:
        # fallback: include all chapter docs for the course
        chapter_docs = Document.query.filter(Document.course_id == course_id, Document.chapter_id.isnot(None)).all()
    docs_to_use.extend(chapter_docs)
    import os
    import re
    source_id_counter = 1
    for doc in docs_to_use:
        source_id = f"SRC{source_id_counter}"
        text_blob = ""
        if doc.file_path:
            try:
                from app.services.file_service import extract_text_from_file
                file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], doc.file_path)
                if os.path.isfile(file_path):
                    text_blob = extract_text_from_file(file_path) or ""
            except Exception as e:
                current_app.logger.warning(f"File extraction failed for {doc.file_path}: {e}")

        meta = {
            'document_id': doc.id,
            'title': doc.title,
            'filename': doc.file_path,
            'file_path': doc.file_path,
            'file_ext': os.path.splitext(doc.file_path or '')[1].lower(),
            'file_type': doc.file_type,
            'source_id': source_id,
            'source_type': 'chapter_material' if doc.chapter_id else 'module_material',
            'chapter_id': doc.chapter_id,
            'chapter_title': chapters_by_id.get(doc.chapter_id).title if doc.chapter_id and doc.chapter_id in chapters_by_id else None,
            'chapter_order': chapters_by_id.get(doc.chapter_id).order if doc.chapter_id and doc.chapter_id in chapters_by_id else None,
        }

        attachments_texts.append(text_blob)
        attachments_metadata.append(meta)
        sources_map[source_id] = meta
        source_id_counter += 1

    if not attachments_texts:
        flash("Warning: no chapter documents found. Upload chapter materials for better RAG.", "warning")

    # Generate (same service)
    try:
        result = generate_quiz_questions(
            week_content=week_content,
            clos=clos,
            attachments_texts=attachments_texts,
            attachments_metadata=attachments_metadata,
            num_mcq=num_mcq,
            num_open=num_open,
            num_questions=num_questions,
            difficulty='medium',
            clo_distribution=clo_distribution,
            bloom_distribution=bloom_distribution,
            difficulty_distribution=difficulty_distribution,
            activity_patterns=None,
            theory_ratio=0.30,
            language='fr',
        )
        questions = result.get('questions', [])
    except Exception as e:
        current_app.logger.error(f"TN bank generation failed: {e}")
        flash(f"Question generation failed: {e}", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'))

    return render_template(
        'quiz/tn_review.html',
        course=course,
        questions=questions,
        num_questions=len(questions),
        num_mcq=result.get('mcq_count', 0),
        num_open=result.get('open_count', 0),
        selection_rows=selection_rows,
        selected_chapter_orders=sorted(list(selected_chapter_orders)),
        mode=mode,
        sources_map=sources_map,
        question_bank_mode=True,
        approve_action=url_for('question_bank.tn_approve', course_id=course_id),
        back_url=url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'),
    )


@question_bank_bp.route('/tn/approve/<int:course_id>', methods=['POST'])
@login_required
def tn_approve(course_id: int):
    """Approve selected generated questions and save them into the Question Bank."""

    if not _teacher_guard():
        return redirect(url_for('courses.index'))

    course = Course.query.get_or_404(course_id)
    if not (current_user.is_superuser or (current_user.is_teacher and course.teacher_id == current_user.id)):
        flash("Only the course teacher can approve questions.", "danger")
        return redirect(url_for('courses.view', course_id=course_id))

    num_questions = int(request.form.get('num_questions') or 0)
    if num_questions < 1:
        flash("No questions to approve.", "warning")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, target='bank'))

    import re

    def _normalize_aaa(raw: str | None) -> str | None:
        """Normalize UI/model tag to a stable AA code (TN mode)."""
        if not raw:
            return None
        s = str(raw).strip()
        if not s:
            return None
        # Extract digits if present
        digits = ''.join(re.findall(r'\d+', s))
        upper = s.upper().replace(' ', '')
        # Accept any variant: AAA, AA, CLO, COA, C0A → normalize to "AA N"
        if digits:
            if 'AA' in upper or 'CLO' in upper or 'COA' in upper or 'C0A' in upper:
                return f"AA {digits}"
        # If already looks like "AA …" without extra digits, keep as-is
        if upper.startswith('AA'):
            return s
        return s

    now = datetime.utcnow()
    created = 0

    for i in range(1, num_questions + 1):
        if not (request.form.get(f'approve_{i}') or '').strip():
            continue

        question_type = (request.form.get(f'question_type_{i}') or 'mcq').lower()
        question_text = (request.form.get(f'question_{i}') or '').strip()
        if not question_text:
            continue

        # TN mode: store AA code in the `clo` column
        clo = _normalize_aaa(request.form.get(f'clo_{i}')) or 'AA 1'
        bloom_level = (request.form.get(f'bloom_level_{i}') or 'understand').strip().lower()
        difficulty_level = (request.form.get(f'difficulty_level_{i}') or 'medium').strip().lower()

        # Chapter: in TN flow, we might receive either a real Chapter.id or just
        # the chapter order number. Ensure a Chapter row exists so filters work.
        raw_chapter = request.form.get(f'chapter_id_{i}', type=int)
        chapter = None
        if raw_chapter:
            # Try as primary key
            chapter = Chapter.query.get(raw_chapter)
            if chapter is None or chapter.course_id != course_id:
                # Try as chapter order
                chapter = Chapter.query.filter_by(course_id=course_id, order=raw_chapter).first()
            if chapter is None:
                # Create on the fly (title from TN syllabus if available)
                title = f"Chapitre {raw_chapter}"
                try:
                    from app.models import TNChapter, Syllabus
                    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
                    if syllabus:
                        tnch = TNChapter.query.filter_by(syllabus_id=syllabus.id, index=raw_chapter).first()
                        if tnch and tnch.title:
                            title = tnch.title
                except Exception:
                    pass
                chapter = Chapter(course_id=course_id, order=raw_chapter, title=title)
                db.session.add(chapter)
                db.session.flush()  # get chapter.id
        chapter_id = chapter.id if chapter else None

        explanation = (request.form.get(f'explanation_{i}') or '').strip()

        qbq = QuestionBankQuestion(
            course_id=course_id,
            chapter_id=chapter_id,
            question_text=question_text,
            question_type=question_type,
            bloom_level=bloom_level,
            clo=clo,
            difficulty=difficulty_level,
            explanation=explanation,
            approved_at=now,
            approved_by_id=current_user.id,
        )

        if question_type == 'mcq':
            qbq.choice_a = (request.form.get(f'choice_a_{i}') or '').strip()
            qbq.choice_b = (request.form.get(f'choice_b_{i}') or '').strip()
            qbq.choice_c = (request.form.get(f'choice_c_{i}') or '').strip()
            qbq.correct_choice = (request.form.get(f'correct_choice_{i}') or 'A').strip().upper()
        else:
            # We don't have a separate model_answer column; keep it in explanation.
            model_answer = (request.form.get(f'model_answer_{i}') or '').strip()
            if model_answer:
                qbq.explanation = (qbq.explanation + "\n\n" if qbq.explanation else "") + f"MODEL ANSWER:\n{model_answer}"

        db.session.add(qbq)
        created += 1

    db.session.commit()
    flash(f"Saved {created} approved question(s) to the Question Bank.", "success")
    return redirect(url_for('courses.view', course_id=course_id, tab='bank'))


@question_bank_bp.route('/generate', methods=['POST'])
@login_required
def generate():
    if not _teacher_guard():
        return redirect(url_for('courses.index'))

    course_id = request.form.get('course_id', type=int)
    chapter_id = request.form.get('chapter_id', type=int)
    week_num = request.form.get('week_num', type=int)
    # Question setup (same spirit as the graded quiz, but stored as pending questions)
    num_questions = request.form.get('num_questions', type=int) or 10
    num_mcq = request.form.get('num_mcq', type=int)
    num_open = request.form.get('num_open', type=int)

    # If MCQ/Open are not specified, derive a sensible split.
    if num_mcq is None and num_open is None:
        num_mcq = max(1, int(round(num_questions * 0.7)))
        num_open = max(0, num_questions - num_mcq)
    else:
        num_mcq = int(num_mcq or 0)
        num_open = int(num_open or 0)
        if (num_mcq + num_open) <= 0:
            num_mcq = max(1, int(round(num_questions * 0.7)))
            num_open = max(0, num_questions - num_mcq)

    # Bloom / difficulty distributions (optional in this screen)
    bloom_distribution = {
        'remember': int(request.form.get('bloom_remember') or 17),
        'understand': int(request.form.get('bloom_understand') or 25),
        'apply': int(request.form.get('bloom_apply') or 25),
        'analyze': int(request.form.get('bloom_analyze') or 20),
        'evaluate': int(request.form.get('bloom_evaluate') or 8),
        'create': int(request.form.get('bloom_create') or 5),
    }
    difficulty_distribution = {
        'easy': int(request.form.get('difficulty_easy') or 33),
        'medium': int(request.form.get('difficulty_medium') or 34),
        'hard': int(request.form.get('difficulty_hard') or 33),
    }

    course = Course.query.get_or_404(course_id)
    chapter = Chapter.query.get(chapter_id) if chapter_id else None

    # Build context
    week_text, clos = ('', [])
    if week_num:
        week_text, clos = _syllabus_week_text(course.id, week_num)

    context_text = ''
    if chapter and chapter.summary:
        context_text += f"Chapter: {chapter.title}\n{chapter.summary}\n\n"

    # If no syllabus text, still pass chapter context.
    week_content = (week_text or '') + "\n\n" + (context_text or '')

    try:
        questions = generate_quiz_questions(
            week_content=week_content,
            clos=clos,
            attachments_texts=[],
            num_mcq=num_mcq,
            num_open=num_open,
            bloom_distribution=bloom_distribution,
            difficulty_distribution=difficulty_distribution,
            difficulty='medium',
        )
    except Exception as e:
        flash(f"Failed to generate questions: {e}", 'danger')
        return redirect(url_for('question_bank.index', course_id=course.id))

    # generate_quiz_questions may return dict with 'questions' or list (older)
    q_list = questions.get('questions') if isinstance(questions, dict) else questions

    created = 0
    for q in q_list or []:
        # Normalize keys
        q_text = q.get('question') or q.get('question_text') or ''
        has_choices = bool(q.get('choice_a') and q.get('choice_b') and q.get('choice_c'))

        qbq = QuestionBankQuestion(
            course_id=course.id,
            chapter_id=chapter.id if chapter else None,
            question_text=q_text,
            choice_a=q.get('choice_a'),
            choice_b=q.get('choice_b'),
            choice_c=q.get('choice_c'),
            correct_choice=q.get('correct_choice'),
            explanation=q.get('explanation'),
            bloom_level=q.get('bloom_level') or 'N/A',
            clo=q.get('clo') or 'N/A',
            difficulty=q.get('difficulty_level') or q.get('difficulty') or 'N/A',
            question_type='mcq' if has_choices else 'open_ended',
            created_at=datetime.utcnow(),
        )
        db.session.add(qbq)
        created += 1

    db.session.commit()
    flash(f"Generated {created} questions (pending approval).", 'success')
    return redirect(url_for('question_bank.index', course_id=course.id))





@question_bank_bp.route('/revision/<int:course_id>', methods=['GET', 'POST'])
@login_required
def student_revision(course_id: int):
    """Student-only (or teacher preview) ungraded revision quiz generated from approved Question Bank questions."""
    course = Course.query.get_or_404(course_id)

    # Access control: teacher of course OR enrolled student OR admin
    if current_user.is_teacher:
        if course.teacher_id != current_user.id:
            flash('Access denied.', 'danger')
            return redirect(url_for('courses.index'))
    else:
        enrollment = Enrollment.query.filter_by(student_id=current_user.id, course_id=course_id).first()
        if not enrollment and not getattr(current_user, 'is_admin', False):
            flash('You must be enrolled in this module to access revision quizzes.', 'warning')
            return redirect(url_for('courses.index'))

    chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order.asc()).all()

    # Build base query: approved only for this course
    base_q = QuestionBankQuestion.query.filter(
        QuestionBankQuestion.course_id == course_id,
        QuestionBankQuestion.approved_at.isnot(None)
    )

    # Distinct filter options (AAA is stored in clo column for TN workflow)
    chapter_options = [(ch.id, ch.title) for ch in chapters]
    aaa_options = [r[0] for r in base_q.with_entities(func.distinct(QuestionBankQuestion.clo)).order_by(QuestionBankQuestion.clo.asc()).all() if r[0]]
    bloom_options = [r[0] for r in base_q.with_entities(func.distinct(QuestionBankQuestion.bloom_level)).order_by(QuestionBankQuestion.bloom_level.asc()).all() if r[0]]
    difficulty_options = [r[0] for r in base_q.with_entities(func.distinct(QuestionBankQuestion.difficulty)).order_by(QuestionBankQuestion.difficulty.asc()).all() if r[0]]

    if request.method == 'GET':
        return render_template(
            'question_bank/revision_setup.html',
            course=course,
            chapters=chapters,
            aaa_options=aaa_options,
            bloom_options=bloom_options,
            difficulty_options=difficulty_options,
        )

    # POST: apply filters and render the revision quiz (no DB writes)
    # NOTE: the UI supports multi-select; accept both legacy single fields and new list fields.
    chapter_ids = [int(x) for x in request.form.getlist('chapter_ids') if str(x).isdigit()]
    if not chapter_ids:
        single_chapter_id = request.form.get('chapter_id', type=int)
        if single_chapter_id:
            chapter_ids = [single_chapter_id]

    aaas = [x.strip() for x in request.form.getlist('aaas') if (x or '').strip()]
    if not aaas:
        legacy_aaa = (request.form.get('aaa') or '').strip()
        if legacy_aaa:
            aaas = [legacy_aaa]

    blooms = [x.strip() for x in request.form.getlist('blooms') if (x or '').strip()]
    if not blooms:
        legacy_bloom = (request.form.get('bloom') or '').strip()
        if legacy_bloom:
            blooms = [legacy_bloom]

    difficulties = [x.strip() for x in request.form.getlist('difficulties') if (x or '').strip()]
    if not difficulties:
        legacy_diff = (request.form.get('difficulty') or '').strip()
        if legacy_diff:
            difficulties = [legacy_diff]
    num_questions = request.form.get('num_questions', type=int) or 10

    q = base_q
    if chapter_ids:
        q = q.filter(QuestionBankQuestion.chapter_id.in_(chapter_ids))
    if aaas:
        q = q.filter(QuestionBankQuestion.clo.in_(aaas))
    if blooms:
        q = q.filter(QuestionBankQuestion.bloom_level.in_(blooms))
    if difficulties:
        q = q.filter(QuestionBankQuestion.difficulty.in_(difficulties))

    pool = q.order_by(QuestionBankQuestion.created_at.desc()).all()
    if not pool:
        flash('No approved questions match your filters. Try broadening your selection.', 'warning')
        return redirect(url_for('question_bank.student_revision', course_id=course_id))

    if num_questions < 1:
        num_questions = 1
    if num_questions > len(pool):
        num_questions = len(pool)

    # Shuffle for revision
    random.shuffle(pool)
    selected = pool[:num_questions]

    return render_template(
        'question_bank/revision_take.html',
        course=course,
        questions=selected
    )


@question_bank_bp.route('/api/aaas', methods=['GET'])
@login_required
def api_aaas():
    """Return AAA (stored in QuestionBankQuestion.clo) available for a course/module.

    Optional chapter_ids can be provided (comma separated) to scope AAA to selected chapters.
    """
    course_id = request.args.get('course_id', type=int)
    if not course_id:
        return jsonify({'aaas': []})

    course = Course.query.get_or_404(course_id)

    chapter_ids_raw = (request.args.get('chapter_ids') or '').strip()
    chapter_ids: list[int] = []
    if chapter_ids_raw:
        try:
            chapter_ids = [int(x) for x in chapter_ids_raw.split(',') if x.strip().isdigit()]
        except Exception:
            chapter_ids = []

    q = QuestionBankQuestion.query.filter(
        QuestionBankQuestion.course_id == course.id,
        QuestionBankQuestion.approved_at.isnot(None)
    )
    if chapter_ids:
        q = q.filter(QuestionBankQuestion.chapter_id.in_(chapter_ids))

    values = [
        (row[0] or '').strip()
        for row in q.with_entities(QuestionBankQuestion.clo).distinct().all()
        if (row[0] or '').strip()
    ]
    values = sorted(set(values))
    return jsonify({'aaas': values})

