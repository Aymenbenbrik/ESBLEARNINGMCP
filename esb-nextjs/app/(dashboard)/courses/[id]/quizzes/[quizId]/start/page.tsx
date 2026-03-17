'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { quizApi } from '@/lib/api/quiz';
import { apiClient } from '@/lib/api/client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function StudentQuizStartPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = parseInt(params.id as string);
  const quizId = parseInt(params.quizId as string);
  const [error, setError] = useState<string | null>(null);

  // Fetch quiz document to get question count
  const { data: quizDoc, isLoading: isLoadingDoc } = useQuery({
    queryKey: ['quizDocument', quizId],
    queryFn: () => quizApi.getQuizDocument(quizId),
  });

  // Fetch chapters to get first chapter ID
  const { data: courseData, isLoading: isLoadingCourse } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => apiClient.get(`/api/v1/courses/${courseId}`).then(r => r.data),
  });

  useEffect(() => {
    const startQuiz = async () => {
      // Wait for both queries to complete
      if (isLoadingDoc || isLoadingCourse) return;

      // Check if data is available
      if (!quizDoc || !courseData) {
        setError('Failed to load quiz data');
        return;
      }

      try {
        // Get the number of questions from quiz_data
        const numQuestions = quizDoc.quiz_data?.length || 0;

        if (numQuestions === 0) {
          toast.error('This quiz has no questions');
          router.push(`/courses/${courseId}`);
          return;
        }

        // Create Quiz record from Document (maps document_id → quiz_id)
        const response = await quizApi.setup(quizId, {
          num_questions: numQuestions,
        });

        const { quiz_id } = response;

        // Get first chapter ID (fallback to 1 if no chapters)
        const chapters = courseData.chapters || [];
        const firstChapterId = chapters.length > 0 ? chapters[0].id : 1;

        // Redirect to quiz taking page with quiz_id (not document_id)
        router.push(`/courses/${courseId}/chapters/${firstChapterId}/quiz/${quiz_id}`);
      } catch (err: any) {
        console.error('Failed to start quiz:', err);
        const errorMessage = err.response?.data?.error || 'Failed to start quiz';
        toast.error(errorMessage);
        setError(errorMessage);

        // Redirect back to course page after a delay
        setTimeout(() => {
          router.push(`/courses/${courseId}`);
        }, 2000);
      }
    };

    startQuiz();
  }, [isLoadingDoc, isLoadingCourse, quizDoc, courseData, quizId, courseId, router]);

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2 text-destructive">Error</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <p className="text-sm text-muted-foreground">Redirecting back to course...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h2 className="text-2xl font-bold mb-2">Starting quiz...</h2>
        <p className="text-muted-foreground">Please wait while we prepare your quiz.</p>
      </div>
    </div>
  );
}
