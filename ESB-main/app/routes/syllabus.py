from flask import Blueprint, request, jsonify, render_template, redirect, url_for, flash, send_from_directory, current_app, abort
from flask_login import current_user, login_required
from flask_wtf import FlaskForm
from wtforms import StringField, FileField, SubmitField, IntegerField, SelectField
from wtforms.validators import DataRequired, Length, NumberRange
from flask_wtf.file import FileAllowed
from werkzeug.utils import secure_filename
from app.services.syllabus_service import SyllabusService
from app.services.ai_service import generate_quiz_questions, generate_summary
# NOTE: Chapter is required for TN quiz setup ordering.
from app.models import Course, Syllabus, Document, Enrollment, Quiz, QuizQuestion, Chapter
from app import db
import os
import logging
import json
from datetime import datetime
from app.routes.quiz import QuizAnswerForm  # Import the correct form
from flask_wtf.csrf import generate_csrf
import re

def _tn_compute_aa_distribution_rows(syllabus, section_ids=None, chapter_indices=None):
    """Compute AA distribution rows for TN.

    If section_ids provided, counts only AA links within those sections.
    If chapter_indices provided (TNChapter.index), counts all sections within those chapters.
    Otherwise, counts all TN sections in the syllabus.

    Returns list sorted by percent desc: [{number,label,description,weight,percent}]
    """
    if not syllabus or not getattr(syllabus, 'tn_aa', None):
        return []

    # Build a fast lookup: AA number -> description
    aa_desc = {int(a.number): (a.description or '') for a in (syllabus.tn_aa or [])}

    # Collect relevant TNSection objects
    sections = []
    try:
        if section_ids:
            # Query by IDs if possible
            from app.models import TNSection
            sections = TNSection.query.filter(TNSection.id.in_(section_ids)).all()
        elif chapter_indices:
            # chapters by index
            for ch in (syllabus.tn_chapters or []):
                if int(ch.index) in set(int(x) for x in chapter_indices):
                    sections.extend(list(ch.sections or []))
        else:
            for ch in (syllabus.tn_chapters or []):
                sections.extend(list(ch.sections or []))
    except Exception:
        sections = []

    # Count occurrences (each section link counts as 1)
    counts = {}
    try:
        for sec in sections:
            for link in (sec.aa_links or []):
                if link.aa is None:
                    continue
                n = int(link.aa.number)
                counts[n] = counts.get(n, 0) + 1
    except Exception:
        pass

    # If some AAs are only at chapter-level, include those lightly (0.5)
    if not section_ids:
        try:
            for ch in (syllabus.tn_chapters or []):
                if chapter_indices and int(ch.index) not in set(int(x) for x in chapter_indices):
                    continue
                for link in (ch.aa_links or []):
                    if link.aa is None:
                        continue
                    n = int(link.aa.number)
                    counts[n] = counts.get(n, 0) + 0.5
        except Exception:
            pass

    rows = []
    for n, w in counts.items():
        rows.append({
            'number': int(n),
            'label': f"AA {int(n)}",
            'description': aa_desc.get(int(n), ''),
            'weight': float(w),
        })

    total = sum(r['weight'] for r in rows) or 1.0
    for r in rows:
        r['percent'] = round((r['weight'] / total) * 100.0, 1)

    rows.sort(key=lambda x: (-x['percent'], x['number']))
    return rows


def _tn_rows_to_clo_distribution(rows):
    """Convert AA distribution rows to a CLO-style percentage dict keyed by 'CLO <n>'."""
    dist = {}
    for r in rows:
        key = f"CLO {int(r['number'])}"
        dist[key] = float(r['percent'])
    return dist


def _tn_questions_relabel_clo_to_aa(questions):
    """Post-process AI validated questions so UI shows AA instead of CLO."""
    out = []
    import re
    for q in questions or []:
        clo = (q.get('clo') or '').strip()
        m = re.search(r'(\d+)', clo)
        if m:
            q = dict(q)
            q['clo'] = f"AA {m.group(1)}"
        out.append(q)
    return out


# Configure logging
logging.basicConfig(level=logging.DEBUG)

logger = logging.getLogger(__name__)


syllabus_bp = Blueprint("syllabus", __name__, url_prefix="/syllabus")


ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx', 'xlsx', 'xls', 'csv', 'txt', 'zip', 'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'}
UPLOAD_FOLDER = os.path.abspath("Uploads")


# Forms
class UploadSyllabusForm(FlaskForm):
    title = StringField("Title (optional)")
    file = FileField("Choose file", validators=[DataRequired()])
    submit = SubmitField("Upload Syllabus")


class UploadWeekAttachmentForm(FlaskForm):
    title = StringField("Document/Video Title (optional)", validators=[Length(max=100)])
    file = FileField(
        "Choose file (PDF, DOCX, PPTX, MP4, WebM, etc.)", 
        validators=[
            DataRequired(), 
            FileAllowed(
                {'pdf', 'docx', 'pptx', 'xlsx', 'xls', 'csv', 'txt', 'zip', 'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'}, 
                'Invalid file type! Allowed: Documents (PDF, DOCX, etc.) and Videos (MP4, WebM, etc.)'
            )
        ]
    )
    submit = SubmitField("Upload Attachment")


# Update your QuizSetupForm in syllabus.py (around line 40)

# Update your QuizSetupForm in syllabus.py

class QuizSetupForm(FlaskForm):
    # Total questions (auto-calculated from MCQ + Open)
    num_questions = IntegerField(
        "Total Number of Questions", 
        validators=[DataRequired(), NumberRange(min=3, max=50)],
        default=12,
        render_kw={"readonly": True}  # Read-only, calculated automatically
    )
    
    # NEW: Question type distribution
    num_mcq = IntegerField(
        "Number of MCQ (Multiple Choice)", 
        validators=[DataRequired(), NumberRange(min=0, max=50)],
        default=8
    )
    
    num_open = IntegerField(
        "Number of Open-Ended Questions", 
        validators=[DataRequired(), NumberRange(min=0, max=50)],
        default=4
    )
    
    difficulty = SelectField(
        "Difficulty", 
        choices=[
            ('', ''),
            ('easy', 'Easy'),
            ('medium', 'Medium'),
            ('hard', 'Hard')
        ], 
        validators=[],
        default=''
    )
    
    # Bloom Taxonomy Levels (6 levels)
    bloom_remember = IntegerField("Remember (%)", default=16, validators=[NumberRange(min=0, max=100)])
    bloom_understand = IntegerField("Understand (%)", default=17, validators=[NumberRange(min=0, max=100)])
    bloom_apply = IntegerField("Apply (%)", default=17, validators=[NumberRange(min=0, max=100)])
    bloom_analyze = IntegerField("Analyze (%)", default=17, validators=[NumberRange(min=0, max=100)])
    bloom_evaluate = IntegerField("Evaluate (%)", default=16, validators=[NumberRange(min=0, max=100)])
    bloom_create = IntegerField("Create (%)", default=17, validators=[NumberRange(min=0, max=100)])
    
    submit = SubmitField("Generate Quiz")



def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# Routes
@syllabus_bp.route("/<int:course_id>/upload", methods=["POST"])
def upload_syllabus(course_id):
    """
    Upload a syllabus (BGA or TN), persist it, then redirect back to the course page.

    UX target:
    - After upload, the teacher is redirected to the course page.
    - The course page automatically runs:
        1) extraction
        2) chapter/AAA classification (TN) or chapter build (BGA)
    """
    from app.routes.tn_syllabus import _get_or_create_syllabus, _clear_tn_normalized

    course = Course.query.get_or_404(course_id)

    # Permissions
    if not current_user.is_authenticated or not current_user.is_teacher or course.teacher_id != current_user.id:
        flash("You do not have permission to upload syllabus for this course.", "danger")
        return redirect(url_for('courses.view', course_id=course.id))

    form = UploadSyllabusForm()
    syllabus_type = request.form.get("syllabus_type", "").strip().lower()

    if form.validate_on_submit():
        file = form.file.data

        if not syllabus_type:
            flash("Please select syllabus type (BGA or TN).", "danger")
            return redirect(url_for("syllabus.upload_syllabus_form", course_id=course.id))

        if file and allowed_file(file.filename):
            os.makedirs(UPLOAD_FOLDER, exist_ok=True)
            filename = secure_filename(file.filename)
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            file.save(filepath)

            flash("Syllabus uploaded!", "success")

            # Persist/update syllabus record
            syllabus = _get_or_create_syllabus(course_id)
            syllabus.file_path = filename
            syllabus.syllabus_type = syllabus_type

            # Reset old extracted data when re-uploading
            if syllabus_type == "bga":
                syllabus.clo_data = []
                syllabus.plo_data = []
                syllabus.weekly_plan = []
                syllabus.clo_stats = {}
                syllabus.tn_data = None
                _clear_tn_normalized(syllabus)
            elif syllabus_type == "tn":
                syllabus.tn_data = None
                _clear_tn_normalized(syllabus)
                syllabus.clo_data = []
                syllabus.plo_data = []
                syllabus.weekly_plan = []
                syllabus.clo_stats = {}
            else:
                flash("Invalid syllabus type selection.", "danger")
                return redirect(url_for("syllabus.upload_syllabus_form", course_id=course.id))

            db.session.commit()

            # Trigger document processing for RAG (Syllabus)
            # Use 'syllabus_{course_id}' as the document ID since it's not in Document table
            if syllabus_type == 'tn' or syllabus_type == 'bga':  # Both are PDFs usually
                try:
                    from app.services.document_pipeline import process_pdf_document
                    process_pdf_document(
                        pdf_path=filepath,
                        document_id=f"syllabus_{course_id}", 
                        document_name=filename,
                        extract_images=False  # Syllabuses usually text-heavy
                    )
                    flash("Syllabus processed for AI search.", "info")
                except Exception as e:
                    current_app.logger.error(f"Error processing syllabus PDF: {e}")

            # Redirect to course page, where extraction/classification will run automatically
            return redirect(url_for('courses.view', course_id=course.id, syllabus_uploaded=1))

        else:
            flash("Invalid file type. Allowed: PDF, DOCX, XLSX, etc.", "danger")
            return redirect(url_for("syllabus.upload_syllabus_form", course_id=course.id))

    flash("Form validation failed.", "danger")
    return redirect(url_for("syllabus.upload_syllabus_form", course_id=course.id))
 
@syllabus_bp.route("/<int:course_id>/tn/chapter/<int:chapter_index>")
def tn_chapter_plan(course_id, chapter_index):
    from app.models import Course
    course = Course.query.get_or_404(course_id)

    # Les données JSON envoyées depuis tn_preview
    extracted_json = request.args.get("data")
    if not extracted_json:
        flash("No TN data provided.", "danger")
        return redirect(url_for("syllabus.upload_syllabus_form", course_id=course_id))

    import json
    extracted = json.loads(extracted_json)

    chapters = extracted.get("chapters", [])
    aaa = extracted.get("aaa", [])
    classification = extracted.get("aaa_classification", {})

    if chapter_index < 1 or chapter_index > len(chapters):
        flash("Invalid chapter index.", "danger")
        return redirect(url_for("syllabus.upload_syllabus_form", course_id=course_id))

    chapter = chapters[chapter_index - 1]

    # réutilisation du VRAI chapter_plan.html
    return render_template(
        "syllabus/chapter_plan.html",
        course=course,
        chapter_index=chapter_index,
        chapter_data=chapter,
        aaa=aaa,
        classification=classification,
        attachments=[]  # pas de DB → liste vide
    )




@syllabus_bp.route("/<int:course_id>/upload_form", methods=["GET"])
def upload_syllabus_form(course_id):
    course = Course.query.get_or_404(course_id)
    form = UploadSyllabusForm()
    return render_template(
        "syllabus/upload_syllabus.html",
        course=course,
        form=form
    )


@syllabus_bp.route('/uploads/<filename>')
def uploaded_file(filename):
    logger.debug(f"Serving uploaded file: {filename}")
    return send_from_directory(UPLOAD_FOLDER, filename)


@syllabus_bp.route('/documents/<filename>')
def uploaded_document(filename):
    logger.debug(f"Serving document: {filename}")
    return send_from_directory(UPLOAD_FOLDER, filename)


@syllabus_bp.route("/<int:course_id>/view")
@login_required
def view_course(course_id):
    """
    Teacher course view - displays syllabus, weekly plan, CLO/PLO, and quizzes.
    FIXED: Now properly retrieves and displays persisted syllabus data.
    """
    course = Course.query.get_or_404(course_id)
    
    # IMPORTANT: Check if user is the course teacher
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("You do not have permission to view this course.", "danger")
        return redirect(url_for('courses.index'))
    
    # ✅ KEY FIX: Always query the database for fresh syllabus data
    # Don't assume it's cached - force a fresh query from database
    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    
    logger.debug(f"Querying syllabus for course {course_id}")
    logger.debug(f"Syllabus found: {syllabus is not None}")
    
    if syllabus:
        logger.debug(f"Syllabus file_path: {syllabus.file_path}")
        logger.debug(f"Has weekly_plan: {bool(syllabus.weekly_plan)}")
        logger.debug(f"Weekly plan length: {len(syllabus.weekly_plan) if syllabus.weekly_plan else 0}")
    
    # ONLY get multi-week quizzes (week_number IS NULL)
    # Week-level quizzes (week_number NOT NULL) are shown in week_plan.html
    course_quizzes = Document.query.filter_by(
        course_id=course_id,
        document_type='quiz',
        week_number=None  # This ensures we ONLY get multi-week quizzes
    ).order_by(Document.created_at.desc()).all()
    
    logger.debug(f"Found {len(course_quizzes)} multi-week quizzes for course {course_id}")
    
    return render_template(
        "courses/view.html",
        course=course,
        syllabus=syllabus,  # ✅ PASS syllabus to template
        course_quizzes=course_quizzes  # Only multi-week quizzes
    )


@syllabus_bp.route("/<int:course_id>/debug_syllabus")
@login_required
def debug_syllabus(course_id):
    """
    Debug route to check if syllabus data is persisted.
    Remove this after testing!
    """
    course = Course.query.get_or_404(course_id)
    
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("Permission denied.", "danger")
        return redirect(url_for('courses.index'))
    
    # Direct query
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    
    if not syllabus:
        return jsonify({"error": "No syllabus found"}), 404
    
    return jsonify({
        "course_id": course_id,
        "syllabus_id": syllabus.id,
        "file_path": syllabus.file_path,
        "has_clo_data": bool(syllabus.clo_data),
        "clo_count": len(syllabus.clo_data) if syllabus.clo_data else 0,
        "has_plo_data": bool(syllabus.plo_data),
        "plo_count": len(syllabus.plo_data) if syllabus.plo_data else 0,
        "has_weekly_plan": bool(syllabus.weekly_plan),
        "week_count": len(syllabus.weekly_plan) if syllabus.weekly_plan else 0,
        "created_at": syllabus.created_at.isoformat() if syllabus.created_at else None,
        "updated_at": syllabus.updated_at.isoformat() if syllabus.updated_at else None
    })

@syllabus_bp.route("/<int:course_id>/extract", methods=["POST"])
def extract_syllabus(course_id):
    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    if not syllabus or not syllabus.file_path:
        logger.error(f"No syllabus or file_path for course {course_id}")
        return jsonify({"error": "No syllabus file uploaded"}), 404


    data = request.get_json()
    pdf_path = data.get('pdf_path', syllabus.file_path)  # Use provided or fallback to DB value (both relative)


    # Always construct full absolute path (handles relative filenames safely)
    if not os.path.isabs(pdf_path):
        pdf_path = os.path.join(UPLOAD_FOLDER, pdf_path)


    # Normalize path (handles any OS-specific issues)
    pdf_path = os.path.normpath(pdf_path)


    logger.debug(f"Extracting from full path: {pdf_path}")  # Add this for better logging


    try:
        extracted_data = SyllabusService.extract_from_file(pdf_path)
        logger.debug(f"Raw extracted data for course {course_id}: {extracted_data}")
       
        # Update even if partial
        SyllabusService.update_syllabus(
            course_id,
            clo_data=extracted_data.get("clo_data", []),
            plo_data=extracted_data.get("plo_data", []),
            weekly_plan=extracted_data.get("weekly_plan", [])
        )
       
        # Calculate CLO percentages if possible
        clo_percentages = SyllabusService.calculate_clo_coverage_stats(course_id)
       
        success_msg = "Syllabus extracted successfully!"
        if not any(extracted_data.values()):
            success_msg += " Note: Some data might be partial due to PDF complexity."
            logger.warning(f"Partial extraction for course {course_id}: empty data fields")
       
        return jsonify({
            "message": success_msg,
            "clo_data": extracted_data.get("clo_data", []),
            "plo_data": extracted_data.get("plo_data", []),
            "weekly_plan": extracted_data.get("weekly_plan", []),
            "clo_percentages": clo_percentages or {}
        })
    except FileNotFoundError as e:
        logger.error(f"File not found during extraction for course {course_id}: {str(e)}")
        return jsonify({"error": f"PDF file not found: {str(e)}"}), 404
    except Exception as e:
        logger.error(f"Extraction failed for course {course_id}: {str(e)}")
        return jsonify({"error": f"Extraction failed: {str(e)}"}), 500


@syllabus_bp.route("/<int:course_id>/clo_data", methods=["GET"])
def get_clo_data(course_id):
    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    if not syllabus or not syllabus.clo_data:
        logger.warning(f"No CLO data for course {course_id}")
        return jsonify({"error": "No CLO data available"}), 404
   
    clo_stats = syllabus.clo_stats or {}
   
    # Handle old flat stats (floats) vs. new nested (dicts) - convert flat to nested for JS compatibility
    if clo_stats and isinstance(list(clo_stats.values())[0], (int, float)) if clo_stats else False:
        logger.warning(f"Old flat clo_stats detected for course {course_id} - converting to nested (re-extract to update)")
        converted_stats = {}
        for clo_key, pct in clo_stats.items():
            converted_stats[clo_key] = {"percentage": round(pct, 2), "weeks": None}
        clo_stats = converted_stats
   
    log_stats = {}
    for k, v in clo_stats.items():
        if isinstance(v, dict):
            log_stats[k] = {'weeks': v.get('weeks', 'N/A'), 'percentage': v.get('percentage', 'N/A')}
        else:
            log_stats[k] = {'weeks': 'N/A', 'percentage': str(v)}
    logger.debug(f"Returning CLO data for course {course_id} with stats: {log_stats}")
   
    return jsonify({"clo_data": syllabus.clo_data, "clo_stats": clo_stats})


@syllabus_bp.route("/<int:course_id>/plo_data", methods=["GET"])
def get_plo_data(course_id):
    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    if not syllabus or not syllabus.plo_data:
        logger.warning(f"No PLO data for course {course_id}")
        return jsonify({"error": "No PLO data available"}), 404
    logger.debug(f"Returning PLO data for course {course_id}")
    return jsonify({"plo_data": syllabus.plo_data})


# Week Plan View Route
@syllabus_bp.route("/<int:course_id>/week/<int:week_num>", methods=['GET'])
@login_required
def view_week_plan(course_id, week_num):
    course = Course.query.get_or_404(course_id)
    if not (current_user.is_teacher or current_user.is_student):
        flash("You do not have permission to view this week plan.", "danger")
        return redirect(url_for('syllabus.view_course', course_id=course.id))
   
    week_data = SyllabusService.get_week_data(course_id, week_num)
    if not week_data:
        flash(f"Week {week_num} data not found for this course.", "warning")
        return redirect(url_for('syllabus.view_course', course_id=course.id))
   
    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    clo_data_raw = syllabus.clo_data or []
    clo_data = {}
    for clo in clo_data_raw:
        clo_id_raw = clo.get('CLO#', '')
        clo_id = str(clo_id_raw).strip() if clo_id_raw is not None else ''
        clo_desc = clo.get('CLO Description', 'No description extracted.')
       
        if clo_id.startswith('CLO'):
            standardized_key = clo_id
        else:
            try:
                num = int(clo_id)
                standardized_key = f'CLO{num}'
            except ValueError:
                standardized_key = f'CLO{clo_id}'
        clo_data[standardized_key] = clo_desc
   
    week_clo_percentages = SyllabusService.calculate_week_clo_percentages(course_id, week_num)
   
    attachments = Document.query.filter_by(
        course_id=course_id,
        week_number=week_num
    ).order_by(Document.created_at.desc()).all()
   
    logger.debug(f"Raw clo_data sample: {clo_data_raw[:1] if clo_data_raw else 'Empty'}")
    logger.debug(f"Standardized clo_data keys: {list(clo_data.keys())}")
    logger.debug(f"week_clo_percentages: {week_clo_percentages}")
   
    return render_template(
        "syllabus/week_plan.html",
        course=course,
        week_data=week_data,
        week_num=week_num,
        clo_data=clo_data,
        week_clo_percentages=week_clo_percentages,
        attachments=attachments
    )


# API Route for Dynamic Attachments Fetch
@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/attachments", methods=["GET"])
@login_required
def get_week_attachments(course_id, week_num):
    course = Course.query.get_or_404(course_id)
    if not (current_user.is_teacher or current_user.is_student):
        return jsonify({"error": "Unauthorized"}), 403
   
    attachments = Document.query.filter_by(
        course_id=course_id,
        week_number=week_num
    ).order_by(Document.created_at.desc()).all()
   
    attachments_list = []
    for doc in attachments:
        attachments_list.append({
            'id': doc.id,
            'title': doc.title,
            'document_type': doc.document_type,
            'is_quiz': doc.is_quiz,
            'file_path': doc.file_path,
            'file_type': doc.file_type,
            'download_url': url_for('syllabus.uploaded_document', filename=doc.file_path) if doc.file_path else None,
            'take_url': url_for('syllabus.take_week_quiz', course_id=course_id, week_num=week_num, document_id=doc.id) if doc.is_quiz else None
        })
   
    logger.debug(f"Returning {len(attachments_list)} attachments for course {course_id}, week {week_num}")
    return jsonify({"attachments": attachments_list})


# Upload Form for Week Attachment (Teacher-Only)
@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/upload_week_attachment", methods=["GET"])
@login_required
def upload_week_attachment_form(course_id, week_num):
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        flash("You do not have permission to upload attachments.", "danger")
        return redirect(url_for('syllabus.view_week_plan', course_id=course.id, week_num=week_num))
    form = UploadWeekAttachmentForm()
    return render_template("syllabus/week_upload_attachment.html", course=course, week_num=week_num, form=form)


@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/upload_week_attachment", methods=["POST"])
@login_required
def upload_week_attachment(course_id, week_num):
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        flash("You do not have permission to upload attachments.", "danger")
        return redirect(url_for('syllabus.view_week_plan', course_id=course.id, week_num=week_num))
   
    form = UploadWeekAttachmentForm()
    if form.validate_on_submit():
        file = form.file.data
        title = form.title.data or secure_filename(file.filename).rsplit('.', 1)[0]
       
        if file and allowed_file(file.filename):
            os.makedirs(UPLOAD_FOLDER, exist_ok=True)
            filename = secure_filename(f"week_{week_num}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}")
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            file.save(filepath)
           
            file_type = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'unknown'
            
            # Determine document type based on file extension
            video_extensions = {'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'}
            document_type = 'video' if file_type in video_extensions else 'week_attachment'
           
            document = Document(
                title=title,
                file_path=filename,
                file_type=file_type,
                document_type=document_type,  # 'video' or 'week_attachment'
                course_id=course_id,
                week_number=week_num,
                chapter_id=None,
                summary=None
            )
            db.session.add(document)
            db.session.commit()
            
            # Trigger document processing
            if file_type == 'pdf':
                try:
                    from app.services.document_pipeline import process_pdf_document
                    process_pdf_document(
                        pdf_path=filepath,
                        document_id=document.id,
                        document_name=file.filename,
                        extract_images=True
                    )
                    flash("Attachment processed for AI search.", "info")
                except Exception as e:
                    logger.error(f"Error processing document {document.id}: {e}")
            
            flash("Attachment uploaded successfully!", "success")
            logger.debug(f"Created {document_type} document ID {document.id} for course {course_id}, week {week_num}")
        else:
            flash("Invalid file type. Allowed: PDF, DOCX, PPTX, MP4, WebM, and other documents/videos.", "danger")
    else:
        flash("Form validation failed. Please check your input.", "danger")
        logger.debug(f"Form errors: {form.errors}")
   
    return redirect(url_for('syllabus.view_week_plan', course_id=course.id, week_num=week_num))


@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/generate_quiz", methods=['GET', 'POST'])
@login_required
def generate_quiz(course_id, week_num):
    course = Course.query.get_or_404(course_id)
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("Only teachers can generate quizzes.", "danger")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))
   
    week_data = SyllabusService.get_week_data(course_id, week_num)
    if not week_data:
        flash(f"Week {week_num} data not available.", "warning")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))
   
    # Get CLO descriptions for related CLOs
    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    clo_data = {str(clo['CLO#']): clo['CLO Description'] for clo in (syllabus.clo_data or [])}
    related_clos = week_data.get('Related CLOs', [])
   
    clo_texts = []
    for clo_num in related_clos:
        clo_key = str(clo_num) if isinstance(clo_num, (int, float)) else clo_num
        desc = clo_data.get(clo_key)
        if desc:
            clo_texts.append(f"{clo_key}: {desc}")
   
    # Prepare attachment summaries (only relevant ones)
    attachments = Document.query.filter_by(
        course_id=course_id,
        week_number=week_num,
        document_type='week_attachment'
    ).all()
   
    # Prepare clos list (CLO# and Description)
    clos = []
    for clo_num in related_clos:
        clo_key = str(clo_num) if isinstance(clo_num, (int, float)) else clo_num
        desc = clo_data.get(clo_key)
        if desc:
            clos.append({'CLO#': clo_key, 'Description': desc})


    # Extract full text from attachments (not just summaries)
    attachment_texts = []
    for att in attachments:
        if att.file_path:
            try:
                from app.services.file_service import extract_text_from_file
                import os
                file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], att.file_path)
                full_text = extract_text_from_file(file_path)
                if full_text:
                    attachment_texts.append(full_text)
            except Exception as e:
                current_app.logger.warning(f"Failed to extract full text from attachment {att.file_path}: {e}")
   
    # Compose the content for AI quiz generation
    week_objectives = week_data.get('Class Objectives', '')
    week_activities = week_data.get('Activities/Assessment', '')
   
    # Combine all relevant info into a prompt context
    week_content = f"""
Week {week_num} Objectives:
{week_objectives}


Activities/Assessment:
{week_activities}


Related CLOs:
{'; '.join(clo_texts) if clo_texts else 'No CLO descriptions available.'}


Relevant Attachment Summaries:
{chr(10).join([att.summary for att in attachments if att.summary]) if any(att.summary for att in attachments) else 'No relevant attachment summaries.'}


Instructions:
Generate multiple-choice questions that align with the above objectives and CLOs.
Each question must specify which CLO it targets.
"""
   
    form = QuizSetupForm()
    if request.method == 'POST' and form.validate_on_submit():
        num_questions = form.num_questions.data
        difficulty = form.difficulty.data
       
        try:
            questions = generate_quiz_questions(
                week_content=week_content,
            clos=clos,
                attachments_texts=attachment_texts,
                num_questions=num_questions,
                difficulty=difficulty
            )
           
            # Add CLO identification to each question if not present (optional)
            # Assuming AI includes CLO info in question text or explanation
           
            flash(f"Generated {len(questions)} questions. Please review and approve.", "success")
            return render_template('quiz/week_review.html',
                                   course=course, week_num=week_num, week_data=week_data,
                                   questions=questions, num_questions=num_questions)
        except Exception as e:
            flash(f"Failed to generate quiz: {str(e)}", "danger")
   
    return render_template('quiz/week_setup.html',
                           course=course, week_num=week_num, week_data=week_data,
                           week_content=week_content, form=form)


# Approve and Save Quiz as Attachment (Teacher-Only)
@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/approve_quiz", methods=['POST'])
@login_required
def approve_quiz(course_id, week_num):
    course = Course.query.get_or_404(course_id)
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("Only teachers can approve quizzes.", "danger")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))
   
    # Get edited questions from form (list of dicts from POST)
    num_questions = int(request.form.get('num_questions', 1))
    questions = []
    for i in range(1, num_questions + 1):
        q = {
            'question': request.form.get(f'question_{i}', '').strip(),
            'choice_a': request.form.get(f'choice_a_{i}', '').strip(),
            'choice_b': request.form.get(f'choice_b_{i}', '').strip(),
            'choice_c': request.form.get(f'choice_c_{i}', '').strip(),
            'correct_choice': request.form.get(f'correct_choice_{i}', 'A').upper(),
            'explanation': request.form.get(f'explanation_{i}', '').strip()
        }
        if q['question'] and q['choice_a'] and q['choice_b'] and q['choice_c']:  # Validate non-empty
            questions.append(q)
   
    if len(questions) < 3:
        flash("At least 3 valid questions are required.", "danger")
        return redirect(url_for('syllabus.generate_quiz', course_id=course_id, week_num=week_num))
   
    # Save as Document (quiz attachment)
    quiz_doc = Document(
        title=f"Week {week_num} Quiz",
        file_path=None,  # No file
        file_type=None,  # No file type
        document_type='quiz',
        course_id=course_id,
        week_number=week_num,
        chapter_id=None,
        summary=None,
        quiz_data=questions  # Store JSON (list of dicts)
    )
    db.session.add(quiz_doc)
    db.session.commit()
   
    flash(f"Quiz approved and added as attachment for Week {week_num}! ({len(questions)} questions)", "success")
    logger.debug(f"Saved quiz document ID {quiz_doc.id} for course {course_id}, week {week_num}")
    return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))


# View/Take Approved Quiz (Student or Teacher)


# Update take_week_quiz and take_course_quiz to capture CLO and Bloom data
@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/take_quiz/<int:document_id>")
@login_required
def take_week_quiz(course_id, week_num, document_id):
    """Take a week-level quiz."""
    
    course = Course.query.get_or_404(course_id)
    doc = Document.query.get_or_404(document_id)

    # Validate document
    if doc.document_type != 'quiz' or doc.week_number != week_num or doc.course_id != course_id:
        flash("Invalid quiz.", "danger")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))

    # Permission check
    if current_user.is_teacher:
        flash("Teachers cannot take quizzes.", "warning")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))
    
    if not Enrollment.query.filter_by(student_id=current_user.id, course_id=course_id).first():
        flash("Enroll in the course to take quizzes.", "warning")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))

    # Check if Quiz already exists for this student/document
    quiz = Quiz.query.filter_by(document_id=document_id, student_id=current_user.id).first()
    
    if not quiz:
        # Create new Quiz
        quiz = Quiz(
            document_id=document_id,
            student_id=current_user.id,
            num_questions=len(doc.quiz_data or []),
            completed_at=None
        )
        db.session.add(quiz)
        db.session.flush()

        # TN: AA descriptions (for dashboards)
        aa_desc_map = {}
        try:
            syllabus_obj = SyllabusService.get_syllabus_by_course(course_id)
            if syllabus_obj and (syllabus_obj.syllabus_type or "").lower() == "tn":
                aa_desc_map = {int(aa.number): (aa.description or "") for aa in (syllabus_obj.tn_aa or [])}
        except Exception:
            aa_desc_map = {}

        # Create QuizQuestion entries from Document.quiz_data
        for qdata in doc.quiz_data or []:
            # Get metadata from quiz_data
            clo = qdata.get('clo', 'N/A')
            m_aa = re.search(r'(\d+)', str(clo))
            if m_aa:
                aa_num = int(m_aa.group(1))
            desc = (aa_desc_map.get(aa_num) or '').strip()
            clo = f"AA{aa_num} — {desc}" if desc else f"AA{aa_num}"
            bloom_level = qdata.get('bloom_level', 'N/A')
            difficulty_level = qdata.get('difficulty_level', 'medium')
            question_type = qdata.get('question_type', 'mcq')
            
            # Build enhanced explanation with metadata
            base_explanation = qdata.get('explanation', '')
            metadata_str = f"\n[METADATA: CLO={clo}, BLOOM={bloom_level}, DIFFICULTY={difficulty_level}, TYPE={question_type}]"
            enhanced_explanation = base_explanation + metadata_str
            
            qq = QuizQuestion(
                quiz_id=quiz.id,
                question_text=qdata.get('question'),
                choice_a=qdata.get('choice_a', ''),
                choice_b=qdata.get('choice_b', ''),
                choice_c=qdata.get('choice_c', ''),
                correct_choice=qdata.get('correct_choice', 'A'),
                explanation=enhanced_explanation,
                bloom_level=bloom_level,
            clo=clo,
                difficulty=difficulty_level,
                question_type=question_type
            )
            db.session.add(qq)
        
        db.session.commit()

    return redirect(url_for('quiz.take', quiz_id=quiz.id, question_index=0))




# Placeholder Routes for Other Week Actions (can be expanded later)
@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/ask_ai")
@login_required
def ask_ai(course_id, week_num):
    flash("AI Q&A feature coming soon!", "info")
    return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))


@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/evaluate_exam")
@login_required
def evaluate_exam(course_id, week_num):
    flash("Exam evaluation feature coming soon!", "info")
    return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))




# ... (Your existing imports and code remain unchanged until the end of the file)


# ... (Existing routes like evaluate_exam remain unchanged)


# NEW: Delete Week Attachment Route (Teacher-Only)
@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/attachment/<int:attachment_id>/delete")
@login_required
def delete_week_attachment(course_id, week_num, attachment_id):
    """
    Route to delete a specific week attachment (teacher only).
    Redirects back to the week view with a flash message.
    """
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or current_user.id != course.teacher_id:
        flash('You do not have permission to delete attachments for this course.', 'danger')
        logger.warning(f"Unauthorized delete attempt for attachment {attachment_id} in course {course_id} by user {current_user.id}")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))


    # Call service to delete
    success = SyllabusService.delete_week_attachment(attachment_id, current_user.id)
    if success:
        flash('Attachment deleted successfully.', 'success')
        logger.debug(f"Successfully deleted attachment {attachment_id} for course {course_id}, week {week_num}")
    else:
        flash('Failed to delete attachment. It may not exist or you lack permission.', 'danger')
        logger.error(f"Failed to delete attachment {attachment_id} for course {course_id}, week {week_num}")


    # Redirect back to the week view
    return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))


from flask import render_template, flash, redirect, url_for
from flask_login import login_required, current_user
from app.models import Course, Document  # Adjust import paths as needed


@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/view_quiz/<int:document_id>")
@login_required
def view_week_quiz(course_id, week_num, document_id):
    # Fetch course and document or 404
    course = Course.query.get_or_404(course_id)
    document = Document.query.get_or_404(document_id)


    # Permission check: only teacher of the course can view quiz this way
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("You do not have permission to view this quiz.", "danger")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))


    # Validate document is a quiz for the correct week and course
    if document.document_type != 'quiz' or document.week_number != week_num or document.course_id != course_id:
        flash("Invalid quiz.", "danger")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=week_num))


    # quiz_data is expected to be a list of question dicts
    questions = document.quiz_data or []


    return render_template(
        "syllabus/view_quiz.html",
        course=course,
        week_num=week_num,
        document=document,
        questions=questions
    )


# ==========================================================
# TN QUIZ (by Chapters / by AA)
# ==========================================================

@syllabus_bp.route("/<int:course_id>/tn/quiz/setup", methods=['GET'])
@login_required
def tn_quiz_setup(course_id):
    """TN quiz setup (teacher).

    Modes:
    - by chapter/sections
    - by AA (acquis)
    - (optional) style inspired by an exam document
    """

    course = Course.query.get_or_404(course_id)
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("Only the course teacher can generate quizzes.", "danger")
        return redirect(url_for('courses.view', course_id=course_id))

    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    if not syllabus or (syllabus.syllabus_type or '').lower() != 'tn':
        flash("TN syllabus not found for this course.", "warning")
        return redirect(url_for('courses.view', course_id=course_id))

    # Chapters mapping: TNChapter.index <-> Course Chapter.order
    course_chapters = course.chapters.order_by(Chapter.order).all() if course.chapters else []
    tn_chapters = sorted(list(getattr(syllabus, 'tn_chapters', []) or []), key=lambda c: int(c.index))

    chapters_payload = []
    for tnc in tn_chapters:
        ch_order = int(tnc.index)
        ch_model = next((c for c in course_chapters if int(c.order) == ch_order), None)
        sections_payload = []
        for sec in sorted(list(tnc.sections or []), key=lambda s: str(s.index)):
            aa_nums = sorted({int(link.aa.number) for link in (sec.aa_links or [])})
            sections_payload.append({
                'tn_section_id': int(sec.id),
                'index': str(sec.index),
                'title': sec.title,
                'aa_numbers': aa_nums,
            })

        chapter_aa_nums = sorted({int(link.aa.number) for link in (tnc.aa_links or [])})
        chapters_payload.append({
            'tn_chapter_index': ch_order,
            'course_chapter_id': int(ch_model.id) if ch_model else None,
            'title': (ch_model.title if ch_model else tnc.title),
            'sections': sections_payload,
            'aa_numbers': chapter_aa_nums,
        })

    aa_payload = []
    for aa in sorted(list(getattr(syllabus, 'tn_aa', []) or []), key=lambda a: int(a.number)):
        aa_payload.append({
            'number': int(aa.number),
            'label': f"AA {int(aa.number)}",
            'description': aa.description or ''
        })

    overall_rows = _tn_compute_aa_distribution_rows(syllabus)

    # Optional style-exam dropdown
    exam_docs = Document.query.filter_by(course_id=course_id, document_type='exam').order_by(Document.created_at.desc()).all()

    preselect_chapter_id = request.args.get('chapter_id', type=int)
    initial_mode = (request.args.get('mode') or 'chapter').lower()

    # Allow reusing the exact same TN setup wizard for the Question Bank.
    # If target=bank, the form will submit to the Question Bank generator instead of quiz generator.
    target = (request.args.get('target') or 'quiz').lower().strip()
    if target == 'bank':
        form_action = url_for('question_bank.tn_generate', course_id=course_id)
        back_url = url_for('courses.view', course_id=course_id)
    else:
        form_action = url_for('syllabus.tn_generate_quiz', course_id=course_id)
        back_url = url_for('courses.view', course_id=course_id)

    return render_template(
        'quiz/tn_quiz_setup.html',
        course=course,
        syllabus=syllabus,
        chapters_payload=chapters_payload,
        aa_payload=aa_payload,
        overall_aa_distribution=overall_rows,
        exam_docs=exam_docs,
        preselect_chapter_id=preselect_chapter_id,
        initial_mode=initial_mode,
        form_action=form_action,
        back_url=back_url,
        target=target,
    )


@syllabus_bp.route("/<int:course_id>/tn/quiz/generate", methods=['POST'])
@login_required
def tn_generate_quiz(course_id):
    """Generate TN quiz using the existing AI pipeline (Gemini + optional RAG)."""

    course = Course.query.get_or_404(course_id)
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("Only the course teacher can generate quizzes.", "danger")
        return redirect(url_for('courses.view', course_id=course_id))

    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    if not syllabus or (syllabus.syllabus_type or '').lower() != 'tn':
        flash("TN syllabus not found for this course.", "warning")
        return redirect(url_for('courses.view', course_id=course_id))

    mode = (request.form.get('mode') or 'chapter').lower()

    # Question configuration
    try:
        num_mcq = int(request.form.get('num_mcq', 8))
        num_open = int(request.form.get('num_open', 4))
        num_questions = num_mcq + num_open
        if num_questions < 3 or num_questions > 50:
            raise ValueError("Total questions must be 3-50")
    except Exception as e:
        flash(f"Invalid question configuration: {e}", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))

    try:
        bloom_distribution = {
            'remember': int(request.form.get('bloom_remember') or 17),
            'understand': int(request.form.get('bloom_understand') or 25),
            'apply': int(request.form.get('bloom_apply') or 25),
            'analyze': int(request.form.get('bloom_analyze') or 20),
            'evaluate': int(request.form.get('bloom_evaluate') or 8),
            'create': int(request.form.get('bloom_create') or 5)
        }
        difficulty_distribution = {
            'easy': int(request.form.get('difficulty_easy') or 33),
            'medium': int(request.form.get('difficulty_medium') or 34),
            'hard': int(request.form.get('difficulty_hard') or 33)
        }
    except (ValueError, TypeError) as e:
        flash(f"Invalid bloom/difficulty values: {e}", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))
    if sum(bloom_distribution.values()) != 100:
        flash("Bloom Taxonomy must total 100%.", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))
    if sum(difficulty_distribution.values()) != 100:
        flash("Difficulty distribution must total 100%.", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))

    # Selection parsing
    selected_course_chapter_ids = [int(x) for x in request.form.getlist('chapters') if str(x).isdigit()]
    selected_tn_section_ids = [int(x) for x in request.form.getlist('sections') if str(x).isdigit()]
    selected_aa_numbers = [int(x) for x in request.form.getlist('aa_numbers') if str(x).isdigit()]

    # Resolve selection into TN sections + chapters
    selected_chapter_orders = set()
    selected_sections = []
    try:
        from app.models import TNSection, TNSectionAAA, TNAA
        if mode == 'aaa':
            if not selected_aa_numbers:
                flash("Please select at least one AA.", "warning")
                return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id, mode='aaa'))

            # Sections containing the selected AA
            selected_sections = (
                TNSection.query
                .join(TNSectionAAA, TNSectionAAA.section_id == TNSection.id)
                .join(TNAA, TNAA.id == TNSectionAAA.aa_id)
                .filter(TNAA.syllabus_id == syllabus.id)
                .filter(TNAA.number.in_(selected_aa_numbers))
                .all()
            )
            selected_tn_section_ids = [s.id for s in selected_sections]
        else:
            # chapter mode
            if not selected_course_chapter_ids and not selected_tn_section_ids:
                flash("Please select at least one chapter or section.", "warning")
                return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))
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

        # If we only received course chapter IDs (no section IDs), include all TN sections of those chapters
        if mode != 'aaa' and selected_course_chapter_ids and not selected_tn_section_ids:
            course_chapters = Chapter.query.filter(Chapter.id.in_(selected_course_chapter_ids)).all()
            selected_chapter_orders.update({int(c.order) for c in course_chapters})

            # Load sections for those chapter orders
            selected_sections = []
            for ch in (syllabus.tn_chapters or []):
                if int(ch.index) in selected_chapter_orders:
                    selected_sections.extend(list(ch.sections or []))
            selected_tn_section_ids = [s.id for s in selected_sections]
    except Exception as e:
        current_app.logger.error(f"TN selection resolution failed: {e}")

    if not selected_chapter_orders and not selected_tn_section_ids:
        flash("Nothing selected for the quiz.", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))

    # Determine which AAs are covered by the selection
    try:
        selection_rows = _tn_compute_aa_distribution_rows(
            syllabus,
            section_ids=selected_tn_section_ids if selected_tn_section_ids else None,
            chapter_indices=list(selected_chapter_orders) if selected_chapter_orders else None
        )

        if not selection_rows:
            flash("No AA links found for the selected content.", "warning")
            return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))

        clo_distribution = _tn_rows_to_clo_distribution(selection_rows)

        # Build CLO list from AA catalog (CLO 1 -> AA 1)
        aa_by_num = {int(a.number): (a.description or '') for a in (syllabus.tn_aa or [])}
        selected_nums = [int(r['number']) for r in selection_rows]
        clos = [{'CLO#': f"CLO {n}", 'CLO Description': aa_by_num.get(n, '')} for n in selected_nums]

        # Context text
        chapters_label = ", ".join([str(x) for x in sorted(selected_chapter_orders)]) if selected_chapter_orders else "(sections)"
        week_content = f"""TN Quiz Generation Context
Course: {course.title}
Chapters: {chapters_label}

Acquis (AA) to cover:
""" + "\n".join([f"AA {n}: {aa_by_num.get(n, '')[:220]}" for n in selected_nums])
    except Exception as e:
        current_app.logger.error(f"TN AA/CLO distribution failed: {e}")
        flash(f"Failed to compute quiz distribution: {e}", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))

    # Collect chapter files for RAG
    attachments_texts = []
    attachments_metadata = []
    sources_map = {}
    source_id_counter = 1
    activity_patterns = None

    try:
        # Map selected chapter orders -> Course Chapter ids
        selected_course_chapters = []
        if selected_chapter_orders:
            selected_course_chapters = Chapter.query.filter_by(course_id=course_id).filter(Chapter.order.in_(list(selected_chapter_orders))).all()
        elif selected_course_chapter_ids:
            selected_course_chapters = Chapter.query.filter(Chapter.id.in_(selected_course_chapter_ids)).all()

        chapters_by_id = {c.id: c for c in selected_course_chapters}

        # Include module-level attachments as a small supplement
        module_docs = Document.query.filter_by(course_id=course_id, chapter_id=None).filter(Document.document_type != 'quiz').all()

        docs_to_use = []
        for ch in selected_course_chapters:
            docs_to_use.extend(Document.query.filter_by(chapter_id=ch.id).filter(Document.document_type != 'quiz').all())
        docs_to_use.extend(module_docs)

        # Optional: style from exam
        exam_style_id = request.form.get('exam_style_id', type=int)
        if exam_style_id:
            try:
                exam_doc = Document.query.get(exam_style_id)
                if exam_doc and exam_doc.file_path:
                    from app.services.evaluate_service import extract_text_from_file as _extract_exam
                    exam_text = _extract_exam(os.path.join(current_app.root_path, exam_doc.file_path))
                    if exam_text:
                        from app.services.ai_service import extract_activity_patterns
                        activity_patterns = extract_activity_patterns(
                            activity_text=exam_text,
                            clo_data=clos,
                            course_id=course_id
                        )
            except Exception as e:
                current_app.logger.warning(f"Exam style extraction failed: {e}")

        for doc in docs_to_use:
            source_id = f"SRC{source_id_counter}"
            text = ""
            if doc.file_path:
                try:
                    from app.services.file_service import extract_text_from_file
                    file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], doc.file_path)
                    if os.path.isfile(file_path):
                        text = extract_text_from_file(file_path) or ""
                    else:
                        current_app.logger.info(f"File not on disk, will use VectorStore: {doc.file_path}")
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
            attachments_texts.append(text)
            attachments_metadata.append(meta)
            sources_map[source_id] = meta
            source_id_counter += 1
    except Exception as e:
        current_app.logger.error(f"TN document collection failed: {e}")
        # Continue with empty attachments — generation still works

    if not attachments_texts:
        flash("Warning: No documents found for the selected chapters. Quiz will be generated from syllabus text only — questions may be generic. Upload chapter materials for better results.", "warning")

    # Generate
    try:
        from app.services.ai_service import generate_quiz_questions
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
            activity_patterns=activity_patterns,
            theory_ratio=0.30,
            language='fr'  # TN syllabi are in French
        )

        questions = result.get('questions', [])

        # Replace CLO labels by AA labels for display
        for q in questions:
            if isinstance(q.get('clo'), str) and q['clo'].lower().startswith('clo'):
                # "CLO 3" -> "AA 3"
                q['clo'] = q['clo'].replace('CLO', 'AA').strip()

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
            sources_map=sources_map
        )
    except Exception as e:
        current_app.logger.error(f"TN quiz generation failed: {e}")
        flash(f"Quiz generation failed: {e}", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))


@syllabus_bp.route("/<int:course_id>/tn/quiz/approve", methods=['POST'])
@login_required
def tn_approve_quiz(course_id):
    """Approve and persist a TN quiz as a Document.quiz_data (teacher)."""

    course = Course.query.get_or_404(course_id)
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("Only the course teacher can approve quizzes.", "danger")
        return redirect(url_for('courses.view', course_id=course_id))

    try:
        num_questions = int(request.form.get('num_questions', 0))
        if num_questions < 1:
            raise ValueError("Invalid number of questions")

        mode = (request.form.get('mode') or 'chapter').lower()
        selected_chapters = request.form.get('selected_chapters', '')

        questions = []
        for i in range(1, num_questions + 1):
            question_type = request.form.get(f'question_type_{i}', 'mcq').lower()

            question_text = request.form.get(f'question_{i}', '').strip()
            clo = request.form.get(f'clo_{i}', 'AA 1').strip()
            bloom_level = request.form.get(f'bloom_level_{i}', 'understand').strip()
            difficulty_level = request.form.get(f'difficulty_level_{i}', 'medium').strip()
            explanation = request.form.get(f'explanation_{i}', '').strip()
            source_id = request.form.get(f'source_id_{i}', 'SRC1').strip()
            source_page = request.form.get(f'source_page_{i}', 'Section 1').strip()
            source_text = request.form.get(f'source_text_{i}', 'Reference material').strip()

            if not question_text or len(question_text) < 10:
                continue

            q = {
                'question': question_text,
                'question_type': question_type,
                'clo': clo.replace('CLO', 'AA').strip(),
                'bloom_level': bloom_level.lower(),
                'difficulty_level': difficulty_level.lower(),
                'explanation': explanation,
                'source_id': source_id,
                'source_page': source_page,
                'source_text': source_text
            }

            # preserve activity alignment info if present
            activity_inspired = request.form.get(f'activity_inspired_{i}', 'false').lower() == 'true'
            if activity_inspired:
                q['_activity_inspired'] = True
                q['_activity_alignment_score'] = float(request.form.get(f'activity_score_{i}', 0) or 0)
                q['_activity_alignment_details'] = request.form.get(f'activity_details_{i}', '')

            if question_type == 'mcq':
                q['choice_a'] = request.form.get(f'choice_a_{i}', '').strip()
                q['choice_b'] = request.form.get(f'choice_b_{i}', '').strip()
                q['choice_c'] = request.form.get(f'choice_c_{i}', '').strip()
                q['correct_choice'] = request.form.get(f'correct_choice_{i}', 'A').upper()
                if not all([q['choice_a'], q['choice_b'], q['choice_c']]):
                    continue
            else:
                q['open_ended_type'] = request.form.get(f'open_ended_type_{i}', 'short_answer').lower()
                q['model_answer'] = request.form.get(f'model_answer_{i}', '').strip()
                criteria_raw = request.form.get(f'evaluation_criteria_{i}', '').strip()
                q['evaluation_criteria'] = [c.strip() for c in criteria_raw.split('\n') if c.strip()]
                q['grading_rubric'] = request.form.get(f'grading_rubric_{i}', '').strip()
                if not q['model_answer'] or len(q['model_answer']) < 10:
                    continue

            questions.append(q)

        if len(questions) < 3:
            flash("At least 3 valid questions are required.", "danger")
            return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))

        # Build a readable title
        from datetime import datetime as _dt
        stamp = _dt.utcnow().strftime('%Y-%m-%d')
        label = "TN Quiz"
        if selected_chapters:
            label = f"Quiz Chapitres {selected_chapters}"
        title = f"{label} ({stamp})"

        quiz_doc = Document(
            title=title,
            file_path=None,
            file_type=None,
            document_type='quiz',
            course_id=course_id,
            week_number=None,
            chapter_id=None,
            summary=f"TN quiz | mode={mode} | chapters={selected_chapters}",
            quiz_data=questions
        )
        db.session.add(quiz_doc)
        db.session.commit()

        flash(f"Quiz approved and saved ({len(questions)} questions).", "success")
        return redirect(url_for('courses.view', course_id=course_id))

    except Exception as e:
        current_app.logger.error(f"TN approve failed: {e}")
        flash(f"Failed to approve quiz: {e}", "danger")
        return redirect(url_for('syllabus.tn_quiz_setup', course_id=course_id))


# Ajoutez ces routes à la fin de votre fichier syllabus.py

# Remplacez la fonction multi_week_quiz_setup existante par celle-ci :

# Add this to your syllabus.py route (replace the existing multi_week_quiz_setup function)

@syllabus_bp.route("/<int:course_id>/multi_week_quiz_setup", methods=['GET'])
@login_required
def multi_week_quiz_setup(course_id):
    """
    Display the multi-week quiz setup page where teachers can select weeks
    and configure quiz parameters.
    """
    logger.debug(f"===== ENTERING multi_week_quiz_setup for course {course_id} =====")
    
    try:
        course = Course.query.get_or_404(course_id)
        logger.debug(f"Course found: {course.title}")
        
        # Permission check: only course teacher
        if not (current_user.is_teacher and course.teacher_id == current_user.id):
            flash("Only the course teacher can generate quizzes.", "danger")
            logger.warning(f"Permission denied for user {current_user.id} on course {course_id}")
            return redirect(url_for('syllabus.view_course', course_id=course_id))
        
        # Get syllabus and weekly plan
        syllabus = SyllabusService.get_syllabus_by_course(course_id)
        logger.debug(f"Retrieved syllabus for course {course_id}")
        
        if not syllabus or not syllabus.weekly_plan:
            logger.warning(f"No syllabus or weekly plan for course {course_id}")
            flash("Please upload and extract syllabus data first.", "warning")
            return redirect(url_for('syllabus.view_course', course_id=course_id))
        
        weeks = syllabus.weekly_plan
        logger.debug(f"Found {len(weeks)} weeks in weekly plan")
        
        # Build CLO lookup with descriptions
        clo_descriptions = {}
        for clo in (syllabus.clo_data or []):
            clo_num = str(clo.get('CLO#', ''))
            clo_desc = clo.get('CLO Description', 'No description')
            
            # Standardize CLO key
            if clo_num and not clo_num.startswith('CLO'):
                clo_key = f'CLO{clo_num}'
            else:
                clo_key = clo_num

            if clo_key:
                clo_descriptions[clo_key] = clo_desc
        
        logger.debug(f"CLO descriptions: {list(clo_descriptions.keys())}")
        
        # Prepare weeks_with_clos - extract CLO information from each week
        weeks_with_clos = []
        for week in weeks:
            week_dict = {
                'Week#': week.get('Week#'),
                'Topic': week.get('Topic', ''),
                'Related CLOs': week.get('Related CLOs', [])
            }
            weeks_with_clos.append(week_dict)
        
        logger.debug(f"Prepared weeks_with_clos: {len(weeks_with_clos)} weeks")
        
        form = QuizSetupForm()
        logger.debug("QuizSetupForm created successfully")
        
        logger.debug("Rendering syllabus/quiz_setup.html template")
        return render_template(
            'quiz/quiz_setup.html',
            course=course,
            weeks=weeks,
            weeks_with_clos=weeks_with_clos,
            clo_descriptions=clo_descriptions,  # NEW: Pass CLO descriptions
            initial_clo_percentages={},
            form=form
        )
        
    except Exception as e:
        logger.error(f"ERROR in multi_week_quiz_setup: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        flash(f"An error occurred: {str(e)}", "danger")
        return redirect(url_for('syllabus.view_course', course_id=course_id))
    
# NEW route for viewing MULTI-WEEK quizzes
# Week-level quizzes use view_week_quiz (already exists)

@syllabus_bp.route("/<int:course_id>/course_quiz/<int:document_id>/view")
@login_required
def view_course_quiz(course_id, document_id):
    """
    View a MULTI-WEEK quiz (week_number=None, teacher only).
    Week-level quizzes use the separate view_week_quiz route.
    Properly builds sources_map for template display.
    """
    course = Course.query.get_or_404(course_id)
    document = Document.query.get_or_404(document_id)
    
    # Permission check
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("You do not have permission to view this quiz.", "danger")
        return redirect(url_for('syllabus.view_course', course_id=course_id))
    
    # Validate: must be a quiz, belong to this course, and be multi-week (week_number=None)
    if document.document_type != 'quiz' or document.course_id != course_id:
        flash("Invalid quiz.", "danger")
        return redirect(url_for('syllabus.view_course', course_id=course_id))
    
    if document.week_number is not None:
        # This is a week-level quiz, redirect to week view
        flash("This is a week-level quiz. View it from the week page.", "info")
        return redirect(url_for('syllabus.view_week_plan', course_id=course_id, week_num=document.week_number))
    
    questions = document.quiz_data or []
    
    # Extract weeks from title or summary
    import re
    weeks_match = re.search(r'Weeks?\s+([\d,\s]+)', document.title + ' ' + (document.summary or ''))
    covered_weeks = weeks_match.group(1) if weeks_match else 'Multiple weeks'
    
    # ✅ BUILD SOURCES_MAP FROM QUESTIONS - KEY FIX
    # This extracts all unique sources referenced in the quiz
    sources_map = {}
    seen_source_ids = set()
    
    for question in questions:
        source_id = question.get('source_id', 'N/A')
        source_page = question.get('source_page', 'N/A')
        source_text = question.get('source_text', 'N/A')
        
        # Skip if already processed or N/A
        if source_id in seen_source_ids or source_id == 'N/A' or not source_id:
            continue
        
        seen_source_ids.add(source_id)
        
        # Extract title from source_page (e.g., "Section 2.1" or "Page 5")
        # If source_page has a dot notation, use it; otherwise use generic title
        title = source_page if source_page and source_page != 'N/A' else f"Source {source_id}"
        
        sources_map[source_id] = {
            'source_id': source_id,
            'title': title,
            'filename': source_id,  # Use source_id as filename since we don't have original
            'source_page': source_page,
            'source_text': source_text,
            'file_type': 'pdf',  # Default to pdf for display
            'week_num': 'N/A'
        }
    
    logger.info(f"Built sources_map with {len(sources_map)} unique sources for quiz {document_id}")
    
    return render_template(
        "quiz/course_quiz_view.html",
        course=course,
        document=document,
        questions=questions,
        covered_weeks=covered_weeks,
        sources_map=sources_map  # ✅ PASS sources_map to template
    )

@syllabus_bp.route("/<int:course_id>/course_quiz/<int:document_id>/delete")
@login_required
def delete_course_quiz(course_id, document_id):
    """
    Delete a MULTI-WEEK quiz (week_number=None, teacher only).
    Week-level quizzes cannot be deleted through this route.
    """
    course = Course.query.get_or_404(course_id)
    document = Document.query.get_or_404(document_id)
    
    # Permission check
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("You do not have permission to delete this quiz.", "danger")
        return redirect(url_for('syllabus.view_course', course_id=course_id))
    
    # Validate: must be quiz, belong to course, and be multi-week (week_number=None)
    if document.document_type != 'quiz' or document.course_id != course_id:
        flash("Invalid quiz.", "danger")
        return redirect(url_for('syllabus.view_course', course_id=course_id))
    
    if document.week_number is not None:
        flash("Cannot delete week-level quizzes through this route.", "danger")
        return redirect(url_for('syllabus.view_course', course_id=course_id))
    
    try:
        db.session.delete(document)
        db.session.commit()
        flash("Multi-week quiz deleted successfully.", "success")
        logger.debug(f"Deleted multi-week quiz document ID {document_id} for course {course_id}")
    except Exception as e:
        db.session.rollback()
        flash(f"Failed to delete quiz: {str(e)}", "danger")
        logger.error(f"Error deleting multi-week quiz {document_id}: {str(e)}")
    
    return redirect(url_for('syllabus.view_course', course_id=course_id))


@syllabus_bp.route("/<int:course_id>/course_quiz/<int:document_id>/take")
@login_required
def take_course_quiz(course_id, document_id):
    """
    Take a multi-week quiz.
    
    ✅ SMART ROUTING:
    - If already completed → redirect to results
    - If in progress → redirect to resume
    - Otherwise → create new and start
    """
    
    course = Course.query.get_or_404(course_id)
    document = Document.query.get_or_404(document_id)
    
    # Validate
    if document.document_type != 'quiz' or document.course_id != course_id:
        flash("Invalid quiz.", "danger")
        return redirect(url_for('courses.student_view', course_id=course_id))
    
    # Permission check: student only
    if current_user.is_teacher:
        flash("Teachers cannot take quizzes.", "warning")
        return redirect(url_for('courses.student_view', course_id=course_id))
    
    # Check enrollment
    if not Enrollment.query.filter_by(student_id=current_user.id, course_id=course_id).first():
        flash("Enroll in the course to take quizzes.", "warning")
        return redirect(url_for('courses.student_view', course_id=course_id))
    
    # ✅ CHECK IF ALREADY COMPLETED (PRIORITY 1)
    completed_quiz = Quiz.query.filter_by(
        document_id=document_id,
        student_id=current_user.id
    ).filter(Quiz.completed_at.isnot(None)).first()
    
    if completed_quiz:
        logger.info(f"✅ Student {current_user.id} already completed quiz {document_id}")
        flash('You have already completed this quiz. Viewing your results...', 'info')
        return redirect(url_for('quiz.results', quiz_id=completed_quiz.id))
    
    # ✅ CHECK IF IN PROGRESS (PRIORITY 2)
    in_progress_quiz = Quiz.query.filter_by(
        document_id=document_id, 
        student_id=current_user.id,
        completed_at=None
    ).first()
    
    if in_progress_quiz:
        logger.info(f"⏳ Student {current_user.id} resuming quiz {in_progress_quiz.id}")
        flash('Resuming your incomplete quiz...', 'info')
        return redirect(url_for('quiz.take', quiz_id=in_progress_quiz.id, question_index=0))
    
    # ✅ CREATE NEW QUIZ
    logger.info(f"🆕 Creating new quiz for student {current_user.id}")
    quiz = Quiz(
        document_id=document_id,
        student_id=current_user.id,
        num_questions=len(document.quiz_data or [])
    )
    db.session.add(quiz)
    db.session.flush()

    # TN: AA descriptions (for dashboards)
    aa_desc_map = {}
    try:
        syllabus_obj = SyllabusService.get_syllabus_by_course(course_id)
        if syllabus_obj and (syllabus_obj.syllabus_type or '').lower() == 'tn':
            aa_desc_map = {int(aa.number): (aa.description or '') for aa in (syllabus_obj.tn_aa or [])}
    except Exception:
        aa_desc_map = {}

    # Create QuizQuestion entries with metadata
    for qdata in document.quiz_data or []:
        # Get metadata from quiz_data
        clo = qdata.get('clo', 'N/A')
        m_aa = re.search(r'(\d+)', str(clo))
        if m_aa:
            aa_num = int(m_aa.group(1))
            desc = (aa_desc_map.get(aa_num) or '').strip()
            clo = f"AA{aa_num} — {desc}" if desc else f"AA{aa_num}"
        bloom_level = qdata.get('bloom_level', 'N/A')
        difficulty_level = qdata.get('difficulty_level', 'medium')
        question_type = qdata.get('question_type', 'mcq')
        
        # Build enhanced explanation with metadata
        base_explanation = qdata.get('explanation', '')
        metadata_str = f"\n[METADATA: CLO={clo}, BLOOM={bloom_level}, DIFFICULTY={difficulty_level}, TYPE={question_type}]"
        enhanced_explanation = base_explanation + metadata_str
        
        qq = QuizQuestion(
            quiz_id=quiz.id,
            question_text=qdata.get('question'),
            choice_a=qdata.get('choice_a', ''),
            choice_b=qdata.get('choice_b', ''),
            choice_c=qdata.get('choice_c', ''),
            correct_choice=qdata.get('correct_choice', 'A'),
            explanation=enhanced_explanation,
            bloom_level=bloom_level,
            clo=clo,
            difficulty=difficulty_level,
            question_type=question_type
        )
        db.session.add(qq)
    
    db.session.commit()
    
    logger.info(f"✓ Quiz {quiz.id} created with {len(document.quiz_data or [])} questions")
    flash('Quiz started! Good luck!', 'success')
    
    return redirect(url_for('quiz.take', quiz_id=quiz.id, question_index=0))

# ============================================
# FIX 1: Update syllabus.py - Pass sources_map to review template
# ============================================

@syllabus_bp.route("/<int:course_id>/generate_multi_week_quiz", methods=['POST'])
@login_required
def generate_multi_week_quiz(course_id):
    """
    Simplifié: Juste collecter config et appeler AI
    Génère des questions de quiz multi-semaines
    """
    logger.info(f"===== generate_multi_week_quiz START for course {course_id} =====")
    
    course = Course.query.get_or_404(course_id)
    
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("Only the course teacher can generate quizzes.", "danger")
        return redirect(url_for('syllabus.view_course', course_id=course_id))
    
    # 1. GET WEEKS
    selected_weeks = request.form.getlist('selected_weeks')
    if not selected_weeks:
        flash("Please select at least one week.", "warning")
        return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))
    
    try:
        selected_weeks = [int(w) for w in selected_weeks]
        logger.info(f"Selected weeks: {selected_weeks}")
    except ValueError:
        flash("Invalid week selection.", "danger")
        return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))
    
    # 2. GET CONFIG
    try:
        num_mcq = int(request.form.get('num_mcq', 8))
        num_open = int(request.form.get('num_open', 4))
        num_questions = num_mcq + num_open
        
        if num_questions < 3 or num_questions > 50:
            raise ValueError("Total questions must be 3-50")
        logger.info(f"Questions: {num_mcq} MCQ + {num_open} Open = {num_questions} total")
    except (ValueError, TypeError) as e:
        flash(f"Invalid question configuration: {str(e)}", "danger")
        return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))
    
    bloom_distribution = {
        'remember': int(request.form.get('bloom_remember', 17)),
        'understand': int(request.form.get('bloom_understand', 25)),
        'apply': int(request.form.get('bloom_apply', 25)),
        'analyze': int(request.form.get('bloom_analyze', 20)),
        'evaluate': int(request.form.get('bloom_evaluate', 8)),
        'create': int(request.form.get('bloom_create', 5))
    }
    
    difficulty_distribution = {
        'easy': int(request.form.get('difficulty_easy', 33)),
        'medium': int(request.form.get('difficulty_medium', 34)),
        'hard': int(request.form.get('difficulty_hard', 33))
    }
    
    if sum(bloom_distribution.values()) != 100:
        flash("Bloom Taxonomy must total 100%", "danger")
        return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))
    
    if sum(difficulty_distribution.values()) != 100:
        flash("Difficulty distribution must total 100%", "danger")
        return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))
    
    # 3. GET SYLLABUS DATA
    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    if not syllabus:
        flash("Syllabus data not found.", "danger")
        return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))
    
    clo_data = {str(clo['CLO#']): clo.get('CLO Description', '') for clo in (syllabus.clo_data or [])}
    
    # 4. COLLECT CONTENT FROM SELECTED WEEKS
    all_clos = {}
    all_content = []
    attachments_texts = []
    attachments_metadata = []
    sources_map = {}
    source_id_counter = 1

    # Also include module-level attachments (not tied to a specific week)
    module_attachments = Document.query.filter_by(
        course_id=course_id,
        document_type='module_attachment'
    ).all()
    
    for att in module_attachments:
        if att.file_path:
            try:
                from app.services.file_service import extract_text_from_file
                file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], att.file_path)
                text = extract_text_from_file(file_path)
                
                if text:
                    source_id = f"SRC{source_id_counter}"
                    attachments_texts.append(text)
                    attachments_metadata.append({
                        'title': att.title,
                        'filename': att.file_path,
                        'week_num': 'Module',  # Not week-specific
                        'file_type': att.file_type,
                        'source_id': source_id,
                        'text_length': len(text)
                    })
                    sources_map[source_id] = attachments_metadata[-1]
                    source_id_counter += 1
                    logger.info(f"Added module attachment: {att.title}")
            except Exception as e:
                logger.error(f"Failed to extract module attachment {att.title}: {e}")
    
    for week_num in selected_weeks:
        week_data = SyllabusService.get_week_data(course_id, week_num)
        if not week_data:
            continue
        
        # Collect CLOs
        for clo_num in week_data.get('Related CLOs', []):
            clo_key = f'CLO{clo_num}'
            if clo_key not in all_clos:
                all_clos[clo_key] = clo_data.get(str(clo_num), f'CLO {clo_num}')
        
        # Collect objectives
        if week_data.get('Class Objectives'):
            all_content.append(f"Week {week_num}: {week_data['Class Objectives']}")
        
        # Collect attachments
        attachments = Document.query.filter_by(
            course_id=course_id,
            week_number=week_num,
            document_type='week_attachment'
        ).all()
        
        for att in attachments:
            if att.file_path:
                try:
                    from app.services.file_service import extract_text_from_file
                    file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], att.file_path)
                    text = extract_text_from_file(file_path)
                    
                    if text:
                        source_id = f"SRC{source_id_counter}"
                        attachments_texts.append(text)
                        attachments_metadata.append({
                            'title': att.title,
                            'filename': att.file_path,
                            'week_num': week_num,
                            'file_type': att.file_type,
                            'source_id': source_id
                        })
                        sources_map[source_id] = attachments_metadata[-1]
                        source_id_counter += 1
                except Exception as e:
                    logger.error(f"Failed to extract: {e}")
    
    if not all_clos:
        flash("No CLOs found.", "danger")
        return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))
    
    # 5. GENERATE QUESTIONS
    try:
        week_context = f"Weeks: {selected_weeks}\n\n{chr(10).join(all_content)}"
        clos = [{'CLO#': k, 'CLO Description': v} for k, v in all_clos.items()]
        
        result = generate_quiz_questions(
            week_content=week_context,
            clos=clos,
            attachments_texts=attachments_texts,
            attachments_metadata=attachments_metadata,
            num_mcq=num_mcq,
            num_open=num_open,
            num_questions=num_questions,
            difficulty='medium',
            clo_distribution={},
            bloom_distribution=bloom_distribution,
            difficulty_distribution=difficulty_distribution
        )
        
        questions = result['questions']
        
        logger.info(f"Generated {len(questions)} questions")
        
        # 6. SHOW REVIEW PAGE
        return render_template(
            'quiz/multi_week_review.html',
            course=course,
            selected_weeks=selected_weeks,
            questions=questions,
            num_questions=len(questions),
            num_mcq=result.get('mcq_count', 0),
            num_open=result.get('open_count', 0),
            all_clos=all_clos,
            sources_map=sources_map
        )
    
    except Exception as e:
        logger.error(f"Generation error: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        flash(f"Failed to generate: {str(e)}", "danger")
        return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))


# ============================================
# FIX 2: Update approve_multi_week_quiz to preserve activity alignment data
# ============================================

@syllabus_bp.route("/<int:course_id>/approve_multi_week_quiz", methods=['POST'])
@login_required
def approve_multi_week_quiz(course_id):
    """Save quiz with activity alignment data preserved"""
    
    course = Course.query.get_or_404(course_id)
    
    if not (current_user.is_teacher and course.teacher_id == current_user.id):
        flash("Only the course teacher can approve quizzes.", "danger")
        return redirect(url_for('syllabus.view_course', course_id=course_id))
    
    try:
        num_questions = int(request.form.get('num_questions', 0))
        selected_weeks = request.form.get('selected_weeks', '')
        
        if num_questions < 1:
            flash("Invalid number of questions.", "danger")
            return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))
        
        questions = []
        mcq_count = 0
        open_count = 0
        
        for i in range(1, num_questions + 1):
            question_type = request.form.get(f'question_type_{i}', 'mcq').lower()
            
            # Common fields
            question_text = request.form.get(f'question_{i}', '').strip()
            clo = request.form.get(f'clo_{i}', 'CLO 1').strip()
            bloom_level = request.form.get(f'bloom_level_{i}', 'understand').strip()
            difficulty_level = request.form.get(f'difficulty_level_{i}', 'medium').strip()
            explanation = request.form.get(f'explanation_{i}', '').strip()
            source_id = request.form.get(f'source_id_{i}', 'N/A').strip()
            source_page = request.form.get(f'source_page_{i}', 'N/A').strip()
            source_text = request.form.get(f'source_text_{i}', 'N/A').strip()
            
            if not question_text or len(question_text) < 10:
                logger.warning(f"Skipping question {i}: invalid text")
                continue
            
            q = {
                'question': question_text,
                'question_type': question_type,
                'clo': clo,
                'bloom_level': bloom_level,
                'difficulty_level': difficulty_level,
                'explanation': explanation,
                'source_id': source_id,
                'source_page': source_page,
                'source_text': source_text
            }
            
            # ✅ PRESERVE activity alignment data
            activity_inspired = request.form.get(f'activity_inspired_{i}', 'false').lower() == 'true'
            activity_score = float(request.form.get(f'activity_score_{i}', 0))
            activity_details = request.form.get(f'activity_details_{i}', '')
            
            if activity_inspired:
                q['_activity_inspired'] = True
                q['_activity_alignment_score'] = activity_score
                q['_activity_alignment_details'] = activity_details
            
            # MCQ-specific
            if question_type == 'mcq':
                choice_a = request.form.get(f'choice_a_{i}', '').strip()
                choice_b = request.form.get(f'choice_b_{i}', '').strip()
                choice_c = request.form.get(f'choice_c_{i}', '').strip()
                correct_choice = request.form.get(f'correct_choice_{i}', 'A').upper()
                
                if not all([choice_a, choice_b, choice_c]):
                    logger.warning(f"Skipping MCQ {i}: missing choices")
                    continue
                
                if correct_choice not in ['A', 'B', 'C']:
                    correct_choice = 'A'
                
                q['choice_a'] = choice_a
                q['choice_b'] = choice_b
                q['choice_c'] = choice_c
                q['correct_choice'] = correct_choice
                
                mcq_count += 1
            
            # Open-Ended specific
            elif question_type == 'open_ended':
                model_answer = request.form.get(f'model_answer_{i}', '').strip()
                open_ended_type = request.form.get(f'open_ended_type_{i}', 'short_answer').lower()
                evaluation_criteria = request.form.get(f'evaluation_criteria_{i}', '').strip()
                grading_rubric = request.form.get(f'grading_rubric_{i}', '').strip()
                
                if not model_answer or len(model_answer) < 10:
                    logger.warning(f"Skipping open-ended {i}: missing model answer")
                    continue
                
                criteria_list = [c.strip() for c in evaluation_criteria.split('\n') if c.strip()]
                
                q['open_ended_type'] = open_ended_type
                q['model_answer'] = model_answer
                q['evaluation_criteria'] = criteria_list
                q['grading_rubric'] = grading_rubric
                
                open_count += 1
            else:
                logger.warning(f"Skipping question {i}: unknown type")
                continue
            
            if not q.get('question') or not q.get('question_type'):
                continue
            
            questions.append(q)
        
        if len(questions) < 3:
            flash("At least 3 valid questions are required.", "danger")
            return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))
        
        # Create quiz document
        quiz_title = f"Multi-Week Quiz: Weeks {selected_weeks}"
        
        quiz_doc = Document(
            title=quiz_title,
            file_path=None,
            file_type=None,
            document_type='quiz',
            course_id=course_id,
            week_number=None,
            chapter_id=None,
            summary=f"Multi-week quiz covering weeks {selected_weeks}. "
                   f"{mcq_count} MCQ + {open_count} Open-Ended questions.",
            quiz_data=questions
        )
        
        db.session.add(quiz_doc)
        db.session.commit()
        
        logger.info(f"Saved quiz {quiz_doc.id}: {len(questions)} questions")
        
        flash(f"Quiz saved! {mcq_count} MCQ + {open_count} Open-Ended questions ready.", "success")
        return redirect(url_for('syllabus.view_course', course_id=course_id))
    
    except Exception as e:
        logger.error(f"Error approving quiz: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        flash(f"Error saving quiz: {str(e)}", "danger")
        return redirect(url_for('syllabus.multi_week_quiz_setup', course_id=course_id))

# Add these imports at the top of syllabus.py
from app.services.video_service import VideoAnalysisService, process_video_document
from flask import send_file
import threading
from datetime import timedelta

# ============================================
# SYLLABUS.PY - Add this route
# ============================================

@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/video/<int:document_id>/analyze", methods=['POST'])
@login_required
def analyze_video(course_id, week_num, document_id):
    """
    Trigger video analysis for a specific video document
    """
    logger.info(f"Starting video analysis for document {document_id}")
    
    course = Course.query.get_or_404(course_id)
    document = Document.query.get_or_404(document_id)
    
    # Permission check
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        return jsonify({"error": "Only the course teacher can analyze videos"}), 403
    
    if document.document_type != 'video' or document.course_id != course_id:
        return jsonify({"error": "Invalid video document"}), 400
    
    if not document.file_path:
        return jsonify({"error": "No video file uploaded"}), 400
    
    # Check if file exists
    video_full_path = os.path.join(current_app.config['UPLOAD_FOLDER'], document.file_path)
    if not os.path.exists(video_full_path):
        return jsonify({"error": "Video file not found"}), 404
    
    # Check if already analyzed
    if document.content_metadata:
        try:
            metadata = document.content_metadata
            if isinstance(metadata, str):
                metadata = json.loads(metadata)
            
            if metadata.get('pdf_report_path'):
                return jsonify({
                    "message": "Video already analyzed",
                    "status": "completed",
                    "pdf_url": url_for('syllabus.download_video_report', document_id=document_id)
                }), 200
        except Exception as e:
            logger.warning(f"Error checking content_metadata: {e}")
    
    try:
        logger.info("Starting background video analysis thread")
        app = current_app._get_current_object()
        
        def analyze_async():
            try:
                with app.app_context():
                    from app.services.video_service import process_video_document
                    result = process_video_document(document_id)
                    logger.info(f"Video analysis completed for document {document_id}")
            except Exception as e:
                logger.error(f"Video analysis failed: {str(e)}")
                try:
                    with app.app_context():
                        doc = Document.query.get(document_id)
                        if doc:
                            doc.content_metadata = {
                                'error': str(e),
                                'analysis_failed': True
                            }
                            db.session.commit()
                except Exception as db_error:
                    logger.error(f"Failed to update document error status: {db_error}")
        
        thread = threading.Thread(target=analyze_async)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "message": "Video analysis started. This may take 5-15 minutes.",
            "status": "processing",
            "estimated_time": "5-15 minutes"
        }), 202
        
    except Exception as e:
        logger.error(f"Failed to start analysis: {str(e)}")
        return jsonify({"error": f"Failed to start analysis: {str(e)}"}), 500


@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/video/<int:document_id>/status", methods=['GET'])
@login_required
def video_analysis_status(course_id, week_num, document_id):
    """
    Check status of video analysis
    """
    document = Document.query.get_or_404(document_id)
    
    if not document.content_metadata:
        return jsonify({"status": "not_started"}), 200
    
    try:
        metadata = document.content_metadata
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        
        # Check for error
        if metadata.get('analysis_failed') or metadata.get('error'):
            return jsonify({
                "status": "failed",
                "error": metadata.get('error', 'Analysis failed')
            }), 200
        
        # Check if completed
        if metadata.get('pdf_report_path'):
            pdf_path = metadata['pdf_report_path']
            if os.path.exists(pdf_path):
                return jsonify({
                    "status": "completed",
                    "pdf_url": url_for('syllabus.download_video_report', document_id=document_id)
                }), 200
        
        return jsonify({"status": "processing"}), 200
        
    except Exception as e:
        logger.error(f"Error checking status: {e}")
        return jsonify({"status": "processing"}), 200


@syllabus_bp.route("/video/<int:document_id>/report/download", methods=['GET'])
@login_required
def download_video_report(document_id):
    """
    Download PDF analysis report for a video
    """
    document = Document.query.get_or_404(document_id)
    course = Course.query.get_or_404(document.course_id)
    
    # Permission check
    if not (
        (current_user.is_teacher and course.teacher_id == current_user.id) or
        Enrollment.query.filter_by(student_id=current_user.id, course_id=course.id).first()
    ):
        flash("You don't have permission to access this report.", "danger")
        return redirect(url_for('courses.index'))
    
    if not document.content_metadata:
        flash("Video analysis not yet completed.", "warning")
        return redirect(url_for('syllabus.view_week_plan', 
                               course_id=document.course_id, 
                               week_num=document.week_number))
    
    metadata = document.content_metadata
    if isinstance(metadata, str):
        metadata = json.loads(metadata)
    
    pdf_path = metadata.get('pdf_report_path')
    
    if not pdf_path or not os.path.exists(pdf_path):
        flash("Report file not found.", "danger")
        return redirect(url_for('syllabus.view_week_plan', 
                               course_id=document.course_id, 
                               week_num=document.week_number))
    
    return send_file(
        pdf_path,
        as_attachment=True,
        download_name=f"video_analysis_{document.title}.pdf"
    )

# Replace your view_video_analysis route in syllabus.py

@syllabus_bp.route("/<int:course_id>/week/<int:week_num>/video/<int:document_id>/view_analysis", methods=['GET'])
@login_required
def view_video_analysis(course_id, week_num, document_id):
    """
    View video analysis details - shows Start Analysis button if not analyzed,
    or full analysis if already analyzed
    """
    from datetime import timedelta
    
    course = Course.query.get_or_404(course_id)
    document = Document.query.get_or_404(document_id)
    
    # Permission check
    if not (
        (current_user.is_teacher and course.teacher_id == current_user.id) or
        Enrollment.query.filter_by(student_id=current_user.id, course_id=course.id).first()
    ):
        flash("You don't have permission to view this analysis.", "danger")
        return redirect(url_for('courses.index'))
    
    # Check if analysis exists
    metadata = document.content_metadata
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except:
            metadata = None
    
    # If NOT analyzed, show page with "Start Analysis" button
    if not metadata or not metadata.get('analysis_complete'):
        logger.info(f"Video {document_id} not yet analyzed - showing analysis start page")
        
        # Check if analysis is in progress
        analysis_status = 'not_started'
        if metadata and metadata.get('error'):
            analysis_status = 'failed'
        elif metadata:
            analysis_status = 'processing'
        
        return render_template(
            'syllabus/video_analysis.html',
            course=course,
            week_num=week_num,
            document=document,
            metadata=metadata or {},
            timeline=[],
            pdf_available=False,
            analysis_status=analysis_status,
            get_image_base64=lambda x: None
        )
    
    # If ANALYZED, show full analysis
    logger.info(f"Video {document_id} already analyzed - showing full analysis")
    
    if not isinstance(metadata, dict):
        metadata = {}
    
    metadata.setdefault('transcription', [])
    metadata.setdefault('visual_analysis', [])
    metadata.setdefault('duration', 0)
    
    # Build timeline
    timeline = []
    
    for trans in metadata.get('transcription', []):
        timeline.append({
            'timestamp': trans.get('start', 0),
            'time_formatted': str(timedelta(seconds=trans.get('start', 0))),
            'transcription': trans.get('text', ''),
            'visual': None,
            'screenshot': None
        })
    
    for visual in metadata.get('visual_analysis', []):
        timestamp = visual.get('timestamp', 0)
        matching = next((t for t in timeline if t['timestamp'] == timestamp), None)
        if matching:
            matching['visual'] = visual.get('description', '')
            matching['screenshot'] = visual.get('screenshot_path')
        else:
            timeline.append({
                'timestamp': timestamp,
                'time_formatted': str(timedelta(seconds=timestamp)),
                'transcription': None,
                'visual': visual.get('description', ''),
                'screenshot': visual.get('screenshot_path')
            })
    
    timeline.sort(key=lambda x: x['timestamp'])
    
    def get_image_base64(image_path):
        if not image_path or not os.path.exists(image_path):
            return None
        try:
            import base64
            with open(image_path, 'rb') as f:
                return base64.b64encode(f.read()).decode('utf-8')
        except Exception as e:
            logger.error(f"Failed to load screenshot: {e}")
            return None
    
    return render_template(
        'syllabus/video_analysis.html',
        course=course,
        week_num=week_num,
        document=document,
        metadata=metadata,
        timeline=timeline,
        pdf_available=bool(metadata.get('pdf_report_path')),
        get_image_base64=get_image_base64
    )

# Add these routes to your syllabus_bp.py or routes file

@syllabus_bp.route("/<int:course_id>/tn/classify_aaa", methods=["POST"])
def tn_classify_aaa(course_id):
    from app.models import Course
    from app.services.syllabus_tn_service import SyllabusTNService

    course = Course.query.get_or_404(course_id)

    payload = request.get_json(silent=True) or {}
    extracted = payload.get("extracted")

    if not extracted:
        return jsonify({"error": "Missing extracted JSON"}), 400

    try:
        updated = SyllabusTNService.classify_chapters_sections_to_aaa(extracted)
        return jsonify({"extracted": updated})
    except Exception as e:
        current_app.logger.error(f"TN AAA classification failed: {e}")
        return jsonify({"error": str(e)}), 500


@syllabus_bp.route("/<int:course_id>/tn/extract", methods=["POST"])
@login_required
def tn_extract(course_id):
    """Extract TN syllabus, persist to DB (normalized TN tables + tn_data), and return extracted JSON."""
    from app.services.syllabus_tn_service import SyllabusTNService
    from app.routes.tn_syllabus import _get_or_create_syllabus, _persist_tn_extraction, _upload_folder
    from app.models import Chapter

    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        return jsonify({"ok": False, "error": "Unauthorized"}), 403

    syllabus = _get_or_create_syllabus(course_id)
    if not syllabus.file_path:
        return jsonify({"ok": False, "error": "No syllabus uploaded yet."}), 400

    # Use the same upload directory logic as the original TN syllabus routes.
    file_path = os.path.join(_upload_folder(), syllabus.file_path)
    file_path = os.path.normpath(file_path)
    if not os.path.exists(file_path):
        return jsonify({"ok": False, "error": "Uploaded file not found on server."}), 404

    try:
        extracted = SyllabusTNService.extract_tn_syllabus(file_path)
        extracted["__extracted_at"] = datetime.utcnow().isoformat()
        extracted["__classified"] = False

        # Validate extraction results and prepare feedback
        is_empty = not extracted or all(
            not v or (isinstance(v, (list, dict)) and len(v) == 0)
            for k, v in extracted.items()
            if not k.startswith("__")
        )

        # Check for partial extraction
        has_administrative = bool(extracted.get("administrative", {}).get("module_name"))
        has_aaa = bool(extracted.get("aaa", []))
        has_chapters = bool(extracted.get("chapters", []))
        has_aap = bool(extracted.get("aap", []))

        extraction_status = {
            "is_complete": has_administrative and has_aaa and has_chapters,
            "has_administrative": has_administrative,
            "has_aaa": has_aaa,
            "has_chapters": has_chapters,
            "has_aap": has_aap
        }

        # Log extraction status
        if is_empty:
            current_app.logger.warning("TN extraction returned empty data")
        elif not extraction_status["is_complete"]:
            current_app.logger.warning(f"TN extraction partially succeeded: {extraction_status}")
        else:
            current_app.logger.info("TN extraction fully succeeded")

        # Add extraction status to response
        extracted["__extraction_status"] = extraction_status

        _persist_tn_extraction(syllabus, extracted)

        # If the course has no Chapter rows yet, create them from TN chapters
        if course.chapters.count() == 0 and syllabus.tn_chapters:
            for ch in sorted(syllabus.tn_chapters, key=lambda x: x.index):
                db.session.add(Chapter(course_id=course_id, title=ch.title, order=ch.index))
            db.session.commit()

        return jsonify({
            "ok": True,
            "extracted": extracted,
            "status": extraction_status,
            "warning": None if extraction_status["is_complete"] else
                       "⚠️ Extraction partielle: certaines données n'ont pas pu être extraites. Vérifiez le format du syllabus."
        })
    except Exception as e:
        current_app.logger.exception("TN extraction failed")
        return jsonify({"ok": False, "error": str(e)}), 500


@syllabus_bp.route("/<int:course_id>/tn/classify_store", methods=["POST"])
@login_required
def tn_classify_store(course_id):
    """Run TN AAA classification from stored tn_data, persist the classification, and update normalized mapping."""
    from app.services.syllabus_tn_service import SyllabusTNService
    from app.routes.tn_syllabus import _get_or_create_syllabus, _persist_tn_extraction

    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        return jsonify({"ok": False, "error": "Unauthorized"}), 403

    syllabus = _get_or_create_syllabus(course_id)
    extracted = syllabus.tn_data or {}
    if not extracted:
        return jsonify({"ok": False, "error": "No extracted TN data found. Run extraction first."}), 400

    try:
        updated = SyllabusTNService.classify_chapters_sections_to_aaa(extracted)
        # Merge classification into the main chapters list so _persist_tn_extraction can map AA links.
        classification = (updated.get("aaa_classification") or {})
        if isinstance(classification, dict) and classification.get("chapters"):
            updated["chapters"] = classification.get("chapters")
        updated["__classified"] = True
        updated["__classified_at"] = datetime.utcnow().isoformat()

        _persist_tn_extraction(syllabus, updated)
        return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("TN AAA classification failed")
        return jsonify({"ok": False, "error": str(e)}), 500


@syllabus_bp.route("/<int:course_id>/bga/build_chapters", methods=["POST"])
@login_required
def bga_build_chapters(course_id):
    """Create Chapter rows from the BGA weekly plan (if not already present)."""
    from app.models import Chapter

    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        return jsonify({"ok": False, "error": "Unauthorized"}), 403

    syllabus = SyllabusService.get_syllabus_by_course(course_id)
    if not syllabus or not syllabus.weekly_plan:
        return jsonify({"ok": False, "error": "No weekly plan found. Run extraction first."}), 400

    if course.chapters.count() > 0:
        return jsonify({"ok": True, "skipped": True})

    try:
        for w in syllabus.weekly_plan:
            week_num = w.get("Week#")
            topic = w.get("Topic") or f"Week {week_num}" if week_num else "Week"
            order = int(week_num) if week_num else (course.chapters.count() + 1)
            db.session.add(Chapter(course_id=course_id, title=str(topic), order=order))
        db.session.commit()
        return jsonify({"ok": True})
    except Exception as e:
        db.session.rollback()
        current_app.logger.exception("Failed to build chapters from weekly plan")
        return jsonify({"ok": False, "error": str(e)}), 500
