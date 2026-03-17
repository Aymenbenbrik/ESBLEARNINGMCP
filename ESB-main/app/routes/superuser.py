from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_required, current_user
from app import db, csrf
from app.models import User, TeacherStudent, Classe, Program, Course
from functools import wraps

# Create a blueprint for superuser management
superuser = Blueprint('superuser', __name__)

# Custom decorator to check if the current user is a superuser
def superuser_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_superuser:
            flash('You need superuser privileges to access this page.', 'danger')
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function

@superuser.route('/dashboard')
@login_required
@superuser_required
def dashboard():
    """Superuser dashboard"""
    users_count = User.query.count()
    teachers_count = User.query.filter_by(is_teacher=True).count()
    students_count = User.query.filter_by(is_teacher=False).count()
    classes_count = Classe.query.count()
    
    return render_template('superuser/dashboard.html', 
                           users_count=users_count, 
                           teachers_count=teachers_count, 
                           students_count=students_count,
                           classes_count=classes_count)

@superuser.route('/users')
@login_required
@superuser_required
def list_users():
    """List all users"""
    users = User.query.all()
    return render_template('superuser/users.html', users=users)

@superuser.route('/create_user', methods=['GET', 'POST'])
@login_required
@superuser_required
def create_user():
    """Create a new user"""
    # Get all classes for the form
    classes = Classe.query.all()
    
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        is_teacher = 'is_teacher' in request.form
        is_superuser = 'is_superuser' in request.form
        class_id = request.form.get('class_id', type=int)
        
        # Check if username or email already exists
        if User.query.filter_by(username=username).first():
            flash('Username already exists', 'danger')
            return render_template('superuser/create_user.html', classes=classes)
            
        if User.query.filter_by(email=email).first():
            flash('Email already exists', 'danger')
            return render_template('superuser/create_user.html', classes=classes)
        
        # Create user
        user = User(
            username=username,
            email=email,
            is_teacher=is_teacher,
            is_superuser=is_superuser,
            class_id=class_id if class_id and not is_teacher else None,
            is_first_login =1
  # Only assign class to students
        )
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        flash(f'User {username} created successfully', 'success')
        return redirect(url_for('superuser.list_users'))
        
    return render_template('superuser/create_user.html', classes=classes)

@superuser.route('/edit_user/<int:user_id>', methods=['GET', 'POST'])
@login_required
@superuser_required
def edit_user(user_id):
    """Edit an existing user"""
    user = User.query.get_or_404(user_id)
    classes = Classe.query.all()
    
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        is_teacher = 'is_teacher' in request.form
        is_superuser = 'is_superuser' in request.form
        password = request.form.get('password')
        class_id = request.form.get('class_id', type=int)
        
        # Check if username already exists for another user
        existing_user = User.query.filter_by(username=username).first()
        if existing_user and existing_user.id != user_id:
            flash('Username already exists', 'danger')
            return render_template('superuser/edit_user.html', user=user, classes=classes)
            
        # Check if email already exists for another user
        existing_user = User.query.filter_by(email=email).first()
        if existing_user and existing_user.id != user_id:
            flash('Email already exists', 'danger')
            return render_template('superuser/edit_user.html', user=user, classes=classes)
        
        # Update user
        user.username = username
        user.email = email
        user.is_teacher = is_teacher
        user.is_superuser = is_superuser
        
        # Only assign class to students
        if not is_teacher:
            user.class_id = class_id
        else:
            user.class_id = None
        
        if password:
            user.set_password(password)
        
        db.session.commit()
        
        flash(f'User {username} updated successfully', 'success')
        return redirect(url_for('superuser.list_users'))
        
    return render_template('superuser/edit_user.html', user=user, classes=classes)

@superuser.route('/delete_user/<int:user_id>', methods=['POST'])
@login_required
@superuser_required
def delete_user(user_id):
    """Delete a user"""
    user = User.query.get_or_404(user_id)
    
    # Don't allow deleting self
    if user.id == current_user.id:
        flash('You cannot delete your own account', 'danger')
        return redirect(url_for('superuser.list_users'))
    
    username = user.username
    db.session.delete(user)
    db.session.commit()
    
    flash(f'User {username} deleted successfully', 'success')
    return redirect(url_for('superuser.list_users'))

# Classes Management

@superuser.route('/classes')
@login_required
@superuser_required
def list_classes():
    """List all classes"""
    classes = Classe.query.all()
    return render_template('superuser/classes.html', classes=classes)

@superuser.route('/create_class', methods=['GET', 'POST'])
@login_required
@superuser_required
def create_class():
    """Create a new class (optionally inside a formation/program)."""
    programs = Program.query.order_by(Program.name.asc()).all()
    if request.method == 'POST':
        name = request.form.get('name')
        description = request.form.get('description')
        program_id = request.form.get('program_id', type=int)
        academic_year = request.form.get('academic_year')
        
        # Check if class name already exists
        if Classe.query.filter_by(name=name).first():
            flash('Class name already exists', 'danger')
            return render_template('superuser/create_Classe.html')
        
        # Create class
        class_obj = Classe(name=name, description=description, program_id=program_id or None, academic_year=academic_year or None)
        db.session.add(class_obj)
        db.session.commit()
        
        flash(f'Class {name} created successfully', 'success')
        return redirect(url_for('superuser.list_classes'))
        
    return render_template('superuser/create_classe.html', programs=programs)

@superuser.route('/edit_class/<int:class_id>', methods=['GET', 'POST'])
@login_required
@superuser_required
def edit_class(class_id):
    """Edit an existing class"""
    class_obj = Classe.query.get_or_404(class_id)
    programs = Program.query.order_by(Program.name.asc()).all()
    
    if request.method == 'POST':
        name = request.form.get('name')
        description = request.form.get('description')
        program_id = request.form.get('program_id', type=int)
        academic_year = request.form.get('academic_year')
        
        # Check if class name already exists for another class
        existing_class = Classe.query.filter_by(name=name).first()
        if existing_class and existing_class.id != class_id:
            flash('Class name already exists', 'danger')
            return render_template('superuser/edit_class.html', class_obj=class_obj, programs=programs)
        
        # Update class
        class_obj.name = name
        class_obj.description = description
        class_obj.program_id = program_id or None
        class_obj.academic_year = academic_year or None
        db.session.commit()
        
        flash(f'Class {name} updated successfully', 'success')
        return redirect(url_for('superuser.list_classes'))
        
    return render_template('superuser/edit_class.html', class_obj=class_obj, programs=programs)




@superuser.route('/delete_class/<int:class_id>', methods=['POST'])
@login_required
@superuser_required
def delete_class(class_id):
    """Delete a class"""
    class_obj = Classe.query.get_or_404(class_id)
    
    # Check if class has students
    if User.query.filter_by(class_id=class_id).count() > 0:
        flash('Cannot delete class with assigned students', 'danger')
        return redirect(url_for('superuser.list_classes'))
    
    class_name = class_obj.name
    db.session.delete(class_obj)
    db.session.commit()
    
    flash(f'Class {class_name} deleted successfully', 'success')
    return redirect(url_for('superuser.list_classes'))

# Enhanced Relationships Management

@superuser.route('/relationships')
@login_required
@superuser_required
def list_relationships():
    """List all teacher-student relationships"""
    relationships = TeacherStudent.query.all()
    teachers = User.query.filter_by(is_teacher=True).all()
    classes = Classe.query.all()
    
    # Get count of students for each class
    class_student_counts = {}
    for class_obj in classes:
        class_student_counts[class_obj.id] = User.query.filter_by(class_id=class_obj.id, is_teacher=False).count()
    
    return render_template('superuser/relationships.html', 
                           relationships=relationships,
                           teachers=teachers,
                           classes=classes,
                           class_student_counts=class_student_counts)

@superuser.route('/class_students/<int:class_id>', endpoint='class_students_api')
@login_required
@superuser_required
def class_students_api(class_id):
    """Get students for a specific class (for AJAX loading)"""
    students = User.query.filter_by(class_id=class_id, is_teacher=False).all()
    return jsonify([{
        'id': student.id,
        'username': student.username,
        'email': student.email
    } for student in students])

@superuser.route('/search_students')
@login_required
@superuser_required
def search_students():
    """Search students by username or email (for AJAX search)"""
    search_term = request.args.get('term', '')
    if not search_term:
        return jsonify([])
    
    # Search for students (non-teachers) by username or email
    students = User.query.filter(
        User.is_teacher == False,
        (User.username.ilike(f'%{search_term}%') | User.email.ilike(f'%{search_term}%'))
    ).limit(20).all()
    
    return jsonify([{
        'id': student.id,
        'username': student.username,
        'email': student.email,
        'class_name': student.classe.name if student.classe else 'No Class'
    } for student in students])


@superuser.route('/add_relationship', methods=['POST'])
@login_required
@superuser_required
def add_relationship():
    """Add a teacher-student relationship (individual or bulk)"""
    teacher_id = request.form.get('teacher_id', type=int)
    
    # Check the type of assignment (individual, class, or search-based)
    assignment_type = request.form.get('assignment_type')
    
    teacher = User.query.get(teacher_id)
    if not teacher or not teacher.is_teacher:
        flash('Invalid teacher selected', 'danger')
        return redirect(url_for('superuser.list_relationships'))
    
    success_count = 0
    error_count = 0
    
    if assignment_type == 'individual':
        # Individual student assignment
        student_id = request.form.get('student_id', type=int)
        student = User.query.get(student_id)
        
        if not student or student.is_teacher:
            flash('Invalid student selected', 'danger')
            return redirect(url_for('superuser.list_relationships'))
        
        # Check if relationship already exists
        if TeacherStudent.query.filter_by(teacher_id=teacher_id, student_id=student_id).first():
            flash('Relationship already exists', 'danger')
            return redirect(url_for('superuser.list_relationships'))
        
        # Create relationship
        relationship = TeacherStudent(teacher_id=teacher_id, student_id=student_id)
        db.session.add(relationship)
        db.session.commit()
        
        flash(f'Teacher-student relationship added successfully: {teacher.username} - {student.username}', 'success')
    
    elif assignment_type == 'class':
        # Class-based assignment
        class_id = request.form.get('class_id', type=int)
        class_obj = Classe.query.get(class_id)
        
        if not class_obj:
            flash('Invalid class selected', 'danger')
            return redirect(url_for('superuser.list_relationships'))
        
        # Get all students in the class
        students = User.query.filter_by(class_id=class_id, is_teacher=False).all()
        
        for student in students:
            # Check if relationship already exists
            if not TeacherStudent.query.filter_by(teacher_id=teacher_id, student_id=student.id).first():
                link = TeacherStudent(teacher_id=teacher_id, student_id=student.id)
                db.session.add(link)
                success_count += 1
            else:
                error_count += 1
        
        if success_count > 0:
            db.session.commit()
            flash(f'Added {success_count} students from class {class_obj.name} to teacher {teacher.username}', 'success')
        
        if error_count > 0:
            flash(f'{error_count} students were already assigned to this teacher', 'info')
    
    elif assignment_type == 'search':
        # Search-based multi-student assignment
        selected_students = request.form.getlist('selected_students')
        
        if not selected_students:
            flash('No students selected', 'danger')
            return redirect(url_for('superuser.list_relationships'))
        
        for student_id in selected_students:
            student = User.query.get(int(student_id))
            
            if student and not student.is_teacher:
                # Check if relationship already exists
                if not TeacherStudent.query.filter_by(teacher_id=teacher_id, student_id=student.id).first():
                    link = TeacherStudent(teacher_id=teacher_id, student_id=student.id)
                    db.session.add(link)
                    success_count += 1
                else:
                    error_count += 1
        
        if success_count > 0:
            db.session.commit()
            flash(f'Added {success_count} selected students to teacher {teacher.username}', 'success')
        
        if error_count > 0:
            flash(f'{error_count} students were already assigned to this teacher', 'info')
    
    return redirect(url_for('superuser.list_relationships'))

@superuser.route('/delete_relationship', methods=['POST'])
@login_required
@superuser_required
def delete_relationship():
    """Delete a teacher-student relationship"""
    teacher_id = request.form.get('teacher_id', type=int)
    student_id = request.form.get('student_id', type=int)
    
    relationship = TeacherStudent.query.filter_by(teacher_id=teacher_id, student_id=student_id).first_or_404()
    
    db.session.delete(relationship)
    db.session.commit()
    
    flash('Teacher-student relationship removed successfully', 'success')
    return redirect(url_for('superuser.list_relationships'))

# API endpoints for AJAX requests
@superuser.route('/api/users')
@login_required
@superuser_required
def api_list_users():
    """API endpoint to list all users"""
    users = User.query.all()
    return jsonify([{
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'is_teacher': user.is_teacher,
        'is_superuser': user.is_superuser,
        'class_id': user.class_id,
        'class_name': user.classe.name if user.classe else None
    } for user in users])


# -------------------------------------------------------------------
# Programs (Formations) Management
# -------------------------------------------------------------------

@superuser.route('/programs')
@login_required
@superuser_required
def list_programs():
    programs = Program.query.order_by(Program.created_at.desc()).all()
    return render_template('superuser/programs.html', programs=programs)


@superuser.route('/programs/create', methods=['GET', 'POST'])
@login_required
@superuser_required
def create_program():
    if request.method == 'POST':
        name = (request.form.get('name') or '').strip()
        description = request.form.get('description')
        if not name:
            flash('Program name is required', 'danger')
            return render_template('superuser/program_form.html', program=None)
        if Program.query.filter_by(name=name).first():
            flash('A program with this name already exists', 'danger')
            return render_template('superuser/program_form.html', program=None)
        p = Program(name=name, description=description)
        db.session.add(p)
        db.session.commit()
        flash('Program created', 'success')
        return redirect(url_for('superuser.view_program', program_id=p.id))
    return render_template('superuser/program_form.html', program=None)


@superuser.route('/programs/<int:program_id>/edit', methods=['GET', 'POST'])
@login_required
@superuser_required
def edit_program(program_id):
    p = Program.query.get_or_404(program_id)
    if request.method == 'POST':
        name = (request.form.get('name') or '').strip()
        description = request.form.get('description')
        if not name:
            flash('Program name is required', 'danger')
            return render_template('superuser/program_form.html', program=p)
        existing = Program.query.filter_by(name=name).first()
        if existing and existing.id != p.id:
            flash('A program with this name already exists', 'danger')
            return render_template('superuser/program_form.html', program=p)
        p.name = name
        p.description = description
        db.session.commit()
        flash('Program updated', 'success')
        return redirect(url_for('superuser.view_program', program_id=p.id))
    return render_template('superuser/program_form.html', program=p)


@superuser.route('/programs/<int:program_id>/delete', methods=['POST'])
@login_required
@superuser_required
def delete_program(program_id):
    p = Program.query.get_or_404(program_id)
    # Detach courses to avoid constraint issues
    p.courses = []
    db.session.delete(p)
    db.session.commit()
    flash('Program deleted', 'success')
    return redirect(url_for('superuser.list_programs'))


@superuser.route('/programs/<int:program_id>')
@login_required
@superuser_required
def view_program(program_id):
    p = Program.query.get_or_404(program_id)
    teachers = User.query.filter_by(is_teacher=True).order_by(User.username.asc()).all()
    # Courses already linked to program
    program_courses = list(p.courses)
    # Classes under program
    program_classes = Classe.query.filter_by(program_id=p.id).order_by(Classe.created_at.desc()).all()
    return render_template(
        'superuser/program_detail.html',
        program=p,
        teachers=teachers,
        program_courses=program_courses,
        program_classes=program_classes,
    )


@superuser.route('/programs/<int:program_id>/courses/create', methods=['POST'])
@login_required
@superuser_required
def program_create_course(program_id):
    p = Program.query.get_or_404(program_id)
    title = (request.form.get('title') or '').strip()
    description = request.form.get('description')
    teacher_id = request.form.get('teacher_id', type=int)
    if not title or not teacher_id:
        flash('Course title and teacher are required', 'danger')
        return redirect(url_for('superuser.view_program', program_id=p.id))
    teacher = User.query.get(teacher_id)
    if not teacher or not teacher.is_teacher:
        flash('Invalid teacher', 'danger')
        return redirect(url_for('superuser.view_program', program_id=p.id))

    course = Course(title=title, description=description, teacher_id=teacher_id)
    db.session.add(course)
    db.session.flush()
    p.courses.append(course)
    db.session.commit()
    flash('Course created and added to program', 'success')
    return redirect(url_for('superuser.view_program', program_id=p.id))


@superuser.route('/programs/<int:program_id>/classes/create', methods=['POST'])
@login_required
@superuser_required
def program_create_class(program_id):
    p = Program.query.get_or_404(program_id)
    name = (request.form.get('name') or '').strip()
    academic_year = (request.form.get('academic_year') or '').strip()
    description = request.form.get('description')
    if not name:
        flash('Class name is required', 'danger')
        return redirect(url_for('superuser.view_program', program_id=p.id))
    c = Classe(name=name, description=description, program_id=p.id, academic_year=academic_year or None)
    db.session.add(c)
    db.session.commit()
    flash('Class created in program', 'success')
    return redirect(url_for('superuser.view_program', program_id=p.id))


@superuser.route('/classes/<int:class_id>/students', methods=['GET', 'POST'])
@login_required
@superuser_required
def class_students(class_id):
    class_obj = Classe.query.get_or_404(class_id)
    students = User.query.filter_by(is_teacher=False).order_by(User.username.asc()).all()
    if request.method == 'POST':
        selected_ids = request.form.getlist('student_ids')
        # Clear existing assignments
        User.query.filter_by(class_id=class_obj.id, is_teacher=False).update({User.class_id: None})
        # Assign selected
        if selected_ids:
            User.query.filter(User.id.in_([int(x) for x in selected_ids]), User.is_teacher == False).update({User.class_id: class_obj.id}, synchronize_session=False)
        db.session.commit()
        flash('Students updated', 'success')
        return redirect(url_for('superuser.view_program', program_id=class_obj.program_id) if class_obj.program_id else url_for('superuser.list_classes'))
    current_student_ids = {u.id for u in User.query.filter_by(class_id=class_obj.id, is_teacher=False).all()}
    return render_template('superuser/class_students.html', class_obj=class_obj, students=students, current_student_ids=current_student_ids)


@superuser.route('/api/teachers')
@login_required
@superuser_required
def api_list_teachers():
    """API endpoint to list all teachers"""
    teachers = User.query.filter_by(is_teacher=True).all()
    return jsonify([{
        'id': teacher.id,
        'username': teacher.username,
        'email': teacher.email,
        'is_superuser': teacher.is_superuser
    } for teacher in teachers])

@superuser.route('/api/students')
@login_required
@superuser_required
def api_list_students():
    """API endpoint to list all students"""
    students = User.query.filter_by(is_teacher=False).all()
    return jsonify([{
        'id': student.id,
        'username': student.username,
        'email': student.email,
        'class_id': student.class_id,
        'class_name': student.classe.name if student.classe else None
    } for student in students])


@superuser.route('/api/classes')
@login_required
@superuser_required
def api_list_classes():
    """API endpoint to list all classes"""
    classes = Classe.query.all()
    return jsonify([{
        'id': class_obj.id,
        'name': class_obj.name,
        'description': class_obj.description,
        'student_count': User.query.filter_by(class_id=class_obj.id, is_teacher=False).count()
    } for class_obj in classes])