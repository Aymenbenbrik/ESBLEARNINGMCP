import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { questionBankApi, courseQBankApi } from '../api/question-bank';
import {
  QuestionBankListResponse,
  QuestionBankFilters,
  ApproveQuestionsData,
  ApproveQuestionsResponse,
  GenerateQuestionsBGAData,
  GenerateQuestionsResponse,
  GenerateQuestionsTNData,
  GenerateTNQuestionsResponse,
  ApproveTNQuestionsData,
  ApproveTNQuestionsResponse,
  RevisionFilterOptions,
  RevisionQuizFilters,
  CreateRevisionQuizResponse,
  aaCodesResponse,
  GenerateCourseQBankData,
  UpdateCourseQBankData,
} from '../types/question-bank';
import { toast } from 'sonner';

// Query keys
export const questionBankKeys = {
  all: ['question-bank'] as const,
  lists: () => [...questionBankKeys.all, 'list'] as const,
  list: (filters: QuestionBankFilters) => [...questionBankKeys.lists(), filters] as const,
  revisionOptions: (courseId: number) =>
    [...questionBankKeys.all, 'revision-options', courseId] as const,
  aaas: (courseId?: number) =>
    courseId
      ? ([...questionBankKeys.all, 'aaas', courseId] as const)
      : ([...questionBankKeys.all, 'aaas'] as const),
};

/**
 * List question bank questions with multi-level filtering
 */
export function useQuestionBank(filters: QuestionBankFilters) {
  return useQuery<QuestionBankListResponse>({
    queryKey: questionBankKeys.list(filters),
    queryFn: () => questionBankApi.list(filters),
    enabled: !!filters.course_id,
  });
}

/**
 * Get filter options for revision quiz setup
 */
export function useRevisionOptions(courseId: number) {
  return useQuery<RevisionFilterOptions>({
    queryKey: questionBankKeys.revisionOptions(courseId),
    queryFn: () => questionBankApi.getRevisionOptions(courseId),
    enabled: !!courseId,
  });
}

/**
 * Get AAA codes for a course (teacher only)
 */
export function useAAAs(courseId?: number) {
  return useQuery<aaCodesResponse>({
    queryKey: questionBankKeys.aaas(courseId),
    queryFn: () => questionBankApi.getAAAs(courseId),
  });
}

/**
 * Bulk approve or reject questions (teacher only)
 */
export function useApproveQuestions() {
  const queryClient = useQueryClient();

  return useMutation<ApproveQuestionsResponse, Error, ApproveQuestionsData>({
    mutationFn: questionBankApi.approve,
    onSuccess: (data, variables) => {
      // Invalidate question bank list to refetch
      queryClient.invalidateQueries({ queryKey: questionBankKeys.lists() });

      if (data.approved > 0) {
        toast.success(`${data.approved} question(s) approved`);
      }
      if (data.rejected > 0) {
        toast.success(`${data.rejected} question(s) rejected`);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to approve questions');
    },
  });
}

/**
 * Generate questions using BGA (CLO-based) workflow (teacher only)
 */
export function useGenerateBGAQuestions() {
  const queryClient = useQueryClient();

  return useMutation<GenerateQuestionsResponse, Error, GenerateQuestionsBGAData>({
    mutationFn: questionBankApi.generateBGA,
    onSuccess: (data) => {
      // Invalidate question bank list to show new questions
      queryClient.invalidateQueries({ queryKey: questionBankKeys.lists() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate questions');
    },
  });
}

/**
 * Generate questions using TN (AAA-based) workflow (teacher only)
 */
export function useGenerateTNQuestions() {
  const queryClient = useQueryClient();

  return useMutation<
    GenerateTNQuestionsResponse,
    Error,
    { courseId: number; data: GenerateQuestionsTNData }
  >({
    mutationFn: ({ courseId, data }) => questionBankApi.generateTN(courseId, data),
    onSuccess: (data) => {
      // Invalidate question bank list to show new questions
      queryClient.invalidateQueries({ queryKey: questionBankKeys.lists() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate TN questions');
    },
  });
}

/**
 * Approve TN-generated questions with AAA normalization (teacher only)
 */
export function useApproveTNQuestions() {
  const queryClient = useQueryClient();

  return useMutation<
    ApproveTNQuestionsResponse,
    Error,
    { courseId: number; data: ApproveTNQuestionsData }
  >({
    mutationFn: ({ courseId, data }) => questionBankApi.approveTN(courseId, data),
    onSuccess: (data) => {
      // Invalidate question bank list to show approved questions
      queryClient.invalidateQueries({ queryKey: questionBankKeys.lists() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to approve TN questions');
    },
  });
}

/**
 * Create a revision quiz from question bank
 */
export function useCreateRevisionQuiz() {
  const queryClient = useQueryClient();

  return useMutation<
    CreateRevisionQuizResponse,
    Error,
    { courseId: number; filters: RevisionQuizFilters }
  >({
    mutationFn: ({ courseId, filters }) => questionBankApi.createRevisionQuiz(courseId, filters),
    onSuccess: (data) => {
      // Note: We don't invalidate question bank here as quiz creation doesn't modify it
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create revision quiz');
    },
  });
}

// ─── Course-scoped Question Bank hooks ────────────────────────────────────────

export const courseQBankKeys = {
  all: (courseId: number) => ['course-qbank', courseId] as const,
  aaList: (courseId: number) => ['course-qbank-aa-list', courseId] as const,
};

export function useCourseQBank(courseId: number) {
  return useQuery({
    queryKey: courseQBankKeys.all(courseId),
    queryFn: () => courseQBankApi.list(courseId),
    enabled: !!courseId,
  });
}

export function useCourseAAList(courseId: number) {
  return useQuery({
    queryKey: courseQBankKeys.aaList(courseId),
    queryFn: () => courseQBankApi.aaList(courseId),
    enabled: !!courseId,
    staleTime: 5 * 60 * 1000, // AAs rarely change
  });
}

export function useGenerateCourseQBank(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateCourseQBankData) => courseQBankApi.generate(courseId, data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: courseQBankKeys.all(courseId) });
      toast.success(data.message);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erreur lors de la generation');
    },
  });
}

export function useUpdateCourseQBankQuestion(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, data }: { questionId: number; data: UpdateCourseQBankData }) =>
      courseQBankApi.update(courseId, questionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseQBankKeys.all(courseId) });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erreur lors de la mise a jour');
    },
  });
}

export function useDeleteCourseQBankQuestion(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questionId: number) => courseQBankApi.delete(courseId, questionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courseQBankKeys.all(courseId) });
      toast.success('Question supprimee');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });
}
