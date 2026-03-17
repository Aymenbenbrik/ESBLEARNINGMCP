from flask import Blueprint, render_template, redirect, url_for, flash, request, abort, jsonify, current_app
from flask_login import current_user, login_required
from flask_wtf import FlaskForm
from wtforms import StringField, IntegerField, SelectField, RadioField, TextAreaField, SubmitField
from wtforms.validators import DataRequired, NumberRange
from datetime import datetime
from app import db
from app.models import Document, Quiz, QuizQuestion, Enrollment, Course, Chapter, QuizBloomStatistic, QuizCLOStatistic
from app.services.ai_service import generate_quiz_questions, generate_quiz_feedback
import re
from markupsafe import Markup
import logging

logger = logging.getLogger(__name__)

quiz_bp = Blueprint('quiz', __name__, url_prefix='/quiz')

# ============================================================
# FORMS
# ============================================================

class QuizSetupForm(FlaskForm):
    num_questions = IntegerField('Number of Questions', 
                               validators=[DataRequired(), NumberRange(min=3, max=20)],
                               default=5)
    submit = SubmitField('Start Quiz')

class QuizAnswerForm(FlaskForm):
    answer = RadioField('Your Answer', 
                      choices=[('A', 'A'), ('B', 'B'), ('C', 'C')],
                      validators=[DataRequired()])
    submit = SubmitField('Submit Answer')

# ============================================================
# HELPER FUNCTIONS
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

def extract_text_from_file(file_path):
    """Extract text from uploaded file"""
    # Implementation depends on your file handling
    return ""

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


def _dedup_by_id(items):
    seen = set()
    out = []
    for it in items or []:
        iid = getattr(it, 'id', None)
        if iid is None or iid not in seen:
            if iid is not None:
                seen.add(iid)
            out.append(it)
    return out


# ============================================================
# ROUTE: SETUP QUIZ (Create new quiz instance)
# ============================================================

@quiz_bp.route('/setup/<int:document_id>', methods=['GET', 'POST'])
@login_required
def setup(document_id):
    """
    Setup page - Check if student already has completed/incomplete quiz
    
    LOGIC:
    - If completed quiz exists → redirect to results (review only)
    - If incomplete quiz exists → resume it
    - If no quiz exists → create new one
    """
    
    document = Document.query.get_or_404(document_id)
    
    # Get course context
    if document.chapter_id:
        chapter = document.chapter
        course = chapter.course
    else:
        chapter = None
        course = Course.query.get(document.course_id)
    
    if not course:
        flash('Course not found.', 'danger')
        return redirect(url_for('courses.index'))
    
    # ============================================
    # ACCESS CONTROL
    # ============================================
    if not current_user.is_teacher and not Enrollment.query.filter_by(
            student_id=current_user.id, course_id=course.id).first():
        flash('You need to enroll in this course first.', 'warning')
        return redirect(url_for('courses.enroll', course_id=course.id))
    
    # Only students can take quizzes
    if current_user.is_teacher:
        flash('Only students can take quizzes.', 'warning')
        return redirect(url_for('chapters.view_document', document_id=document_id))
    
    # ============================================
    # CHECK EXISTING QUIZ STATUS
    # ============================================
    
    # Priority 1: Check for COMPLETED quiz
    completed_quiz = Quiz.query.filter_by(
        document_id=document_id,
        student_id=current_user.id
    ).filter(Quiz.completed_at.isnot(None)).first()
    
    if completed_quiz:
        logger.info(f"✅ Student {current_user.id} already completed quiz {completed_quiz.id}")
        flash('You have already completed this quiz. Review your results below.', 'info')
        return redirect(url_for('quiz.results', quiz_id=completed_quiz.id))
    
    # Priority 2: Check for INCOMPLETE quiz
    incomplete_quiz = Quiz.query.filter_by(
        document_id=document_id,
        student_id=current_user.id,
        completed_at=None
    ).first()
    
    if incomplete_quiz:
        logger.info(f"⏳ Student {current_user.id} resuming incomplete quiz {incomplete_quiz.id}")
        flash('Resuming your incomplete quiz...', 'info')
        return redirect(url_for('quiz.take', quiz_id=incomplete_quiz.id, question_index=0))
    
    # ============================================
    # CREATE NEW QUIZ
    # ============================================
    
    form = QuizSetupForm()
    if form.validate_on_submit():
        try:
            # Create new quiz instance
            quiz = Quiz(
                document_id=document_id,
                student_id=current_user.id,
                num_questions=form.num_questions.data,
                completed_at=None  # ✅ Explicitly None until completion
            )
            db.session.add(quiz)
            db.session.flush()  # Get quiz.id
            
            logger.info(f"🆕 Created new quiz {quiz.id} for student {current_user.id}")
            
            # Generate questions (your existing logic)
            week_num = getattr(document, 'week_number', 1)
            weekly_syllabus = get_syllabus_for_week(course.id, week_num)
            clos = weekly_syllabus.get('clos', [])
            attachments = weekly_syllabus.get('attachments', [])
            
            questions = generate_quiz_questions(
                week_content=weekly_syllabus.get('text', ''),
                clos=clos,
                attachments_texts=[],
                num_questions=form.num_questions.data,
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
            logger.info(f"✅ Generated {len(questions)} questions for quiz {quiz.id}")
            
            flash('Quiz created successfully. Good luck!', 'success')
            return redirect(url_for('quiz.take', quiz_id=quiz.id, question_index=0))
        
        except Exception as e:
            db.session.rollback()
            logger.error(f"❌ Error creating quiz: {str(e)}")
            flash(f'Failed to generate quiz: {str(e)}', 'danger')
    
    return render_template('quiz/setup.html',
                           document=document,
                           chapter=chapter,
                           course=course,
                           form=form)

## ============================================================
# FIX 1: UPDATE take() ROUTE - Prevent retaking completed quiz
# ============================================================

@quiz_bp.route('/take/<int:quiz_id>/<int:question_index>', methods=['GET', 'POST'])
@login_required
def take(quiz_id, question_index):
    """
    Take quiz - answer questions one by one
    
    ✅ PREVENTS:
    - Taking quiz if already completed (REDIRECT TO RESULTS)
    - Accessing quizzes you don't own
    """
    
    quiz = Quiz.query.get_or_404(quiz_id)
    
    logger.info(f"🎯 TAKE QUIZ: quiz_id={quiz_id}, q_idx={question_index}, completed={quiz.completed_at}")
    
    # ============================================
    # OWNERSHIP VERIFICATION
    # ============================================
    if quiz.student_id != current_user.id:
        logger.warning(f"🚫 Unauthorized: User {current_user.id} trying to access quiz {quiz_id}")
        abort(403)
    
    # ============================================
    # COMPLETION CHECK - CRITICAL (BLOCKING ENTRY)
    # ============================================
    if quiz.completed_at is not None:
        logger.warning(f"🚫 Quiz {quiz_id} already completed at {quiz.completed_at}")
        flash('This quiz has already been completed. You can only review your results.', 'warning')
        return redirect(url_for('quiz.results', quiz_id=quiz_id))
    
    # Get document and course
    document = quiz.document
    if not document:
        flash('Quiz document not found.', 'danger')
        return redirect(url_for('courses.index'))
    
    if document.chapter_id:
        chapter = document.chapter
        course = chapter.course
        week_num = None
    else:
        chapter = None
        course = Course.query.get(document.course_id)
        week_num = getattr(document, 'week_number', None)
    
    if not course:
        flash('Course not found.', 'danger')
        return redirect(url_for('courses.index'))
    
    # Load questions
    questions = _dedup_by_id(list(quiz.questions))
    
    if not questions:
        logger.warning(f"❌ Quiz {quiz_id} has no questions")
        flash('This quiz has no questions.', 'warning')
        return redirect(url_for('quiz.complete', quiz_id=quiz_id))
    
    # Validate question index
    if question_index < 0 or question_index >= len(questions):
        logger.info(f"⏹️  Quiz complete, redirecting to completion")
        return redirect(url_for('quiz.complete', quiz_id=quiz_id))
    
    current_question = questions[question_index]
    total_questions = len(questions)
    progress = ((question_index + 1) / total_questions) * 100
    
    logger.info(f"📝 Question {question_index + 1}/{total_questions}")
    
    # ============================================
    # HANDLE FORM SUBMISSION
    # ============================================
    if request.method == 'POST':
        student_answer = request.form.get('answer', '').strip()
        
        if not student_answer:
            flash("Please select or enter an answer before proceeding.", "warning")
            return redirect(url_for('quiz.take', quiz_id=quiz_id, question_index=question_index))
        
        # Determine question type
        is_mcq = (current_question.choice_a and current_question.choice_b and 
                 current_question.choice_c and
                 len(current_question.choice_a.strip()) > 0)
        
        # Save answer
        current_question.student_choice = student_answer
        current_question.question_type = 'mcq' if is_mcq else 'open_ended'
        
        if is_mcq:
            # Auto-grade MCQ immediately
            current_question.is_correct = (
                student_answer.upper() == current_question.correct_choice.upper()
            )
            logger.debug(f"✅ MCQ graded: {current_question.is_correct}")
        else:
            # Open-ended: mark as pending
            current_question.is_correct = None
            logger.debug(f"⏳ Open-ended recorded, pending grading")
        
        try:
            db.session.commit()
            logger.debug(f"💾 Answer saved to DB")
        except Exception as e:
            logger.error(f"❌ Error saving answer: {str(e)}")
            db.session.rollback()
            flash("Error saving your answer. Please try again.", "danger")
            return redirect(url_for('quiz.take', quiz_id=quiz_id, question_index=question_index))
        
        # Move to next question
        next_index = question_index + 1
        if next_index >= total_questions:
            logger.info(f"🏁 All questions answered, redirecting to complete")
            return redirect(url_for('quiz.complete', quiz_id=quiz_id))
        
        return redirect(url_for('quiz.take', quiz_id=quiz_id, question_index=next_index))
    
    form = QuizAnswerForm()
    
    return render_template('quiz/take.html',
                          quiz=quiz,
                          document=document,
                          chapter=chapter,
                          course=course,
                          question=current_question,
                          question_index=question_index,
                          total_questions=total_questions,
                          progress=progress,
                          week_num=week_num,
                          form=form)


# ============================================================
# FIX 2: UPDATE complete() - Ensure ONE TIME completion
# ============================================================

@quiz_bp.route('/complete/<int:quiz_id>', methods=['GET'])
@login_required
def complete(quiz_id):
    """
    CRITICAL: Finalize quiz completion - ONLY ONCE
    
    This route:
    - Grades all questions
    - Calculates final score
    - Sets completed_at timestamp (ONLY ONCE)
    - Saves statistics to DB
    - ALWAYS redirects to results (never back to take)
    """
    
    quiz = Quiz.query.get_or_404(quiz_id)
    
    logger.info(f"⏹️  COMPLETE QUIZ: quiz_id={quiz_id}, completed_at={quiz.completed_at}")
    
    # ============================================
    # OWNERSHIP VERIFICATION
    # ============================================
    if quiz.student_id != current_user.id:
        abort(403)
    
    # ============================================
    # ALREADY COMPLETED CHECK - CRITICAL
    # ============================================
    if quiz.completed_at is not None:
        logger.warning(f"🚫 Quiz {quiz_id} already completed at {quiz.completed_at}")
        logger.info(f"Redirecting to results (already completed)")
        return redirect(url_for('quiz.results', quiz_id=quiz_id))
    
    questions = _dedup_by_id(list(quiz.questions))
    
    if not questions:
        logger.warning(f"❌ Quiz {quiz_id} has no questions")
        # Mark as complete anyway
        quiz.completed_at = datetime.utcnow()
        quiz.score = 0
        db.session.commit()
        flash('This quiz has no questions.', 'warning')
        return redirect(url_for('quiz.results', quiz_id=quiz_id))
    
    logger.info(f"📊 Grading {len(questions)} questions...")
    
    # ============================================
    # GRADE ALL QUESTIONS
    # ============================================
    
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
                logger.debug(f"Q{q.id}: {'✓' if is_correct else '✗'}")
            else:
                q.is_correct = False
        else:
            # Open-ended: pending instructor review
            total_questions += 1
            if q.student_choice and len(q.student_choice.strip()) > 0:
                q.is_correct = None  # Pending
                q.score = 50
                total_score += 50
                logger.debug(f"Q{q.id}: ⏳ Pending review")
            else:
                q.is_correct = False
                q.score = 0
    
    # ============================================
    # EXTRACT METADATA
    # ============================================
    
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
    
    # ============================================
    # CALCULATE FINAL SCORE
    # ============================================
    
    if total_questions > 0:
        overall_score = (total_score / (total_questions * 100)) * 100
    else:
        overall_score = 0
    
    logger.info(f"📈 Final Score: {overall_score:.1f}% ({mcq_correct}/{mcq_total} MCQ)")
    
    # ============================================
    # CALCULATE STATISTICS
    # ============================================
    
    bloom_stats, clo_stats = calculate_quiz_statistics(questions)
    
    # ============================================
    # MARK AS COMPLETE (ONE TIME ONLY)
    # ============================================
    
    quiz.score = round(overall_score, 1)
    quiz.completed_at = datetime.utcnow()  # ✅ CRITICAL: Set timestamp only once
    quiz.feedback = f"You scored {overall_score:.1f}% on this quiz. {mcq_correct}/{mcq_total} MCQ questions answered correctly."
    
    try:
        db.session.commit()
        logger.info(f"✅ Quiz {quiz_id} COMPLETED at {quiz.completed_at}")
        logger.info(f"✅ Score: {quiz.score}%")
        
        # Save statistics
        save_quiz_statistics(quiz_id, bloom_stats, clo_stats)
        
        flash(f"🎉 Quiz completed! Your score: {overall_score:.1f}%", "success")
    except Exception as e:
        logger.error(f"❌ Error finalizing quiz: {str(e)}")
        db.session.rollback()
        flash("Error completing quiz. Please contact support.", "danger")
        # Still redirect to results page
        return redirect(url_for('quiz.results', quiz_id=quiz_id))
    
    # ✅ ALWAYS redirect to results - NO GOING BACK
    return redirect(url_for('quiz.results', quiz_id=quiz_id))


# ============================================================
# FIX 3: UPDATE results() - Clear feedback that quiz is final
# ============================================================

@quiz_bp.route('/results/<int:quiz_id>', methods=['GET'])
@login_required
def results(quiz_id):
    """
    View quiz results - READ ONLY
    
    ✅ Can only be accessed after quiz.completed_at is set
    ✅ Students cannot retake the quiz
    """
    
    quiz = Quiz.query.get_or_404(quiz_id)
    
    # ============================================
    # ACCESS CONTROL
    # ============================================
    if quiz.student_id != current_user.id and not current_user.is_teacher:
        abort(403)
    
    # ============================================
    # COMPLETION REQUIREMENT
    # ============================================
    if quiz.completed_at is None:
        logger.warning(f"⏳ Quiz {quiz_id} not completed yet")
        flash('Please complete the quiz first.', 'warning')
        return redirect(url_for('quiz.take', quiz_id=quiz_id, question_index=0))
    
    document = quiz.document
    if document.chapter_id:
        chapter = document.chapter
        course = chapter.course
        week_num = None
    else:
        chapter = None
        course = Course.query.get(document.course_id)
        week_num = getattr(document, 'week_number', None)
    
    if not course:
        flash('Course not found.', 'danger')
        return redirect(url_for('courses.index'))
    
    questions = _dedup_by_id(list(quiz.questions))
    
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
    
    if not bloom_stats and not clo_stats:
        bloom_stats, clo_stats = calculate_quiz_statistics(questions)
    
    logger.info(f"📊 Displaying results for quiz {quiz_id}, score={quiz.score}%, completed={quiz.completed_at}")
    
    return render_template('quiz/results.html',
                          quiz=quiz,
                          document=document,
                          chapter=chapter,
                          course=course,
                          week_num=week_num,
                          questions=questions,
                          bloom_stats=bloom_stats,
                          clo_stats=clo_stats,
                          is_final=True)  # ✅ Pass flag to template

# ============================================================
# ROUTE: QUIZ HISTORY (All quizzes for a document)
# ============================================================

@quiz_bp.route('/history/<int:document_id>', methods=['GET'])
@login_required
def history(document_id):
    """View quiz history for a document"""
    
    document = Document.query.get_or_404(document_id)
    
    if document.chapter_id:
        chapter = document.chapter
        course = chapter.course
    else:
        chapter = None
        course = Course.query.get(document.course_id)
    
    if not course:
        flash('Course not found.', 'danger')
        return redirect(url_for('courses.index'))
    
    # Check access
    if not current_user.is_teacher and not Enrollment.query.filter_by(
            student_id=current_user.id, course_id=course.id).first():
        flash('You need to enroll in this course first.', 'warning')
        return redirect(url_for('courses.enroll', course_id=course.id))
    
    # Get all completed quizzes for this document by current user
    quizzes = Quiz.query.filter_by(
        document_id=document_id,
        student_id=current_user.id
    ).filter(Quiz.completed_at.isnot(None)).order_by(Quiz.completed_at.desc()).all()
    
    logger.info(f"Found {len(quizzes)} completed quizzes for document {document_id}")
    
    return render_template('quiz/history.html',
                          title='Quiz History',
                          document=document,
                          chapter=chapter,
                          course=course,
                          quizzes=quizzes)

# ============================================================
# TEMPLATE FILTERS
# ============================================================

@quiz_bp.app_template_filter('md_to_html')
def md_to_html(text):
    """Convert basic markdown to HTML"""
    if text is None:
        return ""
    
    text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', text)
    text = text.replace('<br>', '\n')    
    text = text.replace('\n', '<br />')
    return Markup(text)