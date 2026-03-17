"""
Setup Test Data for Phase 1 API Testing

This script creates:
- Teacher and student users
- A test course with chapter
- A test document
- Student enrollment
- Teacher-student association

Run: python scripts/setup_test_data.py
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import create_app, db
from app.models import User, Course, Chapter, Document, Enrollment, TeacherStudent
from datetime import datetime
import io


def create_test_pdf():
    """Create a minimal valid PDF document"""
    # Minimal PDF structure
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


def setup_test_data():
    """Create complete test data for API testing"""

    print("=" * 60)
    print("SETTING UP TEST DATA FOR PHASE 1 API")
    print("=" * 60)
    print()

    # Step 1: Create or get teacher user
    print("Step 1: Creating teacher user...")
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
        print(f"  ✓ Created teacher user (ID: {teacher.id})")
    else:
        print(f"  ✓ Teacher user already exists (ID: {teacher.id})")

    # Step 2: Create or get student user
    print("\nStep 2: Creating student user...")
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
        print(f"  ✓ Created student user (ID: {student.id})")
    else:
        print(f"  ✓ Student user already exists (ID: {student.id})")

    # Step 3: Create teacher-student association
    print("\nStep 3: Creating teacher-student association...")
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
        print(f"  ✓ Associated student with teacher")
    else:
        print(f"  ✓ Association already exists")

    # Step 4: Create test course
    print("\nStep 4: Creating test course...")
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
        print(f"  ✓ Created course (ID: {course.id})")
    else:
        print(f"  ✓ Course already exists (ID: {course.id})")

    # Step 5: Create chapter
    print("\nStep 5: Creating chapter...")
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
        print(f"  ✓ Created chapter (ID: {chapter.id})")
    else:
        print(f"  ✓ Chapter already exists (ID: {chapter.id})")

    # Step 6: Create test document
    print("\nStep 6: Creating test document...")
    doc = Document.query.filter_by(
        title='Test Document',
        chapter_id=chapter.id
    ).first()
    if not doc:
        # Create uploads directory if it doesn't exist
        uploads_dir = Path(__file__).parent.parent / 'uploads' / 'documents'
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
        print(f"  ✓ Created document (ID: {doc.id})")
        print(f"    File: {pdf_path}")
    else:
        print(f"  ✓ Document already exists (ID: {doc.id})")

    # Step 7: Enroll student in course
    print("\nStep 7: Enrolling student in course...")
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
        print(f"  ✓ Enrolled student in course")
    else:
        print(f"  ✓ Student already enrolled")

    # Commit all changes
    db.session.commit()

    # Print summary
    print("\n" + "=" * 60)
    print("TEST DATA SETUP COMPLETE!")
    print("=" * 60)
    print()
    print("CREDENTIALS:")
    print(f"  Teacher: username='teacher', password='01234567'")
    print(f"  Student: username='student', password='12345678'")
    print()
    print("CREATED IDs:")
    print(f"  Teacher ID:  {teacher.id}")
    print(f"  Student ID:  {student.id}")
    print(f"  Course ID:   {course.id}")
    print(f"  Chapter ID:  {chapter.id}")
    print(f"  Document ID: {doc.id}")
    print()
    print("READY TO TEST!")
    print()
    print("PowerShell Test Commands:")
    print("-" * 60)
    print(f"""
# Create session
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Login as student
$loginResponse = Invoke-WebRequest http://localhost:5000/api/v1/auth/login `
  -Method POST `
  -ContentType "application/json" `
  -Body '{{"username":"student","password":"12345678"}}' `
  -WebSession $session

# Create quiz
$quizResponse = Invoke-WebRequest http://localhost:5000/api/v1/quiz/setup/{doc.id} `
  -Method POST `
  -ContentType "application/json" `
  -Body '{{"num_questions": 5}}' `
  -WebSession $session

$quizResponse.Content | ConvertFrom-Json
""")
    print("=" * 60)


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        try:
            setup_test_data()
        except Exception as e:
            print(f"\n❌ ERROR: {e}")
            import traceback
            traceback.print_exc()
            db.session.rollback()
            sys.exit(1)
