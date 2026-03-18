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
    Document, Enrollment, TNAA, TNSection, TNChapter, Syllabus
)
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
        if course.teacher_id != user.id and not user.is_superuser:
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
        if course.teacher_id != user.id and not user.is_superuser:
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
        if course.teacher_id != user.id and not user.is_superuser:
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
        if course.teacher_id != user.id and not user.is_superuser:
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

            # Normalize AAA code in clo field
            if question.clo:
                # Ensure format is "AAAn"
                normalized = question.clo.upper().strip()
                if not normalized.startswith('AAA'):
                    if normalized.startswith('AA'):
                        normalized = 'A' + normalized
                    elif normalized.startswith('A'):
                        normalized = 'AA' + normalized
                    else:
                        normalized = 'AAA' + normalized
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

        if len(available_questions) < num_questions:
            return jsonify({
                'error': f'Insufficient questions. Found {len(available_questions)}, need {num_questions}'
            }), 400

        # Randomly select questions
        selected_questions = random.sample(available_questions, num_questions)

        # Create quiz
        quiz = Quiz(
            student_id=user.id,
            course_id=course_id,
            title=f"Revision Quiz - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            quiz_type='revision'
        )
        db.session.add(quiz)
        db.session.flush()  # Get quiz ID

        # Add questions to quiz
        for q_bank_question in selected_questions:
            question = QuizQuestion(
                quiz_id=quiz.id,
                question_text=q_bank_question.question_text,
                question_type=q_bank_question.question_type,
                choice_a=q_bank_question.choice_a,
                choice_b=q_bank_question.choice_b,
                choice_c=q_bank_question.choice_c,
                correct_choice=q_bank_question.correct_choice,
                explanation=q_bank_question.explanation,
                bloom_level=q_bank_question.bloom_level,
                difficulty=q_bank_question.difficulty,
                clo=q_bank_question.clo
            )
            db.session.add(question)

        db.session.commit()

        # Return quiz without answers
        quiz_questions = QuizQuestion.query.filter_by(quiz_id=quiz.id).all()

        return jsonify({
            'message': 'Revision quiz created',
            'quiz': {
                'id': quiz.id,
                'title': quiz.title,
                'course_id': quiz.course_id,
                'created_at': quiz.created_at.isoformat() if quiz.created_at else None,
                'num_questions': len(quiz_questions)
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
                    'difficulty': q.difficulty
                    # Note: correct_choice is NOT included
                }
                for q in quiz_questions
            ]
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
                        'code': f"AAA{aa.number}",
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
            if course and course.teacher_id != user.id and not user.is_superuser:
                return jsonify({'error': 'Access denied to this course'}), 403
        elif user.is_teacher and not user.is_superuser:
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
