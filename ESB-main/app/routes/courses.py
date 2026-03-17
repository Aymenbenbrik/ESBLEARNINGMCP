from flask import Blueprint, render_template, redirect, url_for, flash, request, abort, current_app
from flask_login import current_user, login_required
from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField, SubmitField
from wtforms.validators import DataRequired, Length
from flask_wtf.file import FileField, FileAllowed
from werkzeug.utils import secure_filename
import os
from datetime import datetime
from app.models import Course, Chapter, Enrollment, User, Document, Quiz
from app import db
from app.services.syllabus_service import SyllabusService
import logging


def _compute_tn_aa_distribution(syllabus):
    """Compute a simple, logical "importance" score for TN acquis (AA).

    We approximate teaching emphasis by frequency:
    - each section link counts as 1
    - each chapter-level link counts as 0.5 (coarser)
    The result is normalized into percentages.
    """
    if not syllabus or not getattr(syllabus, 'tn_aa', None):
        return []

    rows = []
    for aa in syllabus.tn_aa:
        sec_count = len(getattr(aa, 'section_links', []) or [])
        chap_count = len(getattr(aa, 'chapter_links', []) or [])
        weight = float(sec_count) + 0.5 * float(chap_count)
        rows.append({
            'number': int(aa.number),
            'label': f"AA {int(aa.number)}",
            'description': aa.description or '',
            'sections_count': sec_count,
            'chapters_count': chap_count,
            'weight': weight,
        })

    total = sum(r['weight'] for r in rows) or 1.0
    for r in rows:
        r['percent'] = round((r['weight'] / total) * 100.0, 1)

    rows.sort(key=lambda x: (-x['percent'], x['number']))
    return rows

logger = logging.getLogger(__name__)

courses_bp = Blueprint('courses', __name__, url_prefix='/courses')

# Forms
class CourseForm(FlaskForm):
    title = StringField('Title', validators=[DataRequired(), Length(min=3, max=100)])
    description = TextAreaField('Description', validators=[Length(max=500)])
    submit = SubmitField('Save Course')


class ModuleAttachmentForm(FlaskForm):
    title = StringField('Title', validators=[DataRequired(), Length(min=3, max=100)])
    file = FileField(
        'File',
        validators=[
            DataRequired(),
            FileAllowed(
                ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'zip', 'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'],
                'Invalid file type!'
            )
        ]
    )
    submit = SubmitField('Upload')

@courses_bp.route('/')
@login_required
def index():
    if current_user.is_teacher:
        # Teachers see courses they created
        courses = Course.query.filter_by(teacher_id=current_user.id).order_by(Course.created_at.desc()).all()
        available_courses = None
    else:
        # Students see courses they're enrolled in
        enrollments = Enrollment.query.filter_by(student_id=current_user.id).all()
        courses = [enrollment.course for enrollment in enrollments]
        
        # Get teacher IDs for teachers associated with this student
        try:
            # Get teachers for this student via the relationship
            teachers = current_user.teachers.all()
            teacher_ids = [teacher.id for teacher in teachers]
            
            # If relationship fails, try direct query to the association table
            if not teacher_ids:
                from sqlalchemy import text
                result = db.session.execute(text(
                    "SELECT teacher_id FROM teacher_student WHERE student_id = :student_id"
                ), {"student_id": current_user.id}).fetchall()
                teacher_ids = [row[0] for row in result]
            
            # Get enrolled course IDs
            enrolled_course_ids = [enrollment.course_id for enrollment in enrollments]
            
            # Get available courses from associated teachers that student isn't enrolled in yet
            available_courses = Course.query.filter(
                Course.teacher_id.in_(teacher_ids),
                ~Course.id.in_(enrolled_course_ids) if enrolled_course_ids else True
            ).all()
        except Exception as e:
            logger.error(f"Error getting available courses: {e}")
            available_courses = []
    
    return render_template('courses/index.html', 
                          title='Courses',
                          courses=courses,
                          available_courses=available_courses)

@courses_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create():
    # Only teachers can create courses
    if not current_user.is_teacher:
        flash('Only teachers can create courses.', 'warning')
        return redirect(url_for('courses.index'))
    
    form = CourseForm()
    if form.validate_on_submit():
        course = Course(
            title=form.title.data,
            description=form.description.data,
            teacher_id=current_user.id
        )
        db.session.add(course)
        db.session.commit()
        
        flash(f'Course "{course.title}" has been created!', 'success')
        return redirect(url_for('courses.view', course_id=course.id))
    
    return render_template('courses/create.html', title='Create Course', form=form)

# ============================================================
# MAIN VIEW ROUTE - Works for both teachers and students
# ============================================================

@courses_bp.route('/<int:course_id>')
@login_required
def view(course_id):
    """
    View course - renders different templates for teachers vs students.
    ✅ NOW shows quiz completion status for students
    ✅ Shows syllabus and quizzes for both
    """
    course = Course.query.get_or_404(course_id)
    
    # Check access
    is_teacher = current_user.is_teacher and course.teacher_id == current_user.id
    is_student = not current_user.is_teacher and Enrollment.query.filter_by(
        student_id=current_user.id, course_id=course_id).first()
    
    if not is_teacher and not is_student:
        flash('You need to enroll in this course first.', 'warning')
        return redirect(url_for('courses.enroll', course_id=course_id))
    
    # ✅ ALWAYS query syllabus - both teachers and students might need it
    syllabus = SyllabusService.get_syllabus_by_course(course_id)

    # TN: compute AA importance distribution (for UI + TN quiz setup)
    tn_aa_distribution = []
    try:
        if syllabus and (syllabus.syllabus_type or '').lower() == 'tn':
            tn_aa_distribution = _compute_tn_aa_distribution(syllabus)
    except Exception as _e:
        tn_aa_distribution = []

    # Chapters (used in the new unified course UI)
    chapters = course.chapters.order_by(Chapter.order).all() if course.chapters else []

    # Module-level attachments (course_id set, no chapter/week)
    module_attachments = Document.query.filter_by(
        course_id=course_id,
        chapter_id=None,
        week_number=None,
        document_type='module_attachment'
    ).order_by(Document.created_at.desc()).all()

    # TN course-level exams (DS/Test/Examen)
    tn_exams = Document.query.filter_by(
        course_id=course_id,
        document_type='tn_exam'
    ).order_by(Document.created_at.desc()).all()

    # Evaluation targets (used by the "Évaluer les examens" section)
    evaluation_targets = []
    try:
        if syllabus and (syllabus.syllabus_type or '').lower() == 'bga' and syllabus.weekly_plan:
            for w in syllabus.weekly_plan:
                wn = w.get('Week#')
                if wn:
                    evaluation_targets.append({'type': 'week', 'number': int(wn), 'label': f"Semaine {int(wn)}"})
        elif syllabus and (syllabus.syllabus_type or '').lower() == 'tn' and chapters:
            for ch in chapters:
                evaluation_targets.append({'type': 'chapter', 'number': int(ch.order), 'label': f"Chapitre {ch.order}"})
    except Exception as _e:
        evaluation_targets = []
    
    # ✅ ALWAYS query multi-week quizzes
    course_quizzes_raw = Document.query.filter_by(
        course_id=course_id,
        document_type='quiz',
        week_number=None  # Only multi-week quizzes
    ).order_by(Document.created_at.desc()).all()
    
    logger.debug(f"View course {course_id}: is_teacher={is_teacher}, has_syllabus={syllabus is not None}, quizzes={len(course_quizzes_raw)}")
    
    # ============================================================
    # TEACHER VIEW
    # ============================================================
    if is_teacher:
        return render_template(
            'courses/view.html',
            course=course,
            syllabus=syllabus,
            course_quizzes=course_quizzes_raw,
            chapters=chapters,
            module_attachments=module_attachments,
            tn_exams=tn_exams,
            evaluation_targets=evaluation_targets,
            tn_aa_distribution=tn_aa_distribution
        )
    
    # ============================================================
    # STUDENT VIEW - WITH QUIZ STATUS ENRICHMENT
    # ============================================================
    else:
        # ✅ ENRICH each quiz with student status
        course_quizzes = []
        student_progress = {
            'quizzes_completed': 0,
            'quizzes_total': len(course_quizzes_raw),
            'assignments_submitted': 0,
            'assignments_total': 0
        }
        
        for quiz_doc in course_quizzes_raw:
            # Get student's quiz for this document
            student_quiz = Quiz.query.filter_by(
                document_id=quiz_doc.id,
                student_id=current_user.id
            ).first()
            
            quiz_info = {
                'document': quiz_doc,
                'student_completed': False,
                'student_score': None,
                'quiz_id': None
            }
            
            if student_quiz:
                quiz_info['quiz_id'] = student_quiz.id
                
                # Check if completed
                if student_quiz.completed_at is not None:
                    quiz_info['student_completed'] = True
                    quiz_info['student_score'] = student_quiz.score
                    student_progress['quizzes_completed'] += 1
                    logger.debug(f"Quiz {quiz_doc.id}: COMPLETED ({student_quiz.score}%)")
                else:
                    logger.debug(f"Quiz {quiz_doc.id}: IN PROGRESS")
            else:
                logger.debug(f"Quiz {quiz_doc.id}: NOT STARTED")
            
            course_quizzes.append(quiz_info)
        
        logger.debug(f"Student progress: {student_progress['quizzes_completed']}/{student_progress['quizzes_total']} quizzes")
        
        return render_template(
            'courses/student_view.html',
            course=course,
            syllabus=syllabus,
            course_quizzes=course_quizzes,  # ✅ Enriched with status
            student_progress=student_progress,
            tn_aa_distribution=tn_aa_distribution
        )


@courses_bp.route('/<int:course_id>/module/upload', methods=['GET', 'POST'])
@login_required
def upload_module_attachment(course_id):
    """Upload a module-level file (not attached to a specific chapter)."""
    course = Course.query.get_or_404(course_id)

    if not current_user.is_teacher or course.teacher_id != current_user.id:
        flash('Access denied. Teachers only.', 'danger')
        return redirect(url_for('courses.view', course_id=course_id))

    form = ModuleAttachmentForm()
    if form.validate_on_submit():
        f = form.file.data
        filename = secure_filename(f.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        # Save under the main uploads folder (flat filename with a prefix)
        uploads_dir = current_app.config.get('UPLOAD_FOLDER') or os.path.join(current_app.root_path, 'uploads')
        os.makedirs(uploads_dir, exist_ok=True)
        unique_name = f"course_{course_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{filename}"
        full_path = os.path.join(uploads_dir, unique_name)
        f.save(full_path)

        doc = Document(
            title=form.title.data,
            file_path=unique_name,
            file_type=ext,
            document_type='module_attachment',
            course_id=course_id
        )
        db.session.add(doc)
        db.session.commit()

        # Trigger document processing
        if ext == 'pdf':
            try:
                from app.services.document_pipeline import process_pdf_document
                # Run synchronously for now to ensure availability
                process_pdf_document(
                    pdf_path=full_path,
                    document_id=doc.id,
                    document_name=filename,
                    extract_images=True
                )
                flash('Module file uploaded and processed successfully.', 'success')
            except Exception as e:
                current_app.logger.error(f"Error processing document {doc.id}: {e}")
                flash('File uploaded but processing failed.', 'warning')
        else:
            flash('Module file uploaded successfully.', 'success')

        return redirect(url_for('courses.view', course_id=course_id))

    return render_template('courses/upload_module.html', course=course, form=form)

@courses_bp.route('/<int:course_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(course_id):
    course = Course.query.get_or_404(course_id)
    
    # Only the teacher who created the course can edit it
    if course.teacher_id != current_user.id:
        abort(403)
    
    form = CourseForm()
    if form.validate_on_submit():
        course.title = form.title.data
        course.description = form.description.data
        db.session.commit()
        
        flash(f'Course "{course.title}" has been updated!', 'success')
        return redirect(url_for('courses.view', course_id=course.id))
    
    # Pre-populate form with existing data
    if request.method == 'GET':
        form.title.data = course.title
        form.description.data = course.description
    
    return render_template('courses/create.html', 
                          title=f'Edit {course.title}',
                          form=form, 
                          course=course)

@courses_bp.route('/<int:course_id>/delete', methods=['POST'])
@login_required
def delete(course_id):
    course = Course.query.get_or_404(course_id)
    
    # Only the teacher who created the course can delete it
    if course.teacher_id != current_user.id:
        abort(403)
    
    title = course.title
    db.session.delete(course)
    db.session.commit()
    
    flash(f'Course "{title}" has been deleted!', 'success')
    return redirect(url_for('courses.index'))

@courses_bp.route('/<int:course_id>/enroll', methods=['GET', 'POST'])
@login_required
def enroll(course_id):
    # Only students can enroll in courses
    if current_user.is_teacher:
        flash('Teachers cannot enroll in courses.', 'warning')
        return redirect(url_for('courses.index'))
    
    course = Course.query.get_or_404(course_id)
    teacher = User.query.get(course.teacher_id)
    
    if not teacher:
        flash('Error: Course has no assigned teacher.', 'danger')
        return redirect(url_for('courses.index'))
    
    # Check if the student is associated with the teacher
    is_associated = False
    try:
        # Try using the relationship method if available
        if hasattr(teacher, 'has_student'):
            is_associated = teacher.has_student(current_user)
        
        # If relationship check fails, try a direct query to the association table
        if not is_associated:
            from sqlalchemy import text
            result = db.session.execute(text(
                "SELECT 1 FROM teacher_student WHERE teacher_id = :teacher_id AND student_id = :student_id"
            ), {"teacher_id": teacher.id, "student_id": current_user.id}).fetchone()
            
            is_associated = result is not None
        
        if not is_associated:
            flash('You cannot enroll in this course. Please contact the teacher.', 'danger')
            return redirect(url_for('courses.index'))
    except Exception as e:
        logger.error(f"Error checking teacher-student relationship: {e}")
    
    # Check if already enrolled
    existing_enrollment = Enrollment.query.filter_by(
        student_id=current_user.id, 
        course_id=course_id
    ).first()
    
    if existing_enrollment:
        flash(f'You are already enrolled in "{course.title}".', 'info')
        return redirect(url_for('courses.view', course_id=course_id))
    
    # Process enrollment
    if request.method == 'POST':
        enrollment = Enrollment(
            student_id=current_user.id,
            course_id=course_id
        )
        db.session.add(enrollment)
        db.session.commit()
        
        flash(f'You have successfully enrolled in "{course.title}"!', 'success')
        return redirect(url_for('courses.view', course_id=course_id))
    
    return render_template('courses/enroll.html', title='Enroll in Course', course=course)