import os
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, send_from_directory, current_app, abort
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from werkzeug.exceptions import NotFound
from datetime import datetime
from app import db
from app.models import Document, Course, Syllabus  
from app.services.evaluate_service import extract_text_from_file, analyze_exam_content
from app.services.syllabus_service import SyllabusService

# TN exam evaluation (course-level exams)
from app.services.tn_exam_evaluation_service import analyze_tn_exam
from app.services.tn_exam_report_service import generate_tn_exam_report_pdf
from app.services.tn_latex_report_service import generate_tn_latex_report, validate_exam


evaluate_bp = Blueprint('evaluate', __name__, url_prefix='/evaluate')

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

from flask_wtf import FlaskForm
from flask_wtf.file import FileField, FileRequired, FileAllowed
from wtforms import StringField, SubmitField, SelectField
from wtforms.validators import Length

class ExamUploadForm(FlaskForm):
    title = StringField('Title', validators=[Length(max=100)], render_kw={'placeholder': 'Optional title for the exam (e.g., "Week 1 Midterm")'})
    file = FileField('Exam File', validators=[
        FileRequired(),
        FileAllowed(['pdf', 'doc', 'docx'], 'PDF, DOC, or DOCX files only!')
    ])
    submit = SubmitField('Upload Exam')


class TNExamUploadForm(FlaskForm):
    title = StringField('Titre', validators=[Length(max=120)], render_kw={'placeholder': 'Ex: DS1, Test 2, Examen final'})
    exam_type = SelectField(
        'Type',
        choices=[('test', 'Test'), ('ds', 'DS'), ('exam', 'Examen'), ('other', 'Autre')],
        default='test'
    )
    file = FileField('Fichier', validators=[
        FileRequired(),
        FileAllowed(['pdf', 'doc', 'docx'], 'PDF, DOC, ou DOCX uniquement')
    ])
    submit = SubmitField('Ajouter')




@evaluate_bp.route('/<int:course_id>/week/<int:week_num>/evaluate_exam', methods=['GET'])
@login_required
def evaluate_exam(course_id, week_num):
    course = Course.query.get_or_404(course_id)

    # Check teacher permission (example)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        flash('Access denied.', 'error')
        return redirect(url_for('courses.index'))

    # Get the exam document for this course and week
    exam_document = Document.query.filter_by(
        course_id=course_id,
        week_number=week_num,
        document_type='exam'
    ).first()

    # Prepare clos_info dictionary for CLO descriptions
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    clo_data = syllabus.clo_data if syllabus else []

    return render_template('evaluate/evaluate_exam.html',
                        course_id=course_id,
                        week_num=week_num,
                        exam_document=exam_document,
                        clo_data=clo_data)



@login_required
@evaluate_bp.route('/<int:course_id>/week/<int:week_num>/upload_exam', methods=['GET', 'POST'])
def upload_exam(course_id, week_num):
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        flash('Access denied. Teachers only.', 'error')
        return redirect(url_for('courses.index'))

    form = ExamUploadForm()
    if form.validate_on_submit():
        file = form.file.data
        filename = secure_filename(file.filename)
        if not allowed_file(filename):
            flash('Invalid file type. Allowed: PDF, DOC, DOCX.', 'error')
            return render_template('evaluate/upload_exam.html', form=form, course=course, course_id=course_id, week_num=week_num)

        os.makedirs(os.path.join(current_app.root_path, UPLOAD_FOLDER), exist_ok=True)
        filepath = os.path.join(current_app.root_path, UPLOAD_FOLDER, filename)
        file.save(filepath)

        exam_document = Document.query.filter_by(
            course_id=course_id,
            week_number=week_num,
            document_type='exam'
        ).first()

        if exam_document:
            exam_document.title = form.title.data or filename
            exam_document.file_path = os.path.join(UPLOAD_FOLDER, filename)
            exam_document.file_type = filename.rsplit('.', 1)[1].lower()
            exam_document.updated_at = datetime.utcnow()
            exam_document.analysis_results = None
        else:
            exam_document = Document(
                title=form.title.data or filename,
                file_path=os.path.join(UPLOAD_FOLDER, filename),
                file_type=filename.rsplit('.', 1)[1].lower(),
                document_type='exam',
                course_id=course_id,
                week_number=week_num
            )
            db.session.add(exam_document)

        db.session.commit()
        flash('Exam uploaded successfully!', 'success')
        return redirect(url_for('evaluate.evaluate_exam', course_id=course_id, week_num=week_num))

    return render_template('evaluate/upload_exam.html', form=form, course=course, course_id=course_id, week_num=week_num)

from app.services.evaluate_service import generate_exam_analysis_pdf

@login_required
@evaluate_bp.route('/<int:course_id>/week/<int:week_num>/analyze_exam', methods=['POST'])
def analyze_exam(course_id, week_num):
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        return jsonify({'error': 'Access denied.'}), 403

    exam_document = Document.query.filter_by(
        course_id=course_id,
        week_number=week_num,
        document_type='exam'
    ).first()

    if not exam_document or not exam_document.file_path:
        return jsonify({'error': 'No exam file found.'}), 404

    try:
        full_filepath = os.path.join(current_app.root_path, exam_document.file_path)
        print(f"DEBUG: Full exam filepath: {full_filepath}")  # Debug file existence
        if not os.path.exists(full_filepath):
            return jsonify({'error': 'Exam file not found on disk.'}), 404

        extracted_text = extract_text_from_file(full_filepath)
        if not extracted_text:
            return jsonify({'error': 'Failed to extract text from exam file.'}), 500
        print(f"DEBUG: Extracted text length: {len(extracted_text)}")  # Debug text extraction

        # IMPROVED: Build cumulative week_data, taught_clos, objectives_summary from syllabus
        syllabus = Syllabus.query.filter_by(course_id=course_id).first()
        week_data = {}
        taught_clos = set()
        objectives_summary = []
        
        if syllabus and syllabus.weekly_plan:
            try:
                # Parse weekly_plan flexibly (str -> JSON, list -> dict by week, dict as-is)
                if isinstance(syllabus.weekly_plan, str):
                    parsed_plan = json.loads(syllabus.weekly_plan)
                    print(f"DEBUG: weekly_plan parsed from str to type: {type(parsed_plan)}")  # Debug
                else:
                    parsed_plan = syllabus.weekly_plan
                    print(f"DEBUG: weekly_plan type (raw): {type(parsed_plan)}")  # Debug
                
                print(f"DEBUG: weekly_plan sample content: {parsed_plan[:2] if isinstance(parsed_plan, list) else list(parsed_plan.items())[:2]}")  # Debug sample
                
                if isinstance(parsed_plan, dict):
                    # Dict format: {"1": {...}, "2": {...}}
                    weekly_plan = parsed_plan
                elif isinstance(parsed_plan, list):
                    # List format: [{"week": 1, "objectives": "...", "CLOs": [1]}, ...]
                    # Convert to dict keyed by week
                    weekly_plan = {}
                    for week_item in parsed_plan:
                        week_key = str(week_item.get('week') or week_item.get('week_num') or len(weekly_plan) + 1)  # Flexible key
                        weekly_plan[week_key] = {
                            'objectives': week_item.get('objectives', f'Semaine {week_key}: Objectifs non définis.'),
                            'CLOs': week_item.get('CLOs', [])  # Assume list of CLOs
                        }
                    print(f"DEBUG: Converted list to dict with keys: {list(weekly_plan.keys())}")  # Debug
                else:
                    raise ValueError(f"Unsupported weekly_plan format: {type(parsed_plan)}")
                
                # Now build cumulative data (weeks 1 to week_num)
                for w in range(1, week_num + 1):
                    week_key = str(w)
                    week_info = weekly_plan.get(week_key, {})
                    week_data[w] = week_info
                    objectives_summary.append(week_info.get('objectives', f'Semaine {w}: Objectifs non définis dans le syllabus.'))
                    if 'CLOs' in week_info:
                        taught_clos.update(week_info['CLOs'])  # Add to cumulative set (handle if CLOs are str/int)
                        taught_clos = {str(c) for c in taught_clos}  # Normalize to str
                
                print(f"DEBUG: Parsed weekly_plan keys up to week {week_num}: {list(week_data.keys())}")  # Debug
                
            except (json.JSONDecodeError, ValueError, KeyError) as parse_error:
                logger.warning(f"Error parsing weekly_plan for course {course_id}: {parse_error}. Using fallback.")
                parsed_plan = None
        else:
            logger.warning(f"No syllabus or weekly_plan for course {course_id}. Using fallback.")
            parsed_plan = None
        
        # Fallback if parsing failed or no CLOs
        if not taught_clos or not objectives_summary:
            num_taught = max(1, week_num // 2)  # e.g., week 6: CLOs 1-3
            taught_clos = set(str(i) for i in range(1, num_taught + 1))
            objectives_summary = [f'Semaine {w}: Introduction aux concepts CLO{w} (fallback, syllabus incomplet).' for w in range(1, week_num + 1)]
            week_data = {w: {'objectives': objectives_summary[w-1], 'CLOs': [w] if w <= num_taught else []} for w in range(1, week_num + 1)}
            print(f"DEBUG: Applied fallback - taught_clos: {taught_clos}, objectives count: {len(objectives_summary)}")  # Debug
        
        # Global CLOs as reference (but taught are cumulative)
        global_clos = [clo['CLO#'] for clo in (syllabus.clo_data or [])] if syllabus else []
        print(f"DEBUG: Syllabus global CLOs: {global_clos}")
        print(f"DEBUG: Cumulative taught CLOs up to week {week_num}: {taught_clos}")
        print(f"DEBUG: Objectives summary (first 2): {objectives_summary[:2]}")
        print(f"DEBUG: Week data keys: {list(week_data.keys())}")  # Debug week data

        # Analyze content (pass new params)
        # In analyze_exam route
        analysis_results = analyze_exam_content(
            extracted_text, 
            course_id=course.id, 
            week_num=week_num,  # FIXED: Add this
            course_title=course.title
        )

        if 'error' in analysis_results:
            return jsonify({'error': analysis_results['error']}), 500
        print(f"DEBUG: Analysis results keys: {list(analysis_results.keys())}")  # Debug analysis

        # Save analysis results in DB
        exam_document.analysis_results = analysis_results
        exam_document.updated_at = datetime.utcnow()
        db.session.commit()

        # Generate PDF report path
        pdf_filename = f"exam_analysis_{course.title}_week{week_num}.pdf"
        reports_dir = os.path.join(current_app.root_path, 'uploads', 'reports')
        os.makedirs(reports_dir, exist_ok=True)
        pdf_output_path = os.path.join(reports_dir, pdf_filename)
        print(f"DEBUG: PDF output path: {pdf_output_path}")  # Debug path

        # Generate PDF report with error handling
        try:
            print("DEBUG: Starting PDF generation...")  # Debug
            generate_exam_analysis_pdf(course, week_num, exam_document, analysis_results, week_data, pdf_output_path)
            print("DEBUG: PDF generation completed.")  # Debug
        except Exception as pdf_error:
            print(f"ERROR in PDF generation: {pdf_error}")  # Debug
            import traceback
            print(traceback.format_exc())  # Full error trace
            return jsonify({'error': f'PDF generation failed: {str(pdf_error)}'}), 500

        # Verify file was created
        if os.path.exists(pdf_output_path) and os.path.getsize(pdf_output_path) > 0:
            print(f"DEBUG: PDF created successfully (size: {os.path.getsize(pdf_output_path)} bytes)")  # Debug
        else:
            print(f"ERROR: PDF not created or empty at {pdf_output_path}")  # Debug
            return jsonify({'error': 'PDF generation failed - file not created.'}), 500

        # Save PDF path in DB
        exam_document.analysis_report_path = f"uploads/reports/{pdf_filename}"
        db.session.commit()

        return jsonify({'success': True, 'results': analysis_results, 'report_pdf': exam_document.analysis_report_path})

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Exam analysis failed: {e}")
        import traceback
        print(f"FULL ERROR TRACEBACK:\n{traceback.format_exc()}")  # Catch-all debug
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500


@login_required
@evaluate_bp.route('/download_exam/<filename>')
def download_exam(filename):
    if not current_user.is_teacher:
        raise NotFound('File not found.')

    try:
        # Extract just filename if path was passed (security)
        safe_filename = filename.split('/')[-1] if '/' in filename else filename
        return send_from_directory(os.path.join(current_app.root_path, UPLOAD_FOLDER), safe_filename)
    except NotFound:
        flash('File not found.', 'error')
        return redirect(url_for('courses.index'))

@evaluate_bp.route('/download_report/<filename>')
@login_required
def download_report(filename):
    if not current_user.is_teacher:
        abort(403)
    try:
        return send_from_directory(os.path.join(current_app.root_path, 'uploads', 'reports'), filename, as_attachment=True, download_name=filename)
    except NotFound:
        flash('Report not found.', 'error')
        return redirect(url_for('courses.index'))


# ======================================================================
# TN EXAMS (course-level) — upload + evaluate + PDF report
# ======================================================================


@evaluate_bp.get('/tn/exams')
@login_required
def tn_exams_home():
    """Landing page for TN exams.

    The course-specific TN exams page requires a course_id.
    This landing page lets teachers pick a course, avoiding
    template url_for build errors in global navigation.
    """
    if not getattr(current_user, 'is_teacher', False):
        abort(403)

    courses = Course.query.filter_by(teacher_id=current_user.id).order_by(Course.title.asc()).all()

    # Attach TN exam counts for quick overview
    course_rows = []
    for c in courses:
        count = Document.query.filter_by(course_id=c.id, document_type='tn_exam').count()
        course_rows.append({
            'course': c,
            'exam_count': count,
        })

    return render_template('evaluate/tn_exams_home.html', course_rows=course_rows)


@evaluate_bp.route('/<int:course_id>/tn/exams', methods=['GET', 'POST'])
@login_required
def tn_exams(course_id):
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        abort(403)

    form = TNExamUploadForm()
    if form.validate_on_submit():
        f = form.file.data
        filename = secure_filename(f.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        rel_dir = os.path.join('tn_exams', str(course.id))
        abs_dir = os.path.join(current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads'), rel_dir)
        os.makedirs(abs_dir, exist_ok=True)
        stamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        stored_name = f"{stamp}_{filename}"
        abs_path = os.path.join(abs_dir, stored_name)
        f.save(abs_path)

        rel_path = os.path.join(rel_dir, stored_name).replace('\\', '/')

        doc = Document(
            title=form.title.data or stored_name,
            file_path=rel_path,
            file_type=ext,
            document_type='tn_exam',
            course_id=course.id,
        )
        doc.content_metadata = (doc.content_metadata or {})
        doc.content_metadata.update({"exam_type": form.exam_type.data})
        db.session.add(doc)
        db.session.commit()

        flash('Examen ajouté. Vous pouvez maintenant lancer l\'évaluation.', 'success')
        return redirect(url_for('evaluate.tn_exam_view', course_id=course.id, document_id=doc.id))

    exams = Document.query.filter_by(course_id=course.id, document_type='tn_exam').order_by(Document.created_at.desc()).all()
    return render_template('evaluate/tn_exams.html', course=course, exams=exams, form=form)


@evaluate_bp.route('/<int:course_id>/tn/exams/<int:document_id>', methods=['GET', 'POST'])
@login_required
def tn_exam_view(course_id, document_id):
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        abort(403)

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        abort(404)

    if request.method == 'POST':
        # Run analysis
        try:
            analysis = analyze_tn_exam(course, doc)
            doc.analysis_results = analysis

            # Generate PDF report
            uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
            report_rel_dir = os.path.join('reports', 'tn_exams', str(course.id))
            report_abs_dir = os.path.join(uploads_dir, report_rel_dir)
            os.makedirs(report_abs_dir, exist_ok=True)
            report_filename = f"tn_exam_{doc.id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.pdf"
            report_abs_path = os.path.join(report_abs_dir, report_filename)
            generate_tn_exam_report_pdf(
                output_path=report_abs_path,
                course_title=course.title,
                exam_title=doc.title,
                analysis=analysis,
            )
            doc.analysis_report_path = os.path.join(report_rel_dir, report_filename).replace('\\', '/')
            db.session.commit()
            flash('Évaluation terminée. Rapport PDF généré.', 'success')
        except Exception as e:
            current_app.logger.exception('TN exam evaluation failed')
            flash(f"Échec de l\'évaluation: {str(e)}", 'danger')
        return redirect(url_for('evaluate.tn_exam_view', course_id=course.id, document_id=doc.id))

    validation = None
    verdict_ok = None
    if doc.analysis_results:
        validation = validate_exam(doc.analysis_results)
        verdict_ok = all(v['status'] != 'FAIL' for v in validation)

    return render_template(
        'evaluate/tn_exam_view.html',
        course=course,
        exam=doc,
        validation=validation,
        verdict_ok=verdict_ok,
    )


# ── Save manual edits to analysis results ─────────────────────────────────────
@evaluate_bp.post('/<int:course_id>/tn/exams/<int:document_id>/save_analysis')
@login_required
def tn_exam_save_analysis(course_id, document_id):
    """Save teacher-edited metadata and question attributes into analysis_results."""
    from sqlalchemy.orm.attributes import flag_modified
    from collections import Counter

    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        abort(403)

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        abort(404)

    data = request.get_json(silent=True) or {}
    ar = dict(doc.analysis_results or {})

    if 'exam_metadata' in data:
        ar['exam_metadata'] = data['exam_metadata']

    if 'questions' in data:
        ar['questions'] = data['questions']
        qs = ar['questions']
        total = len(qs) or 1

        # Recompute derived statistics from updated questions
        bloom_c = Counter(q.get('Bloom_Level', 'Unknown') for q in qs)
        diff_c  = Counter(q.get('Difficulty', 'Moyen') for q in qs)
        aa_c: dict = {}
        for q in qs:
            for a in (q.get('AA#') or []):
                aa_c[str(a)] = aa_c.get(str(a), 0) + 1

        ar['total_questions']         = total
        ar['bloom_percentages']       = {k: round(v/total*100, 1) for k, v in bloom_c.items()}
        ar['difficulty_percentages']  = {k: round(v/total*100, 1) for k, v in diff_c.items()}
        ar['aa_percentages']          = {k: round(v/total*100, 1) for k, v in aa_c.items()}

        pts = [q.get('points') for q in qs if q.get('points') is not None]
        ar['total_max_points'] = round(sum(pts), 2) if pts else None

        # Recompute time analysis with updated questions
        if ar.get('exam_metadata', {}).get('declared_duration_min'):
            from app.services.tn_exam_evaluation_service import _build_time_analysis
            ar['time_analysis'] = _build_time_analysis(
                qs, ar['exam_metadata']['declared_duration_min']
            )

    doc.analysis_results = ar
    flag_modified(doc, 'analysis_results')
    db.session.commit()

    return jsonify({'ok': True, 'message': 'Modifications sauvegardées.'})


@evaluate_bp.get('/<int:course_id>/tn/exams/<int:document_id>/report')
@login_required
def tn_exam_download_report(course_id, document_id):
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        abort(403)
    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        abort(404)
    if not doc.analysis_report_path:
        abort(404)

    uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
    rel = doc.analysis_report_path
    directory = os.path.join(uploads_dir, os.path.dirname(rel))
    filename = os.path.basename(rel)
    return send_from_directory(directory, filename, as_attachment=True, download_name=filename)


# ======================================================================
# TN EXAM — LaTeX/PDF validation report (fills rapport examen officiel.tex)
# ======================================================================

@evaluate_bp.get('/<int:course_id>/tn/exams/<int:document_id>/latex_report')
@login_required
def tn_exam_latex_report(course_id, document_id):
    """Generate a filled LaTeX/PDF evaluation report for a TN exam.

    Requires the exam to have been analysed first (analysis_results must exist).
    Returns the compiled PDF if pdflatex is available, otherwise the .tex source.
    Also stores the 8-criterion validation results in the document metadata.
    """
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        abort(403)

    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        abort(404)

    if not doc.analysis_results:
        flash("Veuillez d'abord lancer l'évaluation de l'examen avant de générer le rapport LaTeX.", "warning")
        return redirect(url_for('evaluate.tn_exam_view', course_id=course_id, document_id=document_id))

    uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
    report_dir = os.path.join(uploads_dir, 'reports', 'tn_exams', str(course.id), 'latex')
    os.makedirs(report_dir, exist_ok=True)

    stamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    safe_title = "".join(c if c.isalnum() or c in "-_" else "_" for c in (doc.title or "exam"))[:30]
    tex_name = f"rapport_{safe_title}_{stamp}.tex"
    tex_path = os.path.join(report_dir, tex_name)

    try:
        tex_path, pdf_path, validation_results = generate_tn_latex_report(
            analysis=doc.analysis_results,
            course_title=course.title,
            output_tex_path=tex_path,
            compile_pdf=True,
        )

        # Persist validation results and report paths in document metadata
        meta = doc.content_metadata or {}
        meta['latex_validation'] = validation_results
        meta['latex_report_tex'] = os.path.relpath(tex_path, uploads_dir).replace('\\', '/')
        if pdf_path:
            meta['latex_report_pdf'] = os.path.relpath(pdf_path, uploads_dir).replace('\\', '/')
        doc.content_metadata = meta
        db.session.commit()

        if pdf_path and os.path.exists(pdf_path):
            return send_from_directory(
                os.path.dirname(pdf_path),
                os.path.basename(pdf_path),
                as_attachment=True,
                download_name=f"rapport_evaluation_{safe_title}.pdf",
            )
        else:
            # Fallback: send the .tex source
            return send_from_directory(
                os.path.dirname(tex_path),
                os.path.basename(tex_path),
                as_attachment=True,
                download_name=f"rapport_evaluation_{safe_title}.tex",
                mimetype='text/plain; charset=utf-8',
            )

    except Exception as e:
        current_app.logger.exception('LaTeX report generation failed')
        flash(f"Échec de la génération du rapport : {str(e)}", 'danger')
        return redirect(url_for('evaluate.tn_exam_view', course_id=course_id, document_id=document_id))


@evaluate_bp.get('/<int:course_id>/tn/exams/<int:document_id>/validation_json')
@login_required
def tn_exam_validation_json(course_id, document_id):
    """Return the 8-criterion validation results as JSON (for UI consumption)."""
    course = Course.query.get_or_404(course_id)
    if not current_user.is_teacher or course.teacher_id != current_user.id:
        abort(403)
    doc = Document.query.get_or_404(document_id)
    if doc.course_id != course.id or doc.document_type != 'tn_exam':
        abort(404)
    if not doc.analysis_results:
        return jsonify({'error': 'Analyse non encore effectuée.'}), 400

    validation = validate_exam(doc.analysis_results)
    summary = {
        'total': len(validation),
        'pass': sum(1 for v in validation if v['status'] == 'PASS'),
        'warning': sum(1 for v in validation if v['status'] == 'WARNING'),
        'fail': sum(1 for v in validation if v['status'] == 'FAIL'),
    }
    return jsonify({'validation': validation, 'summary': summary})

