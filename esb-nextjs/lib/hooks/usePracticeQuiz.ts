/**
 * React Query Hooks for Practice Quiz
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { practiceQuizApi } from '@/lib/api/practice-quiz';

/**
 * Check if approved questions are available for a chapter
 */
export function usePracticeQuizAvailability(chapterId: number) {
  return useQuery({
    queryKey: ['practice-quiz-availability', chapterId],
    queryFn: () => practiceQuizApi.checkAvailability(chapterId),
    enabled: !!chapterId,
  });
}

/**
 * Get attempt count for a chapter
 */
export function usePracticeQuizAttempts(chapterId: number) {
  return useQuery({
    queryKey: ['practice-quiz-attempts', chapterId],
    queryFn: () => practiceQuizApi.getAttempts(chapterId),
    enabled: !!chapterId,
  });
}

/**
 * Start a new practice quiz
 */
export function useStartPracticeQuiz() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chapterId, numQuestions }: { chapterId: number; numQuestions: number }) =>
      practiceQuizApi.start(chapterId, numQuestions),
    onSuccess: (data, variables) => {
      toast.success('Practice quiz created!');
      // Invalidate attempts for this chapter
      queryClient.invalidateQueries({ queryKey: ['practice-quiz-attempts', variables.chapterId] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to create practice quiz';
      toast.error(message);
    },
  });
}

/**
 * Get practice quiz metadata
 */
export function usePracticeQuiz(quizId: number | null) {
  return useQuery({
    queryKey: ['practice-quiz', quizId],
    queryFn: () => practiceQuizApi.get(quizId!),
    enabled: !!quizId,
  });
}

/**
 * Get practice quiz questions
 */
export function usePracticeQuizQuestions(quizId: number | null) {
  return useQuery({
    queryKey: ['practice-quiz-questions', quizId],
    queryFn: () => practiceQuizApi.getQuestions(quizId!),
    enabled: !!quizId,
  });
}

/**
 * Submit an answer for a question
 */
export function useSubmitPracticeAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ quizId, questionIndex, answer }: { quizId: number; questionIndex: number; answer: string }) =>
      practiceQuizApi.submitAnswer(quizId, questionIndex, answer),
    onSuccess: (data, variables) => {
      // Invalidate questions to refresh student_choice
      queryClient.invalidateQueries({ queryKey: ['practice-quiz-questions', variables.quizId] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to submit answer';
      toast.error(message);
    },
  });
}

/**
 * Complete a practice quiz
 */
export function useCompletePracticeQuiz() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (quizId: number) => practiceQuizApi.complete(quizId),
    onSuccess: (data, quizId) => {
      toast.success(`Quiz completed! Score: ${data.percentage.toFixed(1)}%`);
      // Invalidate quiz and questions
      queryClient.invalidateQueries({ queryKey: ['practice-quiz', quizId] });
      queryClient.invalidateQueries({ queryKey: ['practice-quiz-questions', quizId] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to complete quiz';
      toast.error(message);
    },
  });
}

/**
 * Get practice quiz results
 */
export function usePracticeQuizResults(quizId: number | null) {
  return useQuery({
    queryKey: ['practice-quiz-results', quizId],
    queryFn: () => practiceQuizApi.getResults(quizId!),
    enabled: !!quizId,
  });
}
