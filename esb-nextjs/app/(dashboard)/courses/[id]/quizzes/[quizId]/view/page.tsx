'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { quizApi } from '@/lib/api/quiz';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Trash2, CheckCircle, PlayCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useState } from 'react';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { useAuth } from '@/lib/hooks/useAuth';

export default function QuizViewPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const quizId = parseInt(params.quizId as string);
  const [isDeleting, setIsDeleting] = useState(false);

  // Role-based access control
  const { user } = useAuth();
  const isTeacher = user?.is_teacher ?? false;

  const { data: quizDoc, isLoading } = useQuery({
    queryKey: ['quizDocument', quizId],
    queryFn: () => quizApi.getQuizDocument(quizId),
  });

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this quiz? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      await quizApi.deleteQuizDocument(quizId);
      toast.success('Quiz deleted successfully');
      router.push(`/courses/${courseId}`);
      router.refresh();
    } catch (error) {
      console.error('Failed to delete quiz:', error);
      toast.error('Failed to delete quiz');
      setIsDeleting(false);
    }
  };

  const handleBack = () => {
    router.push(`/courses/${courseId}`);
  };

  const handleTakeQuiz = () => {
    router.push(`/courses/${courseId}/quizzes/${quizId}/start`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!quizDoc) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Quiz not found</h2>
          <p className="text-muted-foreground mb-4">The quiz you're looking for doesn't exist.</p>
          <Button onClick={handleBack}>Back to Course</Button>
        </div>
      </div>
    );
  }

  const questions = quizDoc.quiz_data || [];
  const metadata = typeof quizDoc.metadata === 'string'
    ? JSON.parse(quizDoc.metadata)
    : quizDoc.metadata;

  // Student View Component - Shows only metadata without questions/answers
  const StudentQuizView = () => {
    const questionCount = questions.length;
    const mcqCount = questions.filter((q: any) => q.question_type === 'mcq').length;
    const openCount = questions.filter((q: any) => q.question_type === 'open_ended').length;
    const estimatedTime = questionCount * 2; // 2 minutes per question
    const chapters = metadata?.chapters || [];

    return (
      <Card>
        <CardHeader>
          <CardTitle>Quiz Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Question Count */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Questions
            </h3>
            <p className="text-gray-600">
              {questionCount} questions total
            </p>
            {mcqCount > 0 && <p className="text-sm text-gray-500 ml-6">• {mcqCount} Multiple Choice</p>}
            {openCount > 0 && <p className="text-sm text-gray-500 ml-6">• {openCount} Open-Ended</p>}
          </div>

          {/* Estimated Time */}
          <div>
            <h3 className="font-semibold mb-2">⏱️ Estimated Time</h3>
            <p className="text-gray-600">{estimatedTime} minutes</p>
          </div>

          {/* Chapters Covered */}
          {chapters.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">📖 Content Coverage</h3>
              <p className="text-gray-600">Chapters: {chapters.join(', ')}</p>
            </div>
          )}

          {/* Take Quiz Button */}
          <Button
            onClick={handleTakeQuiz}
            size="lg"
            className="w-full mt-4"
          >
            <PlayCircle className="h-5 w-5 mr-2" />
            Take Quiz
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/courses' },
          { label: 'Course', href: `/courses/${courseId}` },
          { label: 'Quiz Preview' },
        ]}
      />

      {/* Shared Header - Same for both roles */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">{quizDoc.title}</h1>
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="outline">
            {questions.length} {questions.length === 1 ? 'Question' : 'Questions'}
          </Badge>
          {quizDoc.created_at && (
            <Badge variant="secondary">
              Created {format(new Date(quizDoc.created_at), 'PPP')}
            </Badge>
          )}
          {metadata?.chapters && metadata.chapters.length > 0 && (
            <Badge variant="secondary">
              Chapters: {metadata.chapters.join(', ')}
            </Badge>
          )}
        </div>
      </div>

      {/* Role-based action buttons */}
      <div className="flex gap-2 mb-6">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Course
        </Button>

        {isTeacher && (
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete Quiz'}
          </Button>
        )}
      </div>

      {/* Conditional content based on role */}
      {isTeacher ? (
        // Teacher View: Show all questions with answers
        <div className="space-y-4">
          {questions.map((q: any, idx: number) => (
            <Card key={idx}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">Question {idx + 1}</CardTitle>
                  <div className="flex gap-2">
                    {q.bloom_level && (
                      <Badge variant="outline">{q.bloom_level}</Badge>
                    )}
                    {q.difficulty_level && (
                      <Badge variant="secondary">{q.difficulty_level}</Badge>
                    )}
                    {q.clo && (
                      <Badge>{q.clo}</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-base font-medium">{q.question}</p>

                {q.question_type === 'mcq' && (
                  <div className="space-y-2">
                    {q.choice_a && (
                      <div className={`p-3 rounded-lg border ${q.correct_choice === 'A' ? 'bg-green-50 border-green-300' : 'bg-gray-50'}`}>
                        <span className="font-semibold">A: </span>{q.choice_a}
                        {q.correct_choice === 'A' && <CheckCircle className="inline-block ml-2 h-4 w-4 text-green-600" />}
                      </div>
                    )}
                    {q.choice_b && (
                      <div className={`p-3 rounded-lg border ${q.correct_choice === 'B' ? 'bg-green-50 border-green-300' : 'bg-gray-50'}`}>
                        <span className="font-semibold">B: </span>{q.choice_b}
                        {q.correct_choice === 'B' && <CheckCircle className="inline-block ml-2 h-4 w-4 text-green-600" />}
                      </div>
                    )}
                    {q.choice_c && (
                      <div className={`p-3 rounded-lg border ${q.correct_choice === 'C' ? 'bg-green-50 border-green-300' : 'bg-gray-50'}`}>
                        <span className="font-semibold">C: </span>{q.choice_c}
                        {q.correct_choice === 'C' && <CheckCircle className="inline-block ml-2 h-4 w-4 text-green-600" />}
                      </div>
                    )}
                    {q.choice_d && (
                      <div className={`p-3 rounded-lg border ${q.correct_choice === 'D' ? 'bg-green-50 border-green-300' : 'bg-gray-50'}`}>
                        <span className="font-semibold">D: </span>{q.choice_d}
                        {q.correct_choice === 'D' && <CheckCircle className="inline-block ml-2 h-4 w-4 text-green-600" />}
                      </div>
                    )}
                  </div>
                )}

                {q.question_type === 'open_ended' && (
                  <Badge variant="outline">Open-Ended Question</Badge>
                )}

                {q.explanation && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm font-semibold mb-1">Explanation:</p>
                    <p className="text-sm">{q.explanation}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // Student View: Show only metadata with Take Quiz button
        <StudentQuizView />
      )}
    </div>
  );
}
