'use client';

import { useParams, useRouter } from 'next/navigation';
import { usePracticeQuizResults } from '@/lib/hooks/usePracticeQuiz';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, Home } from 'lucide-react';

export default function PracticeQuizResultsPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const quizId = parseInt(params.quizId as string);

  const { data: results, isLoading } = usePracticeQuizResults(quizId);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!results) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Results not found. The quiz may not be completed yet.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const percentage = results.score || 0;
  const isPassing = percentage >= 60;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Practice Quiz Results</h1>
        <p className="text-muted-foreground">{results.chapter_title}</p>
      </div>

      {/* Score Card */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Your Score</CardTitle>
          <CardDescription>
            Attempt {results.attempt_number} of 3
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="text-6xl font-bold mb-2">
                {percentage.toFixed(1)}%
              </div>
              <div className="text-muted-foreground">
                {results.correct_count} out of {results.num_questions} correct
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isPassing ? (
                <>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <span className="text-lg font-semibold text-green-600">
                    Good Job!
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-8 w-8 text-amber-600" />
                  <span className="text-lg font-semibold text-amber-600">
                    Keep Practicing
                  </span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions Review */}
      <div className="mb-8 space-y-4">
        <h2 className="text-2xl font-bold">Question Review</h2>

        {results.questions.map((question) => (
          <Card key={question.id} className="overflow-hidden">
            <CardHeader className={`
              ${question.is_correct ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}
            `}>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">
                  Question {question.index}
                </CardTitle>
                <Badge variant={question.is_correct ? 'default' : 'destructive'}>
                  {question.is_correct ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Correct
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3 mr-1" />
                      Incorrect
                    </>
                  )}
                </Badge>
              </div>
              <CardDescription className="text-base mt-2">
                {question.question_text}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {/* Choice A */}
                <ChoiceDisplay
                  label="A"
                  text={question.choice_a}
                  isCorrect={question.correct_choice === 'A'}
                  isSelected={question.student_choice === 'A'}
                />

                {/* Choice B */}
                <ChoiceDisplay
                  label="B"
                  text={question.choice_b}
                  isCorrect={question.correct_choice === 'B'}
                  isSelected={question.student_choice === 'B'}
                />

                {/* Choice C */}
                <ChoiceDisplay
                  label="C"
                  text={question.choice_c}
                  isCorrect={question.correct_choice === 'C'}
                  isSelected={question.student_choice === 'C'}
                />
              </div>

              {/* Explanation */}
              {question.explanation && (
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Explanation:</strong> {question.explanation}
                  </AlertDescription>
                </Alert>
              )}

              {/* Metadata */}
              <div className="flex flex-wrap gap-2 mt-4 text-xs text-muted-foreground">
                {question.bloom_level && (
                  <Badge variant="outline">
                    Bloom: {question.bloom_level}
                  </Badge>
                )}
                {question.clo && (
                  <Badge variant="outline">
                    AA: {question.clo.replace(/^CLO/i, 'AA')}
                  </Badge>
                )}
                {question.difficulty && (
                  <Badge variant="outline">
                    Difficulty: {question.difficulty}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center">
        <Button
          onClick={() => router.push(`/courses/${courseId}`)}
          size="lg"
        >
          <Home className="h-4 w-4 mr-2" />
          Return to Course
        </Button>
      </div>
    </div>
  );
}

function ChoiceDisplay({
  label,
  text,
  isCorrect,
  isSelected,
}: {
  label: string;
  text: string;
  isCorrect: boolean;
  isSelected: boolean;
}) {
  return (
    <div
      className={`
        p-4 border rounded-lg flex items-start gap-3
        ${isCorrect && 'bg-green-50 dark:bg-green-950/20 border-green-500'}
        ${isSelected && !isCorrect && 'bg-red-50 dark:bg-red-950/20 border-red-500'}
      `}
    >
      <div className="flex items-center gap-2 min-w-fit">
        <span className="font-medium">{label}.</span>
        {isCorrect && <CheckCircle className="h-4 w-4 text-green-600" />}
        {isSelected && !isCorrect && <XCircle className="h-4 w-4 text-red-600" />}
      </div>
      <div className="flex-1">
        <span>{text}</span>
        {isSelected && (
          <Badge variant="outline" className="ml-2 text-xs">
            Your answer
          </Badge>
        )}
        {isCorrect && (
          <Badge variant="outline" className="ml-2 text-xs bg-green-100 text-green-900">
            Correct answer
          </Badge>
        )}
      </div>
    </div>
  );
}
