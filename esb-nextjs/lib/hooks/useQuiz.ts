import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quizApi } from '../api/quiz';
import {
  Quiz,
  QuizQuestion,
  QuizSetupData,
  QuizResults,
  QuizHistoryItem,
  QuizAnswerData,
  ChapterQuizGenerateData,
  QuizViolation,
  QuizSubmissionsResponse
} from '../types/quiz';
import { toast } from 'sonner';

// Query keys
export const quizKeys = {
  all: ['quizzes'] as const,
  lists: () => [...quizKeys.all, 'list'] as const,
  list: (documentId: number) => [...quizKeys.lists(), documentId] as const,
  details: () => [...quizKeys.all, 'detail'] as const,
  detail: (id: number) => [...quizKeys.details(), id] as const,
  questions: (id: number) => [...quizKeys.detail(id), 'questions'] as const,
  results: (id: number) => [...quizKeys.detail(id), 'results'] as const,
  history: (documentId: number) => [...quizKeys.all, 'history', documentId] as const,
  submissions: (chapterId: number) => [...quizKeys.all, 'submissions', chapterId] as const,
};

/**
 * Setup a new quiz for a document
 */
export function useQuizSetup() {
  const queryClient = useQueryClient();

  return useMutation<
    { quiz_id: number; num_questions: number },
    Error,
    { documentId: number; data: QuizSetupData }
  >({
    mutationFn: ({ documentId, data }) => quizApi.setup(documentId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: quizKeys.history(variables.documentId) });
      toast.success('Quiz created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create quiz');
    },
  });
}

/**
 * Get quiz information
 */
export function useQuiz(quizId: number) {
  return useQuery<Quiz>({
    queryKey: quizKeys.detail(quizId),
    queryFn: () => quizApi.get(quizId),
    enabled: !!quizId,
  });
}

/**
 * Get quiz questions
 */
export function useQuizQuestions(quizId: number) {
  return useQuery<{ questions: QuizQuestion[]; total: number }>({
    queryKey: quizKeys.questions(quizId),
    queryFn: () => quizApi.getQuestions(quizId),
    enabled: !!quizId,
  });
}

/**
 * Submit an answer for a quiz question
 */
export function useSubmitAnswer() {
  const queryClient = useQueryClient();

  return useMutation<
    { message: string; is_correct?: boolean; next_index?: number },
    Error,
    { quizId: number; questionIndex: number; data: QuizAnswerData }
  >({
    mutationFn: ({ quizId, questionIndex, data }) => quizApi.submitAnswer(quizId, questionIndex, data),
    onSuccess: (data, variables) => {
      // Optionally invalidate questions to show updated state
      queryClient.invalidateQueries({ queryKey: quizKeys.questions(variables.quizId) });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to submit answer');
    },
  });
}

/**
 * Complete a quiz and get final score
 */
export function useCompleteQuiz() {
  const queryClient = useQueryClient();

  return useMutation<
    { message: string; score?: number },
    Error,
    number
  >({
    mutationFn: quizApi.complete,
    onSuccess: (data, quizId) => {
      queryClient.invalidateQueries({ queryKey: quizKeys.detail(quizId) });
      queryClient.invalidateQueries({ queryKey: quizKeys.results(quizId) });
      if (data.score !== undefined) {
        toast.success(`Quiz completed! Score: ${data.score}%`);
      } else {
        toast.success('Quiz completed successfully');
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to complete quiz');
    },
  });
}

/**
 * Get quiz results with statistics
 */
export function useQuizResults(quizId: number) {
  return useQuery<QuizResults>({
    queryKey: quizKeys.results(quizId),
    queryFn: () => quizApi.getResults(quizId),
    enabled: !!quizId,
  });
}

/**
 * Get quiz history for a document
 */
export function useQuizHistory(documentId: number) {
  return useQuery<{ quizzes: QuizHistoryItem[] }>({
    queryKey: quizKeys.history(documentId),
    queryFn: () => quizApi.getHistory(documentId),
    enabled: !!documentId,
  });
}

/**
 * Delete a quiz (teacher only)
 */
export function useDeleteQuiz() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: quizApi.delete,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: quizKeys.all });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete quiz');
    },
  });
}

/**
 * Generate quiz from chapters/sections
 */
export function useGenerateChapterQuiz() {
  const queryClient = useQueryClient();

  return useMutation<
    { quiz_id: number; num_questions: number },
    Error,
    { courseId: number; data: ChapterQuizGenerateData }
  >({
    mutationFn: ({ courseId, data }) => quizApi.generateFromChapter(courseId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: quizKeys.all });
      toast.success('Quiz generated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate quiz');
    },
  });
}

/**
 * Reinstate a disqualified quiz (teacher only)
 */
export function useReinstateQuiz() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string; quiz_id: number }, Error, number>({
    mutationFn: quizApi.reinstateQuiz,
    onSuccess: (data, quizId) => {
      queryClient.invalidateQueries({ queryKey: quizKeys.detail(quizId) });
      queryClient.invalidateQueries({ queryKey: quizKeys.results(quizId) });
      queryClient.invalidateQueries({ queryKey: [...quizKeys.all, 'submissions'] });
      toast.success('Student has been reinstated. They can retake the quiz.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to reinstate student');
    },
  });
}

/**
 * Get all student quiz submissions for a chapter (teacher only)
 */
export function useQuizSubmissions(chapterId: number | null) {
  return useQuery<QuizSubmissionsResponse>({
    queryKey: quizKeys.submissions(chapterId!),
    queryFn: () => quizApi.getSubmissions(chapterId!),
    enabled: !!chapterId,
  });
}

/**
 * Get violations for a quiz
 */
export function useQuizViolations(quizId: number) {
  return useQuery<{ violations: QuizViolation[]; total: number; is_disqualified: boolean }>({
    queryKey: [...quizKeys.detail(quizId), 'violations'],
    queryFn: () => quizApi.getViolations(quizId),
    enabled: !!quizId,
  });
}

/**
 * Teacher quiz generation hook
 * Returns questions for preview (NOT saved yet)
 */
export function useTeacherGenerateQuiz() {
  const queryClient = useQueryClient();

  return useMutation<
    {
      questions: any[];
      num_questions: number;
      title: string;
      metadata: {
        course_id: number;
        chapter_ids: number[];
        summary: string;
      };
    },
    Error,
    { courseId: number; data: ChapterQuizGenerateData }
  >({
    mutationFn: ({ courseId, data }) => quizApi.teacherGenerateFromChapter(courseId, data),
    onSuccess: (data, variables) => {
      // Don't invalidate queries yet - quiz not saved until approved
      toast.success(`Quiz generated - review and approve to save`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate quiz');
    },
  });
}
