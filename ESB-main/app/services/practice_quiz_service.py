"""
Practice Quiz Service
Handles practice quiz creation, management, and grading from approved question bank.
Separate from document-based course test quizzes.
"""

import logging
import random
from datetime import datetime
from typing import Dict, List, Optional

from app import db
from app.models import (
    PracticeQuiz,
    PracticeQuizQuestion,
    QuestionBankQuestion,
    Chapter,
    Course
)

logger = logging.getLogger(__name__)


def check_question_availability(chapter_id: int) -> dict:
    """
    Check if approved questions exist for a chapter.

    Args:
        chapter_id: Chapter to check

    Returns:
        dict with available (bool), count (int), and chapter_title (str)
    """
    chapter = Chapter.query.get(chapter_id)
    if not chapter:
        logger.warning(f"Chapter {chapter_id} not found")
        return {'available': False, 'count': 0, 'chapter_title': None}

    count = QuestionBankQuestion.query.filter(
        QuestionBankQuestion.chapter_id == chapter_id,
        QuestionBankQuestion.approved_at.isnot(None)
    ).count()

    logger.info(f"Chapter {chapter_id} ({chapter.title}): {count} approved questions")
    return {
        'available': count > 0,
        'count': count,
        'chapter_title': chapter.title
    }


def get_attempt_count(student_id: int, chapter_id: int) -> dict:
    """
    Get completed attempt count for a student in a chapter.
    Max 3 attempts per chapter.

    Args:
        student_id: Student ID
        chapter_id: Chapter ID

    Returns:
        dict with attempts_used, attempts_remaining, max_attempts, can_take_quiz
    """
    completed = PracticeQuiz.query.filter_by(
        student_id=student_id,
        chapter_id=chapter_id
    ).filter(PracticeQuiz.completed_at.isnot(None)).count()

    logger.info(f"Student {student_id}, Chapter {chapter_id}: {completed}/3 attempts used")

    return {
        'attempts_used': completed,
        'attempts_remaining': max(0, 3 - completed),
        'max_attempts': 3,
        'can_take_quiz': completed < 3
    }


def create_practice_quiz(student_id: int, chapter_id: int, num_questions: int = 8) -> PracticeQuiz:
    """
    Create a new practice quiz with random question selection from approved questions.

    Args:
        student_id: Student taking the quiz
        chapter_id: Chapter to quiz on
        num_questions: Desired number of questions (max 8, default 8)

    Returns:
        PracticeQuiz object

    Raises:
        ValueError: If max attempts reached or no questions available
    """
    # Validate attempt limit
    attempts = get_attempt_count(student_id, chapter_id)
    if not attempts['can_take_quiz']:
        logger.warning(f"Student {student_id} exceeded attempts for chapter {chapter_id}")
        raise ValueError("Maximum 3 attempts reached for this chapter")

    # Get chapter and course info
    chapter = Chapter.query.get(chapter_id)
    if not chapter:
        logger.error(f"Chapter {chapter_id} not found")
        raise ValueError(f"Chapter {chapter_id} not found")

    # Get approved questions
    available_questions = QuestionBankQuestion.query.filter(
        QuestionBankQuestion.chapter_id == chapter_id,
        QuestionBankQuestion.approved_at.isnot(None)
    ).all()

    if not available_questions:
        logger.warning(f"No approved questions available for chapter {chapter_id}")
        raise ValueError("No approved questions available for this chapter")

    # Random selection (max 8 questions)
    num_questions = max(1, min(num_questions, 8))  # Clamp between 1 and 8
    actual_num = min(num_questions, len(available_questions))
    selected_questions = random.sample(available_questions, actual_num)

    logger.info(
        f"Creating practice quiz: student={student_id}, chapter={chapter_id}, "
        f"requested={num_questions}, using={actual_num}, available={len(available_questions)}"
    )

    # Calculate next attempt number
    attempt_num = attempts['attempts_used'] + 1

    # Create practice quiz
    practice_quiz = PracticeQuiz(
        course_id=chapter.course_id,
        chapter_id=chapter_id,
        student_id=student_id,
        attempt_number=attempt_num,
        num_questions=actual_num
    )
    db.session.add(practice_quiz)
    db.session.flush()  # Get quiz ID

    # Copy questions to practice quiz
    for question in selected_questions:
        pq_question = PracticeQuizQuestion(
            practice_quiz_id=practice_quiz.id,
            question_text=question.question_text,
            choice_a=question.choice_a,
            choice_b=question.choice_b,
            choice_c=question.choice_c,
            correct_choice=question.correct_choice,
            explanation=question.explanation,
            question_type=question.question_type,
            bloom_level=question.bloom_level,
            clo=question.clo,
            difficulty=question.difficulty,
            source_question_id=question.id
        )
        db.session.add(pq_question)

    try:
        db.session.commit()
        logger.info(f"Created practice quiz {practice_quiz.id} with {actual_num} questions")
        return practice_quiz
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to create practice quiz: {e}")
        raise


def get_practice_quiz(quiz_id: int) -> Optional[PracticeQuiz]:
    """Get practice quiz by ID."""
    return PracticeQuiz.query.get(quiz_id)


def get_practice_quiz_questions(quiz_id: int, include_answers: bool = False) -> List[dict]:
    """
    Get questions for a practice quiz.

    Args:
        quiz_id: Practice quiz ID
        include_answers: Whether to include correct answers (only if quiz completed)

    Returns:
        List of question dictionaries
    """
    quiz = PracticeQuiz.query.get(quiz_id)
    if not quiz:
        logger.warning(f"Practice quiz {quiz_id} not found")
        return []

    questions = PracticeQuizQuestion.query.filter_by(
        practice_quiz_id=quiz_id
    ).order_by(PracticeQuizQuestion.id).all()

    # Only include answers if quiz is completed or explicitly requested
    show_answers = include_answers or quiz.is_completed

    result = []
    for idx, q in enumerate(questions, 1):
        question_dict = {
            'id': q.id,
            'index': idx,
            'question_text': q.question_text,
            'choice_a': q.choice_a,
            'choice_b': q.choice_b,
            'choice_c': q.choice_c,
            'question_type': q.question_type,
            'student_choice': q.student_choice,
            'is_correct': q.is_correct
        }

        if show_answers:
            question_dict.update({
                'correct_choice': q.correct_choice,
                'explanation': q.explanation,
                'bloom_level': q.bloom_level,
                'clo': q.clo,
                'difficulty': q.difficulty
            })

        result.append(question_dict)

    return result


def submit_answer(quiz_id: int, question_index: int, answer: str) -> dict:
    """
    Submit an answer for a specific question.

    Args:
        quiz_id: Practice quiz ID
        question_index: Question index (1-based)
        answer: Student's answer choice

    Returns:
        dict with success status and message

    Raises:
        ValueError: If quiz is already completed or question not found
    """
    quiz = PracticeQuiz.query.get(quiz_id)
    if not quiz:
        logger.error(f"Practice quiz {quiz_id} not found")
        raise ValueError("Quiz not found")

    if quiz.is_completed:
        logger.warning(f"Attempt to submit answer to completed quiz {quiz_id}")
        raise ValueError("Quiz already completed")

    # Get question by index (1-based)
    questions = PracticeQuizQuestion.query.filter_by(
        practice_quiz_id=quiz_id
    ).order_by(PracticeQuizQuestion.id).all()

    if question_index < 1 or question_index > len(questions):
        logger.error(f"Invalid question index {question_index} for quiz {quiz_id}")
        raise ValueError(f"Invalid question index {question_index}")

    question = questions[question_index - 1]

    # Update answer
    question.student_choice = answer
    question.is_correct = (answer.upper() == question.correct_choice.upper())

    try:
        db.session.commit()
        logger.info(
            f"Submitted answer for quiz {quiz_id}, question {question_index}: "
            f"{answer} (correct: {question.is_correct})"
        )
        return {
            'success': True,
            'is_correct': question.is_correct,
            'message': 'Answer submitted successfully'
        }
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to submit answer: {e}")
        raise


def complete_practice_quiz(quiz_id: int) -> dict:
    """
    Complete and grade a practice quiz.

    Args:
        quiz_id: Practice quiz ID

    Returns:
        dict with score, correct_count, total_count

    Raises:
        ValueError: If quiz already completed or not found
    """
    quiz = PracticeQuiz.query.get(quiz_id)
    if not quiz:
        logger.error(f"Practice quiz {quiz_id} not found")
        raise ValueError("Quiz not found")

    if quiz.is_completed:
        logger.warning(f"Attempt to complete already completed quiz {quiz_id}")
        raise ValueError("Quiz already completed")

    # Calculate score
    questions = PracticeQuizQuestion.query.filter_by(
        practice_quiz_id=quiz_id
    ).all()

    total_questions = len(questions)
    correct_count = sum(1 for q in questions if q.is_correct)
    score = (correct_count / total_questions * 100) if total_questions > 0 else 0

    # Update quiz
    quiz.score = round(score, 2)
    quiz.completed_at = datetime.utcnow()

    try:
        db.session.commit()
        logger.info(
            f"Completed practice quiz {quiz_id}: score={score:.2f}%, "
            f"correct={correct_count}/{total_questions}"
        )
        return {
            'score': quiz.score,
            'correct_count': correct_count,
            'total_count': total_questions,
            'percentage': quiz.score
        }
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to complete quiz: {e}")
        raise


def get_practice_quiz_results(quiz_id: int) -> dict:
    """
    Get results for a completed practice quiz.

    Args:
        quiz_id: Practice quiz ID

    Returns:
        dict with quiz metadata, score, and questions with answers

    Raises:
        ValueError: If quiz not found or not completed
    """
    quiz = PracticeQuiz.query.get(quiz_id)
    if not quiz:
        logger.error(f"Practice quiz {quiz_id} not found")
        raise ValueError("Quiz not found")

    if not quiz.is_completed:
        logger.warning(f"Attempt to get results for incomplete quiz {quiz_id}")
        raise ValueError("Quiz not completed yet")

    questions = get_practice_quiz_questions(quiz_id, include_answers=True)

    return {
        'quiz_id': quiz.id,
        'course_id': quiz.course_id,
        'chapter_id': quiz.chapter_id,
        'chapter_title': quiz.chapter.title if quiz.chapter else None,
        'attempt_number': quiz.attempt_number,
        'score': quiz.score,
        'num_questions': quiz.num_questions,
        'correct_count': sum(1 for q in questions if q.get('is_correct')),
        'completed_at': quiz.completed_at.isoformat() if quiz.completed_at else None,
        'questions': questions
    }
