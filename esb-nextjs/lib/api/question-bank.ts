import { apiClient } from './client';
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
  CourseQBankResponse,
  GenerateCourseQBankData,
  GenerateCourseQBankResponse,
  CreateCourseQBankData,
  CreateCourseQBankResponse,
  CourseQBankQuestion,
  UpdateCourseQBankData,
  CourseAAListResponse,
} from '../types/question-bank';

const BASE_URL = '/api/v1/question-bank';

export const questionBankApi = {
  /**
   * List question bank questions with multi-level filtering
   * Students see only approved questions
   * Teachers/superusers see all questions
   */
  list: async (filters: QuestionBankFilters): Promise<QuestionBankListResponse> => {
    const params = new URLSearchParams();

    // Required course_id
    params.append('course_id', filters.course_id.toString());

    // Optional filters
    if (filters.chapter_id) params.append('chapter_id', filters.chapter_id);
    if (filters.aaa) params.append('aaa', filters.aaa);
    if (filters.bloom_level) params.append('bloom_level', filters.bloom_level);
    if (filters.difficulty) params.append('difficulty', filters.difficulty);
    if (filters.approved) params.append('approved', filters.approved);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());

    const response = await apiClient.get<QuestionBankListResponse>(
      `${BASE_URL}?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Bulk approve or reject questions (teacher only)
   */
  approve: async (data: ApproveQuestionsData): Promise<ApproveQuestionsResponse> => {
    const response = await apiClient.post<ApproveQuestionsResponse>(
      `${BASE_URL}/approve`,
      data
    );
    return response.data;
  },

  /**
   * Generate questions using BGA (CLO-based) workflow (teacher only)
   */
  generateBGA: async (data: GenerateQuestionsBGAData): Promise<GenerateQuestionsResponse> => {
    const response = await apiClient.post<GenerateQuestionsResponse>(
      `${BASE_URL}/generate`,
      data
    );
    return response.data;
  },

  /**
   * Generate questions using TN (AAA-based) workflow with RAG (teacher only)
   */
  generateTN: async (
    courseId: number,
    data: GenerateQuestionsTNData
  ): Promise<GenerateTNQuestionsResponse> => {
    const response = await apiClient.post<GenerateTNQuestionsResponse>(
      `${BASE_URL}/tn/generate/${courseId}`,
      data
    );
    return response.data;
  },

  /**
   * Approve TN-generated questions with AAA normalization (teacher only)
   */
  approveTN: async (
    courseId: number,
    data: ApproveTNQuestionsData
  ): Promise<ApproveTNQuestionsResponse> => {
    const response = await apiClient.post<ApproveTNQuestionsResponse>(
      `${BASE_URL}/tn/approve/${courseId}`,
      data
    );
    return response.data;
  },

  /**
   * Get filter options for setting up a revision quiz
   * Returns available chapters, AAA codes, bloom levels, difficulty levels
   */
  getRevisionOptions: async (courseId: number): Promise<RevisionFilterOptions> => {
    const response = await apiClient.get<RevisionFilterOptions>(
      `${BASE_URL}/revision/${courseId}`
    );
    return response.data;
  },

  /**
   * Create a revision quiz from question bank with filters and random selection
   */
  createRevisionQuiz: async (
    courseId: number,
    filters: RevisionQuizFilters
  ): Promise<CreateRevisionQuizResponse> => {
    const response = await apiClient.post<CreateRevisionQuizResponse>(
      `${BASE_URL}/revision/${courseId}`,
      filters
    );
    return response.data;
  },

  /**
   * Get list of AAA codes for a course (teacher only)
   */
  getAAAs: async (courseId?: number): Promise<aaCodesResponse> => {
    const params = courseId ? `?course_id=${courseId}` : '';
    const response = await apiClient.get<aaCodesResponse>(`${BASE_URL}/aaas${params}`);
    return response.data;
  },

  /**
   * Migrate quiz questions from documents to question bank (teacher only)
   * One-time migration for historical quizzes approved before auto-save feature
   */
  migrate: async (data: { course_id: number }): Promise<{
    message: string;
    migrated: number;
    skipped: number;
    errors: number;
    documents_processed: number;
  }> => {
    const response = await apiClient.post(
      `${BASE_URL}/migrate-from-documents`,
      data
    );
    return response.data;
  },

  /**
   * Get debug statistics for question bank (teacher only - development mode)
   * Shows total questions, approval status, chapter distribution, and migration status
   */
  getDebugStats: async (courseId: number): Promise<{
    course_id: number;
    total_questions: number;
    approved_questions: number;
    unapproved_questions: number;
    questions_by_chapter: Array<{ chapter_id: number | null; count: number }>;
    quiz_documents_available_for_migration: number;
    recommendation: string;
  }> => {
    const response = await apiClient.get(
      `${BASE_URL}/debug/stats`,
      { params: { course_id: courseId } }
    );
    return response.data;
  },
};

// ─── Course-scoped Question Bank API ─────────────────────────────────────────

export const courseQBankApi = {
  list: async (courseId: number): Promise<CourseQBankResponse> => {
    const res = await apiClient.get<CourseQBankResponse>(`/api/v1/courses/${courseId}/question-bank`);
    return res.data;
  },

  aaList: async (courseId: number): Promise<CourseAAListResponse> => {
    const res = await apiClient.get<CourseAAListResponse>(`/api/v1/courses/${courseId}/question-bank/aa-list`);
    return res.data;
  },

  generate: async (courseId: number, data: GenerateCourseQBankData): Promise<GenerateCourseQBankResponse> => {
    const res = await apiClient.post<GenerateCourseQBankResponse>(
      `/api/v1/courses/${courseId}/question-bank/generate`,
      data
    );
    return res.data;
  },

  create: async (courseId: number, data: CreateCourseQBankData): Promise<CreateCourseQBankResponse> => {
    const res = await apiClient.post<CreateCourseQBankResponse>(
      `/api/v1/courses/${courseId}/question-bank`,
      data
    );
    return res.data;
  },

  update: async (courseId: number, questionId: number, data: UpdateCourseQBankData): Promise<{ question: CourseQBankQuestion }> => {
    const res = await apiClient.put<{ question: CourseQBankQuestion }>(
      `/api/v1/courses/${courseId}/question-bank/${questionId}`,
      data
    );
    return res.data;
  },

  delete: async (courseId: number, questionId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/courses/${courseId}/question-bank/${questionId}`);
  },
};
