import click
from flask.cli import with_appcontext
from app import db
from app.models import User, Course, Chapter, Document, Enrollment, TeacherStudent
from datetime import datetime
from pathlib import Path

@click.command('create-superuser')
@click.argument('username')
@click.argument('email')
@click.option('--password', prompt=True, hide_input=True, confirmation_prompt=True)
@with_appcontext
def create_superuser_command(username, email, password):
    """Create a new superuser account"""
    user = User.query.filter_by(username=username).first()
    if user:
        click.echo("Username already exists")
        return
        
    user = User.query.filter_by(email=email).first()
    if user:
        click.echo("Email already exists")
        return
    
    superuser = User(
        username=username,
        email=email,
        is_teacher=True,  # Superuser is also a teacher
        is_superuser=True
    )
    superuser.set_password(password)
    
    db.session.add(superuser)
    db.session.commit()
    
    click.echo(f"Superuser {username} created successfully")

@click.command('setup-test-data')
@with_appcontext
def setup_test_data_command():
    """Setup test data for Phase 1 API testing"""
    from app import create_app

    click.echo("=" * 60)
    click.echo("SETTING UP TEST DATA FOR PHASE 1 API")
    click.echo("=" * 60)

    # Create teacher user
    click.echo("\nStep 1: Creating teacher user...")
    teacher = User.query.filter_by(username='teacher').first()
    if not teacher:
        teacher = User(
            username='teacher',
            email='teacher@test.com',
            is_teacher=True,
            created_at=datetime.utcnow()
        )
        teacher.set_password('01234567')
        db.session.add(teacher)
        db.session.flush()
        click.echo(f"  ✓ Created teacher user (ID: {teacher.id})")
    else:
        click.echo(f"  ✓ Teacher user already exists (ID: {teacher.id})")

    # Create student user
    click.echo("\nStep 2: Creating student user...")
    student = User.query.filter_by(username='student').first()
    if not student:
        student = User(
            username='student',
            email='student@test.com',
            is_teacher=False,
            created_at=datetime.utcnow()
        )
        student.set_password('12345678')
        db.session.add(student)
        db.session.flush()
        click.echo(f"  ✓ Created student user (ID: {student.id})")
    else:
        click.echo(f"  ✓ Student user already exists (ID: {student.id})")

    # Create teacher-student association
    click.echo("\nStep 3: Creating teacher-student association...")
    assoc = TeacherStudent.query.filter_by(
        teacher_id=teacher.id,
        student_id=student.id
    ).first()
    if not assoc:
        assoc = TeacherStudent(
            teacher_id=teacher.id,
            student_id=student.id
        )
        db.session.add(assoc)
        click.echo(f"  ✓ Associated student with teacher")
    else:
        click.echo(f"  ✓ Association already exists")

    # Create test course
    click.echo("\nStep 4: Creating test course...")
    course = Course.query.filter_by(
        title='Test Course for API',
        teacher_id=teacher.id
    ).first()
    if not course:
        course = Course(
            title='Test Course for API',
            description='Course for testing Phase 1 API endpoints',
            teacher_id=teacher.id,
            created_at=datetime.utcnow()
        )
        db.session.add(course)
        db.session.flush()
        click.echo(f"  ✓ Created course (ID: {course.id})")
    else:
        click.echo(f"  ✓ Course already exists (ID: {course.id})")

    # Create chapter
    click.echo("\nStep 5: Creating chapter...")
    chapter = Chapter.query.filter_by(
        title='Chapter 1: Introduction',
        course_id=course.id
    ).first()
    if not chapter:
        chapter = Chapter(
            title='Chapter 1: Introduction',
            order=1,
            course_id=course.id,
            created_at=datetime.utcnow()
        )
        db.session.add(chapter)
        db.session.flush()
        click.echo(f"  ✓ Created chapter (ID: {chapter.id})")
    else:
        click.echo(f"  ✓ Chapter already exists (ID: {chapter.id})")

    # Create minimal PDF
    def create_test_pdf():
        pdf_content = b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test Document) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000317 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
410
%%EOF"""
        return pdf_content

    # Create test document
    click.echo("\nStep 6: Creating test document...")
    doc = Document.query.filter_by(
        title='Test Document',
        chapter_id=chapter.id
    ).first()
    if not doc:
        # Create uploads directory
        uploads_dir = Path('uploads') / 'documents'
        uploads_dir.mkdir(parents=True, exist_ok=True)

        # Generate PDF file
        pdf_path = uploads_dir / f'test_document_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.pdf'
        pdf_content = create_test_pdf()
        pdf_path.write_bytes(pdf_content)

        doc = Document(
            title='Test Document',
            file_path=str(pdf_path),
            file_type='pdf',
            document_type='general',
            chapter_id=chapter.id,
            course_id=course.id,
            created_at=datetime.utcnow()
        )
        db.session.add(doc)
        db.session.flush()
        click.echo(f"  ✓ Created document (ID: {doc.id})")
    else:
        click.echo(f"  ✓ Document already exists (ID: {doc.id})")

    # Enroll student
    click.echo("\nStep 7: Enrolling student in course...")
    enrollment = Enrollment.query.filter_by(
        student_id=student.id,
        course_id=course.id
    ).first()
    if not enrollment:
        enrollment = Enrollment(
            student_id=student.id,
            course_id=course.id,
            enrolled_at=datetime.utcnow()
        )
        db.session.add(enrollment)
        click.echo(f"  ✓ Enrolled student in course")
    else:
        click.echo(f"  ✓ Student already enrolled")

    # Commit all changes
    db.session.commit()

    # Print summary
    click.echo("\n" + "=" * 60)
    click.echo("TEST DATA SETUP COMPLETE!")
    click.echo("=" * 60)
    click.echo("\nCREDENTIALS:")
    click.echo("  Teacher: username='teacher', password='01234567'")
    click.echo("  Student: username='student', password='12345678'")
    click.echo("\nCREATED IDs:")
    click.echo(f"  Teacher ID:  {teacher.id}")
    click.echo(f"  Student ID:  {student.id}")
    click.echo(f"  Course ID:   {course.id}")
    click.echo(f"  Chapter ID:  {chapter.id}")
    click.echo(f"  Document ID: {doc.id}")
    click.echo("\nREADY TO TEST!")
    click.echo("Run: .\\scripts\\test_api.ps1")

@click.command('list-docs')
@click.option('--doc-id', type=int, help='Specific document ID to inspect')
@with_appcontext
def list_documents_command(doc_id):
    """List documents and check if their files exist on disk."""
    from flask import current_app
    import os

    if doc_id:
        docs = [Document.query.get(doc_id)]
        if not docs[0]:
            click.echo(f"Document ID {doc_id} not found")
            return
    else:
        docs = Document.query.all()

    click.echo(f"{'ID':<6} {'Title':<30} {'File Path':<50} {'Exists':<15}")
    click.echo("-" * 105)

    for doc in docs:
        if doc and doc.file_path:
            # Test both with and without normalization
            uploads = current_app.config['UPLOAD_FOLDER']

            # Method 1: Direct join (current approach)
            path_direct = os.path.join(uploads, doc.file_path)
            exists_direct = os.path.exists(path_direct)

            # Method 2: With normalization
            normalized = doc.file_path.replace('\\', '/')
            path_normalized = os.path.join(uploads, normalized)
            exists_normalized = os.path.exists(path_normalized)

            title = doc.title[:28] if len(doc.title) > 28 else doc.title
            file_path = doc.file_path[:48] if len(doc.file_path) > 48 else doc.file_path

            exists_str = f"D:{exists_direct} N:{exists_normalized}"
            click.echo(f"{doc.id:<6} {title:<30} {file_path:<50} {exists_str:<15}")

            if not exists_direct and exists_normalized:
                click.echo(f"  → FIX NEEDED: Use normalized path")
                click.echo(f"     Raw DB path: {repr(doc.file_path)}")
            elif not exists_direct and not exists_normalized:
                click.echo(f"  → MISSING: File not found on disk")
                click.echo(f"     Expected: {path_normalized}")

def register_cli_commands(app):
    """Register CLI commands with the Flask application"""
    app.cli.add_command(create_superuser_command)
    app.cli.add_command(setup_test_data_command)
    app.cli.add_command(list_documents_command)