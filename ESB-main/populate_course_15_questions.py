"""
Populate Question Bank for Course 15
=====================================

This script diagnoses and populates the question bank for course 15.

Workflow:
1. Check current state (Phase 2)
2. If quiz documents exist → Migrate them (Phase 3A)
3. If no quiz documents → Generate sample quiz (Phase 3B)

Requirements:
- Flask app must be running
- User must be a teacher or superuser
- Course 15 must exist with chapters and content

Usage:
    python populate_course_15_questions.py
"""

from app import create_app, db
from app.models import (
    Course, Chapter, User, QuestionBankQuestion, Document,
    TNAA, TNSection, TNChapter
)
from app.services.ai_service import generate_quiz_questions
from sqlalchemy import func
import json
from datetime import datetime

app = create_app()

def print_header(text):
    """Print section header"""
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}\n")


def print_status(emoji, message):
    """Print status message"""
    print(f"{emoji} {message}")


def check_current_state(course_id):
    """
    Phase 2: Check current state of question bank and quiz documents

    Returns:
        tuple: (total_questions, quiz_docs_count, recommendation)
    """
    print_header("PHASE 2: Checking Current State")

    # Count total questions
    total_questions = QuestionBankQuestion.query.filter_by(course_id=course_id).count()
    print_status("📊", f"Total questions in bank: {total_questions}")

    # Count approved vs unapproved
    approved_count = QuestionBankQuestion.query.filter_by(
        course_id=course_id
    ).filter(QuestionBankQuestion.approved_at.isnot(None)).count()
    unapproved_count = total_questions - approved_count

    if total_questions > 0:
        print_status("✅", f"Approved questions: {approved_count}")
        print_status("⏳", f"Unapproved questions: {unapproved_count}")

    # Count quiz documents available for migration
    quiz_docs_count = Document.query.filter_by(
        course_id=course_id,
        document_type='quiz'
    ).filter(Document.quiz_data.isnot(None)).count()
    print_status("📄", f"Quiz documents available for migration: {quiz_docs_count}")

    # Determine recommendation
    if total_questions == 0 and quiz_docs_count > 0:
        recommendation = "MIGRATE"
        print_status("💡", "Recommendation: Migrate existing quiz documents")
    elif total_questions > 0:
        recommendation = "ALREADY_POPULATED"
        print_status("✨", "Question bank already has questions!")
    else:
        recommendation = "GENERATE"
        print_status("💡", "Recommendation: Generate new quiz questions")

    return total_questions, quiz_docs_count, recommendation


def migrate_quiz_documents(course_id, teacher_id):
    """
    Phase 3A: Migrate questions from Document.quiz_data to QuestionBankQuestion

    Returns:
        dict: Migration statistics
    """
    print_header("PHASE 3A: Migrating Quiz Documents")

    # Get all quiz documents for this course
    quiz_docs = Document.query.filter_by(
        course_id=course_id,
        document_type='quiz'
    ).filter(Document.quiz_data.isnot(None)).all()

    print_status("📄", f"Found {len(quiz_docs)} quiz documents to migrate")

    migrated = 0
    skipped = 0
    errors = 0

    for doc in quiz_docs:
        try:
            quiz_data = doc.quiz_data

            if not quiz_data or not isinstance(quiz_data, dict):
                print_status("⚠️", f"Skipping document {doc.id} - invalid quiz_data")
                skipped += 1
                continue

            questions = quiz_data.get('questions', [])
            print_status("🔄", f"Processing document {doc.id} with {len(questions)} questions")

            for q in questions:
                # Check if question already exists (duplicate check)
                existing = QuestionBankQuestion.query.filter_by(
                    course_id=course_id,
                    question_text=q.get('question'),
                    question_type=q.get('type', 'mcq')
                ).first()

                if existing:
                    skipped += 1
                    continue

                # Create new question bank question
                new_q = QuestionBankQuestion(
                    course_id=course_id,
                    chapter_id=doc.chapter_id,  # Use chapter from document
                    question_text=q.get('question'),
                    question_type=q.get('type', 'mcq'),
                    options=q.get('options', []),
                    correct_answer=q.get('correct_answer'),
                    explanation=q.get('explanation', ''),
                    bloom_level=q.get('bloom_level', 'remember'),
                    difficulty=q.get('difficulty', 'medium'),
                    clo=q.get('clo', ''),
                    source='TN' if q.get('aaa') else 'BGA',
                    approved_at=doc.created_at,  # Auto-approve with document creation time
                    approved_by_id=teacher_id
                )

                db.session.add(new_q)
                migrated += 1

        except Exception as e:
            print_status("❌", f"Error processing document {doc.id}: {str(e)}")
            errors += 1
            continue

    # Commit all changes
    db.session.commit()

    print_status("✅", f"Migration complete!")
    print_status("📊", f"Migrated: {migrated} questions")
    print_status("⏭️", f"Skipped: {skipped} (duplicates)")
    print_status("❌", f"Errors: {errors}")

    return {
        'migrated': migrated,
        'skipped': skipped,
        'errors': errors
    }


def generate_sample_quiz(course_id, teacher_id):
    """
    Phase 3B: Generate sample quiz questions using AI

    Returns:
        dict: Generation statistics
    """
    print_header("PHASE 3B: Generating Sample Quiz")

    # Check if course has chapters
    chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).all()

    if not chapters:
        print_status("❌", "No chapters found for this course!")
        print_status("💡", "Please create chapters first before generating quizzes")
        return {'generated': 0, 'error': 'No chapters found'}

    print_status("✅", f"Found {len(chapters)} chapters")

    # Check if chapters have content (TNAA or documents)
    has_content = False
    for chapter in chapters:
        tnaa_count = TNAA.query.join(TNSection).join(TNChapter).filter(
            TNChapter.chapter_id == chapter.id
        ).count()
        doc_count = Document.query.filter_by(
            chapter_id=chapter.id
        ).filter(Document.document_type != 'quiz').count()

        if tnaa_count > 0 or doc_count > 0:
            has_content = True
            print_status("✅", f"Chapter {chapter.id}: {chapter.title} has content")

    if not has_content:
        print_status("⚠️", "No content found in chapters!")
        print_status("💡", "Quiz questions may be generic without content")

    # Generate quiz questions
    print_status("🤖", "Generating quiz questions with AI...")

    try:
        # Prepare quiz generation parameters
        params = {
            'course_id': course_id,
            'chapter_ids': [ch.id for ch in chapters[:2]],  # First 2 chapters
            'num_mcq': 15,
            'num_open': 5,
            'bloom_distribution': {
                'remember': 20,
                'understand': 30,
                'apply': 30,
                'analyze': 20
            },
            'difficulty_distribution': {
                'easy': 30,
                'medium': 50,
                'hard': 20
            }
        }

        print_status("⚙️", f"Parameters: {params['num_mcq']} MCQ + {params['num_open']} open-ended")

        # Generate questions using AI service
        result = generate_quiz_questions(**params)

        if not result or 'questions' not in result:
            print_status("❌", "AI generation failed - no questions returned")
            return {'generated': 0, 'error': 'AI generation failed'}

        questions = result['questions']
        print_status("✅", f"AI generated {len(questions)} questions")

        # Save questions to question bank (auto-approve)
        saved_count = 0
        for q in questions:
            new_q = QuestionBankQuestion(
                course_id=course_id,
                chapter_id=q.get('chapter_id'),
                question_text=q.get('question'),
                question_type=q.get('type', 'mcq'),
                options=q.get('options', []),
                correct_answer=q.get('correct_answer'),
                explanation=q.get('explanation', ''),
                bloom_level=q.get('bloom_level', 'remember'),
                difficulty=q.get('difficulty', 'medium'),
                clo=q.get('clo', ''),
                source='TN' if q.get('aaa') else 'BGA',
                approved_at=datetime.utcnow(),  # Auto-approve
                approved_by_id=teacher_id
            )

            db.session.add(new_q)
            saved_count += 1

        # Commit all changes
        db.session.commit()

        print_status("✅", f"Saved {saved_count} questions to question bank")

        return {
            'generated': saved_count,
            'error': None
        }

    except Exception as e:
        print_status("❌", f"Error generating quiz: {str(e)}")
        db.session.rollback()
        return {
            'generated': 0,
            'error': str(e)
        }


def verify_results(course_id):
    """
    Phase 4: Verify that questions were added successfully
    """
    print_header("PHASE 4: Verification")

    # Count total questions
    total = QuestionBankQuestion.query.filter_by(course_id=course_id).count()
    print_status("📊", f"Total questions in bank: {total}")

    # Count by approval status
    approved = QuestionBankQuestion.query.filter_by(
        course_id=course_id
    ).filter(QuestionBankQuestion.approved_at.isnot(None)).count()
    unapproved = total - approved

    print_status("✅", f"Approved questions: {approved}")
    print_status("⏳", f"Unapproved questions: {unapproved}")

    # Count by chapter
    chapter_counts = db.session.query(
        Chapter.title,
        func.count(QuestionBankQuestion.id).label('count')
    ).join(
        QuestionBankQuestion,
        Chapter.id == QuestionBankQuestion.chapter_id
    ).filter(
        QuestionBankQuestion.course_id == course_id
    ).group_by(Chapter.title).all()

    if chapter_counts:
        print_status("📚", "Questions by chapter:")
        for chapter_title, count in chapter_counts:
            print(f"    - {chapter_title}: {count} questions")

    # Count by bloom level
    bloom_counts = db.session.query(
        QuestionBankQuestion.bloom_level,
        func.count(QuestionBankQuestion.id).label('count')
    ).filter_by(course_id=course_id).group_by(
        QuestionBankQuestion.bloom_level
    ).all()

    if bloom_counts:
        print_status("🎯", "Questions by Bloom level:")
        for bloom, count in bloom_counts:
            print(f"    - {bloom}: {count} questions")

    return total > 0


def main():
    """Main execution"""
    with app.app_context():
        print_header("Question Bank Population Tool")
        print("Course ID: 15")

        # Verify course exists
        course = Course.query.get(15)
        if not course:
            print_status("❌", "Course 15 not found!")
            return

        print_status("✅", f"Course found: {course.title}")
        print_status("👤", f"Teacher: {course.teacher.username if course.teacher else 'None'}")

        # Get teacher for approvals
        teacher = course.teacher
        if not teacher:
            print_status("⚠️", "No teacher assigned - looking for any teacher...")
            teacher = User.query.filter_by(is_teacher=True).first()
            if not teacher:
                print_status("❌", "No teacher found in database!")
                return

        teacher_id = teacher.id
        print_status("✅", f"Using teacher: {teacher.username} (ID: {teacher_id})")

        # Phase 2: Check current state
        total_questions, quiz_docs_count, recommendation = check_current_state(course.id)

        # Phase 3: Populate based on recommendation
        if recommendation == "ALREADY_POPULATED":
            print_status("ℹ️", "Question bank already populated - skipping population")

        elif recommendation == "MIGRATE":
            # Phase 3A: Migrate existing documents
            stats = migrate_quiz_documents(course.id, teacher_id)

        elif recommendation == "GENERATE":
            # Phase 3B: Generate new questions
            stats = generate_sample_quiz(course.id, teacher_id)

        # Phase 4: Verify results
        success = verify_results(course.id)

        if success:
            print_header("SUCCESS! ✅")
            print_status("🎉", "Question bank populated successfully!")
            print_status("🌐", "View questions at: http://localhost:3000/question-bank?course_id=15")
        else:
            print_header("FAILED ❌")
            print_status("💔", "Question bank population failed")
            print_status("💡", "Check errors above for details")


if __name__ == "__main__":
    main()
