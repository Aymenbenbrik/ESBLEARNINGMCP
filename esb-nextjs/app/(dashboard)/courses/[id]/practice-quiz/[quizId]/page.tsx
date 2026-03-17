'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePracticeQuiz, usePracticeQuizQuestions, useSubmitPracticeAnswer, useCompletePracticeQuiz } from '@/lib/hooks/usePracticeQuiz';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function PracticeQuizTakingPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const quizId = parseInt(params.quizId as string);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');

  const { data: quiz, isLoading: quizLoading } = usePracticeQuiz(quizId);
  const { data: questionsData, isLoading: questionsLoading } = usePracticeQuizQuestions(quizId);
  const submitAnswerMutation = useSubmitPracticeAnswer();
  const completeQuizMutation = useCompletePracticeQuiz();

  const questions = questionsData?.questions || [];
  const currentQuestion = questions[currentQuestionIndex];
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  // Redirect to results if quiz is already completed
  useEffect(() => {
    if (quiz?.is_completed) {
      router.push(`/courses/${courseId}/practice-quiz/${quizId}/results`);
    }
  }, [quiz?.is_completed, courseId, quizId, router]);

  // Load saved answer for current question
  useEffect(() => {
    if (currentQuestion) {
      setSelectedAnswer(currentQuestion.student_choice || '');
    }
  }, [currentQuestion]);

  const handleAnswerSelect = async (answer: string) => {
    setSelectedAnswer(answer);

    // Submit answer immediately
    try {
      await submitAnswerMutation.mutateAsync({
        quizId,
        questionIndex: currentQuestion.index,
        answer,
      });
    } catch (error) {
      console.error('Failed to submit answer:', error);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleComplete = async () => {
    // Check if all questions are answered
    const unanswered = questions.filter(q => !q.student_choice);
    if (unanswered.length > 0) {
      if (!confirm(`You have ${unanswered.length} unanswered question(s). Complete quiz anyway?`)) {
        return;
      }
    }

    try {
      await completeQuizMutation.mutateAsync(quizId);
      // Navigate to results page
      router.push(`/courses/${courseId}/practice-quiz/${quizId}/results`);
    } catch (error) {
      console.error('Failed to complete quiz:', error);
    }
  };

  if (quizLoading || questionsLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!quiz || questions.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Quiz not found or has no questions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">
          Practice Quiz - {quiz.chapter_title}
        </h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Attempt {quiz.attempt_number} of {quiz.max_attempts}</span>
          <span>•</span>
          <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-muted-foreground mt-2">
          {Math.round(progress)}% complete
        </p>
      </div>

      {/* Question Card */}
      {currentQuestion && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">
              Question {currentQuestion.index}
            </CardTitle>
            <CardDescription className="text-base leading-relaxed mt-4">
              {currentQuestion.question_text}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={selectedAnswer}
              onValueChange={handleAnswerSelect}
              disabled={submitAnswerMutation.isPending}
            >
              <div className="space-y-3">
                <div className="flex items-start space-x-2 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="A" id="choice-a" className="mt-1" />
                  <Label htmlFor="choice-a" className="cursor-pointer flex-1">
                    <span className="font-medium mr-2">A.</span>
                    {currentQuestion.choice_a}
                  </Label>
                </div>

                <div className="flex items-start space-x-2 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="B" id="choice-b" className="mt-1" />
                  <Label htmlFor="choice-b" className="cursor-pointer flex-1">
                    <span className="font-medium mr-2">B.</span>
                    {currentQuestion.choice_b}
                  </Label>
                </div>

                <div className="flex items-start space-x-2 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="C" id="choice-c" className="mt-1" />
                  <Label htmlFor="choice-c" className="cursor-pointer flex-1">
                    <span className="font-medium mr-2">C.</span>
                    {currentQuestion.choice_c}
                  </Label>
                </div>
              </div>
            </RadioGroup>

            {selectedAnswer && (
              <Alert className="mt-4">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Answer saved: <strong>{selectedAnswer}</strong>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center">
        <Button
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
          variant="outline"
        >
          Previous
        </Button>

        <div className="flex gap-2">
          {currentQuestionIndex < questions.length - 1 ? (
            <Button onClick={handleNext}>
              Next
            </Button>
          ) : (
            <Button
              onClick={handleComplete}
              disabled={completeQuizMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {completeQuizMutation.isPending ? 'Submitting...' : 'Complete Quiz'}
            </Button>
          )}
        </div>
      </div>

      {/* Question Navigator */}
      <div className="mt-8 p-4 border rounded-lg bg-muted/50">
        <h3 className="text-sm font-semibold mb-3">Question Navigator</h3>
        <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-2">
          {questions.map((question, idx) => (
            <button
              key={question.id}
              onClick={() => setCurrentQuestionIndex(idx)}
              className={`
                aspect-square rounded flex items-center justify-center text-sm font-medium
                transition-colors
                ${idx === currentQuestionIndex
                  ? 'bg-primary text-primary-foreground'
                  : question.student_choice
                  ? 'bg-green-100 text-green-900 hover:bg-green-200'
                  : 'bg-background border hover:bg-accent'
                }
              `}
            >
              {question.index}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
