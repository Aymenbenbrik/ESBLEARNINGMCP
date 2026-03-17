'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCourse } from '@/lib/hooks/useCourses';
import { usePracticeQuizAvailability, usePracticeQuizAttempts, useStartPracticeQuiz } from '@/lib/hooks/usePracticeQuiz';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, BookOpen, CheckCircle, XCircle } from 'lucide-react';

export default function PracticeQuizSetupPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);

  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [numQuestions, setNumQuestions] = useState<number>(8);

  const { data: courseData, isLoading: courseLoading } = useCourse(courseId);
  const chapters = courseData?.chapters || [];
  const { data: availability } = usePracticeQuizAvailability(selectedChapterId!);
  const { data: attempts } = usePracticeQuizAttempts(selectedChapterId!);
  const startQuizMutation = useStartPracticeQuiz();

  const handleStartQuiz = async () => {
    if (!selectedChapterId) {
      return;
    }

    const result = await startQuizMutation.mutateAsync({
      chapterId: selectedChapterId,
      numQuestions,
    });

    // Navigate to quiz taking page
    router.push(`/courses/${courseId}/practice-quiz/${result.quiz_id}`);
  };

  const canStartQuiz =
    selectedChapterId &&
    availability?.available &&
    attempts?.can_take_quiz &&
    numQuestions >= 1 &&
    numQuestions <= 8;

  if (courseLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Practice Quiz Setup</h1>
        <p className="text-muted-foreground">
          Test your knowledge with practice quizzes from the approved question bank
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Chapter</CardTitle>
          <CardDescription>
            Choose a chapter to practice. You have 3 attempts per chapter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Chapter Selection */}
          <div>
            <RadioGroup
              value={selectedChapterId?.toString() || ''}
              onValueChange={(value) => setSelectedChapterId(parseInt(value))}
            >
              <div className="space-y-3">
                {chapters?.map((chapter) => (
                  <ChapterOption
                    key={chapter.id}
                    chapter={chapter}
                    isSelected={selectedChapterId === chapter.id}
                  />
                ))}
              </div>
            </RadioGroup>
          </div>

          {/* Selected Chapter Info */}
          {selectedChapterId && (
            <div className="space-y-4 pt-4 border-t">
              <ChapterInfo
                availability={availability}
                attempts={attempts}
              />

              {/* Number of Questions Input */}
              {availability?.available && attempts?.can_take_quiz && (
                <div>
                  <Label htmlFor="num-questions">Number of Questions (1-8)</Label>
                  <Input
                    id="num-questions"
                    type="number"
                    min={1}
                    max={8}
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(parseInt(e.target.value) || 8)}
                    className="mt-2 max-w-xs"
                  />
                  {availability && availability.count < 8 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Only {availability.count} questions available for this chapter
                    </p>
                  )}
                </div>
              )}

              {/* Start Button */}
              <Button
                onClick={handleStartQuiz}
                disabled={!canStartQuiz || startQuizMutation.isPending}
                size="lg"
                className="w-full sm:w-auto"
              >
                {startQuizMutation.isPending ? 'Creating Quiz...' : 'Start Practice Quiz'}
              </Button>
            </div>
          )}

          {!selectedChapterId && (
            <Alert>
              <BookOpen className="h-4 w-4" />
              <AlertDescription>
                Select a chapter above to see available questions and attempts
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChapterOption({ chapter, isSelected }: { chapter: any; isSelected: boolean }) {
  const { data: availability } = usePracticeQuizAvailability(chapter.id);
  const { data: attempts } = usePracticeQuizAttempts(chapter.id);

  return (
    <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
      <RadioGroupItem value={chapter.id.toString()} id={`chapter-${chapter.id}`} />
      <Label
        htmlFor={`chapter-${chapter.id}`}
        className="flex-1 cursor-pointer flex items-center justify-between"
      >
        <span className="font-medium">{chapter.title}</span>
        <div className="flex items-center gap-4 text-sm">
          {availability && (
            <span className="text-muted-foreground">
              {availability.count} questions
            </span>
          )}
          {attempts && (
            <span
              className={`${
                attempts.can_take_quiz ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {attempts.attempts_used}/{attempts.max_attempts} attempts
            </span>
          )}
        </div>
      </Label>
    </div>
  );
}

function ChapterInfo({
  availability,
  attempts,
}: {
  availability: any;
  attempts: any;
}) {
  if (!availability || !attempts) {
    return <Skeleton className="h-20 w-full" />;
  }

  // No questions available
  if (!availability.available) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>
          No approved questions available for this chapter yet. Please contact your instructor
          or try another chapter.
        </AlertDescription>
      </Alert>
    );
  }

  // Max attempts reached
  if (!attempts.can_take_quiz) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You have used all {attempts.max_attempts} attempts for this chapter.
          Please try another chapter.
        </AlertDescription>
      </Alert>
    );
  }

  // Can take quiz
  return (
    <Alert>
      <CheckCircle className="h-4 w-4" />
      <AlertDescription>
        <div className="space-y-1">
          <p>
            <strong>{availability.count}</strong> approved questions available
          </p>
          <p>
            <strong>{attempts.attempts_remaining}</strong> of{' '}
            <strong>{attempts.max_attempts}</strong> attempts remaining
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}
