from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, current_user, login_required
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField, SelectField, TextAreaField
from wtforms.validators import DataRequired, Email, EqualTo, ValidationError, Length
import re
from datetime import datetime
from sqlalchemy import text

from app import db
from app.models import User
from app.models import UserSession, Enrollment,TeacherStudent

auth_bp = Blueprint('auth', __name__)

# Forms
class LoginForm(FlaskForm):
    username = StringField('Username or Email', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Sign In')

class RegistrationForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired()])
    password2 = PasswordField(
        'Repeat Password', validators=[DataRequired(), EqualTo('password')])
    role = SelectField('Role', choices=[('student', 'Student'), ('teacher', 'Teacher')])
    submit = SubmitField('Register')

    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user is not None:
            raise ValidationError('Please use a different username.')

    def validate_email(self, email):
        user = User.query.filter_by(email=email.data).first()
        if user is not None:
            raise ValidationError('Please use a different email address.')

class ChangePasswordForm(FlaskForm):
    current_password = PasswordField('Current Password', validators=[DataRequired()])
    new_password = PasswordField('New Password', validators=[
        DataRequired(),
        Length(min=8, message='Password must be at least 8 characters long')
    ])
    confirm_password = PasswordField(
        'Confirm New Password', 
        validators=[DataRequired(), EqualTo('new_password', message='Passwords must match')]
    )
    submit = SubmitField('Change Password')

class AddStudentForm(FlaskForm):
    student_emails = TextAreaField('Student Emails (one per line)', validators=[DataRequired()])
    submit = SubmitField('Add Students')


class UpdateGoogleAPIKeyForm(FlaskForm):
    api_key = StringField('Google API Key', validators=[
        DataRequired(),
        Length(min=20, max=100, message='API key must be between 20 and 100 characters')
    ])
    submit = SubmitField('Update API Key')
# Helper function to generate a password from an email
def generate_password_from_email(email):
    # Get the first part of the email (before @)
    name_part = email.split('@')[0]
    
    # Extract the first name (if there's a dot in the name part)
    if '.' in name_part:
        first_name = name_part.split('.')[0]
    else:
        first_name = name_part
    
    # Capitalize the first letter
    first_name = first_name.capitalize()
    
    # Generate a password in the format: FirstName@123
    password = f"{first_name}@123"
    
    return password


# Routes
@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('courses.index'))
    
    form = LoginForm()
    if form.validate_on_submit():
        # Try to find user by username or email
        user = User.query.filter_by(username=form.username.data).first()
        if user is None:
            user = User.query.filter_by(email=form.username.data).first()
            
        if user is None or not user.check_password(form.password.data):
            flash('Invalid username/email or password', 'danger')
            return redirect(url_for('auth.login'))
        
        login_user(user, remember=form.remember_me.data)
        
        # Record login session
        user_session = UserSession(
            user_id=user.id,
            ip_address=request.remote_addr,
            user_agent=request.user_agent.string if request.user_agent else None
        )
        db.session.add(user_session)
        db.session.commit()
        
        # Check if it's the first login (using auto-generated password)
        if user.is_first_login:
            flash('Please change your password.', 'warning')
            return redirect(url_for('auth.change_password'))
        
        next_page = request.args.get('next')
        if not next_page or not next_page.startswith('/'):
            next_page = url_for('courses.index')
        
        flash('Login successful!', 'success')
        return redirect(next_page)
    
    return render_template('auth/login.html', title='Sign In', form=form)


@auth_bp.route('/', methods=['GET', 'POST'])
def loginn():
    if current_user.is_authenticated:
        return redirect(url_for('courses.index'))
    
    form = LoginForm()
    if form.validate_on_submit():
        # Try to find user by username or email
        user = User.query.filter_by(username=form.username.data).first()
        if user is None:
            user = User.query.filter_by(email=form.username.data).first()
            
        if user is None or not user.check_password(form.password.data):
            flash('Invalid username/email or password', 'danger')
            return redirect(url_for('auth.login'))
        
        login_user(user, remember=form.remember_me.data)
        
        # Record login session
        user_session = UserSession(
            user_id=user.id,
            ip_address=request.remote_addr,
            user_agent=request.user_agent.string if request.user_agent else None
        )
        db.session.add(user_session)
        db.session.commit()
        
        # Check if it's the first login (using auto-generated password)
        if user.is_first_login:
            flash('Please change your password.', 'warning')
            return redirect(url_for('auth.change_password'))
        
        next_page = request.args.get('next')
        if not next_page or not next_page.startswith('/'):
            next_page = url_for('courses.index')
        
        flash('Login successful!', 'success')
        return redirect(next_page)
    
    return render_template('auth/login.html', title='Sign In', form=form)

@auth_bp.route('/logout')
def logout():
    if current_user.is_authenticated:
        # Find active session and record logout
        active_session = UserSession.query.filter_by(
            user_id=current_user.id,
            logout_time=None
        ).order_by(UserSession.login_time.desc()).first()
        
        if active_session:
            active_session.record_logout()
            db.session.commit()
    
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('auth.login'))

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('courses.index'))
    
    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(
            username=form.username.data, 
            email=form.email.data,
            is_first_login=False  # User created their own account, no need to force password change
        )
        user.set_password(form.password.data)
        user.is_teacher = (form.role.data == 'teacher')
        
        db.session.add(user)
        db.session.commit()
        
        flash('Congratulations, you are now a registered user!', 'success')
        return redirect(url_for('auth.login'))
    
    return render_template('auth/register.html', title='Register', form=form)



@auth_bp.route('/test_api_key_update')
@login_required
def test_api_key_update():
    try:
        # Try direct SQL update
        from sqlalchemy import text
        with db.engine.connect() as conn:
            result = conn.execute(
                text("UPDATE user SET google_api_key = 'test_key_123' WHERE id = :user_id"),
                {"user_id": current_user.id}
            )
            conn.commit()
        
        # Check if it worked
        with db.engine.connect() as conn:
            result = conn.execute(
                text("SELECT google_api_key FROM user WHERE id = :user_id"),
                {"user_id": current_user.id}
            )
            row = result.fetchone()
            key_value = row[0] if row else "No result"
        
        return f"Update attempted. Current value in DB: {key_value}"
    except Exception as e:
        return f"Error: {str(e)}"
    
@auth_bp.route('/change_password', methods=['GET', 'POST'])
@login_required
def change_password():
    form = ChangePasswordForm()
    if form.validate_on_submit():
        if not current_user.check_password(form.current_password.data):
            flash('Current password is incorrect', 'danger')
            return redirect(url_for('auth.change_password'))
        
        # Password validation
        password = form.new_password.data
        if len(password) < 8:
            flash('Password must be at least 8 characters long', 'danger')
            return redirect(url_for('auth.change_password'))
        
        # Set the new password
        current_user.set_password(form.new_password.data)
        
        # If this was first login, update the flag
        if current_user.is_first_login:
            current_user.is_first_login = False
        
        db.session.commit()
        flash('Your password has been updated successfully', 'success')
        
        return redirect(url_for('auth.update_api_key'))
    
    return render_template('auth/change_password.html', title='Change Password', form=form)

@auth_bp.route('/add_students', methods=['GET', 'POST'])
@login_required
def add_students():
    """Redirect to manage_students"""
    return redirect(url_for('auth.manage_students'))

@auth_bp.route('/update_api_key', methods=['GET', 'POST'])
@login_required
def update_api_key():
    form = UpdateGoogleAPIKeyForm()
    
    print(f"Current user: {current_user.id}, Current API key: {current_user.google_api_key}")
    
    # Pre-fill the form with existing API key if available
    if request.method == 'GET' and current_user.google_api_key:
        form.api_key.data = current_user.google_api_key
    
    if form.validate_on_submit():
        try:
            
            print(f"Form submitted, new API key: {form.api_key.data}")
            current_user.google_api_key = form.api_key.data
            db.session.commit()
            print("Database commit successful")
            
            # Directly verify from database
            from sqlalchemy import text
            with db.engine.connect() as conn:
                result = conn.execute(text(f"SELECT google_api_key FROM user WHERE id = {current_user.id}"))
                row = result.fetchone()
                print(f"Direct DB check after commit: {row[0] if row else 'No result'}")
            
            # Refresh user from database to ensure up-to-date
            db.session.refresh(current_user)
            print(f"After refresh - Current API key: {current_user.google_api_key}")
            
            flash('Your API key has been updated successfully', 'success')
            return redirect(url_for('auth.profile'))
        except Exception as e:
            db.session.rollback()
            print(f"Error: {str(e)}")
            flash(f'Error updating API key: {str(e)}', 'danger')
    
    return render_template('auth/update_api_key.html', title='Update API Key', form=form)

@auth_bp.route('/profile')
@login_required
def profile():
    return render_template('auth/profile.html', title='Profile')

@auth_bp.route('/manage_students', methods=['GET', 'POST'])
@login_required
def manage_students():
    """Page to add and manage students"""
    if not current_user.is_teacher:
        flash('Access denied. Teacher permissions required.', 'danger')
        return redirect(url_for('courses.index'))
    
    form = AddStudentForm()
    
    # Handle form submission for adding students
    if form.validate_on_submit():
        emails = form.student_emails.data.strip().split('\n')
        added_count = 0
        skipped_count = 0
        existing_count = 0
        
        for email in emails:
            email = email.strip()
            if not email:
                continue
                
            # Check if the email is valid
            if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
                flash(f'Invalid email: {email}', 'warning')
                continue
            
            # Check if user already exists
            existing_user = User.query.filter_by(email=email).first()
            
            if existing_user:
                # If user exists, check if they're already associated with this teacher
                if current_user.has_student(existing_user):
                    skipped_count += 1
                    continue
                
                # If they exist but aren't associated with this teacher, add the association
                if existing_user.is_teacher:
                    # Skip if the user is a teacher
                    skipped_count += 1
                    continue
                
                # Use the model object to add the relationship
                try:
                    teacher_student = TeacherStudent(
                        teacher_id=current_user.id,
                        student_id=existing_user.id
                    )
                    db.session.add(teacher_student)
                    existing_count += 1
                except Exception as e:
                    print(f"Error adding existing student relationship: {e}")
                    db.session.rollback()
                    flash(f"Error adding student {existing_user.email}. Please try again.", "danger")
            else:
                # Create a new student account if they don't exist
                try:
                    # Generate username from email
                    username = email.split('@')[0]
                    
                    # Check if username exists, append numbers if needed
                    base_username = username
                    counter = 1
                    while User.query.filter_by(username=username).first():
                        username = f"{base_username}{counter}"
                        counter += 1
                    
                    # Generate password from email
                    password = generate_password_from_email(email)
                    
                    # Create new student account
                    new_student = User(
                        username=username,
                        email=email,
                        is_teacher=False,
                        is_first_login=True  # Force password change on first login
                    )
                    new_student.set_password(password)
                    
                    # Add user first
                    db.session.add(new_student)
                    db.session.flush()  # Flush to get the ID
                    
                    # Create the teacher-student relationship
                    teacher_student = TeacherStudent(
                        teacher_id=current_user.id,
                        student_id=new_student.id
                    )
                    db.session.add(teacher_student)
                    added_count += 1
                except Exception as e:
                    print(f"Error adding new student: {e}")
                    db.session.rollback()
                    flash(f"Error adding student {email}. Please try again.", "danger")
        
        try:
            db.session.commit()
            
            if added_count > 0:
                flash(f'Successfully added {added_count} new student(s)', 'success')
            if existing_count > 0:
                flash(f'Successfully linked {existing_count} existing student(s) to your account', 'success')
            if skipped_count > 0:
                flash(f'Skipped {skipped_count} student(s) already in your list', 'info')
        except Exception as e:
            db.session.rollback()
            print(f"Error committing changes: {e}")
            flash("An error occurred while saving changes. Please try again.", "danger")
        
        return redirect(url_for('auth.manage_students'))
    
    # Get students for this teacher
    try:
        # Get all TeacherStudent records for this teacher
        teacher_student_records = TeacherStudent.query.filter_by(teacher_id=current_user.id).all()
        
        # Get the actual student objects
        student_ids = [record.student_id for record in teacher_student_records]
        students = User.query.filter(User.id.in_(student_ids)).all() if student_ids else []
        
        # If we found students, print debug info
        if students:
            print(f"Found {len(students)} students using direct query")
    except Exception as e:
        print(f"Error retrieving students: {e}")
        flash("There was an error retrieving students. Please try again later.", "danger")
        students = []
    
    # Calculate statistics
    total_students = len(students) if students else 0
    
    # Get current time
    now = datetime.utcnow()
    
    # Calculate active students (logged in within the last 7 days)
    active_students = 0
    pending_students = 0
    
    for student in students:
        # Check if student has logged in before
        last_session = UserSession.query.filter_by(user_id=student.id).order_by(UserSession.login_time.desc()).first()
        
        # Add last_login attribute for template display
        if last_session:
            student.last_login = last_session.login_time
            
            # Check if active in last 7 days
            if (now - last_session.login_time).days < 7:
                active_students += 1
        else:
            student.last_login = None
        
        # Check if first login is pending
        if student.is_first_login:
            pending_students += 1
    
    # Calculate total enrollments in teacher's courses
    course_ids = [course.id for course in current_user.courses_created]
    
    if course_ids and students:
        student_ids = [s.id for s in students]
        try:
            enrolled_count = Enrollment.query.filter(
                Enrollment.student_id.in_(student_ids),
                Enrollment.course_id.in_(course_ids)
            ).count()
        except Exception as e:
            print(f"Error counting enrollments: {e}")
            enrolled_count = 0
    else:
        enrolled_count = 0
    
    # For debugging - print student list
    if students:
        print(f"Displaying {len(students)} students in template:")
        for student in students:
            print(f"  - {student.username} (ID: {student.id})")
    
    return render_template('auth/manage_students.html', 
                          title='Manage Students',
                          form=form,
                          students=students,
                          total_students=total_students,
                          active_students=active_students,
                          pending_students=pending_students,
                          enrolled_count=enrolled_count,
                          now=now)

@auth_bp.route('/edit_student/<int:student_id>', methods=['POST'])
@login_required
def edit_student(student_id):
    """Edit a student's information"""
    if not current_user.is_teacher:
        flash('Access denied. Teacher permissions required.', 'danger')
        return redirect(url_for('courses.index'))
    
    student = User.query.get_or_404(student_id)
    
    # Check if student belongs to this teacher
    if not current_user.has_student(student):
        # Double-check with direct query as a backup
        try:
            association = db.session.query(TeacherStudent).filter(
                TeacherStudent.c.teacher_id == current_user.id,
                TeacherStudent.c.student_id == student_id
            ).first()
            
            if not association:
                flash('Access denied. This student is not associated with you.', 'danger')
                return redirect(url_for('auth.manage_students'))
        except Exception as e:
            print(f"Error checking teacher-student relationship: {e}")
            flash('Error verifying student relationship. Please try again.', 'danger')
            return redirect(url_for('auth.manage_students'))
    
    # Ensure student is not a teacher
    if student.is_teacher:
        flash('Cannot edit teacher accounts.', 'danger')
        return redirect(url_for('auth.manage_students'))
    
    # Get form data
    username = request.form.get('username')
    email = request.form.get('email')
    
    # Basic validation
    if not username or not email:
        flash('Username and email are required.', 'danger')
        return redirect(url_for('auth.manage_students'))
    
    # Check if email is valid
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        flash('Invalid email format.', 'danger')
        return redirect(url_for('auth.manage_students'))
    
    # Check if username or email already exists for other users
    username_exists = User.query.filter(User.username == username, User.id != student_id).first()
    email_exists = User.query.filter(User.email == email, User.id != student_id).first()
    
    if username_exists:
        flash(f'Username "{username}" is already taken.', 'danger')
        return redirect(url_for('auth.manage_students'))
    
    if email_exists:
        flash(f'Email "{email}" is already in use.', 'danger')
        return redirect(url_for('auth.manage_students'))
    
    # Update student information
    try:
        student.username = username
        student.email = email
        db.session.commit()
        flash(f'Student information updated successfully.', 'success')
    except Exception as e:
        db.session.rollback()
        print(f"Error updating student: {e}")
        flash('Error updating student information. Please try again.', 'danger')
    
    return redirect(url_for('auth.manage_students'))

@auth_bp.route('/delete_student/<int:student_id>', methods=['POST'])
@login_required
def delete_student(student_id):
    """Delete a student's association with this teacher (not the actual account)"""
    if not current_user.is_teacher:
        flash('Access denied. Teacher permissions required.', 'danger')
        return redirect(url_for('courses.index'))
    
    student = User.query.get_or_404(student_id)
    
    # Check if student belongs to this teacher
    if not current_user.has_student(student):
        # Double-check with direct query as a backup
        try:
            association = db.session.query(TeacherStudent).filter(
                TeacherStudent.c.teacher_id == current_user.id,
                TeacherStudent.c.student_id == student_id
            ).first()
            
            if not association:
                flash('Access denied. This student is not associated with you.', 'danger')
                return redirect(url_for('auth.manage_students'))
        except Exception as e:
            print(f"Error checking teacher-student relationship: {e}")
            flash('Error verifying student relationship. Please try again.', 'danger')
            return redirect(url_for('auth.manage_students'))
    
    # Ensure student is not a teacher
    if student.is_teacher:
        flash('Cannot delete teacher accounts.', 'danger')
        return redirect(url_for('auth.manage_students'))
    
    # Get student's username for the success message
    username = student.username
    
    try:
        # Remove association (not deleting the actual student account)
        # Try using the relationship method first
        if not current_user.remove_student(student):
            # If the relationship method fails, try direct deletion
            db.session.execute(TeacherStudent.delete().where(
                TeacherStudent.c.teacher_id == current_user.id,
                TeacherStudent.c.student_id == student_id
            ))
        
        # Also remove enrollments for this student in this teacher's courses
        course_ids = [course.id for course in current_user.courses_created]
        if course_ids:
            enrollments_to_delete = Enrollment.query.filter(
                Enrollment.student_id == student_id,
                Enrollment.course_id.in_(course_ids)
            ).all()
            
            for enrollment in enrollments_to_delete:
                db.session.delete(enrollment)
        
        db.session.commit()
        flash(f'Student "{username}" removed from your student list successfully.', 'success')
    except Exception as e:
        db.session.rollback()
        print(f"Error removing student: {e}")
        flash('Error removing student. Please try again.', 'danger')
    
    return redirect(url_for('auth.manage_students'))

@auth_bp.route('/reset_password/<int:student_id>', methods=['POST'])
@login_required
def reset_password(student_id):
    """Reset a student's password to default"""
    if not current_user.is_teacher:
        flash('Access denied. Teacher permissions required.', 'danger')
        return redirect(url_for('courses.index'))
    
    student = User.query.get_or_404(student_id)
    
    # Check if student belongs to this teacher
    if not current_user.has_student(student):
        # Double-check with direct query as a backup
        try:
            association = db.session.query(TeacherStudent).filter(
                TeacherStudent.c.teacher_id == current_user.id,
                TeacherStudent.c.student_id == student_id
            ).first()
            
            if not association:
                flash('Access denied. This student is not associated with you.', 'danger')
                return redirect(url_for('auth.manage_students'))
        except Exception as e:
            print(f"Error checking teacher-student relationship: {e}")
            flash('Error verifying student relationship. Please try again.', 'danger')
            return redirect(url_for('auth.manage_students'))
    
    # Ensure student is not a teacher
    if student.is_teacher:
        flash('Cannot reset password for teacher accounts.', 'danger')
        return redirect(url_for('auth.manage_students'))
    
    # Generate default password from email
    default_password = generate_password_from_email(student.email)
    
    try:
        # Update password and set first_login flag
        student.set_password(default_password)
        student.is_first_login = True
        
        db.session.commit()
        
        flash(f'Password for "{student.username}" has been reset. They will be prompted to change it on next login.', 'success')
    except Exception as e:
        db.session.rollback()
        print(f"Error resetting password: {e}")
        flash('Error resetting password. Please try again.', 'danger')
    
    return redirect(url_for('auth.manage_students'))

