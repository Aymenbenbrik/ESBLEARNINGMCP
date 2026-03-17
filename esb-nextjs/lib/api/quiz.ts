import { apiClient } from './client';
import {
  Quiz,
  QuizQuestion,
  QuizSetupData,
  QuizResults,
  QuizHistoryItem,
  QuizAnswerData,
  ChapterQuizGenerateData,
  ViolationType,
  QuizViolation,
  QuizSubmissionsResponse
} from '../types/quiz';

const BASE_URL = '/api/v1/quiz';

export const quizApi = {
  /**
   * Setup a new quiz for a document
   */
  setup: async (documentId: number, data: QuizSetupData): Promise<{ quiz_id: number; num_questions: number }> => {
    const response = await apiClient.post(`${BASE_URL}/setup/${documentId}`, data);
    return response.data;
  },

  /**
   * Get quiz information
   */
  get: async (quizId: number): Promise<Quiz> => {
    const response = await apiClient.get(`${BASE_URL}/${quizId}`);
    return response.data;
  },

  /**
   * Get all quiz questions
   */
  getQuestions: async (quizId: number): Promise<{ questions: QuizQuestion[]; total: number }> => {
    const response = await apiClient.get(`${BASE_URL}/${quizId}/questions`);
    return response.data;
  },

  /**
   * Submit answer for a specific question
   */
  submitAnswer: async (quizId: number, questionIndex: number, data: QuizAnswerData): Promise<{ message: string; is_correct?: boolean; next_index?: number }> => {
    const response = await apiClient.post(`${BASE_URL}/${quizId}/answer/${questionIndex}`, data);
    return response.data;
  },

  /**
   * Complete the quiz and get final score
   */
  complete: async (quizId: number): Promise<{ message: string; score?: number }> => {
    const response = await apiClient.post(`${BASE_URL}/${quizId}/complete`);
    return response.data;
  },

  /**
   * Get quiz results with statistics
   */
  getResults: async (quizId: number): Promise<QuizResults> => {
    const response = await apiClient.get(`${BASE_URL}/${quizId}/results`);
    return response.data;
  },

  /**
   * Get quiz history for a document
   */
  getHistory: async (documentId: number): Promise<{ quizzes: QuizHistoryItem[] }> => {
    const response = await apiClient.get(`${BASE_URL}/history/${documentId}`);
    return response.data;
  },

  /**
   * Delete a quiz (teacher only)
   */
  delete: async (quizId: number): Promise<{ message: string }> => {
    const response = await apiClient.delete(`${BASE_URL}/${quizId}`);
    return response.data;
  },

  /**
   * Generate quiz from chapters/sections (TN syllabus-based)
   */
  generateFromChapter: async (courseId: number, data: ChapterQuizGenerateData): Promise<{ quiz_id: number; num_questions: number }> => {
    const response = await apiClient.post(`/api/v1/courses/${courseId}/quiz/generate`, data);
    return response.data;
  },

  /**
   * Teacher-only: Generate quiz (NOT saved yet - awaiting approval)
   * Returns questions array for preview
   */
  teacherGenerateFromChapter: async (courseId: number, data: ChapterQuizGenerateData): Promise<{
    questions: any[];
    num_questions: number;
    title: string;
    metadata: {
      course_id: number;
      chapter_ids: number[];
      summary: string;
    };
  }> => {
    const response = await apiClient.post(`/api/v1/courses/${courseId}/quiz/teacher-generate`, data);
    return response.data;
  },

  /**
   * Teacher approves and saves generated quiz
   */
  approveQuiz: async (courseId: number, data: {
    questions: any[];
    title: string;
    metadata: any;
  }): Promise<{ document_id: number; num_questions: number; title: string }> => {
    const response = await apiClient.post(`/api/v1/courses/${courseId}/quiz/approve`, data);
    return response.data;
  },

  /**
   * Get quiz document (for teacher view)
   */
  getQuizDocument: async (documentId: number): Promise<{
    id: number;
    title: string;
    quiz_data: any[];
    created_at: string;
    course_id: number;
    metadata?: any;
  }> => {
    const response = await apiClient.get(`/api/v1/documents/${documentId}`);
    return response.data;
  },

  /**
   * Delete quiz document
   */
  deleteQuizDocument: async (documentId: number): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/api/v1/documents/${documentId}`);
    return response.data;
  },

  /**
   * Report a safe exam violation (student)
   */
  reportViolation: async (quizId: number, violationType: ViolationType): Promise<{ violations_count: number; is_disqualified: boolean; is_warning: boolean }> => {
    const response = await apiClient.post(`${BASE_URL}/${quizId}/violation`, { violation_type: violationType });
    return response.data;
  },

  /**
   * Explicitly disqualify a quiz (student)
   */
  disqualifyQuiz: async (quizId: number): Promise<{ message: string; quiz_id: number }> => {
    const response = await apiClient.post(`${BASE_URL}/${quizId}/disqualify`);
    return response.data;
  },

  /**
   * Reinstate a disqualified quiz (teacher only)
   */
  reinstateQuiz: async (quizId: number): Promise<{ message: string; quiz_id: number }> => {
    const response = await apiClient.post(`${BASE_URL}/${quizId}/reinstate`);
    return response.data;
  },

  /**
   * Get all violations for a quiz (teacher or quiz owner)
   */
  getViolations: async (quizId: number): Promise<{ violations: QuizViolation[]; total: number; is_disqualified: boolean }> => {
    const response = await apiClient.get(`${BASE_URL}/${quizId}/violations`);
    return response.data;
  },

  /**
   * Teacher-only: get all student quiz submissions for a chapter
   */
  getSubmissions: async (chapterId: number): Promise<QuizSubmissionsResponse> => {
    const response = await apiClient.get(`${BASE_URL}/chapters/${chapterId}/submissions`);
    return response.data;
  },
};
