from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, current_app
from werkzeug.utils import secure_filename
import os

from flask_login import login_required, current_user

from app import db
from app.models import Course, Syllabus, TNAA, TNAAP, TNChapter, TNSection, TNChapterAA, TNSectionAA, TNEvaluation, TNBibliography, TNSyllabusAdministrative
from app.services.syllabus_tn_service import SyllabusTNService
from app.services.aap_definitions import DEFAULT_AAP_DEFINITIONS, get_aap_label

tn_syllabus_bp = Blueprint("tn_syllabus", __name__, url_prefix="/tn_syllabus")


def _get_course_syllabus(course_id: int) -> Syllabus | None:
    return Syllabus.query.filter_by(course_id=course_id).first()


def _syllabus_is_extracted(s: Syllabus | None) -> bool:
    if not s:
        return False
    return bool(s.tn_admin or (s.tn_aa and len(s.tn_aa) > 0) or (s.tn_chapters and len(s.tn_chapters) > 0))


def _build_view_model(course: Course, syllabus: Syllabus):
    """Build a normalized view model for the TN syllabus viewer page."""
    admin = syllabus.tn_admin

    # AAA (AA) list
    aa_rows = TNAA.query.filter_by(syllabus_id=syllabus.id).order_by(TNAA.number.asc()).all()
    aaa = [
        {
            "number": r.number,
            "label": f"AA{r.number} — {r.description}",
            "description": r.description,
        }
        for r in aa_rows
    ]
    aa_desc_by_num = {r.number: r.description for r in aa_rows}

    # AAP list (selected + all)
    aap_rows = TNAAP.query.filter_by(syllabus_id=syllabus.id).order_by(TNAAP.number.asc()).all()
    selected_aap = [
        {
            "number": r.number,
            "selected": bool(r.selected),
            "label": get_aap_label(r.number),
            "description": DEFAULT_AAP_DEFINITIONS.get(int(r.number), "Description à compléter (référence officielle)."),
        }
        for r in aap_rows
        if r.selected
    ]
    all_aap = [
        {
            "number": r.number,
            "selected": bool(r.selected),
            "label": get_aap_label(r.number),
            "description": DEFAULT_AAP_DEFINITIONS.get(int(r.number), "Description à compléter (référence officielle)."),
        }
        for r in aap_rows
    ]

    # Chapters + sections + mapping
    chapters_out = []
    ch_rows = TNChapter.query.filter_by(syllabus_id=syllabus.id).order_by(TNChapter.index.asc()).all()
    for ch in ch_rows:
        ch_title = (ch.title or "").strip() or f"Chapitre {ch.index}"
        # Chapter AA links
        ch_links = TNChapterAA.query.filter_by(chapter_id=ch.id).all()
        ch_aa = []
        for link in ch_links:
            num = link.aa.number if link.aa else None
            if not num:
                continue
            desc = (link.description_override or aa_desc_by_num.get(num) or "").strip()
            ch_aa.append({"number": num, "label": f"AA{num} — {desc}" if desc else f"AA{num}", "description": desc})
        ch_aa = sorted(ch_aa, key=lambda x: x["number"])

        sec_rows = TNSection.query.filter_by(chapter_id=ch.id).order_by(TNSection.index.asc()).all()
        sections_out = []
        for sec in sec_rows:
            sec_title = (sec.title or "").strip() or f"Section {sec.index}"
            sec_links = TNSectionAA.query.filter_by(section_id=sec.id).all()
            sec_aa = []
            for link in sec_links:
                num = link.aa.number if link.aa else None
                if not num:
                    continue
                desc = (link.description_override or aa_desc_by_num.get(num) or "").strip()
                sec_aa.append({"number": num, "label": f"AA{num} — {desc}" if desc else f"AA{num}", "description": desc})
            sec_aa = sorted(sec_aa, key=lambda x: x["number"])
            sections_out.append({"index": sec.index, "title": sec_title, "aa": sec_aa})

        chapters_out.append({"index": ch.index, "title": ch_title, "aa": ch_aa, "sections": sections_out})

    # Evaluation + bibliography
    eval_row = TNEvaluation.query.filter_by(syllabus_id=syllabus.id).first()
    biblio = TNBibliography.query.filter_by(syllabus_id=syllabus.id).order_by(TNBibliography.position.asc()).all()
    bibliography = [b.entry for b in biblio]

    # Recommendations (simple heuristics)
    recs = []
    if not admin or not (admin.module_name or admin.code_ue or admin.code_ecue):
        recs.append("Compléter les informations administratives (intitulé module, codes UE/ECUE, crédits, etc.).")
    if not aaa:
        recs.append("Aucun AAA (AA) détecté : vérifier le syllabus ou relancer l’extraction.")
    if not chapters_out:
        recs.append("Aucun chapitre détecté : vérifier la section ‘Plan du cours’ du syllabus.")
    if not all_aap:
        recs.append("AAP non extraits : ajouter la section AAP dans le syllabus ou compléter manuellement la sélection.")
    if not eval_row:
        recs.append("Évaluation non détectée : vérifier la rubrique ‘Modalités d’évaluation’. ")

    return {
        "course": course,
        "syllabus": syllabus,
        "admin": admin,
        "aaa": aaa,
        "aap_selected": selected_aap,
        "aap_all": all_aap,
        "chapters": chapters_out,
        "evaluation": eval_row,
        "bibliography": bibliography,
        "recommendations": recs,
    }


# ---------------------------------------------------------
# helpers
# ---------------------------------------------------------
ALLOWED_EXTENSIONS = {"pdf", "doc", "docx"}

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def _upload_folder():
    folder = current_app.config.get("UPLOAD_FOLDER", "uploads")
    os.makedirs(folder, exist_ok=True)
    return folder

def _ensure_teacher_owns_course(course: Course):
    if not current_user.is_authenticated or not current_user.is_teacher or course.teacher_id != current_user.id:
        flash("You do not have permission to manage this course.", "danger")
        return False
    return True

def _get_or_create_syllabus(course_id: int) -> Syllabus:
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus:
        syllabus = Syllabus(course_id=course_id, syllabus_type="tn")
        db.session.add(syllabus)
        db.session.commit()
    return syllabus

def _clear_tn_normalized(syllabus: Syllabus):
    """
    Since relationships use cascade delete-orphan, clearing the relationships is enough.
    """
    # 1) AA links must go first (chapter/section link tables)
    # easiest: delete by query
    chap_ids = [c.id for c in syllabus.tn_chapters]
    if chap_ids:
        db.session.query(TNChapterAA).filter(TNChapterAA.chapter_id.in_(chap_ids)).delete(synchronize_session=False)
        sec_ids = db.session.query(TNSection.id).filter(TNSection.chapter_id.in_(chap_ids)).all()
        sec_ids = [x[0] for x in sec_ids]
        if sec_ids:
            db.session.query(TNSectionAA).filter(TNSectionAA.section_id.in_(sec_ids)).delete(synchronize_session=False)

    # 2) delete sections, chapters, AA, AAP, eval, biblio, admin
    db.session.query(TNSection).filter(TNSection.chapter_id.in_(chap_ids)).delete(synchronize_session=False)
    db.session.query(TNChapter).filter(TNChapter.syllabus_id == syllabus.id).delete(synchronize_session=False)

    db.session.query(TNAA).filter(TNAA.syllabus_id == syllabus.id).delete(synchronize_session=False)
    db.session.query(TNAAP).filter(TNAAP.syllabus_id == syllabus.id).delete(synchronize_session=False)

    db.session.query(TNEvaluation).filter(TNEvaluation.syllabus_id == syllabus.id).delete(synchronize_session=False)
    db.session.query(TNBibliography).filter(TNBibliography.syllabus_id == syllabus.id).delete(synchronize_session=False)
    db.session.query(TNSyllabusAdministrative).filter(TNSyllabusAdministrative.syllabus_id == syllabus.id).delete(synchronize_session=False)

    db.session.flush()

def _persist_tn_extraction(syllabus: Syllabus, extracted: dict):
    """
    Save extracted TN data into normalized tables:
    - tn_admin
    - tn_aa
    - tn_aap
    - tn_chapters + sections
    - mapping (AA<->chapters/sections) if present
    - tn_evaluation
    - tn_bibliography
    """
    _clear_tn_normalized(syllabus)

    # ---------------- admin ----------------
    admin = extracted.get("administrative") or {}
    if admin:
        tn_admin = TNSyllabusAdministrative(
            syllabus_id=syllabus.id,
            module_name=admin.get("module_name"),
            code_ue=admin.get("code_ue"),
            code_ecue=admin.get("code_ecue"),
            field=admin.get("field"),
            department=admin.get("department"),
            option=admin.get("option"),
            volume_presentiel=admin.get("volume_presentiel"),
            volume_personnel=admin.get("volume_personnel"),
            coefficient=admin.get("coefficient") or 0,
            credits=admin.get("credits") or 0,
            responsible=admin.get("responsible"),
            teachers=admin.get("teachers") or [],
        )
        db.session.add(tn_admin)

    # ---------------- AAA ----------------
    aaa_list = extracted.get("aaa") or []
    aa_by_number = {}
    for aa in aaa_list:
        num = aa.get("AA#")
        desc = aa.get("description")
        if not num or not desc:
            continue
        row = TNAA(syllabus_id=syllabus.id, number=int(num), description=desc)
        db.session.add(row)
        db.session.flush()  # get id
        aa_by_number[int(num)] = row

    # ---------------- AAP ----------------
    aap_list = extracted.get("aap") or []
    for a in aap_list:
        num = a.get("AAP#")
        sel = bool(a.get("selected", True))
        if not num:
            continue
        db.session.add(TNAAP(syllabus_id=syllabus.id, number=int(num), selected=sel))

    # ---------------- chapters + sections ----------------
    import re

    def _normalize_section(sec, fallback_index: int):
        """Normalize a section item that can be a dict or a string.

        In some TN extractions, a chapter's `sections` can come back as a list
        of strings instead of objects. This helper converts those strings into
        a minimal dict structure so persistence doesn't crash.
        """
        if isinstance(sec, dict):
            return sec
        if isinstance(sec, str):
            raw = sec.strip()
            if not raw:
                return None
            # Try to parse patterns like: "1. Introduction" or "2- Basics"
            m = re.match(r"^\s*(\d+(?:\.\d+)*)\s*[-.:]\s*(.+)$", raw)
            if m:
                return {"section_index": m.group(1), "section_title": m.group(2).strip()}
            # Fallback: keep title, synthesize an index
            return {"section_index": str(fallback_index), "section_title": raw}
        return None
    chapters = extracted.get("chapters") or []
    chapter_id_by_index = {}
    section_id_by_key = {}  # (chap_index, section_index) -> section_id

    for ch in chapters:
        ch_index = ch.get("chapter_index") or ch.get("index") or None
        ch_title = ch.get("chapter_title") or ch.get("chapter") or ""
        if not ch_title:
            continue
        if ch_index is None:
            # fallback: compute later by ordering
            pass

        # if missing, try best effort
        if ch_index is None:
            # place it at the end based on current count + 1
            ch_index = (len(chapter_id_by_index) + 1)

        chapter_row = TNChapter(syllabus_id=syllabus.id, index=int(ch_index), title=str(ch_title))
        db.session.add(chapter_row)
        db.session.flush()
        chapter_id_by_index[int(ch_index)] = chapter_row.id

        # sections
        sec_list = ch.get("sections") or []
        for s_i, sec in enumerate(sec_list, start=1):
            sec = _normalize_section(sec, s_i)
            if not sec:
                continue
            sec_index = sec.get("section_index") or sec.get("index") or ""
            sec_title = sec.get("section_title") or sec.get("title") or ""
            if not sec_index or not sec_title:
                continue
            sec_row = TNSection(chapter_id=chapter_row.id, index=str(sec_index), title=str(sec_title))
            db.session.add(sec_row)
            db.session.flush()
            section_id_by_key[(int(ch_index), str(sec_index))] = sec_row.id

    # ---------------- mapping (AA -> chapter/section) ----------------
    # Your extractor sometimes outputs:
    # - chapter has "AA#" list and "AADescription"
    # - section has "AA#" list and "AADescription"
    # We'll store those in TNChapterAA / TNSectionAA
    for ch in chapters:
        ch_index = int(ch.get("chapter_index") or ch.get("index") or 0)
        chap_id = chapter_id_by_index.get(ch_index)
        if not chap_id:
            continue

        ch_aa_nums = ch.get("AA#") or []
        ch_aa_desc = ch.get("AADescription") or []
        if isinstance(ch_aa_nums, int):
            ch_aa_nums = [ch_aa_nums]
        if isinstance(ch_aa_desc, str):
            ch_aa_desc = [ch_aa_desc]

        for i, aa_num in enumerate(ch_aa_nums):
            try:
                aa_num = int(aa_num)
            except:
                continue
            aa_row = aa_by_number.get(aa_num)
            if not aa_row:
                continue
            desc_override = None
            if i < len(ch_aa_desc):
                desc_override = ch_aa_desc[i]
            db.session.add(TNChapterAA(chapter_id=chap_id, aa_id=aa_row.id, description_override=desc_override))

        # sections mapping
        for s_i, sec in enumerate((ch.get("sections") or []), start=1):
            sec = _normalize_section(sec, s_i)
            if not sec:
                continue
            sec_index = str(sec.get("section_index") or sec.get("index") or "")
            sec_id = section_id_by_key.get((ch_index, sec_index))
            if not sec_id:
                continue

            s_aa_nums = sec.get("AA#") or []
            s_aa_desc = sec.get("AADescription") or []
            if isinstance(s_aa_nums, int):
                s_aa_nums = [s_aa_nums]
            if isinstance(s_aa_desc, str):
                s_aa_desc = [s_aa_desc]

            for i, aa_num in enumerate(s_aa_nums):
                try:
                    aa_num = int(aa_num)
                except:
                    continue
                aa_row = aa_by_number.get(aa_num)
                if not aa_row:
                    continue
                desc_override = None
                if i < len(s_aa_desc):
                    desc_override = s_aa_desc[i]
                db.session.add(TNSectionAA(section_id=sec_id, aa_id=aa_row.id, description_override=desc_override))

    # ---------------- evaluation ----------------
    evaluation = extracted.get("evaluation") or {}
    if evaluation:
        db.session.add(TNEvaluation(
            syllabus_id=syllabus.id,
            methods=evaluation.get("methods") or [],
            criteria=evaluation.get("criteria") or [],
            measures=evaluation.get("measures") or [],
            final_grade_formula=evaluation.get("final_grade_formula") or ""
        ))

    # ---------------- bibliography ----------------
    bibliography = extracted.get("bibliography") or []
    # Model fields are: position, entry
    # Extractors may return a list of strings or objects. We store a stable string.
    import json as _json
    for i, b in enumerate(bibliography, start=1):
        if b is None:
            continue
        if isinstance(b, str):
            entry = b.strip()
        else:
            try:
                entry = _json.dumps(b, ensure_ascii=False)
            except Exception:
                entry = str(b)
        if not entry:
            continue
        db.session.add(TNBibliography(syllabus_id=syllabus.id, position=i, entry=entry))

    # Also keep a JSON snapshot (optional but useful for debugging)
    syllabus.tn_data = extracted
    syllabus.syllabus_type = "tn"

    db.session.commit()


# ---------------------------------------------------------
# pages
# ---------------------------------------------------------
@tn_syllabus_bp.get("/<int:course_id>/upload_form")
@login_required
def upload_form(course_id):
    course = Course.query.get_or_404(course_id)
    if not _ensure_teacher_owns_course(course):
        return redirect(url_for("courses.index"))
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    return render_template("tn_syllabus/upload_syllabus.html", course=course, syllabus=syllabus)


@tn_syllabus_bp.post("/<int:course_id>/upload")
@login_required
def upload(course_id):
    course = Course.query.get_or_404(course_id)
    if not _ensure_teacher_owns_course(course):
        return redirect(url_for("courses.index"))

    f = request.files.get("file")
    if not f or f.filename.strip() == "":
        flash("Please choose a file.", "danger")
        return redirect(url_for("tn_syllabus.upload_form", course_id=course_id))

    if not allowed_file(f.filename):
        flash("Invalid file type. Allowed: PDF, DOCX.", "danger")
        return redirect(url_for("tn_syllabus.upload_form", course_id=course_id))

    filename = secure_filename(f.filename)
    path = os.path.join(_upload_folder(), filename)
    f.save(path)

    syllabus = _get_or_create_syllabus(course_id)
    syllabus.file_path = filename
    syllabus.syllabus_type = "tn"
    db.session.commit()

    flash("Syllabus uploaded successfully.", "success")
    return redirect(url_for("tn_syllabus.course_home", course_id=course_id))


@tn_syllabus_bp.get("/<int:course_id>/home")
@login_required
def course_home(course_id):
    course = Course.query.get_or_404(course_id)
    if not _ensure_teacher_owns_course(course):
        return redirect(url_for("courses.index"))

    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    pdf_url = None
    if syllabus and syllabus.file_path:
        pdf_url = url_for("tn_syllabus.uploaded_file", filename=syllabus.file_path)

    # If already extracted, we can show normalized DB content
    return render_template(
        "tn_syllabus/syllabus_home.html",
        course=course,
        syllabus=syllabus,
        pdf_url=pdf_url,
        is_extracted=_syllabus_is_extracted(syllabus),
    )


@tn_syllabus_bp.get("/")
@login_required
def index():
    """List TN syllabi for the current teacher."""
    if not current_user.is_teacher:
        flash("Accès réservé aux enseignants.", "warning")
        return redirect(url_for("courses.index"))

    courses = Course.query.filter_by(teacher_id=current_user.id).order_by(Course.title.asc()).all()
    rows = []
    for c in courses:
        s = _get_course_syllabus(c.id)
        rows.append({
            "course": c,
            "syllabus": s,
            "has_file": bool(s and s.file_path),
            "is_extracted": _syllabus_is_extracted(s),
        })

    return render_template("tn_syllabus/index.html", rows=rows)


@tn_syllabus_bp.get("/<int:course_id>/viewer")
@login_required
def viewer(course_id):
    """Structured TN syllabus viewer (from normalized DB)."""
    course = Course.query.get_or_404(course_id)
    if not _ensure_teacher_owns_course(course):
        return redirect(url_for("courses.index"))

    syllabus = _get_course_syllabus(course_id)
    if not syllabus or not _syllabus_is_extracted(syllabus):
        flash("Aucune extraction TN trouvée pour ce module. Lance l’extraction d’abord.", "warning")
        return redirect(url_for("tn_syllabus.course_home", course_id=course_id))

    vm = _build_view_model(course, syllabus)
    return render_template("tn_syllabus/viewer.html", **vm)


@tn_syllabus_bp.get("/uploads/<path:filename>")
@login_required
def uploaded_file(filename):
    from flask import send_from_directory
    return send_from_directory(_upload_folder(), filename)


# ---------------------------------------------------------
# extraction (AJAX)
# ---------------------------------------------------------
@tn_syllabus_bp.post("/<int:course_id>/extract")
@login_required
def extract(course_id):
    course = Course.query.get_or_404(course_id)
    if not _ensure_teacher_owns_course(course):
        return jsonify({"ok": False, "error": "Unauthorized"}), 403

    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus or not syllabus.file_path:
        return jsonify({"ok": False, "error": "No syllabus uploaded yet."}), 400

    file_path = os.path.join(_upload_folder(), syllabus.file_path)
    if not os.path.exists(file_path):
        return jsonify({"ok": False, "error": "Uploaded file not found on server."}), 404

    try:
        extracted = SyllabusTNService.extract_tn_syllabus(file_path)
        _persist_tn_extraction(syllabus, extracted)
        return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("TN extraction failed")
        return jsonify({"ok": False, "error": str(e)}), 500
