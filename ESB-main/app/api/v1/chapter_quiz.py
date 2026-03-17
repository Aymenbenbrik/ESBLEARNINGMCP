"""
Chapter-level quiz generation API endpoint.
This endpoint allows students to generate quizzes from multiple chapters/sections.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from app import db
from app.models import User, Course, Chapter, Quiz, QuizQuestion, Enrollment, Document, TNSection, QuestionBankQuestion
from app.services.ai_service import generate_quiz_questions
import logging

logger = logging.getLogger(__name__)

chapter_quiz_api_bp = Blueprint('chapter_quiz_api', __name__)


@chapter_quiz_api_bp.route('/courses/<int:course_id>/quiz/generate', methods=['POST'])
@jwt_required()
def generate_chapter_quiz(course_id):
    """
    Generate a quiz from selected chapters/sections.

    Request body:
    {
        "chapter_ids": [1, 2],
        "section_ids": [3, 4],  # Optional, for TN syllabi
        "num_mcq": 8,
        "num_open": 4,
        "bloom_distribution": {
            "remember": 17,
            "understand": 25,
            "apply": 25,
            "analyze": 20,
            "evaluate": 8,
            "create": 5
        },
        "difficulty_distribution": {
            "easy": 33,
            "medium": 34,
            "hard": 33
        },
        "exam_style": null  # Optional
    }
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Students only
        if user.is_teacher:
            return jsonify({'error': 'Only students can take quizzes'}), 403

        course = Course.query.get_or_404(course_id)

        # Check enrollment
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()
        if not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Parse request data
        data = request.get_json() or {}
        chapter_ids = data.get('chapter_ids', [])
        section_ids = data.get('section_ids', [])
        num_mcq = data.get('num_mcq', 8)
        num_open = data.get('num_open', 4)
        bloom_dist = data.get('bloom_distribution', {})
        difficulty_dist = data.get('difficulty_distribution', {})

        total_questions = num_mcq + num_open

        if total_questions < 3 or total_questions > 50:
            return jsonify({'error': 'Total questions must be between 3 and 50'}), 400

        # Validate distributions
        bloom_total = sum(bloom_dist.values())
        diff_total = sum(difficulty_dist.values())

        if bloom_total != 100:
            return jsonify({'error': 'Bloom taxonomy distribution must total 100%'}), 400

        if diff_total != 100:
            return jsonify({'error': 'Difficulty distribution must total 100%'}), 400

        if not chapter_ids and not section_ids:
            return jsonify({'error': 'Please select at least one chapter or section'}), 400

        # Get chapters
        chapters = Chapter.query.filter(Chapter.id.in_(chapter_ids)).all() if chapter_ids else []

        # Build content context
        week_content = f"Quiz Generation for {course.title}\\n\\n"
        week_content += f"Selected Chapters: {', '.join([ch.title for ch in chapters])}\\n\\n"

        # Collect CLOs from syllabus if available
        clos = []
        from app.models import Syllabus
        syllabus = Syllabus.query.filter_by(course_id=course_id).first()

        if syllabus and hasattr(syllabus, 'tn_aa'):
            # TN Syllabus: use AA as CLOs
            for aa in (syllabus.tn_aa or []):
                clos.append({
                    'CLO#': f"CLO {aa.number}",
                    'CLO Description': aa.description or ''
                })
        else:
            # Default CLOs
            clos = [
                {'CLO#': 'CLO 1', 'CLO Description': 'Course Learning Objective 1'},
                {'CLO#': 'CLO 2', 'CLO Description': 'Course Learning Objective 2'},
            ]

        # Collect document texts and metadata for RAG (VectorStore)
        attachments_texts = []
        attachments_metadata = []

        for chapter in chapters:
            docs = Document.query.filter_by(chapter_id=chapter.id).all()

            for doc in docs:
                # Add metadata (required for VectorStore retrieval)
                meta = {
                    'document_id': doc.id,
                    'id': doc.id,  # Alternative key
                    'title': doc.title or 'Untitled',
                    'file_path': doc.file_path,
                    'file_type': doc.file_type,
                    'source_type': 'chapter_material',
                    'chapter_id': chapter.id,
                    'chapter_title': chapter.title,
                    'chapter_order': chapter.order,
                }
                attachments_metadata.append(meta)

                # Add text (can be empty - VectorStore will retrieve context)
                # If document has summary, use it; otherwise empty string
                text = doc.summary or ''
                attachments_texts.append(text)

        logger.info(f"📚 Collected {len(attachments_metadata)} documents for quiz generation")
        if not attachments_metadata:
            logger.warning("⚠️ No documents found in selected chapters")

        # Generate quiz questions using existing service
        result = generate_quiz_questions(
            week_content=week_content,
            clos=clos,
            attachments_texts=attachments_texts,
            attachments_metadata=attachments_metadata,
            num_questions=total_questions,
            difficulty='medium',
            num_mcq=num_mcq,
            num_open=num_open,
            bloom_distribution=bloom_dist,
            difficulty_distribution=difficulty_dist
        )

        # Extract questions array from result dict
        questions = result.get('questions', [])

        # Create quiz record (associated with first chapter's first document, or create a virtual one)
        # For simplicity, we'll create a quiz without a document_id (allowing NULL)
        # Or we can associate with the first chapter
        first_chapter = chapters[0] if chapters else None
        first_doc = None
        if first_chapter:
            first_doc = Document.query.filter_by(chapter_id=first_chapter.id).first()

        quiz = Quiz(
            document_id=first_doc.id if first_doc else None,
            chapter_id=first_chapter.id if first_chapter else None,
            student_id=user.id,
            num_questions=total_questions,
            completed_at=None
        )
        db.session.add(quiz)
        db.session.flush()

        logger.info(f"Created chapter quiz {quiz.id} for student {user.id}")

        # Save questions
        for question_data in questions:
            has_choices = (question_data.get('choice_a') and
                         question_data.get('choice_b') and
                         question_data.get('choice_c'))

            quiz_question = QuizQuestion(
                quiz_id=quiz.id,
                question_text=question_data.get('question', ''),
                choice_a=question_data.get('choice_a', ''),
                choice_b=question_data.get('choice_b', ''),
                choice_c=question_data.get('choice_c', ''),
                correct_choice=question_data.get('correct_choice', ''),
                explanation=question_data.get('explanation', ''),
                bloom_level=question_data.get('bloom_level', 'N/A'),
                clo=question_data.get('clo', 'N/A'),
                difficulty=question_data.get('difficulty_level', 'medium'),
                question_type='mcq' if has_choices else 'open_ended'
            )
            db.session.add(quiz_question)

        db.session.commit()
        logger.info(f"Generated {len(questions)} questions for chapter quiz {quiz.id}")

        return jsonify({
            'message': 'Quiz generated successfully',
            'quiz_id': quiz.id,
            'num_questions': len(questions)
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error generating chapter quiz: {str(e)}")
        return jsonify({'error': str(e)}), 500


@chapter_quiz_api_bp.route('/courses/<int:course_id>/quiz/teacher-generate', methods=['POST'])
@jwt_required()
def teacher_generate_chapter_quiz(course_id):
    """
    Generate a quiz as a teacher (creates approved Document).

    Teachers create quizzes that become available for students to take.
    This is different from student practice quizzes which create Quiz instances.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        # Teacher-only access
        if not user or not user.is_teacher:
            return jsonify({'error': 'Only teachers can create course quizzes'}), 403

        course = Course.query.get_or_404(course_id)

        # Verify teacher owns course
        if course.teacher_id != user.id:
            return jsonify({'error': 'You do not have permission to create quizzes for this course'}), 403

        # Parse and validate request
        data = request.get_json() or {}
        chapter_ids = data.get('chapter_ids', [])
        section_ids = data.get('section_ids', [])
        num_mcq = data.get('num_mcq', 8)
        num_open = data.get('num_open', 4)
        bloom_dist = data.get('bloom_distribution', {})
        difficulty_dist = data.get('difficulty_distribution', {})

        total_questions = num_mcq + num_open

        # Validation
        if total_questions < 3 or total_questions > 50:
            return jsonify({'error': 'Total questions must be between 3 and 50'}), 400

        bloom_total = sum(bloom_dist.values())
        diff_total = sum(difficulty_dist.values())

        if bloom_total != 100:
            return jsonify({'error': 'Bloom taxonomy distribution must total 100%'}), 400
        if diff_total != 100:
            return jsonify({'error': 'Difficulty distribution must total 100%'}), 400
        if not chapter_ids and not section_ids:
            return jsonify({'error': 'Please select at least one chapter or section'}), 400

        # Get chapters
        chapters = Chapter.query.filter(Chapter.id.in_(chapter_ids)).all() if chapter_ids else []

        # Build quiz title
        chapter_nums = sorted([ch.order for ch in chapters])
        if len(chapter_nums) == 1:
            quiz_title = f"Quiz: Chapter {chapter_nums[0]}"
        elif len(chapter_nums) <= 3:
            quiz_title = f"Quiz: Chapters {', '.join(map(str, chapter_nums))}"
        else:
            quiz_title = f"Quiz: {len(chapter_nums)} Chapters"

        # Build content context
        week_content = f"TN Quiz Generation Context\\n\\nCourse: {course.title}\\n"
        week_content += f"Selected Chapters: {', '.join([ch.title for ch in chapters])}\\n\\n"

        # Get CLOs from TN syllabus
        clos = []
        from app.models import Syllabus
        syllabus = Syllabus.query.filter_by(course_id=course_id).first()

        if syllabus and hasattr(syllabus, 'tn_aa'):
            for aa in (syllabus.tn_aa or []):
                clos.append({
                    'CLO#': f"AA{aa.number}",
                    'CLO Description': aa.description or ''
                })

        # Collect document texts and metadata for RAG (VectorStore)
        attachments_texts = []
        attachments_metadata = []

        for chapter in chapters:
            docs = Document.query.filter_by(chapter_id=chapter.id).filter(
                Document.document_type != 'quiz'
            ).all()

            for doc in docs:
                # Add metadata (required for VectorStore retrieval)
                meta = {
                    'document_id': doc.id,
                    'id': doc.id,  # Alternative key
                    'title': doc.title or 'Untitled',
                    'file_path': doc.file_path,
                    'file_type': doc.file_type,
                    'source_type': 'chapter_material',
                    'chapter_id': chapter.id,
                    'chapter_title': chapter.title,
                    'chapter_order': chapter.order,
                }
                attachments_metadata.append(meta)

                # Add text (can be empty - VectorStore will retrieve context)
                # If document has summary, use it; otherwise empty string
                text = doc.summary or ''
                attachments_texts.append(text)

        logger.info(f"📚 Collected {len(attachments_metadata)} documents for quiz generation")
        if not attachments_metadata:
            logger.warning("⚠️ No documents found in selected chapters")

        # Generate questions using AI service
        result = generate_quiz_questions(
            week_content=week_content,
            clos=clos,
            attachments_texts=attachments_texts,
            attachments_metadata=attachments_metadata,
            num_questions=total_questions,
            difficulty='medium',
            num_mcq=num_mcq,
            num_open=num_open,
            bloom_distribution=bloom_dist,
            difficulty_distribution=difficulty_dist
        )

        # Extract questions array from result dict
        questions = result.get('questions', [])

        # Instead of saving, return questions for preview
        logger.info(f"Teacher {user.id} generated quiz for course {course_id} (not saved yet - awaiting approval)")

        return jsonify({
            'message': 'Quiz generated successfully - awaiting approval',
            'questions': questions,           # NEW: Return full question array
            'num_questions': len(questions),
            'title': quiz_title,
            'metadata': {                     # NEW: Metadata for saving later
                'course_id': course_id,
                'chapter_ids': chapter_ids,
                'summary': f"TN quiz | chapters={chapter_nums} | {num_mcq} MCQ + {num_open} open"
            }
        }), 200  # Note: 200 (not 201) since nothing created yet

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in teacher quiz generation: {str(e)}")
        return jsonify({'error': str(e)}), 500


@chapter_quiz_api_bp.route('/courses/<int:course_id>/quiz/approve', methods=['POST'])
@jwt_required()
def approve_chapter_quiz(course_id):
    """
    Approve and save a generated quiz (teacher only).

    Receives questions from frontend and creates Document.
    Follows pattern from syllabus.py:tn_approve_quiz
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        # Teacher-only access
        if not user or not user.is_teacher:
            return jsonify({'error': 'Only teachers can approve quizzes'}), 403

        course = Course.query.get_or_404(course_id)

        # Verify teacher owns course
        if course.teacher_id != user.id:
            return jsonify({'error': 'You do not have permission for this course'}), 403

        # Parse request data
        data = request.get_json() or {}
        questions = data.get('questions', [])
        title = data.get('title', f"Quiz - {datetime.utcnow().strftime('%Y-%m-%d')}")
        metadata = data.get('metadata', {})

        # Validation
        if not questions or len(questions) < 3:
            return jsonify({'error': 'At least 3 questions required'}), 400

        # Create Document and save to database
        first_chapter_id = metadata['chapter_ids'][0] if metadata.get('chapter_ids') else None
        quiz_doc = Document(
            title=title,
            course_id=course_id,
            chapter_id=first_chapter_id,
            document_type='quiz',
            week_number=None,
            file_path=None,
            summary=metadata.get('summary', f"TN quiz | {len(questions)} questions"),
            quiz_data=questions  # Save approved questions
        )
        db.session.add(quiz_doc)
        db.session.commit()

        # Save approved questions to question bank
        # This allows teachers to reuse these questions in future quizzes
        questions_added = 0
        for question_data in questions:
            # Determine chapter_id (use first chapter from metadata if available)
            chapter_id = None
            if metadata.get('chapter_ids') and len(metadata['chapter_ids']) > 0:
                chapter_id = metadata['chapter_ids'][0]

            # Extract question fields (handle both MCQ and open-ended)
            question_type = question_data.get('question_type', 'mcq')

            bank_question = QuestionBankQuestion(
                course_id=course_id,
                chapter_id=chapter_id,
                question_text=question_data.get('question', ''),
                question_type=question_type,
                choice_a=question_data.get('choice_a', '') if question_type == 'mcq' else None,
                choice_b=question_data.get('choice_b', '') if question_type == 'mcq' else None,
                choice_c=question_data.get('choice_c', '') if question_type == 'mcq' else None,
                correct_choice=question_data.get('correct_choice', '') if question_type == 'mcq' else None,
                explanation=question_data.get('explanation', ''),
                bloom_level=question_data.get('bloom_level', ''),
                difficulty=question_data.get('difficulty_level', 'medium'),
                clo=question_data.get('clo', ''),
                approved_at=datetime.utcnow(),  # Auto-approved since teacher reviewed
                approved_by_id=user.id
            )
            db.session.add(bank_question)
            questions_added += 1

        db.session.commit()

        logger.info(f"Teacher {user.id} approved and saved quiz {quiz_doc.id} for course {course_id}")
        logger.info(f"Added {questions_added} approved questions to question bank for course {course_id}")

        return jsonify({
            'message': 'Quiz approved and saved successfully',
            'document_id': quiz_doc.id,
            'num_questions': len(questions),
            'questions_added_to_bank': questions_added,
            'title': title
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error approving quiz: {e}")
        return jsonify({'error': str(e)}), 500


@chapter_quiz_api_bp.route('/courses/<int:course_id>/quiz/from-bank', methods=['POST'])
@jwt_required()
def create_quiz_from_bank(course_id):
    """
    Create a quiz by selecting questions from the approved question bank.

    Request Body:
    {
        "title": "Midterm Quiz",
        "question_ids": [1, 2, 3, 5, 8, 10],
        "chapter_ids": [1, 2],  // Optional - for filtering
        "summary": "Custom quiz description"
    }
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or not user.is_teacher:
            return jsonify({'error': 'Only teachers can create quizzes'}), 403

        course = Course.query.get_or_404(course_id)
        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json() or {}
        question_ids = data.get('question_ids', [])
        title = data.get('title', f"Quiz - {datetime.utcnow().strftime('%Y-%m-%d')}")

        if not question_ids or len(question_ids) < 3:
            return jsonify({'error': 'Select at least 3 questions'}), 400

        # Fetch approved questions from bank
        bank_questions = QuestionBankQuestion.query.filter(
            QuestionBankQuestion.id.in_(question_ids),
            QuestionBankQuestion.course_id == course_id,
            QuestionBankQuestion.approved_at.isnot(None)
        ).all()

        if len(bank_questions) != len(question_ids):
            return jsonify({'error': 'Some questions not found or not approved'}), 400

        # Convert to quiz_data format (same as AI-generated)
        quiz_data = []
        for q in bank_questions:
            question_dict = {
                'question': q.question_text,
                'question_type': q.question_type,
                'bloom_level': q.bloom_level,
                'clo': q.clo,
                'difficulty_level': q.difficulty,
                'explanation': q.explanation
            }
            if q.question_type == 'mcq':
                question_dict.update({
                    'choice_a': q.choice_a,
                    'choice_b': q.choice_b,
                    'choice_c': q.choice_c,
                    'correct_choice': q.correct_choice
                })
            quiz_data.append(question_dict)

        # Create Document with quiz_data
        quiz_doc = Document(
            title=title,
            course_id=course_id,
            chapter_id=None,
            document_type='quiz',
            week_number=None,
            file_path=None,
            summary=data.get('summary', f"Quiz from question bank | {len(quiz_data)} questions"),
            quiz_data=quiz_data
        )
        db.session.add(quiz_doc)
        db.session.commit()

        logger.info(f"Teacher {user.id} created quiz {quiz_doc.id} from question bank")

        return jsonify({
            'message': 'Quiz created successfully from question bank',
            'document_id': quiz_doc.id,
            'num_questions': len(quiz_data),
            'title': title
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating quiz from bank: {e}")
        return jsonify({'error': str(e)}), 500
