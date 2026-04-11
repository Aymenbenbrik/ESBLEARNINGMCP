"""
Question Bank API v1
RESTful endpoints for question bank management, generation, approval, and revision quizzes
Supports dual workflow: BGA (CLO-based) and TN (AAA-based)
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import (
    Course, Chapter, User, QuestionBankQuestion, Quiz, QuizQuestion,
    Document, Enrollment, TNAA, TNSection, TNChapter, Syllabus,
    PracticeQuiz, PracticeQuizQuestion,
)
from app.models.pipeline import QuestionBankExercise
from app.api.v1.utils import get_current_user, teacher_required, parse_int_list, parse_string_list
from app.services.ai_service import generate_quiz_questions
from sqlalchemy import func, or_
from datetime import datetime
import logging
import re
import random

logger = logging.getLogger(__name__)

question_bank_api_bp = Blueprint('question_bank_api', __name__, url_prefix='/question-bank')


@question_bank_api_bp.route('/', methods=['GET'])
@jwt_required()
def list_questions():
    """
    List question bank questions with multi-level filtering

    Query Parameters:
        course_id: Required - Filter by course
        chapter_id: Optional - Comma-separated chapter IDs
        aaa: Optional - Comma-separated AAA codes (partial match)
        bloom_level: Optional - Bloom taxonomy level
        difficulty: Optional - Difficulty level
        approved: Optional - Filter by approval status ('true', 'false', 'all')
        mine_only: Optional - Show only questions approved by current teacher ('true', 'false')
        category: Optional - Filter by category ('independent', 'exercise', 'practical', 'all')
        limit: Optional - Results per page (default 50, max 100)
        offset: Optional - Pagination offset (default 0)

    Returns:
        200: List of questions with pagination
        400: Missing course_id
        403: If user is not teacher/student
    """
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Validate course_id
        course_id = request.args.get('course_id', type=int)
        if not course_id:
            return jsonify({'error': 'course_id is required'}), 400

        # Build base query - only approved questions for students
        query = QuestionBankQuestion.query.filter_by(course_id=course_id)

        # For students, only show approved questions
        if not user.is_teacher and not user.is_superuser:
            query = query.filter(QuestionBankQuestion.approved_at.isnot(None))

        # Apply filters
        # Chapter filter
        chapter_ids_str = request.args.get('chapter_id', '')
        if chapter_ids_str:
            chapter_ids = parse_int_list(chapter_ids_str)
            if chapter_ids:
                query = query.filter(QuestionBankQuestion.chapter_id.in_(chapter_ids))

        # AAA filter (partial match on clo field)
        aaa_str = request.args.get('aaa', '')
        if aaa_str:
            aaa_codes = parse_string_list(aaa_str)
            if aaa_codes:
                # Build OR filters for each AAA code
                filters = [QuestionBankQuestion.clo.ilike(f'%{code}%') for code in aaa_codes]
                query = query.filter(or_(*filters))

        # Bloom level filter
        bloom_level = request.args.get('bloom_level', '').strip()
        if bloom_level:
            query = query.filter(QuestionBankQuestion.bloom_level == bloom_level)

        # Difficulty filter
        difficulty = request.args.get('difficulty', '').strip()
        if difficulty:
            query = query.filter(QuestionBankQuestion.difficulty == difficulty)

        # Approval status filter (teacher/superuser only)
        if user.is_teacher or user.is_superuser:
            approved_filter = request.args.get('approved', 'all').lower()
            if approved_filter == 'true':
                query = query.filter(QuestionBankQuestion.approved_at.isnot(None))
            elif approved_filter == 'false':
                query = query.filter(QuestionBankQuestion.approved_at.is_(None))

        # Mine only filter - show only questions approved by current teacher
        mine_only = request.args.get('mine_only', 'false').lower() == 'true'
        if mine_only and (user.is_teacher or user.is_superuser):
            query = query.filter(QuestionBankQuestion.approved_by_id == user.id)

        # Category filter
        category = request.args.get('category', 'all').lower()
        if category == 'independent':
            query = query.filter(QuestionBankQuestion.exercise_id.is_(None))
            query = query.filter(QuestionBankQuestion.question_type.notin_(['code']))
        elif category == 'exercise':
            query = query.filter(QuestionBankQuestion.exercise_id.isnot(None))
        elif category == 'practical':
            query = query.filter(
                or_(
                    QuestionBankQuestion.question_type == 'code',
                    QuestionBankQuestion.programming_language.isnot(None)
                )
            )
            query = query.filter(QuestionBankQuestion.exercise_id.is_(None))

        # Pagination
        limit = min(request.args.get('limit', 50, type=int), 100)
        offset = request.args.get('offset', 0, type=int)

        # Get total count with filters
        total = query.count()

        # Get total count WITHOUT chapter/AAA/bloom/difficulty filters (only course + approval)
        # This helps distinguish "no data" from "filtered out"
        base_query = QuestionBankQuestion.query.filter_by(course_id=course_id)
        if not user.is_teacher and not user.is_superuser:
            base_query = base_query.filter(QuestionBankQuestion.approved_at.isnot(None))
        total_unfiltered = base_query.count()

        questions = query.order_by(QuestionBankQuestion.id.desc()).limit(limit).offset(offset).all()

        # Log if empty result for debugging
        if total == 0:
            logger.info(f"Question bank empty for course {course_id} with filters: {request.args.to_dict()}")
            logger.info(f"User: {user.id}, Role: {'Teacher' if user.is_teacher else 'Student'}")
            logger.info(f"Total unfiltered questions for course: {total_unfiltered}")

        return jsonify({
            'questions': [
                {
                    'id': q.id,
                    'question_text': q.question_text,
                    'question_type': q.question_type,
                    'bloom_level': q.bloom_level,
                    'clo': q.clo,
                    'difficulty': q.difficulty,
                    'is_approved': q.is_approved,
                    'approved_at': q.approved_at.isoformat() if q.approved_at else None,
                    'chapter_id': q.chapter_id,
                    'chapter_title': q.chapter.title if q.chapter else None,
                    'correct_choice': q.correct_choice if user.is_teacher or user.is_superuser else None,
                    'choice_a': q.choice_a if q.question_type == 'mcq' else None,
                    'choice_b': q.choice_b if q.question_type == 'mcq' else None,
                    'choice_c': q.choice_c if q.question_type == 'mcq' else None
                }
                for q in questions
            ],
            'total': total,
            'total_unfiltered': total_unfiltered,
            'limit': limit,
            'offset': offset
        }), 200

    except Exception as e:
        logger.error(f"Error listing questions: {e}")
        return jsonify({'error': str(e)}), 500


@question_bank_api_bp.route('/exercises', methods=['GET'])
@jwt_required()
def list_exercises():
    """List exercises (grouped dependent questions) for a course."""
    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Accès réservé aux enseignants'}), 403

    course_id = request.args.get('course_id', type=int)
    if not course_id:
        return jsonify({'error': 'course_id is required'}), 400

    query = QuestionBankExercise.query.filter_by(course_id=course_id)

    exercise_type = request.args.get('exercise_type', '').strip()
    if exercise_type:
        query = query.filter(QuestionBankExercise.exercise_type == exercise_type)

    status = request.args.get('status', '').strip()
    if status:
        query = query.filter(QuestionBankExercise.status == status)

    chapter_id = request.args.get('chapter_id', type=int)
    if chapter_id:
        query = query.filter(QuestionBankExercise.chapter_id == chapter_id)

    exercises = query.order_by(QuestionBankExercise.created_at.desc()).all()

    return jsonify({
        'exercises': [
            {
                'id': ex.id,
                'title': ex.title,
                'description': ex.description,
                'exercise_type': ex.exercise_type,
                'status': ex.status,
                'total_points': ex.total_points,
                'estimated_duration_min': ex.estimated_duration_min,
                'aa_codes': ex.aa_codes,
                'bloom_levels': ex.bloom_levels,
                'progression_notes': ex.progression_notes,
                'chapter_id': ex.chapter_id,
                'chapter_title': Chapter.query.get(ex.chapter_id).title if ex.chapter_id else None,
                'question_count': QuestionBankQuestion.query.filter_by(exercise_id=ex.id).count(),
                'approved_at': ex.approved_at.isoformat() if ex.approved_at else None,
                'created_at': ex.created_at.isoformat() if ex.created_at else None,
            }
            for ex in exercises
        ],
        'total': len(exercises),
    }), 200


@question_bank_api_bp.route('/debug/stats', methods=['GET'])
@jwt_required()
def debug_stats():
    """
    Debug endpoint to check question bank statistics
    (Development/Teacher only)

    Query Parameters:
        course_id: Required - Course to check

    Returns:
        200: Statistics about questions in database
        403: If user is not teacher/superuser or not in debug mode
    """
    from flask import current_app

    user = get_current_user()
    if not user or (not user.is_teacher and not user.is_superuser):
        return jsonify({'error': 'Access denied'}), 403

    # Only allow in debug mode or for teachers/superusers
    if not (current_app.debug or user.is_teacher or user.is_superuser):
        return jsonify({'error': 'Only available in debug mode'}), 403

    course_id = request.args.get('course_id', type=int)
    if not course_id:
        return jsonify({'error': 'course_id is required'}), 400

    # Count total questions for this course
    total_questions = QuestionBankQuestion.query.filter_by(course_id=course_id).count()

    # Count by chapter
    chapter_counts = db.session.query(
        QuestionBankQuestion.chapter_id,
        func.count(QuestionBankQuestion.id).label('count')
    ).filter_by(course_id=course_id).group_by(QuestionBankQuestion.chapter_id).all()

    # Count approved vs unapproved
    approved_count = QuestionBankQuestion.query.filter_by(
        course_id=course_id
    ).filter(QuestionBankQuestion.approved_at.isnot(None)).count()

    unapproved_count = total_questions - approved_count

    # Check if quiz documents exist (for migration)
    quiz_docs_count = Document.query.filter_by(
        course_id=course_id,
        document_type='quiz'
    ).filter(Document.quiz_data.isnot(None)).count()

    return jsonify({
        'course_id': course_id,
        'total_questions': total_questions,
        'approved_questions': approved_count,
        'unapproved_questions': unapproved_count,
        'questions_by_chapter': [
            {'chapter_id': ch_id, 'count': count}
            for ch_id, count in chapter_counts
        ],
        'quiz_documents_available_for_migration': quiz_docs_count,
        'recommendation': (
            'Run migration endpoint to create questions from documents'
            if total_questions == 0 and quiz_docs_count > 0
            else 'Questions exist, check chapter filter'
            if total_questions > 0
            else 'No questions or quiz documents found - generate quizzes first'
        )
    }), 200


@question_bank_api_bp.route('/approve', methods=['POST'])
@jwt_required()
@teacher_required
def approve_questions():
    """
    Bulk approve or reject questions

    Request Body:
        {
            "course_id": 123,
            "question_ids": [1, 2, 3],
            "action": "approve" or "reject",
            "metadata_updates": {  // Optional - apply before approval
                "1": {"bloom_level": "apply", "difficulty": "medium"},
                ...
            }
        }

    Returns:
        200: Questions updated
        400: Validation error
        403: If user is not teacher
    """
    try:
        user = get_current_user()
        data = request.get_json()

        course_id = data.get('course_id')
        question_ids = data.get('question_ids', [])
        action = data.get('action', 'approve')
        metadata_updates = data.get('metadata_updates', {})

        if not course_id:
            return jsonify({'error': 'course_id is required'}), 400

        if not question_ids or not isinstance(question_ids, list):
            return jsonify({'error': 'question_ids must be a non-empty list'}), 400

        if action not in ['approve', 'reject']:
            return jsonify({'error': 'action must be "approve" or "reject"'}), 400

        # Verify course access
        course = Course.query.get_or_404(course_id)
        is_owner = user.is_teacher and course.teacher_id == user.id
        is_admin_only = user.is_superuser and not user.is_teacher
        if not is_owner and not is_admin_only:
            return jsonify({'error': 'Access denied'}), 403

        # Process questions
        approved_count = 0
        rejected_count = 0

        for qid in question_ids:
            question = QuestionBankQuestion.query.filter_by(
                id=qid,
                course_id=course_id
            ).first()

            if not question:
                logger.warning(f"Question {qid} not found in course {course_id}")
                continue

            # Apply metadata updates if provided
            if str(qid) in metadata_updates:
                updates = metadata_updates[str(qid)]
                if 'bloom_level' in updates:
                    question.bloom_level = updates['bloom_level']
                if 'difficulty' in updates:
                    question.difficulty = updates['difficulty']
                if 'clo' in updates:
                    question.clo = updates['clo']

            # Apply action
            if action == 'approve':
                question.approved_at = datetime.utcnow()
                question.approved_by_id = user.id
                approved_count += 1
            elif action == 'reject':
                # Delete rejected question
                db.session.delete(question)
                rejected_count += 1

        db.session.commit()

        return jsonify({
            'message': f'Questions {action}d successfully',
            'approved': approved_count if action == 'approve' else 0,
            'rejected': rejected_count if action == 'reject' else 0
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error approving questions: {e}")
        return jsonify({'error': str(e)}), 500


@question_bank_api_bp.route('/generate', methods=['POST'])
@jwt_required()
@teacher_required
def generate_questions_bga():
    """
    Generate questions using BGA (CLO-based) workflow

    Request Body:
        {
            "course_id": 123,
            "chapter_id": 456,
            "clo": "CLO1",
            "num_questions": 10,
            "bloom_distribution": {"remember": 20, "understand": 30, ...},  // Must sum to 100
            "difficulty_distribution": {"easy": 30, "medium": 50, "hard": 20}  // Must sum to 100
        }

    Returns:
        200: Generated questions (pending approval)
        400: Validation error
        403: If user is not teacher
    """
    try:
        user = get_current_user()
        data = request.get_json()

        course_id = data.get('course_id')
        chapter_id = data.get('chapter_id')
        clo = data.get('clo', '')
        num_questions = data.get('num_questions', 10)
        bloom_dist = data.get('bloom_distribution', {})
        difficulty_dist = data.get('difficulty_distribution', {})

        # Validate required fields
        if not course_id or not chapter_id:
            return jsonify({'error': 'course_id and chapter_id are required'}), 400

        # Verify course access
        course = Course.query.get_or_404(course_id)
        is_owner = user.is_teacher and course.teacher_id == user.id
        is_admin_only = user.is_superuser and not user.is_teacher
        if not is_owner and not is_admin_only:
            return jsonify({'error': 'Access denied'}), 403

        chapter = Chapter.query.get_or_404(chapter_id)
        if chapter.course_id != course_id:
            return jsonify({'error': 'Chapter does not belong to this course'}), 400

        # Validate distributions sum to 100
        if bloom_dist and abs(sum(bloom_dist.values()) - 100) > 0.1:
            return jsonify({'error': 'Bloom distribution must sum to 100%'}), 400

        if difficulty_dist and abs(sum(difficulty_dist.values()) - 100) > 0.1:
            return jsonify({'error': 'Difficulty distribution must sum to 100%'}), 400

        # Call AI service to generate questions
        generated_questions = generate_quiz_questions(
            chapter=chapter,
            num_questions=num_questions,
            bloom_distribution=bloom_dist,
            difficulty_distribution=difficulty_dist,
            clo=clo
        )

        # Save to question bank (unapproved)
        saved_questions = []
        for q_data in generated_questions:
            question = QuestionBankQuestion(
                course_id=course_id,
                chapter_id=chapter_id,
                question_text=q_data.get('question_text', ''),
                question_type=q_data.get('question_type', 'mcq'),
                choice_a=q_data.get('choice_a', ''),
                choice_b=q_data.get('choice_b', ''),
                choice_c=q_data.get('choice_c', ''),
                correct_choice=q_data.get('correct_choice', ''),
                explanation=q_data.get('explanation', ''),
                bloom_level=q_data.get('bloom_level', ''),
                difficulty=q_data.get('difficulty', 'medium'),
                clo=clo,
                approved_at=None  # Pending approval
            )
            db.session.add(question)
            db.session.flush()  # Get ID
            saved_questions.append({
                'id': question.id,
                'question_text': question.question_text,
                'bloom_level': question.bloom_level,
                'difficulty': question.difficulty
            })

        db.session.commit()

        logger.info(f"Generated {len(saved_questions)} questions for course {course_id}, chapter {chapter_id}")

        return jsonify({
            'message': f'Generated {len(saved_questions)} questions (pending approval)',
            'questions': saved_questions
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error generating BGA questions: {e}")
        return jsonify({'error': str(e)}), 500


@question_bank_api_bp.route('/tn/generate/<int:course_id>', methods=['POST'])
@jwt_required()
@teacher_required
def generate_questions_tn(course_id):
    """
    Generate questions using TN (AAA-based) workflow with RAG

    Request Body:
        {
            "selections": [
                {
                    "chapter_id": 1,
                    "section_id": 2,
                    "aa_number": 1
                },
                ...
            ],
            "num_questions": 20,
            "bloom_distribution": {...},
            "difficulty_distribution": {...}
        }

    Returns:
        200: Generated questions (pending approval)
        400: Validation error
        403: If user is not teacher
    """
    try:
        user = get_current_user()
        data = request.get_json()

        selections = data.get('selections', [])
        num_questions = data.get('num_questions', 20)
        bloom_dist = data.get('bloom_distribution', {})
        difficulty_dist = data.get('difficulty_distribution', {})

        # Verify course access
        course = Course.query.get_or_404(course_id)
        is_owner = user.is_teacher and course.teacher_id == user.id
        is_admin_only = user.is_superuser and not user.is_teacher
        if not is_owner and not is_admin_only:
            return jsonify({'error': 'Access denied'}), 403

        if not selections:
            return jsonify({'error': 'selections are required'}), 400

        # Build AA distribution from selections
        aa_counts = {}
        chapter_sections = {}

        for sel in selections:
            aa_num = sel.get('aa_number')
            chapter_id = sel.get('chapter_id')
            section_id = sel.get('section_id')

            if not aa_num:
                continue

            aa_code = f"AA {aa_num}"
            aa_counts[aa_code] = aa_counts.get(aa_code, 0) + 1

            # Track chapters and sections for RAG context
            if chapter_id:
                if chapter_id not in chapter_sections:
                    chapter_sections[chapter_id] = set()
                if section_id:
                    chapter_sections[chapter_id].add(section_id)

        if not aa_counts:
            return jsonify({'error': 'No valid AA selections'}), 400

        # Normalize AA distribution to percentages
        total_selections = sum(aa_counts.values())
        aa_distribution = {
            aa: round((count / total_selections) * 100, 1)
            for aa, count in aa_counts.items()
        }

        # Get RAG documents for selected chapters/sections
        rag_documents = []
        for chapter_id, section_ids in chapter_sections.items():
            chapter = Chapter.query.get(chapter_id)
            if chapter and chapter.course_id == course_id:
                # Get chapter documents
                docs = Document.query.filter_by(
                    chapter_id=chapter_id,
                    document_type='chapter_content'
                ).all()
                rag_documents.extend(docs)

        # Call generation service with TN parameters
        from app.services.syllabus_tn_service import generate_tn_questions
        generated_questions = generate_tn_questions(
            course_id=course_id,
            aa_distribution=aa_distribution,
            num_questions=num_questions,
            bloom_distribution=bloom_dist,
            difficulty_distribution=difficulty_dist,
            rag_documents=rag_documents
        )

        # Save to question bank (unapproved)
        saved_questions = []
        for q_data in generated_questions:
            question = QuestionBankQuestion(
                course_id=course_id,
                chapter_id=q_data.get('chapter_id'),  # May be inferred
                question_text=q_data.get('question_text', ''),
                question_type=q_data.get('question_type', 'mcq'),
                choice_a=q_data.get('choice_a', ''),
                choice_b=q_data.get('choice_b', ''),
                choice_c=q_data.get('choice_c', ''),
                correct_choice=q_data.get('correct_choice', ''),
                explanation=q_data.get('explanation', ''),
                bloom_level=q_data.get('bloom_level', ''),
                difficulty=q_data.get('difficulty', 'medium'),
                clo=q_data.get('aaa_code', ''),  # Store AAA in clo field
                approved_at=None  # Pending approval
            )
            db.session.add(question)
            db.session.flush()
            saved_questions.append({
                'id': question.id,
                'question_text': question.question_text,
                'aaa_code': question.clo,
                'bloom_level': question.bloom_level,
                'difficulty': question.difficulty
            })

        db.session.commit()

        logger.info(f"Generated {len(saved_questions)} TN questions for course {course_id}")

        return jsonify({
            'message': f'Generated {len(saved_questions)} TN questions (pending approval)',
            'questions': saved_questions,
            'aa_distribution': aa_distribution
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error generating TN questions: {e}")
        return jsonify({'error': str(e)}), 500


@question_bank_api_bp.route('/tn/approve/<int:course_id>', methods=['POST'])
@jwt_required()
@teacher_required
def approve_tn_questions(course_id):
    """
    Approve TN-generated questions with AAA normalization

    Request Body:
        {
            "question_ids": [1, 2, 3],
            "chapter_mapping": {  // Map questions to chapters
                "1": 5,  // question_id: chapter_id
                ...
            }
        }

    Returns:
        200: Questions approved
        403: If user is not teacher
    """
    try:
        user = get_current_user()
        data = request.get_json()

        question_ids = data.get('question_ids', [])
        chapter_mapping = data.get('chapter_mapping', {})

        # Verify course access
        course = Course.query.get_or_404(course_id)
        is_owner = user.is_teacher and course.teacher_id == user.id
        is_admin_only = user.is_superuser and not user.is_teacher
        if not is_owner and not is_admin_only:
            return jsonify({'error': 'Access denied'}), 403

        approved_count = 0

        for qid in question_ids:
            question = QuestionBankQuestion.query.filter_by(
                id=qid,
                course_id=course_id
            ).first()

            if not question:
                continue

            # Update chapter if mapped
            if str(qid) in chapter_mapping:
                question.chapter_id = chapter_mapping[str(qid)]

            # Normalize AA code in clo field
            if question.clo:
                # Ensure format is "AA N"
                normalized = question.clo.strip()
                upper = normalized.upper().replace(' ', '')
                digits = ''.join(__import__('re').findall(r'\d+', normalized))
                if digits:
                    normalized = f"AA {digits}"
                question.clo = normalized

            # Approve
            question.approved_at = datetime.utcnow()
            question.approved_by_id = user.id
            approved_count += 1

        db.session.commit()

        return jsonify({
            'message': f'Approved {approved_count} TN questions',
            'approved': approved_count
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error approving TN questions: {e}")
        return jsonify({'error': str(e)}), 500


@question_bank_api_bp.route('/revision/<int:course_id>', methods=['GET'])
@jwt_required()
def get_revision_options(course_id):
    """
    Get filter options for setting up a revision quiz

    Returns available filters:
        - Chapters
        - AAA codes
        - Bloom levels
        - Difficulty levels

    Returns:
        200: Filter options
        404: Course not found
    """
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)

        # Get chapters
        chapters = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).all()

        # Get distinct AAA codes from approved questions
        aaa_codes = set()
        questions = QuestionBankQuestion.query.filter(
            QuestionBankQuestion.course_id == course_id,
            QuestionBankQuestion.approved_at.isnot(None),
            QuestionBankQuestion.clo.isnot(None)
        ).all()

        for q in questions:
            if q.clo:
                codes = re.split(r'[,;|]', q.clo)
                for code in codes:
                    code = code.strip()
                    if code:
                        aaa_codes.add(code)

        # Get distinct bloom levels
        bloom_levels = db.session.query(
            QuestionBankQuestion.bloom_level
        ).filter(
            QuestionBankQuestion.course_id == course_id,
            QuestionBankQuestion.approved_at.isnot(None),
            QuestionBankQuestion.bloom_level.isnot(None)
        ).distinct().all()

        # Get distinct difficulty levels
        difficulty_levels = db.session.query(
            QuestionBankQuestion.difficulty
        ).filter(
            QuestionBankQuestion.course_id == course_id,
            QuestionBankQuestion.approved_at.isnot(None),
            QuestionBankQuestion.difficulty.isnot(None)
        ).distinct().all()

        return jsonify({
            'course': {
                'id': course.id,
                'title': course.title
            },
            'filter_options': {
                'chapters': [
                    {'id': ch.id, 'title': ch.title, 'order': ch.order}
                    for ch in chapters
                ],
                'aaa_codes': sorted(list(aaa_codes)),
                'bloom_levels': sorted([b[0] for b in bloom_levels if b[0]]),
                'difficulty_levels': sorted([d[0] for d in difficulty_levels if d[0]])
            },
            'total_approved_questions': QuestionBankQuestion.query.filter(
                QuestionBankQuestion.course_id == course_id,
                QuestionBankQuestion.approved_at.isnot(None)
            ).count()
        }), 200

    except Exception as e:
        logger.error(f"Error getting revision options: {e}")
        return jsonify({'error': str(e)}), 500


@question_bank_api_bp.route('/revision/<int:course_id>', methods=['POST'])
@jwt_required()
def take_revision_quiz(course_id):
    """
    Create a revision quiz from question bank with filters and random selection

    Request Body:
        {
            "num_questions": 10,
            "chapter_ids": [1, 2],  // Optional
            "aaa_codes": ["AAA1", "AAA2"],  // Optional
            "bloom_levels": ["remember", "apply"],  // Optional
            "difficulty_levels": ["medium", "hard"]  // Optional
        }

    Returns:
        200: Quiz created (without answers)
        400: Validation error or insufficient questions
    """
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        course = Course.query.get_or_404(course_id)
        data = request.get_json()

        num_questions = data.get('num_questions', 10)
        chapter_ids = data.get('chapter_ids', [])
        aaa_codes = data.get('aaa_codes', [])
        bloom_levels = data.get('bloom_levels', [])
        difficulty_levels = data.get('difficulty_levels', [])

        # Build query for approved questions
        query = QuestionBankQuestion.query.filter(
            QuestionBankQuestion.course_id == course_id,
            QuestionBankQuestion.approved_at.isnot(None)
        )

        # Apply filters
        if chapter_ids:
            query = query.filter(QuestionBankQuestion.chapter_id.in_(chapter_ids))

        if aaa_codes:
            filters = [QuestionBankQuestion.clo.ilike(f'%{code}%') for code in aaa_codes]
            query = query.filter(or_(*filters))

        if bloom_levels:
            query = query.filter(QuestionBankQuestion.bloom_level.in_(bloom_levels))

        if difficulty_levels:
            query = query.filter(QuestionBankQuestion.difficulty.in_(difficulty_levels))

        # Get all matching questions
        available_questions = query.all()

        # Feature 6: prioritize approved bank questions, use what's available
        if len(available_questions) >= num_questions:
            selected_questions = random.sample(available_questions, num_questions)
            source = 'bank'
        elif len(available_questions) > 0:
            selected_questions = available_questions
            source = 'bank'
            num_questions = len(selected_questions)
        else:
            return jsonify({
                'error': f'No approved questions found for this course with the given filters'
            }), 400

        # Determine chapter_id for the PracticeQuiz (required field).
        # Use the first selected chapter, or the first chapter of the course.
        if chapter_ids:
            quiz_chapter_id = chapter_ids[0]
        else:
            first_chapter = Chapter.query.filter_by(course_id=course_id).order_by(Chapter.order).first()
            if not first_chapter:
                return jsonify({'error': 'Course has no chapters'}), 400
            quiz_chapter_id = first_chapter.id

        # Create practice quiz for revision
        practice_quiz = PracticeQuiz(
            course_id=course_id,
            chapter_id=quiz_chapter_id,
            student_id=user.id,
            num_questions=num_questions,
        )
        db.session.add(practice_quiz)
        db.session.flush()  # Get quiz ID

        # Add questions to quiz (without answers for student)
        for q_bank_question in selected_questions:
            question = PracticeQuizQuestion(
                practice_quiz_id=practice_quiz.id,
                question_text=q_bank_question.question_text,
                question_type=q_bank_question.question_type,
                choice_a=q_bank_question.choice_a,
                choice_b=q_bank_question.choice_b,
                choice_c=q_bank_question.choice_c,
                correct_choice=q_bank_question.correct_choice,
                explanation=q_bank_question.explanation,
                bloom_level=q_bank_question.bloom_level,
                difficulty=q_bank_question.difficulty,
                clo=q_bank_question.clo,
                source_question_id=q_bank_question.id,
            )
            db.session.add(question)

        db.session.commit()

        # Return quiz without answers
        quiz_questions = PracticeQuizQuestion.query.filter_by(practice_quiz_id=practice_quiz.id).all()

        return jsonify({
            'message': 'Revision quiz created',
            'source': source,
            'quiz': {
                'id': practice_quiz.id,
                'course_id': practice_quiz.course_id,
                'chapter_id': practice_quiz.chapter_id,
                'created_at': practice_quiz.created_at.isoformat() if practice_quiz.created_at else None,
                'num_questions': len(quiz_questions),
            },
            'questions': [
                {
                    'id': q.id,
                    'question_text': q.question_text,
                    'question_type': q.question_type,
                    'choice_a': q.choice_a if q.question_type == 'mcq' else None,
                    'choice_b': q.choice_b if q.question_type == 'mcq' else None,
                    'choice_c': q.choice_c if q.question_type == 'mcq' else None,
                    'bloom_level': q.bloom_level,
                    'difficulty': q.difficulty,
                    # Note: correct_choice is NOT included
                }
                for q in quiz_questions
            ],
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating revision quiz: {e}")
        return jsonify({'error': str(e)}), 500


@question_bank_api_bp.route('/aaas', methods=['GET'])
@jwt_required()
@teacher_required
def get_aaa_codes():
    """
    Get list of AAA codes for a course

    Query Parameters:
        course_id: Optional - Filter by course

    Returns:
        200: List of AAA codes with metadata
    """
    try:
        course_id = request.args.get('course_id', type=int)

        if course_id:
            # Get AAAs from TNAA table for the course
            # Use direct syllabus relationship instead of joining through sections/chapters
            tn_aas = (TNAA.query
                .join(TNAA.syllabus)
                .filter(Syllabus.course_id == course_id)
                .order_by(TNAA.number)
                .distinct()
                .all())

            return jsonify({
                'aaas': [
                    {
                        'number': aa.number,
                        'code': f"AA {aa.number}",
                        'description': aa.description,
                        'section_links': len(aa.section_links) if aa.section_links else 0,
                        'chapter_links': len(aa.chapter_links) if aa.chapter_links else 0
                    }
                    for aa in tn_aas
                ]
            }), 200
        else:
            # Get distinct AAA codes from question bank
            codes = set()
            questions = QuestionBankQuestion.query.filter(
                QuestionBankQuestion.clo.isnot(None)
            ).all()

            for q in questions:
                if q.clo:
                    parsed = re.split(r'[,;|]', q.clo)
                    for code in parsed:
                        code = code.strip()
                        if code:
                            codes.add(code)

            return jsonify({
                'aaas': [
                    {'code': code}
                    for code in sorted(codes)
                ]
            }), 200

    except Exception as e:
        logger.error(f"Error getting AAA codes: {e}")
        return jsonify({'error': str(e)}), 500


@question_bank_api_bp.route('/migrate-from-documents', methods=['POST'])
@jwt_required()
def migrate_from_documents():
    """
    Migrate approved quiz questions from Document.quiz_data to QuestionBankQuestion table.
    This is a one-time migration for questions approved before auto-save feature.

    Teacher/superuser only.

    Request Body:
        {
            "course_id": 123  // Optional - if not provided, migrate all courses
        }

    Returns:
        200: Migration results with counts
        403: If user is not teacher/superuser
        500: Server error
    """
    try:
        user = get_current_user()
        if not user or (not user.is_teacher and not user.is_superuser):
            return jsonify({'error': 'Access denied'}), 403

        # Get course_id from request (optional - if not provided, migrate all courses)
        data = request.get_json() or {}
        course_id = data.get('course_id')

        # Build query for Documents with quiz_data
        query = Document.query.filter(
            Document.document_type == 'quiz',
            Document.quiz_data.isnot(None)
        )

        if course_id:
            query = query.filter(Document.course_id == course_id)
            # Verify teacher owns this course
            course = Course.query.get(course_id)
            if course:
                is_owner = user.is_teacher and course.teacher_id == user.id
                is_admin_only = user.is_superuser and not user.is_teacher
                if not is_owner and not is_admin_only:
                    return jsonify({'error': 'Access denied to this course'}), 403
        elif user.is_teacher:
            # Teacher without course_id - only migrate their courses
            query = query.join(Course).filter(Course.teacher_id == user.id)

        quiz_documents = query.all()

        migrated_count = 0
        skipped_count = 0
        error_count = 0

        for doc in quiz_documents:
            try:
                if not doc.quiz_data or not isinstance(doc.quiz_data, list):
                    skipped_count += 1
                    continue

                for question_data in doc.quiz_data:
                    # Check if question already exists (avoid duplicates)
                    # Match on question_text + course_id
                    question_text = question_data.get('question', '')
                    if not question_text:
                        continue

                    existing = QuestionBankQuestion.query.filter(
                        QuestionBankQuestion.course_id == doc.course_id,
                        QuestionBankQuestion.question_text == question_text
                    ).first()

                    if existing:
                        skipped_count += 1
                        continue

                    # Create new QuestionBankQuestion
                    question_type = question_data.get('question_type', 'mcq')

                    bank_question = QuestionBankQuestion(
                        course_id=doc.course_id,
                        chapter_id=doc.chapter_id,  # May be None for multi-chapter quizzes
                        question_text=question_text,
                        question_type=question_type,
                        choice_a=question_data.get('choice_a', '') if question_type == 'mcq' else None,
                        choice_b=question_data.get('choice_b', '') if question_type == 'mcq' else None,
                        choice_c=question_data.get('choice_c', '') if question_type == 'mcq' else None,
                        correct_choice=question_data.get('correct_choice', '') if question_type == 'mcq' else None,
                        explanation=question_data.get('explanation', ''),
                        bloom_level=question_data.get('bloom_level', ''),
                        difficulty=question_data.get('difficulty_level', 'medium'),
                        clo=question_data.get('clo', ''),
                        approved_at=doc.created_at or datetime.utcnow(),  # Use doc creation time
                        approved_by_id=user.id  # Credit to teacher running migration
                    )
                    db.session.add(bank_question)
                    migrated_count += 1

            except Exception as e:
                error_count += 1
                logger.error(f"Error migrating document {doc.id}: {e}")
                continue

        db.session.commit()

        logger.info(f"Migration complete: {migrated_count} questions migrated, {skipped_count} skipped, {error_count} errors")

        return jsonify({
            'message': 'Migration completed',
            'migrated': migrated_count,
            'skipped': skipped_count,
            'errors': error_count,
            'documents_processed': len(quiz_documents)
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Migration failed: {e}")
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Feature 3: Start & Submit exercise as quiz
# ---------------------------------------------------------------------------

@question_bank_api_bp.route('/exercises/<int:exercise_id>/start', methods=['POST'])
@jwt_required()
def start_exercise(exercise_id):
    """
    Start a QuestionBankExercise as a PracticeQuiz.
    Creates a PracticeQuiz from the exercise's questions (in exercise_order).
    Returns the quiz with questions (no answers for students).
    """
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        exercise = QuestionBankExercise.query.get_or_404(exercise_id)

        # Verify enrollment or teacher access
        course = Course.query.get(exercise.course_id)
        if not course:
            return jsonify({'error': 'Course not found'}), 404

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = bool(Enrollment.query.filter_by(
            student_id=user.id, course_id=course.id
        ).first())

        if not is_teacher and not is_enrolled and not user.is_superuser:
            return jsonify({'error': 'Access denied'}), 403

        # Get exercise questions ordered by exercise_order
        questions = QuestionBankQuestion.query.filter_by(
            exercise_id=exercise_id
        ).order_by(QuestionBankQuestion.exercise_order).all()

        if not questions:
            return jsonify({'error': 'Exercise has no questions'}), 400

        # Determine chapter_id
        chapter_id = exercise.chapter_id
        if not chapter_id:
            first_chapter = Chapter.query.filter_by(
                course_id=exercise.course_id
            ).order_by(Chapter.order).first()
            chapter_id = first_chapter.id if first_chapter else None
        if not chapter_id:
            return jsonify({'error': 'No chapter found for this exercise'}), 400

        # Create PracticeQuiz
        practice_quiz = PracticeQuiz(
            course_id=exercise.course_id,
            chapter_id=chapter_id,
            student_id=user.id,
            num_questions=len(questions),
        )
        db.session.add(practice_quiz)
        db.session.flush()

        # Copy questions to PracticeQuizQuestion (respecting exercise_order)
        for q in questions:
            pq = PracticeQuizQuestion(
                practice_quiz_id=practice_quiz.id,
                question_text=q.question_text,
                question_type=q.question_type,
                choice_a=q.choice_a,
                choice_b=q.choice_b,
                choice_c=q.choice_c,
                correct_choice=q.correct_choice,
                explanation=q.explanation,
                bloom_level=q.bloom_level,
                difficulty=q.difficulty,
                clo=q.clo,
                source_question_id=q.id,
            )
            db.session.add(pq)

        db.session.commit()

        quiz_questions = PracticeQuizQuestion.query.filter_by(
            practice_quiz_id=practice_quiz.id
        ).all()

        return jsonify({
            'message': 'Exercise quiz started',
            'quiz': {
                'id': practice_quiz.id,
                'course_id': practice_quiz.course_id,
                'chapter_id': practice_quiz.chapter_id,
                'exercise_id': exercise_id,
                'exercise_title': exercise.title,
                'num_questions': len(quiz_questions),
                'created_at': practice_quiz.created_at.isoformat() if practice_quiz.created_at else None,
            },
            'questions': [
                {
                    'id': q.id,
                    'question_text': q.question_text,
                    'question_type': q.question_type,
                    'choice_a': q.choice_a if q.question_type in ('mcq', 'true_false') else None,
                    'choice_b': q.choice_b if q.question_type in ('mcq', 'true_false') else None,
                    'choice_c': q.choice_c if q.question_type in ('mcq', 'true_false') else None,
                    'bloom_level': q.bloom_level,
                    'difficulty': q.difficulty,
                }
                for q in quiz_questions
            ],
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error starting exercise: {e}")
        return jsonify({'error': str(e)}), 500


@question_bank_api_bp.route('/exercises/<int:exercise_id>/submit', methods=['POST'])
@jwt_required()
def submit_exercise(exercise_id):
    """
    Submit answers for an exercise quiz.
    Accepts answers, grades them.
    For TP exercises: records score for gradebook integration.

    Request Body:
        {
            "quiz_id": 123,
            "answers": {
                "<question_id>": "A" | "B" | "C" | "<open_ended_text>"
            }
        }
    """
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        exercise = QuestionBankExercise.query.get_or_404(exercise_id)
        data = request.get_json()
        quiz_id = data.get('quiz_id')
        answers = data.get('answers', {})

        if not quiz_id:
            return jsonify({'error': 'quiz_id is required'}), 400

        practice_quiz = PracticeQuiz.query.get_or_404(quiz_id)

        # Verify ownership
        if practice_quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        if practice_quiz.completed_at:
            return jsonify({'error': 'Quiz already submitted'}), 400

        # Grade the questions
        quiz_questions = PracticeQuizQuestion.query.filter_by(
            practice_quiz_id=practice_quiz.id
        ).all()

        correct_count = 0
        total = len(quiz_questions)
        results = []

        for q in quiz_questions:
            student_answer = answers.get(str(q.id), '')
            q.student_choice = student_answer

            if q.question_type in ('mcq', 'true_false'):
                is_correct = (
                    student_answer.strip().upper() == (q.correct_choice or '').strip().upper()
                )
                q.is_correct = is_correct
                if is_correct:
                    correct_count += 1
            else:
                # Open-ended: mark as pending (teacher grades manually)
                q.is_correct = None

            results.append({
                'id': q.id,
                'question_text': q.question_text,
                'question_type': q.question_type,
                'student_choice': student_answer,
                'correct_choice': q.correct_choice,
                'is_correct': q.is_correct,
                'explanation': q.explanation,
            })

        # Calculate score
        mcq_questions = [q for q in quiz_questions if q.question_type in ('mcq', 'true_false')]
        if mcq_questions:
            score = round((correct_count / len(mcq_questions)) * 100, 2)
        else:
            score = 0.0

        practice_quiz.score = score
        practice_quiz.completed_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'message': 'Exercise submitted',
            'quiz_id': practice_quiz.id,
            'exercise_id': exercise_id,
            'exercise_type': exercise.exercise_type,
            'score': score,
            'correct': correct_count,
            'total': total,
            'is_tp': exercise.exercise_type == 'tp',
            'results': results,
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error submitting exercise: {e}")
        return jsonify({'error': str(e)}), 500


# ── Exercise PDF → Quiz extraction ───────────────────────────────────────────

@question_bank_api_bp.route('/courses/<int:course_id>/exercises/extract-to-quiz', methods=['POST'])
@jwt_required()
@teacher_required
def extract_exercises_to_quiz(course_id):
    """
    Extract exercises from course documents and generate quiz questions.
    Teacher-only endpoint.

    Request Body (optional):
        { "chapter_id": <int> }   — restrict to a single chapter's documents

    Returns:
        200: { success, stored_count, exercises_found, errors }
        403: If user is not teacher or not course owner
        404: Course not found
    """
    try:
        user = get_current_user()
        course = Course.query.get_or_404(course_id)

        is_owner = user.is_teacher and course.teacher_id == user.id
        is_admin = user.is_superuser if hasattr(user, 'is_superuser') else False
        if not is_owner and not is_admin:
            return jsonify({'error': 'Teacher access required'}), 403

        data = request.get_json() or {}
        chapter_id = data.get('chapter_id')

        from app.services.exercise_extractor_agent import run_exercise_extraction
        result = run_exercise_extraction(course_id, user.id, chapter_id)

        return jsonify({
            'success': True,
            'stored_count': result.get('stored_count', 0),
            'exercises_found': len(result.get('exercises', [])),
            'errors': result.get('errors', []),
        }), 200

    except Exception as e:
        logger.error(f"Error in extract_exercises_to_quiz: {e}")
        return jsonify({'error': str(e)}), 500
