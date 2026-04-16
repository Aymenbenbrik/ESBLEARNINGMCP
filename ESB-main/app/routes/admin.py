from __future__ import annotations

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import login_required, current_user

from app import db
from app.models import Program, Classe, Course, User, Enrollment, ClassCourseAssignment


admin_bp = Blueprint('admin', __name__, url_prefix='/admin')


def _superuser_required():
    if not getattr(current_user, 'is_superuser', False):
        flash("Accès refusé.", "danger")
        return False
    return True


@admin_bp.route('/')
@login_required
def index():
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    programs = Program.query.order_by(Program.id.desc()).all()
    return render_template('admin/index.html', programs=programs)


@admin_bp.route('/programs/create', methods=['POST'])
@login_required
def program_create():
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    name = (request.form.get('name') or '').strip()
    year = (request.form.get('year') or '').strip()
    if not name:
        flash('Nom de formation requis.', 'warning')
        return redirect(url_for('admin.index'))
    p = Program(name=name)
    db.session.add(p)
    db.session.commit()
    flash('Formation créée.', 'success')
    return redirect(url_for('admin.program_view', program_id=p.id))


@admin_bp.route('/programs/<int:program_id>')
@login_required
def program_view(program_id: int):
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    program = Program.query.get_or_404(program_id)
    all_courses = Course.query.order_by(Course.title.asc()).all()
    return render_template(
        'admin/program_view.html',
        program=program,
        all_courses=all_courses,
        classes=Classe.query.filter_by(program_id=program.id).order_by(Classe.academic_year.asc(), Classe.name.asc()).all(),
    )


@admin_bp.route('/programs/<int:program_id>/courses/add', methods=['POST'])
@login_required
def program_add_course(program_id: int):
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    program = Program.query.get_or_404(program_id)
    course_id = request.form.get('course_id', type=int)
    if not course_id:
        flash('Choisis un cours.', 'warning')
        return redirect(url_for('admin.program_view', program_id=program.id))
    course = Course.query.get_or_404(course_id)
    if course not in program.courses:
        program.courses.append(course)
        db.session.commit()
        flash('Cours ajouté à la formation.', 'success')
    return redirect(url_for('admin.program_view', program_id=program.id))


@admin_bp.route('/programs/<int:program_id>/courses/<int:course_id>/duplicate', methods=['POST'])
@login_required
def program_duplicate_course(program_id: int, course_id: int):
    """Clone a course row and attach it to the program.

    Keeps it simple (title/syllabus_path/description). Chapters/quizzes are not duplicated.
    """
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    program = Program.query.get_or_404(program_id)
    src = Course.query.get_or_404(course_id)
    clone = Course(
        title=f"{src.title} (copy)",
        description=src.description,
        teacher_id=src.teacher_id,
    )
    db.session.add(clone)
    db.session.flush()
    program.courses.append(clone)
    db.session.commit()
    flash('Cours dupliqué dans la formation.', 'success')
    return redirect(url_for('admin.program_view', program_id=program.id))


@admin_bp.route('/programs/<int:program_id>/classes/create', methods=['POST'])
@login_required
def program_create_class(program_id: int):
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    program = Program.query.get_or_404(program_id)
    name = (request.form.get('name') or '').strip()
    year = request.form.get('year', type=int)
    if not name:
        flash('Nom de classe requis.', 'warning')
        return redirect(url_for('admin.program_view', program_id=program.id))
    c = Classe(name=name, academic_year=year, program_id=program.id)
    db.session.add(c)
    db.session.commit()
    flash('Classe créée.', 'success')
    return redirect(url_for('admin.class_view', class_id=c.id))


@admin_bp.route('/classes/<int:class_id>')
@login_required
def class_view(class_id: int):
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    classe = Classe.query.get_or_404(class_id)
    program = Program.query.get(classe.program_id) if classe.program_id else None
    teachers = User.query.filter_by(is_teacher=True).order_by(User.username.asc()).all()
    students = User.query.filter_by(is_teacher=False, is_superuser=False).order_by(User.username.asc()).all()

    # Courses available from the program (so we can assign teacher per course for this class)
    program_courses = list(program.courses) if program else []
    existing = {(a.course_id): a for a in classe.course_assignments}
    return render_template(
        'admin/class_view.html',
        classe=classe,
        program=program,
        program_courses=program_courses,
        teachers=teachers,
        students=students,
        existing_assignments=existing,
        enrolled_student_ids={e.student_id for e in Enrollment.query.filter_by(class_id=classe.id).all()},
    )


@admin_bp.route('/classes/<int:class_id>/assign-teachers', methods=['POST'])
@login_required
def class_assign_teachers(class_id: int):
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    classe = Classe.query.get_or_404(class_id)

    # Expect fields like teacher_for_<course_id>
    for key, value in request.form.items():
        if not key.startswith('teacher_for_'):
            continue
        course_id = int(key.replace('teacher_for_', ''))
        teacher_id = int(value) if value else None
        if not teacher_id:
            continue
        assignment = ClassCourseAssignment.query.filter_by(class_id=classe.id, course_id=course_id).first()
        if assignment:
            assignment.teacher_id = teacher_id
        else:
            db.session.add(ClassCourseAssignment(class_id=classe.id, course_id=course_id, teacher_id=teacher_id))

    db.session.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# Skills Analytics Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

@admin_bp.route('/skills/analytics')
@login_required
def skills_analytics():
    """Skills execution analytics dashboard."""
    if not _superuser_required():
        return redirect(url_for('courses.index'))

    days = request.args.get('days', 30, type=int)
    if days not in (7, 30, 90):
        days = 30

    from app.services.skill_manager import SkillManager
    from app.models.skills import SkillExecution, Skill

    stats = SkillManager().get_usage_stats(days=days)
    recent = (
        SkillExecution.query
        .order_by(SkillExecution.started_at.desc())
        .limit(20)
        .all()
    )
    skills_map = {s.id: s.name for s in Skill.query.all()}

    return render_template(
        'admin/skills_analytics.html',
        stats=stats,
        recent=recent,
        skills=skills_map,
        days=days,
    )


@admin_bp.route('/agents/traces')
@login_required
def agent_traces():
    """ReAct agent trace observability dashboard."""
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    return render_template('admin/agent_traces.html')


@admin_bp.route('/classes/<int:class_id>/students', methods=['POST'])
@login_required
def class_update_students(class_id: int):
    if not _superuser_required():
        return redirect(url_for('courses.index'))
    classe = Classe.query.get_or_404(class_id)
    selected_ids = request.form.getlist('student_ids')
    selected_ids = {int(x) for x in selected_ids if str(x).isdigit()}

    current = {e.student_id for e in Enrollment.query.filter_by(class_id=classe.id).all()}
    to_add = selected_ids - current
    to_remove = current - selected_ids

    for sid in to_add:
        db.session.add(Enrollment(student_id=sid, course_id=None, class_id=classe.id))
        user = User.query.get(sid)
        if user:
            user.class_id = classe.id

    for sid in to_remove:
        Enrollment.query.filter_by(class_id=classe.id, student_id=sid).delete()
        user = User.query.get(sid)
        if user and user.class_id == classe.id:
            user.class_id = None

    db.session.commit()
    flash('Étudiants mis à jour.', 'success')
    return redirect(url_for('admin.class_view', class_id=classe.id))
