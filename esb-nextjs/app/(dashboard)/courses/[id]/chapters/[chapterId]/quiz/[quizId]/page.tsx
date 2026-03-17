'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuiz, useQuizQuestions, useSubmitAnswer, useCompleteQuiz } from '@/lib/hooks/useQuiz';
import { useSafeExam } from '@/lib/hooks/useSafeExam';
import { SafeExamWarning } from '@/components/quiz/SafeExamWarning';
import { QuizQuestion } from '@/lib/types/quiz';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { AlertCircle, CheckCircle2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

export default function QuizTakingPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const chapterId = parseInt(params.chapterId as string);
  const quizId = parseInt(params.quizId as string);

  const { data: quizData, isLoading: quizLoading } = useQuiz(quizId);
  const { data: questionsData, isLoading: questionsLoading } = useQuizQuestions(quizId);
  const submitAnswerMutation = useSubmitAnswer();
  const completeQuizMutation = useCompleteQuiz();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submittedIndices, setSubmittedIndices] = useState<Set<number>>(new Set());

  // Quiz is "active" when loaded and not yet completed/disqualified
  const quizIsActive =
    !!quizData &&
    !quizData.completed_at &&
    !quizData.is_disqualified;

  const { showWarning, isDisqualified, lastViolationType, acknowledgeWarning, enterFullscreen } =
    useSafeExam(quizId, quizIsActive);

  // Enter fullscreen on mount
  useEffect(() => {
    if (quizIsActive) {
      enterFullscreen();
    }
  }, [quizIsActive, enterFullscreen]);

  // Load saved answers from questions data
  useEffect(() => {
    if (questionsData?.questions) {
      const savedAnswers: Record<number, string> = {};
      questionsData.questions.forEach((q, idx) => {
        if (q.student_choice) {
          savedAnswers[idx] = q.student_choice;
          setSubmittedIndices((prev) => new Set(prev).add(idx));
        }
      });
      setAnswers(savedAnswers);
    }
  }, [questionsData]);

  // Redirect if quiz is already completed
  useEffect(() => {
    if (quizData?.completed_at && !quizData.is_disqualified) {
      router.push(`/courses/${courseId}/chapters/${chapterId}/quiz/${quizId}/results`);
    }
  }, [quizData, courseId, chapterId, quizId, router]);

  // Redirect if quiz loaded as already disqualified
  useEffect(() => {
    if (quizData?.is_disqualified) {
      router.push(`/courses/${courseId}/chapters/${chapterId}/quiz/${quizId}/disqualified`);
    }
  }, [quizData, courseId, chapterId, quizId, router]);

  // Redirect when disqualified by hook
  useEffect(() => {
    if (isDisqualified) {
      router.push(`/courses/${courseId}/chapters/${chapterId}/quiz/${quizId}/disqualified`);
    }
  }, [isDisqualified, courseId, chapterId, quizId, router]);

  const questions = questionsData?.questions || [];
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const progress = ((currentIndex + 1) / totalQuestions) * 100;

  const currentAnswer = answers[currentIndex] || '';

  // Handle answer change
  const handleAnswerChange = (value: string) => {
    setAnswers({
      ...answers,
      [currentIndex]: value,
    });
  };

  // Handle submit answer
  const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim()) {
      toast.error('Please provide an answer');
      return;
    }

    submitAnswerMutation.mutate(
      {
        quizId,
        questionIndex: currentIndex,
        data: { answer: currentAnswer },
      },
      {
        onSuccess: () => {
          setSubmittedIndices((prev) => new Set(prev).add(currentIndex));
          toast.success('Answer submitted');

          // Auto-advance to next question
          if (!isLastQuestion) {
            setCurrentIndex(currentIndex + 1);
          }
        },
      }
    );
  };

  // Handle complete quiz
  const handleCompleteQuiz = async () => {
    // Check if all questions are answered
    const unanswered = questions.filter((_, idx) => !submittedIndices.has(idx));

    if (unanswered.length > 0) {
      const confirm = window.confirm(
        `You have ${unanswered.length} unanswered question(s). Complete quiz anyway?`
      );
      if (!confirm) return;
    }

    completeQuizMutation.mutate(quizId, {
      onSuccess: () => {
        router.push(`/courses/${courseId}/chapters/${chapterId}/quiz/${quizId}/results`);
      },
    });
  };

  // Navigation
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToQuestion = (index: number) => {
    setCurrentIndex(index);
  };

  if (quizLoading || questionsLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 mb-6" />
      </div>
    );
  }

  if (!quizData || !questionsData || questions.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Quiz not found"
          description="The quiz you're looking for doesn't exist or has no questions."
          icon={<AlertCircle className="h-12 w-12" />}
        />
      </div>
    );
  }

  const isMCQ = currentQuestion?.question_type === 'mcq';

  return (
    <div
      className="container mx-auto px-4 py-8 max-w-4xl select-none"
      onCopy={(e) => e.preventDefault()}
      onPaste={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      {/* Safe Exam Warning Modal */}
      {showWarning && (
        <SafeExamWarning
          violationType={lastViolationType}
          onAcknowledge={acknowledgeWarning}
        />
      )}

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <span className="text-sm text-muted-foreground">{Math.round(progress)}% Complete</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Question Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <CardTitle className="text-lg">
              Question {currentIndex + 1}
              {submittedIndices.has(currentIndex) && (
                <CheckCircle2 className="inline ml-2 h-5 w-5 text-green-600" />
              )}
            </CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline">{currentQuestion?.bloom_level}</Badge>
              <Badge variant="outline">{currentQuestion?.difficulty}</Badge>
              {currentQuestion?.clo && <Badge variant="secondary">{currentQuestion.clo}</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Question Text */}
          <div className="text-lg whitespace-pre-wrap">
            {currentQuestion?.question_text || ''}
          </div>

          {/* Answer Input */}
          {isMCQ ? (
            <RadioGroup value={currentAnswer} onValueChange={handleAnswerChange}>
              <div className="space-y-3">
                {currentQuestion.choice_a && (
                  <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent">
                    <RadioGroupItem value="A" id="choice-a" />
                    <Label htmlFor="choice-a" className="flex-1 cursor-pointer">
                      <span className="font-medium mr-2">A.</span>
                      {currentQuestion.choice_a}
                    </Label>
                  </div>
                )}
                {currentQuestion.choice_b && (
                  <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent">
                    <RadioGroupItem value="B" id="choice-b" />
                    <Label htmlFor="choice-b" className="flex-1 cursor-pointer">
                      <span className="font-medium mr-2">B.</span>
                      {currentQuestion.choice_b}
                    </Label>
                  </div>
                )}
                {currentQuestion.choice_c && (
                  <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent">
                    <RadioGroupItem value="C" id="choice-c" />
                    <Label htmlFor="choice-c" className="flex-1 cursor-pointer">
                      <span className="font-medium mr-2">C.</span>
                      {currentQuestion.choice_c}
                    </Label>
                  </div>
                )}
              </div>
            </RadioGroup>
          ) : (
            <div>
              <Label htmlFor="open-answer">Your Answer</Label>
              <Textarea
                id="open-answer"
                value={currentAnswer}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Type your answer here..."
                rows={6}
                className="mt-2"
              />
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleSubmitAnswer}
            disabled={!currentAnswer.trim() || submitAnswerMutation.isPending}
            className="w-full"
          >
            {submitAnswerMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : submittedIndices.has(currentIndex) ? (
              'Update Answer'
            ) : (
              'Submit Answer'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="outline" onClick={goToPrevious} disabled={currentIndex === 0}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>

        {isLastQuestion ? (
          <Button
            onClick={handleCompleteQuiz}
            disabled={completeQuizMutation.isPending}
            size="lg"
          >
            {completeQuizMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Completing...
              </>
            ) : (
              'Complete Quiz'
            )}
          </Button>
        ) : (
          <Button variant="outline" onClick={goToNext}>
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Question Indicators */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Question Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToQuestion(idx)}
                className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-sm font-medium transition-colors ${
                  idx === currentIndex
                    ? 'border-primary bg-primary text-primary-foreground'
                    : submittedIndices.has(idx)
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-primary bg-primary"></div>
              Current
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-green-600 bg-green-50"></div>
              Answered
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-gray-300"></div>
              Unanswered
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
