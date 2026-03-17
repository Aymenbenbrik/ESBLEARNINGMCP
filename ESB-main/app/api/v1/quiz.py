from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from app import db
from app.models import User, Document, Quiz, QuizQuestion, Enrollment, Course, Chapter, QuizBloomStatistic, QuizCLOStatistic, QuizViolation
from app.services.ai_service import generate_quiz_questions
from app.api.v1.utils import teacher_required
import logging
import re

logger = logging.getLogger(__name__)

quiz_api_bp = Blueprint('quiz_api', __name__, url_prefix='/quiz')


# ============================================================
# HELPER FUNCTIONS (copied from app/routes/quiz.py)
# ============================================================

def get_syllabus_for_week(course_id, week_num):
    """Get syllabus data for a specific week"""
    from app.models import Syllabus
    syllabus = Syllabus.query.filter_by(course_id=course_id).first()
    if not syllabus or not syllabus.weekly_plan:
        return {'text': '', 'clos': [], 'attachments': []}

    for week_data in syllabus.weekly_plan:
        if str(week_data.get('Week#')) == str(week_num):
            return {
                'text': week_data.get('Class Objectives', ''),
                'clos': week_data.get('CLOs', []),
                'attachments': []
            }

    return {'text': '', 'clos': [], 'attachments': []}


def calculate_quiz_statistics(questions):
    """Calculate bloom and CLO statistics from questions"""
    bloom_stats = {}
    clo_stats = {}

    for question in questions:
        bloom_level = getattr(question, 'bloom_level', None) or 'N/A'
        clo = getattr(question, 'clo', None) or 'N/A'

        is_correct = question.is_correct if question.is_correct is not None else False

        # Bloom stats
        if bloom_level != 'N/A' and bloom_level:
            bloom_level = bloom_level.lower()
            if bloom_level not in bloom_stats:
                bloom_stats[bloom_level] = {'total': 0, 'correct': 0}
            bloom_stats[bloom_level]['total'] += 1
            if is_correct:
                bloom_stats[bloom_level]['correct'] += 1

        # CLO stats
        if clo != 'N/A' and clo:
            if clo not in clo_stats:
                clo_stats[clo] = {'total': 0, 'correct': 0}
            clo_stats[clo]['total'] += 1
            if is_correct:
                clo_stats[clo]['correct'] += 1

    # Calculate success rates
    for bloom_level in bloom_stats:
        total = bloom_stats[bloom_level]['total']
        correct = bloom_stats[bloom_level]['correct']
        bloom_stats[bloom_level]['success_rate'] = round((correct / total * 100), 1) if total > 0 else 0

    for clo in clo_stats:
        total = clo_stats[clo]['total']
        correct = clo_stats[clo]['correct']
        clo_stats[clo]['success_rate'] = round((correct / total * 100), 1) if total > 0 else 0

    return bloom_stats, clo_stats


def save_quiz_statistics(quiz_id, bloom_stats, clo_stats):
    """Save statistics to database"""
    try:
        # Delete old statistics
        QuizBloomStatistic.query.filter_by(quiz_id=quiz_id).delete()
        QuizCLOStatistic.query.filter_by(quiz_id=quiz_id).delete()

        # Save Bloom statistics
        for bloom_level, stats in bloom_stats.items():
            bloom_stat = QuizBloomStatistic(
                quiz_id=quiz_id,
                bloom_level=bloom_level,
                total_questions=stats['total'],
                correct_answers=stats['correct'],
                success_rate=stats['success_rate']
            )
            db.session.add(bloom_stat)

        # Save CLO statistics
        for clo_name, stats in clo_stats.items():
            clo_stat = QuizCLOStatistic(
                quiz_id=quiz_id,
                clo_name=clo_name,
                total_questions=stats['total'],
                correct_answers=stats['correct'],
                success_rate=stats['success_rate']
            )
            db.session.add(clo_stat)

        db.session.commit()
        logger.info(f"Saved statistics for quiz {quiz_id}")
    except Exception as e:
        logger.error(f"Error saving statistics: {str(e)}")
        db.session.rollback()


# ============================================================
# ENDPOINTS
# ============================================================

def _get_course_from_quiz(quiz):
    """Safely resolve Course from a Quiz that may have document_id=None."""
    if quiz.document:
        doc = quiz.document
        if doc.chapter_id:
            return doc.chapter.course
        elif doc.course_id:
            return Course.query.get(doc.course_id)
    if quiz.chapter:
        return quiz.chapter.course
    return None


@quiz_api_bp.route('/setup/<int:document_id>', methods=['POST'])
@jwt_required()
def setup_quiz(document_id):
    """
    Create a new quiz for a document (Teacher-only: for creating course test quizzes).
    Request body: {num_questions: int (3-20, default 5)}
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Get course context
        if document.chapter_id:
            chapter = document.chapter
            course = chapter.course
        elif document.course_id:
            course = Course.query.get(document.course_id)
        else:
            return jsonify({'error': 'Document not associated with a course'}), 400

        # Check enrollment
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()
        if not is_enrolled:
            return jsonify({'error': 'You need to enroll in this course first'}), 403

        # Check for existing completed quiz
        completed_quiz = Quiz.query.filter_by(
            document_id=document_id,
            student_id=user.id
        ).filter(Quiz.completed_at.isnot(None)).first()

        if completed_quiz:
            return jsonify({'error': 'You have already completed this quiz', 'quiz_id': completed_quiz.id}), 400

        # Check for incomplete quiz
        incomplete_quiz = Quiz.query.filter_by(
            document_id=document_id,
            student_id=user.id,
            completed_at=None
        ).first()

        if incomplete_quiz:
            return jsonify({
                'message': 'You have an incomplete quiz. Resume it.',
                'quiz_id': incomplete_quiz.id,
                'num_questions': incomplete_quiz.num_questions
            }), 200

        # Get num_questions from request
        data = request.get_json() or {}
        num_questions = data.get('num_questions', 5)

        if not isinstance(num_questions, int) or num_questions < 3 or num_questions > 20:
            return jsonify({'error': 'num_questions must be between 3 and 20'}), 400

        # Create new quiz
        # NOTE: Some deployments do not have quiz.chapter_id in DB schema.
        # The chapter context is available through Document.chapter_id, so we
        # keep document_id as the source of truth and avoid passing chapter_id.
        quiz = Quiz(
            document_id=document_id,
            student_id=user.id,
            num_questions=num_questions,
            completed_at=None
        )
        db.session.add(quiz)
        db.session.flush()

        logger.info(f"Created new quiz {quiz.id} for student {user.id}")

        # Check if document has pre-existing quiz_data (teacher-created quiz)
        if document.quiz_data and len(document.quiz_data) > 0:
            logger.info(f"Using pre-existing quiz_data with {len(document.quiz_data)} questions")
            questions = document.quiz_data
        else:
            # Generate questions from syllabus (document-based quiz)
            logger.info(f"Generating new questions from syllabus")
            week_num = getattr(document, 'week_number', 1)
            weekly_syllabus = get_syllabus_for_week(course.id, week_num)
            clos = weekly_syllabus.get('clos', [])

            questions = generate_quiz_questions(
                week_content=weekly_syllabus.get('text', ''),
                clos=clos,
                attachments_texts=[],
                num_questions=num_questions,
                difficulty='medium'
            )

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
                difficulty=question_data.get('difficulty_level', 'N/A'),
                question_type='mcq' if has_choices else 'open_ended'
            )
            db.session.add(quiz_question)

        db.session.commit()
        logger.info(f"Generated {len(questions)} questions for quiz {quiz.id}")

        return jsonify({
            'message': 'Quiz created successfully',
            'quiz_id': quiz.id,
            'num_questions': len(questions)
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating quiz: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/<int:quiz_id>', methods=['GET'])
@jwt_required()
def get_quiz(quiz_id):
    """
    Get quiz metadata.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        quiz = Quiz.query.get_or_404(quiz_id)

        # Access control: owner or teacher
        course = _get_course_from_quiz(quiz)
        if not course:
            return jsonify({'error': 'Quiz not linked to any course'}), 400

        is_owner = quiz.student_id == user.id
        is_teacher = user.is_teacher and course.teacher_id == user.id

        if not is_owner and not is_teacher:
            return jsonify({'error': 'Access denied'}), 403

        return jsonify({
            'id': quiz.id,
            'document_id': quiz.document_id,
            'student_id': quiz.student_id,
            'num_questions': quiz.num_questions,
            'score': quiz.score,
            'completed_at': quiz.completed_at.isoformat() if quiz.completed_at else None,
            'is_completed': quiz.completed_at is not None,
            'created_at': quiz.created_at.isoformat() if quiz.created_at else None,
            'is_disqualified': quiz.is_disqualified,
            'violations_count': quiz.violations_count,
            'disqualified_at': quiz.disqualified_at.isoformat() if quiz.disqualified_at else None
        }), 200

    except Exception as e:
        logger.error(f"Error getting quiz: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/<int:quiz_id>/questions', methods=['GET'])
@jwt_required()
def get_questions(quiz_id):
    """
    Get all questions for a quiz.
    If not completed, hide correct answers.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        quiz = Quiz.query.get_or_404(quiz_id)

        # Access control
        course = _get_course_from_quiz(quiz)
        if not course:
            return jsonify({'error': 'Quiz not linked to any course'}), 400

        is_owner = quiz.student_id == user.id
        is_teacher = user.is_teacher and course.teacher_id == user.id

        if not is_owner and not is_teacher:
            return jsonify({'error': 'Access denied'}), 403

        questions = list(quiz.questions)
        is_completed = quiz.completed_at is not None

        questions_data = []
        for idx, q in enumerate(questions):
            q_data = {
                'index': idx,
                'question_text': q.question_text,
                'choice_a': q.choice_a,
                'choice_b': q.choice_b,
                'choice_c': q.choice_c,
                'question_type': q.question_type,
                'student_choice': q.student_choice,
                'bloom_level': q.bloom_level,
                'clo': q.clo,
                'difficulty': q.difficulty
            }

            # Show correct answer and explanation only if completed
            if is_completed:
                q_data['correct_choice'] = q.correct_choice
                q_data['explanation'] = q.explanation
                q_data['is_correct'] = q.is_correct

            questions_data.append(q_data)

        return jsonify({
            'questions': questions_data,
            'total': len(questions),
            'is_completed': is_completed
        }), 200

    except Exception as e:
        logger.error(f"Error getting questions: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/<int:quiz_id>/answer/<int:question_index>', methods=['POST'])
@jwt_required()
def submit_answer(quiz_id, question_index):
    """
    Submit answer for a question.
    Request body: {answer: str}
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        quiz = Quiz.query.get_or_404(quiz_id)

        # Ownership check
        if quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        # Check if already completed
        if quiz.completed_at is not None:
            return jsonify({'error': 'Quiz already completed'}), 400

        # Check if disqualified
        if quiz.is_disqualified:
            return jsonify({'error': 'Quiz has been disqualified'}), 403

        questions = list(quiz.questions)

        if question_index < 0 or question_index >= len(questions):
            return jsonify({'error': 'Invalid question index'}), 400

        current_question = questions[question_index]

        # Get answer from request
        data = request.get_json() or {}
        student_answer = data.get('answer', '').strip()

        if not student_answer:
            return jsonify({'error': 'Answer is required'}), 400

        # Determine question type
        is_mcq = (current_question.choice_a and current_question.choice_b and
                 current_question.choice_c and
                 len(current_question.choice_a.strip()) > 0)

        # Save answer
        current_question.student_choice = student_answer
        current_question.question_type = 'mcq' if is_mcq else 'open_ended'

        if is_mcq:
            # Auto-grade MCQ
            current_question.is_correct = (
                student_answer.upper() == current_question.correct_choice.upper()
            )
        else:
            # Open-ended: pending
            current_question.is_correct = None

        db.session.commit()
        logger.debug(f"Answer saved for quiz {quiz_id}, question {question_index}")

        next_index = question_index + 1
        is_last = next_index >= len(questions)

        return jsonify({
            'message': 'Answer submitted',
            'next_index': next_index if not is_last else None,
            'is_last': is_last
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error submitting answer: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/<int:quiz_id>/complete', methods=['POST'])
@jwt_required()
def complete_quiz(quiz_id):
    """
    Complete the quiz - grade all questions and calculate score.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        quiz = Quiz.query.get_or_404(quiz_id)

        # Ownership check
        if quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        # Check if already completed
        if quiz.completed_at is not None:
            return jsonify({
                'message': 'Quiz already completed',
                'score': quiz.score,
                'completed_at': quiz.completed_at.isoformat()
            }), 200

        # Check if disqualified
        if quiz.is_disqualified:
            return jsonify({'error': 'Quiz has been disqualified'}), 403

        questions = list(quiz.questions)

        if not questions:
            quiz.completed_at = datetime.utcnow()
            quiz.score = 0
            db.session.commit()
            return jsonify({'message': 'Quiz has no questions', 'score': 0}), 200

        logger.info(f"Grading {len(questions)} questions for quiz {quiz_id}")

        # Grade all questions
        total_score = 0
        total_questions = 0
        mcq_correct = 0
        mcq_total = 0

        for q in questions:
            is_mcq = (q.choice_a and q.choice_b and q.choice_c and
                     len(q.choice_a.strip()) > 0)

            if is_mcq:
                mcq_total += 1
                total_questions += 1
                if q.student_choice and q.correct_choice:
                    is_correct = (q.student_choice.upper() == q.correct_choice.upper())
                    q.is_correct = is_correct
                    if is_correct:
                        mcq_correct += 1
                        total_score += 100
                else:
                    q.is_correct = False
            else:
                # Open-ended: pending
                total_questions += 1
                if q.student_choice and len(q.student_choice.strip()) > 0:
                    q.is_correct = None
                    q.score = 50
                    total_score += 50
                else:
                    q.is_correct = False
                    q.score = 0

        # Extract metadata from explanations
        for q in questions:
            explanation = q.explanation or ''
            metadata_match = re.search(
                r'\[METADATA: CLO=([^,]+), BLOOM=([^,]+), DIFFICULTY=([^,]+)',
                explanation
            )

            if metadata_match:
                q.clo = metadata_match.group(1).strip()
                q.bloom_level = metadata_match.group(2).strip().lower()
                q.difficulty = metadata_match.group(3).strip()
            else:
                if not q.clo or q.clo == 'N/A':
                    q.clo = 'N/A'
                if not q.bloom_level or q.bloom_level == 'N/A':
                    q.bloom_level = 'N/A'
                if not q.difficulty or q.difficulty == 'N/A':
                    q.difficulty = 'medium'

        # Calculate final score
        if total_questions > 0:
            overall_score = (total_score / (total_questions * 100)) * 100
        else:
            overall_score = 0

        logger.info(f"Final Score: {overall_score:.1f}% ({mcq_correct}/{mcq_total} MCQ)")

        # Calculate statistics
        bloom_stats, clo_stats = calculate_quiz_statistics(questions)

        # Mark as complete
        quiz.score = round(overall_score, 1)
        quiz.completed_at = datetime.utcnow()
        quiz.feedback = f"You scored {overall_score:.1f}% on this quiz. {mcq_correct}/{mcq_total} MCQ questions answered correctly."

        db.session.commit()
        logger.info(f"Quiz {quiz_id} completed at {quiz.completed_at}")

        # Save statistics
        save_quiz_statistics(quiz_id, bloom_stats, clo_stats)

        return jsonify({
            'message': 'Quiz completed successfully',
            'score': quiz.score,
            'completed_at': quiz.completed_at.isoformat()
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error completing quiz: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/<int:quiz_id>/results', methods=['GET'])
@jwt_required()
def get_results(quiz_id):
    """
    Get quiz results with statistics.
    Only available after completion.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        quiz = Quiz.query.get_or_404(quiz_id)

        # Access control
        course = _get_course_from_quiz(quiz)
        if not course:
            return jsonify({'error': 'Quiz not linked to any course'}), 400

        is_owner = quiz.student_id == user.id
        is_teacher = user.is_teacher and course.teacher_id == user.id

        if not is_owner and not is_teacher:
            return jsonify({'error': 'Access denied'}), 403

        # Check completion
        if quiz.completed_at is None:
            return jsonify({'error': 'Quiz not completed yet'}), 400

        questions = list(quiz.questions)

        # Get questions with full details
        questions_data = []
        for idx, q in enumerate(questions):
            questions_data.append({
                'index': idx,
                'question_text': q.question_text,
                'choice_a': q.choice_a,
                'choice_b': q.choice_b,
                'choice_c': q.choice_c,
                'correct_choice': q.correct_choice,
                'student_choice': q.student_choice,
                'explanation': q.explanation,
                'is_correct': q.is_correct,
                'bloom_level': q.bloom_level,
                'clo': q.clo,
                'difficulty': q.difficulty,
                'question_type': q.question_type
            })

        # Load statistics
        bloom_stats = {}
        for stat in quiz.bloom_statistics:
            bloom_stats[stat.bloom_level] = {
                'total': stat.total_questions,
                'correct': stat.correct_answers,
                'success_rate': round(stat.success_rate, 1)
            }

        clo_stats = {}
        for stat in quiz.clo_statistics:
            clo_stats[stat.clo_name] = {
                'total': stat.total_questions,
                'correct': stat.correct_answers,
                'success_rate': round(stat.success_rate, 1)
            }

        # Calculate if not saved
        if not bloom_stats and not clo_stats:
            bloom_stats, clo_stats = calculate_quiz_statistics(questions)

        return jsonify({
            'quiz': {
                'id': quiz.id,
                'score': quiz.score,
                'completed_at': quiz.completed_at.isoformat(),
                'feedback': quiz.feedback,
                'is_disqualified': quiz.is_disqualified,
                'violations_count': quiz.violations_count,
                'disqualified_at': quiz.disqualified_at.isoformat() if quiz.disqualified_at else None
            },
            'questions': questions_data,
            'bloom_stats': bloom_stats,
            'clo_stats': clo_stats
        }), 200

    except Exception as e:
        logger.error(f"Error getting results: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/history/<int:document_id>', methods=['GET'])
@jwt_required()
def get_history(document_id):
    """
    Get quiz history for a document (completed quizzes only).
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        document = Document.query.get_or_404(document_id)

        # Check access
        if document.chapter_id:
            course = document.chapter.course
        else:
            course = Course.query.get(document.course_id)

        is_teacher = user.is_teacher and course.teacher_id == user.id
        is_enrolled = Enrollment.query.filter_by(student_id=user.id, course_id=course.id).first()

        if not is_teacher and not is_enrolled:
            return jsonify({'error': 'Access denied'}), 403

        # Get completed quizzes
        quizzes = Quiz.query.filter_by(
            document_id=document_id,
            student_id=user.id
        ).filter(Quiz.completed_at.isnot(None)).order_by(Quiz.completed_at.desc()).all()

        quizzes_data = []
        for q in quizzes:
            quizzes_data.append({
                'id': q.id,
                'score': q.score,
                'completed_at': q.completed_at.isoformat() if q.completed_at else None,
                'num_questions': q.num_questions
            })

        return jsonify({
            'quizzes': quizzes_data,
            'total': len(quizzes)
        }), 200

    except Exception as e:
        logger.error(f"Error getting history: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/<int:quiz_id>', methods=['DELETE'])
@jwt_required()
def delete_quiz(quiz_id):
    """
    Delete a quiz (teacher only).
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        quiz = Quiz.query.get_or_404(quiz_id)

        # Get course
        course = _get_course_from_quiz(quiz)
        if not course:
            return jsonify({'error': 'Quiz not linked to any course'}), 400

        # Teacher-only check
        if not user.is_teacher or course.teacher_id != user.id:
            return jsonify({'error': 'Access denied. Only the course teacher can delete quizzes.'}), 403

        # Delete quiz (cascade deletes questions/stats)
        db.session.delete(quiz)
        db.session.commit()

        return jsonify({'message': 'Quiz deleted successfully'}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting quiz: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# SAFE EXAM ENDPOINTS
# ============================================================

@quiz_api_bp.route('/<int:quiz_id>/violation', methods=['POST'])
@jwt_required()
def report_violation(quiz_id):
    """
    Report a safe exam violation (student calls this on each detected event).
    Body: { "violation_type": "fullscreen_exit" }
    First violation → warning. Second → disqualified.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        quiz = Quiz.query.get_or_404(quiz_id)

        # Ownership check
        if quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        # Guard: already done
        if quiz.completed_at is not None:
            return jsonify({'error': 'Quiz already completed'}), 400

        if quiz.is_disqualified:
            return jsonify({'error': 'Quiz already disqualified'}), 400

        data = request.get_json() or {}
        violation_type = data.get('violation_type', '').strip()

        valid_types = {'fullscreen_exit', 'copy', 'paste', 'tab_switch', 'right_click', 'print_screen', 'select_all'}
        if violation_type not in valid_types:
            return jsonify({'error': f'Invalid violation_type. Must be one of: {", ".join(valid_types)}'}), 400

        # Increment count
        quiz.violations_count += 1
        is_warning = quiz.violations_count == 1

        # Save violation record
        violation = QuizViolation(
            quiz_id=quiz.id,
            violation_type=violation_type,
            is_warning=is_warning
        )
        db.session.add(violation)

        # Disqualify on 2nd violation
        if quiz.violations_count >= 2:
            quiz.is_disqualified = True
            quiz.disqualified_at = datetime.utcnow()
            quiz.completed_at = datetime.utcnow()
            quiz.score = 0

        db.session.commit()

        return jsonify({
            'violations_count': quiz.violations_count,
            'is_disqualified': quiz.is_disqualified,
            'is_warning': is_warning
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error reporting violation: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/<int:quiz_id>/disqualify', methods=['POST'])
@jwt_required()
def disqualify_quiz(quiz_id):
    """
    Explicitly disqualify a quiz (student calls this as explicit trigger).
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        quiz = Quiz.query.get_or_404(quiz_id)

        # Ownership check
        if quiz.student_id != user.id:
            return jsonify({'error': 'Access denied'}), 403

        if quiz.is_disqualified:
            return jsonify({'message': 'Quiz already disqualified', 'quiz_id': quiz.id}), 200

        quiz.is_disqualified = True
        quiz.disqualified_at = datetime.utcnow()
        quiz.completed_at = datetime.utcnow()
        quiz.score = 0

        db.session.commit()

        return jsonify({'message': 'Quiz disqualified', 'quiz_id': quiz.id}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error disqualifying quiz: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/<int:quiz_id>/reinstate', methods=['POST'])
@jwt_required()
def reinstate_quiz(quiz_id):
    """
    Reinstate a disqualified quiz (teacher only).
    Resets disqualification and deletes all violation records.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        if not user.is_teacher:
            return jsonify({'error': 'Teacher access required'}), 403

        quiz = Quiz.query.get_or_404(quiz_id)

        # Get course and verify teacher owns it
        course = _get_course_from_quiz(quiz)
        if not course:
            return jsonify({'error': 'Quiz not linked to any course'}), 400

        if course.teacher_id != user.id:
            return jsonify({'error': 'Access denied. You are not the teacher of this course.'}), 403

        # Reset disqualification
        quiz.is_disqualified = False
        quiz.disqualified_at = None
        quiz.violations_count = 0
        quiz.completed_at = None
        quiz.score = None

        # Delete all violation records
        QuizViolation.query.filter_by(quiz_id=quiz.id).delete()

        db.session.commit()

        return jsonify({'message': 'Student reinstated', 'quiz_id': quiz.id}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error reinstating quiz: {str(e)}")
        return jsonify({'error': str(e)}), 500


@quiz_api_bp.route('/chapters/<int:chapter_id>/submissions', methods=['GET'])
@jwt_required()
@teacher_required
def get_chapter_quiz_submissions(chapter_id):
    """Teacher-only: list all student quiz attempts for a chapter."""
    user_id = int(get_jwt_identity())
    current_user = User.query.get(user_id)
    chapter = Chapter.query.get_or_404(chapter_id)
    course = Course.query.get_or_404(chapter.course_id)

    # Verify teacher teaches this course (superuser bypasses)
    if not current_user.is_superuser:
        from app.models import ClassCourseAssignment
        assignment = ClassCourseAssignment.query.filter_by(
            course_id=course.id, teacher_id=current_user.id
        ).first()
        if not assignment and course.teacher_id != current_user.id:
            return jsonify({'error': 'Access denied'}), 403

    # Quizzes for this chapter are linked via the quiz's document -> document.chapter_id
    from app.models import Document
    quizzes = Quiz.query.join(Document, Quiz.document_id == Document.id).filter(
        Document.chapter_id == chapter_id
    ).all()

    if not quizzes:
        return jsonify({
            'chapter_title': chapter.title,
            'total_submissions': 0,
            'disqualified_count': 0,
            'passed_count': 0,
            'failed_count': 0,
            'submissions': []
        })

    submissions = []
    for quiz in quizzes:
        student = quiz.student
        submissions.append({
            'quiz_id': quiz.id,
            'student_id': student.id,
            'student_name': student.username,
            'student_email': student.email,
            'score': quiz.score,
            'completed_at': quiz.completed_at.isoformat() if quiz.completed_at else None,
            'created_at': quiz.created_at.isoformat(),
            'is_disqualified': quiz.is_disqualified,
            'violations_count': quiz.violations_count,
            'disqualified_at': quiz.disqualified_at.isoformat() if quiz.disqualified_at else None,
        })

    disqualified_count = sum(1 for s in submissions if s['is_disqualified'])
    completed = [s for s in submissions if s['completed_at'] and not s['is_disqualified']]
    passed_count = sum(1 for s in completed if s['score'] is not None and s['score'] >= 50)
    failed_count = sum(1 for s in completed if s['score'] is not None and s['score'] < 50)

    return jsonify({
        'chapter_title': chapter.title,
        'total_submissions': len(submissions),
        'disqualified_count': disqualified_count,
        'passed_count': passed_count,
        'failed_count': failed_count,
        'submissions': sorted(submissions, key=lambda x: x['created_at'], reverse=True)
    })


@quiz_api_bp.route('/<int:quiz_id>/violations', methods=['GET'])
@jwt_required()
def get_violations(quiz_id):
    """
    Get all violations for a quiz.
    Teacher sees all; student sees their own quiz only.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        quiz = Quiz.query.get_or_404(quiz_id)

        # Get course
        document = quiz.document
        if document.chapter_id:
            course = document.chapter.course
        else:
            course = Course.query.get(document.course_id)

        is_owner = quiz.student_id == user.id
        is_teacher = user.is_teacher and course.teacher_id == user.id

        if not is_owner and not is_teacher:
            return jsonify({'error': 'Access denied'}), 403

        violations = QuizViolation.query.filter_by(quiz_id=quiz_id).order_by(QuizViolation.occurred_at.asc()).all()

        violations_data = [
            {
                'id': v.id,
                'quiz_id': v.quiz_id,
                'violation_type': v.violation_type,
                'occurred_at': v.occurred_at.isoformat() if v.occurred_at else None,
                'is_warning': v.is_warning
            }
            for v in violations
        ]

        return jsonify({
            'violations': violations_data,
            'total': len(violations_data),
            'is_disqualified': quiz.is_disqualified
        }), 200

    except Exception as e:
        logger.error(f"Error getting violations: {str(e)}")
        return jsonify({'error': str(e)}), 500
