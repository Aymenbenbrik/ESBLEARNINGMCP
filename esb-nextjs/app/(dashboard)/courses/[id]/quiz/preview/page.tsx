'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { quizApi } from '@/lib/api/quiz';
import { useCourse } from '@/lib/hooks/useCourses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface QuizQuestion {
  question: string;
  choice_a?: string;
  choice_b?: string;
  choice_c?: string;
  correct_choice?: string;
  explanation?: string;
  bloom_level?: string;
  clo?: string;
  difficulty_level?: string;
  question_type: 'mcq' | 'open_ended';
}

interface QuizPreviewState {
  questions: QuizQuestion[];
  title: string;
  metadata: {
    course_id: number;
    chapter_ids: number[];
    summary: string;
  };
  num_questions: number;
}

export default function QuizPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const courseId = parseInt(params.id as string);
  const { data: courseData } = useCourse(courseId);

  // Get quiz data from sessionStorage
  const [quizData, setQuizData] = useState<QuizPreviewState | null>(null);

  useEffect(() => {
    // Try to get from sessionStorage (fallback if page refresh)
    const storedData = sessionStorage.getItem('pendingQuiz');
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        console.log('Parsed quiz data:', parsed);

        // Validate structure
        if (!parsed.questions || !Array.isArray(parsed.questions)) {
          console.error('Invalid quiz data structure:', parsed);
          toast.error('Invalid quiz data structure');
          router.push(`/courses/${courseId}`);
          return;
        }

        if (parsed.metadata.course_id === courseId) {
          setQuizData(parsed);
        } else {
          // Wrong course, redirect
          router.push(`/courses/${courseId}`);
        }
      } catch (error) {
        console.error('Error parsing quiz data:', error);
        toast.error('Failed to load quiz data');
        router.push(`/courses/${courseId}`);
      }
    } else {
      // No data, redirect to course (shouldn't happen in normal flow)
      toast.error('No quiz data found');
      router.push(`/courses/${courseId}`);
    }
  }, [courseId, router]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!quizData) throw new Error('No quiz data');

      return await quizApi.approveQuiz(
        Number(courseId),
        {
          questions: quizData.questions,
          title: quizData.title,
          metadata: quizData.metadata,
        }
      );
    },
    onSuccess: () => {
      // Clear session storage
      sessionStorage.removeItem('pendingQuiz');
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      toast.success('Quiz approved and saved!');
      router.push(`/courses/${courseId}`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to approve quiz');
    },
  });

  const handleReject = () => {
    // Clear session storage (don't save quiz)
    sessionStorage.removeItem('pendingQuiz');
    toast.info('Quiz discarded');
    router.push(`/courses/${courseId}`);
  };

  if (!quizData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading quiz...</p>
        </div>
      </div>
    );
  }

  const { questions, title, metadata, num_questions } = quizData;

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs
        items={[
          { label: 'Courses', href: '/courses' },
          { label: courseData?.course?.title || 'Course', href: `/courses/${courseId}` },
          { label: 'Quiz Preview' },
        ]}
      />

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">{title}</h1>
          <Badge className="bg-yellow-500 text-white">Pending Approval</Badge>
        </div>
        <p className="text-muted-foreground">{metadata.summary}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {num_questions} questions
        </p>
      </div>

      {/* Alert */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-yellow-400" />
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              This quiz is not saved yet. Review the questions below and click <strong>Approve & Save</strong> to make it available to students, or <strong>Discard</strong> to cancel.
            </p>
          </div>
        </div>
      </div>

      {/* Questions Display */}
      <div className="space-y-4 mb-8">
        {questions.map((q, idx) => (
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

      {/* Action Buttons */}
      <Card className="border-2 border-primary/20 sticky bottom-4">
        <CardContent className="py-6">
          <div className="flex gap-4">
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="flex-1 bg-green-600 hover:bg-green-700"
              size="lg"
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Approve & Save Quiz
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleReject}
              disabled={approveMutation.isPending}
              className="flex-1"
              size="lg"
            >
              <XCircle className="mr-2 h-5 w-5" />
              Discard Quiz
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
