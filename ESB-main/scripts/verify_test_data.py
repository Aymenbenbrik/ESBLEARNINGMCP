"""
Verify Test Data Setup

This script checks that all required test data exists in the database.

Run: python scripts/verify_test_data.py
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import create_app, db
from app.models import User, Course, Chapter, Document, Enrollment, TeacherStudent


def verify_test_data():
    """Verify all test data exists"""

    print("=" * 60)
    print("VERIFYING TEST DATA")
    print("=" * 60)
    print()

    all_good = True

    # Check teacher user
    print("Checking users...")
    teacher = User.query.filter_by(username='teacher').first()
    if teacher and teacher.is_teacher:
        print(f"  ✓ Teacher user exists (ID: {teacher.id})")
    else:
        print(f"  ✗ Teacher user missing or not marked as teacher")
        all_good = False

    # Check student user
    student = User.query.filter_by(username='student').first()
    if student and not student.is_teacher:
        print(f"  ✓ Student user exists (ID: {student.id})")
    else:
        print(f"  ✗ Student user missing or marked as teacher")
        all_good = False

    if not (teacher and student):
        print("\n❌ VERIFICATION FAILED: Missing users")
        print("Run: python scripts/setup_test_data.py")
        return False

    # Check teacher-student association
    print("\nChecking teacher-student association...")
    assoc = TeacherStudent.query.filter_by(
        teacher_id=teacher.id,
        student_id=student.id
    ).first()
    if assoc:
        print(f"  ✓ Teacher-student association exists")
    else:
        print(f"  ✗ Teacher-student association missing")
        all_good = False

    # Check course
    print("\nChecking course...")
    course = Course.query.filter_by(teacher_id=teacher.id).first()
    if course:
        print(f"  ✓ Course exists (ID: {course.id}, Title: '{course.title}')")
    else:
        print(f"  ✗ No course found for teacher")
        all_good = False
        return all_good

    # Check chapter
    print("\nChecking chapter...")
    chapter = Chapter.query.filter_by(course_id=course.id).first()
    if chapter:
        print(f"  ✓ Chapter exists (ID: {chapter.id}, Title: '{chapter.title}')")
    else:
        print(f"  ✗ No chapter found in course")
        all_good = False
        return all_good

    # Check document
    print("\nChecking document...")
    doc = Document.query.filter_by(chapter_id=chapter.id).first()
    if doc:
        print(f"  ✓ Document exists (ID: {doc.id}, Title: '{doc.title}')")
        # Check if file exists
        if os.path.exists(doc.file_path):
            print(f"    File exists: {doc.file_path}")
        else:
            print(f"    ⚠ Warning: File not found at {doc.file_path}")
    else:
        print(f"  ✗ No document found in chapter")
        all_good = False
        return all_good

    # Check enrollment
    print("\nChecking enrollment...")
    enrollment = Enrollment.query.filter_by(
        student_id=student.id,
        course_id=course.id
    ).first()
    if enrollment:
        print(f"  ✓ Student enrolled in course")
    else:
        print(f"  ✗ Student not enrolled in course")
        all_good = False

    # Summary
    print("\n" + "=" * 60)
    if all_good:
        print("✓ ALL CHECKS PASSED!")
        print("=" * 60)
        print()
        print("Test data is ready for API testing.")
        print()
        print("QUICK REFERENCE:")
        print(f"  Teacher: username='teacher', password='01234567' (ID: {teacher.id})")
        print(f"  Student: username='student', password='12345678' (ID: {student.id})")
        print(f"  Course ID:   {course.id}")
        print(f"  Chapter ID:  {chapter.id}")
        print(f"  Document ID: {doc.id}")
        print()
        print("Next step: Test API endpoints")
        print("  PowerShell: .\\scripts\\test_api.ps1")
    else:
        print("✗ VERIFICATION FAILED")
        print("=" * 60)
        print()
        print("Some test data is missing or incorrect.")
        print("Run: python scripts/setup_test_data.py")

    print()

    return all_good


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        try:
            success = verify_test_data()
            sys.exit(0 if success else 1)
        except Exception as e:
            print(f"\n❌ ERROR: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
